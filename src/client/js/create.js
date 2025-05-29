// Located in src/client/js/create.js
import { onAuthChanged, getIdTokenAsync, ensureAuthInitialized, getCurrentUser } from './auth.js'; // Import new functions

const WebSocketManager = {
  // ... (keep existing WebSocketManager code)
  clientId: null,
  environment: null,
  socket: null,
  pingInterval: null,

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
      return;
    }
    
    if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
    }

    this.socket = new WebSocket(host);
    this.bindEvents();
  },
  bindEvents() {
    this.socket.addEventListener("open", () => {
      console.log("Create.js: WebSocket is connected.");
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);
    });
    this.socket.addEventListener(
      "message",
      this.handleSocketMessage.bind(this)
    );
    this.socket.addEventListener("error", (event) =>
      console.error("Create.js: WebSocket error observed:", event)
    );
    this.socket.addEventListener("close", () => {
      console.log("Create.js: WebSocket connection closed.");
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = null;
      this.clientId = null;
    });
  },
  handleSocketMessage(event) {
    const data = JSON.parse(event.data);
    switch (data.event || data.type) {
      case "proxyCreated":
        UI.updateUIForSuccess(data);
        break;
      case "progress":
        UI.updateProgressBar(data.percentage, data.message);
        break;
      case "clientId":
        this.clientId = data.clientId;
        console.log("Create.js: Received clientId from server:", this.clientId);
        break;
      case "error":
        const errorMessage = data.message || data.details || data.error || "An unknown error occurred on the server.";
        UI.updateUIForError(errorMessage);
        break;
      case "info":
        const progressMessageElem = document.getElementById("progress-message");
        if (progressMessageElem && data.message) {
            progressMessageElem.textContent = data.message;
        }
        console.log("Create.js: Info from server:", data.message);
        break;
      default:
        break;
    }
  },
};

const UI = {
    // ... (keep existing UI object) ...
  updateProgressBar(progressPercentage, message = "") {
    const progressBar = document.querySelector(".progress-bar");
    const progressMessageElement = document.getElementById("progress-message");
    const successMessageContainer = document.getElementById("successMessage");
    if (successMessageContainer) {
      successMessageContainer.style.display = "block";
    }
    const progressBarContainer = document.getElementById("progressBarContainer");
    if (progressBarContainer && progressBarContainer.style.display === "none") {
        progressBarContainer.style.display = "block";
    }
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
    console.log("Create.js: Proxy creation process successful on server for:", data.proxyName);
    const successMessageContainer = document.getElementById("successMessage");
    const successTextElement = document.getElementById("successText");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById("progressBarContainer");

    if (successMessageContainer) {
        successMessageContainer.classList.remove("alert-dark", "d-none");
        successMessageContainer.classList.add("alert-success");
        successMessageContainer.style.display = "block";
        successMessageContainer.style.opacity = "1";
        successMessageContainer.style.visibility = "visible";
    }
    if (successTextElement) {
        const environment = WebSocketManager.environment || (window.location.hostname === 'localhost' ? 'localhost:3001' : 'ego-proxy.com');
        successTextElement.innerHTML = `Successfully created proxy: <a href="http://${data.proxySubdomain}.${environment}/meet" target="_blank" rel="noopener noreferrer" class="alert-link">${data.proxyName}</a>. Redirecting...`;
        successTextElement.style.display = "block";
    }
    if (progressBarContainer) progressBarContainer.style.display = "none";
    if (progressMessageElement) {
        progressMessageElement.textContent = "Proxy created! Redirecting...";
        progressMessageElement.style.display = "none";
    }
    const errorMessage = document.getElementById("errorMessage");
    if (errorMessage) errorMessage.style.display = "none";
    if (WebSocketManager.pingInterval) {
        clearInterval(WebSocketManager.pingInterval);
        WebSocketManager.pingInterval = null;
    }
    setTimeout(() => {
        const environment = WebSocketManager.environment || (window.location.hostname === 'localhost' ? 'localhost:3001' : 'ego-proxy.com');
        window.location.href = `http://${data.proxySubdomain}.${environment}/meet`;
    }, 3000);
  },
  updateUIForError(errorMsg) {
    console.error("Create.js: UI Update for Error:", errorMsg);
    const errorMessageContainer = document.getElementById("errorMessage");
    const errorTextElement = document.getElementById("errorText");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById("progressBarContainer");
    if (errorTextElement) errorTextElement.textContent = `An error occurred: ${errorMsg}`;
    if (errorMessageContainer) {
        errorMessageContainer.classList.remove("alert-success", "d-none");
        errorMessageContainer.classList.add("alert-danger");
        errorMessageContainer.style.display = "block";
    }
    if (progressBarContainer) progressBarContainer.style.display = "none";
    if (document.getElementById("successMessage")) document.getElementById("successMessage").style.display = "none";
    if (progressMessageElement) progressMessageElement.textContent = "Proxy creation failed.";
  },
  handleFormSuccess() {
    console.log("Create.js: Form submission successful, starting proxy creation process...");
    const progressBarContainer = document.getElementById("progressBarContainer");
    const progressMessageElement = document.getElementById("progress-message");
    if (progressBarContainer) progressBarContainer.style.display = "block";
    if (progressMessageElement) {
        progressMessageElement.textContent = "Initializing proxy creation...";
        progressMessageElement.style.display = "block"; 
    }
    const successMessageContainer = document.getElementById("successMessage");
    if (successMessageContainer) successMessageContainer.style.display = "none";
    const errorMessageContainer = document.getElementById("errorMessage");
    if (errorMessageContainer) errorMessageContainer.style.display = "none";
    let modalElement = document.getElementById("createProxyModal");
    if (modalElement) {
        let modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance && modalInstance._isShown) {
             modalInstance.hide();
        }
    }
  },
};

