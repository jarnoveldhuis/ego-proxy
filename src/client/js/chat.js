// src/client/js/chat.js

// Firebase/Auth Imports
import { auth } from "./firebase.js"; //
import {
  getCurrentUser,
  getIdTokenAsync, // Ensure this is imported
  handleGoogleLogin,
  handleLogout,
  onAuthChanged, // Ensure this is imported
} from "./auth.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js"; // Removed onAuthStateChanged here as we use the one from auth.js


function handleLoginLogout() {
    const user = getCurrentUser(); // From auth.js
    if (user) {
        handleLogout() // From auth.js
            .then(() => {
                console.log("Global logout successful. Firebase session should be cleared.");
                // IMPORTANT: After logout, redirect to the home page.
                // This ensures a fresh page load where auth state will be re-evaluated as null.
                // The server will then serve create.ejs, and create.js will see no user.
                if (window.location.pathname === '/') {
                    // If already on root, a simple reload might be enough after auth state has propagated
                    // But redirecting ensures the server also sees a fresh request.
                    window.location.reload();
                } else {
                    window.location.href = '/';
                }
            })
            .catch(error => {
                console.error("Logout error:", error);
                // Handle logout error display if necessary
            });
    } else {
        handleGoogleLogin() // From auth.js
            .then(loggedInUser => {
                if (loggedInUser) {
                    // If login happens on a page other than where proxies are listed,
                    // redirect to home so server can route to first proxy.
                    console.log("Global login successful. Redirecting to home.");
                    window.location.href = '/';
                }
            })
            .catch((error) => {
                console.error("Google login error:", error.message, error.code);
                // Handle login error display
            });
    }
}

function updateAuthButton(user) {
  // This function updates the #globalAuthButton
  const authButton = document.getElementById("globalAuthButton"); // Target global button
  const authIcon = authButton ? authButton.querySelector("i") : null;

  if (!authButton || !authIcon) return;

  console.log(
    "chat.js: updateAuthButton (for global) called with user:",
    user ? user.uid : null
  );

  if (user) {
    authIcon.classList.remove("fa-sign-in-alt");
    authIcon.classList.add("fa-sign-out-alt");
    authButton.title = "Log Out";
  } else {
    authIcon.classList.remove("fa-sign-out-alt");
    authIcon.classList.add("fa-sign-in-alt");
    authButton.title = "Log In with Google";
  }
}

// --- Chat Globals ---
let isVoiceLoading = false,
  speaking = false,
  audioCtx,
  analyser,
  globalAudio,
  isTtsEnabled = false;
let avatar = "Guest",
  previousAvatar,
  typingTimer;
const doneTypingInterval = 1000,
  thinkDelay = 2000,
  laughLength = 1500;
let isLaughing = false;
let transcriptHtml = "Begin conversation.",
  transcriptText = "Begin conversation.";
const transcriptButtonHtml = `<button class="btn btn-sm" id="showTranscriptBtnInPrompt" data-bs-toggle="modal" data-bs-target="#transcriptModal"><i class="fas fa-file-alt"></i></button>`;
let isRequestPending = false,
  guests = [];
let previousResponse = "",
  currentPrompt = "";
let submitAs = "",
  submitTo = ""; // submitAs from dropdown, submitTo from button click
let training = false,
  tutorial = false,
  settingsModalInstance,
  feedbackModal,
  originalContent = "";
let loggedInUserId = null;

// --- DOM Elements (Cached) ---
let botImage,
  botContainer,
  botResponseElem,
  userInputElem,
  submitAsElement,
  promptElement,
  settingsButton,
  responseContainerElem; // Added for toggleResponseContainer

// --- Image & Avatar Functions ---
async function preloadImages(proxiesData) {
  if (typeof proxiesData !== "object" || proxiesData === null) {
    console.warn("preloadImages: Invalid proxiesData object:", proxiesData);
    return;
  }
  for (let avatarNameKey in proxiesData) {
    if (
      !proxiesData.hasOwnProperty(avatarNameKey) ||
      !proxiesData[avatarNameKey]
    )
      continue;
    let proxy = proxiesData[avatarNameKey];
    if (typeof proxy !== "object" || proxy === null) continue;
    for (let reaction in proxy) {
      if (!proxy.hasOwnProperty(reaction) || !Array.isArray(proxy[reaction]))
        continue;
      if (
        proxy[reaction].length > 0 &&
        proxy[reaction][0] &&
        typeof proxy[reaction][0].url === "string"
      ) {
        let img = new Image();
        img.src = proxy[reaction][0].url;
        // img.onerror = (error) => console.error("Error loading image:", proxy[reaction][0].url, error);
      }
    }
  }
}

