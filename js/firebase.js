import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// REQUIRED CONFIGURATION: replace every REPLACE_WITH_... value with the values from
// Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration.
// These web config values identify your project; they are not admin secrets.
// Security comes from firestore.rules. NEVER put service-account keys or Admin SDK credentials here.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).startsWith("REPLACE_WITH"));

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