async function submitFormData(formData) {
  // ... (keep existing submitFormData code with detailed logging) ...
  console.log("Create.js: Submitting form data via fetch /create-proxy");
  try {
    const response = await fetch("/create-proxy", { method: "POST", body: formData });
    if (response.status === 202) {
        console.log("Create.js: Server acknowledged proxy creation request (202). Waiting for WebSocket updates.");
    } else if (response.status === 409) {
      const data = await response.json();
      handleFormError(data.message, true);
    } else if (!response.ok) {
      const data = await response.json().catch(() => ({ message: "An unknown error occurred during submission." }));
      throw new Error(data.message || `Server error: ${response.status}`);
    }
  } catch (error) {
    console.error("Create.js: Error in submitFormData:", error.message);
    handleFormError(error.message);
  }
}

async function checkUserProxiesAndRedirect() {
  // ... (keep existing checkUserProxiesAndRedirect code with detailed logging) ...
    console.log("Create.js: checkUserProxiesAndRedirect called.");
    try {
        const token = await getIdTokenAsync();
        if (!token) {
            console.log("Create.js: No token found in checkUserProxiesAndRedirect. Showing modal.");
            showCreateModalIfNeeded();
            return false; 
        }
        console.log("Create.js: Token acquired. Fetching /api/my-proxies...");

        const response = await fetch('/api/my-proxies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Could not retrieve error text.");
            console.error(`Create.js: Error fetching user proxies. Status: ${response.status}. Response: ${errorText}. Showing modal.`);
            showCreateModalIfNeeded();
            return false; 
        }

        const data = await response.json();
        console.log("Create.js: /api/my-proxies response data:", data);

        if (data.success && data.proxies && data.proxies.length > 0) {
            const firstProxy = data.proxies[0];
            const proxySubdomain = firstProxy.proxySubdomain; 
            console.log(`Create.js: Found proxy: ${proxySubdomain} (Full data: ${JSON.stringify(firstProxy)})`);
            
            const environment = WebSocketManager.environment;
            if (!environment) {
                console.error("Create.js: WebSocketManager.environment not set! Cannot construct redirect URL. Showing modal.");
                showCreateModalIfNeeded();
                return false;
            }
            console.log(`Create.js: Using environment: ${environment}`);

            const protocol = window.location.protocol;
            const redirectUrl = `${protocol}//${proxySubdomain}.${environment}/meet`;
            
            console.log(`Create.js: User has proxies. Redirecting to: ${redirectUrl}`);
            window.location.href = redirectUrl;
            return true; 
        } else {
            if (!data.success) console.log("Create.js: /api/my-proxies call was not successful (data.success is false).");
            if (!data.proxies || data.proxies.length === 0) console.log("Create.js: No proxies found for user (data.proxies is empty or missing).");
            console.log("Create.js: Logged in, but no proxies to redirect to, or API call issue. Showing modal.");
            showCreateModalIfNeeded();
            return false;
        }
    } catch (error) {
        console.error("Create.js: Exception in checkUserProxiesAndRedirect:", error);
        showCreateModalIfNeeded();
        return false;
    }
}

