// ---------------- GLOBALS ----------------
let currentRoom = "general";
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc, unsubscribeRoomList;
let typingTimeout, lastMessageTS = 0;
let currentThreadUser = null;

// ---------------- TABS ----------------
function switchTab(tabId) {
  document.querySelectorAll(".tab, .tabContent").forEach(el => el.style.display = "none");
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";
}

// ---------------- UTILS ----------------
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted") {
    new Notification(`Message from ${sender}`, { body: msg });
  }
  const audio = document.getElementById("notifSound");
  if (audio) audio.play().catch(() => {});
}

// ---------------- FIREBASE INIT ----------------
const firebaseConfig = {
  apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
  authDomain: "stringwasp.firebaseapp.com",
  projectId: "stringwasp",
  storageBucket: "stringwasp.appspot.com",
  messagingSenderId: "974718019508",
  appId: "1:974718019508:web:59fabe6306517d10b374e1"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------------- AUTH ----------------
auth.onAuthStateChanged(async user => {
  if (!user) return switchTab("loginPage");
  document.getElementById("usernameDisplay").textContent = user.email;
  const doc = await db.collection("users").doc(user.uid).get();
  if (!doc.exists || !doc.data().username) {
    document.getElementById("usernameDialog").style.display = "flex";
  } else {
    startApp(user);
  }
});

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username");
  const user = auth.currentUser;
  await db.collection("users").doc(user.uid).set({
    email: user.email,
    username,
    joined: Date.now()
  });
  document.getElementById("usernameDialog").style.display = "none";
  startApp(user);
}

async function startApp(user) {
  showLoading(true);
  await generateAndStoreKeys(user.uid);
  await createRoomIfMissing("general");
  joinRoom("general");
  startRoomListeners();
  populateDropdown();
  loadInbox(user.uid);
  loadFriends(user.uid);
  loadProfile(user.uid);
  switchTab("chatTab");
  showLoading(false);
}

// ---------------- LOGIN/REGISTER ----------------
function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!email || !password) return alert("Enter credentials");
  auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!email || !password) return alert("Enter credentials");
  auth.createUserWithEmailAndPassword(email, password).catch(e => alert(e.message));
}

// ---------------- ROOMS ----------------
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
  const dd = document.getElementById("roomDropdown");
  db.collection("rooms").get().then(qs => {
    dd.innerHTML = "";
    qs.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `#${doc.id}`;
      dd.appendChild(opt);
    });
    dd.value = currentRoom;
  });
}

async function joinRoom(roomName) {
  currentRoom = roomName;
  document.getElementById("roomDropdown").value = roomName;
  db.collection("rooms").doc(roomName).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });
  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(roomName)
    .onSnapshot(updateAdminPanel);
  listenForChat(roomName);
  listenForTyping(roomName);
}

function createOrJoinRoom() {
  const name = document.getElementById("customRoom").value.trim();
  if (!name) return;
  createRoomIfMissing(name);
  joinRoom(name);
  document.getElementById("customRoom").value = "";
}

// ---------------- CHAT ----------------
function listenForChat(room) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(room).collection("chat")
    .orderBy("time").onSnapshot(snap => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement("div");
        div.className = "message";
        div.innerHTML = `<b>${d.sender}:</b> ${d.text || "[Encrypted]"}`;
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const val = input.value.trim();
  if (!val) return;
  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email,
    text: val,
    time: Date.now()
  });
  input.value = "";
  db.collection("typing").doc(currentRoom).set({
    [auth.currentUser.email]: false
  }, { merge: true });
}

// ---------------- TYPING ----------------
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
  unsubscribeTyping = db.collection("typing").doc(roomName).onSnapshot(snap => {
    const d = snap.data() || {};
    const me = auth.currentUser.email;
    const others = Object.keys(d).filter(u => u !== me && d[u]);
    document.getElementById("typingIndicator").textContent =
      others.length ? `${others.join(", ")} typing...` : "";
  });
}