function updateAvatar(avatarNameToSet, reaction) {
  clearTimeout(typingTimer);
  if (!botImage || !botContainer) {
    console.warn(
      "updateAvatar: botImage or botContainer DOM element not found."
    );
    return avatar;
  }

  const proxyKey =
    typeof avatarNameToSet === "string" ? avatarNameToSet.toLowerCase() : null;

  // Use window.proxies here as it's set from EJS
  if (proxyKey && window.proxies && window.proxies[proxyKey]) {
    avatar = avatarNameToSet;
    let proxyData = window.proxies[proxyKey];
    let reactionToUse = reaction.toLowerCase();

    if (
      !proxyData[reactionToUse] ||
      !proxyData[reactionToUse][0] ||
      !proxyData[reactionToUse][0].url
    ) {
      reactionToUse = "friendly"; // Fallback
      if (
        !proxyData[reactionToUse] ||
        !proxyData[reactionToUse][0] ||
        !proxyData[reactionToUse][0].url
      ) {
        console.error(
          `Fallback 'friendly' also missing for '${avatarNameToSet}'.`
        );
        botImage.src = "/img/logo.png";
        botContainer.style.backgroundImage = `url('/img/logo.png')`;
        return avatar;
      }
    }
    const imagePath = proxyData[reactionToUse][0].url;
    botImage.src = imagePath;
    botContainer.style.backgroundImage = `url(${imagePath})`;
  } else {
    // console.warn(`updateAvatar: Proxy key '${proxyKey}' not found or window.proxies missing.`);
    botImage.src = "/img/guest.png";
    botContainer.style.backgroundImage = `url('/img/guest.png')`;
    if (avatarNameToSet) avatar = "Guest"; // Only reset global avatar if trying to set a non-existent one
  }
  return avatar;
}

function handleReaction(reactingAvatarName, emotion) {
  return new Promise((resolve) => {
    const proxyKey = reactingAvatarName.toLowerCase();
    const proxyData = proxies[proxyKey];

    if (!proxyData) {
      console.warn(
        `handleReaction: Avatar data not found for ${reactingAvatarName}`
      );
      resolve();
      return;
    }

    updateAvatar(reactingAvatarName, "friendly"); // Reset to friendly first
    const currentEmotion = emotion.toLowerCase();

    if (
      proxyData.laughSounds &&
      Array.isArray(proxyData.laughSounds) &&
      proxyData.laughSounds.length > 0 &&
      currentEmotion === "laugh"
    ) {
      updateAvatar(reactingAvatarName, "joy");
      botContainer?.classList.add("laughing");
      const randomLaugh =
        proxyData.laughSounds[
          Math.floor(Math.random() * proxyData.laughSounds.length)
        ];
      const laughSound = new Audio(
        randomLaugh.startsWith("../") ? randomLaugh : "../laughs/" + randomLaugh
      );
      laughSound.play();
      isLaughing = true;
      laughSound.onended = () => {
        isLaughing = false;
        updateAvatar(reactingAvatarName, "friendly");
        botContainer?.classList.remove("laughing");
        resolve();
      };
    } else if (currentEmotion === "laugh") {
      // No sound, just image
      updateAvatar(reactingAvatarName, "joy");
      resolve();
    } else {
      updateAvatar(reactingAvatarName, currentEmotion);
      resolve();
    }
  });
}

// --- TTS Functions ---
function initAudioContext() {
  if (
    !audioCtx &&
    (typeof window.AudioContext !== "undefined" ||
      typeof window.webkitAudioContext !== "undefined")
  ) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
  } else if (!audioCtx) {
    console.warn("AudioContext not supported by this browser.");
  }
}
function updateImageBasedOnVolume(audio, speakingAvatar) {
  if (!speaking || !avatar || !analyser) return; // avatar is the global var for current speaker on screen
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  let volume = dataArray.length > 0 ? sum / dataArray.length : 0;
  // Use window.siteId for context-specific threshold
  let volumeThreshold =
    window.siteId === "games" ||
    window.siteId === "interview" ||
    window.siteId === "datejulie" ||
    window.siteId === "dual"
      ? 15
      : 1;

  if (volume > volumeThreshold) {
    updateAvatar(speakingAvatar || avatar, "speak");
  } else {
    updateAvatar(speakingAvatar || avatar, "friendly");
  }

  audio.onended = () => {
    speaking = false;
    updateAvatar(speakingAvatar || avatar, "friendly");
  };

  requestAnimationFrame(() =>
    updateImageBasedOnVolume(audio, speakingAvatar || avatar)
  );
}

