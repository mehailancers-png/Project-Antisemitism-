const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const E164 = /^\+[1-9]\d{7,14}$/;
const LIMIT = 20;                 // lookups per user per window
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Callable: look up a registered user by a COMPLETE phone number. Never returns lists.
exports.lookupUserByPhone = onCall({ region: "us-central1", maxInstances: 10 }, async (request) => {
  if (!request.auth || request.auth.token.firebase.sign_in_provider !== "phone") {
    throw new HttpsError("unauthenticated", "Sign in with your phone number first.");
  }
  const phone = typeof request.data?.phoneNumber === "string" ? request.data.phoneNumber.trim() : "";
  if (!E164.test(phone)) {
    throw new HttpsError("invalid-argument", "Enter the full phone number with country code, e.g. +919876543210.");
  }

  const db = getFirestore();

  // Per-user rate limit to make bulk enumeration of phone numbers impractical.
  const limitRef = db.doc(`rateLimits/${request.auth.uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const now = Date.now();
    let windowStart = now, count = 0;
    if (snap.exists) ({ windowStart, count } = snap.data());
    if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0; }
    if (count >= LIMIT) throw new HttpsError("resource-exhausted", "Too many lookups. Please try again later.");
    tx.set(limitRef, { windowStart, count: count + 1 });
  });

  let authUser;
  try {
    authUser = await getAuth().getUserByPhoneNumber(phone);
  } catch (err) {
    if (err.code === "auth/user-not-found") return { found: false };
    console.error("lookup failed", err.code);
    throw new HttpsError("internal", "Lookup failed.");
  }
  if (authUser.uid === request.auth.uid) return { found: false, self: true };

  // Must have an app profile (users/{uid}) to count as registered.
  const profile = await db.doc(`users/${authUser.uid}`).get();
  if (!profile.exists) return { found: false };
  return { found: true, uid: authUser.uid, phoneNumber: profile.data().phoneNumber };
});
