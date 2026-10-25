
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Pulse Messenger — Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBsLUYT2Nxvuse9gxhMuTLjsvyvOu92yU8",
  authDomain: "project-antisemitism.firebaseapp.com",
  projectId: "project-antisemitism",
  storageBucket: "project-antisemitism.firebasestorage.app",
  messagingSenderId: "739817942010",
  appId: "1:739817942010:web:3afcf2858fa2804ebb5243",
  measurementId: "G-TN848G7VXT"
};

// Cloud Functions deployment region
export const FUNCTIONS_REGION = "us-central1";

// Validate required configuration values
const requiredKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
  "messagingSenderId"
];

export const isConfigured = requiredKeys.every((key) => {
  const value = firebaseConfig[key];

  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("REPLACE_WITH")
  );
});

// Initialize Firebase only once
export const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
