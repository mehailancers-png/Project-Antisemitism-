import { db } from "./firebase.js";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Private contact names: users/{myUid}/contacts/{contactUid} = { contactUid, phoneNumber, name, updatedAt }
// Only the owner can read or write them. Emits a map { contactUid: name }.
export function subscribeContacts(uid, onData, onError) {
  return onSnapshot(collection(db, "users", uid, "contacts"), (snap) => {
    const map = {};
    snap.docs.forEach((d) => { map[d.id] = d.data().name; });
    onData(map);
  }, onError);
}

export async function saveContact(myUid, contactUid, phoneNumber, name) {
  const clean = (name || "").trim();
  if (clean.length < 1 || clean.length > 40) throw Object.assign(new Error("invalid name"), { code: "app/invalid-name" });
  await setDoc(doc(db, "users", myUid, "contacts", contactUid), {
    contactUid, phoneNumber, name: clean, updatedAt: serverTimestamp()
  });
}

export const deleteContact = (myUid, contactUid) => deleteDoc(doc(db, "users", myUid, "contacts", contactUid));

// Saved name first, then the phone number.
export const labelFor = (contacts, uid, phone) => contacts[uid] || phone || "Unknown number";
