// src/client/js/auth.js
import { auth } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged // Alias to avoid conflict if needed elsewhere
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

let currentUser = null;
let idToken = null;
let authStateInitialized = false; // Flag to indicate initial auth check is done
const authStateChangeCallbacks = []; // Store callbacks

async function updateToken(forceRefresh = false) {
    if (auth.currentUser) {
        try {
            idToken = await auth.currentUser.getIdToken(forceRefresh);
            // console.log("auth.js: Token updated", idToken ? "Exists" : "Null");
        } catch (error) {
            idToken = null;
            console.error("auth.js: Error updating token:", error);
        }
    } else {
        idToken = null;
    }
}

// Main Firebase Auth Listener
firebaseOnAuthStateChanged(auth, async (user) => {
    console.log("auth.js: Firebase onAuthStateChanged triggered. User:", user ? user.uid : null);
    currentUser = user;
    await updateToken(true); // Force refresh the token
    authStateInitialized = true;

    // Notify all subscribed callbacks
    authStateChangeCallbacks.forEach(callback => callback(user, idToken));

    // Dispatch a custom event as well, for broader use if needed
    document.dispatchEvent(new CustomEvent('authStateChangedGlobal', {
        detail: {
            loggedIn: !!user,
            user: user,
            token: idToken
        }
    }));
});

// Exported functions
export function getCurrentUser() {
    return currentUser;
}

export async function getIdTokenAsync(forceRefresh = false) {
    if (!auth.currentUser) {
        // console.warn("auth.js: getIdTokenAsync called, but no user.");
        idToken = null; // Clear cached token
        return null;
    }
    // If the cached token is null or forced, try to get a fresh one
    if (!idToken || forceRefresh) {
        // console.log("auth.js: getIdTokenAsync attempting to refresh token.");
        await updateToken(true); // updateToken will set the global idToken
    }
    return idToken; // Return the (potentially updated) cached token
}

export function handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider)
        .then((result) => {
            console.log("auth.js: Google login successful for user:", result.user.uid);
            // onAuthStateChanged will handle currentUser and idToken updates
            return result.user;
        })
        .catch((error) => {
            console.error("auth.js: Google login error:", error.code, error.message);
            throw error; // Re-throw for the caller to handle
        });
}

export function handleLogout() {
    return signOut(auth)
        .then(() => {
            console.log("auth.js: Logout successful.");
            // onAuthStateChanged will handle currentUser and idToken updates
        })
        .catch((error) => {
            console.error("auth.js: Logout error:", error);
            throw error; // Re-throw
        });
}

// Function for other modules (like chat.js) to subscribe to auth changes
export function onAuthChanged(callback) {
    if (typeof callback !== 'function') {
        console.error("auth.js: Invalid callback provided to onAuthChanged");
        return () => {}; // Return a no-op unsubscribe function
    }
    
    authStateChangeCallbacks.push(callback);
    
    // If auth state is already initialized, call back immediately
    if (authStateInitialized) {
        // console.log("auth.js: Auth state already initialized, calling callback immediately.");
        callback(currentUser, idToken);
    }

    // Return an unsubscribe function
    return () => {
        const index = authStateChangeCallbacks.indexOf(callback);
        if (index > -1) {
            authStateChangeCallbacks.splice(index, 1);
        }
    };
}

// Initial attempt to update token on script load
// updateToken(); // onAuthStateChanged will handle the initial state
console.log("auth.js: Loaded. Waiting for Firebase onAuthStateChanged.");