function handleSpeech(audioUrlWithAvatar) {
  initAudioContext(); // Ensure context is active
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx
      .resume()
      .catch((e) =>
        console.error("AudioContext resume error in handleSpeech:", e)
      );
  }

  let audioUrl, avatarNameForSpeech;
  if (isTtsEnabled === true) {
    speaking = true;
    if (audioUrlWithAvatar.includes("?=")) {
      // Corrected split character
      [audioUrl, avatarNameForSpeech] = audioUrlWithAvatar.split("?=");
      botResponseElem?.classList.remove("loading");
    } else {
      audioUrl = audioUrlWithAvatar;
      avatarNameForSpeech = avatar; // Fallback
    }

    if (!globalAudio) {
      globalAudio = new Audio();
      try {
        const source = audioCtx.createMediaElementSource(globalAudio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (e) {
        console.error("Error connecting audio source to analyser:", e);
        // Fallback or disable mouth movement if analyser fails
      }
    }

    if (globalAudio.src !== audioUrl) {
      globalAudio.src = audioUrl;
    }

    globalAudio
      .play()
      .catch((e) => console.error("Error attempting to play audio:", e));

    globalAudio.onplay = () => {
      updateAvatar(avatarNameForSpeech, "speak");
      if (analyser) updateImageBasedOnVolume(globalAudio, avatarNameForSpeech);
    };
    globalAudio.onended = () => {
      speaking = false;
      updateAvatar(avatarNameForSpeech, "friendly");
    };
  }
}

function toggleTtsState() {
  isTtsEnabled = !isTtsEnabled;
  let icon = document.getElementById("ttsIcon");
  let url = new URL(window.location.href);

  if (isTtsEnabled) {
    if (icon) icon.classList.replace("fa-volume-mute", "fa-volume-up");
    url.searchParams.set("voice", "true");
    initAudioContext(); // Initialize/resume on enabling TTS
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx
        .resume()
        .catch((e) =>
          console.error("Error resuming AudioContext on TTS toggle:", e)
        );
    }
  } else {
    if (icon) icon.classList.replace("fa-volume-up", "fa-volume-mute");
    url.searchParams.delete("voice");
    if (globalAudio && !globalAudio.paused) globalAudio.pause(); // Stop current speech
  }
  try {
    history.pushState({}, "", url);
  } catch (e) {
    console.warn("History API not supported or blocked.");
  }
}

async function textToSpeech(fullText, ttsText, speakingAvatarName) {
  const voiceLoad = document.getElementById("voiceLoad");
  const audioControls = document.getElementById("audioControls");

  isRequestPending = true;
  isVoiceLoading = true;
  botResponseElem?.classList.remove("loading");
  if (voiceLoad) voiceLoad.classList.add("loading");

  try {
    const response = await fetch("/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ttsText }),
    });

    if (response.status === 429) {
      toggleTtsState();
      if (voiceLoad) voiceLoad.classList.remove("loading");
      isRequestPending = false;
      isVoiceLoading = false;
      let rateLimitModalEl = document.getElementById("rateLimitModal");
      if (rateLimitModalEl) new bootstrap.Modal(rateLimitModalEl).show();
      return null;
    }
    if (!response.ok)
      throw new Error(
        `Network response was not ok: ${response.status} ${response.statusText}`
      );

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);

    speaking = true;
    appendToTranscript(fullText, audioUrl, speakingAvatarName);
    if (audioControls) audioControls.style.display = "block";

    if (voiceLoad) voiceLoad.classList.remove("loading");
    isRequestPending = false;
    isVoiceLoading = false;
    return audioUrl;
  } catch (error) {
    console.error("Text to Speech conversion error:", error);
    if (voiceLoad) voiceLoad.classList.remove("loading");
    isRequestPending = false;
    isVoiceLoading = false;
    appendToTranscript(fullText, null, speakingAvatarName);
    return null;
  }
}

// --- Chat & Transcript Functions ---
function disableSubmitButtons() {
  document
    .querySelectorAll('#submitTo input[type="submit"].chat-submit-button')
    .forEach((button) => (button.disabled = true));
}
function enableSubmitButtons() {
  const currentSubmitAs = submitAsElement
    ? submitAsElement.value.toLowerCase()
    : null;
  document
    .querySelectorAll('#submitTo input[type="submit"].chat-submit-button')
    .forEach((button) => {
      button.disabled = button.value.toLowerCase() === currentSubmitAs;
    });
}
function appendToTranscript(content, audioUrl) {
  if (isVoiceLoading) {
    return;
  }

  const transcript = document.getElementById("transcript");
  let newContent = content.replace(/<br>/g, "\n");
  let htmlContent = content;

  const submitAsOptions = Array.from(
    document.getElementById("submitAs").options,
    (opt) => opt.value
  );
  const submitToOptions = Array.from(
    document.getElementById("submitTo").querySelectorAll("input"),
    (input) => input.value
  );
  const avatars = [...new Set([...submitAsOptions, ...submitToOptions])];

  avatars.forEach((avatar) => {
    const regex = new RegExp(`(${avatar}):`, "g");
    htmlContent = htmlContent.replace(
      regex,
      `<span class="other ${avatar.toLowerCase()}">$1:</span>`
    );
    newContent = newContent.replace(regex, `$1:`); // Keep the avatar name for plain text
  });

  let audioControlsHtml = "";
  if (audioUrl) {
    const uniqueId = Date.now(); // A simple unique ID using the current timestamp
    const downloadLinkId = `downloadLink-${uniqueId}`;

    // Create the HTML for the play button and download link
    audioControlsHtml = `
      <a href="#" onclick="handleSpeech('${audioUrl}?=${avatar}'); return false;" id="playButton-${uniqueId}" class="audio-control-icon" title="Play">
      <i class="fas fa-play audio-control-icon"></i>
      </a>
      
      <a href="${audioUrl}" download="tts_output-${uniqueId}.mp3" id="${downloadLinkId}" class="audio-control-icon" title="Download">
        <i class="fas fa-download audio-control-icon"></i>
      </a>
    `;
  }

  // Insert the audio controls (if any) and content into the transcript
  transcript.innerHTML += "<br>" + audioControlsHtml + htmlContent;
  audioControls.innerHTML = audioControlsHtml;
  // Check if the content has already been appended
  if (transcriptText.includes(newContent)) {
    return;
  } else {
    transcriptHtml += "<br>" + htmlContent;
    transcriptText += "\n" + newContent; // Assuming transcriptText is a variable holding the full transcript text
  }
}

