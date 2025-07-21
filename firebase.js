// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAcUxoMaCV7H6CdT53KlxmQlY3nqBiLHb8",
  authDomain: "stringwaspv2.firebaseapp.com",
  projectId: "stringwaspv2",
  storageBucket: "stringwaspv2.firebasestorage.app",
  messagingSenderId: "691978301483",
  appId: "1:691978301483:web:a706a20155d7b2b506ba6e",
  measurementId: "G-FM5KK7D695"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);