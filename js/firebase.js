import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// REQUIRED CONFIGURATION: replace every REPLACE_WITH_... value with the values from
// Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration.
// These web config values identify your project; they are not admin secrets.
// Security comes from firestore.rules and the Cloud Function. NEVER put service-account keys here.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

// Must match the region of the deployed function (functions/index.js uses us-central1).
export const FUNCTIONS_REGION = "us-central1";

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).startsWith("REPLACE_WITH"));

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
