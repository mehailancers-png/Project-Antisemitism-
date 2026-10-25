import { db, functions } from "./firebase.js";
import {
  collection, doc, getDoc, setDoc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Deterministic ID (sorted UIDs) guarantees one conversation per pair of users (unchanged from before).
export const conversationIdFor = (a, b) => [a, b].sort().join("_");
export const millis = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

// Returns an E.164 number (+countrycode...) or null.
export function normalizePhone(raw) {
  const p = String(raw || "").replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

export function otherParticipant(conv, myUid) {
  const uid = conv.participants.find((u) => u !== myUid);
  const phone = (conv.participantPhones && conv.participantPhones[uid]) || null; // null for legacy conversations
  return { uid, phone };
}

// me / other: { uid, phoneNumber }
export async function getOrCreateConversation(me, other) {
  const id = conversationIdFor(me.uid, other.uid);
  const ref = doc(db, "conversations", id);
  const existing = await getDoc(ref);
  if (existing.exists()) return id;

  const participants = [me.uid, other.uid].sort();
  try {
    await setDoc(ref, {
      participants,
      participantPhones: { [me.uid]: me.phoneNumber, [other.uid]: other.phoneNumber },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageText: "",
      lastSenderId: null
    });
  } catch (err) {
    // The other user may have created it at the same moment; only fail if it still does not exist.
    const again = await getDoc(ref);
    if (!again.exists()) throw err;
  }
  return id;
}

// Sorted client-side, so no composite Firestore index is needed.
export function subscribeConversations(uid, onData, onError) {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    items.sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
    onData(items);
  }, onError);
}

// Secure lookup by full phone number via the trusted Cloud Function.
// Resolves to { found: boolean, uid?, phoneNumber?, self? }.
export async function lookupUserByPhone(phoneNumber) {
  const call = httpsCallable(functions, "lookupUserByPhone");
  const res = await call({ phoneNumber });
  return res.data;
}
