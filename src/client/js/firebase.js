// Import the functions you need from the SDKs you need
// Using Firebase v9+ modular SDK from CDN
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDLMiN7RFXBk745Av7Y6K8STTogP-OpMp4",
  authDomain: "ego-proxy.firebaseapp.com",
  projectId: "ego-proxy",
  storageBucket: "ego-proxy.firebasestorage.app",
  messagingSenderId: "500271883351",
  appId: "1:500271883351:web:5742cddcddd9e62b5cef12",
  measurementId: "G-TEPXZ4C3NE"
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Export auth and db instances
export const auth = getAuth(app);
export const db = getFirestore(app);

// Optional: Initialize Analytics
// const analytics = getAnalytics(app);