function toggleResponseContainer() {
  if (!botResponseElem) return;
  const responseContainerElem = document.getElementById("response-container");
  if (!responseContainerElem) return;

  if (botResponseElem.textContent.trim() === "") {
    responseContainerElem.style.visibility = "hidden";
    responseContainerElem.style.height = "0px"; // Set height to 0
  } else {
    responseContainerElem.style.visibility = "visible";
    responseContainerElem.style.height = ""; // Reset height
  }
}

async function askBot(event) {
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  if (isRequestPending || speaking) {
    console.log("askBot returned: request pending or speaking");
    return;
  }
  isRequestPending = true;
  disableSubmitButtons();
  initAudioContext();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx
      .resume()
      .catch((e) => console.error("AudioContext resume error:", e));
  }

  const audioControls = document.getElementById("audioControls");
  if (audioControls) audioControls.style.display = "none";

  // Determine submitTo (who the message is for)
  if (event && event.submitter && event.submitter.value) {
    submitTo = event.submitter.value;
  } else {
    const activeButtons = Array.from(
      document.querySelectorAll(
        '#submitTo input[type="submit"].chat-submit-button:not([disabled])'
      )
    );
    if (
      previousAvatar &&
      activeButtons.some((btn) => btn.value === previousAvatar)
    ) {
      submitTo = previousAvatar;
    } else if (activeButtons.length > 0) {
      submitTo = activeButtons[0].value;
    } else {
      const anyButton = document.querySelector(
        '#submitTo input[type="submit"].chat-submit-button'
      );
      if (anyButton) {
        submitTo = anyButton.value;
      } else {
        console.error(
          "askBot: No submitter and no default target found. Cannot proceed."
        );
        isRequestPending = false;
        enableSubmitButtons();
        return;
      }
    }
  }
  avatar = submitTo;

  submitAs = submitAsElement ? submitAsElement.value : "User";
  let userInputValue = userInputElem ? userInputElem.value : "";
  let questionToSend = userInputValue.trim()
    ? `${submitAs}: ${userInputValue}`
    : `${submitAs}: `;

  if (promptElement && userInputValue.trim()) {
    promptElement.textContent = questionToSend;
    if (transcriptButtonHtml && !promptElement.querySelector("button")) {
      promptElement.insertAdjacentHTML("beforeend", transcriptButtonHtml);
    }
  } else if (promptElement && previousResponse) {
    promptElement.textContent = previousResponse;
    if (transcriptButtonHtml && !promptElement.querySelector("button")) {
      promptElement.insertAdjacentHTML("beforeend", transcriptButtonHtml);
    }
  }

  if (userInputElem) userInputElem.value = "";
  updateAvatar(avatar, "intrigued");
  let confusedTimer = setTimeout(
    () => updateAvatar(avatar, "confused"),
    thinkDelay
  );

  if (botResponseElem) {
    botResponseElem.innerHTML = "..."; // Set loading dots
    botResponseElem.classList.add("loading");
  }

  toggleResponseContainer(); // MODIFIED: Call toggle

  if (questionToSend.trim() !== `${submitAs}:`) {
    appendToTranscript(questionToSend, null, submitAs);
  }

  try {
    const token = await getIdTokenAsync();
    console.log("Token fetched for /ask request:", token ? "Exists" : "NULL");

    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      console.warn(
        "No token available for /ask request. User might not be logged in."
      );
    }

    const fetchResponse = await fetch("/ask", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        question: questionToSend,
        transcript: transcriptText,
        submitAs: submitAs,
        submitTo: submitTo,
        siteId: window.siteId,
        guests: guests,
        training: training,
        tutorial: tutorial,
      }),
    });

    const data = await fetchResponse.json();
    if (!fetchResponse.ok) {
      let errorMsg = "Request failed to /ask";
      if (data && data.error) errorMsg = data.error;
      else if (data && data.message) errorMsg = data.message;
      console.error(
        "Server responded with an error:",
        fetchResponse.status,
        data
      );
      throw new Error(`${errorMsg} (Status: ${fetchResponse.status})`);
    }
    clearTimeout(confusedTimer);

    if (data.personalityUpdated) {
      // ... (keep personality update logic) ...
    }
    if (!data.answer) throw new Error("No answer in response from /ask");

    let respondingAvatarName = data.answer.split(":")[0].trim();
    avatar = respondingAvatarName;
    let responseText = data.answer.includes(":")
      ? data.answer.split(":").slice(1).join(":").trim()
      : data.answer;
    const emotionMatch = responseText.match(/\(([^)]+)\)$/);
    let emotion = emotionMatch ? emotionMatch[1].toLowerCase() : "friendly";
    if (emotionMatch)
      responseText = responseText.replace(emotionMatch[0], "").trim();

    if (botResponseElem) botResponseElem.innerHTML = responseText;

    toggleResponseContainer(); // MODIFIED: Call toggle

    if (isTtsEnabled) {
      const audioUrl = await textToSpeech(
        data.answer,
        responseText,
        respondingAvatarName
      );
      await handleReaction(respondingAvatarName, emotion);
      if (audioUrl && !isLaughing)
        handleSpeech(`${audioUrl}?=${respondingAvatarName}`);
    } else {
      appendToTranscript(data.answer, null, respondingAvatarName);
      await handleReaction(respondingAvatarName, emotion);
    }

    previousResponse = data.answer;
    previousAvatar = respondingAvatarName;
    if (botResponseElem) botResponseElem.classList.remove("loading");

    toggleResponseContainer(); // MODIFIED: Call toggle
  } catch (error) {
    clearTimeout(confusedTimer);
    if (botResponseElem) {
      if (
        error.message.includes("401") ||
        error.message.includes("Unauthorized")
      ) {
        botResponseElem.innerHTML =
          'Please <a href="#" id="loginLinkError">log in</a> to chat.';
        setTimeout(() => {
          document
            .getElementById("loginLinkError")
            ?.addEventListener("click", (e) => {
              e.preventDefault();
              handleLoginLogout();
            });
        }, 0);
      } else {
        botResponseElem.innerHTML = "Error: " + error.message;
      }
      botResponseElem.classList.remove("loading");
    }
    updateAvatar(avatar, "sad");
    toggleResponseContainer(); // MODIFIED: Call toggle
    console.error("Error in askBot:", error);
  } finally {
    isRequestPending = false;
    enableSubmitButtons();
  }
}

