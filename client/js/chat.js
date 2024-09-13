// const e = require("express");

// Config Section
let siteId = window.location.pathname.split("/")[1];

// Audio
let isVoiceLoading = false;
let speaking = false;
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let analyser = audioCtx.createAnalyser();
let globalAudio; // A global audio object
let isTtsEnabled = false;

// Avatars
let avatar, previousAvatar;
let typingTimer;
let doneTypingInterval;
let confusedTimer;
const thinkDelay = 2000;
let laughLength = 1500;
let laugh;
let laughs;
let isLaughing = false;

// Chat
let transcriptHtml = "Begin conversation.";
let transcriptText = "Begin conversation.";
let trainScript;
const transcriptButtonHtml = `<button class="btn" id="showFormBtn" data-bs-toggle="modal" data-bs-target="#transcriptModal"><i class="fas fa-file-alt"></i></button>`;
let isRequestPending = false;
let hosts;
let regularUrl;
let response;
let previousResponse = "";
let currentPrompt = "";
let submitButton;
let submitAsElement;
let promptElement;
let shareUrl;
let trainingUrl;
let trainingProgress = 0;

// Settings
let role;
let org;
let contentId;
let content;
let submitAs;
let submitTo;
let hasPersonality;
var settingsModal;
var feedbackModal;
let saveButton;
let training;
let tutorial;

// Image Management Functions
// --------------------------
function preloadImages(proxies) {
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

// Change
function updateAvatar(submit, reaction) {
  let avatar = "Guest";
  clearTimeout(typingTimer);
  let botImage = document.getElementById("botImage");
  let botContainer = document.querySelector(".bot-container"); // Parent div
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
      return;
    }

    if (!typeof proxy["laugh"]) {
      reaction = "joy";
    }
    let imagePath = proxy[reaction][0].url;
    // Set the background image of the parent div
    botContainer.style.backgroundImage = `url(${imagePath})`;
    botContainer.style.backgroundSize = "cover";

    // Update the image immediately
    botImage.src = imagePath;

    let submitButtons = document.querySelectorAll('input[type="submit"]');
    let submitAs = document.getElementById("submitAs").value;
    let inputField = document.getElementById("userInput");
    if (submitAs in proxies || !inputField.value.trim()) {
      submitButtons.forEach((button) => {
        button.disabled = button.value === avatar;
      });
    }

    let numProxies = Object.keys(proxies).length;
    // if (submitButtons.length < 2) {
    //   submitButtons.forEach((button) => {
    //     if (button.disabled) {
    //       button.style.display = "block";
    //     }
    //   });
    // } else {
    //   submitButtons.forEach((button) => {
    //     if (button.disabled) {
    //       button.style.display = "none";
    //     } else {
    //       button.style.display = "block";
    //     }
    //   });
    // }

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

      // Set a timer if needed for specific duration of laughter
    } else if (!proxy.laughSounds && emotion.toLowerCase() === "laugh") {
      updateAvatar(avatar, "joy".toLowerCase());
      botContainer.classList.add("laughing");

      setTimeout(() => {
        updateAvatar(avatar, "friendly"); // Reset the image after the laugh
        botContainer.classList.remove("laughing");
        resolve();
      }, laughLength);

      // Handle the case for avatars without laugh sounds
      // For example, setting a default image or different behavior
      // You can also set a default or smile image here if needed
    } else {
      updateAvatar(avatar, emotion.toLowerCase());
      resolve();
    }
  });
}

// TTS Functions
// -------------

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
    // Check if 'audioUrlWithAvatar' contains query parameters
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
      globalAudio.src = audioUrl; // Set new source only if it's different
      globalAudio
        .play()
        .catch((e) => console.error("Error attempting to play audio:", e));
    } else {
      globalAudio
        .play()
        .catch((e) => console.error("Error attempting to play audio:", e));
    }

    globalAudio.onplay = () => {
      // submitButtons.forEach(button => {
      //   button.disabled = true;
      // });
      updateImageBasedOnVolume(globalAudio);
    };
  }
}

// Turn off/on voice
function toggleTtsState() {
  console.log("Toggling voice state");
  isTtsEnabled = !isTtsEnabled;
  var icon = document.getElementById("ttsIcon");
  if (isTtsEnabled) {
    console.log("Voice is ON");
    icon.classList.replace("fa-volume-mute", "fa-volume-up");
    // Update URL
    let url = new URL(window.location.href);
    url.searchParams.set("voice", "true");
    history.pushState({}, "", url);
  } else {
    console.log("Voice is OFF");
    icon.classList.replace("fa-volume-up", "fa-volume-mute");

    // Update URL
    let url = new URL(window.location.href);
    url.searchParams.delete("voice");
    history.pushState({}, "", url);
  }
}

