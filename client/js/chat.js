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
let thinkingTimer;
const thinkDelay = 2000;
let laughLength = 1500;
let laugh;
let laughs;
let isLaughing = false;

// Chat
let transcriptHtml = "Begin conversation.";
let transcriptText = "Begin conversation.";
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

// Avatar management
// -----------------
function preloadImages(proxies) {
  if (typeof proxies !== "object" || proxies === null) {
    console.error("Invalid proxies object:", proxies);
    return;
  }

  const validImageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
  ];

  for (let avatar in proxies) {
    if (!proxies.hasOwnProperty(avatar)) continue;
    let proxy = proxies[avatar];
    for (let reaction in proxy) {
      if (!proxy.hasOwnProperty(reaction)) continue;
      if (Array.isArray(proxy[reaction]) && proxy[reaction].length > 0) {
        let url = proxy[reaction][0].url;
        if (url && typeof url === "string") {
          let extension = url.substring(url.lastIndexOf(".")).toLowerCase();
          if (validImageExtensions.includes(extension)) {
            let img = new Image();
            img.src = url;
            img.onload = () => {
              // Image loaded successfully
              console.log("Image loaded:", url);
            };
            img.onerror = (error) => {
              // Failed to load image
              console.error("Error loading image:", error);
            };
          }
        }
      }
    }
  }
}

function updateAvatar(submit, reaction) {
  let avatar = "Guest";
  let botImage = document.getElementById("botImage");
  let botContainer = document.querySelector(".bot-container"); // Parent div
  console.log(submit, ":", reaction);
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
      reaction = "smile";
    }
    let imagePath = proxy[reaction][0].url;
    // Set the background image of the parent div
    botContainer.style.backgroundImage = `url(${imagePath})`;
    botContainer.style.backgroundSize = "cover";

    // Update the image immediately
    botImage.src = imagePath;

    // Avatar Fade Effects
    // When the new image is loaded, start the fade effect
    // botImage.onload = () => {
    //   // Fade out the original image
    //   botImage.style.opacity = 0;

    //   // After a delay, fade the image back in
    //   setTimeout(() => {
    //   botImage.style.opacity = 1;

    //   // Remove the background image
    //   botContainer.style.backgroundImage = 'none';
    //   }, 1000); // Adjust the delay as needed
    // };

    let submitButtons = document.querySelectorAll('input[type="submit"]');
    let submitAs = document.getElementById("submitAs").value;
    let inputField = document.getElementById("userInput");

    if (submitAs in proxies || !inputField.value.trim()) {
      submitButtons.forEach((button) => {
        button.disabled = button.value === avatar;
      });
    }

    // console.dir(proxies, { depth: null });

    // submitButtons.forEach((button) => {
    //   // button.classList.add('btn-rounded');  // Add the rounded class
    //   button.style.display = button.value === submitAs ? "none" : "block";
    // });
    let numProxies = Object.keys(proxies).length;

    // Update buttons when personality formed.
    // if (numProxies <= 2) {
    //   submitButtons.forEach((button) => {
    //     if (proxies[button.value].hasPersonality === false) {
    //       button.style.display = "none";
    //       button.disabled = true;
    //     } else {
    //       button.style.display = "block";
    //       button.disabled = false;
    //     }
    //   });
    // } else {
    // submitButtons.forEach((button) => {
    //   if (proxies[button.value].hasPersonality === false || button.disabled) {
    //     button.style.display = "none";
    //   } else {
    //     button.style.display = "block";
    //   }
    // });
    // }

    if (numProxies <= 2) {
      submitButtons.forEach((button) => {
        if (button.disabled) {
          button.style.display = "block";
        }
      });
    } else {
      submitButtons.forEach((button) => {
        if (button.disabled) {
          button.style.display = "none";
        } else {
          button.style.display = "block";
        }
      });
    }

    return submitButtons;
  }

  return avatar;
}

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
    updateAvatar(avatar, "serious");
  }
  audio.onended = () => {
    speaking = false;
    // Disable butons

    // submitButtons.forEach(button => {
    //   if (button.value === avatar) {
    //     button.disabled = true;
    //   } else {
    //     button.disabled = false; // You might want to enable the other buttons
    //   }
    // });
    updateAvatar(avatar, "serious");
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
      updateAvatar(avatarName, "serious");
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

function disableSubmitButtons() {
  const submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => (button.disabled = true));
}

