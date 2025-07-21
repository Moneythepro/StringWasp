// Firebase v8 Classic Initialization for StringWasp v2
const firebaseConfig = {
  apiKey: "AIzaSyAcUxoMaCV7H6CdT53KlxmQlY3nqBiLHb8",
  authDomain: "stringwaspv2.firebaseapp.com",
  projectId: "stringwaspv2",
  storageBucket: "stringwaspv2.firebasestorage.app",
  messagingSenderId: "691978301483",
  appId: "1:691978301483:web:a706a20155d7b2b506ba6e",
  measurementId: "G-FM5KK7D695"
};

// Initialize Firebase (v8 syntax)
firebase.initializeApp(firebaseConfig);

// Enable Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
