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
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// Tabs
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(id).style.display = "block";
  document.querySelector(".fab-container").style.display = id === "groupsTab" ? "flex" : "none";
}

// Auth
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

// Rooms
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
  const room = prompt("Enter new group name:");
  if (!room) return;
  const ref = db.collection("groups").doc(room);
  ref.set({
    name: room,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    autoJoin: true
  });
  ref.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
  joinRoom(room);
}

function joinGroup() {
  const room = prompt("Enter group to join:");
  if (!room) return;
  db.collection("groups").doc(room).get().then(doc => {
    if (doc.exists) {
      db.collection("groups").doc(room).collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
      joinRoom(room);
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
  const messagesDiv = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const isMine = msg.senderId === currentUser.uid;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (isMine ? "right" : "left");
        bubble.title = msg.timestamp?.toDate?.().toLocaleString() || "";

        if (!isMine) {
          const senderInfo = document.createElement("div");
          senderInfo.className = "sender-info";

          const img = document.createElement("img");
          img.src = msg.senderPic || "default-avatar.png";
          img.className = "message-avatar";
          img.onclick = () => showUserProfile(msg.senderId);
          senderInfo.appendChild(img);

          const name = document.createElement("div");
          name.className = "sender-name";
          name.textContent = msg.senderName || "User";
          senderInfo.appendChild(name);

          bubble.appendChild(senderInfo);
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
      senderName: username,
      senderId: currentUser.uid,
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

      const info = document.createElement("div");
      info.textContent = `${item.type}: ${item.fromName || item.from || "Unknown"}`;
      card.appendChild(info);

      const buttons = document.createElement("div");
      buttons.className = "btn-group";

      const accept = document.createElement("button");
      accept.textContent = "✓";
      accept.onclick = () => acceptRequest(doc.id);

      const decline = document.createElement("button");
      decline.textContent = "✕";
      decline.onclick = () => declineRequest(doc.id);

      buttons.appendChild(accept);
      buttons.appendChild(decline);
      card.appendChild(buttons);
      list.appendChild(card);
    });
  });
}

function acceptRequest(id) {
  db.collection("inbox").doc(id).delete().then(() => alert("Request accepted."));
}

function declineRequest(id) {
  db.collection("inbox").doc(id).delete().then(() => alert("Request declined."));
}

function markAllRead() {
  db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });
  alert("Inbox cleared.");
}

// Friends
function loadFriends() {
  const container = document.getElementById("friendsList");
  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
    container.innerHTML = "";
    snapshot.forEach(doc => {
      const friend = doc.data();
      const div = document.createElement("div");
      div.className = "friend-entry";
      div.textContent = friend.username;
      div.onclick = () => openThread(friend.uid, friend.username);
      container.appendChild(div);
    });
  });
}

// Threads
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;
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
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;
  const fromName = document.getElementById("usernameDisplay").textContent;
  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName,
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
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const phone = document.getElementById("profilePhone").value.trim();
  const gender = document.getElementById("profileGender").value;
  const file = document.getElementById("profilePic").files[0];
  const data = { name, bio, email, phone, gender };

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
    db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => alert("Profile updated."));
  }
}

// Utilities
function switchSubChat(id) {
  document.querySelectorAll(".chat-subtab").forEach(el => el.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
}

function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  db.collection("groups").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
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
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
    document.getElementById("viewProfileModal").style.display = "block";
  });
}

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

  db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.textContent = `@${user.username} ${user.name || ""}`;
        if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
        div.onclick = () => showUserProfile(doc.id);
        userResults.appendChild(div);
      });
    });

  db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.textContent = group.name;
        div.onclick = () => joinGroup(group.name);
        groupResults.appendChild(div);
      });
    });
}

// DOM Events
window.onload = () => {
  applySavedTheme();

  const msgInput = document.getElementById("messageInput");
  if (msgInput) msgInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });

  const threadInput = document.getElementById("threadInput");
  if (threadInput) threadInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendThreadMessage();
  });

  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};
