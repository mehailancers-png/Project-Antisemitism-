import { auth, db } from "./firebase.js";
import {
  RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ERRORS = {
  "auth/invalid-phone-number": "That phone number is not valid. Use the full number with country code, e.g. +919876543210.",
  "auth/missing-phone-number": "Enter your phone number.",
  "auth/invalid-verification-code": "Incorrect code. Check the SMS and try again.",
  "auth/missing-verification-code": "Enter the 6-digit code.",
  "auth/code-expired": "That code has expired. Request a new code.",
  "auth/session-expired": "Your code session expired. Request a new code.",
  "auth/quota-exceeded": "The SMS quota has been reached. Please try again later.",
  "auth/too-many-requests": "Too many attempts. Please wait a while and try again.",
  "auth/captcha-check-failed": "reCAPTCHA check failed. Reload the page and try again.",
  "auth/invalid-app-credential": "reCAPTCHA verification failed. Reload and try again.",
  "auth/app-not-authorized": "This website is not authorized for this Firebase project.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/operation-not-allowed": "Phone sign-in is not enabled, or SMS to this region is blocked, in the Firebase console.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/phone-required": "Only phone-number accounts are supported.",
  "app/invalid-name": "Contact name must be 1 to 40 characters.",
  "app/empty": "Message is empty.",
  "app/too-long": "Message is too long (max 2000 characters).",
  "permission-denied": "You do not have permission to do that.",
  "unavailable": "Cannot reach the server. Check your connection.",
  "resource-exhausted": "Service quota reached. Please try again later.",
  "functions/internal": "The lookup service is unavailable. Make sure the Cloud Function is deployed, then try again."
};
const PASSTHROUGH = new Set(["invalid-argument", "resource-exhausted", "unauthenticated"]);

export function friendlyError(err) {
  const raw = err && err.code ? String(err.code) : "";
  if (raw.startsWith("functions/")) {
    if (PASSTHROUGH.has(raw.slice(10)) && err.message) return err.message;
    return ERRORS["functions/internal"];
  }
  return ERRORS[raw.replace(/^firestore\//, "")] || "Something went wrong. Please try again.";
}

/* ---------- Phone authentication ---------- */
const RECAPTCHA_ID = "recaptcha-container";
let verifier = null;
let confirmation = null;

export function resetRecaptcha() {
  if (verifier) { try { verifier.clear(); } catch (_) { /* ignore */ } verifier = null; }
  const el = document.getElementById(RECAPTCHA_ID);
  if (el) el.replaceChildren();
}

// phone must be E.164, e.g. +919876543210
export async function sendOtp(phone) {
  resetRecaptcha();
  verifier = new RecaptchaVerifier(auth, RECAPTCHA_ID, { size: "invisible" });
  try {
    confirmation = await signInWithPhoneNumber(auth, phone, verifier);
  } catch (err) {
    resetRecaptcha(); confirmation = null;
    throw err;
  }
}

export async function verifyOtp(code) {
  if (!confirmation) throw Object.assign(new Error("No pending code"), { code: "auth/session-expired" });
  const cred = await confirmation.confirm(code); // wrong code throws but keeps the session so the user can retry
  confirmation = null; resetRecaptcha();
  return cred.user;
}

export function cancelOtp() { confirmation = null; resetRecaptcha(); }

export const logout = () => signOut(auth);
export const watchAuth = (callback) => onAuthStateChanged(auth, callback);

/* ---------- Profile: users/{uid} = { uid, phoneNumber, createdAt } ---------- */
const profileJobs = new Map();

export function ensureProfile(user) {
  if (!user.phoneNumber) return Promise.reject(Object.assign(new Error("Phone required"), { code: "auth/phone-required" }));
  if (!profileJobs.has(user.uid)) {
    const job = (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      await setDoc(ref, { uid: user.uid, phoneNumber: user.phoneNumber, createdAt: serverTimestamp() });
      return { uid: user.uid, phoneNumber: user.phoneNumber };
    })();
    profileJobs.set(user.uid, job);
    job.catch(() => profileJobs.delete(user.uid));
  }
  return profileJobs.get(user.uid);
}
