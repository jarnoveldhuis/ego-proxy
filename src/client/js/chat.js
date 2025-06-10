// src/client/js/chat.js

import {
  ensureAuthInitialized,
  onFirebaseAuthChanged, // To react to Firebase client-side changes
  handleGoogleLogin, // From the updated auth.js that now also hits /api/auth/session-login
  handleLogout, // From the updated auth.js that now also hits /api/auth/session-logout
} from "./auth.js";
// We don't directly import signInWithPopup etc. here anymore, auth.js handles that.

// --- Application User State (from backend session) ---
let currentAppUser = {
  isLoggedIn: false,
  details: null, // Will store { userId, email } from /api/auth/status
};

// This global variable will store the app-level logged-in user ID
let loggedInUserId = null;

// Function to fetch and update the application's authentication state
async function fetchAndUpdateAppAuthState() {
  console.log(
    "Chat.js: Fetching application auth status from /api/auth/status..."
  );
  try {
    const response = await fetch("/api/auth/status");
    if (!response.ok) {
      // Network error or server issue, assume logged out for safety
      console.error(
        "Chat.js: /api/auth/status request failed with status:",
        response.status
      );
      currentAppUser.isLoggedIn = false;
      currentAppUser.details = null;
    } else {
      const data = await response.json();
      if (data.success) {
        currentAppUser.isLoggedIn = data.loggedIn;
        currentAppUser.details = data.user; // user is { userId, email } or null
        console.log("Chat.js: App auth status updated:", currentAppUser);
      } else {
        // API reported success:false, assume logged out
        console.warn(
          "Chat.js: /api/auth/status reported not successful. Assuming logged out."
        );
        currentAppUser.isLoggedIn = false;
        currentAppUser.details = null;
      }
    }
  } catch (error) {
    console.error("Chat.js: Error fetching /api/auth/status:", error);
    currentAppUser.isLoggedIn = false;
    currentAppUser.details = null;
  }

  // Update the global loggedInUserId based on app user state
  loggedInUserId = currentAppUser.isLoggedIn
    ? currentAppUser.details?.userId
    : null;

  // Update UI elements that depend on auth state
  updateAuthButtonUI(); // Changed name for clarity
  checkSettingsVisibility();
}

function handleLoginLogoutApp() {
  // Renamed to avoid conflict if old one was global
  if (currentAppUser.isLoggedIn) {
    handleLogout() // This is from the updated auth.js
      .then(() => {
        console.log(
          "Chat.js: Logout process initiated via auth.js. App state will refresh."
        );
        // auth.js now handles Firebase signout and backend session destruction.
        // onFirebaseAuthChanged will trigger fetchAndUpdateAppAuthState.
        // Redirect to home after logout.
        if (window.location.pathname === "/") {
          window.location.reload();
        } else {
          window.location.href = "/";
        }
      })
      .catch((error) => {
        console.error("Chat.js: Logout error:", error);
      });
  } else {
    handleGoogleLogin() // This is from the updated auth.js
      .then((firebaseUser) => {
        // firebaseUser is returned by handleGoogleLogin in auth.js
        if (firebaseUser) {
          console.log(
            "Chat.js: Login process initiated via auth.js. App state will refresh."
          );
          // auth.js now handles Firebase signin and backend session creation.
          // onFirebaseAuthChanged will trigger fetchAndUpdateAppAuthState.
          // Redirect to home to apply new session state server-side if needed.
          if (window.location.pathname !== "/") {
            // Only redirect if not already on a page that might show dashboard
            window.location.href = "/";
          } else {
            fetchAndUpdateAppAuthState(); // Or just refresh state if staying on same page
          }
        }
      })
      .catch((error) => {
        console.error(
          "Chat.js: Google login error:",
          error.message,
          error.code
        );
      });
  }
}

