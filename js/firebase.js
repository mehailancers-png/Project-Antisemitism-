import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// Web app config. These values identify the project and are not admin secrets.
// Security comes from firestore.rules and the Cloud Function. Never put service-account keys here.
export const firebaseConfig = {
  apiKey: "AIzaSyBsLUYT2Nxvuse9gxhMuTLjsvyvOu92yU8",
  authDomain: "project-antisemitism.firebaseapp.com",
  projectId: "project-antisemitism",
  storageBucket: "project-antisemitism.firebasestorage.app",
  messagingSenderId: "739817942010",
  appId: "1:739817942010:web:3afcf2858fa2804ebb5243",
  measurementId: "G-TN848G7VXT"
};

// Must match the region of the deployed function (functions/index.js uses us-central1).
export const FUNCTIONS_REGION = "us-central1";

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).startsWith("REPLACE_WITH"));

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Analytics is optional and runs only where the browser supports it. A failure never affects the app.
isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});
