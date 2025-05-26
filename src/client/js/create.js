// Located in src/client/js/create.js

const WebSocketManager = {
  clientId: null,
  environment: null,
  socket: null,
  pingInterval: null, // Added to store interval ID

  init() {
    const host =
      window.location.hostname === "localhost"
        ? "ws://localhost:3001"
        : "wss://ego-proxy.com";
    this.environment =
      window.location.hostname === "localhost"
        ? "localhost:3001"
        : "ego-proxy.com";

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log("WebSocket connection already exists or is connecting.");
      // Ensure clientId is requested if socket is open but clientId is missing
      if (this.socket.readyState === WebSocket.OPEN && !this.clientId) {
        // This case might be rare if server always sends clientId on new connection
        // but good for robustness if client re-initializes UI without new socket.
        console.log("Requesting clientId on existing open connection.");
        // Server should send clientId upon connection, but a ping/init message could also trigger it.
      }
      return; // Don't create a new socket if one is already good or trying
    }
    
    // Clear previous interval if any before creating a new socket
    if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
    }


    this.socket = new WebSocket(host);
    this.bindEvents();
  },
  bindEvents() {
    this.socket.addEventListener("open", () => {
      console.log("WebSocket is connected.");
      // Clear any old interval and start a new one
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: "ping" })); // Ensure type for ping
          // console.log("Ping"); // Reduce console noise
        }
      }, 15000);
    });
    this.socket.addEventListener(
      "message",
      this.handleSocketMessage.bind(this)
    );
    this.socket.addEventListener("error", (event) =>
      console.error("WebSocket error observed:", event)
    );
    this.socket.addEventListener("close", () => {
      console.log("WebSocket connection closed.");
      if (this.pingInterval) clearInterval(this.pingInterval); // Clear interval on close
      this.pingInterval = null;
      this.clientId = null; // Reset clientId on close
      // Optionally attempt to re-initialize or notify user
      // setTimeout(() => this.init(), 5000); // Example: try to reconnect after 5s
    });
  },
  handleSocketMessage(event) {
    const data = JSON.parse(event.data);
    // Log all messages for debugging
    // console.log("WebSocket Message Received:", data);

    switch (data.event || data.type) { // Check data.type as well
      case "proxyCreated":
        UI.updateUIForSuccess(data);
        // No longer redirecting from here, UI.updateUIForSuccess handles it.
        break;
      case "progress":
        // Pass the message from data.message to updateProgressBar
        UI.updateProgressBar(data.percentage, data.message);
        break;
      case "clientId":
        this.clientId = data.clientId;
        console.log("Received clientId from server:", this.clientId);
        break;
      case "error":
        // Server now sends: { type: "error", event: "proxyCreationFailedFull", message: "...", details: "..." }
        // Or simpler errors might just have data.error or data.message
        const errorMessage = data.message || data.details || data.error || "An unknown error occurred on the server.";
        UI.updateUIForError(errorMessage);
        break;
      case "info": // Handling the "info" type messages from the server
        const progressMessageElem = document.getElementById("progress-message");
        if (progressMessageElem && data.message) {
            progressMessageElem.textContent = data.message;
        }
        console.log("Info from server:", data.message);
        break;
      case "pong": // Handle pong if server sends it
        // console.log("Pong received");
        break;
      default:
        // console.log("Received unhandled WebSocket event type:", data.type || data.event, data);
        break;
    }
  },
  // Removed simulated progress methods as they are not used with real server updates
};