function enableSubmitButtons() {
  const submitButtons = document.querySelectorAll('input[type="submit"]');
  submitButtons.forEach((button) => (button.disabled = false));
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
    updateAvatar(avatar, "smile"); // Default image
    let botContainer = document.querySelector(".bot-container"); // Parent div

    // Check if there are laugh sounds for the avatar
    if (proxy.laughSounds && emotion.toLowerCase() === "laugh") {
      console.log("Laughing sound");
      const randomLaugh =
        proxy.laughSounds[Math.floor(Math.random() * proxy.laughSounds.length)];
      const laugh = new Audio("../laughs/" + randomLaugh);

      // Play the laugh sound and handle the avatar image
      updateAvatar(avatar, "laugh");
      botContainer.classList.add("laughing");
      laugh.play();

      laugh.onplay = () => {
        isLaughing = true;
        console.log("Laughing");
      };

      laugh.onended = () => {
        isLaughing = false;
        console.log("End of laughter");
        updateAvatar(avatar, "smile");
        botContainer.classList.remove("laughing");
        resolve();
      };

      // Set a timer if needed for specific duration of laughter
    } else if (!proxy.laughSounds && emotion.toLowerCase() === "laugh") {
      updateAvatar(avatar, "laugh".toLowerCase());
      botContainer.classList.add("laughing");

      setTimeout(() => {
        updateAvatar(avatar, "smile");
        botContainer.classList.remove("laughing");
        resolve();
      }, laughLength);

      // Handle the case for avatars without laugh sounds
      // For example, setting a default image or different behavior
      // You can also set a default or serious image here if needed
    } else {
      updateAvatar(avatar, emotion.toLowerCase());
      resolve();
    }
  });
}

//Chat
//---------------------------------------------------------

function isTrainingMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has("training");
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

  document.getElementById("submitAs").addEventListener("change", function () {
    if (isRequestPending) return;
    if (speaking) return;
    updateAvatar(document.getElementById("submitAs").value, "serious");

    botResponse.textContent = document.getElementById("userInput").value;
    // document.getElementById('botImage').src = "/img/" + avatar + "/serious";
    toggleResponseContainer();
  });
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
  // Clear the input field immediately after the function runs
  userInputElem.value = "";
  updateAvatar(avatar, "serious");
  // Set a timeout to update the bot image to thinking image
  thinkingTimer = setTimeout(() => {
    updateAvatar(avatar, "think");
    // botImage.src = "/img/" + avatar + "/think";
  }, thinkDelay);
  // Clear the botResponse and add a 'loading' class to it
  console.log("Transcript Length:", transcriptText.length);
  if (
    transcriptText.length > transcriptThreshold &&
    // siteId === "introduction" &&
    hasPersonality === false
  ) {
    botResponse.textContent = `Updating Personality`;
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
        submitTo: submitTo,
        siteId: siteId,
        hosts: hosts,
        isTraining: training,
      }),
    });

    const data = await fetchResponse.json();
    if (data.personalityUpdated) {
      settingsModal.show();
      document.getElementById("contentField").value = data.transcriptSummary;
      document.getElementById("toggleButton").style.display = "inline-block";
      document.getElementById("contextUpdated").style.display = "block";
      console.log(proxies[Object.keys(proxies)[0]].introduction);
      proxies[Object.keys(proxies)[0]].introduction = data.transcriptSummary;
    }
    let avatar = data.answer.split(":")[0].trim();
    console.Object;
    // Clear the thinkingTimer and update the botResponse with the data received
    clearTimeout(thinkingTimer);
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
    // If there's an error, clear the thinkingTimer and update the botResponse and bot image
    clearTimeout(thinkingTimer);
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

  // document.getElementById("save").innerText = "Save" + " " + contentId;
  // document.getElementById('introductionModal').style.display = context === 'Introduction' ? 'block' : 'none';
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
  const yourName = proxies[Object.keys(proxies)[0]][contentId + "Name"];
  const content = proxies[Object.keys(proxies)[0]][contentId] || ""; // Fetch the content based on contentId

  successMessage.style.display = "none"; // Hid success message
  let params = new URLSearchParams(window.location.href);
  if (params.has("share")) {
    document.getElementById("allUrl").style.display = "none";
    document.getElementById("allContent").style.display = "none";
    document.getElementById("toggleButton").style.display = "none";
    document.getElementById("navTabs").style.display = "none";
    document.getElementById("begin").style.display = "block";
    document.getElementById("profile").classList.remove("active");
    document.getElementById("share").classList.add("active");
    document.getElementById("profile").classList.remove("show");
    document.getElementById("share").classList.add("show");
    document.getElementById("backToProfile").style.display = "none";
    document.getElementById("yourName").innerText = "Your Name:";
  } else {
    document.getElementById("yourName").innerText = yourName + ":";
  }

  console.log("Content ID:", contentId);

  if (!contentId) {
    console.warn("No content ID found.");
    return;
  }

  if (content === "" && contentId === "introduction") {
    training = true;
    document.getElementById("toggleButton").style.display = "none";
  }

  // Set the value of the hidden input and the textarea
  document.getElementById("contentIdField").value = contentId;
  document.getElementById("contentField").value = content;
  document.getElementById("contentId").innerText = contentName + ":";
  document.getElementById("contentField").placeholder =
    "Click 'Train' below to generate your proxy's " +
    contentName.toLowerCase() +
    " or just update manually here.";
  document.getElementById("save").innerText = "Save " + contentName;
  // document.getElementById("meetProxy").innerText = "Meet " + proxy;

  // Store the original content
  originalContent = content;
}

