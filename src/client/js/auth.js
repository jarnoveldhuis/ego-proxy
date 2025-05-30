// src/client/js/auth.js
import { auth } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut, // Renamed to avoid conflict
  onAuthStateChanged as firebaseOnAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

let currentUser = null; // Firebase client-side user
let idToken = null;   // Firebase ID token
let authStateInitialized = false;
const authStateChangeCallbacks = [];

let authInitializationResolver;
const authInitializationPromise = new Promise(resolve => {
    authInitializationResolver = resolve;
});

async function updateToken(user, forceRefresh = false) {
    if (user) { // Pass user object
        try {
            idToken = await user.getIdToken(forceRefresh);
        } catch (error) {
            idToken = null;
            console.error("auth.js: Error updating Firebase ID token:", error);
        }
    } else {
        idToken = null;
    }
}

firebaseOnAuthStateChanged(auth, async (user) => {
    console.log("auth.js: Firebase onAuthStateChanged triggered. Firebase User:", user ? user.uid : null);
    currentUser = user; // This is the Firebase user object
    await updateToken(currentUser, true); 

    if (!authStateInitialized) {
        authStateInitialized = true;
        if (authInitializationResolver) {
            authInitializationResolver(); 
            authInitializationResolver = null; 
        }
    }

    authStateChangeCallbacks.forEach(callback => {
        try {
            callback(currentUser, idToken); // Pass Firebase user and ID token
        } catch (e) {
            console.error("auth.js: Error in an onAuthChanged callback:", e);
        }
    });

    // Note: This event dispatches Firebase client-side auth state.
    // Your app-level auth state will come from /api/auth/status.
    document.dispatchEvent(new CustomEvent('firebaseAuthStateChangedGlobal', {
        detail: { firebaseUser: user, firebaseIdToken: idToken }
    }));
});

export function ensureAuthInitialized() {
    return authInitializationPromise;
}

export function getCurrentFirebaseUser() { // Renamed for clarity
    return currentUser;
}

export async function getIdTokenAsync(forceRefresh = false) {
    if (!currentUser) {
        idToken = null;
        return null;
    }
    if (!idToken || forceRefresh) {
        await updateToken(currentUser, true);
    }
    return idToken;
}

export async function handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("auth.js: Firebase Google login successful for user:", result.user.uid);
        
        const firebaseIdToken = await result.user.getIdToken();
        // After successful Firebase login, establish backend session
        const sessionResponse = await fetch('/api/auth/session-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseIdToken: firebaseIdToken })
        });
        const sessionData = await sessionResponse.json();
        if (!sessionResponse.ok || !sessionData.success) {
            console.error("auth.js: Failed to establish backend session:", sessionData.error || 'Unknown error');
            // Optionally sign out Firebase user if backend session fails critically
            // await firebaseSignOut(auth); 
            throw new Error(sessionData.error || "Failed to establish backend session.");
        }
        console.log("auth.js: Backend session established successfully.");
        // The firebaseOnAuthStateChanged will have updated currentUser and idToken.
        // The app should now rely on /api/auth/status for its primary logged-in state.
        return result.user; // Return Firebase user object

    } catch (error) {
        console.error("auth.js: Google login or backend session establishment error:", error);
        throw error; 
    }
}

export async function handleLogout() {
    try {
        // Sign out from Firebase client-side
        await firebaseSignOut(auth);
        console.log("auth.js: Firebase logout successful.");
        currentUser = null; // Clear client-side Firebase user state
        idToken = null;

        // Then, destroy backend session
        const response = await fetch('/api/auth/session-logout', { method: 'POST' });
        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error("auth.js: Failed to destroy backend session:", data.error || 'Unknown error');
            // Proceed with client-side logout anyway
        } else {
            console.log("auth.js: Backend session destroyed successfully.");
        }
        // firebaseOnAuthStateChanged will fire with user: null
    } catch (error) {
        console.error("auth.js: Logout error:", error);
        throw error;
    }
}

export function onFirebaseAuthChanged(callback) { // Renamed for clarity
    if (typeof callback !== 'function') {
        console.error("auth.js: Invalid callback provided to onFirebaseAuthChanged");
        return () => {};
    }
    authStateChangeCallbacks.push(callback);
    if (authStateInitialized) {
        console.log("auth.js: Firebase auth already initialized, calling onFirebaseAuthChanged callback immediately for new subscriber with user:", currentUser ? currentUser.uid : null);
        queueMicrotask(() => {
            try {
                callback(currentUser, idToken);
            } catch (e) {
                console.error("auth.js: Error in immediate onFirebaseAuthChanged callback:", e);
            }
        });
    }
    return () => {
        const index = authStateChangeCallbacks.indexOf(callback);
        if (index > -1) authStateChangeCallbacks.splice(index, 1);
    };
}

console.log("auth.js: Loaded. Firebase onAuthStateChanged listener is active.");