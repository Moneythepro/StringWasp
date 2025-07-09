// Firebase Auth & Firestore
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// Utils
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

function threadId(a, b) {
  return [a, b].sort().join("_");
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
  const ref = db.collection("groups").doc(room);
  ref.get().then(doc => {
    if (!doc.exists) {
      ref.set({
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
  const globalOption = document.createElement("option");
  globalOption.textContent = "global";
  globalOption.value = "global";
  dropdown.appendChild(globalOption);
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = doc.id;
      dropdown.appendChild(option);
    });
  });
}

// Chat
function listenMessages() {
  unsubscribeMessages = db.collection("rooms").doc(currentRoom)
    .collection("messages").orderBy("timestamp")
    .onSnapshot(async snapshot => {
      const container = document.getElementById("messages");
      container.innerHTML = "";
      for (const doc of snapshot.docs) {
        const msg = doc.data();
        const div = document.createElement("div");
        const fromMe = msg.senderId === currentUser.uid;
        div.className = fromMe ? "message right" : "message left";

        const userDoc = await db.collection("users").doc(msg.senderId).get();
        const username = userDoc.data().username || "Unknown";
        const photo = userDoc.data().photoURL || "default-avatar.png";

        div.innerHTML = `
          <img src="${photo}" class="avatar" onclick="openUserProfile('${msg.senderId}')"/>
          <div>
            <strong>${username}</strong><br/>
            ${msg.text}
          </div>
        `;
        div.addEventListener("contextmenu", e => {
          e.preventDefault();
          if (msg.senderId === currentUser.uid) {
            showMessageOptions(doc.ref, msg.text);
          }
        });

        container.appendChild(div);
      }
      container.scrollTop = container.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;
  db.collection("rooms").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function showMessageOptions(ref, currentText) {
  const choice = prompt("Edit or Delete? (e/d/cancel)");
  if (choice === "e") {
    const newText = prompt("Edit message:", currentText);
    if (newText) ref.update({ text: newText });
  } else if (choice === "d") {
    const del = confirm("Delete for everyone? Cancel = Only you");
    if (del) {
      ref.delete();
    } else {
      ref.update({ deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    }
  }
}

// Inbox
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid)
    .onSnapshot(snapshot => {
      const list = document.getElementById("inboxList");
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "inbox-card";
        div.innerHTML = `
          <strong>${data.fromName}</strong> sent you a request
          <button onclick="acceptRequest('${doc.id}')">✓</button>
          <button onclick="declineRequest('${doc.id}')">✕</button>
        `;
        list.appendChild(div);
      });
    });
}

function acceptRequest(id) {
  const ref = db.collection("inbox").doc(id);
  ref.get().then(doc => {
    const data = doc.data();
    db.collection("friends").doc(currentUser.uid).collection("list").doc(data.from).set({
      uid: data.from,
      username: data.fromName
    });
    ref.delete();
  });
}

function declineRequest(id) {
  db.collection("inbox").doc(id).delete();
}

// Friends
function loadFriends() {
  db.collection("friends").doc(currentUser.uid)
    .collection("list").onSnapshot(snapshot => {
      const list = document.getElementById("friendsList");
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const btn = document.createElement("button");
        btn.textContent = data.username;
        btn.onclick = () => openThread(data.uid, data.username);
        list.appendChild(btn);
      });
    });
}

// Thread Chat
function openThread(friendUid, friendUsername) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = `Chat with ${friendUsername}`;
  currentThreadUser = friendUid;
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, friendUid))
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
  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages").add({
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

// Search
function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  db.collection("users").where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = user.username;
        div.onclick = () => sendFriendRequest(doc.id, user.username);
        userResults.appendChild(div);
      });
    });

  db.collection("groups").where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = group.name;
        div.onclick = () => joinRoom(group.name);
        groupResults.appendChild(div);
      });
    });
}

function sendFriendRequest(toUid, toName) {
  const fromName = document.getElementById("usernameDisplay").textContent;
  db.collection("inbox").add({
    from: currentUser.uid,
    fromName,
    to: toUid,
    type: "friend_request",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert("Request sent!");
}

function switchSearchView(view) {
  const user = document.getElementById("searchResultsUser");
  const group = document.getElementById("searchResultsGroup");
  user.style.display = view === "user" ? "block" : "none";
  group.style.display = view === "group" ? "block" : "none";
}

// Profile
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    if (data.photoURL) {
      document.getElementById("profilePicPreview").src = data.photoURL;
    }
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const fileInput = document.getElementById("profilePic");
  const updates = { name, bio };

  if (fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      updates.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(updates, { merge: true });
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    db.collection("users").doc(currentUser.uid).set(updates, { merge: true });
  }
}

function openUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    alert(`Username: ${data.username}\nName: ${data.name || ''}\nBio: ${data.bio || ''}`);
  });
}

// Theme
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
};
