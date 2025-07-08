// ----------- Firebase Setup -----------
if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
    authDomain: "stringwasp.firebaseapp.com",
    projectId: "stringwasp",
    storageBucket: "stringwasp.appspot.com",
    messagingSenderId: "974718019508",
    appId: "1:974718019508:web:59fabe6306517d10b374e1"
  });
}
const db = firebase.firestore();
const auth = firebase.auth();

// ----------- Globals -----------
let currentRoom = "general";
let currentThread = null;
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc;
let typingTimeout, lastMessageTS = 0;

// ----------- Tabs -----------
function switchTab(tabId) {
  document.querySelectorAll(".tab, .tabContent").forEach(el => el.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// ----------- Loading Overlay -----------
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// ----------- Auth -----------
auth.onAuthStateChanged(async user => {
  if (!user) return switchTab("loginPage");
  document.getElementById("usernameDisplay").textContent = user.email;
  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists || !snap.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    startApp(user);
  }
});

function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  showLoading(true);
  auth.signInWithEmailAndPassword(email, pass).catch(err => {
    showLoading(false);
    alert(err.message);
  });
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  showLoading(true);
  auth.createUserWithEmailAndPassword(email, pass).catch(err => {
    showLoading(false);
    alert(err.message);
  });
}

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Username required");
  const user = auth.currentUser;
  await db.collection("users").doc(user.uid).set({
    email: user.email,
    username,
    joined: Date.now()
  });
  document.getElementById("usernameDialog").style.display = "none";
  startApp(user);
}

// ----------- App Initialization -----------
async function startApp(user) {
  showLoading(true);
  await createRoomIfMissing("general");
  loadProfile(user.uid);
  populateDropdown();
  joinRoom("general");
  startRoomListeners();
  loadInbox(user.uid);
  loadFriends(user.uid);
  switchTab("chatTab");
  showLoading(false);
}

// ----------- Room Chat -----------
async function createRoomIfMissing(name) {
  const ref = db.collection("rooms").doc(name);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      creator: auth.currentUser.email,
      admins: [auth.currentUser.email],
      members: [auth.currentUser.email],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function populateDropdown() {
  const dropdown = document.getElementById("roomDropdown");
  db.collection("rooms").orderBy("createdAt").get().then(qs => {
    dropdown.innerHTML = "";
    qs.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = "#" + doc.id;
      dropdown.appendChild(opt);
    });
    dropdown.value = currentRoom;
  });
}

async function createOrJoinRoom() {
  const roomName = document.getElementById("customRoom").value.trim();
  if (!roomName) return;
  await createRoomIfMissing(roomName);
  await joinRoom(roomName);
  document.getElementById("customRoom").value = "";
}

async function joinRoom(name) {
  currentRoom = name;
  document.getElementById("roomDropdown").value = name;
  await db.collection("rooms").doc(name).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });

  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(name)
    .onSnapshot(updateAdminPanel);

  listenForChat(name);
  listenForTyping(name);
}

function listenForChat(roomName) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(roomName).collection("chat").orderBy("time")
    .onSnapshot(snapshot => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const div = document.createElement("div");
        div.className = "message";
        const text = m.text || "[Encrypted]";
        div.innerHTML = `<b>${m.sender}:</b> ${text}`;
        box.appendChild(div);
        if (m.time > lastMessageTS) {
          lastMessageTS = m.time;
          triggerNotification(m.sender, text);
        }
      });
      box.scrollTop = box.scrollHeight;
    });
}

function sendMessage() {
  const val = document.getElementById("messageInput").value.trim();
  if (!val) return;
  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email,
    text: val,
    time: Date.now()
  });
  document.getElementById("messageInput").value = "";
  db.collection("typing").doc(currentRoom).set({ [auth.currentUser.email]: false }, { merge: true });
}

// ----------- Typing -----------
document.getElementById("messageInput").addEventListener("input", () => {
  const ref = db.collection("typing").doc(currentRoom);
  ref.set({ [auth.currentUser.email]: true }, { merge: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ref.set({ [auth.currentUser.email]: false }, { merge: true });
  }, 3000);
});

function listenForTyping(roomName) {
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(roomName).onSnapshot(doc => {
    const d = doc.data() || {};
    const me = auth.currentUser.email;
    const others = Object.keys(d).filter(k => k !== me && d[k]);
    document.getElementById("typingIndicator").textContent =
      others.length ? `${others.join(", ")} typing...` : "";
  });
}

// ----------- Inbox -----------
function loadInbox(uid) {
  const list = document.getElementById("inboxList");
  db.collection("users").doc(uid).collection("inbox").orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      if (snapshot.empty) return list.innerHTML = "No notifications yet.";
      snapshot.forEach(doc => {
        const d = doc.data();
        const card = document.createElement("div");
        card.className = "inbox-card";
        if (d.type === "friend_request") {
          card.innerHTML = `<h4>Friend request from ${d.from}</h4>
            <button onclick="acceptFriend('${doc.id}', '${uid}')">Accept</button>
            <button onclick="declineInbox('${doc.id}', '${uid}')">Decline</button>`;
        }
        list.appendChild(card);
      });
    });
}

