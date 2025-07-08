// Firebase setup (v8)
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

// Tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".tabContent").forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// Loading overlay
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// Auth
auth.onAuthStateChanged(user => {
  if (user) {
    checkUsername();
  } else {
    switchTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, pass).catch(alert);
}

function register() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, pass).catch(alert);
}

// Username
function checkUsername() {
  db.collection("users").doc(auth.currentUser.uid).get().then(doc => {
    if (doc.exists && doc.data().username) {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      initApp();
    } else {
      switchTab("usernameDialog");
    }
  });
}

function saveUsername() {
  const uname = document.getElementById("newUsername").value.trim();
  if (!uname) return alert("Enter a username");
  db.collection("users").where("username", "==", uname).get().then(snapshot => {
    if (!snapshot.empty) return alert("Username taken");
    db.collection("users").doc(auth.currentUser.uid).set({ username: uname }, { merge: true }).then(() => {
      document.getElementById("usernameDisplay").textContent = uname;
      switchTab("chatTab");
      initApp();
    });
  });
}

// Init
function initApp() {
  switchTab("chatTab");
  loadRooms();
  listenForMessages();
  loadProfile();
  loadInbox();
  loadFriends();
  loadSearchResults();
}

// Chat
function sendMessage() {
  const msg = document.getElementById("messageInput").value.trim();
  if (!msg) return;
  const room = document.getElementById("roomDropdown").value;
  db.collection("rooms").doc(room).collection("messages").add({
    text: msg,
    from: auth.currentUser.uid,
    time: Date.now()
  });
  document.getElementById("messageInput").value = "";
}

function listenForMessages() {
  const room = document.getElementById("roomDropdown").value;
  if (!room) return;
  db.collection("rooms").doc(room).collection("messages")
    .orderBy("time").limit(50)
    .onSnapshot(snapshot => {
      const messagesDiv = document.getElementById("messages");
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const el = document.createElement("div");
        el.textContent = `[${msg.from}] ${msg.text}`;
        messagesDiv.appendChild(el);
      });
    });
}

function createOrJoinRoom() {
  const newRoom = document.getElementById("customRoom").value.trim();
  if (!newRoom) return;
  joinRoom(newRoom);
}

function joinRoom(roomName) {
  document.getElementById("roomDropdown").value = roomName;
  listenForMessages();
}

// Admin Tools
function addMember() {
  const room = document.getElementById("roomDropdown").value;
  const email = document.getElementById("memberEmail").value;
  db.collection("rooms").doc(room).collection("members").add({ email });
}

function removeMember() {
  // Basic implementation
  alert("Remove logic not implemented");
}

function promoteMember() {
  alert("Promote logic not implemented");
}

// Inbox
function loadInbox() {
  const inboxDiv = document.getElementById("inboxList");
  db.collection("inbox").where("to", "==", auth.currentUser.uid)
    .onSnapshot(snapshot => {
      inboxDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "inbox-card";
        div.textContent = `${data.type} from ${data.fromName || data.from}`;
        inboxDiv.appendChild(div);
      });
    });
}

// Profile
function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  db.collection("users").doc(auth.currentUser.uid).set({ name, bio }, { merge: true });
}

function loadProfile() {
  db.collection("users").doc(auth.currentUser.uid).get().then(doc => {
    if (doc.exists) {
      const d = doc.data();
      document.getElementById("profileName").value = d.name || "";
      document.getElementById("profileBio").value = d.bio || "";
    }
  });
}

// Search
function runSearch() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  db.collection("users").where("username", ">=", q).where("username", "<=", q + "\uf8ff")
    .get().then(snapshot => {
      const res = document.getElementById("searchResultsUser");
      res.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        const div = document.createElement("div");
        div.textContent = d.username + (d.username === "moneythepro" ? " 🛠️ Developer" : "");
        res.appendChild(div);
      });
    });
}

function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

// Friends
function loadFriends() {
  const friendsDiv = document.getElementById("friendsList");
  friendsDiv.innerHTML = `<p>Coming soon...</p>`; // You can fill from Firestore
}

// Thread Chat (one-on-one)
function openThread(username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  // Load thread messages
  const uid = auth.currentUser.uid;
  const threadId = [uid, username].sort().join("_");
  db.collection("threads").doc(threadId).collection("messages").orderBy("time")
    .onSnapshot(snapshot => {
      const box = document.getElementById("threadMessages");
      box.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const el = document.createElement("div");
        el.textContent = `${m.from}: ${m.text}`;
        box.appendChild(el);
      });
    });
}

function sendThreadMessage() {
  const text = document.getElementById("threadInput").value.trim();
  if (!text) return;
  const to = document.getElementById("threadWithName").textContent;
  const uid = auth.currentUser.uid;
  const threadId = [uid, to].sort().join("_");
  db.collection("threads").doc(threadId).collection("messages").add({
    from: uid,
    text,
    time: Date.now()
  });
  document.getElementById("threadInput").value = "";
}

function closeThread() {
  switchTab("friendsTab");
}
