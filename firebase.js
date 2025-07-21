// Firebase v8 Classic Initialization for StringWasp
const firebaseConfig = {
  apiKey: "AIzaSyDLwskDnnfbdv5zLgnMqI4S0F0RP_BcbHk",
  authDomain: "stringwasp-1cc9e.firebaseapp.com",
  projectId: "stringwasp-1cc9e",
  storageBucket: "stringwasp-1cc9e.appspot.com",
  messagingSenderId: "221762879361",
  appId: "1:221762879361:web:628316cfa25373a04f7280",
  measurementId: "G-GN7VT7421B"
};

// Initialize Firebase (v8 syntax)
firebase.initializeApp(firebaseConfig);

// Enable Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