// Text to Speech conversion
async function textToSpeech(fullText, ttsText) {
  const voiceLoad = document.getElementById("voiceLoad");
  const botResponse = document.getElementById("botResponse");
  const audioControls = document.getElementById("audioControls");
  submitButtons = document.querySelectorAll('input[type="submit"]');

  // const playIcon = document.getElementById('playIcon');
  // const downloadIcon = document.getElementById('downloadIcon');

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

      var myModal = new bootstrap.Modal(
        document.getElementById("rateLimitModal"),
        {}
      );
      myModal.show();

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

    // Handle any errors that occur during playback
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
// ----------------------

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
  let newContent = content.replace(/<br>/g, "\n"); // Replace <br> tags with newline characters
  let htmlContent = content; // Keep <br> tags for HTML version

  // Retrieve avatar names from the HTML
  const submitAsOptions = Array.from(
    document.getElementById("submitAs").options,
    (opt) => opt.value
  );
  const submitToOptions = Array.from(
    document.getElementById("submitTo").querySelectorAll("input"),
    (input) => input.value
  );

  // Combine the arrays and remove duplicates
  const avatars = [...new Set([...submitAsOptions, ...submitToOptions])];

  // Dynamically highlight based on avatars in the configuration
  avatars.forEach((avatar) => {
    const regex = new RegExp(`(${avatar}):`, "g");
    htmlContent = htmlContent.replace(
      regex,
      `<span class="other ${avatar.toLowerCase()}">$1:</span>`
    );
    newContent = newContent.replace(regex, `$1:`); // Keep the avatar name for plain text
  });

  // Generate unique IDs for the audio controls
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
    console.log("Content already appended to transcript");
    return;
  } else {
    transcriptHtml += "<br>" + htmlContent;
    transcriptText += "\n" + newContent; // Assuming transcriptText is a variable holding the full transcript text
  }
}

// Hide/Reveal sppech bubble
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

