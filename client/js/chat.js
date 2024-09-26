// const e = require("express");

// Config Section
let siteId = window.location.pathname.split("/")[1];

// Audio Configuration
let isVoiceLoading = false;
let speaking = false;
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let analyser = audioCtx.createAnalyser();
let globalAudio;
let isTtsEnabled = false;

// Avatars
let avatar = "Guest";
let previousAvatar;
let typingTimer;
let doneTypingInterval = 2000;
let thinkDelay = 2000;
let laughLength = 1500;
let isLaughing = false;

// Chat Configuration
let transcriptHtml = "Begin conversation.";
let transcriptText = "Begin conversation.";
let trainScript = "";
const transcriptButtonHtml = `<button class="btn" id="showFormBtn" data-bs-toggle="modal" data-bs-target="#transcriptModal"><i class="fas fa-file-alt"></i></button>`;
let isRequestPending = false;
let hosts = [];
let guests = [];
let regularUrl = "";
let response = "";
let previousResponse = "";
let currentPrompt = "";
let submitButton;
let submitAsElement;
let promptElement;
let shareUrl = "";
let trainingUrl = "";
let trainingProgress = 0;

// Settings
let role = "";
let org = "";
let contentId = "";
let content = "";
let submitAs = "";
let submitTo = "";
let hasPersonality = false;
let saveButton;
let training = false;
let tutorial = false;
let settingsModal;
let feedbackModal;

// Image Management Functions
async function preloadImages(proxies) {
  if (typeof proxies !== "object" || proxies === null) {
    console.error("Invalid proxies object:", proxies);
    return;
  }

  for (let avatar in proxies) {
    if (!proxies.hasOwnProperty(avatar)) continue;
    let proxy = proxies[avatar];
    for (let reaction in proxy) {
      if (!proxy.hasOwnProperty(reaction)) continue;
      if (Array.isArray(proxy[reaction]) && proxy[reaction].length > 0) {
        let url = proxy[reaction][0].url;
        if (url && typeof url === "string") {
          let img = new Image();
          img.src = url;
          img.onerror = (error) => {
            // Failed to load image
            console.error("Error loading image:", error);
          };
        }
      }
    }
  }
}

function updateAvatar(submit, reaction) {
  clearTimeout(typingTimer);
  let botImage = document.getElementById("botImage");
  let botContainer = document.querySelector(".bot-container");

  if (typeof submit !== "undefined") {
    avatar = submit;
    let proxy = proxies[avatar];
    if (
      !proxy ||
      !proxy[reaction] ||
      proxy[reaction].length === 0 ||
      !proxy[reaction][0].url
    ) {
      console.log("Invalid proxy or reaction");
      console.log("Reaction:", reaction);
      return;
    }

    if (!typeof proxy["laugh"]) {
      reaction = "joy";
    }

    const imagePath = proxy[reaction][0].url;
    botContainer.style.backgroundImage = `url(${imagePath})`;
    botContainer.style.backgroundSize = "cover";
    botImage.src = imagePath;

    const submitButtons = document.querySelectorAll('input[type="submit"]');
    const submitAs = document.getElementById("submitAs").value;
    const inputField = document.getElementById("userInput");
    
    if (submitAs in proxies || !inputField.value.trim()) {
      submitButtons.forEach((button) => {
        button.disabled = button.value === avatar;
      });
    }


    return submitButtons;
  }

  return avatar;
}

function handleReaction(avatar, emotion) {
  if (context.alias === "CT") {
    laughLength = 0;
  }
  return new Promise((resolve, reject) => {
    const proxiesLowercase = Object.keys(proxies).reduce((acc, key) => {
      acc[key.toLowerCase()] = proxies[key];
      return acc;
    }, {});

    if (!(avatar.toLowerCase() in proxiesLowercase)) {
      console.log("Avatar data not found");
      return;
    }

    let proxy = proxies[avatar];
    updateAvatar(avatar, "friendly"); // Default image
    let botContainer = document.querySelector(".bot-container"); // Parent div

    // Check if there are laugh sounds for the avatar
    if (proxy.laughSounds && emotion.toLowerCase() === "laugh") {
      console.log("Laugh sounds found");
      const randomLaugh =
        proxy.laughSounds[Math.floor(Math.random() * proxy.laughSounds.length)];
      const laugh = new Audio("../laughs/" + randomLaugh);

      // Play the laugh sound and handle the avatar image
      updateAvatar(avatar, "joy");
      botContainer.classList.add("laughing");
      laugh.play();

      laugh.onplay = () => {
        isLaughing = true;
        console.log("Laughing");
      };

      laugh.onended = () => {
        isLaughing = false;
        console.log("End of laughter");
        updateAvatar(avatar, "friendly");
        botContainer.classList.remove("laughing");
        resolve();
      };
    } else if (!proxy.laughSounds && emotion.toLowerCase() === "laugh") {
      updateAvatar(avatar, "joy".toLowerCase());
      botContainer.classList.add("laughing");

      setTimeout(() => {
        updateAvatar(avatar, "friendly");
        botContainer.classList.remove("laughing");
        resolve();
      }, laughLength);
    } else {
      updateAvatar(avatar, emotion.toLowerCase());
      resolve();
    }
  });
}

// TTS Functions
function updateImageBasedOnVolume(audio) {
  if (!speaking) {
    return;
  }
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  let volume = sum / dataArray.length;
  if (
    siteId === "games" ||
    siteId == "interview" ||
    siteId == "datejulie" ||
    siteId == "dual"
  ) {
    volumeThreshold = 15;
  } else {
    volumeThreshold = 1;
  }

  if (volume > volumeThreshold) {
    updateAvatar(avatar, "speak");
    // document.getElementById('botImage').src = document.getElementById('botImage').src = "/img/" + avatar + "/speak";
  } else {
    updateAvatar(avatar, "friendly");
  }

  audio.onended = () => {
    speaking = false;
    updateAvatar(avatar, "friendly");
    return speaking;
  };

  requestAnimationFrame(() => updateImageBasedOnVolume(audio));
}

