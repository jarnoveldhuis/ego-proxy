const WebSocketManager = {
  clientId: null,
  environment: null,
  socket: null,
  init() {
    const host =
      window.location.hostname === "localhost"
        ? "ws://localhost:3001"
        : "wss://ego-proxy.com";
    this.environment =
      window.location.hostname === "localhost"
        ? "localhost:3001"
        : "ego-proxy.com";

    // Close the previous WebSocket connection if it exists
    if (this.socket) {
      this.socket.close();
    }

    // Create a new WebSocket connection
    this.socket = new WebSocket(host);
    this.bindEvents();

    // Send a "ping" message every 5 seconds
    this.socket.addEventListener("open", () => {
      this.pingInterval = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ event: "ping" }));
          console.log("Ping");
        }
      }, 15000);
    });

    // Clear the interval when the WebSocket is closed
    this.socket.addEventListener("close", () => {
      clearInterval(this.pingInterval);
    });
  },
  bindEvents() {
    this.socket.addEventListener("open", () =>
      console.log("WebSocket is connected.")
    );
    this.socket.addEventListener(
      "message",
      this.handleSocketMessage.bind(this)
    );
    this.socket.addEventListener("error", (event) =>
      console.error("WebSocket error observed:", event)
    );
  },
  handleSocketMessage(event) {
    const data = JSON.parse(event.data);
    switch (data.event || data.type) {
      case "complete":
        UI.updateUIForSuccess(data);
        window.location.href = `http://${data.proxyName}.${WebSocketManager.environment}/introduction`;
        break;
      case "progress":
        UI.updateProgressBar(data.progress);
        break;
      case "clientId":
        this.clientId = data.clientId;
        console.log("Received clientId from server:", this.clientId);
        break;
      case "error":
        UI.updateUIForError(data.error);
        break;
    }
  },
};

const UI = {
  updateProgressBar(progressPercentage) {
    const progressBar = document.querySelector(".progress-bar");
    progressBar.style.width = `${progressPercentage}%`;
    progressBar.setAttribute("aria-valuenow", progressPercentage);
    progressBar.textContent = `${progressPercentage}%`;
  },
  updateUIForSuccess(data) {
    console.log("All images have been added to Airtable");
    const successMessage = document.getElementById("successMessage");
    const successText = document.getElementById("successText");
    successText.innerHTML = `Successfully created proxy: <a href="http://${data.proxyName}.${WebSocketManager.environment}/orientation">${data.proxyName}</a>`;
    successMessage.classList.remove("alert-dark");
    successMessage.classList.add("alert-success");
    successMessage.style.display = "block";
    document.getElementById("progressBarContainer").style.display = "none";
    document.getElementById("errorMessage").style.display = "none";
  },
  updateUIForError(error) {
    console.log("An error occurred:", error);
    const errorMessage = document.getElementById("errorMessage");
    const errorText = document.getElementById("errorText");
    errorText.innerHTML = `An error occurred: ${error}`;
    errorMessage.classList.remove("alert-success");
    errorMessage.classList.add("alert-danger");
    errorMessage.style.display = "block";
    document.getElementById("progressBarContainer").style.display = "none";
    document.getElementById("successMessage").style.display = "none";
  },
  handleFormSuccess() {
    console.log("Processing started...");
    document.getElementById("progressBarContainer").style.display = "block";
    document.getElementById("successMessage").style.display = "block";
    let modalElement = document.getElementById("createProxyModal");
    let modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance?.hide();
  },
};

async function submitFormData(formData) {
  try {
    const response = await fetch("/create-proxy", {
      method: "POST",
      body: formData,
    });
    if (response.status === 409) {
      const data = await response.json();
      handleFormError(data.message, true);
    } else if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || "An error occurred during submission.");
    } else {
    }
  } catch (error) {
    handleFormError(error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let modalElement = document.getElementById("createProxyModal");
  modalElement.addEventListener("show.bs.modal", function (event) {
    WebSocketManager.init();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  WebSocketManager.init();
  document
    .getElementById("createProxyForm")
    .addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        UI.handleFormSuccess();
        const formData = new FormData(this);
        console.log("Form Data:", formData);
        const proxyName = formData.get("proxyName").replace(/ /g, "-");
        formData.set("proxyName", proxyName);
        formData.append("clientId", WebSocketManager.clientId);
        if (WebSocketManager.socket.readyState === WebSocket.OPEN) {
          submitFormData(formData);
        }
      } catch (error) {
        console.error("Failed to establish WebSocket connection:", error);
      }
    });
});

// // Listen for portrait upload
// document.getElementById('formFileSm').addEventListener('change', function(event) {
//   const file = event.target.files[0];
//   if (file) {
//     const formData = new FormData();
//     formData.append('file', file);

//     fetch('/upload', {
//       method: 'POST',
//       body: formData
//     })
//     .then(response => response.json())
//     .then(data => {
//       if (data.base64) {
//         // console.log('File uploaded successfully:', data.base64);
//         console.log(data.photoDescription);
//         document.getElementById('imageDescription').value = data.photoDescription;
//       } else {
//         console.error('Failed to upload file');
//       }
//     })
//     .catch(error => {
//       console.error('Error:', error);
//     });
//   }
// });

