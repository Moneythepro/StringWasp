// Firebase Setup
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// Loading UI
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// Tabs
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelector(".fab-container").style.display = id === "groupsTab" ? "flex" : "none";
}

// Auth
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI();
    }
  } else {
    switchTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password).catch(alert);
}

function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, password).catch(alert);
}

function logout() {
  auth.signOut().then(() => location.reload());
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username.");
  db.collection("users").doc(currentUser.uid).set({ username }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");
  loadRooms();
  listenMessages();
  loadInbox();
  loadFriends();
  loadProfile();
  updateFollowers();
}

// Chat Rooms
function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      db.collection("groups").doc(doc.id).collection("members").doc(currentUser.uid).get().then(member => {
        if (member.exists) {
          const option = document.createElement("option");
          option.value = doc.id;
          option.textContent = doc.id;
          dropdown.appendChild(option);
        }
      });
    });
  });
}

function joinRoom(room) {
  currentRoom = room;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

function createGroup() {
  const name = prompt("Group name?");
  if (!name) return;
  const ref = db.collection("groups").doc(name);
  ref.set({
    name,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    autoJoin: true
  });
  ref.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
  joinRoom(name);
}

function joinGroup(name) {
  if (!name) return;
  db.collection("groups").doc(name).get().then(doc => {
    if (doc.exists) {
      db.collection("groups").doc(name).collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
      joinRoom(name);
    } else {
      alert("Group does not exist.");
    }
  });
}

function listenMessages() {
  const messages = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      messages.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const isMe = msg.senderId === currentUser.uid;
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (isMe ? "right" : "left");
        if (!isMe) {
          const info = document.createElement("div");
          info.className = "sender-info";
          const avatar = document.createElement("img");
          avatar.src = msg.senderPic || "default-avatar.png";
          avatar.className = "message-avatar";
          avatar.onclick = () => showUserProfile(msg.senderId);
          const name = document.createElement("div");
          name.className = "sender-name";
          name.textContent = msg.senderName || "User";
          info.appendChild(avatar);
          info.appendChild(name);
          bubble.appendChild(info);
        }
        const text = document.createElement("div");
        text.textContent = msg.text;
        bubble.appendChild(text);
        messages.appendChild(bubble);
      });
      messages.scrollTop = messages.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const { username, photoURL } = doc.data();
    db.collection("rooms").doc(currentRoom).collection("messages").add({
      text,
      senderId: currentUser.uid,
      senderName: username,
      senderPic: photoURL || "default-avatar.png",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  input.value = "";
}

// Group Chat
function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input.value.trim();
  if (!text || !currentRoom) return;
  db.collection("groups").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

// Inbox System
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid).onSnapshot(snapshot => {
    const list = document.getElementById("inboxList");
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const item = doc.data();
      const card = document.createElement("div");
      card.className = "inbox-card";
      const info = document.createElement("div");
      info.textContent = `${item.type}: ${item.fromName || item.from || "Unknown"}`;
      card.appendChild(info);
      const btns = document.createElement("div");
      btns.className = "btn-group";
      const accept = document.createElement("button");
      accept.textContent = "✓";
      accept.onclick = () => acceptRequest(doc.id);
      const decline = document.createElement("button");
      decline.textContent = "✕";
      decline.onclick = () => declineRequest(doc.id);
      btns.appendChild(accept);
      btns.appendChild(decline);
      card.appendChild(btns);
      list.appendChild(card);
    });
  });
}

function acceptRequest(id) {
  db.collection("inbox").doc(id).delete().then(() => alert("Accepted"));
}
function declineRequest(id) {
  db.collection("inbox").doc(id).delete().then(() => alert("Declined"));
}
function markAllRead() {
  db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });
  alert("Inbox cleared.");
}

// Friends & Threads
function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list) return;
  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const user = doc.data();
      const div = document.createElement("div");
      div.className = "friend-entry";
      div.textContent = user.username;
      div.onclick = () => openThread(user.uid, user.username);
      list.appendChild(div);
    });
  });
}

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  currentThreadUser = uid;
  document.getElementById("threadWithName").textContent = username;
  switchTab("threadView");
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
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
  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// Profile
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileGender").value = data.gender || "Other";
    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const phone = document.getElementById("profilePhone").value.trim();
  const gender = document.getElementById("profileGender").value;
  const file = document.getElementById("profilePic").files[0];
  const data = { name, bio, email, phone, gender };
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
        document.getElementById("profilePicPreview").src = e.target.result;
        alert("Profile updated.");
      });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => alert("Profile updated."));
  }
}

// Profile Viewer
function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    document.getElementById("viewProfileName").textContent = data.name || "Unnamed";
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
    document.getElementById("viewProfileModal").style.display = "flex";
  });
}

// Search
function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;
  const userRes = document.getElementById("searchResultsUser");
  const groupRes = document.getElementById("searchResultsGroup");
  userRes.innerHTML = "";
  groupRes.innerHTML = "";

  db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      const div = document.createElement("div");
      div.textContent = `@${user.username} ${user.name || ""}`;
      if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
      div.onclick = () => showUserProfile(doc.id);
      userRes.appendChild(div);
    });
  });

  db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      const div = document.createElement("div");
      div.textContent = group.name;
      div.onclick = () => joinGroup(group.name);
      groupRes.appendChild(div);
    });
  });
}

// Theme + UI
function toggleTheme() {
  const dark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
}
function applySavedTheme() {
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
}
function toggleFabMenu() {
  document.getElementById("fabMenu").classList.toggle("hidden");
}

// DOM Events
window.onload = () => {
  applySavedTheme();
  document.getElementById("messageInput").addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("threadInput").addEventListener("keypress", e => {
    if (e.key === "Enter") sendThreadMessage();
  });
  document.getElementById("profilePicPreview").onclick = () => {
    document.getElementById("profilePic").click();
  };
};
