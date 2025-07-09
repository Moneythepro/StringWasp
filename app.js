// Firebase Auth & Firestore
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// Utility Functions
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// Auth & Init
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists || !userDoc.data().username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = userDoc.data().username;
      loadMainUI();
    }
  } else {
    switchTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password).catch(alert);
}

function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, password).catch(alert);
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter username");
  db.collection("users").doc(currentUser.uid).set({ username }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// Load Main Interface
function loadMainUI() {
  switchTab("chatTab");
  document.getElementById("appPage").style.display = "block";
  loadRooms();
  listenMessages();
  loadInbox();
  loadFriends();
  loadProfile();
}

// Rooms
function createOrJoinRoom() {
  const room = document.getElementById("customRoom").value.trim();
  if (!room) return;

  const groupRef = db.collection("groups").doc(room);
  groupRef.get().then(doc => {
    if (!doc.exists) {
      groupRef.set({
        name: room,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid
      });
    }
    joinRoom(room);
  });
}

function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.textContent = "global";
  defaultOption.value = "global";
  dropdown.appendChild(defaultOption);

  db.collection("groups").orderBy("name").get().then(snapshot => {
    snapshot.forEach(doc => {
      const groupName = doc.id;
      if (groupName !== "global") {
        const option = document.createElement("option");
        option.textContent = groupName;
        option.value = groupName;
        dropdown.appendChild(option);
      }
    });
  });
}

// Chat
function listenMessages() {
  unsubscribeMessages = db.collection("rooms").doc(currentRoom)
    .collection("messages").orderBy("timestamp")
    .onSnapshot(snapshot => {
      const messages = document.getElementById("messages");
      messages.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.textContent = `${msg.sender}: ${msg.text}`;
        messages.appendChild(div);
      });
      messages.scrollTop = messages.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;
  const sender = document.getElementById("usernameDisplay").textContent;
  db.collection("rooms").doc(currentRoom)
    .collection("messages").add({
      text, sender,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  input.value = "";
}

// Inbox
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid)
    .onSnapshot(snapshot => {
      const list = document.getElementById("inboxList");
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const item = doc.data();
        const card = document.createElement("div");
        card.className = "inbox-card";
        card.textContent = `${item.type.toUpperCase()}: ${item.fromName}`;
        list.appendChild(card);
      });
    });
}

// Friends
function loadFriends() {
  db.collection("friends").doc(currentUser.uid)
    .collection("list").onSnapshot(snapshot => {
      const container = document.getElementById("friendsList");
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const friend = doc.data();
        const btn = document.createElement("button");
        btn.textContent = friend.username;
        btn.onclick = () => openThread(friend.uid, friend.username);
        container.appendChild(btn);
      });
    });
}

// Threaded Chat
function openThread(friendUid, friendUsername) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = `Chat with ${friendUsername}`;
  currentThreadUser = friendUid;
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = db.collection("threads")
    .doc(threadId(currentUser.uid, friendUid))
    .collection("messages").orderBy("timestamp")
    .onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.textContent = `${msg.fromName}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;
  const fromName = document.getElementById("usernameDisplay").textContent;
  const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
  ref.add({
    text, from: currentUser.uid, fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// Search
function switchSearchView(view) {
  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");

  if (view === "user") {
    userResults.style.display = "block";
    groupResults.style.display = "none";
  } else if (view === "group") {
    userResults.style.display = "none";
    groupResults.style.display = "block";
  }
}

function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;

  // Search Users
  db.collection("users").where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      const results = document.getElementById("searchResultsUser");
      results.innerHTML = "";
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = user.username;
        results.appendChild(div);
      });
    });

  // Search Groups
  db.collection("groups").where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      const results = document.getElementById("searchResultsGroup");
      results.innerHTML = "";
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = group.name;
        div.onclick = () => joinRoom(group.name);
        results.appendChild(div);
      });
    });
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
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  db.collection("users").doc(currentUser.uid).set({ name, bio }, { merge: true });
}

// Dark Mode Toggle
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = isDark;
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  const isDark = theme === "dark";
  if (isDark) document.body.classList.add("dark");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = isDark;
}

window.onload = () => {
  applySavedTheme();
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.addEventListener("change", toggleTheme);
};
