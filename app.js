// ---------------- GLOBALS ----------------
let currentRoom = "general";
let unsubscribeChat = null;
let unsubscribeTyping = null;
let unsubscribeRoomDoc = null;
let unsubscribeRoomList = null;
let lastMessageTS = 0;
let typingTO = null;

const getRoomPassword = () =>
  document.getElementById("roomPassword").value || "";

// ---------------- TABS ----------------
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// ---------------- AUTH STATE ----------------
auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    return;
  }

  document.getElementById("usernameDisplay").textContent = user.email;
  const userRef = db.collection("users").doc(user.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists || !userSnap.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    startApp(user);
  }
});

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Pick a username");

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
  loadProfile(user.uid);
  startRoomListeners();
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  switchTab("chatsTab");
}

// ---------------- AUTH ----------------
function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  auth.signInWithEmailAndPassword(email, pass)
    .catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  auth.createUserWithEmailAndPassword(email, pass)
    .catch(e => alert(e.message));
}

// ---------------- ROOM SYSTEM ----------------
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

function startRoomListeners() {
  const listEl = document.getElementById("roomList");
  unsubscribeRoomList = db.collection("rooms")
    .orderBy("createdAt")
    .onSnapshot(snap => {
      populateDropdown();
    });
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

async function createOrJoinRoom() {
  const name = document.getElementById("customRoom").value.trim();
  if (!name) return;
  await createRoomIfMissing(name);
  await joinRoom(name);
  document.getElementById("customRoom").value = "";
}

async function joinRoom(roomName) {
  currentRoom = roomName;
  document.getElementById("roomDropdown").value = roomName;

  db.collection("rooms").doc(roomName).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });

  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(roomName)
    .onSnapshot(doc => updateAdminPanel(doc));

  listenForChat(roomName);
  listenForTyping(roomName);
}

function leaveRoom() {
  if (currentRoom === "general") return alert("You can’t leave #general.");
  if (!confirm(`Leave #${currentRoom}?`)) return;

  db.collection("rooms").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email),
    admins: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email)
  });

  joinRoom("general");
}

// ---------------- CHAT ----------------
function listenForChat(roomName) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(roomName)
    .collection("chat").orderBy("time")
    .onSnapshot(snap => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      let latest = 0;

      snap.forEach(d => {
        const m = d.data();
        const div = document.createElement("div");
        div.className = "message";

        let body = m.text || "[Encrypted]";
        if (m.sender === auth.currentUser.email) {
          const e = document.createElement("button");
          const r = document.createElement("button");
          e.textContent = "Edit"; r.textContent = "Delete";
          e.className = "action-btn"; r.className = "action-btn";
          e.onclick = () => editMessage(d.id, body);
          r.onclick = () => deleteMessage(d.id);
          div.appendChild(e); div.appendChild(r);
        }

        div.innerHTML = `<b>${m.sender}:</b> ${body}`;
        box.appendChild(div);

        if (m.time > lastMessageTS) {
          latest = m.time;
          triggerNotification(m.sender, body);
        }
      });

      box.scrollTop = box.scrollHeight;
      if (latest) lastMessageTS = latest;
    });
}

async function sendMessage() {
  const val = document.getElementById("messageInput").value.trim();
  if (!val) return;

  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email,
    text: val,
    time: Date.now()
  });

  document.getElementById("messageInput").value = "";
  db.collection("typing").doc(currentRoom)
    .set({ [auth.currentUser.email]: false }, { merge: true });
}

function deleteMessage(id) {
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).delete();
}

function editMessage(id, oldText) {
  const newText = prompt("Edit:", oldText);
  if (!newText || newText === oldText) return;
  db.collection("messages").doc(currentRoom).collection("chat").doc(id)
    .update({ text: newText, edited: true });
}

// ---------------- TYPING INDICATOR ----------------
document.getElementById("messageInput").addEventListener("input", () => {
  const ref = db.collection("typing").doc(currentRoom);
  ref.set({ [auth.currentUser.email]: true }, { merge: true });
  clearTimeout(typingTO);
  typingTO = setTimeout(() => {
    ref.set({ [auth.currentUser.email]: false }, { merge: true });
  }, 3000);
});

function listenForTyping(roomName) {
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(roomName)
    .onSnapshot(snap => {
      const d = snap.data() || {};
      const me = auth.currentUser.email;
      const others = Object.keys(d).filter(u => u !== me && d[u]);
      document.getElementById("typingIndicator").textContent =
        others.length ? `${others.join(", ")} typing...` : "";
    });
}

// ---------------- SEARCH ----------------
function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

async function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;

  const userSnap = await db.collection("users").get();
  const groupSnap = await db.collection("rooms").get();

  const uBox = document.getElementById("searchResultsUser");
  const gBox = document.getElementById("searchResultsGroup");

  uBox.innerHTML = ""; gBox.innerHTML = "";

  userSnap.forEach(doc => {
    const d = doc.data();
    if (d.username && d.username.toLowerCase().includes(query)) {
      uBox.innerHTML += `
        <div class="search-item">
          <b>@${d.username}</b><br>${d.bio || ""}<br>
          <button onclick="sendFriendRequest('${doc.id}')">Send Friend Request</button>
        </div>`;
    }
  });

  groupSnap.forEach(doc => {
    if (doc.id.toLowerCase().includes(query)) {
      const d = doc.data();
      gBox.innerHTML += `
        <div class="search-item">
          <b>#${doc.id}</b><br>Members: ${d.members.length}<br>
          <button onclick="requestJoinGroup('${doc.id}')">Request to Join</button>
        </div>`;
    }
  });
}

function sendFriendRequest(uid) {
  alert(`Friend request sent to ${uid}`);
}

function requestJoinGroup(groupId) {
  alert(`Requested to join #${groupId}`);
}

// ---------------- PROFILE ----------------
function loadProfile(uid) {
  // TODO: Add profile loading if needed
}

function saveProfile() {
  const bio = document.getElementById("profileBio").value;
  const name = document.getElementById("profileName").value;
  const user = auth.currentUser;

  db.collection("users").doc(user.uid).update({
    bio: bio || "",
    name: name || ""
  }).then(() => alert("Profile updated"));
}

// ---------------- NOTIFICATIONS ----------------
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted")
    new Notification(`Message from ${sender}`, { body: msg });

  const audio = document.getElementById("notifSound");
  if (audio) audio.play().catch(() => {});
}

if ("Notification" in window && Notification.permission !== "granted")
  Notification.requestPermission();

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
  if (data.admins.length >= 3) return alert("Max 3 admins.");
  if (!data.members.includes(email)) return alert("User must be a member.");
  await getAdminRoomRef().update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}
