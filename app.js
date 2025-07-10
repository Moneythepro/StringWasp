// Firebase Init
const firebaseConfig = {
  // CONFIGURE YOUR FIREBASE APP HERE
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('init-overlay');
  const appContainer = document.getElementById('app');

  // Handle Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  // Theme Switcher
  const themeSwitcher = document.getElementById('themeSwitcher');
  themeSwitcher.addEventListener('change', (e) => {
    document.body.className = `${e.target.value}-theme`;
  });

  // Panic Button
  document.getElementById('panicBtn').addEventListener('click', () => {
    localStorage.clear();
    alert("All local data wiped!");
  });

  // Auth State
  auth.onAuthStateChanged(user => {
    if (user) {
      console.log("✅ Signed in:", user.uid);
      overlay.style.display = 'none';
      appContainer.style.display = 'flex';
    } else {
      console.log("🔄 Signing in anonymously...");
      auth.signInAnonymously().catch(err => {
        console.error("❌ Auth error:", err);
        alert("Authentication failed!");
      });
    }
  });

  // Plugin Toggles (placeholders)
  document.getElementById('musicToggle').addEventListener('change', e => {
    console.log("Profile Music:", e.target.checked);
  });

  document.getElementById('emotionalToggle').addEventListener('change', e => {
    console.log("Emotional Mode:", e.target.checked);
  });

  document.getElementById('lastSeenToggle').addEventListener('change', e => {
    console.log("Last Seen:", e.target.checked);
  });
});