const UI = {
  updateProgressBar(progressPercentage, message = "") {
    const progressBar = document.querySelector(".progress-bar");
    const progressMessageElement = document.getElementById("progress-message");
    const successMessageContainer = document.getElementById("successMessage");
    if (successMessageContainer) {
      successMessageContainer.style.display = "block";
    }
    // Ensure progressBarContainer is visible when progress starts
    const progressBarContainer = document.getElementById("progressBarContainer");
    if (progressBarContainer && progressBarContainer.style.display === "none") {
        progressBarContainer.style.display = "block";
    }
    // Ensure progressMessageElement is visible when there's a message
    if (progressMessageElement && message && progressMessageElement.style.display === "none") {
        progressMessageElement.style.display = "block";
    }


    if (progressBar) {
      progressBar.style.width = `${progressPercentage}%`;
      progressBar.setAttribute("aria-valuenow", progressPercentage);
      progressBar.textContent = `${progressPercentage}%`;
    }

    if (progressMessageElement) {
      progressMessageElement.textContent = message;
    }
  },

  updateUIForSuccess(data) {
    console.log("Proxy creation process successful on server for:", data.proxyName);
    const successMessageContainer = document.getElementById("successMessage");
    const successTextElement = document.getElementById("successText");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById("progressBarContainer");

    // Ensure success message container is visible and properly styled
    if (successMessageContainer) {
        successMessageContainer.classList.remove("alert-dark", "d-none");
        successMessageContainer.classList.add("alert-success");
        successMessageContainer.style.display = "block";
        successMessageContainer.style.opacity = "1";
        successMessageContainer.style.visibility = "visible";
    }

    // Update success text with link
    if (successTextElement) {
        successTextElement.innerHTML = `Successfully created proxy: <a href="http://${data.proxyName}.${WebSocketManager.environment}/meet" target="_blank" rel="noopener noreferrer" class="alert-link">${data.proxyName}</a>. Redirecting...`;
        successTextElement.style.display = "block";
    }

    // Hide progress elements
    if (progressBarContainer) {
        progressBarContainer.style.display = "none";
    }
    if (progressMessageElement) {
        progressMessageElement.textContent = "Proxy created! Redirecting...";
        progressMessageElement.style.display = "none";
    }

    // Hide any error messages
    const errorMessage = document.getElementById("errorMessage");
    if (errorMessage) {
        errorMessage.style.display = "none";
    }

    // Clear any intervals
    if (WebSocketManager.pingInterval) {
        clearInterval(WebSocketManager.pingInterval);
        WebSocketManager.pingInterval = null;
    }

    // Redirect after a delay
    setTimeout(() => {
        window.location.href = `http://${data.proxyName}.${WebSocketManager.environment}/meet`;
    }, 3000);
  },

  updateUIForError(errorMsg) {
    console.error("UI Update for Error:", errorMsg);
    const errorMessageContainer = document.getElementById("errorMessage");
    const errorTextElement = document.getElementById("errorText");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById("progressBarContainer");

    if (errorTextElement) {
        errorTextElement.textContent = `An error occurred: ${errorMsg}`;
    }
    if (errorMessageContainer) {
        errorMessageContainer.classList.remove("alert-success", "d-none");
        errorMessageContainer.classList.add("alert-danger");
        errorMessageContainer.style.display = "block";
    }

    if (progressBarContainer) { // Hide progress bar container
        progressBarContainer.style.display = "none";
    }
    if (document.getElementById("successMessage")) {
        document.getElementById("successMessage").style.display = "none";
    }
    if (progressMessageElement) {
        progressMessageElement.textContent = "Proxy creation failed.";
        // Keep the error message visible, or hide the progress element:
        // progressMessageElement.style.display = "none";
    }
  },

  handleFormSuccess() {
    console.log("Form submission successful, starting proxy creation process...");
    const progressBarContainer = document.getElementById("progressBarContainer");
    const progressMessageElement = document.getElementById("progress-message");

    if (progressBarContainer) {
        progressBarContainer.style.display = "block";
    }
    if (progressMessageElement) {
        progressMessageElement.textContent = "Initializing proxy creation...";
        progressMessageElement.style.display = "block"; // Explicitly show the message element
    }
    
    const successMessageContainer = document.getElementById("successMessage");
    if (successMessageContainer) successMessageContainer.style.display = "none";
    const errorMessageContainer = document.getElementById("errorMessage");
    if (errorMessageContainer) errorMessageContainer.style.display = "none";

    let modalElement = document.getElementById("createProxyModal");
    if (modalElement) {
        let modalInstance = bootstrap.Modal.getInstance(modalElement);
        modalInstance?.hide();
    }
  },
};

// Toggle Other Ethnicity Input
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

// Submit Form Data
async function submitFormData(formData) {
  console.log("Submitting form data via fetch /create-proxy");
  try {
    const response = await fetch("/create-proxy", {
      method: "POST",
      body: formData, // FormData is sent directly
    });
    // The response from /create-proxy is 202 Accepted if successful start
    // Actual proxy creation result comes via WebSocket
    if (response.status === 202) {
        console.log("Server acknowledged proxy creation request (202). Waiting for WebSocket updates.");
        // UI.handleFormSuccess() is already called before submitFormData
        // WebSocket messages will handle further UI updates (progress, success, error)
    } else if (response.status === 409) {
      const data = await response.json();
      handleFormError(data.message, true); // true for is409 error
    } else if (!response.ok) {
      const data = await response.json().catch(() => ({ message: "An unknown error occurred during submission." }));
      throw new Error(data.message || `Server error: ${response.status}`);
    } else {
      // This case should ideally not be hit if 202 is the primary success indicator for starting the process.
      // If other success codes are possible for immediate completion (unlikely for long process):
      // const data = await response.json(); // if JSON is expected
      console.log("Proxy creation request processed with status:", response.status);
    }
  } catch (error) {
    console.error("Error in submitFormData:", error.message);
    // UI.updateUIForError will be called by WebSocket if the error occurs later
    // If fetch itself fails, handleFormError could be used.
    handleFormError(error.message);
  }
}