function showCreateModalIfNeeded() {
  // ... (keep existing showCreateModalIfNeeded code) ...
    if (window.location.pathname === "/" || window.location.pathname === "/create") {
        const modalElement = document.getElementById("createProxyModal");
        if (modalElement) {
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (!modalInstance || (modalInstance && !modalInstance._isShown && !modalElement.classList.contains('show'))) { 
                console.log("Create.js: showCreateModalIfNeeded() is now showing the modal.");
                if (!WebSocketManager.socket || 
                    (WebSocketManager.socket.readyState !== WebSocket.OPEN && WebSocketManager.socket.readyState !== WebSocket.CONNECTING)) {
                    console.log("Create.js: Modal to be shown, ensuring WebSocket is initialized.");
                    WebSocketManager.init(); 
                }
                const createProxyModalBs = new bootstrap.Modal(modalElement);
                createProxyModalBs.show();
            } else {
                 // console.log("Create.js: showCreateModalIfNeeded() called, but modal already shown or is in process of showing.");
            }
        } else {
            console.error("Create.js: createProxyModal element not found in showCreateModalIfNeeded().");
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => { // Make DOMContentLoaded async
    console.log("Create.js: DOMContentLoaded started.");
    WebSocketManager.init(); 

    const modalElement = document.getElementById("createProxyModal");
    if (modalElement) {
        modalElement.addEventListener("show.bs.modal", function (event) {
            // ... (keep existing modal 'show.bs.modal' event listener content) ...
            console.log("Create.js: Create Proxy Modal 'show.bs.modal' event triggered.");
            if (!WebSocketManager.socket || (WebSocketManager.socket.readyState !== WebSocket.OPEN && WebSocketManager.socket.readyState !== WebSocket.CONNECTING) ) {
                 WebSocketManager.init();
            }
            const progressBar = document.querySelector(".progress-bar");
            if (progressBar) {
                progressBar.style.width = "0%";
                progressBar.setAttribute("aria-valuenow", "0");
                progressBar.textContent = "0%";
            }
            const progressMessageElement = document.getElementById("progress-message");
            if (progressMessageElement) {
                progressMessageElement.textContent = "";
                progressMessageElement.style.display = "none";
            }
            const progressBarContainer = document.getElementById("progressBarContainer");
            if (progressBarContainer) progressBarContainer.style.display = "none"; 
            const successMessage = document.getElementById("successMessage");
            if (successMessage) successMessage.style.display = "none";
            const errorMessage = document.getElementById("errorMessage");
            if (errorMessage) errorMessage.style.display = "none";
        });
    }

    console.log("Create.js: Waiting for Firebase auth to initialize via ensureAuthInitialized()...");
    try {
        await ensureAuthInitialized(); // Wait for the promise from auth.js
        console.log("Create.js: Firebase auth initialization confirmed by ensureAuthInitialized().");

        // Auth is initialized, now get the current user state and decide.
        const user = getCurrentUser(); // Get the settled user state from auth.js

        if (window.location.pathname === "/" || window.location.pathname === "/create") {
            if (user) {
                console.log("Create.js: (Post-init check) User IS logged in. UserID:", user.uid, ". Checking proxies.");
                await checkUserProxiesAndRedirect();
            } else {
                console.log("Create.js: (Post-init check) User IS NOT logged in. Showing modal.");
                showCreateModalIfNeeded();
            }
        }

        // Optionally, you can still set up an onAuthChanged listener here
        // if you need to react to *subsequent* auth changes (e.g., user logs out while on the page).
        // For this specific redirect-or-show-modal-on-load task, the above check after ensureAuthInitialized might be sufficient.
        // If you add it, be careful to avoid redundant calls or infinite loops.
        onAuthChanged(async (updatedUser) => {
            // This listener handles auth changes *after* the initial page load decision.
            console.log("Create.js: Subsequent onAuthChanged event. New user state:", updatedUser ? updatedUser.uid : null);
            if (window.location.pathname === "/" || window.location.pathname === "/create") {
                 // Avoid re-running the initial heavy check if modal is already visible and user is null, etc.
                 // Or simply re-evaluate based on updatedUser:
                if (updatedUser) {
                    // If user logs in while on the page (e.g. via another tab, or if possible via UI here)
                    // We might want to re-run the check if no redirect has happened yet.
                    // This part needs careful consideration of the exact desired UX for subsequent changes.
                    // For now, the main goal is the initial load behavior.
                    // Let's assume for now if they are on create page and log in, we try to redirect.
                    console.log("Create.js: User logged in subsequently. Re-checking proxies.");
                    await checkUserProxiesAndRedirect();

                } else {
                    // User logged out while on the page.
                    console.log("Create.js: User logged out subsequently. Ensuring modal is available.");
                    showCreateModalIfNeeded(); // Should show modal as they are now logged out.
                }
            }
        });

    } catch (error) {
        console.error("Create.js: Error during auth initialization or initial handling:", error);
        if (window.location.pathname === "/" || window.location.pathname === "/create") {
            showCreateModalIfNeeded(); // Fallback
        }
    }

    const createProxyForm = document.getElementById("createProxyForm");
    if (createProxyForm) {
        // ... (keep existing form submit listener) ...
        createProxyForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const submitBtn = document.getElementById('submitBtn');
            if(submitBtn) submitBtn.disabled = true;

            console.log("Create.js: Create Proxy Form submitted.");
            const formData = new FormData(this);
            const proxyName = formData.get("proxyName").replace(/ /g, "-");
            formData.set("proxyName", proxyName);

            if (!WebSocketManager.clientId) {
                console.error("Create.js: WebSocket ClientID not available. Re-initializing WebSocket and retrying form submission shortly.");
                WebSocketManager.init(); 
                setTimeout(() => {
                    if (!WebSocketManager.clientId) {
                        UI.updateUIForError("Failed to get a client ID from the server. Please refresh and try again.");
                        if(submitBtn) submitBtn.disabled = false; 
                        return;
                    }
                    formData.append("clientId", WebSocketManager.clientId);
                    console.log("Create.js: Retrying form submission with new clientId.");
                    UI.handleFormSuccess(); 
                    submitFormData(formData);
                }, 2500);
                return;
            }
            
            formData.append("clientId", WebSocketManager.clientId);
            UI.handleFormSuccess(); 
            submitFormData(formData);
            // Consider re-enabling button in .catch or if submitFormData indicates non-redirecting failure
        });
    }
});