function handleSpeech(audioUrlWithAvatar) {
  let audioUrl, avatarName;

  if (isTtsEnabled === true) {
    speaking = true;
    if (audioUrlWithAvatar.includes("?")) {
      [audioUrl, avatarName] = audioUrlWithAvatar.split("?=");
      updateAvatar(avatarName, "joy");
      botResponse.classList.remove("loading");
    } else {
      audioUrl = audioUrlWithAvatar;
    }

    if (!globalAudio) {
      globalAudio = new Audio();
      const source = audioCtx.createMediaElementSource(globalAudio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
    }

    if (globalAudio.src !== audioUrl) {
      globalAudio.src = audioUrl;
    }

    globalAudio
      .play()
      .catch((e) => console.error("Error attempting to play audio:", e));

    globalAudio.onplay = () => {
      updateImageBasedOnVolume(globalAudio);
    };
  }
}

function toggleTtsState() {
  console.log("Toggling voice state");
  isTtsEnabled = !isTtsEnabled;
  let icon = document.getElementById("ttsIcon");

  if (isTtsEnabled) {
    console.log("Voice is ON");
    icon.classList.replace("fa-volume-mute", "fa-volume-up");
    let url = new URL(window.location.href);
    url.searchParams.set("voice", "true");
    history.pushState({}, "", url);
  } else {
    console.log("Voice is OFF");
    icon.classList.replace("fa-volume-up", "fa-volume-mute");
    let url = new URL(window.location.href);
    url.searchParams.delete("voice");
    history.pushState({}, "", url);
  }
}

async function textToSpeech(fullText, ttsText) {
  const voiceLoad = document.getElementById("voiceLoad");
  const botResponse = document.getElementById("botResponse");
  const audioControls = document.getElementById("audioControls");
  submitButtons = document.querySelectorAll('input[type="submit"]');

  isRequestPending = true;
  isVoiceLoading = true;
  botResponse.classList.remove("loading");
  text = botResponse.textContent;
  voiceLoad.classList.add("loading");

  try {
    const response = await fetch("/synthesize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: ttsText }),
    });

    if (response.status === 429) {
      toggleTtsState();
      voiceLoad.classList.remove("loading");
      isRequestPending = false;

      let rateLimitModal = new bootstrap.Modal(
        document.getElementById("rateLimitModal"),
        {}
      );
      rateLimitModal.show();

      return;
    }

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    let audio = new Audio(audioUrl);

    speaking = true;
    isVoiceLoading = false;
    appendToTranscript(fullText, audioUrl);
    audioControls.style.display = "block";

    audio.addEventListener("error", (e) => {
      let error = e.target.error;
      console.error(
        "Error playing audio. Code:",
        error.code,
        "Message:",
        error.message
      );
    });

    voiceLoad.classList.remove("loading");
    isRequestPending = false;
    isVoiceLoading = false;

    return audioUrl;
  } catch (error) {
    console.error("Text to Speech conversion error:", error);
    voiceLoad.classList.remove("loading");
    isRequestPending = false;
  }
}

// General Chat Functions
function disableSubmitButtons() {
  const submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => (button.disabled = true));
}

function enableSubmitButtons() {
  const submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => (button.disabled = false));
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
  var botResponse = document.getElementById("botResponse");
  var responseContainer = document.getElementById("response-container");

  if (botResponse.textContent === "") {
    responseContainer.style.visibility = "hidden";
    responseContainer.style.height = "0";
  } else {
    responseContainer.style.visibility = "visible";
    responseContainer.style.height = "";
  }
}