function updateAuthButtonUI() {
  const authButton = document.getElementById("globalAuthButton");
  const authIcon = authButton ? authButton.querySelector("i") : null;
  if (!authButton || !authIcon) return;

  if (currentAppUser.isLoggedIn) {
    authIcon.classList.remove("fa-sign-in-alt");
    authIcon.classList.add("fa-sign-out-alt");
    authButton.title = "Log Out";
    authButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Log Out';
  } else {
    authIcon.classList.remove("fa-sign-out-alt");
    authIcon.classList.add("fa-sign-in-alt");
    authButton.title = "Log In with Google";
    authButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Log In';
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
  submitTo = "";
let training = false,
  tutorial = false,
  settingsModalInstance,
  feedbackModal,
  originalContent = "";
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
    // botContainer.style.backgroundImage = `url(${imagePath})`;
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
    console.log(
      "Chat.js: Calling /ask. App Logged in User ID:",
      loggedInUserId
    ); // Uses the global loggedInUserId from session

    const fetchResponse = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // No Authorization header with Firebase token
      body: JSON.stringify({
        question: questionToSend,
        transcript: transcriptText,
        submitAs: submitAs,
        submitTo: submitTo,
        siteId: window.siteId,
        guests: guests,
        training: training,
        tutorial: tutorial,
        // Backend can get userId from req.appUser.uid via ensureAuthenticatedSession
      }),
    });
    clearTimeout(confusedTimer); // Clear timer once response starts processing
    const data = await fetchResponse.json();

    if (!fetchResponse.ok) {
      let errorMsg = "Request failed to /ask";
      if (data && data.error) errorMsg = data.error;
      else if (data && data.message) errorMsg = data.message;

      if (fetchResponse.status === 401) {
        // Unauthorized from backend session
        errorMsg = "Your session may have expired. Please log in again.";
        // Optionally prompt for login:
        // botResponseElem.innerHTML = 'Session expired. Please <a href="#" id="reloginLinkError">log in</a>.';
        // document.getElementById('reloginLinkError')?.addEventListener('click', (e) => { e.preventDefault(); handleLoginLogoutApp();});
      }
      throw new Error(`${errorMsg} (Status: ${fetchResponse.status})`);
    }

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

//// --- Settings Modal Logic ---
function setupSettingsModal() {
  const modalElement = document.getElementById("settingsModal");
  if (!modalElement) return;
  settingsModalInstance = new bootstrap.Modal(modalElement);

  settingsButton = document.getElementById("settingsButton");
  if (settingsButton) {
    settingsButton.addEventListener("click", async () => {
      if (loggedInUserId && window.proxyOwnerId === loggedInUserId) {
        loadProfileDataForSettings(); 
        fetchMyProxiesAppSession(); 
        
        // HAL: NEW - Populate persona handles when modal opens
        populatePersonaHandles();

        settingsModalInstance.show();
      } else if (loggedInUserId && window.proxyOwnerId !== loggedInUserId) {
        alert("You must be the owner of this proxy to change settings.");
      } else {
        alert("Please log in to change settings.");
      }
    });
  }

  // HAL: NEW - Add event listener for the new Ego Proxy form
  const egoProxyForm = document.getElementById('egoProxyHandlesForm');
  if (egoProxyForm) {
      egoProxyForm.addEventListener('submit', handlePersonaUpdate);
  }

  // ... (keep the other event listeners for contextSelect, editForm, etc.)
  document
    .getElementById("contextSelect")
    ?.addEventListener("change", loadProfileDataForSettings);
  document
    .getElementById("editForm")
    ?.addEventListener("submit", saveProfileChangesAppSession);
  document
    .getElementById("beginTrainingButton")
    ?.addEventListener("click", startTrainingSession);
  document
    .getElementById("createNewProxyFromSettings")
    ?.addEventListener("click", () => (window.location.href = "/")); // HAL FIX: Changed to "/" which is the create page
  document
    .getElementById("contentField")
    ?.addEventListener("input", checkSaveButtonState);
  document
    .getElementById("copyShareUrlButton")
    ?.addEventListener("click", copyUrl);
}

function populatePersonaHandles() {
  const currentProxyData = window.proxies[window.currentProxySubdomain.toLowerCase()];
  const handles = currentProxyData?.publicPersonaData || [];

  // Helper to set value if input exists
  const setInputValue = (id, platform) => {
      const input = document.getElementById(id);
      if (input) {
          const data = handles.find(p => p && p.platform === platform);
          input.value = data ? data.handle || '' : '';
      }
  };

  setInputValue('xHandle', 'X');
  setInputValue('redditHandle', 'Reddit');
  setInputValue('linkedinHandle', 'LinkedIn');
  setInputValue('instagramHandle', 'Instagram');
  setInputValue('tiktokHandle', 'TikTok');
  setInputValue('githubHandle', 'GitHub');
}

