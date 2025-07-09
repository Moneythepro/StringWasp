// Final Production-Ready app.js for StringWasp v1.0

// Firebase Setup
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// DOM References
const tabs = document.querySelectorAll('.tab');
const loadingOverlay = document.getElementById('loadingOverlay');
const notifSound = document.getElementById('notifSound');

// App State
let currentUser = null;
let username = "";
let selectedRoom = "";
let typingTimeout;
let isTyping = false;

// Show Tabs
function showTab(tabId) {
  tabs.forEach(tab => tab.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
}

// Loading Overlay
function showLoading(show = true) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Theme Toggle
function toggleTheme() {
  document.body.classList.toggle("dark");
}

// Refresh Button
function refreshPage() {
  location.reload();
}

// Auth Handlers
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  showLoading(true);
  auth.signInWithEmailAndPassword(email, password).then(() => {
    showLoading(false);
  }).catch(err => {
    showLoading(false);
    alert(err.message);
  });
}

function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  showLoading(true);
  auth.createUserWithEmailAndPassword(email, password).then(() => {
    showLoading(false);
  }).catch(err => {
    showLoading(false);
    alert(err.message);
  });
}

function logout() {
  auth.signOut();
}

// Username Picker
function saveUsername() {
  const input = document.getElementById("newUsername").value.trim().toLowerCase();
  if (!input || input.length < 3) return alert("Username must be at least 3 characters");
  db.collection("usernames").doc(input).get().then(doc => {
    if (doc.exists) return alert("Username already taken");
    const uid = auth.currentUser.uid;
    db.collection("usernames").doc(input).set({ uid });
    db.collection("users").doc(uid).update({ username: input });
    username = input;
    loadMainApp();
  });
}

// Load Main App
function loadMainApp() {
  showTab("appPage");
  const uid = auth.currentUser.uid;
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists || !doc.data().username) {
      showTab("usernameDialog");
    } else {
      username = doc.data().username;
      document.getElementById("usernameDisplay").textContent = "@" + username;
      setupRealtimeListeners();
      loadRooms();
      loadFriends();
      loadInbox();
      loadProfile();
    }
  });
}

// Auth Listener
auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    loadMainApp();
  } else {
    showTab("loginPage");
  }
});

// Rooms / Group Chat
function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = `<option value="">Select Group</option>`;
  db.collection("groups").where("members", "array-contains", currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = doc.data().name;
        dropdown.appendChild(opt);
      });
    });
}

function joinRoom(id) {
  selectedRoom = id;
  loadMessages();
}

// Messaging
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !selectedRoom) return;
  db.collection("groups").doc(selectedRoom).collection("messages").add({
    uid: currentUser.uid,
    username,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
  isTyping = false;
  setTyping(false);
}

function loadMessages() {
  const msgDiv = document.getElementById("messages");
  msgDiv.innerHTML = "";
  db.collection("groups").doc(selectedRoom).collection("messages")
    .orderBy("createdAt").onSnapshot(snapshot => {
      msgDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = `message-bubble ${msg.uid === currentUser.uid ? "right" : "left"}`;
        div.innerHTML = `<strong>@${msg.username}</strong><br>${msg.text}`;
        msgDiv.appendChild(div);
      });
      msgDiv.scrollTop = msgDiv.scrollHeight;
    });
}

// Typing Indicator
document.getElementById("messageInput").addEventListener("input", () => {
  if (!selectedRoom) return;
  if (!isTyping) {
    isTyping = true;
    setTyping(true);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      setTyping(false);
    }, 3000);
  } else {
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      setTyping(false);
    }, 3000);
  }
});

function setTyping(state) {
  db.collection("groups").doc(selectedRoom).collection("typing")
    .doc(currentUser.uid).set({ username, typing: state });
}

function setupRealtimeListeners() {
  if (!selectedRoom) return;
  const typingDiv = document.getElementById("typingIndicator");
  db.collection("groups").doc(selectedRoom).collection("typing")
    .onSnapshot(snapshot => {
      const typers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.typing && doc.id !== currentUser.uid) {
          typers.push(data.username);
        }
      });
      typingDiv.textContent = typers.length ? `${typers.join(", ")} is typing...` : "";
    });
}

// Inbox
function loadInbox() {
  const list = document.getElementById("inboxList");
  db.collection("users").doc(currentUser.uid).collection("inbox")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const item = doc.data();
        const div = document.createElement("div");
        div.className = "inbox-card";
        div.innerHTML = `<strong>${item.title}</strong><br>${item.body}`;
        list.appendChild(div);
      });
    });
}

function markAllRead() {
  const ref = db.collection("users").doc(currentUser.uid).collection("inbox");
  ref.get().then(snap => snap.forEach(doc => ref.doc(doc.id).delete()));
}

// Friends
function loadFriends() {
  const list = document.getElementById("friendsList");
  db.collection("users").doc(currentUser.uid).collection("friends")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const friend = doc.data();
        const div = document.createElement("div");
        div.className = "friend-entry";
        div.textContent = friend.username;
        div.onclick = () => openThread(friend.uid, friend.username);
        list.appendChild(div);
      });
    });
}

// Threads
function openThread(uid, uname) {
  showTab("threadView");
  document.getElementById("threadWithName").textContent = "@" + uname;
  const threadMessages = document.getElementById("threadMessages");
  db.collection("users").doc(currentUser.uid).collection("threads")
    .doc(uid).collection("messages").orderBy("createdAt")
    .onSnapshot(snapshot => {
      threadMessages.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = `message-bubble ${msg.from === currentUser.uid ? "right" : "left"}`;
        div.textContent = msg.text;
        threadMessages.appendChild(div);
      });
      threadMessages.scrollTop = threadMessages.scrollHeight;
    });
  document.getElementById("threadInput").onkeydown = e => {
    if (e.key === "Enter") sendThreadMessage(uid);
  };
}

function sendThreadMessage(uid) {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text) return;
  const message = {
    from: currentUser.uid,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.collection("users").doc(currentUser.uid).collection("threads").doc(uid).collection("messages").add(message);
  db.collection("users").doc(uid).collection("threads").doc(currentUser.uid).collection("messages").add(message);
  input.value = "";
}

function closeThread() {
  showTab("friendsTab");
}

// Profile
function loadProfile() {
  const uid = currentUser.uid;
  const name = document.getElementById("profileName");
  const bio = document.getElementById("profileBio");
  const email = document.getElementById("profileEmail");
  const phone = document.getElementById("profilePhone");
  const pic = document.getElementById("profilePicPreview");

  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    name.value = data.name || "";
    bio.value = data.bio || "";
    email.value = data.email || "";
    phone.value = data.phone || "";
    if (data.photoURL) pic.src = data.photoURL;
  });
}

function saveProfile() {
  const uid = currentUser.uid;
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const email = document.getElementById("profileEmail").value;
  const phone = document.getElementById("profilePhone").value;
  db.collection("users").doc(uid).update({ name, bio, email, phone });
}

document.getElementById("profilePic").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("profilePicPreview").src = reader.result;
  };
  reader.readAsDataURL(file);
  const ref = storage.ref().child("avatars/" + currentUser.uid);
  ref.put(file).then(() => ref.getDownloadURL()).then(url => {
    db.collection("users").doc(currentUser.uid).update({ photoURL: url });
  });
});

// FAB
function toggleFabMenu() {
  document.getElementById("fabMenu").classList.toggle("hidden");
}

function createOrJoinRoom() {
  const name = prompt("Group name:");
  if (!name) return;
  db.collection("groups").add({
    name,
    members: [currentUser.uid],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