// --- Settings Modal Logic ---
function setupSettingsModal() {
  const modalElement = document.getElementById("settingsModal");
  if (!modalElement) return;
  settingsModalInstance = new bootstrap.Modal(modalElement);

  settingsButton = document.getElementById("settingsButton"); // The gear icon
  if (settingsButton) {
    settingsButton.addEventListener("click", async () => {
      // Made async
      const token = await getIdTokenAsync(); // Get token before checking
      const currentUser = getCurrentUser();
      loggedInUserId = currentUser ? currentUser.uid : null; // Update loggedInUserId

      if (loggedInUserId && window.proxyOwnerId === loggedInUserId) {
        loadProfileDataForSettings();
        fetchMyProxies();
        settingsModalInstance.show();
      } else {
        alert("Please log in as the owner to change settings.");
      }
    });
  }

  document
    .getElementById("contextSelect")
    ?.addEventListener("change", loadProfileDataForSettings);
  document
    .getElementById("editForm")
    ?.addEventListener("submit", saveProfileChanges);
  document
    .getElementById("beginTrainingButton")
    ?.addEventListener("click", startTrainingSession);
  document
    .getElementById("createNewProxyFromSettings")
    ?.addEventListener("click", () => (window.location.href = "/create"));
  document
    .getElementById("contentField")
    ?.addEventListener("input", checkSaveButtonState);
  document
    .getElementById("copyShareUrlButton")
    ?.addEventListener("click", copyUrl); // Use new copyUrl
}

function loadProfileDataForSettings() {
  const contextSelect = document.getElementById("contextSelect");
  const contentField = document.getElementById("contentField");
  const contentIdLabel = document.getElementById("contentIdLabel");
  const saveProfileButton = document.getElementById("saveProfileButton");

  if (!contextSelect || !contentField || !contentIdLabel || !saveProfileButton)
    return;

  let contentId = contextSelect.value; // Keep 'let' if it needs reassignment
  document.getElementById("contentIdField").value = contentId;
  const scenarioText = contextSelect.options[contextSelect.selectedIndex].text;
  contentIdLabel.textContent = `Personality for ${scenarioText}:`;

  const currentProxyData = proxies[window.currentProxySubdomain.toLowerCase()];
  let content =
    currentProxyData && currentProxyData[contentId]
      ? currentProxyData[contentId]
      : ""; // Keep 'let'
  contentField.value = content;
  originalContent = content;

  const canEdit = loggedInUserId && window.proxyOwnerId === loggedInUserId;
  contentField.disabled = !canEdit;
  saveProfileButton.disabled = true; // Always start disabled
  toggleTrainingButtonState(); // Update training button state
}

function checkSaveButtonState() {
  const contentField = document.getElementById("contentField");
  const saveProfileButton = document.getElementById("saveProfileButton");
  if (!contentField || !saveProfileButton) return;
  const canEdit = loggedInUserId && window.proxyOwnerId === loggedInUserId;
  saveProfileButton.disabled =
    !canEdit || contentField.value === originalContent;
}