// Send user input to the bot and return answer
async function askBot(event) {
  if (isRequestPending) return;
  if (speaking) return;
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

  audioControls.style.display = "none";
  isRequestPending = true;
  submitButtons = document.querySelectorAll('input[type="submit"]');
  submitTo = event instanceof Event ? event.submitter.value : null;
  avatar = submitTo in proxies ? submitTo : "Guest";

  const botResponse = document.getElementById("botResponse");

  // Get user input elements
  const userInputElem = document.getElementById("userInput");
  const submitAsElem = document.getElementById("submitAs");
  let submitAs = submitAsElem.value;
  const botImage = document.getElementById("botImage");
  let userInputValue = userInputElem.value;
  hosts = getHosts(avatar);
  const promptElement = document.getElementById("prompt");

  // Append the userInputValue with the clicked button name and a colon if submitTo is present
  if (userInputValue) {
    userInputValue = `${submitAs}: ${userInputValue}`;
    promptElement.textContent = userInputValue;
    promptElement.innerHTML += transcriptButtonHtml;
  }

  // Check if userInputValue is empty, if so use the last bot's response
  if (!userInputValue.trim()) {
    userInputValue = `${submitAs}: `;
    if (previousResponse) {
      promptElement.textContent = previousResponse;
      promptElement.innerHTML += transcriptButtonHtml;
    }
  }

  const trainingProgressElement = document.getElementById("trainingProgressBar");

  function updateProgressBar(progressPercentage) {

    trainingProgressElement.style.width = `${progressPercentage}%`;
    trainingProgressElement.setAttribute("aria-valuenow", progressPercentage);
    // trainingProgressElement.textContent = `${progressPercentage}%`;
  }

  console.log('Percent:', transcriptText.length / transcriptThreshold * 100);
  trainingProgress = transcriptText.length / transcriptThreshold * 100;

  // Clear the input field immediately after the function runs
  userInputElem.value = "";
  updateAvatar(avatar, "smile");
  // Set a timeout to update the bot image to thinking image
  confusedTimer = setTimeout(() => {
    updateAvatar(avatar, "confused");
    // botImage.src = "/img/" + avatar + "/think";
  }, thinkDelay);
  // Clear the botResponse and add a 'loading' class to it
  console.log("Transcript Length:", transcriptText.length);
  if (tutorial || training) {
    // console.log(trainingProgress)
    // updateProgressBar(trainingProgress)
    if(trainingProgress < 100){
    trainingProgressElement.textContent = `Training Progress: `+Math.floor(trainingProgress) + `%`;
    } else {
      trainingProgressElement.textContent = `Training Complete!`;
    }
  }
  if (
    transcriptText.length > transcriptThreshold &&
    // siteId === "meet" &&
    hasPersonality === false
  ) {
    document.getElementById("trainingProgressBar").innerText = "Updating Personality";
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

  // Make a POST request to the '/ask' endpoint with the user's input
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
        hosts: hosts,
        training: training,
        tutorial: tutorial,
      }),
    });
    

    const data = await fetchResponse.json();
    if (data.personalityUpdated) {
      rainingProgressElement.textContent = `Finished!`;
      settingsModal.show();
      document.getElementById("contentField").value = data.transcriptSummary;
      document.getElementById("toggleButton").style.display = "inline-block";
      // document.getElementById("trainingProgressBar").innerText = "Updating Personality";
      // setTimeout(() => {
      //   const contextUpdatedAlert = document.getElementById("contextUpdated");
      //   contextUpdatedAlert.classList.add("show");
      // }, 1000);

      proxies[Object.keys(proxies)[0]].meet = data.transcriptSummary;
      toggleTraining();
    }
    let avatar = data.answer.split(":")[0].trim();
    console.Object;
    // Clear the confusedTimer and update the botResponse with the data received
    clearTimeout(confusedTimer);
    let updatedText;
    if (data.answer.includes(":")) {
      updatedText = data.answer.split(":").slice(1).join(":").trim();
    } else {
      updatedText = data.answer;
    }

    updatedText = data.answer.split(":").slice(1).join(":").trim();



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
    // Update buttons when personality formed.
    // if (data.hasPersonality === true) {
    //   console.log("Proxy:", proxies);
    //   proxies["Creator"].hasPersonality = false;
    //   proxies[submitAs].hasPersonality = data.hasPersonality;
    //   let submitButtons = document.querySelectorAll('input[type="submit"]');
    //   submitButtons.forEach((button) => {
    //     if (button.value === submitAs) {
    //       button.disabled = false;
    //       button.style.display = "block";
    //     }
    //   });
    // }
    // console.log("Proxy:", submitAs, proxies[submitAs].hasPersonality);
    previousResponse = fetchedAnswer;
    previousAvatar = avatar;
    avatar = avatar in proxies ? avatar : "Guest";

    botResponse.classList.remove("loading");

    return previousAvatar;
  } catch (error) {
    // If there's an error, clear the confusedTimer and update the botResponse and bot image
    clearTimeout(confusedTimer);
    // botResponse.textContent = 'Error communicating with the bot.';
    (botResponse.innerHTML = "Error:"), error;
    // Sorry, I\'ve reached my monthly API budget. Come back in March. Also maybe possibly consider joining my <a href="https://patreon.com/Instinite?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink">Patreon</a> or buying me a <a href="https://www.buymeacoffee.com/jrnvldhs">coffee</a>?'

    botResponse.classList.remove("loading");
    botImage.src = "/img/logo.png";
    console.error("Error:", error);
    submitButtons = document.querySelectorAll('input[type="submit"]');
    isRequestPending = false;
    // Disable butons
    // submitButtons.forEach(button => {
    //   button.disabled = false;
    // }
    // );
  } finally {
    // enableSubmitButtons(); // Re-enable buttons on both success and failure
    isRequestPending = false;
  }
}

//Settings
//---------------------------------------------------------