function acceptFriend(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  alert("Friend request accepted.");
}
function declineInbox(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
}

// ----------- Search -----------
async function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;
  const [users, rooms] = await Promise.all([
    db.collection("users").get(),
    db.collection("rooms").get()
  ]);

  const uBox = document.getElementById("searchResultsUser");
  const gBox = document.getElementById("searchResultsGroup");
  uBox.innerHTML = ""; gBox.innerHTML = "";

  users.forEach(doc => {
    const d = doc.data();
    if (d.username && d.username.toLowerCase().includes(query)) {
      const isDev = d.username === "moneythepro" ? " 🛠️ Developer" : "";
      uBox.innerHTML += `<div class="search-item"><b>@${d.username}${isDev}</b><br>
      <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Send Friend Request</button></div>`;
    }
  });

  rooms.forEach(doc => {
    if (doc.id.toLowerCase().includes(query)) {
      const d = doc.data();
      gBox.innerHTML += `<div class="search-item"><b>#${doc.id}</b><br>
      Members: ${d.members.length}<br></div>`;
    }
  });
}

function sendFriendRequest(uid, username) {
  const user = auth.currentUser;
  db.collection("users").doc(uid).collection("inbox").add({
    type: "friend_request",
    from: user.email,
    timestamp: Date.now()
  });
  alert(`Friend request sent to @${username}`);
}

// ----------- Friends ----------
function loadFriends(uid) {
  const list = document.getElementById("friendsList");
  db.collection("users").get().then(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      if (doc.id !== uid) {
        const d = doc.data();
        const div = document.createElement("div");
        div.className = "friend-item";
        div.innerHTML = `<b>@${d.username}</b>
          <button onclick="openThread('${doc.id}', '${d.username}')">Chat</button>`;
        list.appendChild(div);
      }
    });
  });
}

// ----------- Thread Chat ----------
function openThread(uid, name) {
  currentThread = uid;
  document.getElementById("threadWithName").textContent = `Chat with @${name}`;
  switchTab("threadView");
  loadThreadMessages();
}

function closeThread() {
  switchTab("friendsTab");
}

function loadThreadMessages() {
  const box = document.getElementById("threadMessages");
  db.collection("threads")
    .doc(getThreadId(auth.currentUser.uid, currentThread))
    .collection("chat")
    .orderBy("time").onSnapshot(snap => {
      box.innerHTML = "";
      snap.forEach(doc => {
        const m = doc.data();
        box.innerHTML += `<div class="message"><b>${m.sender}:</b> ${m.text}</div>`;
      });
      box.scrollTop = box.scrollHeight;
    });
}

function sendThreadMessage() {
  const text = document.getElementById("threadInput").value.trim();
  if (!text) return;
  db.collection("threads")
    .doc(getThreadId(auth.currentUser.uid, currentThread))
    .collection("chat").add({
      sender: auth.currentUser.email,
      text,
      time: Date.now()
    });
  document.getElementById("threadInput").value = "";
}

function getThreadId(a, b) {
  return [a, b].sort().join("_");
}

// ----------- Profile -----------
function loadProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const d = doc.data();
    document.getElementById("profileName").value = d.name || "";
    document.getElementById("profileBio").value = d.bio || "";
  });
}

function saveProfile() {
  const user = auth.currentUser;
  db.collection("users").doc(user.uid).update({
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value
  }).then(() => alert("Profile updated"));
}

// ----------- Admin Panel -----------
function updateAdminPanel(doc) {
  const panel = document.getElementById("adminPanel");
  if (!doc.exists) return panel.style.display = "none";
  const data = doc.data();
  const you = auth.currentUser.email;
  const isAdmin = data.admins.includes(you);
  if (!isAdmin) return panel.style.display = "none";
  panel.style.display = "block";
  document.getElementById("adminInfo").textContent = 
    `Creator: ${data.creator}\nAdmins: ${data.admins.join(", ")}`;
}

function getAdminInput() {
  return document.getElementById("memberEmail").value.trim();
}

function getAdminRoomRef() {
  return db.collection("rooms").doc(currentRoom);
}

async function addMember() {
  const email = getAdminInput(); if (!email) return;
  await getAdminRoomRef().update({
    members: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

async function removeMember() {
  const email = getAdminInput(); if (!email) return;
  await getAdminRoomRef().update({
    members: firebase.firestore.FieldValue.arrayRemove(email),
    admins: firebase.firestore.FieldValue.arrayRemove(email)
  });
}

async function promoteMember() {
  const email = getAdminInput(); if (!email) return;
  const snap = await getAdminRoomRef().get();
  const data = snap.data();
  if (data.admins.length >= 3) return alert("Max 3 admins.");
  if (!data.members.includes(email)) return alert("User must be a member.");
  await getAdminRoomRef().update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

// ----------- Notification -----------
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

// ----------- WebTorrent (Optional) -----------
let client;
if (window.WebTorrent) {
  client = new WebTorrent();
} else {
  console.warn("WebTorrent not supported in this browser.");
}