async function askBot(event) {
  if (isRequestPending || speaking) return;

  isRequestPending = true;
  disableSubmitButtons();

  if (audioCtx.state === "suspended") {
    audioCtx
      .resume()
      .then(() => {
        console.log("AudioContext resumed successfully");
      })
      .catch((error) => console.error("Error resuming AudioContext:", error));
  }

  const audioControls = document.getElementById("audioControls");
  audioControls.style.display = "none";
  isRequestPending = true;

  submitButtons = document.querySelectorAll('input[type="submit"]');
  submitTo = event instanceof Event ? event.submitter.value : null;
  avatar = submitTo in proxies ? submitTo : "Guest";

  const botResponse = document.getElementById("botResponse");
  const userInputElem = document.getElementById("userInput");
  const submitAsElem = document.getElementById("submitAs");
  let submitAs = submitAsElem.value;
  const botImage = document.getElementById("botImage");
  let userInputValue = userInputElem.value;

  hosts = getHosts(avatar);
  const promptElement = document.getElementById("prompt");

  if (userInputValue) {
    userInputValue = `${submitAs}: ${userInputValue}`;
    promptElement.textContent = userInputValue;
    promptElement.innerHTML += transcriptButtonHtml;
  }

  if (!userInputValue.trim()) {
    userInputValue = `${submitAs}: `;
    if (previousResponse) {
      promptElement.textContent = previousResponse;
      promptElement.innerHTML += transcriptButtonHtml;
    }
  }

  const trainingProgressElement = document.getElementById(
    "trainingProgressBar"
  );

  console.log("Percent:", (transcriptText.length / transcriptThreshold) * 100);
  trainingProgress = (transcriptText.length / transcriptThreshold) * 100;

  userInputElem.value = "";
  updateAvatar(avatar, "intrigued");
  confusedTimer = setTimeout(() => {
    updateAvatar(avatar, "confused");
  }, thinkDelay);

  if (tutorial || training) {
    if (trainingProgress < 100) {
      trainingProgressElement.textContent =
        `${context.context} Progress: ` + Math.floor(trainingProgress) + `%`;
    } else {
      trainingProgressElement.textContent = `Complete!`;
    }
  }
  if (transcriptText.length > transcriptThreshold && hasPersonality === false) {
    document.getElementById("trainingProgressBar").innerText =
      "Updating Personality";
    trainingProgressElement.textContent = `Updating Personality`;
    botResponse.textContent = " ";
    botResponse.classList.add("loading");
    hasPersonality = true;
  } else {
    botResponse.textContent = " ";
    botResponse.classList.add("loading");
  }

  askBot.disabled = true;
  toggleResponseContainer();

  if (userInputValue != `${submitAs}: `) {
    appendToTranscript(userInputValue);
  }

  try {
    const fetchResponse = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: userInputValue,
        transcript: transcriptText,
        submitAs: submitAs,
        submitTo: submitTo,
        siteId: siteId,
        guests: guests,
        training: training,
        tutorial: tutorial,
      }),
    });

    const data = await fetchResponse.json();
    if (data.personalityUpdated) {
      trainingProgressElement.textContent = `Finished!`;
      settingsModal.show();
      document.getElementById("contentField").value = data.transcriptSummary;
      document.getElementById("toggleButton").style.display = "inline-block";
      setTimeout(() => {
        showAlert(document.getElementById("contextUpdated"));
      }, 1000);

      proxies[Object.keys(proxies)[0]].meet = data.transcriptSummary;
      toggleTraining();
    }
    let avatar = data.answer.split(":")[0].trim();
    console.Object;

    clearTimeout(confusedTimer);

    let updatedText;
    if (data.answer.includes(":")) {
      updatedText = data.answer.split(":").slice(1).join(":").trim();
    } else {
      updatedText = data.answer;
    }

    const lastWord = updatedText.match(/\((.*?)\)$/);

    if (lastWord) {
      updatedText = updatedText.replace(lastWord[0], "").trim();
    } else {
      updatedText = data.answer;
    }
    // Extract the name and the text separately
    let name = data.answer.split(":")[0].trim() + ": "; // Extract the name
    let emotion = data.answer.match(/\((.*?)\)/);
    emotion = emotion ? emotion[1] : ""; // Set emotion to empty string if not found
    botResponse.innerHTML = updatedText;

    if (isTtsEnabled) {
      isRequestPending = true;
      const audioUrl = await textToSpeech(data.answer, updatedText);
      await handleReaction(avatar, emotion, audioUrl);
      if (isLaughing === false) {
        handleSpeech(audioUrl);
      }
    } else {
      appendToTranscript(data.answer);
      isRequestPending = false;
      handleReaction(avatar, emotion);
    }

    let submitButtons = document.querySelectorAll('input[type="submit"]');
    isRequestPending = false;

    // Disable butons
    // submitButtons.forEach(button => {
    //   if (button.value === avatar) {
    //     button.disabled = true;
    //   } else {
    //     button.disabled = false;
    //   }
    // });

    fetchedAnswer = data.answer;
    previousResponse = fetchedAnswer;
    previousAvatar = avatar;
    avatar = avatar in proxies ? avatar : "Guest";

    botResponse.classList.remove("loading");

    return previousAvatar;
  } catch (error) {
    clearTimeout(confusedTimer);
    (botResponse.innerHTML = "Error:"), error;
    botResponse.classList.remove("loading");
    botImage.src = "/img/logo.png";
    console.error("Error:", error);
    submitButtons = document.querySelectorAll('input[type="submit"]');
    isRequestPending = false;
  } finally {
    // enableSubmitButtons(); // Re-enable buttons on both success and failure
    isRequestPending = false;
  }
}

//Settings

// Function to show the alert and adjust z-index
function showAlert(alertElement) {
  alertElement.style.zIndex = 1070; // Set z-index higher than modals
  alertElement.classList.add("show"); // Show the alert
}

function getHosts(currentSpeaker) {
  // Add checked names as a single "guest" parameter
  const checkboxes = document.querySelectorAll(
    "#addProxyDropdown .form-check-input:checked"
  );
  hosts = [];
  checkboxes.forEach(function (checkbox) {
    hosts.push(checkbox.value);
  });
  hosts.push(proxyName);
  // Remove the currentSpeaker from the hosts array
  if (currentSpeaker) {
    hosts = hosts.filter((host) => host !== currentSpeaker);
  }

  if (hosts.length === 1) {
    // Only one host
    return `'${hosts[0]}'`;
  } else if (hosts.length === 2) {
    // Two hosts, join with ' and '
    return `'${hosts[0]} and ${hosts[1]}'`;
  } else if (hosts.length > 2) {
    // More than two hosts, format with commas and 'and'
    return `'${hosts.slice(0, -1).join(", ")} and ${hosts.slice(-1)}'`;
  } else {
    // No hosts selected or only the currentSpeaker was selected
    return "No other hosts selected";
  }
}

function updateContext() {
  let context = document.getElementById("contextSelect").value;
  selectProxyBasedOnContext(context);
  document.getElementById("interviewModal").style.display =
    context === "Interview" ? "block" : "none";
  // document.getElementById("dateModal").style.display =
  //   context === "Date" ? "block" : "none";
  document.getElementById("debateModal").style.display =
    context === "Debate" ? "block" : "none";
  context = document.getElementById("contextSelect").value;
  const saveButton = document.getElementById("save");

  saveButton.disabled = true;
}

let originalContent;

