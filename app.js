// Firebase Init
const firebaseConfig = {
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:59fabe6306517d10b374e1"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

window.addEventListener('DOMContentLoaded', () => {
  // Hide loading overlay
  document.getElementById('init-overlay').style.display = 'none';

  // Tab switching
  document.querySelectorAll('nav button').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  // Theme switcher
  const themeSwitcher = document.getElementById('themeSwitcher');
  themeSwitcher.addEventListener('change', (e) => {
    document.body.className = `${e.target.value}-theme`;
  });

  // Panic button
  document.getElementById('panicBtn').addEventListener('click', () => {
    localStorage.clear();
    alert('Local storage wiped!');
  });

  // Firebase Auth
  auth.onAuthStateChanged(user => {
    if (user) {
      console.log("User signed in:", user.uid);
    } else {
      console.log("No user, signing in anonymously...");
      auth.signInAnonymously().catch(console.error);
    }
  });

  // Placeholder plugin logic
  const plugins = {
    profileMusic: true,
    emotionalMode: true,
    lastSeenToggle: true,
    anonymousConfessions: true
  };

  // Fake message encryption simulation
  window.simulateEncryptedMessage = function (msg) {
    return btoa(unescape(encodeURIComponent(msg))); // fake encryption
  };
});