function handleFormError(message, is409 = false) {
  if (is409) {
    console.log("Form Error Function", message);
    document.getElementById("proxyName").classList.add("is-invalid");
    document.getElementById("nameFeedback").textContent = message;
    let modalElement = document.getElementById("createProxyModal");
    let modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance?.show();
    new bootstrap.Tab(document.querySelector("#basic-info-tab")).show(); // Switch to the first tab
  } else {
    UI.updateUIForError(message);
    console.error("Submission Error:", message);
    document.getElementById("errorMessage").textContent = message;
    document.getElementById("errorMessage").style.display = "block";
    document.getElementById("successMessage").style.display = "none";
    document.getElementById("progressBarContainer").style.display = "none";
    let modalElement = document.getElementById("createProxyModal");
    let modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance?.hide();
  }
}

//Personality Functions

let personalityAttributes = {
  neuroticism: "",
  openness: "",
  agreeableness: "",
  conscientiousness: "",
  extroversion: "",
  senseOfHumor: "",
};

const personalityDescriptions = {
  neuroticism: {
    Sensitive: "tends to feel stress easily",
    Balanced: "can occasionally feel stressed",
    Composed: "rarely feels stressed",
  },
  openness: {
    Conservative: "appreciates familiarity",
    Curious: "is open to new ideas",
    Adventurous: "loves exploring new ideas",
  },
  agreeableness: {
    Skeptical: "enjoys arguing",
    Cooperative: "is easy to get along with",
    Compassionate: "always puts others first",
  },
  conscientiousness: {
    Casual: "tend to go with the flow",
    Organized: "are generally organized",
    Meticulous: "are meticulously organized and detail-oriented",
  },
  extroversion: {
    Introverted: "prefer quiet time alone",
    Ambiverted: "enjoy a mix of social and alone time",
    Extroverted: "love being around people",
  },
  senseOfHumor: {
    Dry: "have a dry and sarcastic sense of humor",
    Playful: "have a playful and silly sense of humor",
    Witty: "are witty or clever with their humor",
    Dark: "have a dark and NSFW sense of humor",
    None: "are serious and less inclined towards humor",
  },
};

function createPersonalityDescription() {
  return `This person ${
    personalityDescriptions.neuroticism[personalityAttributes.neuroticism]
  }, ${personalityDescriptions.openness[personalityAttributes.openness]}, and ${
    personalityDescriptions.agreeableness[personalityAttributes.agreeableness]
  }. They ${
    personalityDescriptions.conscientiousness[
      personalityAttributes.conscientiousness
    ]
  } and ${
    personalityDescriptions.extroversion[personalityAttributes.extroversion]
  }. They ${
    personalityDescriptions.senseOfHumor[personalityAttributes.senseOfHumor]
  }.`;
}

function updatePersonality(attribute, value) {
  personalityAttributes[attribute] = value;
  let personality = createPersonalityDescription();
  document.getElementById("personalityDescription").textContent = personality;
}

document.querySelectorAll("#personality select").forEach((select) => {
  select.addEventListener("change", function () {
    updatePersonality(this.id, this.value);
  });
});

// Appearance Functions

let appearanceAttributes = {
  ethnicity: "",
  genderIdentity: "",
  hairLine: "",
  facialShape: "",
  noseShape: "",
  eyeColor: "",
  skinTone: "",
  hairColor: "",
  hairLength: "",
  hairStyle: "",
  facialHair: "",
  eyebrowShape: "",
  lipFullness: "",
  ageAppearance: "",
};

function toggleOtherEthnicity(select) {
  var otherEthnicityContainer = document.getElementById(
    "otherEthnicityContainer"
  );
  if (select.value === "Other") {
    otherEthnicityContainer.style.display = "block";
  } else {
    otherEthnicityContainer.style.display = "none";
  }
}

function createAppearanceDescription() {
  if (appearanceAttributes.ethnicity === "Other") {
    appearanceAttributes.ethnicity =
      document.getElementById("otherEthnicity").value;
  }
  // This dynamically creates the appearance description based on the current attributes.
  return `${appearanceAttributes.ethnicity} ${appearanceAttributes.genderIdentity.toLowerCase()} individual with a ${appearanceAttributes.facialShape.toLowerCase()} face, ${appearanceAttributes.noseShape.toLowerCase()} nose, and ${appearanceAttributes.eyeColor.toLowerCase()} eyes. Their skin tone is ${appearanceAttributes.skinTone.toLowerCase()}, and they have ${appearanceAttributes.hairColor.toLowerCase()} hair that is ${appearanceAttributes.hairLength.toLowerCase()} and ${appearanceAttributes.hairStyle.toLowerCase()} with a ${appearanceAttributes.hairLine.toLowerCase()} hairline. They sport ${appearanceAttributes.facialHair.toLowerCase()}, have ${appearanceAttributes.eyebrowShape.toLowerCase()} eyebrows, ${appearanceAttributes.lipFullness.toLowerCase()} lips, and appear to be in the ${appearanceAttributes.ageAppearance.toLowerCase()} age range.`.trim();
}

function updateAppearance(attribute, value) {
  // appearanceAttributes[attribute] = value;
  // let appearance = createAppearanceDescription();
  // document.getElementById('imageDescription').value = appearance; // Assumes there's a textarea to display this
}

// Listen for changes on all select elements within the appearance tab
document
  .querySelectorAll("#appearance select, #basic-info select")
  .forEach((select) => {
    select.addEventListener("change", function () {
      // The attribute to update is the id of the select element
      let attribute = this.id;
      let description = this.options[this.selectedIndex].text; // Gets the text of the selected option
      updateAppearance(this.id, description);
    });
  });
