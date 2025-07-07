// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",  // fixed typo: .app → .app**spot**
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:79e30ee86f15bf36b374e1"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
