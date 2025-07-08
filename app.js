// Initialize WebTorrent client
const client = new WebTorrent();

// Function to send a file to a friend (P2P)
function sendFile(file, recipientId) {
  client.seed(file, torrent => {
    const magnet = torrent.magnetURI;
    db.collection("users").doc(recipientId).collection("inbox").add({
      type: "file",
      from: auth.currentUser.email,
      magnet,
      fileName: file.name,
      timestamp: Date.now()
    });
    alert(`File shared with ${recipientId}`);
  });
}

// Function to receive a file from a magnet link
function receiveFile(magnetURI) {
  client.add(magnetURI, torrent => {
    torrent.files.forEach(file => {
      file.getBlob((err, blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
      });
    });
  });
}
// Firebase globals
const db = firebase.firestore();
const auth = firebase.auth();

// UI state
let currentRoom = "general";
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc;
let lastMessageTS = 0, typingTimeout;
let currentThreadId = null;
let unsubscribeThread;

// Utility
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}
function switchTab(id) {
  document.querySelectorAll(".tab, .tabContent").forEach(e => e.style.display = "none");
  document.getElementById(id).style.display = "block";
}

// Auth
auth.onAuthStateChanged(async user => {
  if (!user) return switchTab("loginPage");
  document.getElementById("usernameDisplay").textContent = user.email;
  const userDoc = await db.collection("users").doc(user.uid).get();
  if (!userDoc.exists || !userDoc.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    await initApp(user);
  }
});

async function login() {
  const email = email.value.trim();
  const pass = password.value.trim();
  if (!email || !pass) return alert("Missing fields");
  showLoading(true);
  auth.signInWithEmailAndPassword(email, pass).catch(e => {
    alert(e.message); showLoading(false);
  });
}
function register() {
  const email = email.value.trim();
  const pass = password.value.trim();
  if (!email || !pass) return alert("Missing fields");
  showLoading(true);
  auth.createUserWithEmailAndPassword(email, pass).catch(e => {
    alert(e.message); showLoading(false;
  });
}
async function saveUsername() {
  const name = newUsername.value.trim();
  if (!name) return alert("Choose a username");
  const user = auth.currentUser;
  await db.collection("users").doc(user.uid).set({
    username: name,
    email: user.email,
    joined: Date.now()
  });
  document.getElementById("usernameDialog").style.display = "none";
  await initApp(user);
}

// Init
async function initApp(user) {
  showLoading(true);
  await generateKeyPairIfNeeded(user.uid);
  await createRoomIfMissing("general");
  await populateDropdown();
  await joinRoom("general");
  startRoomListeners();
  loadInbox(user.uid);
  loadFriends();
  switchTab("chatTab");
  showLoading(false);
}

// Room
async function createRoomIfMissing(name) {
  const ref = db.collection("rooms").doc(name);
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({
      creator: auth.currentUser.email,
      admins: [auth.currentUser.email],
      members: [auth.currentUser.email],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}
async function joinRoom(room) {
  currentRoom = room;
  roomDropdown.value = room;
  await db.collection("rooms").doc(room).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });
  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(room).onSnapshot(updateAdminPanel);
  listenForChat(room);
  listenForTyping(room);
}
function createOrJoinRoom() {
  const name = customRoom.value.trim();
  if (!name) return;
  createRoomIfMissing(name).then(() => joinRoom(name));
  customRoom.value = "";
}
function populateDropdown() {
  db.collection("rooms").get().then(qs => {
    roomDropdown.innerHTML = "";
    qs.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = "#" + doc.id;
      roomDropdown.appendChild(opt);
    });
    roomDropdown.value = currentRoom;
  });
}

// Chat
function listenForChat(room) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(room).collection("chat").orderBy("time")
    .onSnapshot(snap => {
      messages.innerHTML = "";
      let latest = 0;
      snap.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = "message";
        const body = msg.text || "[Encrypted]";
        div.innerHTML = `<b>${msg.sender}:</b> ${body}`;
        if (msg.sender === auth.currentUser.email) {
          div.innerHTML += ` <button onclick="editMessage('${doc.id}', '${body}')">Edit</button>
          <button onclick="deleteMessage('${doc.id}')">Delete</button>`;
        }
        messages.appendChild(div);
        if (msg.time > lastMessageTS) {
          lastMessageTS = msg.time;
          triggerNotification(msg.sender, body);
        }
      });
      messages.scrollTop = messages.scrollHeight;
    });
}
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email,
    text,
    time: Date.now()
  });
  messageInput.value = "";
  db.collection("typing").doc(currentRoom).set({ [auth.currentUser.email]: false }, { merge: true });
}
function deleteMessage(id) {
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).delete();
}
function editMessage(id, oldText) {
  const newText = prompt("Edit:", oldText);
  if (!newText || newText === oldText) return;
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).update({ text: newText });
}

