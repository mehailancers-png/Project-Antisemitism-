
import { auth, db } from "./firebase.js";

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================================
   PULSE MESSENGER — ERROR HANDLING
========================================= */

const ERROR_MESSAGES = {
  "auth/invalid-phone-number":
    "Invalid phone number. Use your country code, e.g. +919876543210.",

  "auth/missing-phone-number":
    "Please enter your phone number.",

  "auth/invalid-verification-code":
    "Incorrect OTP. Please try again.",

  "auth/missing-verification-code":
    "Enter the 6-digit OTP.",

  "auth/code-expired":
    "OTP expired. Request a new OTP.",

  "auth/session-expired":
    "Verification session expired. Request a new OTP.",

  "auth/quota-exceeded":
    "Firebase SMS quota exceeded. Try again later.",

  "auth/too-many-requests":
    "Too many attempts. Please wait before trying again.",

  "auth/captcha-check-failed":
    "App verification failed. Reload the page and try again.",

  "auth/invalid-app-credential":
    "App verification failed. Check Firebase authorized domains and reCAPTCHA.",

  "auth/app-not-authorized":
    "This website is not authorized in Firebase Authentication.",

  "auth/network-request-failed":
    "Network error. Check your internet connection.",

  "auth/operation-not-allowed":
    "Phone sign-in is disabled or SMS to this region is blocked.",

  "auth/user-disabled":
    "This account has been disabled.",

  "auth/phone-required":
    "A verified phone number is required.",

  "auth/invalid-verification-id":
    "Verification session is invalid. Request a new OTP.",

  "auth/internal-error":
    "Firebase encountered an internal error. Reload and try again.",

  "app/empty":
    "Message cannot be empty.",

  "app/too-long":
    "Message exceeds the 2000-character limit.",

  "permission-denied":
    "You do not have permission to perform this action.",

  "unavailable":
    "Server unavailable. Check your connection.",

  "resource-exhausted":
    "Service quota reached. Try again later.",

  "functions/internal":
    "Phone lookup service is unavailable. Check Cloud Function deployment."
};

export function friendlyError(error) {
  const code = String(error?.code || "");

  console.error(
    "[Pulse Messenger Error]",
    code || "unknown",
    error?.message || error
  );

  if (code.startsWith("functions/")) {
    return ERROR_MESSAGES[code] ||
      error?.message ||
      ERROR_MESSAGES["functions/internal"];
  }

  return ERROR_MESSAGES[code] ||
    error?.message ||
    "Something went wrong. Please try again.";
}

/* =========================================
   PHONE NUMBER NORMALIZATION
========================================= */

function normalizePhone(phone) {
  let value = String(phone || "").trim();

  if (!value) {
    throw Object.assign(
      new Error(ERROR_MESSAGES["auth/missing-phone-number"]),
      { code: "auth/missing-phone-number" }
    );
  }

  // Remove common formatting characters.
  value = value.replace(/[\s()-]/g, "");

  // Convert Indian 10-digit numbers to E.164.
  if (/^\d{10}$/.test(value)) {
    value = "+91" + value;
  } else if (/^91\d{10}$/.test(value)) {
    value = "+" + value;
  }

  // E.164 format: + followed by 8–15 digits.
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw Object.assign(
      new Error(ERROR_MESSAGES["auth/invalid-phone-number"]),
      { code: "auth/invalid-phone-number" }
    );
  }

  return value;
}

/* =========================================
   INVISIBLE RECAPTCHA + OTP
========================================= */

const RECAPTCHA_ID = "recaptcha-container";

let verifier = null;
let confirmation = null;
let sendingOtp = false;

export function resetRecaptcha() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (error) {
      console.warn("reCAPTCHA cleanup failed:", error);
    }
  }

  verifier = null;

  const container = document.getElementById(RECAPTCHA_ID);

  if (container) {
    container.replaceChildren();
  }
}

function createRecaptcha() {
  const container = document.getElementById(RECAPTCHA_ID);

  if (!container) {
    throw new Error(
      'Missing element: add <div id="recaptcha-container"></div> to index.html.'
    );
  }

  // Firebase JS SDK 10.12.2 constructor order:
  // container, parameters, auth.
  verifier = new RecaptchaVerifier(
    RECAPTCHA_ID,
    {
      size: "invisible"
    },
    auth
  );

  return verifier;
}

export async function sendOtp(phone) {
  if (sendingOtp) {
    throw new Error("An OTP request is already in progress.");
  }

  sendingOtp = true;

  try {
    const normalizedPhone = normalizePhone(phone);

    // Remove a previous verifier before starting another attempt.
    resetRecaptcha();
    confirmation = null;

    const currentVerifier = createRecaptcha();

    // Initialize the verifier before requesting SMS.
    await currentVerifier.render();

    confirmation = await signInWithPhoneNumber(
      auth,
      normalizedPhone,
      currentVerifier
    );

    return true;
  } catch (error) {
    console.error(
      "[Pulse Messenger] sendOtp failed:",
      error?.code,
      error?.message
    );

    confirmation = null;
    resetRecaptcha();

    throw error;
  } finally {
    sendingOtp = false;
  }
}

export async function verifyOtp(code) {
  const otp = String(code || "").trim();

  if (!/^\d{6}$/.test(otp)) {
    throw Object.assign(
      new Error(ERROR_MESSAGES["auth/missing-verification-code"]),
      { code: "auth/missing-verification-code" }
    );
  }

  if (!confirmation) {
    throw Object.assign(
      new Error(ERROR_MESSAGES["auth/session-expired"]),
      { code: "auth/session-expired" }
    );
  }

  // Preserve the confirmation session when the code is incorrect.
  const result = await confirmation.confirm(otp);

  confirmation = null;
  resetRecaptcha();

  return result.user;
}

export function cancelOtp() {
  confirmation = null;
  resetRecaptcha();
}

/* =========================================
   AUTH STATE + LOGOUT
========================================= */

export function logout() {
  confirmation = null;
  resetRecaptcha();

  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* =========================================
   USER PROFILE
   Firestore: users/{uid}
========================================= */

const profileJobs = new Map();

export async function ensureProfile(user) {
  if (!user?.uid) {
    throw new Error("A signed-in user is required.");
  }

  if (!user.phoneNumber) {
    throw Object.assign(
      new Error(ERROR_MESSAGES["auth/phone-required"]),
      { code: "auth/phone-required" }
    );
  }

  if (profileJobs.has(user.uid)) {
    return profileJobs.get(user.uid);
  }

  const job = (async () => {
    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      const existing = snapshot.data();

      if (existing.phoneNumber !== user.phoneNumber) {
        await setDoc(
          userRef,
          { phoneNumber: user.phoneNumber },
          { merge: true }
        );

        return {
          ...existing,
          phoneNumber: user.phoneNumber
        };
      }

      return existing;
    }

    await setDoc(userRef, {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      createdAt: serverTimestamp()
    });

    return {
      uid: user.uid,
      phoneNumber: user.phoneNumber
    };
  })();

  profileJobs.set(user.uid, job);

  try {
    return await job;
  } catch (error) {
    profileJobs.delete(user.uid);
    throw error;
  }
}
