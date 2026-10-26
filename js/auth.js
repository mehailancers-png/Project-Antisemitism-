
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

/* =========================
   ERROR HANDLING
========================= */

const ERRORS = {
  "auth/invalid-phone-number":
    "Invalid phone number. Enter your full number with country code, e.g. +919876543210.",

  "auth/missing-phone-number":
    "Please enter your phone number.",

  "auth/invalid-verification-code":
    "Incorrect OTP. Please check and try again.",

  "auth/missing-verification-code":
    "Please enter the 6-digit OTP.",

  "auth/code-expired":
    "OTP expired. Please request a new one.",

  "auth/session-expired":
    "Your verification session expired. Request a new OTP.",

  "auth/quota-exceeded":
    "Firebase SMS quota reached. Try again later.",

  "auth/too-many-requests":
    "Too many attempts. Please wait before trying again.",

  "auth/captcha-check-failed":
    "Verification failed. Reload the page and try again.",

  "auth/invalid-app-credential":
    "App verification failed. Check the authorized domain and reCAPTCHA setup.",

  "auth/app-not-authorized":
    "This website is not authorized for this Firebase project.",

  "auth/network-request-failed":
    "Network error. Check your internet connection.",

  "auth/operation-not-allowed":
    "Phone sign-in is disabled or SMS to this region is blocked.",

  "auth/user-disabled":
    "This account has been disabled.",

  "auth/phone-required":
    "A verified phone number is required.",

  "app/invalid-name":
    "Contact name must contain 1–40 characters.",

  "app/empty":
    "Message cannot be empty.",

  "app/too-long":
    "Message is too long. Maximum 2000 characters.",

  "permission-denied":
    "You do not have permission to perform this action.",

  "unavailable":
    "Server unavailable. Check your internet connection.",

  "resource-exhausted":
    "Service quota reached. Try again later.",

  "functions/internal":
    "The phone lookup service is unavailable. Check the Cloud Function deployment."
};

const PASSTHROUGH = new Set([
  "invalid-argument",
  "resource-exhausted",
  "unauthenticated"
]);

export function friendlyError(err) {
  const code = String(err?.code || "");

  // Keep useful Firebase error details in the browser console.
  console.error(
    "[Pulse Messenger]",
    code || "unknown-error",
    err?.message || err
  );

  if (code.startsWith("functions/")) {
    const shortCode = code.slice("functions/".length);

    if (PASSTHROUGH.has(shortCode) && err?.message) {
      return err.message;
    }

    return ERRORS[code] || ERRORS["functions/internal"];
  }

  return (
    ERRORS[code] ||
    err?.message ||
    "Something went wrong. Please try again."
  );
}

/* =========================
   PHONE AUTHENTICATION
========================= */

const RECAPTCHA_ID = "recaptcha-container";

let verifier = null;
let confirmation = null;
let recaptchaRenderPromise = null;

/**
 * Clear an existing reCAPTCHA instance.
 */
export function resetRecaptcha() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (err) {
      console.warn("reCAPTCHA cleanup:", err);
    }
  }

  verifier = null;
  recaptchaRenderPromise = null;

  const container = document.getElementById(RECAPTCHA_ID);

  if (container) {
    container.replaceChildren();
  }
}

/**
 * Create an invisible reCAPTCHA verifier.
 * Firebase SDK v10 argument order:
 * container, parameters, auth.
 */
function createRecaptcha() {
  const container = document.getElementById(RECAPTCHA_ID);

  if (!container) {
    throw new Error(
      'Missing #recaptcha-container in index.html. Add <div id="recaptcha-container"></div>.'
    );
  }

  verifier = new RecaptchaVerifier(
    RECAPTCHA_ID,
    {
      size: "invisible",

      callback: () => {
        // Firebase handles the verification response.
      },

      "expired-callback": () => {
        console.warn("Invisible reCAPTCHA expired.");
      }
    },
    auth
  );

  return verifier;
}

/**
 * Normalize an Indian mobile number to E.164.
 * Accepts:
 *   9876543210
 *   919876543210
 *   +919876543210
 *
 * Do not use this function to alter non-Indian numbers.
 */
function normalizePhone(phone) {
  const value = String(phone || "").trim();

  if (!value) {
    throw Object.assign(new Error("Enter your phone number."), {
      code: "auth/missing-phone-number"
    });
  }

  let normalized = value.replace(/[\s()-]/g, "");

  if (/^\d{10}$/.test(normalized)) {
    normalized = "+91" + normalized;
  } else if (/^91\d{10}$/.test(normalized)) {
    normalized = "+" + normalized;
  }

  // E.164: plus sign, nonzero country-code digit,
  // and at most 15 digits overall.
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw Object.assign(
      new Error(
        "Enter a valid phone number with country code, e.g. +919876543210."
      ),
      { code: "auth/invalid-phone-number" }
    );
  }

  return normalized;
}

/**
 * Send OTP to a phone number.
 * Call this when the user presses Send OTP.
 */
export async function sendOtp(phone) {
  // Validate before initializing reCAPTCHA.
  const normalizedPhone = normalizePhone(phone);

  // Clear any previous pending attempt.
  confirmation = null;
  resetRecaptcha();

  try {
    const currentVerifier = createRecaptcha();

    // Explicitly initialize the invisible verifier.
    recaptchaRenderPromise = currentVerifier.render();
    await recaptchaRenderPromise;

    confirmation = await signInWithPhoneNumber(
      auth,
      normalizedPhone,
      currentVerifier
    );

    return true;
  } catch (err) {
    console.error(
      "Pulse Messenger OTP send failed:",
      err?.code,
      err?.message
    );

    confirmation = null;
    resetRecaptcha();

    throw err;
  }
}

/**
 * Verify the OTP entered by the user.
 */
export async function verifyOtp(code) {
  const otp = String(code || "").trim();

  if (!/^\d{6}$/.test(otp)) {
    throw Object.assign(
      new Error("Enter the 6-digit OTP."),
      { code: "auth/missing-verification-code" }
    );
  }

  if (!confirmation) {
    throw Object.assign(
      new Error("Request a new OTP before verifying."),
      { code: "auth/session-expired" }
    );
  }

  // Keep the confirmation session if the code is incorrect,
  // so the user can retry.
  const result = await confirmation.confirm(otp);

  confirmation = null;
  resetRecaptcha();

  return result.user;
}

/**
 * Cancel a pending OTP flow.
 */
export function cancelOtp() {
  confirmation = null;
  resetRecaptcha();
}

/* =========================
   AUTH STATE
========================= */

export function logout() {
  confirmation = null;
  resetRecaptcha();

  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* =========================
   USER PROFILE
   users/{uid}
========================= */

const profileJobs = new Map();

export async function ensureProfile(user) {
  if (!user?.uid) {
    throw new Error("A signed-in user is required.");
  }

  if (!user.phoneNumber) {
    throw Object.assign(
      new Error("A verified phone number is required."),
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
      const existingProfile = snapshot.data();

      // Keep the current verified number in sync.
      if (existingProfile.phoneNumber !== user.phoneNumber) {
        await setDoc(
          userRef,
          { phoneNumber: user.phoneNumber },
          { merge: true }
        );

        return {
          ...existingProfile,
          phoneNumber: user.phoneNumber
        };
      }

      return existingProfile;
    }

    const profile = {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, profile);

    return {
      uid: user.uid,
      phoneNumber: user.phoneNumber
    };
  })();

  profileJobs.set(user.uid, job);

  try {
    return await job;
  } catch (err) {
    profileJobs.delete(user.uid);
    throw err;
  }
}
