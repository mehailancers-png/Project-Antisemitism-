
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

/* =====================================
   ERROR HANDLING
===================================== */

const ERROR_MESSAGES = {
  "auth/invalid-phone-number": "Invalid phone number. Use +91 followed by your 10-digit number.",
  "auth/missing-phone-number": "Please enter your phone number.",
  "auth/invalid-verification-code": "Incorrect OTP. Try again.",
  "auth/missing-verification-code": "Enter the 6-digit OTP.",
  "auth/code-expired": "OTP expired. Request a new code.",
  "auth/session-expired": "Session expired. Request a new OTP.",
  "auth/quota-exceeded": "Firebase SMS quota reached.",
  "auth/too-many-requests": "Too many attempts. Please wait.",
  "auth/captcha-check-failed": "Verification failed. Reload and try again.",
  "auth/invalid-app-credential": "App verification failed. Check Firebase domain settings.",
  "auth/app-not-authorized": "This website is not authorized in Firebase.",
  "auth/network-request-failed": "Network error. Check your internet.",
  "auth/operation-not-allowed": "Phone authentication is disabled or SMS region is blocked.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/phone-required": "A verified phone number is required.",
  "permission-denied": "You do not have permission.",
  "unavailable": "Server unavailable. Check your connection.",
  "resource-exhausted": "Service quota reached.",
  "functions/internal": "Phone lookup service is unavailable."
};

export function friendlyError(error) {
  const code = String(error?.code || "");

  console.error(
    "[Pulse Messenger Error]",
    code,
    error?.message || error
  );

  if (code.startsWith("functions/")) {
    return ERROR_MESSAGES[code] ||
      error?.message ||
      ERROR_MESSAGES["functions/internal"];
  }

  return ERROR_MESSAGES[code] ||
    "Something went wrong. Please try again.";
}

/* =====================================
   PHONE NUMBER
===================================== */

function normalizePhone(phone) {
  let value = String(phone || "").trim();

  value = value.replace(/[\s()-]/g, "");

  if (/^\d{10}$/.test(value)) {
    value = "+91" + value;
  } else if (/^91\d{10}$/.test(value)) {
    value = "+" + value;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw Object.assign(
      new Error("Enter a valid phone number with country code."),
      { code: "auth/invalid-phone-number" }
    );
  }

  return value;
}

/* =====================================
   INVISIBLE RECAPTCHA
===================================== */

const RECAPTCHA_ID = "recaptcha-container";

let verifier = null;
let confirmation = null;
let sendingOtp = false;

export function resetRecaptcha() {
  if (verifier) {
    try {
      verifier.clear();
    } catch (error) {
      console.warn("reCAPTCHA cleanup:", error);
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
      'Missing recaptcha-container element in index.html.'
    );
  }

  if (!auth) {
    throw new Error("Firebase Auth is not initialized.");
  }

  // CORRECT Firebase SDK 10.12.2 argument order:
  // auth, container, parameters

  verifier = new RecaptchaVerifier(
    auth,
    RECAPTCHA_ID,
    {
      size: "invisible"
    }
  );

  return verifier;
}

/* =====================================
   SEND OTP
===================================== */

export async function sendOtp(phone) {
  if (sendingOtp) {
    throw new Error("OTP request already in progress.");
  }

  sendingOtp = true;

  try {
    const normalizedPhone = normalizePhone(phone);

    confirmation = null;
    resetRecaptcha();

    const currentVerifier = createRecaptcha();

    await currentVerifier.render();

    confirmation = await signInWithPhoneNumber(
      auth,
      normalizedPhone,
      currentVerifier
    );

    console.info("[Pulse Messenger] OTP request successful.");

    return true;

  } catch (error) {
    console.error(
      "[Pulse Messenger] OTP failed:",
      error?.code,
      error?.message,
      error?.stack
    );

    confirmation = null;
    resetRecaptcha();

    throw error;

  } finally {
    sendingOtp = false;
  }
}

/* =====================================
   VERIFY OTP
===================================== */

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
      new Error("Request a new OTP first."),
      { code: "auth/session-expired" }
    );
  }

  const result = await confirmation.confirm(otp);

  confirmation = null;
  resetRecaptcha();

  return result.user;
}

/* =====================================
   CANCEL OTP
===================================== */

export function cancelOtp() {
  confirmation = null;
  resetRecaptcha();
}

/* =====================================
   AUTH STATE
===================================== */

export function logout() {
  confirmation = null;
  resetRecaptcha();

  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* =====================================
   USER PROFILE
===================================== */

const profileJobs = new Map();

export async function ensureProfile(user) {
  if (!user?.uid) {
    throw new Error("User is not authenticated.");
  }

  if (!user.phoneNumber) {
    throw Object.assign(
      new Error("Phone number is required."),
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