async function handlePersonaUpdate(event) {
  event.preventDefault();
  const saveButton = document.getElementById('saveHandlesButton');
  const statusSpan = document.getElementById('personaUpdateStatus');
  if (!saveButton || !statusSpan) return;

  saveButton.disabled = true;
  statusSpan.textContent = 'Updating... This may take a moment.';
  statusSpan.className = 'ms-2 text-info';

  // Helper to get value from input
  const getInputValue = (id) => document.getElementById(id)?.value || '';

  const proxyName = window.currentProxySubdomain;

  try {
      const response = await fetch(`/api/proxy/${proxyName}/update-persona`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              xHandle: getInputValue('xHandle'),
              redditHandle: getInputValue('redditHandle'),
              linkedinHandle: getInputValue('linkedinHandle'),
              instagramHandle: getInputValue('instagramHandle'),
              tiktokHandle: getInputValue('tiktokHandle'),
              githubHandle: getInputValue('githubHandle')
          })
      });

      const data = await response.json();
      if (!response.ok) {
          throw new Error(data.error || 'Failed to update persona.');
      }

      statusSpan.textContent = 'Persona updated successfully!';
      statusSpan.className = 'ms-2 text-success';
      
      // Update the local proxy data cache
      if(window.proxies[proxyName.toLowerCase()]) {
          window.proxies[proxyName.toLowerCase()].meet = data.newProfile;
          window.proxies[proxyName.toLowerCase()].publicPersonaData = data.details;
      }
      
      loadProfileDataForSettings();

  } catch (error) {
      console.error("Error updating persona:", error);
      statusSpan.textContent = `Error: ${error.message}`;
      statusSpan.className = 'ms-2 text-danger';
  } finally {
      setTimeout(() => {
          saveButton.disabled = false;
          statusSpan.textContent = '';
      }, 3000);
  }
}

function loadProfileDataForSettings() {
  // This function itself doesn't need auth changes, but relies on `loggedInUserId` and `window.proxyOwnerId`
  // which are set based on auth state.
  const contextSelect = document.getElementById("contextSelect"); /* ... */
  const contentField = document.getElementById("contentField"); /* ... */
  const contentIdLabel = document.getElementById("contentIdLabel"); /* ... */
  const saveProfileButton =
    document.getElementById("saveProfileButton"); /* ... */
  if (!contextSelect || !contentField || !contentIdLabel || !saveProfileButton)
    return;
  let contentId = contextSelect.value;
  document.getElementById("contentIdField").value = contentId;
  const scenarioText = contextSelect.options[contextSelect.selectedIndex].text;
  contentIdLabel.textContent = `Personality for ${scenarioText}:`;
  const currentProxyData =
    window.proxies[window.currentProxySubdomain.toLowerCase()];
  let content =
    currentProxyData && currentProxyData[contentId]
      ? currentProxyData[contentId]
      : "";
  contentField.value = content;
  originalContent = content;
  const canEdit = loggedInUserId && window.proxyOwnerId === loggedInUserId;
  contentField.disabled = !canEdit;
  saveProfileButton.disabled = true;
  toggleTrainingButtonState();
}

function checkSaveButtonState() {
  // Relies on loggedInUserId
  const contentField = document.getElementById("contentField"); /* ... */
  const saveProfileButton =
    document.getElementById("saveProfileButton"); /* ... */
  if (!contentField || !saveProfileButton) return;
  const canEdit = loggedInUserId && window.proxyOwnerId === loggedInUserId;
  saveProfileButton.disabled =
    !canEdit || contentField.value === originalContent;
}

