// Firebase Init (if not done in firebase.js)
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;
let currentRoom = 'general';
let isAdmin = false;
let typingTimeout;
let threadFriendUID = null;

// Switch between visible tabs
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
}

// Loading overlay control
function showLoading(show = true) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// Auth state
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    showLoading(true);
    const userDoc = await db.collection("users").doc(user.uid).get();
    const data = userDoc.data();
    if (!data || !data.username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = `@${data.username}`;
      initApp();
    }
    showLoading(false);
  } else {
    currentUser = null;
    switchTab("loginPage");
  }
});

// Register
function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, password).catch(alert);
}

// Login
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password).catch(alert);
}

// Username save
async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username");
  const taken = await db.collection("users").where("username", "==", username).get();
  if (!taken.empty) return alert("Username taken");

  await db.collection("users").doc(currentUser.uid).set({
    email: currentUser.email,
    username,
    created: Date.now()
  });
  document.getElementById("usernameDisplay").textContent = `@${username}`;
  initApp();
}

// Initialize app after login
async function initApp() {
  switchTab("chatTab");
  document.getElementById("appPage").style.display = "block";
  loadRooms();
  joinRoom(currentRoom);
  loadProfile();
  loadInbox();
  loadFriends();
}

// Load dropdown rooms
async function loadRooms() {
  const roomDropdown = document.getElementById("roomDropdown");
  roomDropdown.innerHTML = "";
  const snapshot = await db.collection("rooms").get();
  snapshot.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.id;
    roomDropdown.appendChild(opt);
  });
}

// Create or join room
async function createOrJoinRoom() {
  const name = document.getElementById("customRoom").value.trim();
  if (!name) return;
  const ref = db.collection("rooms").doc(name);
  const doc = await ref.get();
  if (!doc.exists) await ref.set({ created: Date.now(), admin: currentUser.uid });
  joinRoom(name);
}

// Join chat room
function joinRoom(room) {
  currentRoom = room;
  document.getElementById("roomDropdown").value = room;
  document.getElementById("messages").innerHTML = "";
  db.collection("messages")
    .where("room", "==", room)
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      document.getElementById("messages").innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        appendMessage(data.username, data.text);
      });
    });

  // Check if admin
  db.collection("rooms").doc(room).get().then(doc => {
    isAdmin = doc.exists && doc.data().admin === currentUser.uid;
    document.getElementById("adminPanel").style.display = isAdmin ? "block" : "none";
  });
}

// Send message
function sendMessage() {
  const text = document.getElementById("messageInput").value.trim();
  if (!text) return;
  document.getElementById("messageInput").value = "";

  db.collection("users").doc(currentUser.uid).get().then(userDoc => {
    const username = userDoc.data().username || "Anonymous";
    db.collection("messages").add({
      room: currentRoom,
      uid: currentUser.uid,
      text,
      username,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

// Append message
function appendMessage(user, text) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `<strong>${user}:</strong> ${text}`;
  document.getElementById("messages").appendChild(msg);
}

// Admin tools
function addMember() {
  // Placeholder (future: add user to room ACL)
  alert("AddMember feature coming soon.");
}
function removeMember() {
  alert("RemoveMember feature coming soon.");
}
function promoteMember() {
  alert("PromoteMember feature coming soon.");
}

// Search
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}
async function runSearch() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;

  // User search
  const users = await db.collection("users")
    .where("username", ">=", q).where("username", "<=", q + "\uf8ff").get();

  const userRes = document.getElementById("searchResultsUser");
  userRes.innerHTML = "";
  users.forEach(doc => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = "@" + doc.data().username;
    userRes.appendChild(div);
  });

  // Group search
  const rooms = await db.collection("rooms")
    .where(firebase.firestore.FieldPath.documentId(), ">=", q)
    .where(firebase.firestore.FieldPath.documentId(), "<=", q + "\uf8ff").get();

  const groupRes = document.getElementById("searchResultsGroup");
  groupRes.innerHTML = "";
  rooms.forEach(doc => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = "#" + doc.id;
    groupRes.appendChild(div);
  });
}

// Inbox (basic friend request mock)
function loadInbox() {
  const inboxList = document.getElementById("inboxList");
  inboxList.innerHTML = "<div class='card'>No new notifications</div>"; // Replace with real Firestore notifications
}

// Profile
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
  });
}
function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  db.collection("users").doc(currentUser.uid).update({ name, bio });
}

// Threads
function openThread(uid, username) {
  threadFriendUID = uid;
  document.getElementById("threadWithName").textContent = username;
  document.getElementById("threadMessages").innerHTML = "";
  switchTab("threadView");
}
function closeThread() {
  switchTab("friendsTab");
}
function sendThreadMessage() {
  const text = document.getElementById("threadInput").value.trim();
  if (!text || !threadFriendUID) return;
  document.getElementById("threadInput").value = "";
  // Firestore implementation of direct messages goes here (not yet enabled)
}