async function saveProfileChanges(event) {
  event.preventDefault();
  const saveButton = document.getElementById("saveProfileButton");
  const saveStatus = document.getElementById("saveStatus");
  if (!saveButton || !saveStatus) return;

  saveButton.disabled = true;
  saveStatus.textContent = "Saving...";
  saveStatus.className = "ms-2 text-info";

  const newContent = document.getElementById("contentField").value;
  const currentContentId = document.getElementById("contentIdField").value;
  const token = await getIdTokenAsync(); // Use async version
  if (!token) {
    saveStatus.textContent = "Error: Not logged in.";
    saveStatus.className = "ms-2 text-danger";
    return;
  }

  try {
    const response = await fetch("/update-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contentId: currentContentId,
        content: newContent,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save");

    saveStatus.textContent = "Saved!";
    saveStatus.className = "ms-2 text-success";
    originalContent = newContent;
    proxies[window.currentProxySubdomain.toLowerCase()][currentContentId] =
      newContent;
  } catch (error) {
    saveStatus.textContent = `Error: ${error.message}`;
    saveStatus.className = "ms-2 text-danger";
  } finally {
    saveButton.disabled = true; // Disable again after save attempt
  }
}

function checkSettingsVisibility() {
  settingsButton = document.getElementById("settingsButton");
  if (!settingsButton) return;
  const canEdit =
    loggedInUserId &&
    window.proxyOwnerId &&
    loggedInUserId === window.proxyOwnerId;
  settingsButton.style.display = canEdit ? "inline-block" : "none";
}

async function fetchMyProxies() {
  const token = await getIdTokenAsync(); // Use async version
  const proxyListElement = document.getElementById("myProxyList");
  if (!proxyListElement) return;

  if (!token) {
    proxyListElement.innerHTML =
      '<li class="list-group-item">Please log in to see your proxies.</li>';
    return;
  }
  proxyListElement.innerHTML = '<li class="list-group-item">Loading...</li>';

  try {
    const response = await fetch("/api/my-proxies", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(data.error || "Failed to fetch");
    populateProxyList(data.proxies);
  } catch (error) {
    proxyListElement.innerHTML = `<li class="list-group-item text-danger">Error: ${error.message}</li>`;
  }
}

function populateProxyList(userProxies) {
  const proxyListElement = document.getElementById("myProxyList");
  if (!proxyListElement) return;
  proxyListElement.innerHTML = "";
  if (userProxies.length === 0) {
    proxyListElement.innerHTML =
      '<li class="list-group-item">You haven\'t created any proxies yet.</li>';
    return;
  }
  userProxies.forEach((proxy) => {
    const isActive = proxy.proxySubdomain === window.currentProxySubdomain;
    const listItem = document.createElement("li");
    listItem.className = `list-group-item d-flex justify-content-between align-items-center ${
      isActive ? "active" : ""
    }`;
    listItem.innerHTML = `
            <span>
                <img src="${
                  proxy.imageUrl
                }" width="30" height="30" style="border-radius: 50%; margin-right: 10px;" alt="${
      proxy.name
    }">
                ${proxy.name}
            </span>
            ${
              !isActive
                ? `<button class="btn btn-sm btn-primary switch-proxy-btn" data-subdomain="${proxy.proxySubdomain}">Switch</button>`
                : '<span class="badge bg-secondary">Active</span>'
            }
        `;
    if (!isActive) {
      listItem
        .querySelector(".switch-proxy-btn")
        .addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent li click if button is clicked
          console.log("huh", e.target.dataset.subdomain);
          switchProxy(e.target.dataset.subdomain);
        });
      listItem.addEventListener("click", () =>
        switchProxy(proxy.proxySubdomain)
      );
    }
    proxyListElement.appendChild(listItem);
  });
}

function switchProxy(proxySubdomain) {
  const host = window.location.hostname; // e.g., 'afsadfsd.localhost'
  const port = window.location.port; // e.g., '3001'
  const protocol = window.location.protocol; // 'http:'

  console.log(`Switching to: ${proxySubdomain}. Current: ${host}:${port}`); // Log #1

  let baseDomain = "";
  const hostParts = host.split(".");

  // Check if the last part is 'localhost'. This covers 'localhost' and '*.localhost'
  if (hostParts[hostParts.length - 1] === "localhost") {
    baseDomain = "localhost";
  } else {
    // Assume production or other; take the last two parts (e.g., 'ego-proxy.com')
    // Or just the host if it has no dots.
    baseDomain = hostParts.length > 1 ? hostParts.slice(-2).join(".") : host;
  }

  let newHost = `${proxySubdomain}.${baseDomain}`;

  // Append port if it exists and isn't a standard one (80/443)
  if (port && port !== "80" && port !== "443") {
    newHost += `:${port}`;
  }

  const newUrl = `${protocol}//${newHost}/meet`;
  console.log(`Redirecting to: ${newUrl}`); // Log #2

  window.location.href = newUrl;
}
function startTrainingSession() {
  // This function will set the 'training' flag and potentially reload the page
  // or re-initialize the chat for a training interaction.
  // For now, let's assume it means starting a new chat focused on the current scenario.
  training = true; // Set global training flag
  tutorial = !originalContent; // If no original content, it's a tutorial

  const trainingProgressElement = document.getElementById(
    "trainingProgressBar"
  );
  if (trainingProgressElement)
    trainingProgressElement.textContent = tutorial
      ? "Starting tutorial..."
      : "Starting training...";

  // Close settings modal
  if (settingsModalInstance) settingsModalInstance.hide();

  // Reset transcript and prompt for a fresh training session
  transcriptText = `Begin ${tutorial ? "tutorial" : "training"} for ${
    document.getElementById("contextSelect").options[
      document.getElementById("contextSelect").selectedIndex
    ].text
  }.`;
  transcriptHtml = transcriptText;
  const transcriptElem = document.getElementById("transcript");
  if (transcriptElem) transcriptElem.innerHTML = transcriptHtml;

  const promptElem = document.getElementById("prompt");
  if (promptElem)
    promptElem.innerHTML =
      "Click a character to start the training conversation.";

  // Simulate a "go" click for the current proxy to start the conversation
  const firstSubmitButton = document.querySelector(
    '#submitTo input[type="submit"]:not([disabled])'
  );
  if (firstSubmitButton) {
    // Ensure the input field is empty for the bot's first turn
    const userInput = document.getElementById("userInput");
    if (userInput) userInput.value = "";
    firstSubmitButton.click();
  } else {
    console.warn("Could not find an enabled submit button to start training.");
  }
}