function removeParams(url) {
  console.log("removing params", url);
  // Create a URL object
  let urlObj = new URL(url);
  // Remove the 'share' parameter if it exists
  urlObj.searchParams.delete("share");
  // urlObj.searchParams.delete("training");
  // Return the URL as a string without the 'share' parameter
  console.log("removed params", urlObj.toString());
  return urlObj.toString();
}

function redirectToUrl() {
  let params = new URLSearchParams(window.location.href);
  console.log("redirecting");
  console.log(params.has("share"));
  if (params.has("share")) {
    window.location.href = shareUrl;
  } else if (params.has("training")) {
    console.log("Redict to Training URL:", trainingUrl);
    window.location.href = trainingUrl;
  } else if (!params.has("share") || !params.has("training")) {
    window.location.href = regularUrl;
  } else {
    console.error("URL input is empty");
  }
}

function begin(transcript) {
  transcriptText = transcript;
  window.scrollTo(0, document.body.scrollHeight);
  const buttons = document.querySelectorAll('#submitTo input[type="submit"]');
  const lastButton = buttons[buttons.length - 1];
  lastButton.disabled = false;
  if (lastButton) {
    lastButton.click();
  }
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
    tooltip.dispose();
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
  console.log("Training:", training);

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

function backToProfile() {
  // Remove active and show classes from the current active tab and content
  training = false;
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

function processParameters() {
  var url = new URL(window.location.href);
  var params = new URLSearchParams(url.search);
  var training = params.has("training") ? true : false;
  console.log("Training:", training);
  var context = document.getElementById("contextSelect").value;
  var modalElement = document.getElementById("settingsModal");
  var settingsModal =
    bootstrap.Modal.getInstance(modalElement) ||
    new bootstrap.Modal(modalElement);
  var allInputsFilled = true;
  var nameInput = document.getElementById("nameInput").value;
  const newUrl = document.getElementById("urlInput").value;
  let cleanedUrl = removeParams(url.href);
  let cleanedNewUrl = removeParams(newUrl);

  switch (context) {
    case "Interview":
      var contentField = document.getElementById("contentField").value;
      var roleInput = document.getElementById("roleInput").value;
      var orgInput = document.getElementById("orgInput").value;

      if (!roleInput || !orgInput || !nameInput) {
        settingsModal.show();
        allInputsFilled = false;
        // showParams();
        // tryToolTip();
      }

      if (allInputsFilled) {
        if (cleanedUrl !== cleanedNewUrl) {
          console.log("Cleaned URL:", cleanedUrl);
          console.log("New Clean URL:", cleanedNewUrl);
          redirectToUrl();
        } else {
          settingsModal.hide();
          // Update the Interviewer option
          var submitAsSelect = document.getElementById("submitAs");
          var nameOption = submitAsSelect.querySelector('option[value="You"]');
          if (nameOption) {
            nameOption.value = nameInput;
            nameOption.textContent = nameInput;
          }

          transcriptText =
            "You are interviewing for the role of " +
            roleInput +
            ". Introduce yourself by name to " +
            nameInput +
            " from " +
            orgInput +
            ":";

          begin(transcriptText);
        }
      }
      break;

    case "Date":
      var nameInput = document.getElementById("nameInput").value;

      if (!nameInput) {
        settingsModal.show();
        allInputsFilled = false;
        // tryToolTip()
        // showParams();
      }

      if (allInputsFilled) {
        if (cleanedUrl !== cleanedNewUrl) {
          console.log("Cleaned URL:", cleanedUrl, cleanedNewUrl);
          console.log("URLs are different. Redirecting...");
          redirectToUrl();
        } else {
          settingsModal.hide();
          // Update the Date option
          var submitAsSelect = document.getElementById("submitAs");

          var nameOption = submitAsSelect.querySelector('option[value="You"]');
          if (nameOption) {
            nameOption.value = nameInput;
            nameOption.textContent = nameInput;
          }
          transcriptText =
            "You are on a date with " +
            nameInput +
            ". Say hello and introduce yourself by name.";
          settingsModal.hide();
          begin(transcriptText);
        }
      }
      break;

    case "Debate":
      var opponentInput = document.getElementById("nameInput").value;
      var topicInput = document.getElementById("topicInput").value;

      if (!opponentInput || !topicInput) {
        settingsModal.show();
        allInputsFilled = false;

        // showParams();
        // tryToolTip()
      }

      if (allInputsFilled) {
        if (cleanedUrl !== cleanedNewUrl) {
          redirectToUrl();
        } else {
          settingsModal.hide();
          const newUrl = document.getElementById("urlInput").value;

          var submitAsSelect = document.getElementById("submitAs");
          var nameOption = submitAsSelect.querySelector('option[value="You"]');
          if (nameOption) {
            nameOption.value = nameInput;
            nameOption.textContent = nameInput;
          }
          var transcriptText =
            "You are debating " +
            opponentInput +
            " on the topic of " +
            topicInput +
            ".";
          settingsModal.hide();
          begin(transcriptText);
        }
      }
      break;
    case "Introduction":
      var contentField = document.getElementById("contentField").value;

      if (contentField === "" || training === true) {
        transcriptText = "Begin coversation.";
        begin(transcriptText);
      } else {
        var nameInput = document.getElementById("nameInput").value;

        //
        if (!nameInput) {
          settingsModal.show();
          allInputsFilled = false;
          // showParams();
          // tryToolTip()
        }

        if (allInputsFilled) {
          // const newUrl = document.getElementById("urlInput").value;

          if (cleanedUrl !== cleanedNewUrl) {
            console.log("Cleaned URL:", cleanedUrl);
            console.log("New Cle URL:", cleanedNewUrl);
            redirectToUrl();
          } else {
            settingsModal.hide();
            // Update the Date option
            var submitAsSelect = document.getElementById("submitAs");
            var nameOption = submitAsSelect.querySelector(
              'option[value="You"]'
            );
            if (nameOption) {
              nameOption.value = nameInput;
              nameOption.textContent = nameInput;
            }
            transcriptText = "Introduct yourself to " + nameInput + ".";

            begin(transcriptText);
          }
        }
      }
      break;
  }

  if (context.alias === "CT") {
    laughLength = 0;
    transcriptText = "Begin podcast.";
    begin(transcriptText);
  }
  // if (allInputsFilled) {
  //   const newUrl = document.getElementById("urlInput").value;
  //   if (url !== newUrl) {
  //     redirectToUrl();
  //   }
  //   var modalElement = document.getElementById("settingsModal");
  //   var settingsModal =
  //     bootstrap.Modal.getInstance(modalElement) ||
  //     new bootstrap.Modal(modalElement);

  //   settingsModal.hide();
  // }
}

function doneTyping() {
  submitAs = document.getElementById("submitAs").value;
  if (submitAs in proxies) {
    updateAvatar(submitAs, "serious");
  } else {
    updateAvatar(avatar, "serious");
  }
  // avatar = document.getElementById('submitAs').value;
  // updateAvatar(avatar, 'serious')
}

function extractName(userMessage) {
  // Extract the name from the user's message, assuming format "Name: message"
  avatar = userMessage.split(":")[0].trim();
  updateAvatar(avatar, "serious");

  // document.getElementById('botImage').src = "/img/" + avatar + "/serious";
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
  // params.append("training", "true");
  if (nameInput && nameInput.value) {
    params.append("name", nameInput.value);
  }
  if (training === true) {
    params.append("training", "true");
    console.log("Training:", training);
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
    regularUrl = url + "?" + encodeURI(queryString.toString());
    shareUrl = url + "?" + encodeURI(queryString.toString() + "&share");
    trainingUrl = url + "?" + encodeURI(queryString.toString() + "&training");
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

function updateProxy() {
  if (saveButton.disabled === false) {
    contentId = document.getElementById("contextSelect").value.toLowerCase();
    content = document.getElementById("contentField").value.toLowerCase() || "";

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
        if (contentId === "introduction") {
          document.getElementById("contentField").textContent =
            proxies[submitTo].introduction;
        }

        // Attempt to hide the modal
        try {
          var successMessage = document.getElementById("contextUpdated");
          successMessage.style.display = "block"; // Show the success message
          successMessage.innerText = "Update successful!"; // Set the success message text
          const saveButton = document.getElementById("save");
          saveButton.disabled = true;
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

function addButton() {
  const buttonNameInput = document.getElementById("buttonName");
  const buttonName = buttonNameInput.value.trim();

  if (!buttonName) {
    // Optionally handle the case where no name is provided
    alert("Please enter a name.");
    return;
  }

  // Get the container where checkboxes will be added
  const checkboxContainer = document.getElementById("hostButtons");

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

  // Clear the input field
  buttonNameInput.value = "";
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
    updateAvatar(avatar, "listen");
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
    console.log(data.hasPersonality);
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
  // document.getElementById('botImage').src = "/img/" + avatar + "/serious";
});

document.getElementById("submitAs").addEventListener("change", function () {
  if (isRequestPending) {
    return;
  }
  if (speaking) {
    return;
  }
  updateAvatar(document.getElementById("submitAs").value, "serious");
  if (response) {
    document.getElementById("prompt").textContent = response;
  }
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

  settingsModal = new bootstrap.Modal(document.getElementById("settingsModal"));

  const inputElement = document.getElementById("userInput");
  const imageElement = document.getElementById("botImage");
  inputElement.addEventListener("focus", function () {
    imageElement.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  submitAs = submitAsElement ? submitAsElement.value : null;
  submitTo = submitButton ? submitButton.value : "Guest";

  if (submitAs in proxies) {
    avatar = submitAs;
  } else {
    avatar = submitTo;
  }

  hasPersonality = !proxies[submitTo].introduction ? false : true;
  hasDate = !proxies[submitTo].date ? false : true;
  hasInterview = !proxies[submitTo].debate ? false : true;

  feedbackModal = new bootstrap.Modal(document.getElementById("feedbackModal"));
  saveButton = document.getElementById("save");

  if (siteId === "custom" || context.alias === "CT") {
    doneTypingInterval = 1000;
  } else {
    doneTypingInterval = 2000;
  }

  updateAvatar(avatar, "serious");
  const botResponse = document.getElementById("botResponse");
  botResponse.textContent = ``;

  const dateElement = document.getElementById("date");
  const now = new Date();
  now.setFullYear(now.getFullYear() - 4); // Subtract four years

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
      console.log("Current content:", currentContent);
      console.log("Original content:", originalContent);
      if (currentContent !== originalContent) {
        saveButton.disabled = false;
      } else {
        saveButton.disabled = true;
      }
    });

  if (window.location.href.includes("voice=true")) {
    console.log("Voice is enabled");
    // If it does, run the toggleTtsState function
    toggleTtsState();
  }

  // Custom Context
  // const hostButtons = document.getElementById("hostButtons");
  // hostButtons.addEventListener("change", function (e) {
  //   const submitAsButton = document.getElementById("submitAs");
  //   const submitToButtonGroup = document.getElementById("submitTo");
  //   if (e.target.tagName === "INPUT" && e.target.type === "checkbox") {
  //     const hostName = e.target.nextElementSibling.textContent;
  //     const checkedBoxes = hostButtons.querySelectorAll(
  //       'input[type="checkbox"]:checked'
  //     );
  //     if (!e.target.checked && checkedBoxes.length === 0) {
  //       // Prevent unchecking if it's the last remaining checked checkbox
  //       e.preventDefault();
  //       // alert('At least one host must be selected.');
  //       e.target.checked = true; // Ensure the checkbox stays checked
  //       return;
  //     }

  //     if (e.target.checked) {
  //       // Host is checked, add to submit buttons
  //       const optionAs = document.createElement("option");
  //       optionAs.value = hostName;
  //       optionAs.textContent = hostName;
  //       submitAsButton.appendChild(optionAs);
  //       optionAs.selected = true;
  //       updateAvatar(hostName, "serious");

  //       getHosts();
  //       const submitToButton = document.createElement("input");
  //       submitToButton.setAttribute("type", "submit");
  //       submitToButton.setAttribute("name", "go");
  //       submitToButton.setAttribute("value", hostName);
  //       submitToButton.setAttribute("class", "btn btn-outline-dark btn-sm");
  //       if (hostName in proxies) {
  //         submitToButtonGroup.appendChild(submitToButton);
  //       }
  //     } else {
  //       // Host is unchecked, remove from submit buttons
  //       const optionToRemoveAs = Array.from(submitAsButton.options).find(
  //         (option) => option.value === hostName
  //       );
  //       if (optionToRemoveAs) {
  //         submitAsButton.removeChild(optionToRemoveAs);
  //       }

  //       const submitToButtonToRemove = Array.from(
  //         submitToButtonGroup.children
  //       ).find((button) => button.value === hostName);
  //       if (submitToButtonToRemove) {
  //         submitToButtonGroup.removeChild(submitToButtonToRemove);
  //       }
  //     }
  //   }
  // });

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
});

window.onload = function () {};
