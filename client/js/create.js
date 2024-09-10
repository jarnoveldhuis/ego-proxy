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
        window.location.href = `http://${data.proxyName}.${WebSocketManager.environment}/meet`;
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

async function submitFormData(formData) {
  console.log(formData)
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
  WebSocketManager.init();

  let modalElement = document.getElementById("createProxyModal");

  modalElement.addEventListener("show.bs.modal", function (event) {
    WebSocketManager.init();
  });

  if (window.location.pathname === "/create") {
    var createProxyModal = new bootstrap.Modal(
      document.getElementById("createProxyModal")
    );
    createProxyModal.show();
  }

  document
    .getElementById("createProxyForm")
    .addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        UI.handleFormSuccess();
        const formData = new FormData(this);
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
};