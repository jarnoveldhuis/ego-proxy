// src/client/js/auth.js
import { auth } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

let currentUser = null;
let idToken = null;
let authStateInitialized = false; // True after the first onAuthStateChanged event
const authStateChangeCallbacks = [];

// Promise that resolves when the first auth state is known
let authInitializationResolver;
const authInitializationPromise = new Promise(resolve => {
    authInitializationResolver = resolve;
});

async function updateToken(forceRefresh = false) {
    if (auth.currentUser) {
        try {
            idToken = await auth.currentUser.getIdToken(forceRefresh);
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
    await updateToken(true); 

    if (!authStateInitialized) {
        authStateInitialized = true;
        if (authInitializationResolver) {
            authInitializationResolver(); // Resolve the promise
            authInitializationResolver = null; 
        }
    }

    // Notify all subscribed callbacks
    authStateChangeCallbacks.forEach(callback => {
        try {
            callback(currentUser, idToken);
        } catch (e) {
            console.error("auth.js: Error in an onAuthChanged callback:", e);
        }
    });

    document.dispatchEvent(new CustomEvent('authStateChangedGlobal', {
        detail: { loggedIn: !!user, user: user, token: idToken }
    }));
});

// Export this function so other modules can wait for initialization
export function ensureAuthInitialized() {
    return authInitializationPromise;
}

export function getCurrentUser() {
    return currentUser;
}

export async function getIdTokenAsync(forceRefresh = false) {
    if (!auth.currentUser) {
        idToken = null;
        return null;
    }
    if (!idToken || forceRefresh) {
        await updateToken(true);
    }
    return idToken;
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
            throw error; 
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
            throw error;
        });
}

export function onAuthChanged(callback) {
    if (typeof callback !== 'function') {
        console.error("auth.js: Invalid callback provided to onAuthChanged");
        return () => {}; // Return a no-op unsubscribe function
    }
    
    authStateChangeCallbacks.push(callback);
    
    // If auth state is already initialized, call back immediately with the current state.
    if (authStateInitialized) {
        console.log("auth.js: Auth state already initialized, calling onAuthChanged callback immediately for new subscriber with user:", currentUser ? currentUser.uid : null);
        // Use queueMicrotask to allow the calling script to finish its current execution block
        // before the callback is invoked, preventing potential re-entrancy issues.
        queueMicrotask(() => {
            try {
                callback(currentUser, idToken);
            } catch (e) {
                console.error("auth.js: Error in immediate onAuthChanged callback (for initialized state):", e);
            }
        });
    }

    // Return an unsubscribe function
    return () => {
        const index = authStateChangeCallbacks.indexOf(callback);
        if (index > -1) {
            authStateChangeCallbacks.splice(index, 1);
        }
    };
}

console.log("auth.js: Loaded. Firebase onAuthStateChanged listener is active.");