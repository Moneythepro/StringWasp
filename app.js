// app.js
// StringWasp v1.0 — Final Build

// Firebase Init
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentUser = null;
let currentRoom = "global";
let currentChatUser = null;
let messageListeners = [];

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
  document.querySelectorAll(".tabs button").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`#tab-${tabId.replace("Tab", "").toLowerCase()}`);
  if (activeBtn) activeBtn.classList.add("active");
  if (tabId === "groupChatsTab") {
    document.querySelector(".fab-container").style.display = "block";
  } else {
    document.querySelector(".fab-container").style.display = "none";
  }
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
}

function applySavedTheme() {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    document.getElementById("darkModeToggle").checked = true;
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    const snap = await db.collection("users").doc(user.uid).get();
    if (!snap.exists || !snap.data().username) {
      switchTab("usernameDialog");
    } else {
      initApp();
    }
  } else {
    switchTab("loginPage");
  }
});

async function login() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    alert(e.message);
  }
}

async function register() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
  } catch (e) {
    alert(e.message);
  }
}

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username!");
  const taken = await db.collection("users").where("username", "==", username).get();
  if (!taken.empty) return alert("Username taken!");
  await db.collection("users").doc(currentUser.uid).set({ username, email: currentUser.email }, { merge: true });
  initApp();
}

async function initApp() {
  document.getElementById("usernameDisplay").innerText = "@" + (await getUserData(currentUser.uid)).username;
  loadFriends();
  loadInbox();
  loadGroups();
  loadProfile();
  switchTab("chatTab");
  applySavedTheme();
}

function logout() {
  auth.signOut();
}

async function getUserData(uid) {
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? doc.data() : null;
}

// Message Sending
function sendMessage() {
  const msg = document.getElementById("messageInput").value.trim();
  if (!msg) return;
  db.collection("messages").add({
    text: msg,
    sender: currentUser.uid,
    room: currentRoom,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });
  document.getElementById("messageInput").value = "";
}

function listenToMessages(room) {
  messageListeners.forEach(unsub => unsub());
  messageListeners = [];
  const unsub = db.collection("messages")
    .where("room", "==", room)
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {
      const container = document.getElementById("messages");
      container.innerHTML = "";
      snapshot.forEach(async doc => {
        const msg = doc.data();
        const user = await getUserData(msg.sender);
        const div = document.createElement("div");
        div.className = "message-bubble " + (msg.sender === currentUser.uid ? "right" : "left");
        div.setAttribute("data-time", msg.timestamp?.toDate().toLocaleTimeString());
        div.innerHTML = `<strong>${user.username}</strong><br>${msg.text}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      });
    });
  messageListeners.push(unsub);
}

// Friends
async function loadFriends() {
  const snap = await db.collection("follows").where("from", "==", currentUser.uid).get();
  const list = document.getElementById("friendsList");
  list.innerHTML = "";
  for (const doc of snap.docs) {
    const user = await getUserData(doc.data().to);
    const div = document.createElement("div");
    div.className = "friend-entry";
    div.innerText = user.username;
    div.onclick = () => openChat(user.uid);
    list.appendChild(div);
  }
}

// Inbox
async function loadInbox() {
  const snap = await db.collection("inbox")
    .where("to", "==", currentUser.uid).orderBy("time", "desc").get();
  const list = document.getElementById("inboxList");
  list.innerHTML = "";
  snap.docs.forEach(async doc => {
    const data = doc.data();
    const fromUser = await getUserData(data.from);
    const div = document.createElement("div");
    div.className = "inbox-card";
    div.innerHTML = `<strong>${fromUser.username}</strong><br>${data.type}`;
    const btnAccept = document.createElement("button");
    btnAccept.innerText = "Accept";
    btnAccept.onclick = async () => {
      if (data.type === "friend_request") {
        await db.collection("follows").add({ from: currentUser.uid, to: data.from });
        await db.collection("follows").add({ from: data.from, to: currentUser.uid });
      }
      await db.collection("inbox").doc(doc.id).delete();
      loadInbox();
    };
    const btnDecline = document.createElement("button");
    btnDecline.innerText = "Decline";
    btnDecline.onclick = () => db.collection("inbox").doc(doc.id).delete().then(loadInbox);
    div.append(btnAccept, btnDecline);
    list.appendChild(div);
  });
}

function markAllRead() {
  db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  }).then(loadInbox);
}

// Search
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

async function runSearch() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const userSnap = await db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff").get();
  const groupSnap = await db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff").get();

  const userRes = document.getElementById("searchResultsUser");
  const groupRes = document.getElementById("searchResultsGroup");
  userRes.innerHTML = "";
  groupRes.innerHTML = "";

  userSnap.forEach(doc => {
    const user = doc.data();
    const div = document.createElement("div");
    div.className = "search-result";
    div.innerHTML = `<strong>@${user.username}</strong>`;
    const btn = document.createElement("button");
    btn.innerText = "Follow";
    btn.onclick = () => db.collection("follows").add({ from: currentUser.uid, to: doc.id });
    div.appendChild(btn);
    userRes.appendChild(div);
  });

  groupSnap.forEach(doc => {
    const group = doc.data();
    const div = document.createElement("div");
    div.className = "search-result";
    div.innerHTML = `<strong>#${group.name}</strong>`;
    const btn = document.createElement("button");
    btn.innerText = "Join";
    btn.onclick = () => joinRoom(doc.id);
    div.appendChild(btn);
    groupRes.appendChild(div);
  });
}

// Group logic
function joinRoom(roomId) {
  currentRoom = roomId;
  listenToMessages(roomId);
  document.getElementById("roomDropdown").value = roomId;
}

async function createOrJoinRoom() {
  const room = prompt("Enter group name to create/join:");
  if (!room) return;
  const ref = db.collection("groups").doc(room);
  const doc = await ref.get();
  if (!doc.exists) await ref.set({ name: room });
  joinRoom(room);
}

// Profile
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileEmail").value = data.publicEmail || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const phone = document.getElementById("profilePhone").value;
  const email = document.getElementById("profileEmail").value;
  db.collection("users").doc(currentUser.uid).set({ name, bio, phone, publicEmail: email }, { merge: true });
}

document.getElementById("profilePic").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const ref = storage.ref("avatars/" + currentUser.uid);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  await db.collection("users").doc(currentUser.uid).set({ photoURL: url }, { merge: true });
  document.getElementById("profilePicPreview").src = url;
});

// Extra UI
document.getElementById("profilePicPreview").onclick = () => document.getElementById("profilePic").click();
document.querySelector(".refresh-button").onclick = () => location.reload();