function toggleTrainingButtonState() {
  const beginTrainingButton = document.getElementById("beginTraining");
  const contentField = document.getElementById("contentField");
  if (!beginTrainingButton || !contentField) return;

  if (loggedInUserId && window.proxyOwnerId === loggedInUserId) {
    beginTrainingButton.disabled = false;
    if (contentField.value.trim() === "") {
      beginTrainingButton.textContent = "Begin Tutorial (Generate Profile)";
    } else {
      beginTrainingButton.textContent = "Refine Profile (Continue Training)";
    }
  } else {
    beginTrainingButton.disabled = true;
    beginTrainingButton.textContent = "Begin/Continue Training"; // Default text
  }
}

// --- Utility & Old Functions (Review/Remove as needed) ---
function copyUrl() {
  const urlInput = document.getElementById("shareUrlInput"); // Use new ID if changed
  if (!urlInput) return;
  // Update URL logic here before copying
  // Example: urlInput.value = `http://${window.currentProxySubdomain}...`;
  navigator.clipboard
    .writeText(urlInput.value)
    .then(() => {
      alert("URL Copied!");
    })
    .catch((err) => console.error("Copy failed", err));
}
function testUrl(url) {
  if (url) window.open(url, "_blank");
}
// Remove or adapt: updateUrl, processParameters, selectProxyBasedOnContext, etc.
// Keep alpha if used.

