import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDutvnsvjmu8iaj6W70v3-I55FryWuQlBM",
  authDomain: "arisan-a99bb.firebaseapp.com",
  projectId: "arisan-a99bb",
  storageBucket: "arisan-a99bb.firebasestorage.app",
  messagingSenderId: "490550659293",
  appId: "1:490550659293:web:3759eb26fb290a3b7b7334"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = "arisan-app-v2";