function handleFormError(message, is409 = false) {
    // ... (keep existing handleFormError code) ...
  console.error("Create.js: Handling Form Error:", message, "is409:", is409);
  const modalElement = document.getElementById("createProxyModal");
  let modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (!modalInstance && modalElement) { 
      modalInstance = new bootstrap.Modal(modalElement);
  }

  const progressBarContainer = document.getElementById("progressBarContainer");
  if (progressBarContainer) progressBarContainer.style.display = "none";
  const progressMessageElement = document.getElementById("progress-message");
  if (progressMessageElement) progressMessageElement.style.display = "none";
  
  const submitBtn = document.getElementById('submitBtn'); 
  if(submitBtn) submitBtn.disabled = false;

  if (is409) {
    const proxyNameField = document.getElementById("proxyName");
    const nameFeedback = document.getElementById("nameFeedback");
    if (proxyNameField) proxyNameField.classList.add("is-invalid");
    if (nameFeedback) nameFeedback.textContent = message;
    
    if (modalElement && (!modalInstance || !modalInstance._isShown)) modalInstance?.show();
    
    const basicInfoTab = document.querySelector("#basic-info-tab"); 
    if (basicInfoTab) new bootstrap.Tab(basicInfoTab).show();
    
    const successMessage = document.getElementById("successMessage");
    if (successMessage) successMessage.style.display = "none";
    const generalErrorMessage = document.getElementById("errorMessage"); 
    if (generalErrorMessage && generalErrorMessage.style.display !== 'none') { 
    } else if (generalErrorMessage) { 
         UI.updateUIForError(message); 
    }
  } else {
    UI.updateUIForError(message); 
  }
};