// --- DOMContentLoaded Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM Loaded. Initializing chat...");
  const globalAuthBtn = document.getElementById("globalAuthButton");
  if (globalAuthBtn) {
    globalAuthBtn.addEventListener("click", handleLoginLogout);
  }

  // Initialize Auth Listener using onAuthChanged from auth.js
  onAuthChanged((user, token) => {
    // Use the callback provided by auth.js
    loggedInUserId = user ? user.uid : null;
    console.log(
      "Auth State Changed via onAuthChanged. UserID:",
      loggedInUserId
    );
    updateAuthButton(user);
    checkSettingsVisibility(); // Check if settings icon should be shown
    // If settings modal is open, refresh its data
    const settingsModal = document.getElementById("settingsModal");
    if (settingsModal && bootstrap.Modal.getInstance(settingsModal)?._isShown) {
      loadProfileDataForSettings();
      fetchMyProxies();
    }
  });

      // Initial state for the global button
    // Use a small delay to allow auth.js to potentially resolve initial state
    setTimeout(() => {
        updateAuthButton(getCurrentUser());
    }, 100);

  // Cache main elements
  botImage = document.getElementById("botImage");
  botContainer = document.querySelector(".bot-container");
  botResponseElem = document.getElementById("botResponse");
  userInputElem = document.getElementById("userInput");
  submitAsElement = document.getElementById("submitAs");
  promptElement = document.getElementById("prompt");
  settingsButton = document.getElementById("settingsButton"); // Cache settings button

  const transcriptModal = document.getElementById("transcriptModal");

  if (transcriptModal) {
    transcriptModal.addEventListener("show.bs.modal", function (event) {
      const transcriptEl = document.getElementById("transcript");
      if (transcriptEl) {
        transcriptEl.innerHTML = transcriptHtml; // Set content when modal opens
        transcriptEl.scrollTop = transcriptEl.scrollHeight; // Scroll to bottom
      }
    });
  }

  if (
    !botImage ||
    !userInputElem ||
    !submitAsElement ||
    !promptElement ||
    !settingsButton
  ) {
    console.error(
      "Critical DOM elements missing. Chat may not function correctly."
    );
  }

  // Ensure global `proxies` and `siteId` are available from EJS
  if (
    typeof window.proxies === "undefined" ||
    typeof window.siteId === "undefined"
  ) {
    console.error(
      "EJS variables (proxies, siteId) not found on window object!"
    );
    // Fallback or early exit if critical data is missing
    return;
  }
  // Make them available to the script scope
  window.proxies = window.proxies || {}; // Ensure it's an object
  window.siteId = window.siteId || "meet"; // Default if not set

  initAudioContext();
  setupSettingsModal();
  document
    .getElementById("authButton")
    ?.addEventListener("click", handleLoginLogout);
  document
    .getElementById("ttsButton")
    ?.addEventListener("click", toggleTtsState);
  // The form's onsubmit is now in EJS, calling window.chatApp.askBot

  if (userInputElem) {
    userInputElem.addEventListener("input", function () {
      clearTimeout(typingTimer);
      const currentSubmitAsValue = submitAsElement
        ? submitAsElement.value
        : "User";

      // Always show what user is typing in the response bubble for preview
      if (botResponseElem) {
        botResponseElem.textContent = this.value;
      }

      // Update avatar based on who is typing
      const currentSubmitAsKey = currentSubmitAsValue.toLowerCase();

      if (window.proxies && window.proxies[currentSubmitAsKey]) {
        // User is typing as a recognized proxy
        if (botResponseElem) {
          botResponseElem.textContent = this.value;
        }
        updateAvatar(currentSubmitAsValue, "speak");
        toggleResponseContainer(); // Show bubble
      } else {
        // User is typing as "User" or an unrecognized name
        if (botResponseElem) {
          botResponseElem.textContent = ""; // Clear the speech bubble
        }
        updateAvatar(avatar, "intrigued"); // Main bot on screen becomes intrigued
        toggleResponseContainer(); // This will likely hide it if textContent is empty
      }
      typingTimer = setTimeout(doneTyping, doneTypingInterval);
      enableSubmitButtons();
    });

    userInputElem.addEventListener("keydown", function (event) {
      if (
        previousResponse &&
        previousResponse !== currentPrompt &&
        promptElement
      ) {
        promptElement.textContent = previousResponse;
        currentPrompt = previousResponse; // Update currentPrompt
        if (transcriptButtonHtml && !promptElement.querySelector("button")) {
          promptElement.insertAdjacentHTML("beforeend", transcriptButtonHtml);
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        clearTimeout(typingTimer);
        // Simulate a click on the determined "submitTo" button
        // This will trigger the form submission which then calls askBot
        const form = document.getElementById("ask");
        // Determine target and click
        let targetSubmitTo;
        const activeButtons = Array.from(
          document.querySelectorAll(
            '#submitTo input[type="submit"].chat-submit-button:not([disabled])'
          )
        );
        if (
          previousAvatar &&
          activeButtons.some((btn) => btn.value === previousAvatar)
        ) {
          targetSubmitTo = previousAvatar;
        } else if (activeButtons.length > 0) {
          targetSubmitTo = activeButtons[0].value;
        } else {
          const anyButton = document.querySelector(
            '#submitTo input[type="submit"].chat-submit-button'
          );
          targetSubmitTo = anyButton ? anyButton.value : null;
        }

        if (targetSubmitTo) {
          const buttonToClick = document.querySelector(
            `#submitTo input[type="submit"][value="${targetSubmitTo}"]`
          );
          if (buttonToClick) {
            // Create a synthetic submit event for the askBot function
            const syntheticEvent = {
              preventDefault: () => {}, // Mock preventDefault
              submitter: buttonToClick,
            };
            window.chatApp.askBot(syntheticEvent); // Call directly
          } else {
            form.requestSubmit(); // Fallback to general form submission if button not found
          }
        } else {
          form.requestSubmit(); // Fallback
        }
      }
    });
  }

  await preloadImages(window.proxies); // Use window.proxies
  // Initial avatar setup (use window.currentProxySubdomain from EJS)
  updateAvatar(
    window.currentProxySubdomain || Object.keys(window.proxies)[0] || "Guest",
    "friendly"
  );
  toggleResponseContainer();
  enableSubmitButtons();

  // Set initial submitAs
  if (submitAsElement) submitAs = submitAsElement.value;

  const feedbackModalElement = document.getElementById("feedbackModal");
  if (feedbackModalElement) {
    feedbackModal = new bootstrap.Modal(feedbackModalElement);
    document
      .getElementById("feedbackForm")
      ?.addEventListener("submit", function (e) {
        e.preventDefault();
        const feedbackText = document.getElementById("feedbackText").value;
        fetch("/send-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback: feedbackText,
            email: document.getElementById("proxyEmail").value,
          }),
        })
          .then((resp) => resp.json())
          .then(() => {
            feedbackModal.hide();
            this.reset();
            alert("Feedback sent!");
          })
          .catch((err) => console.error("Feedback error:", err));
      });
  }

  console.log("Chat.js Initialized.");
});

function doneTyping() {
  const currentSubmitAsVal = submitAsElement ? submitAsElement.value : "User";
  const currentSubmitAsKey = currentSubmitAsVal.toLowerCase();
  if (proxies[currentSubmitAsKey]) {
    updateAvatar(currentSubmitAsVal, "friendly");
  } else {
    updateAvatar(avatar, "friendly");
  }
}

// Expose necessary functions globally if called by inline HTML handlers
window.chatApp = {
  handleSpeech,
  askBot, // Ensure this is correctly defined and working
  copyUrl,
  testUrl,
  // Keep other functions that were in your original initialize() and are still needed by EJS
  // updateContext: () => loadProfileDataForSettings(), // If contextSelect onchange calls this
  // updateUrl: () => { /* review if still needed */ },
};