function getHosts(currentSpeaker) {
  var checkboxes = document.querySelectorAll(
    '#hostButtons input[type="checkbox"]'
  );
  var hosts = [];
  checkboxes.forEach(function (checkbox) {
    if (checkbox.checked) {
      hosts.push(checkbox.id);
    }
  });

  // Remove the currentSpeaker from the hosts array
  hosts = hosts.filter((host) => host !== currentSpeaker);

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
  var context = document.getElementById("contextSelect").value;
  document.getElementById("interviewModal").style.display =
    context === "Interview" ? "block" : "none";
  // document.getElementById("dateModal").style.display =
  //   context === "Date" ? "block" : "none";
  document.getElementById("debateModal").style.display =
    context === "Debate" ? "block" : "none";
  var context = document.getElementById("contextSelect").value;
  const saveButton = document.getElementById("save");

  saveButton.disabled = true;

  // document.getElementById("save").innerText = "Save" + " " + contentId;
  // document.getElementById('meetModal').style.display = context === 'meet' ? 'block' : 'none';
}
// function showParams() {
//   document.getElementById("allUrl").style.display = "none";
//   document.getElementById("allContent").style.display = "none";
//   document.getElementById("navTabs").style.display = "none";
//   document.getElementById("begin").style.display = "block";
//   document.getElementById("profile").classList.remove("active");
//   document.getElementById("share").classList.add("active");
//   document.getElementById("profile").classList.remove("show");
//   document.getElementById("share").classList.add("show");
// }
let originalContent;
function updateContent() {
  var successMessage = document.getElementById("contextUpdated");
  const selectElement = document.getElementById("contextSelect");
  const contentId = selectElement.value.toLowerCase(); // 'small talk', 'interview', 'date', 'debate'
  const contentName = proxies[Object.keys(proxies)[0]][contentId + "Prompt"];

  // Content Name
  const yourName = proxies[Object.keys(proxies)[0]][contentId + "Name"];

  document.getElementById("yourName").innerText = yourName + ":";
  document.getElementById("simulate").innerText =
    "Simulate " + selectElement.value + ":";
  const content = proxies[Object.keys(proxies)[0]][contentId] || ""; // Fetch the content based on contentId

  // successMessage.style.display = "none"; // Hid success message
  let params = new URLSearchParams(window.location.href);
  if (params.has("share")) {
    document.getElementById("allUrl").style.display = "none";
    document.getElementById("allContent").style.display = "none";
    document.getElementById("toggleButton").style.display = "none";
    document.getElementById("addProxyDropdown").style.display = "none";


    // document.getElementById("guests").style.display = "none";
    // document.getElementById("navTabs").style.display = "none";
    // document.getElementById("begin").style.display = "block";
    // document.getElementById("profile").classList.remove("active");
    // document.getElementById("share").classList.add("active");
    // document.getElementById("profile").classList.remove("show");
    // document.getElementById("share").classList.add("show");
    // document.getElementById("backToProfile").style.display = "none";
    document.getElementById("yourName").innerText = "Your Name:";
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
    // var profileTab = new bootstrap.Tab(document.getElementById("profile-tab"));

    // // Activate the Profile tab
    // profileTab.show();
  }

  // Set the value of the hidden input and the textarea
  document.getElementById("contentIdField").value = contentId;

  document.getElementById("contentField").value = content;
  // toggleTraining();
  document.getElementById("contentId").innerHTML = `<b>${contentName}:</b>`;

  // document.getElementById("contextDescription").innerText = proxies[Object.keys(proxies)[0]][contentId+"Instructions"];

  document.getElementById("shareDescription").innerText = proxies[Object.keys(proxies)[0]][contentId+"Instructions"];

  // document.getElementById("begin").innerText =
  //   selectElement.value + " " + proxyName;

  // trainName = selectElement.value === "Meet" ? "Meeting" : selectElement.value;
  // document.getElementById("trainProxy").innerText = "Practice " + trainName;

  // document.getElementById("yourName").innerText =
  // selectElement.value + " " + proxyName +" as:";

  document.getElementById("meetProxy").innerHTML =
    selectElement.value + " " + proxyName;

  // document.getElementById("trainingContext").innerText =
  //   `${selectElement.value}:`;

  document.getElementById("contentField").placeholder =
    "Click 'Train' below to generate " +
    contentName +
    " or just update manually here.";
  // document.getElementById("save").innerText = "Save " + contentName;
  // document.getElementById("meetProxy").innerText = "Meet " + proxy;

  // Store the original content
  originalContent = content;
}

function removeParams(url) {
  // Create a URL object
  let urlObj = new URL(url);
  // Remove the 'share' parameter if it exists
  return urlObj.searchParams.delete("share");
}