function updateContent() {
  const selectElement = document.getElementById("contextSelect");
  const contentId = selectElement.value.toLowerCase();
  const contentName = proxies[Object.keys(proxies)[0]][contentId + "Prompt"];
  const yourName = proxies[Object.keys(proxies)[0]][contentId + "Name"];

  document.getElementById("yourName").innerText = yourName + ":";
  document.getElementById("proxyName").innerText = yourName + ":";
  const content = proxies[Object.keys(proxies)[0]][contentId] || "";

  let params = new URLSearchParams(window.location.href);
  if (params.has("share")) {
    document.getElementById("settingsProfile").style.display = "none";
    document.getElementById("tabDescription").style.display = "none";
    document.getElementById("toggleButton").style.display = "none";
    document.getElementById("addProxyDropdown").style.display = "none";

    document.getElementById("scenarioSelector").style.display = "none";
    document.getElementById("myTab").style.display = "none";
    document.getElementById("urlCopy").style.display = "none";
    document.getElementById("parameters").style.display = "block";
    document.getElementById("practice-tab").classList.remove("active");
    document.getElementById("share-tab").classList.add("active");
    document.getElementById("practice").classList.remove("active");
    document.getElementById("share").classList.add("active");
    document.getElementById("practice").classList.remove("show");
    document.getElementById("share").classList.add("show");
    document.getElementById("testProxy").innerText = "Begin";
    document.getElementById("yourName").innerText = "Your Name:";
    document.getElementById("settingsHeaderText").innerText =
      proxyName + " " + siteId;
  } else {
    document.getElementById("yourName").innerText = yourName + ":";
  }

  if (!contentId) {
    console.warn("No content ID found.");
    return;
  }

  if (content === "" && contentId === "meet") {
    tutorial = true;
    console.log("Training mode enabled");

    document.getElementById("toggleButton").style.display = "none";
  }
  document.getElementById("contentIdField").value = contentId;

  document.getElementById("contentField").value = content;
  toggleTraining();
  document.getElementById("contentId").innerHTML = `<b>${contentName}:</b>`;

  document.getElementById(
    "practice-tab"
  ).innerHTML = `Practice ${selectElement.value}`;

  document.getElementById("contentField").placeholder =
    "Click 'Begin' below to generate " +
    contentName +
    " or just update manually here.";
  originalContent = content;
}

function removeParams(url) {
  let urlObj = new URL(url);
  return urlObj.searchParams.delete("share");
}

function checkParams(url) {
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;
  formFields.forEach((field) => {
    if (field.closest("div").offsetParent !== null) {
      if (field.value.trim() === "") {
        allFieldsFilled = false;
        field.classList.add("is-invalid"); // Highlight the empty field
      } else {
        field.classList.remove("is-invalid"); // Remove highlight if filled
      }
    }
  });
}

function testUrl(url) {
  window.open(url, "_blank");
}

function redirectToUrl(url) {
  let newUrl = new URL(url);
  let newParams = new URLSearchParams(newUrl.search);
  if (newParams.has("training")) {
    window.location.href = trainingUrl;
  } else {
    const formFields = document.querySelectorAll(".params");
    let allFieldsFilled = true;
    formFields.forEach((field) => {
      if (field.closest("div").offsetParent !== null) {
        if (field.value.trim() === "") {
          allFieldsFilled = false;
          field.classList.add("is-invalid");
        } else {
          field.classList.remove("is-invalid");
        }
      }
    });

    if (allFieldsFilled) {
      let currentParams = new URLSearchParams(window.location.href);
      if (currentParams.has("share")) {
        window.location.href = shareUrl;
      } else if (newParams.has("training")) {
        window.location.href = trainingUrl;
      } else if (!newParams.has("share") && !newParams.has("training")) {
        window.location.href = regularUrl;
      } else {
        console.error("URL input is empty");
      }
    }
  }
}
function redirectToTraining(url) {
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;
  formFields.forEach((field) => {
    if (field.closest("div").offsetParent !== null) {
      if (field.value.trim() === "") {
        allFieldsFilled = false;
        field.classList.add("is-invalid");
      } else {
        field.classList.remove("is-invalid");
      }
    }
  });

  if (allFieldsFilled) {
    let currentParams = new URLSearchParams(window.location.href);
    if (currentParams.has("share")) {
      window.location.href = shareUrl;
    } else if (!currentParams.has("share")) {
      window.location.href = regularUrl;
    } else {
      console.error("URL input is empty");
    }
  } else {
    alert("Please fill out all required fields.");
  }
}

function begin(transcript) {
  let currentParams = new URLSearchParams(window.location.href);
  transcriptText = transcript;
  document.getElementById("transcript").innerHTML = "";
  window.scrollTo(0, document.body.scrollHeight);
  const buttons = document.querySelectorAll('#submitTo input[type="submit"]');
  let firstButton = buttons[0];
  if (
    buttons.length > 1 &&
    (currentParams.has("guest") || !currentParams.has("share"))
  ) {
    firstButton = buttons[1];
  }
  firstButton.disabled = false;
  if (firstButton) {
    firstButton.click();
  }
  document.getElementById("prompt").innerHTML = "";
}

function copyUrl() {
  var urlInput = document.getElementById("urlInput");
  navigator.clipboard
    .writeText(urlInput.value)
    .then(function () {
      var urlCopyButton = document.getElementById("urlCopy");
      var tooltip = new bootstrap.Tooltip(urlCopyButton);
      urlCopyButton.setAttribute("data-bs-original-title", "Copied!");
      tooltip.show();
      setTimeout(function () {
        urlCopyButton.setAttribute("data-bs-original-title", "");
        tooltip.hide();
      }, 1000);
    })
    .catch(function (err) {
      console.error("Failed to copy: ", err);
    });
}

function beginTraining() {
  var urlInput = document.getElementById("urlInput").value;
  window.open(urlInput, "_blank");
}

