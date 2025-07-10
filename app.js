// ✅ Firebase Config - replace placeholder with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:59fabe6306517d10b374e1"
};

// ✅ Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  // Hide loader
  const loader = document.getElementById('init-overlay');
  if (loader) loader.style.display = 'none';

  // Tab Navigation
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  // Theme Switcher
  const themeSwitcher = document.getElementById('themeSwitcher');
  if (themeSwitcher) {
    themeSwitcher.addEventListener('change', (e) => {
      document.body.className = `${e.target.value}-theme`;
    });
  }

  // Panic Button
  const panicBtn = document.getElementById('panicBtn');
  if (panicBtn) {
    panicBtn.addEventListener('click', () => {
      localStorage.clear();
      alert("🧨 Local storage cleared!");
    });
  }

  // Firebase Auth listener
  auth.onAuthStateChanged(user => {
    if (user) {
      console.log("✅ Logged in:", user.uid);
    } else {
      console.log("🔐 Signing in anonymously...");
      auth.signInAnonymously().catch(err => {
        console.error("❌ Auth error:", err);
      });
    }
  });
});