// DOMContentLoaded Event
document.addEventListener("DOMContentLoaded", () => {
  const modalElement = document.getElementById("createProxyModal");
  if (modalElement) {
      modalElement.addEventListener("show.bs.modal", function (event) {
        console.log("Create Proxy Modal shown, initializing WebSocket.");
        WebSocketManager.init(); 
        const progressBar = document.querySelector(".progress-bar");
        if (progressBar) {
            progressBar.style.width = "0%";
            progressBar.setAttribute("aria-valuenow", "0");
            progressBar.textContent = "0%";
        }
        const progressMessageElement = document.getElementById("progress-message");
        if (progressMessageElement) {
            progressMessageElement.textContent = "";
            progressMessageElement.style.display = "none"; // Hide on modal show initially
        }
        
        const progressBarContainer = document.getElementById("progressBarContainer");
        if (progressBarContainer) progressBarContainer.style.display = "none"; 
        
        const successMessage = document.getElementById("successMessage");
        if (successMessage) successMessage.style.display = "none";
        
        const errorMessage = document.getElementById("errorMessage");
        if (errorMessage) errorMessage.style.display = "none";
      });
  }

  if (window.location.pathname === "/create") {
    var createProxyModal = new bootstrap.Modal(
      document.getElementById("createProxyModal")
    );
    createProxyModal.show();
  }

  const createProxyForm = document.getElementById("createProxyForm");
  if (createProxyForm) {
    createProxyForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        console.log("Create Proxy Form submitted.");
        UI.handleFormSuccess(); // Update UI to show progress bar area, hide modal etc.

        const formData = new FormData(this);
        const proxyName = formData.get("proxyName").replace(/ /g, "-");
        formData.set("proxyName", proxyName);

        if (!WebSocketManager.clientId) {
            console.error("WebSocket ClientID not available. Waiting for WebSocket connection.");
            // Optionally, inform the user or retry after a short delay
            // For now, we'll try to wait a moment.
            setTimeout(() => {
                if (!WebSocketManager.clientId) {
                    UI.updateUIForError("Failed to connect to the server for creation updates. Please try again.");
                    return;
                }
                formData.append("clientId", WebSocketManager.clientId);
                submitFormData(formData);
            }, 2000); // Wait 2 seconds for clientId
            return;
        }
        
        formData.append("clientId", WebSocketManager.clientId);
        submitFormData(formData);
      });
  }
});

function handleFormError(message, is409 = false) {
  console.error("Handling Form Error:", message, "is409:", is409);
  const modalElement = document.getElementById("createProxyModal");
  let modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (!modalInstance && modalElement) { 
      modalInstance = new bootstrap.Modal(modalElement);
  }

  // Ensure progress elements are hidden when form error occurs before WebSocket process starts
  const progressBarContainer = document.getElementById("progressBarContainer");
  if (progressBarContainer) progressBarContainer.style.display = "none";
  const progressMessageElement = document.getElementById("progress-message");
  if (progressMessageElement) progressMessageElement.style.display = "none";

  if (is409) {
    const proxyNameField = document.getElementById("proxyName");
    const nameFeedback = document.getElementById("nameFeedback");
    if (proxyNameField) proxyNameField.classList.add("is-invalid");
    if (nameFeedback) nameFeedback.textContent = message;
    
    modalInstance?.show(); 
    const basicInfoTab = document.querySelector("#basic-info-tab");
    if (basicInfoTab) {
        new bootstrap.Tab(basicInfoTab).show();
    }
    const successMessage = document.getElementById("successMessage");
    if (successMessage) successMessage.style.display = "none";
    const generalErrorMessage = document.getElementById("errorMessage"); 
    if (generalErrorMessage) generalErrorMessage.style.display = "none";
  } else {
    UI.updateUIForError(message); 
    modalInstance?.hide(); 
  }
};