function meet() {
  training = false;
  document.getElementById("profile").classList.remove("active", "show");
  document.getElementById("profile-tab").classList.remove("active");
  document.getElementById("share").classList.add("active", "show");
  document.getElementById("begin").style.removeProperty("display");
  document.getElementById("backToProfile").style.removeProperty("display");
  document.getElementById("allContent").style.display = "none";
  document.getElementById("allUrl").style.display = "none";
  document.getElementById("navTabs").style.display = "none";
}

function train() {
  training = true;
  selectedContext = document.getElementById("contextSelect").value;
  updateUrl(selectedContext.toLowerCase());

  switch (selectedContext) {
    case "Interview":
      redirectToUrl(trainingUrl);
      break;

    case "Meet":
      redirectToUrl(trainingUrl);
      break;

    case "Date":
      redirectToUrl(trainingUrl);
      break;

    case "Debate":
      redirectToUrl(trainingUrl);
      break;
    case "Adventure":
      redirectToUrl(trainingUrl);
      break;

    default:
      console.log("Unknown context: " + selectedContext);
      break;
  }
}

function toggleTraining() {
  console.log("Toggling training button");
  const currentContent = document.getElementById("contentField").value;
  const saveButton = document.getElementById("save");
  const meetButton = document.getElementById("meetProxy");
  const testButton = document.getElementById("testProxy");
  const trainButton = document.getElementById("beginTraining");

  saveButton.classList.remove("btn-success");

  if (currentContent !== originalContent) {
    saveButton.disabled = false;
  } else {
    saveButton.disabled = true;
  }

  if (currentContent.trim() === "") {
    testButton.disabled = true;
  } else {
    testButton.disabled = false;
  }
}

function backToProfile() {
  training = false;
  updateUrl(document.getElementById("contextSelect").value.toLowerCase());
  document.getElementById("profile").classList.add("active", "show");
  document.getElementById("profile-tab").classList.add("active");
  document.getElementById("share").classList.remove("active", "show");
  document.getElementById("share-tab").classList.remove("active");
  document.getElementById("backToProfile").style.display = "none";
  document.getElementById("begin").style.display = "none";
  document.getElementById("allContent").style.removeProperty("display");
  document.getElementById("allUrl").style.removeProperty("display");
  document.getElementById("navTabs").style.removeProperty("display");
}

function openUrlInNewTab() {
  var urlInput = document.getElementById("urlInput").value;
  window.open(urlInput, "_blank");
}

function tryToolTip() {
  var tryButton = document.getElementById("begin");
  var tooltip = new bootstrap.Tooltip(tryButton);

  tooltip.show();
  setTimeout(function () {
    tooltip.hide();
    tooltip.dispose();
    tryButton.setAttribute("data-bs-original-title", "Update Fields");
  }, 2000);
}

function processParameters(url) {
  let currentUrl = new URL(window.location.href);
  let currentParams = new URLSearchParams(currentUrl.search);

  let newUrl = new URL(regularUrl);
  let newParams = new URLSearchParams(newUrl.search);

  training = url
    ? newParams.has("training")
    : currentParams.has("training") || (contentId === "meet" && content === "");
  updateUrl(document.getElementById("contextSelect").value.toLowerCase());
  let context = document.getElementById("contextSelect").value;

  let modalElement = document.getElementById("settingsModal") || "";
  let settingsModal =
    bootstrap.Modal.getInstance(modalElement) ||
    new bootstrap.Modal(modalElement);
  let nameInput = document.getElementById("nameInput").value;
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;

  formFields.forEach((field) => {
    if (field.id === "nameInput") {
      return;
    }
    if (field.closest("div").offsetParent !== null) {
      if (field.value.trim() === "") {
        allFieldsFilled = false;
      } else {
      }
    }
  });

  function fieldLogic() {
    if (training === true) {
      beginTraining(trainScript);
    } else if (tutorial === true) {
      tutorial = true;
      begin(transcriptText);
      settingsModal.hide();
    } else if (
      !allFieldsFilled ||
      (!nameInput && !currentParams.has("guest"))
    ) {
      settingsModal.show();
    } else {
      settingsModal.hide();

      let submitAsSelect = document.getElementById("submitAs");
      let nameOption = submitAsSelect.querySelector('option[value="You"]');

      if (nameOption && !currentParams.has("guest")) {
        nameOption.value = nameInput;
        nameOption.textContent = nameInput;
      } else {
        nameOption.value = proxyName;
        nameOption.textContent = proxyName;
      }

      begin(transcriptText);
    }
  }

  switch (context) {
    case "Meet":
      transcriptText = "Introduce yourself to " + proxyName + ".";
      trainScript = transcriptText;
      fieldLogic();

      break;

    case "Interview":
      const roleInput = document.getElementById("roleInput").value
        ? document.getElementById("roleInput").value + " position"
        : "position";

      const orgInput = document.getElementById("orgInput").value
        ? document.getElementById("orgInput").value
        : " your company";

      trainScript = ` ${proxyName} is interviewing for a ${roleInput} at ${orgInput}. Begin the interview:`;

      transcriptText = ` You are interviewing for a ${roleInput}. Introduce yourself by name to ${nameInput} from ${orgInput}:`;

      fieldLogic();

      break;

    case "Date":
      trainScript = ` You are on a date with ${proxyName}. Introduce yourself and try to get to know what they are looking for in a partner.`;

      transcriptText = ` You are on a date with ${nameInput}. Introduce yourself and try to get to know what they are looking for in a partner.`;

      break;

    case "Debate":
      var topicInput = document.getElementById("topicInput").value;
      trainScript = ` You are debating ${proxyName} regarding ${topicInput}. Begin the debate by expressing your position.`;
      transcriptText = ` You are debating ${nameInput} regarding ${nameInput}. Begin the debate by expressing your position.`;

      fieldLogic();

      break;

    case "Adventure":
      var topicInput = document.getElementById("topicInput").value;
      trainScript = ` You are in the middle of an adventure when ${proxyName} suddenly joins. Greet ${proxyName}, explain the mission and ask for help.`;
      transcriptText = ` You are in the middle of an adventure when ${nameInput} suddenly joins. Greet ${nameInput}, explain the mission and ask for help.`;

      fieldLogic();

      break;
  }

  if (context.alias === "CT") {
    laughLength = 0;
    updateAvatar("Stav", "friendly");
    transcriptText = "Begin podcast.";
    begin(transcriptText);
  }
}

