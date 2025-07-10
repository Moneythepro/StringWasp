// Firebase Init
const firebaseConfig = {
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:59fabe6306517d10b374e1"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentUserId = null;

// Tab Switching
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
  });
});

// Theme Toggle
document.getElementById('themeSwitcher').addEventListener('change', (e) => {
  document.body.className = `${e.target.value}-theme`;
});

// Panic Button
document.getElementById('panicBtn').addEventListener('click', () => {
  localStorage.clear();
  alert("Local storage wiped!");
});

// Fake encryption (Base64)
function simulateEncryptedMessage(msg) {
  return btoa(unescape(encodeURIComponent(msg)));
}
function simulateDecryption(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

// Auth State
auth.onAuthStateChanged(user => {
  if (user) {
    currentUserId = user.uid;
    listenForMessages();
  } else {
    auth.signInAnonymously();
  }
});

// Send Message
document.getElementById('sendBtn').addEventListener('click', () => {
  const input = document.getElementById('chatMessage');
  const text = input.value.trim();
  if (text) {
    const encrypted = simulateEncryptedMessage(text);
    db.collection('messages').add({
      uid: currentUserId,
      message: encrypted,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
  }
});

// Real-time message display
function listenForMessages() {
  const chatWindow = document.getElementById('chatWindow');
  db.collection('messages')
    .orderBy('timestamp')
    .limit(50)
    .onSnapshot(snapshot => {
      chatWindow.innerHTML = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        const msg = simulateDecryption(data.message || '');
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.textContent = msg;
        chatWindow.appendChild(div);
      });
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}