function checkParams(url) {
  // Get all visible form fields
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;

  // Check if all visible fields are filled out
  formFields.forEach((field) => {
    // Check if the field's parent div is visible
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


// Redirects to URL with new field parameters
function redirectToUrl(url) {
  let newUrl = new URL(url);
  let newParams = new URLSearchParams(newUrl.search);
  if (newParams.has("training")) {
    window.location.href = trainingUrl;
  } else {
    // Get all visible form fields
    const formFields = document.querySelectorAll(".params");
    let allFieldsFilled = true;

    // Check if all visible fields are filled out
    formFields.forEach((field) => {
      // Check if the field's parent div is visible
      if (field.closest("div").offsetParent !== null) {
        if (field.value.trim() === "") {
          allFieldsFilled = false;
          field.classList.add("is-invalid"); // Highlight the empty field
        } else {
          field.classList.remove("is-invalid"); // Remove highlight if filled
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
    } else {
      // alert("Please fill out all required fields.");
    }
  }
}

// Redirects to URL with new field parameters
function redirectToTraining(url) {
  // Get all visible form fields
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;

  // Check if all visible fields are filled out
  formFields.forEach((field) => {
    // Check if the field's parent div is visible
    if (field.closest("div").offsetParent !== null) {
      if (field.value.trim() === "") {
        allFieldsFilled = false;
        field.classList.add("is-invalid"); // Highlight the empty field
      } else {
        field.classList.remove("is-invalid"); // Remove highlight if filled
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
  urlInput.select();
  document.execCommand("copy");

  // Initialize the tooltip
  var urlCopyButton = document.getElementById("urlCopy");
  var tooltip = new bootstrap.Tooltip(urlCopyButton);

  // Show the tooltip
  tooltip.show();

  // Hide the tooltip after 2 seconds and reset the title
  setTimeout(function () {
    tooltip.hide();
    // tooltip.dispose();
    urlCopyButton.setAttribute("data-bs-original-title", "Copied!");
  }, 2000);
}

function beginTraining() {
  var urlInput = document.getElementById("urlInput").value;
  window.open(urlInput, "_blank");
}

function meet() {
  training = false;
  // Remove active and show classes from the current active tab and content
  document.getElementById("profile").classList.remove("active", "show");
  document.getElementById("profile-tab").classList.remove("active");

  // Add active and show classes to the new tab content
  document.getElementById("share").classList.add("active", "show");

  // document.getElementById("share-tab").classList.add("active");
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
      // addButton(null, "Donnie");
      trainingUrl = trainingUrl+"guest=Donnie"
      redirectToUrl(trainingUrl);
      break;

    case "Meet":
      // addButton(null, "Jarno");
      trainingUrl = trainingUrl+"guest=Jarno"
      redirectToUrl(trainingUrl);
      break;

    case "Date":
      // addButton(null, "Shadow");
      trainingUrl = trainingUrl+"guest=Shadow"
      redirectToUrl(trainingUrl);
      break;

    case "Debate":
      // addButton(null, "Donnie");
      trainingUrl = trainingUrl+"guest=Donnie"
      redirectToUrl(trainingUrl);
      break;

    default:
      console.log("Unknown context: " + selectedContext);
      break;
  }
  // // Remove active and show classes from the current active tab and content
  // document.getElementById("profile").classList.remove("active", "show");
  // document.getElementById("profile-tab").classList.remove("active");

  // // Add active and show classes to the new tab content
  // document.getElementById("share").classList.add("active", "show");

  // // document.getElementById("share-tab").classList.add("active");
  // document.getElementById("begin").style.removeProperty("display");
  // document.getElementById("backToProfile").style.removeProperty("display");
  // document.getElementById("allContent").style.display = "none";
  // document.getElementById("allUrl").style.display = "none";
  // document.getElementById("navTabs").style.display = "none";
}

// Function to toggle buttons based on contentField value
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
    // saveButton.style.visibility = "visible";
  } else {
    saveButton.disabled = true;
    // saveButton.style.visibility = "hidden";
  }

  if (currentContent.trim() === "") {
    trainButton.style.display = "block";
    meetButton.style.display = "none";
    testButton.disabled = true;
  } else {
    trainButton.style.display = "none";
    meetButton.style.display = "block";
    testButton.disabled = false;
  }
}

function backToProfile() {
  // Remove active and show classes from the current active tab and content
  training = false;
  updateUrl(document.getElementById("contextSelect").value.toLowerCase());
  document.getElementById("profile").classList.add("active", "show");
  document.getElementById("profile-tab").classList.add("active");

  // Add active and show classes to the new tab content
  document.getElementById("share").classList.remove("active", "show");
  document.getElementById("share-tab").classList.remove("active");
  document.getElementById("backToProfile").style.display = "none";
  document.getElementById("begin").style.display = "none";

  document.getElementById("allContent").style.removeProperty("display");
  document.getElementById("allUrl").style.removeProperty("display");
  document.getElementById("navTabs").style.removeProperty("display");

  // document.getElementById("begin").style.display = "block";
}

// function showBegin() {
//  document.getElementById("allUrl").style.display = "none";
// }

// // Function to hide the 'begin' element
// function hideBegin() {
//   document.getElementById("allUrl").style.display = "block";
// }

// const tabLinks = document.querySelectorAll('.nav-link');
// tabLinks.forEach(link => {
//   if (link.id !== 'share-tab') {
//     link.addEventListener('shown.bs.tab', hideBegin);
//   }
// });

// function cancel() {
//   window.location.href = regularUrl;
// }

function openUrlInNewTab() {
  var urlInput = document.getElementById("urlInput").value;
  window.open(urlInput, "_blank");
}

function tryToolTip() {
  // Initialize the tooltip
  var tryButton = document.getElementById("begin");
  var tooltip = new bootstrap.Tooltip(tryButton);

  // Show the tooltip
  tooltip.show();

  // Hide the tooltip after 2 seconds and reset the title
  setTimeout(function () {
    tooltip.hide();
    tooltip.dispose();
    tryButton.setAttribute("data-bs-original-title", "Update Fields");
  }, 2000);
}

function processParameters(url) {
  var currentUrl = new URL(window.location.href);
  var currentParams = new URLSearchParams(currentUrl.search);

  var newUrl = new URL(regularUrl);
  var newParams = new URLSearchParams(newUrl.search);

  // check if personality is available.

  training = url
    ? newParams.has("training")
    : currentParams.has("training") || (contentId === "meet" && content === "");
  updateUrl(document.getElementById("contextSelect").value.toLowerCase());
  var context = document.getElementById("contextSelect").value;

  var modalElement = document.getElementById("settingsModal") || "";
  var settingsModal =
    bootstrap.Modal.getInstance(modalElement) ||
    new bootstrap.Modal(modalElement);
  var nameInput = document.getElementById("nameInput").value;

  // Get all visible form fields
  const formFields = document.querySelectorAll(".params");
  let allFieldsFilled = true;

  // Check if all visible fields are filled out
  formFields.forEach((field) => {
    // Skip the nameInput field
    if (field.id === "nameInput") {
      return;
    }
    // Check if the field's parent div is visible
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

      var submitAsSelect = document.getElementById("submitAs");
      var nameOption = submitAsSelect.querySelector('option[value="You"]');

      // Allow no name if guest is selected
      if (nameOption && !currentParams.has("guest")) {
        nameOption.value = nameInput;
        nameOption.textContent = nameInput;
      } else {
        nameOption.value = proxyName;
        nameOption.textContent = proxyName;
      }
      transcriptText = "Introduce yourself to " + nameInput + ".";
      begin(transcriptText);
    }
  }

  switch (context) {
    case "Meet":
      transcriptText = "Introduce yourself to " + proxyName + ".";
      trainScript = "Begin coversation.";

      fieldLogic();

      break;

    case "Interview":
      var roleInput = document.getElementById("roleInput").value;
      var orgInput = document.getElementById("orgInput").value;

      trainScript = "You are interviewing for a job. Begin interview:";
      transcriptText =
        "You are interviewing for the role of " +
        roleInput +
        ". Introduce yourself by name to " +
        nameInput +
        " from " +
        orgInput +
        ":";

      fieldLogic();

      break;

    case "Date":
      trainScript =
        "You are on a date. Introduce yourself and try to get to know what they are looking for in a partner.";

      transcriptText =
        "You are on a date with " +
        nameInput +
        ". Say hello and say something slick.";

      break;

    case "Debate":
      var topicInput = document.getElementById("topicInput").value;
      trainScript = "You are debating " + proxyName + ".";
      transcriptText =
        "You are debating " +
        nameInput +
        " on the topic of " +
        topicInput +
        ".";

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
  submitAs.innerHTML = "";

  nameOption = document.createElement("option");
  nameOption.value = proxyName;
  nameOption.textContent = proxyName;

  // Add the new option to the select element
  submitAs.appendChild(nameOption);

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
  // avatar = document.getElementById('submitAs').value;
  // updateAvatar(avatar, 'smile')
}

function extractName(userMessage) {
  // Extract the name from the user's message, assuming format "Name: message"
  avatar = userMessage.split(":")[0].trim();
  updateAvatar(avatar, "smile");

  // document.getElementById('botImage').src = "/img/" + avatar + "/smile";
}

function decodeAndEncode(value) {
  try {
    value = decodeURIComponent(value);
  } catch (e) {}
  return encodeURIComponent(value);
}

function updateUrl(context) {
  var url = window.location.origin + "/" + context.replace(/\s/g, "");
  var params = new URLSearchParams();
  var nameInput = document.getElementById("nameInput");
  // if (training === true) {
  //   params.append("training", "true");
  //   params.delete("guests");
  // }
  if (nameInput && nameInput.value) {
    params.append("name", nameInput.value);
  }

  // Add checked names as a single "guest" parameter
  var checkboxes = document.querySelectorAll(
    "#hostButtons .form-check-input:checked"
  );

  // Use a Set to store unique guest names
  var guestNamesSet = new Set(
    Array.from(checkboxes).map(function (checkbox) {
      return checkbox.id;
    })
  );

  // Remove any existing "guest" parameter to ensure it's replaced
  params.delete("guest");
  
  if (guestNamesSet.size > 0) {
    params.append("guest", Array.from(guestNamesSet).join(","));
  }

  switch (context) {
    case "interview":
      var roleInput = document.getElementById("roleInput");
      var orgInput = document.getElementById("orgInput");
      // var interviewerInput = document.getElementById("interviewerInput");
      if (roleInput && roleInput.value) {
        params.append("role", roleInput.value);
      }
      if (orgInput && orgInput.value) {
        params.append("org", orgInput.value);
      }
      // if (interviewerInput && interviewerInput.value) {
      //   params.append("interviewer", decodeAndEncode(interviewerInput.value));
      // }
      break;

    case "date":
      // var dateInput = document.getElementById("dateInput");
      // if (dateInput && dateInput.value) {
      //   params.append("name", decodeAndEncode(dateInput.value));
      // }
      break;

    case "debate":
      // var opponentInput = document.getElementById("opponentInput");
      var topicInput = document.getElementById("topicInput");

      // if (opponentInput && opponentInput.value) {
      //   params.append("opponent", decodeAndEncode(opponentInput.value));
      // }
      if (topicInput && topicInput.value) {
        params.append("topic", topicInput.value);
      }
      break;
  }
  if (isTtsEnabled) {
    params.append("voice", "true");
  }
  if (document.getElementById("urlInput")) {
    var queryString = params.toString().replace(/\+/g, " ");
    if (queryString) {
      regularUrl = url + "?" + queryString;
    } else {
      regularUrl = url;
    }
    if (shareUrl) {
    }
    shareUrl = url + "?" + queryString + "&share";
    trainingUrl = url + "?training=true&" + queryString;
    document.getElementById("urlInput").value = shareUrl;
  }
}

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

// document.getElementById("proxyForm").addEventListener("submit", function(event) {
//   event.preventDefault(); // Prevent the default form submission
//   updateProxy();
// });

function updateProxy() {
  event.preventDefault(); // Prevent the default form submission behavior

  if (saveButton.disabled === false) {
    const contentId = document
      .getElementById("contextSelect")
      .value.toLowerCase();
    const content =
      document.getElementById("contentField").value.toLowerCase() || "";

    // Prepare the data to be sent
    const formData = {
      contentId: contentId,
      content: content,
    };

    // Use fetch to send the form data to the server
    fetch("/update-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Success:", data);
        // alert('Record updated successfully'); // Show success message
        proxies[Object.keys(proxies)[0]][contentId] = content;
        // Update the proxy object
        // Update the content of the "Personality" paragraph if applicable
        if (contentId === "meet") {
          document.getElementById("contentField").textContent =
            proxies[submitTo].meet;
        }
        updateContent();

        // Attempt to hide the modal
        try {
          const saveButton = document.getElementById("save");
          saveButton.disabled = true;
          saveButton.classList.add("btn-success");
          // setTimeout(() => {
          //   // saveButton.style.visibility = "hidden";
          //   saveButton.classList.remove("btn-success");
          // }, 3000);
        } catch (error) {
          console.error("Failed to show the success message:", error);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Failed to update record"); // Show error message
      });
    // Prevent the form from submitting in the traditional way
    return false;
  }
}

function addButton(buttonElement, option) {
  const buttonNameInput = document.getElementById("buttonName");
  const buttonName = option;

  if (!buttonName) {
    // Optionally handle the case where no name is provided
    alert("Please enter a name.");
    return;
  }

  // Hide the input field with the ID nameInput
  const nameInput = document.getElementById("nameInput");
  if (nameInput) {
    nameInput.remove();
  }

  // Get the container where the input field is located
  const inputContainer = document.getElementById("inputContainer");
  const checkboxContainer = document.getElementById("hostButtons");

  // Disable the button to prevent multiple clicks
  if (buttonElement) {
    buttonElement.classList.add("disabled");
  }

  // Get the container where checkboxes will be added

  // Create a div to wrap the checkbox and label
  const formCheckDiv = document.createElement("div");
  formCheckDiv.setAttribute("class", "form-check");

  // Create a checkbox
  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.setAttribute("id", buttonName);
  checkbox.setAttribute("class", "form-check-input");
  checkbox.checked = true;

  // Add a data-tag attribute to the checkbox
  const tag = "button-" + checkboxContainer.children.length;
  checkbox.setAttribute("data-tag", tag);

  // Create a label for the checkbox
  const label = document.createElement("label");
  label.setAttribute("for", buttonName);
  label.setAttribute("class", "form-check-label");
  label.textContent = buttonName;

  // Append the checkbox and label to the form-check div
  formCheckDiv.appendChild(checkbox);
  formCheckDiv.appendChild(label);

  // Append the form-check div to the container
  checkboxContainer.appendChild(formCheckDiv);

  // Show the Guest Proxies label if it's hidden
  const simulateLabel = document.getElementById("simulate");
  if (simulateLabel.style.display === "none") {
    simulateLabel.style.display = "block";
  }

  // // Get the dropdown element
  // const submitAsDropdown = document.getElementById('submitAs');

  // // Create a new option element
  // const option = document.createElement('option');
  // option.value = buttonName;
  // option.textContent = buttonName;

  // // Append the new option to the dropdown
  // submitAsDropdown.appendChild(option);

  // Programmatically trigger change event on the new checkbox
  const changeEvent = new Event("change", { bubbles: true });
  checkbox.dispatchEvent(changeEvent);
}

// Event Listeners
//---------------------------------------------------------

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
      event.preventDefault(); // Prevents the default action (inserting a newline)
      clearTimeout(typingTimer);
      // Try to find the button with the value of previousAvatar
      let button = document.querySelector(
        `#submitTo input[type="submit"][value="${previousAvatar}"]`
      );

      // If the button doesn't exist or is disabled, find the first not disabled button
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

      // If a button was found, click it
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
  // }
});

document.getElementById("userInput").addEventListener("input", function () {
  submitAs = document.getElementById("submitAs").value;

  if (submitAs in proxies) {
    botResponse.textContent = document.getElementById("userInput").value;
    toggleResponseContainer();
  }
  if (response) {
    console.log("Response:", response);
    document.getElementById("prompt").textContent = response;
  }
  let submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => {
    if (button.value === submitAs) {
      button.disabled = true;
    } else {
      button.disabled = false; // You might want to enable the other buttons
    }
  });
  // document.getElementById('botImage').src = "/img/" + avatar + "/smile";
});

// Update avatar based on the selected submitAs value
document.getElementById("submitAs").addEventListener("change", function () {
  if (isRequestPending) return;
  if (speaking) return;
  updateAvatar(document.getElementById("submitAs").value, "smile");
  botResponse.textContent = document.getElementById("userInput").value;
  toggleResponseContainer();
});

document
  .getElementById("feedbackForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    var feedback = document.getElementById("feedbackText").value;

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
        feedbackModal.hide();

        document.getElementById("feedbackForm").reset();
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  });

document.addEventListener("DOMContentLoaded", (event) => {
  submitButton = document.querySelector('.btn-group input[type="submit"]');
  submitAsElement = document.getElementById("submitAs");
  promptElement = document.getElementById("prompt");

  if (context.alias !== "CT") {
    // Link to create page
    const createProxyLink = document.getElementById("createProxyLink");
    const currentUrl = new URL(window.location.href);
    currentUrl.pathname = "/create";
    createProxyLink.href = currentUrl.toString();

    settingsModal = new bootstrap.Modal(
      document.getElementById("settingsModal")
    );
  }
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

  feedbackModal = new bootstrap.Modal(document.getElementById("feedbackModal"));
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
          // saveButton.style.visibility = "visible";
        } else {
          saveButton.disabled = true;
          // saveButton.style.visibility = "hidden";
        }
      });

    if (window.location.href.includes("voice=true")) {
      console.log("Voice is enabled");
      // If it does, run the toggleTtsState function
      toggleTtsState();
    }

    // Custom Context
    const hostButtons = document.getElementById("hostButtons");

    hostButtons.addEventListener("change", function (e) {
      // const submitAsButton = document.getElementById("submitAs");
      // const submitToButtonGroup = document.getElementById("submitTo");
      // if (e.target.tagName === "INPUT" && e.target.type === "checkbox") {
      //   const hostName = e.target.nextElementSibling.textContent;
      //   const checkedBoxes = hostButtons.querySelectorAll(
      //     'input[type="checkbox"]:checked'
      //   );
      //   // if (!e.target.checked && checkedBoxes.length === 0) {
      //   //   // Prevent unchecking if it's the last remaining checked checkbox
      //   //   e.preventDefault();
      //   //   // alert('At least one host must be selected.');
      //   //   e.target.checked = true; // Ensure the checkbox stays checked
      //   //   return;
      //   // }

      //   if (e.target.checked) {
      //     // Host is checked, add to submit buttons
      //     const optionAs = document.createElement("option");
      //     optionAs.value = hostName;
      //     optionAs.textContent = hostName;
      //     submitAsButton.appendChild(optionAs);
      //     optionAs.selected = true;
      //     // addButton();
      //     updateAvatar(hostName, "smile");

      //     getHosts();
      //     const submitToButton = document.createElement("input");
      //     submitToButton.setAttribute("type", "submit");
      //     submitToButton.setAttribute("name", "go");
      //     submitToButton.setAttribute("value", hostName);
      //     submitToButton.setAttribute(
      //       "class",
      //       "btn btn-rounded btn-outline-dark btn-sm"
      //     );
      //     submitToButtonGroup.appendChild(submitToButton);
      //   } else {
      //     // Host is unchecked, remove from submit buttons
      //     const optionToRemoveAs = Array.from(submitAsButton.options).find(
      //       (option) => option.value === hostName
      //     );
      //     if (optionToRemoveAs) {
      //       submitAsButton.removeChild(optionToRemoveAs);
      //     }

      //     const submitToButtonToRemove = Array.from(
      //       submitToButtonGroup.children
      //     ).find((button) => button.value === hostName);
      //     if (submitToButtonToRemove) {
      //       submitToButtonGroup.removeChild(submitToButtonToRemove);
      //     }
      //   }
      // }
      updateUrl(document.getElementById("contextSelect").value.toLowerCase());
    });
    const contentField = document.getElementById("contentField");
    if (contentField) {
      contentField.addEventListener("input", toggleTraining);
    }

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

    updateContext();

    preloadImages(proxies);

    // Run on page load
    updateUrl(String(siteId));
    updateContent();
    processParameters();
    toggleTraining();
    document.body.classList.toggle('dark-mode');
  }
});

window.onload = function () {};
