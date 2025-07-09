// 🔥 Firebase Setup
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

function showLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const tab = document.getElementById(id);
  if (tab) tab.style.display = "block";
  const fab = document.querySelector(".fab-container");
  if (fab) fab.style.display = id === "groupsTab" ? "block" : "none";
}

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
  const pass = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, pass).catch(alert);
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, pass).catch(alert);
}

function logout() {
  auth.signOut().then(() => location.reload());
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter username");
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

// 📢 Group Functions
function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      db.collection("groups").doc(doc.id).collection("members").doc(currentUser.uid).get().then(memberDoc => {
        if (memberDoc.exists) {
          const opt = document.createElement("option");
          opt.textContent = doc.id;
          opt.value = doc.id;
          dropdown.appendChild(opt);
        }
      });
    });
  });
}

function createGroup() {
  const name = prompt("Enter group name:");
  if (!name) return;
  db.collection("groups").doc(name).set({
    name,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    db.collection("groups").doc(name).collection("members").doc(currentUser.uid).set({
      joinedAt: Date.now()
    }).then(() => joinRoom(name));
  });
}

function joinGroup() {
  const name = prompt("Enter group name to join:");
  if (!name) return;
  db.collection("groups").doc(name).get().then(doc => {
    if (!doc.exists) return alert("Group doesn't exist.");
    db.collection("groups").doc(name).collection("members").doc(currentUser.uid).set({
      joinedAt: Date.now()
    }).then(() => joinRoom(name));
  });
}

function joinRoom(name) {
  currentRoom = name;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

// 💬 Chat
function listenMessages() {
  const messagesDiv = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages").orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");
        if (msg.senderName) {
          const info = document.createElement("div");
          info.className = "sender-info";
          const img = document.createElement("img");
          img.src = msg.senderPic || "default-avatar.png";
          img.className = "message-avatar";
          img.onclick = () => showUserProfile(msg.senderId);
          const name = document.createElement("div");
          name.className = "sender-name";
          name.textContent = msg.senderName;
          info.appendChild(img);
          info.appendChild(name);
          bubble.appendChild(info);
        }
        const text = document.createElement("div");
        text.textContent = msg.text;
        bubble.appendChild(text);
        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
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

document.getElementById("messageInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

// 📨 Inbox
function loadInbox() {
  const list = document.getElementById("inboxList");
  db.collection("inbox").where("to", "==", currentUser.uid).onSnapshot(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      const card = document.createElement("div");
      card.className = "inbox-card";
      card.innerHTML = `<b>${data.type}</b>: ${data.fromName}`;
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
  alert("Cleared");
}

// 🧑 Friends
function loadFriends() {
  const list = document.getElementById("friendsList");
  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.textContent = data.username;
      div.onclick = () => openThread(data.uid, data.username);
      list.appendChild(div);
    });
  });
}

// 🔁 DM Threads
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;
  const threadRef = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages").orderBy("timestamp");
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = threadRef.onSnapshot(snapshot => {
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
  if (!text) return;
  const fromName = document.getElementById("usernameDisplay").textContent;
  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

document.getElementById("threadInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendThreadMessage();
});

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// 👤 Profile
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
  const data = {
    name: document.getElementById("profileName").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    email: document.getElementById("profileEmail").value.trim(),
    phone: document.getElementById("profilePhone").value.trim(),
    gender: document.getElementById("profileGender").value
  };
  const file = document.getElementById("profilePic").files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
        document.getElementById("profilePicPreview").src = e.target.result;
        alert("Profile updated.");
      });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
      alert("Profile updated.");
    });
  }
}

// 🔍 Search
function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;
  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      const div = document.createElement("div");
      div.textContent = `@${user.username} ${user.name || ""}`;
      if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
      div.onclick = () => showUserProfile(doc.id);
      userResults.appendChild(div);
    });
  });

  db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff").get().then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      const div = document.createElement("div");
      div.textContent = group.name;
      div.onclick = () => joinGroup(group.name);
      groupResults.appendChild(div);
    });
  });
}

// 👁️ View Profile
function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const d = doc.data();
    document.getElementById("viewProfilePic").src = d.photoURL || "default-avatar.png";
    document.getElementById("viewProfileName").textContent = d.name || "Unnamed";
    document.getElementById("viewProfileBio").textContent = d.bio || "No bio";
    document.getElementById("viewProfileUsername").textContent = "@" + (d.username || "unknown");
    document.getElementById("viewProfileEmail").textContent = d.email || "";
    document.getElementById("viewProfileStatus").textContent = d.status || "";
    document.getElementById("viewProfileModal").style.display = "block";
  });
}

// 🌓 Theme
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

window.onload = () => {
  applySavedTheme();
  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};
