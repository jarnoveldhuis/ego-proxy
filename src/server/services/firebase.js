const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Initialize the app
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Get Firestore instance
const db = admin.firestore();

// Get Auth instance
const auth = admin.auth();

// Get Storage bucket instance
const bucket = admin.storage().bucket();

module.exports = {
  app,
  db,
  auth,
  admin,
  bucket
}; 