function beginTraining(transcriptText) {
  settingsModal.hide();

  const submitAs = document.getElementById("submitAs");
  const submitTo = document.getElementById("submitTo");
  submitAs.innerHTML = "";

  nameOption = document.createElement("option");
  nameOption.value = proxyName;
  nameOption.textContent = proxyName;

  submitAs.appendChild(nameOption);
  

  function removeButtonByValue(buttonGroupId, buttonValue) {
    const buttonGroup = document.getElementById(buttonGroupId);
    const buttons = buttonGroup.querySelectorAll('input[type="submit"]');
  
    buttons.forEach(button => {
      if (button.value === buttonValue) {
        buttonGroup.removeChild(button);
      }
    });
  }
  
  // Example usage
  removeButtonByValue("submitTo", proxyName);

  const hiddenButton = document.querySelector(
    'input[name="go"][type="submit"][style*="display: none;"]'
  );

  if (hiddenButton) {
    const parentElement = hiddenButton.parentNode;
    parentElement.removeChild(hiddenButton);
  }

  begin(transcriptText);
}

function doneTyping() {
  submitAs = document.getElementById("submitAs").value;
  if (submitAs in proxies) {
    updateAvatar(submitAs, "speak");
  } else {
    updateAvatar(avatar, "intrigued");
  }
  avatar = document.getElementById("submitAs").value;

  updateAvatar(avatar, "friendly");
}

function extractName(userMessage) {
  avatar = userMessage.split(":")[0].trim();
  updateAvatar(avatar, "intrigued");
}

function decodeAndEncode(value) {
  try {
    value = decodeURIComponent(value);
  } catch (e) {}
  return encodeURIComponent(value);
}

document
  .querySelectorAll("#addProxySelect .form-check-input")
  .forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      updateUrl(document.getElementById("contextSelect").value.toLowerCase());
    });
  });

function alpha(e) {
  var k;
  document.all ? (k = e.keyCode) : (k = e.which);
  return (
    (k > 64 && k < 91) ||
    (k > 96 && k < 123) ||
    k == 8 ||
    k == 32 ||
    (k >= 48 && k <= 57)
  );
}

function selectProxyBasedOnContext(context) {
  const contextToProxyMap = {
    Interview: ["Amy"],
    Debate: ["Donnie"],
    Date: [],
    Meet: ["Shadow", "Blaze"],
    Adventure: ["Rick", "Snake"],
  };

  const allCheckboxes = document.querySelectorAll("input.form-check-input");
  allCheckboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  const checkboxValues = contextToProxyMap[context];

  // Explicitly handle the "Date" context to deselect all checkboxes
  if (context === "Date") {
    let proxyInput = document.getElementById("proxyInput");
    proxyInput.value = "Select a date...";
    
    updateMeetProxyButtonState();
    return; // All checkboxes are already deselected
  }

  if (checkboxValues && checkboxValues.length > 0) {
    checkboxValues.forEach((checkboxValue) => {
      const checkbox = document.querySelector(
        `input.form-check-input[value="${checkboxValue}"]`
      );
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change"));
      }
    });
  }

  updateMeetProxyButtonState();
}

function updateMeetProxyButtonState() {
  const allCheckboxes = document.querySelectorAll("input.form-check-input");
  const meetProxyButton = document.getElementById("meetProxy");

  const anyChecked = Array.from(allCheckboxes).some(checkbox => checkbox.checked);

  if (meetProxyButton) {
    meetProxyButton.disabled = !anyChecked;
  }
}

function updateUrl(context) {
  const newProxy = document.getElementById("proxySelect").value;
  let url = window.location.origin + "/" + context.replace(/\s/g, "");
  let params = new URLSearchParams();
  let nameInput = document.getElementById("nameInput");

  if (nameInput && nameInput.value) {
    params.append("name", nameInput.value);
  }
  const checkboxes = document.querySelectorAll(
    "#addProxyDropdown .form-check-input:checked"
  );
  guests = [];
  checkboxes.forEach(function (checkbox) {
    guests.push(checkbox.value);
  });

  let guestDisplay = "Select Proxies";

  if (guests.length === 1) {
    guestDisplay = `${guests[0]}`;
  } else if (guests.length === 2) {
    guestDisplay = `${guests[0]} and ${guests[1]}`;
  } else if (guests.length > 2) {
    guestDisplay = `${guests.slice(0, -1).join(", ")} and ${guests.slice(-1)}`;
  } else {
    guestDisplay = "Select Proxies";
  }

  let guestNamesSet = new Set(
    Array.from(checkboxes).map(function (checkbox) {
      return checkbox.value;
    })
  );

  params.delete("guest");

  if (guestNamesSet.size > 0) {
    let proxyInput = document.getElementById("proxyInput");
    proxyInput.value = guestDisplay;
    params.append("guest", Array.from(guestNamesSet).join(","));
  }

  switch (context) {
    case "interview":
      var roleInput = document.getElementById("roleInput");
      var orgInput = document.getElementById("orgInput");
      if (roleInput && roleInput.value) {
        params.append("role", roleInput.value);
      }
      if (orgInput && orgInput.value) {
        params.append("org", orgInput.value);
      }

      break;

    case "date":
      //tbd
      break;

    case "meet":
      //tbd
      break;

    case "debate":
      var topicInput = document.getElementById("topicInput");
      if (topicInput && topicInput.value) {
        params.append("topic", topicInput.value);
      }
      break;

    case "adventure":
      //tbd
      break;
  }

  if (isTtsEnabled) {
    params.append("voice", "true");
  }

  if (document.getElementById("urlInput")) {
    function replaceSubdomain(url, newSubdomain) {
      var urlObj = new URL(url);
      var hostnameParts = urlObj.hostname.split(".");
      if (hostnameParts.length > 1) {
        hostnameParts[0] = newSubdomain;
      } else {
        hostnameParts.unshift(newSubdomain);
      }
      urlObj.hostname = hostnameParts.join(".");
      return urlObj.toString();
    }

    var newUrl = replaceSubdomain(url, newProxy);
    var queryString = params.toString().replace(/\+/g, " ");

    if (queryString) {
      regularUrl = newUrl + "?" + queryString;
    } else {
      regularUrl = newUrl;
    }

    var paramsWithoutGuests = new URLSearchParams();
    params.forEach((value, key) => {
      if (key !== "guest") {
        paramsWithoutGuests.append(key, value);
      }
    });

    var queryStringWithoutGuests = paramsWithoutGuests
      .toString()
      .replace(/\+/g, " ");

    shareUrl = newUrl + "?" + queryStringWithoutGuests + "&share";
    trainingUrl = newUrl + "?training=true&" + queryString;
    document.getElementById("urlInput").value = shareUrl;
  }
}