async function saveProfileChangesAppSession(event) {
  // Renamed
  event.preventDefault();
  const saveButton = document.getElementById("saveProfileButton");
  const saveStatus = document.getElementById("saveStatus");
  if (!saveButton || !saveStatus) return;

  saveButton.disabled = true;
  saveStatus.textContent = "Saving...";
  saveStatus.className = "ms-2 text-info";

  const newContent = document.getElementById("contentField").value;
  const currentContentId = document.getElementById("contentIdField").value;

  // No need for Firebase ID token, backend uses session
  if (!currentAppUser.isLoggedIn) {
    saveStatus.textContent = "Error: Not logged in (session).";
    saveStatus.className = "ms-2 text-danger";
    saveButton.disabled = false; // Re-enable button
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
    window.proxies[window.currentProxySubdomain.toLowerCase()][
      currentContentId
    ] = newContent;
    saveButton.disabled = true;
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
  // Use app-level loggedInUserId and window.proxyOwnerId (passed from server)
  const canEdit =
    loggedInUserId &&
    window.proxyOwnerId &&
    loggedInUserId === window.proxyOwnerId;
  settingsButton.style.display = canEdit ? "inline-block" : "none";
}

async function fetchMyProxiesAppSession() {
  const proxyListElement = document.getElementById("myProxyList");
  if (!proxyListElement) return;

  if (!currentAppUser.isLoggedIn) {
    proxyListElement.innerHTML =
      '<li class="list-group-item">Please log in to see your proxies.</li>';
    return;
  }
  proxyListElement.innerHTML = '<li class="list-group-item">Loading...</li>';

  try {
    // No Authorization header needed if /api/my-proxies uses session
    const response = await fetch("/api/my-proxies");
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(data.error || "Failed to fetch proxies");
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
  console.log("Chat.js: DOMContentLoaded. Initializing...");

  const globalAuthBtn = document.getElementById("globalAuthButton");
  if (globalAuthBtn) {
    globalAuthBtn.addEventListener("click", handleLoginLogoutApp); // Use app-specific handler
  }

  // Cache main DOM elements
  botImage = document.getElementById("botImage"); /* ... other elements ... */
  botContainer = document.querySelector(".bot-container");
  botResponseElem = document.getElementById("botResponse");
  userInputElem = document.getElementById("userInput");
  submitAsElement = document.getElementById("submitAs");
  promptElement = document.getElementById("prompt");
  settingsButton = document.getElementById("settingsButton");

  await ensureAuthInitialized();
  console.log(
    "Chat.js: Firebase client initialization confirmed by ensureAuthInitialized()."
  );

  // Fetch initial application auth state
  await fetchAndUpdateAppAuthState();

  // Set up a listener for subsequent Firebase client-side auth changes.
  // These changes (login/logout via popup) should also trigger backend session changes via auth.js.
  // So, when Firebase state changes, we re-fetch our app's session status.
  onFirebaseAuthChanged(async (firebaseUser) => {
    console.log(
      "Chat.js: onFirebaseAuthChanged triggered. Firebase User:",
      firebaseUser ? firebaseUser.uid : null,
      ". Re-fetching app auth status."
    );
    await fetchAndUpdateAppAuthState();
    // If settings modal is open and auth state changed, refresh its data too
    const settingsModal = document.getElementById("settingsModal");
    if (
      settingsModal &&
      bootstrap.Modal.getInstance(settingsModal)?._isShown &&
      currentAppUser.isLoggedIn
    ) {
      if (loggedInUserId && window.proxyOwnerId === loggedInUserId) {
        loadProfileDataForSettings();
        fetchMyProxiesAppSession();
      } else {
        // If user is no longer owner or logged out, maybe hide modal or disable parts
        settingsModalInstance?.hide();
      }
    } else if (
      settingsModal &&
      bootstrap.Modal.getInstance(settingsModal)?._isShown &&
      !currentAppUser.isLoggedIn
    ) {
      settingsModalInstance?.hide(); // Hide settings if user logs out
    }
  });

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

  // EJS variables check
  if (
    typeof window.proxies === "undefined" ||
    typeof window.siteId === "undefined"
  ) {
    console.error(
      "Chat.js: EJS variables (proxies, siteId) not found on window object!"
    );
    return;
  }
  window.proxies = window.proxies || {};
  window.siteId = window.siteId || "meet";

  initAudioContext();
  setupSettingsModal(); // This will now use app-level loggedInUserId

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

  await preloadImages(window.proxies);
  updateAvatar(
    window.currentProxySubdomain || Object.keys(window.proxies)[0] || "Guest",
    "friendly"
  );
  toggleResponseContainer();
  enableSubmitButtons();
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
