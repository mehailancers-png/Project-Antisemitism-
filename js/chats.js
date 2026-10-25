import { db } from "./firebase.js";
import {
  collection, doc, getDoc, setDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Deterministic ID (sorted UIDs) guarantees one conversation per pair of users.
export const conversationIdFor = (a, b) => [a, b].sort().join("_");

export const millis = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

export function otherParticipant(conv, myUid) {
  const uid = conv.participants.find((u) => u !== myUid);
  const name = (conv.participantNames && conv.participantNames[uid]) || "Unknown user";
  return { uid, name };
}

export async function getOrCreateConversation(me, other) {
  const id = conversationIdFor(me.uid, other.uid);
  const ref = doc(db, "conversations", id);
  const existing = await getDoc(ref);
  if (existing.exists()) return id;

  const participants = [me.uid, other.uid].sort();
  try {
    await setDoc(ref, {
      participants,
      participantNames: { [me.uid]: me.displayName, [other.uid]: other.displayName },
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

// Case-insensitive prefix search on displayName (stored lowercase as searchName).
export async function searchUsers(term, myUid) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const q = query(
    collection(db, "users"),
    orderBy("searchName"),
    where("searchName", ">=", t),
    where("searchName", "<=", t + "\uf8ff"),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).filter((u) => u.uid !== myUid)
    .map((u) => ({ uid: u.uid, displayName: u.displayName }));
}