document
  .querySelectorAll("#addProxySelect .form-check-input")
  .forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      updateUrl(document.getElementById("contextSelect").value.toLowerCase());
    });
  });

function handleSelectChange(select) {
  if (select.value === "other") {
    document.getElementById("customProxyInput").style.display = "block";
  } else {
    document.getElementById("customProxyInput").style.display = "none";
    addButton(select, select.value);
    updateUrl(document.getElementById("contextSelect").value.toLowerCase());
  }
}

function addButton(buttonElement, option) {
  const buttonNameInput = document.getElementById("buttonName");
  const buttonName = option;

  if (!buttonName) {
    alert("Please enter a name.");
    return;
  }

  const inputContainer = document.getElementById("inputContainer");
  const checkboxContainer = document.getElementById("hostButtons");
  const checkboxSelect = document.getElementById("addProxySelect");

  if (buttonElement) {
    buttonElement.classList.add("disabled");
  }

  const formCheckDiv = document.createElement("div");
  formCheckDiv.setAttribute("class", "form-check");

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.setAttribute("id", buttonName);
  checkbox.setAttribute("class", "form-check-input");
  checkbox.checked = true;

  const tag = "button-" + checkboxContainer.children.length;
  checkbox.setAttribute("data-tag", tag);

  const label = document.createElement("label");
  label.setAttribute("for", buttonName);
  label.setAttribute("class", "form-check-label");
  label.textContent = buttonName;

  formCheckDiv.appendChild(checkbox);
  formCheckDiv.appendChild(label);

  checkboxContainer.appendChild(formCheckDiv);

  const simulateLabel = document.getElementById("simulate");
  if (simulateLabel.style.display === "none") {
    simulateLabel.style.display = "block";
  }
  const changeEvent = new Event("change", { bubbles: true });
  checkbox.dispatchEvent(changeEvent);
}

// Event Listeners

document.getElementById("patreonButton").addEventListener("click", function () {
  window.open("https://patreon.com/Instinite", "_blank");
});

document.querySelector("#submitTo").addEventListener("click", function (event) {
  if (event.target.tagName === "INPUT") {
    var tag = event.target.dataset.tag;

    // Send an event to Google Analytics
    gtag("event", "click", {
      event_category: "Button",
      event_label: tag,
    });
  }
});

document.getElementById("ttsButton").addEventListener("click", toggleTtsState);

document
  .getElementById("userInput")
  .addEventListener("keydown", function (event) {
    if (previousResponse && previousResponse !== currentPrompt) {
      prompt.textContent = previousResponse;
      currentPrompt = previousResponse;
      prompt.innerHTML += transcriptButtonHtml;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      clearTimeout(typingTimer);

      let button = document.querySelector(
        `#submitTo input[type="submit"][value="${previousAvatar}"]`
      );

      if (!button || button.disabled) {
        let buttons = document.querySelectorAll(
          '#submitTo input[type="submit"]'
        );

        for (let btn of buttons) {
          if (!btn.disabled) {
            button = btn;
            break;
          }
        }
      }

      if (button) {
        button.click();
      }
    }
  });

document.getElementById("userInput").addEventListener("keypress", function () {
  clearTimeout(typingTimer);
  submitAs = document.getElementById("submitAs").value;
  if (submitAs in proxies) {
    updateAvatar(submitAs, "speak");
  } else {
    updateAvatar(avatar, "intrigued");
  }
  typingTimer = setTimeout(doneTyping, doneTypingInterval);
});

document.getElementById("userInput").addEventListener("input", function () {
  submitAs = document.getElementById("submitAs").value;

  if (submitAs in proxies) {
    botResponse.textContent = document.getElementById("userInput").value;
    toggleResponseContainer();
  }
  if (response) {
    document.getElementById("prompt").textContent = response;
  }

  let submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => {
    if (button.value === submitAs) {
      button.disabled = true;
    } else {
      button.disabled = false;
    }
  });
});

document.getElementById("submitAs").addEventListener("change", function () {
  if (isRequestPending) return;
  if (speaking) return;
  updateAvatar(document.getElementById("submitAs").value, "intrigued");
  botResponse.textContent = document.getElementById("userInput").value;
  toggleResponseContainer();
});

