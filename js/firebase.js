
import {
  initializeApp,
  getApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getFunctions
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/* =========================================
   PULSE MESSENGER — FIREBASE CONFIG
========================================= */

export const firebaseConfig = {
  apiKey: "AIzaSyBsLUYT2Nxvuse9gxhMuTLjsvyvOu92yU8",
  authDomain: "project-antisemitism.firebaseapp.com",
  projectId: "project-antisemitism",
  storageBucket: "project-antisemitism.firebasestorage.app",
  messagingSenderId: "739817942010",
  appId: "1:739817942010:web:3afcf2858fa2804ebb5243",
  measurementId: "G-TN848G7VXT"
};

/* =========================================
   CONFIGURATION VALIDATION
========================================= */

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

if (!isConfigured) {
  console.error(
    "[Pulse Messenger] Firebase configuration is incomplete."
  );
}

/* =========================================
   FIREBASE INITIALIZATION
========================================= */

export const app = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);

/* =========================================
   FIREBASE SERVICES
========================================= */

// Authentication — required for phone OTP.
export const auth = getAuth(app);

// Firestore — users, contacts, chats and messages.
export const db = getFirestore(app);

// Cloud Functions region must match deployment.
export const FUNCTIONS_REGION = "us-central1";
export const functions = getFunctions(
  app,
  FUNCTIONS_REGION
);

/* =========================================
   DEVELOPMENT DIAGNOSTICS
========================================= */

console.info("[Pulse Messenger] Firebase initialized:", {
  projectId: firebaseConfig.projectId,
  authReady: Boolean(auth),
  firestoreReady: Boolean(db),
  functionsRegion: FUNCTIONS_REGION
});
