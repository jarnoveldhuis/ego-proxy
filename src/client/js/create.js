// Located in src/client/js/create.js
import { ensureAuthInitialized, onFirebaseAuthChanged, handleGoogleLogin } from './auth.js';

const WebSocketManager = {
  clientId: null,
  environment: null,
  socket: null,
  pingInterval: null,

  init() {
    const currentHostname = window.location.hostname; // E.g., 'myapp.local' or 'jarno.myapp.local'
    const currentPort =
      window.location.port ||
      (window.location.protocol === "https:" ? "443" : "80"); // Default to 3001 if not specified in URL or standard ports

    // Determine if this is a local development environment based on hostname
    // Assumes your local dev domains will end with '.local' (e.g., myapp.local, jarno.myapp.local)
    // or is exactly 'localhost'
    const isLocalDev =
      currentHostname.endsWith(".local") || currentHostname === "localhost";

    if (isLocalDev) {
      this.wsHost = `${
        window.location.protocol === "https:" ? "wss" : "ws"
      }://${currentHostname}:${currentPort}`;
      // For HTTP redirects, the base needs to allow for different subdomains.
      // If currentHostname is 'myapp.local', base is 'myapp.local:port'.
      // If currentHostname is 'jarno.myapp.local', base is still 'myapp.local:port' for forming new subdomains.
      const domainParts = currentHostname.split(".");
      const rootDevDomain =
        domainParts.length > 1 &&
        domainParts[domainParts.length - 1] === "local"
          ? domainParts.slice(-2).join(".") // e.g., myapp.local
          : currentHostname; // Fallback to currentHostname if not in expected *.local pattern
      this.httpEnvironmentBase = `${rootDevDomain}:${currentPort}`; // e.g., "myapp.local:3001"
    } else {
      // Production settings
      this.wsHost = "wss://ego-proxy.com"; // Replace with your actual production WebSocket domain if different
      this.httpEnvironmentBase = "ego-proxy.com"; // Your actual production domain
    }

    console.log(
      `Create.js: WebSocketManager initialized. wsHost: ${this.wsHost}, httpEnvironmentBase: ${this.httpEnvironmentBase}`
    );

    // Prevent re-initializing WebSocket if already open or connecting
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.socket = new WebSocket(this.wsHost);
    this.bindEvents();
  },
  bindEvents() {
    this.socket.addEventListener("open", () => {
      console.log("Create.js: WebSocket is connected.");
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
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
    try {
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
          console.log(
            "Create.js: Received clientId from server:",
            this.clientId
          );
          break;
        case "error":
          const errorMessage =
            data.message ||
            data.details ||
            data.error ||
            "An unknown error occurred on the server.";
          UI.updateUIForError(errorMessage);
          break;
        case "info":
          const progressMessageElem =
            document.getElementById("progress-message");
          if (progressMessageElem && data.message) {
            progressMessageElem.textContent = data.message;
          }
          break;
        case "pong":
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(
        "Create.js: Error parsing WebSocket message:",
        e,
        event.data
      );
    }
  },
};

const UI = {
  updateProgressBar(progressPercentage, message = "") {
    const progressBar = document.querySelector(".progress-bar");
    const progressMessageElement = document.getElementById("progress-message");
    const successMessageContainer = document.getElementById("successMessage");

    if (successMessageContainer)
      successMessageContainer.style.display = "block";
    const progressBarContainer = document.getElementById(
      "progressBarContainer"
    );
    if (progressBarContainer) progressBarContainer.style.display = "block";
    if (progressMessageElement) {
      progressMessageElement.textContent = message;
      progressMessageElement.style.display = message ? "block" : "none";
    }
    if (progressBar) {
      progressBar.style.width = `${progressPercentage}%`;
      progressBar.setAttribute("aria-valuenow", progressPercentage);
      progressBar.textContent = `${progressPercentage}%`;
    }
  },
  updateUIForSuccess(data) {
    console.log(
      "Create.js: Proxy creation process successful for:",
      data.proxyName
    );
    const successMessageContainer = document.getElementById("successMessage");
    const successTextElement = document.getElementById("successText");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById(
      "progressBarContainer"
    );

    if (successMessageContainer) {
      successMessageContainer.classList.remove("alert-dark");
      successMessageContainer.classList.add("alert-success");
      successMessageContainer.style.display = "block";
    }
    if (successTextElement) {
      const environment =
        WebSocketManager.environment ||
        (window.location.hostname === "localhost"
          ? "localhost:3001"
          : "ego-proxy.com");
      successTextElement.innerHTML = `Successfully created proxy: <a href="http://${data.proxySubdomain}.${environment}/meet" target="_blank" rel="noopener noreferrer" class="alert-link">${data.proxyName}</a>. Redirecting...`;
      successTextElement.style.display = "block";
    }
    if (progressBarContainer) progressBarContainer.style.display = "none";
    if (progressMessageElement) progressMessageElement.style.display = "none";
    const errorMessageContainer = document.getElementById("errorMessage");
    if (errorMessageContainer) errorMessageContainer.style.display = "none";

    if (WebSocketManager.pingInterval) {
      clearInterval(WebSocketManager.pingInterval);
      WebSocketManager.pingInterval = null;
    }
    setTimeout(() => {
      const environment =
        WebSocketManager.environment ||
        (window.location.hostname === "localhost"
          ? "localhost:3001"
          : "ego-proxy.com");
      window.location.href = `http://${data.proxySubdomain}.${environment}/meet`;
    }, 3000);
  },
  updateUIForError(errorMsg) {
    console.error("Create.js: UI Update for Error:", errorMsg);
    const errorMessageContainer = document.getElementById("errorMessage");
    const progressMessageElement = document.getElementById("progress-message");
    const progressBarContainer = document.getElementById(
      "progressBarContainer"
    );
    const successMessageContainer = document.getElementById("successMessage");

    if (errorMessageContainer) {
      errorMessageContainer.textContent = `An error occurred: ${errorMsg}`;
      errorMessageContainer.classList.remove(
        "alert-success",
        "d-none",
        "alert-dark"
      );
      errorMessageContainer.classList.add("alert-danger");
      errorMessageContainer.style.display = "block";
    }
    if (progressBarContainer) progressBarContainer.style.display = "none";
    if (successMessageContainer) successMessageContainer.style.display = "none";
    if (progressMessageElement) progressMessageElement.style.display = "none";
  },
  handleFormSuccess() {
    console.log(
      "Create.js: Form submission acknowledged by server, starting proxy creation process..."
    );
    const progressBarContainer = document.getElementById(
      "progressBarContainer"
    );
    const progressMessageElement = document.getElementById("progress-message");
    const successMessageContainer = document.getElementById("successMessage");

    if (successMessageContainer) {
      successMessageContainer.style.display = "block";
      successMessageContainer.classList.remove("alert-success", "alert-danger");
      successMessageContainer.classList.add("alert-dark");
    }
    if (progressBarContainer) progressBarContainer.style.display = "block";
    if (progressMessageElement) {
      progressMessageElement.textContent = "Initializing proxy creation...";
      progressMessageElement.style.display = "block";
    }
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

function toggleOtherEthnicity(select) {
  const otherEthnicityContainer = document.getElementById(
    "otherEthnicityContainer"
  );
  if (otherEthnicityContainer) {
    otherEthnicityContainer.style.display =
      select.value === "Other" ? "block" : "none";
  }
}

async function submitFormData(formData) {
  console.log("Create.js: Submitting form data via fetch /create-proxy");
  try {
    const response = await fetch("/create-proxy", {
      method: "POST",
      body: formData,
    });
    if (response.status === 202) {
      console.log(
        "Create.js: Server acknowledged proxy creation request (202)."
      );
    } else if (response.status === 409) {
      const data = await response.json();
      handleFormError(data.message, true);
    } else {
      const data = await response
        .json()
        .catch(() => ({
          message: `Server error: ${response.status}. Please try again.`,
        }));
      throw new Error(data.message);
    }
  } catch (error) {
    console.error("Create.js: Error in submitFormData:", error.message);
    handleFormError(error.message);
  }
}

async function checkAppLoginStatusAndRedirect() {
  console.log(
    "Create.js: checkAppLoginStatusAndRedirect called - checking /api/auth/status."
  );
  try {
    // First, check if appUserFromServer indicates logged-in status (if available and fresh enough)
    // For simplicity and to always get the latest, we'll fetch, but this is an optimization point.
    // if (window.appUserFromServer && window.appUserFromServer.isLoggedIn) {
    //   console.log("Create.js: Initial check from server data indicates logged in.");
    //   // Proceed to fetch proxies directly if appUserFromServer is considered reliable
    // }

    const statusResponse = await fetch("/api/auth/status");
    if (!statusResponse.ok) {
      console.error(
        "Create.js: Error fetching app auth status. Status:",
        statusResponse.status
      );
      // showCreateModalIfNeeded();
      return false;
    }
    const statusData = await statusResponse.json();
    console.log("Create.js: /api/auth/status response:", statusData);

    if (statusData.success && statusData.loggedIn) {
      console.log(
        "Create.js: App user is logged in (session valid). UserID:",
        statusData.user.userId,
        ". Fetching proxies."
      );
      const proxiesResponse = await fetch("/api/my-proxies");
      if (!proxiesResponse.ok) {
        const proxyErrorText = await proxiesResponse
          .text()
          .catch(() => "Could not get proxy error text");
        console.error(
          "Create.js: Error fetching user proxies. Status:",
          proxiesResponse.status,
          "Error:",
          proxyErrorText
        );
        // showCreateModalIfNeeded();
        return false;
      }
      const proxiesData = await proxiesResponse.json();
      console.log(
        "Create.js: /api/my-proxies response (session based):",
        proxiesData
      );

      if (
        proxiesData.success &&
        proxiesData.proxies &&
        proxiesData.proxies.length > 0
      ) {
        const firstProxy = proxiesData.proxies[0];
        const proxySubdomain = firstProxy.proxySubdomain; // e.g., "jarno2"

        const environmentBase = WebSocketManager.httpEnvironmentBase; // Should be "myapp.local:3001" for local dev
        const protocol = window.location.protocol; // Should be "http:" if you accessed via http://

        if (!environmentBase) {
          console.error(
            "Create.js: CRITICAL - httpEnvironmentBase is not set in WebSocketManager. Cannot redirect."
          );
          // showCreateModalIfNeeded();
          return false;
        }

        const redirectUrl = `${protocol}//${proxySubdomain}.${environmentBase}/meet`;

        console.log(
          `Create.js: DEBUG: Protocol: ${protocol}, Subdomain: ${proxySubdomain}, EnvironmentBase: ${environmentBase}`
        );
        console.log(
          `Create.js: User has session and proxies. Redirecting to: ${redirectUrl}`
        );
        window.location.href = redirectUrl;
        return true;
      } else {
        console.log(
          "Create.js: User has session but no proxies (or API issue). Showing modal."
        );
        // showCreateModalIfNeeded();
        return false;
      }
    } else {
      console.log(
        "Create.js: App user is NOT logged in (no valid session). Showing modal."
      );
      // showCreateModalIfNeeded();
      return false;
    }
  } catch (error) {
    console.error(
      "Create.js: Exception in checkAppLoginStatusAndRedirect:",
      error
    );
    // showCreateModalIfNeeded();
    return false;
  }
}

function showCreateModalIfNeeded() {
  if (
    window.location.pathname !== "/" &&
    window.location.pathname !== "/create"
  ) {
    return;
  }
  const modalElement = document.getElementById("createProxyModal");
  if (modalElement) {
    const isModalVisible = modalElement.classList.contains("show");
    if (!isModalVisible) {
      console.log(
        "Create.js: showCreateModalIfNeeded() is now showing the modal."
      );
      if (
        !WebSocketManager.socket ||
        (WebSocketManager.socket.readyState !== WebSocket.OPEN &&
          WebSocketManager.socket.readyState !== WebSocket.CONNECTING)
      ) {
        WebSocketManager.init();
      }
      let modalInstance = bootstrap.Modal.getInstance(modalElement);
      if (!modalInstance) modalInstance = new bootstrap.Modal(modalElement);
      modalInstance.show();
    }
  } else {
    console.error("Create.js: createProxyModal element not found.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Create.js: DOMContentLoaded started.");
  WebSocketManager.init();

  const modalElement = document.getElementById("createProxyModal");
  if (modalElement) {
    modalElement.addEventListener("show.bs.modal", function (event) {
      console.log(
        "Create.js: Create Proxy Modal 'show.bs.modal' event triggered."
      );
      if (
        !WebSocketManager.socket ||
        (WebSocketManager.socket.readyState !== WebSocket.OPEN &&
          WebSocketManager.socket.readyState !== WebSocket.CONNECTING)
      ) {
        WebSocketManager.init();
      }
      const progressBar = modalElement.querySelector(".progress-bar"); // Scope to modal
      if (progressBar) {
        /* ... reset ... */
      }
      // Ensure other UI resets are scoped correctly if they are inside the modal
      // Messages like progress-message, progressBarContainer, successMessage are outside the modal in create.ejs
      document
        .getElementById("progress-message")
        ?.style.setProperty("display", "none", "important");
      document
        .getElementById("progressBarContainer")
        ?.style.setProperty("display", "none", "important");
      document
        .getElementById("successMessage")
        ?.style.setProperty("display", "none", "important");

      const errorMessageElement = modalElement.querySelector("#errorMessage"); // Error is inside modal
      if (errorMessageElement) errorMessageElement.style.display = "none";

      const form = document.getElementById("createProxyForm");
      if (form) form.reset();
      const proxyNameField = document.getElementById("proxyName");
      if (proxyNameField) proxyNameField.classList.remove("is-invalid");
      const nameFeedback = document.getElementById("nameFeedback");
      if (nameFeedback)
        nameFeedback.textContent =
          "Only alphanumeric characters and hyphens are allowed.";
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  console.log(
    "Create.js: Ensuring Firebase client is initialized (from auth.js)..."
  );
  // Use window.appUserFromServer for initial check if available and you trust its freshness
  if (window.appUserFromServer && window.appUserFromServer.isLoggedIn) {
    console.log(
      "Create.js: Initial check from server data indicates logged in. Checking proxies."
    );
    await checkAppLoginStatusAndRedirect(); // Still good to verify with API, but could optimize
  } else {
    // If not logged in per server, or if appUserFromServer is not available,
    // wait for Firebase client and then check API for session.
    await ensureAuthInitialized();
    console.log("Create.js: Firebase client initialization confirmed.");
    if (
      window.location.pathname === "/" ||
      window.location.pathname === "/create"
    ) {
      await checkAppLoginStatusAndRedirect();
    }
  }

  const loginButtonOnCreatePage = document.getElementById('loginButtonOnCreatePage');
  if (loginButtonOnCreatePage) {
      // Initially hide it if the server already told us the user is logged in
      if (window.appUserFromServer && window.appUserFromServer.isLoggedIn) {
          loginButtonOnCreatePage.style.display = 'none';
      }

      loginButtonOnCreatePage.addEventListener('click', async () => {
          console.log("Create.js: Login button on create page clicked.");
          try {
              const firebaseUser = await handleGoogleLogin(); // From auth.js
              if (firebaseUser) {
                  console.log("Create.js: Google login successful from create page. Firebase UID:", firebaseUser.uid);
                  // After successful login and backend session creation (handled by auth.js),
                  // checkAppLoginStatusAndRedirect will be triggered by onFirebaseAuthChanged,
                  // or you can call it directly here.
                  // The onFirebaseAuthChanged listener is generally preferred for reacting.
                  // For immediate feedback, you might re-check:
                  // await checkAppLoginStatusAndRedirect(); 
                  // However, the existing onFirebaseAuthChanged should handle this.
                  loginButtonOnCreatePage.style.display = 'none'; // Hide after successful login attempt
              }
          } catch (error) {
              console.error("Create.js: Error during login from create page:", error);
              // You could display an error message to the user here.
              UI.updateUIForError(error.message || "Login failed. Please try again.");
          }
      });
  }

  // Modify the onFirebaseAuthChanged listener to also update the login button visibility
  onFirebaseAuthChanged(async (firebaseUser) => {
      console.log("Create.js: Subsequent onFirebaseAuthChanged (Firebase client) event. Firebase User:", firebaseUser ? firebaseUser.uid : null);
      if (window.location.pathname === "/" || window.location.pathname === "/create") {
          console.log("Create.js: Re-checking app login status due to subsequent Firebase auth change.");
          const redirected = await checkAppLoginStatusAndRedirect(); 

          // Update login button visibility based on the new app state
          // (fetch inside checkAppLoginStatusAndRedirect will update currentAppUser which /api/auth/status gives)
          const statusResponse = await fetch('/api/auth/status'); // Re-fetch status for certainty
          const statusData = await statusResponse.json();

          if (loginButtonOnCreatePage) {
              if (statusData.loggedIn) {
                  loginButtonOnCreatePage.style.display = 'none';
              } else {
                  loginButtonOnCreatePage.style.display = 'inline-block'; // Or your default display style
              }
          }
      }
  });

  const createProxyForm = document.getElementById("createProxyForm");
  if (createProxyForm) {
    const ethnicitySelect = document.getElementById("ethnicity");
    if (ethnicitySelect) {
      ethnicitySelect.addEventListener("change", function () {
        toggleOtherEthnicity(this);
      });
    }
    createProxyForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.disabled = true;
      console.log("Create.js: Create Proxy Form submitted.");
      const formData = new FormData(this);
      const proxyNameInput = formData.get("proxyName");
      if (proxyNameInput && typeof proxyNameInput === "string") {
        formData.set("proxyName", proxyNameInput.replace(/ /g, "-"));
      } else {
        handleFormError("Proxy Name is invalid.");
        return;
      }
      if (!WebSocketManager.clientId) {
        console.error(
          "Create.js: WebSocket ClientID not available. Re-init WS & retry."
        );
        UI.updateProgressBar(0, "Re-connecting to server...");
        WebSocketManager.init();
        setTimeout(() => {
          if (!WebSocketManager.clientId) {
            handleFormError("Still couldn't get ClientID. Please refresh.");
            return;
          }
          formData.append("clientId", WebSocketManager.clientId);
          UI.handleFormSuccess();
          submitFormData(formData);
        }, 3000);
        return;
      }
      formData.append("clientId", WebSocketManager.clientId);
      UI.handleFormSuccess();
      submitFormData(formData);
    });
  }
});

function handleFormError(message, is409 = false) {
  console.error("Create.js: Handling Form Error:", message, "is409:", is409);
  const modalElement = document.getElementById("createProxyModal");
  let modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (!modalInstance && modalElement)
    modalInstance = new bootstrap.Modal(modalElement);

  document
    .getElementById("successMessage")
    ?.style.setProperty("display", "none", "important");
  document
    .getElementById("progressBarContainer")
    ?.style.setProperty("display", "none", "important");
  document
    .getElementById("progress-message")
    ?.style.setProperty("display", "none", "important");

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) submitBtn.disabled = false;

  const errorMessageElement = modalElement?.querySelector("#errorMessage"); // Error message is inside the modal
  if (errorMessageElement) {
    errorMessageElement.textContent = message;
    errorMessageElement.style.display = "block";
  }

  if (is409) {
    const proxyNameField = document.getElementById("proxyName");
    const nameFeedback = document.getElementById("nameFeedback");
    if (proxyNameField) proxyNameField.classList.add("is-invalid");
    if (nameFeedback) {
      nameFeedback.textContent = message;
      nameFeedback.style.display = "block";
    }
    if (errorMessageElement) errorMessageElement.style.display = "none";
  } else {
    const nameFeedback = document.getElementById("nameFeedback");
    if (nameFeedback) nameFeedback.style.display = "none";
    const proxyNameField = document.getElementById("proxyName");
    if (proxyNameField) proxyNameField.classList.remove("is-invalid");
  }

  if (modalElement && (!modalInstance || !modalInstance._isShown)) {
    modalInstance?.show();
  }
}
