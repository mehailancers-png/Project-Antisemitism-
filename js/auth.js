import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ERRORS = {
  "auth/invalid-email": "That email address is not valid.",
  "auth/missing-password": "Please enter your password.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/operation-not-allowed": "Email/password sign-in is not enabled in the Firebase console.",
  "permission-denied": "You do not have permission to do that.",
  "unavailable": "Cannot reach the server. Check your connection.",
  "resource-exhausted": "Service quota reached. Please try again later.",
  "app/offline": "You are offline."
};

export function friendlyError(err) {
  return ERRORS[err && err.code ? err.code.replace(/^firestore\//, "") : ""] || "Something went wrong. Please try again.";
}

// Profile creation is provider-agnostic (email today; phone numbers later) and de-duplicated per uid.
const profileJobs = new Map();
let pendingName = null;

export function ensureProfile(user, preferredName) {
  if (!profileJobs.has(user.uid)) {
    const job = (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      const raw = preferredName || pendingName || user.displayName || (user.email || "User").split("@")[0];
      const displayName = raw.trim().slice(0, 40) || "User";
      const batch = writeBatch(db);
      batch.set(ref, { uid: user.uid, displayName, searchName: displayName.toLowerCase(), createdAt: serverTimestamp() });
      batch.set(doc(db, "users", user.uid, "private", "account"), { email: user.email || null });
      await batch.commit();
      return { uid: user.uid, displayName };
    })();
    profileJobs.set(user.uid, job);
    job.catch(() => profileJobs.delete(user.uid));
  }
  return profileJobs.get(user.uid);
}

export async function register(name, email, password) {
  pendingName = name.trim();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try { await updateProfile(cred.user, { displayName: pendingName }); } catch (_) { /* non-fatal */ }
    await ensureProfile(cred.user, pendingName);
    return cred.user;
  } finally {
    pendingName = null;
  }
}

export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const watchAuth = (callback) => onAuthStateChanged(auth, callback);
