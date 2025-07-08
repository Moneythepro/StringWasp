// firebase.js

// DO NOT re-import or re-declare firebase if included via <script> tag in index.html
// Assumes Firebase 8.10.1 is loaded globally

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:59fabe6306517d10b374e1"
});

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
