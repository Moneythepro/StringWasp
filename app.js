// Firebase Setup
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// Loading
function showLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

// Tabs
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  const tab = document.getElementById(id);
  if (tab) tab.style.display = "block";
  const fab = document.querySelector(".fab-container");
  if (fab) fab.style.display = (id === "groupsTab") ? "flex" : "none";
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
}

// Rooms
function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      doc.ref.collection("members").doc(currentUser.uid).get().then(memberDoc => {
        if (memberDoc.exists) {
          const opt = document.createElement("option");
          opt.value = doc.id;
          opt.textContent = doc.id;
          dropdown.appendChild(opt);
        }
      });
    });
  });
}

function createGroup() {
  const name = prompt("Enter new group name:");
  if (!name) return;
  const ref = db.collection("groups").doc(name);
  ref.set({
    name,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  ref.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
  joinRoom(name);
}

function joinGroup() {
  const name = prompt("Enter group to join:");
  if (!name) return;
  db.collection("groups").doc(name).get().then(doc => {
    if (doc.exists) {
      doc.ref.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
      joinRoom(name);
    } else {
      alert("Group does not exist.");
    }
  });
}

function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

function listenMessages() {
  const container = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");
        bubble.title = msg.timestamp?.toDate?.().toLocaleString() || "";

        if (msg.senderId !== currentUser.uid) {
          const info = document.createElement("div");
          info.className = "sender-info";

          const img = document.createElement("img");
          img.src = msg.senderPic || "default-avatar.png";
          img.className = "message-avatar";
          img.onclick = () => showUserProfile(msg.senderId);
          info.appendChild(img);

          const name = document.createElement("div");
          name.className = "sender-name";
          name.textContent = msg.senderName || "User";
          info.appendChild(name);
          bubble.appendChild(info);
        }

        const text = document.createElement("div");
        text.textContent = msg.text;
        bubble.appendChild(text);
        container.appendChild(bubble);
      });
      container.scrollTop = container.scrollHeight;
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

// Inbox
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid).onSnapshot(snapshot => {
    const list = document.getElementById("inboxList");
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const item = doc.data();
      const card = document.createElement("div");
      card.className = "inbox-card";
      card.innerHTML = `<div>${item.type}: ${item.fromName || item.from || "Unknown"}</div>`;
      const group = document.createElement("div");
      group.className = "btn-group";
      const accept = document.createElement("button");
      accept.textContent = "✓";
      accept.onclick = () => acceptRequest(doc.id);
      const decline = document.createElement("button");
      decline.textContent = "✕";
      decline.onclick = () => declineRequest(doc.id);
      group.appendChild(accept);
      group.appendChild(decline);
      card.appendChild(group);
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
  alert("All marked read.");
}

// Friends
function loadFriends() {
  const list = document.getElementById("friendsList");
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

// Thread Chat
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;
  if (unsubscribeThread) unsubscribeThread();
  const area = document.getElementById("threadMessages");
  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
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
    const avatar = document.getElementById("profilePicPreview");
    if (avatar) avatar.src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const file = document.getElementById("profilePic").files[0];
  const data = {
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value,
    email: document.getElementById("profileEmail").value,
    phone: document.getElementById("profilePhone").value,
    gender: document.getElementById("profileGender").value
  };
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true });
      document.getElementById("profilePicPreview").src = e.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true });
  }
  alert("Profile updated.");
}

// Utilities
function switchSubChat(id) {
  document.querySelectorAll(".chat-subtab").forEach(el => el.style.display = "none");
  const tab = document.getElementById(id);
  if (tab) tab.style.display = "block";
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

function toggleFabMenu() {
  document.getElementById("fabMenu").classList.toggle("hidden");
}

function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    document.getElementById("viewProfileName").textContent = data.name || "Unnamed";
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileBio").textContent = data.bio || "";
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
    document.getElementById("viewProfileModal").style.display = "flex";
  });
}

function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

function runSearch() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  const userBox = document.getElementById("searchResultsUser");
  const groupBox = document.getElementById("searchResultsGroup");
  userBox.innerHTML = "";
  groupBox.innerHTML = "";

  db.collection("users").where("username", ">=", q).where("username", "<=", q + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      const div = document.createElement("div");
      div.textContent = `@${user.username} ${user.name || ""}`;
      if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
      div.onclick = () => showUserProfile(doc.id);
      userBox.appendChild(div);
    });
  });

  db.collection("groups").where("name", ">=", q).where("name", "<=", q + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      const div = document.createElement("div");
      div.textContent = group.name;
      div.onclick = () => joinGroup(group.name);
      groupBox.appendChild(div);
    });
  });
}

// DOM Events
window.onload = () => {
  applySavedTheme();
  const msgInput = document.getElementById("messageInput");
  if (msgInput) msgInput.addEventListener("keypress", e => e.key === "Enter" && sendMessage());
  const threadInput = document.getElementById("threadInput");
  if (threadInput) threadInput.addEventListener("keypress", e => e.key === "Enter" && sendThreadMessage());
  const pic = document.getElementById("profilePicPreview");
  if (pic) pic.onclick = () => document.getElementById("profilePic").click();
};
