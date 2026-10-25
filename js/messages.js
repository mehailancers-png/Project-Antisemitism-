import { db } from "./firebase.js";
import {
  collection, doc, writeBatch, query, orderBy, limitToLast, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const MAX_LEN = 2000;
const HISTORY_LIMIT = 200; // newest 200 messages are loaded

// Returns the unsubscribe function; the caller must invoke it when leaving the conversation.
export function subscribeMessages(conversationId, onData, onError) {
  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc"),
    limitToLast(HISTORY_LIMIT)
  );
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    onData(snap.docs.map((d) => ({
      id: d.id,
      ...d.data({ serverTimestamps: "estimate" }),
      pending: d.metadata.hasPendingWrites
    })));
  }, onError);
}

export async function sendMessage(conversationId, senderUid, text) {
  const clean = text.trim();
  if (!clean) throw Object.assign(new Error("empty"), { code: "app/empty" });
  if (clean.length > MAX_LEN) throw Object.assign(new Error("too long"), { code: "app/too-long" });

  const msgRef = doc(collection(db, "conversations", conversationId, "messages"));
  const batch = writeBatch(db);
  batch.set(msgRef, { conversationId, senderId: senderUid, text: clean, createdAt: serverTimestamp() });
  batch.update(doc(db, "conversations", conversationId), {
    lastMessageText: clean.slice(0, 100),
    lastSenderId: senderUid,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}