// ---------------- PROFILE ----------------
function loadProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const d = doc.data() || {};
    document.getElementById("profileName").value = d.name || "";
    document.getElementById("profileBio").value = d.bio || "";
  });
}
function saveProfile() {
  const user = auth.currentUser;
  db.collection("users").doc(user.uid).update({
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value
  }).then(() => alert("Profile saved"));
}

// ---------------- FRIEND SYSTEM ----------------
function loadFriends(uid) {
  const list = document.getElementById("friendsList");
  db.collection("users").get().then(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const d = doc.data();
      if (doc.id !== uid && d.username) {
        const item = document.createElement("div");
        item.className = "search-item";
        item.innerHTML = `<b>@${d.username}</b>
          <button onclick="startThread('${doc.id}', '${d.username}')">Chat</button>`;
        list.appendChild(item);
      }
    });
  });
}

function startThread(uid, username) {
  currentThreadUser = uid;
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = `Chat with @${username}`;
  listenThreadMessages(uid);
}
function closeThread() {
  currentThreadUser = null;
  switchTab("friendsTab");
}

function sendThreadMessage() {
  const val = document.getElementById("threadInput").value.trim();
  if (!val || !currentThreadUser) return;
  db.collection("threads").doc(getThreadId(auth.currentUser.uid, currentThreadUser))
    .collection("messages").add({
      from: auth.currentUser.uid,
      text: val,
      time: Date.now()
    });
  document.getElementById("threadInput").value = "";
}

function getThreadId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}
function listenThreadMessages(otherUid) {
  const box = document.getElementById("threadMessages");
  db.collection("threads").doc(getThreadId(auth.currentUser.uid, otherUid))
    .collection("messages").orderBy("time").onSnapshot(snap => {
      box.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        box.innerHTML += `<div class="message"><b>${d.from === auth.currentUser.uid ? "You" : "Them"}:</b> ${d.text}</div>`;
      });
      box.scrollTop = box.scrollHeight;
    });
}

// ---------------- INBOX ----------------
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
  alert("Friend accepted");
}
function declineInbox(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
}

// ---------------- SEARCH ----------------
async function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const [users, groups] = await Promise.all([
    db.collection("users").get(),
    db.collection("rooms").get()
  ]);
  const uBox = document.getElementById("searchResultsUser");
  const gBox = document.getElementById("searchResultsGroup");
  uBox.innerHTML = "";
  gBox.innerHTML = "";
  users.forEach(doc => {
    const d = doc.data();
    if (d.username && d.username.toLowerCase().includes(query)) {
      const devBadge = d.username === "moneythepro" ? " 🛠️ Developer" : "";
      uBox.innerHTML += `<div class="search-item"><b>@${d.username}${devBadge}</b><br>${d.bio || ""}</div>`;
    }
  });
  groups.forEach(doc => {
    const d = doc.data();
    if (doc.id.toLowerCase().includes(query)) {
      gBox.innerHTML += `<div class="search-item"><b>#${doc.id}</b><br>Members: ${d.members.length}</div>`;
    }
  });
}

// ---------------- ADMIN ----------------
function updateAdminPanel(doc) {
  const panel = document.getElementById("adminPanel");
  if (!doc.exists) return panel.style.display = "none";
  const data = doc.data();
  const you = auth.currentUser.email;
  const isAdmin = data.admins.includes(you);
  const isCreator = data.creator === you;
  if (!(isAdmin || isCreator)) return panel.style.display = "none";
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
  if (!data.members.includes(email)) return alert("User must be a member.");
  if (data.admins.length >= 3) return alert("Max 3 admins.");
  await getAdminRoomRef().update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

// ---------------- ENCRYPTION KEYS ----------------
async function generateAndStoreKeys(uid) {
  if (localStorage.getItem("privateKey") && localStorage.getItem("publicKey")) return;
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  localStorage.setItem("publicKey", JSON.stringify(publicKey));
  localStorage.setItem("privateKey", JSON.stringify(privateKey));
  await db.collection("users").doc(uid).update({ publicKey });
}

// ---------------- INIT NOTIFICATIONS ----------------
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}
