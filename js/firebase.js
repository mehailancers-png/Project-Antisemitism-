
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsLUYT2Nxvuse9gxhMuTLjsvyvOu92yU8",
  authDomain: "project-antisemitism.firebaseapp.com",
  projectId: "project-antisemitism",
  storageBucket: "project-antisemitism.firebasestorage.app",
  messagingSenderId: "739817942010",
  appId: "1:739817942010:web:3afcf2858fa2804ebb5243",
  measurementId: "G-TN848G7VXT"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