// Typing
messageInput.addEventListener("input", () => {
  const ref = db.collection("typing").doc(currentRoom);
  ref.set({ [auth.currentUser.email]: true }, { merge: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ref.set({ [auth.currentUser.email]: false }, { merge: true });
  }, 3000);
});
function listenForTyping(room) {
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(room).onSnapshot(doc => {
    const d = doc.data() || {};
    const others = Object.entries(d).filter(([k, v]) => k !== auth.currentUser.email && v);
    typingIndicator.textContent = others.length ? `${others.map(([k]) => k).join(", ")} typing...` : "";
  });
}

// Admin Panel
function updateAdminPanel(doc) {
  if (!doc.exists) return adminPanel.style.display = "none";
  const data = doc.data();
  const me = auth.currentUser.email;
  if (!data.admins.includes(me) && data.creator !== me) return adminPanel.style.display = "none";
  adminPanel.style.display = "block";
  adminInfo.textContent = `Creator: ${data.creator}\nAdmins: ${data.admins.join(", ")}`;
}
function addMember() {
  const email = memberEmail.value.trim();
  if (!email) return;
  db.collection("rooms").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayUnion(email)
  });
}
function removeMember() {
  const email = memberEmail.value.trim();
  if (!email) return;
  db.collection("rooms").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayRemove(email),
    admins: firebase.firestore.FieldValue.arrayRemove(email)
  });
}
function promoteMember() {
  const email = memberEmail.value.trim();
  if (!email) return;
  db.collection("rooms").doc(currentRoom).update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

// Inbox
function loadInbox(uid) {
  const box = inboxList;
  db.collection("users").doc(uid).collection("inbox").orderBy("timestamp", "desc")
    .onSnapshot(qs => {
      box.innerHTML = "";
      if (qs.empty) return box.innerHTML = "No notifications yet.";
      qs.forEach(doc => {
        const d = doc.data();
        const div = document.createElement("div");
        div.className = "inbox-card";
        if (d.type === "friend_request") {
          div.innerHTML = `<h4>Friend request from ${d.from}</h4>
            <button onclick="acceptFriend('${doc.id}', '${uid}')">Accept</button>
            <button onclick="declineInbox('${doc.id}', '${uid}')">Decline</button>`;
        }
        box.appendChild(div);
      });
    });
}
function acceptFriend(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  // Add to local friends
}
function declineInbox(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
}

// Friends
function loadFriends() {
  // You can implement Firestore-based friends collection here
  friendsList.innerHTML = `<p>No friends system implemented yet</p>`;
}

// Search
async function runSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const uBox = searchResultsUser;
  const gBox = searchResultsGroup;
  uBox.innerHTML = ""; gBox.innerHTML = "";
  const [users, groups] = await Promise.all([
    db.collection("users").get(),
    db.collection("rooms").get()
  ]);
  users.forEach(doc => {
    const d = doc.data();
    if (d.username && d.username.toLowerCase().includes(query)) {
      const badge = d.username === "moneythepro" ? " 🛠️ Developer" : "";
      uBox.innerHTML += `<div class="search-item"><b>@${d.username}${badge}</b>
        <br>${d.bio || ""}<br>
        <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Friend Request</button></div>`;
    }
  });
  groups.forEach(doc => {
    if (doc.id.toLowerCase().includes(query)) {
      const d = doc.data();
      gBox.innerHTML += `<div class="search-item"><b>#${doc.id}</b><br>Members: ${d.members.length}
        <br><button onclick="requestJoinGroup('${doc.id}')">Request Join</button></div>`;
    }
  });
}
function sendFriendRequest(uid, username) {
  db.collection("users").doc(uid).collection("inbox").add({
    type: "friend_request",
    from: auth.currentUser.email,
    timestamp: Date.now()
  });
  alert(`Friend request sent to @${username}`);
}
function requestJoinGroup(id) {
  alert("Join request sent to #" + id);
}

// Notifications
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted") {
    new Notification(`Message from ${sender}`, { body: msg });
  }
  const audio = document.getElementById("notifSound");
  if (audio) audio.play().catch(() => {});
}
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// Crypto Keys
async function generateKeyPairIfNeeded(uid) {
  if (localStorage.getItem("privateKey") && localStorage.getItem("publicKey")) return;
  const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();
  await db.collection("users").doc(uid).update({ publicKey: publicKeyJwk });
}