document
  .getElementById("feedbackForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    var feedback = document.getElementById("feedbackText").value;
    console.log("Feedback:", feedback);
    fetch("/send-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feedback: feedback }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok.");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Response data:", data);
        feedbackModal.hide();

        document.getElementById("feedbackForm").reset();
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  });
async function initialize() {
  try {
    await preloadImages(proxies);

    submitButton = document.querySelector('.btn-group input[type="submit"]');
    submitAsElement = document.getElementById("submitAs");
    promptElement = document.getElementById("prompt");
    const myTab = document.getElementById("myTab");
    const tabDescription = document.getElementById("tabDescription");

    function updateTabDescription(tabId) {
      switch (tabId) {
        case "practice-tab":
          tabDescription.innerText = `Interact with other proxies as ${proxyName} and automatically refine your profile based on your input.`;
          break;
        case "share-tab":
          tabDescription.innerText = `Copy a custom URL and share with others to interact with ${proxyName}. Settings will be inaccessible from this URL.`;
          break;
        default:
          tabDescription.innerText = "";
      }
    }

    const initialActiveTab = myTab.querySelector(".nav-link.active");
    if (initialActiveTab) {
      updateTabDescription(initialActiveTab.id);
    }

    myTab.addEventListener("shown.bs.tab", function (event) {
      const activatedTab = event.target; // Newly activated tab
      updateTabDescription(activatedTab.id);
    });

    if (context.alias !== "CT") {
      const createProxyLink = document.getElementById("createProxyLink");
      const currentUrl = new URL(window.location.href);
      currentUrl.pathname = "/create";
      createProxyLink.href = currentUrl.toString();

      settingsModal = new bootstrap.Modal(
        document.getElementById("settingsModal")
      );
      document
        .getElementById("proxySelect")
        .addEventListener("change", function () {
          const selectedValue = this.value;
          if (selectedValue === "createNewProxy") {
            window.open(createProxyLink.href, "_blank");
            this.selectedIndex = 0;
          }
        });
    }

    function hideAlert(alertElement) {
      alertElement.classList.remove("show");
      alertElement.style.zIndex = "";
    }

    document
      .querySelector("#contextUpdated .btn-close")
      .addEventListener("click", function () {
        hideAlert(document.getElementById("contextUpdated"));
      });

    const inputElement = document.getElementById("userInput");
    const imageElement = document.getElementById("botImage");
    inputElement.addEventListener("focus", function () {
      imageElement.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    submitAs = submitAsElement ? submitAsElement.value : null;
    submitTo = submitButton ? submitButton.value : "Guest";

    if (submitAs in context.submitToOptions) {
      avatar = submitAs;
    } else {
      avatar = submitTo;
    }

    hasPersonality = !proxies[submitTo].meet ? false : true;
    hasDate = !proxies[submitTo].date ? false : true;
    hasInterview = !proxies[submitTo].debate ? false : true;

    feedbackModal = new bootstrap.Modal(
      document.getElementById("feedbackModal")
    );
    saveButton = document.getElementById("save");

    if (siteId === "custom" || context.alias === "CT") {
      doneTypingInterval = 1000;
    } else {
      doneTypingInterval = 2000;
    }

    updateAvatar(Object.keys(proxies)[0], "friendly");
    const botResponse = document.getElementById("botResponse");
    botResponse.textContent = ``;

    const dateElement = document.getElementById("date");
    const now = new Date();
    now.setFullYear(now.getFullYear() - 4); // Subtract four years
    if (context.alias !== "CT") {
      // Run on select change
      document
        .getElementById("contextSelect")
        .addEventListener("change", updateContent);

      // Enable save button on input if contentField is different from original content
      document
        .getElementById("contentField")
        .addEventListener("input", function () {
          const currentContent = document.getElementById("contentField").value;
          const saveButton = document.getElementById("save");
          saveButton.classList.remove("btn-success");
          if (currentContent !== originalContent) {
            saveButton.disabled = false;
          } else {
            saveButton.disabled = true;
          }
        });

      if (window.location.href.includes("voice=true")) {
        console.log("Voice is enabled");
        toggleTtsState();
      }

      const hostButtons = document.getElementById("hostButtons");

      hostButtons.addEventListener("change", function (e) {
        updateUrl(document.getElementById("contextSelect").value.toLowerCase());
      });
      const contentField = document.getElementById("contentField");
      if (contentField) {
        contentField.addEventListener("input", toggleTraining);
      }
      selectProxyBasedOnContext(document.getElementById("contextSelect").value);

      // Parameters
      // ----------------------------
      var urlParams = new URLSearchParams(window.location.search);

      var name = decodeURIComponent(urlParams.get("name") || "");

      if (name) {
        document.getElementById("nameInput").value = name;
      }

      // Interview
      var role = decodeURIComponent(urlParams.get("role") || "");
      var org = decodeURIComponent(urlParams.get("org") || "");

      if (role) {
        document.getElementById("roleInput").value = role;
      }

      if (org) {
        document.getElementById("orgInput").value = org;
      }

      // Debate
      var topic = decodeURIComponent(urlParams.get("topic") || "");

      if (topic) {
        document.getElementById("topicInput").value = topic;
      }

      document.querySelectorAll("input.form-check-input").forEach((checkbox) => {
        checkbox.addEventListener("change", updateMeetProxyButtonState);
      });
    
      updateMeetProxyButtonState();
      updateContext();

      updateUrl(String(siteId));
      updateContent();
      processParameters();
      toggleTraining();
      document.body.classList.toggle("dark-mode");
    }
  } catch (error) {
    console.error("Error preloading images:", error);
  }
}
document.addEventListener("DOMContentLoaded", (event) => {
  initialize();
});

window.onload = function () {};
