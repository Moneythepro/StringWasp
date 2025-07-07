// ---------------- GLOBALS ----------------
let currentRoom = "general";
let unsubscribeChat = null;
let unsubscribeTyping = null;
let unsubscribeRoomDoc = null;
let unsubscribeRoomList = null;
let lastMessageTS = 0;
let typingTO = null;

// ---------------- HELPERS ----------------
const getRoomPassword = () =>
  document.getElementById("roomPassword").value || "";

function switchTab(tabId) {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// ---------------- AUTH STATE ----------------
auth.onAuthStateChanged(async user => {
  if (!user) {
    document.getElementById("appPage").style.display = "none";
    document.getElementById("loginPage").style.display = "block";
    return;
  }

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("appPage").style.display = "block";
  document.getElementById("usernameDisplay").textContent = user.email;

  const userRef = db.collection("users").doc(user.uid);
  const userSnap = await userRef.get();

  // Prompt username if first time
  if (!userSnap.exists || !userSnap.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    startApp(user);
  }
});

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Pick a valid username.");

  const user = auth.currentUser;
  const userRef = db.collection("users").doc(user.uid);

  await userRef.set({
    email: user.email,
    username: username,
    joined: Date.now()
  });

  document.getElementById("usernameDialog").style.display = "none";
  startApp(user);
}

// Start everything
async function startApp(user) {
  loadProfile(user.uid);
  startRoomListeners();
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  listenForOffers();
  switchTab("chatsTab");
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
      listEl.innerHTML = "";
      snap.forEach(doc => {
        const data = doc.data();
        const li = document.createElement("li");
        li.textContent = `${doc.id} (${data.members.length})`;
        li.style.cursor = "pointer";
        li.onclick = () => joinRoom(doc.id);
        listEl.appendChild(li);
      });
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

  db.collection("rooms").doc(roomName)
    .update({
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

  db.collection("rooms").doc(currentRoom)
    .update({
      members: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email),
      admins: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email)
    });

  joinRoom("general");
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

  panel.dataset.creator = data.creator;
  panel.dataset.admins = JSON.stringify(data.admins);
  panel.dataset.members = JSON.stringify(data.members);
}

function getAdminRoomRef() { return db.collection("rooms").doc(currentRoom); }
function getAdminInput() { return document.getElementById("memberEmail").value.trim(); }

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

// ---------------- CHAT ----------------
function listenForChat(roomName) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(roomName)
    .collection("chat").orderBy("time")
    .onSnapshot(snap => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      let latest = 0;

      snap.forEach(async d => {
        const m = d.data();
        const div = document.createElement("div");
        div.className = "message";

        let body = "[Cannot decrypt]";
        try { body = await decryptMessage(m.encryptedText, m.iv, getRoomPassword()); } catch {}
        div.innerHTML = `<b>${m.sender}:</b> ${body} ${m.edited ? "<i>(edited)</i>" : ""}`;

        if (m.sender === auth.currentUser.email) {
          const e = document.createElement("button");
          const r = document.createElement("button");
          e.textContent = "Edit"; r.textContent = "Delete";
          e.className = "action-btn"; r.className = "action-btn";
          e.onclick = () => editMessage(d.id, body, m.iv);
          r.onclick = () => deleteMessage(d.id);
          div.append(e, r);
        } else if (m.time > lastMessageTS) {
          latest = Math.max(latest, m.time);
          triggerNotification(m.sender, body);
        }

        box.appendChild(div);
      });

      box.scrollTop = box.scrollHeight;
      if (latest) lastMessageTS = latest;
    });
}

function listenForTyping(roomName) {
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(roomName)
    .onSnapshot(s => {
      const d = s.data() || {}, me = auth.currentUser.email;
      const others = Object.keys(d).filter(u => u !== me && d[u]);
      document.getElementById("typingIndicator").textContent =
        others.length ? `${others.join(", ")} typing…` : "";
    });
}

async function sendMessage() {
  const val = document.getElementById("messageInput").value.trim();
  if (!val) return;
  const enc = await encryptMessage(val, getRoomPassword());
  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email, ...enc, time: Date.now(), edited: false
  });
  document.getElementById("messageInput").value = "";
  db.collection("typing").doc(currentRoom)
    .set({ [auth.currentUser.email]: false }, { merge: true });
}

function deleteMessage(id) {
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).delete();
}

async function editMessage(id, oldText, iv) {
  const n = prompt("Edit:", oldText); if (!n || n === oldText) return;
  const enc = await encryptMessage(n, getRoomPassword());
  db.collection("messages").doc(currentRoom).collection("chat").doc(id)
    .update({ ...enc, edited: true });
}

document.getElementById("messageInput").addEventListener("input", () => {
  const ref = db.collection("typing").doc(currentRoom);
  ref.set({ [auth.currentUser.email]: true }, { merge: true });
  clearTimeout(typingTO);
  typingTO = setTimeout(() =>
    ref.set({ [auth.currentUser.email]: false }, { merge: true }), 3000);
});

// ---------------- PROFILE / NOTIFS ----------------
function saveProfile() {/* existing code */}
function loadProfile(uid) {/* existing code */}
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted")
    new Notification(`Msg from ${sender}`, { body: msg });
  document.getElementById("notifSound").play().catch(() => {});
}
if ("Notification" in window && Notification.permission !== "granted")
  Notification.requestPermission();

// ---------------- AUTH + FILES ----------------
function login() {/* existing code */}
function register() {/* existing code */}
function listenForOffers() {/* existing code */}
// Switch app tabs
function switchTab(tabId) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

let currentSearchTab = "user";

function switchSearchView(type) {
  currentSearchTab = type;
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

async function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) {
    document.getElementById("searchResultsUser").innerHTML = "";
    document.getElementById("searchResultsGroup").innerHTML = "";
    return;
  }

  // Search Users
  const userRes = document.getElementById("searchResultsUser");
  const userSnap = await db.collection("users").get();
  let htmlUser = "";
  userSnap.forEach(doc => {
    const d = doc.data();
    if (d.username && d.username.toLowerCase().includes(query)) {
      htmlUser += `
        <div class="search-item">
          <b>@${d.username}</b><br>
          ${d.bio || "No bio"}<br>
          <button onclick="sendFriendRequest('${doc.id}')">Send Friend Request</button>
        </div><hr>
      `;
    }
  });
  userRes.innerHTML = htmlUser || "<i>No users found.</i>";

  // Search Groups
  const groupRes = document.getElementById("searchResultsGroup");
  const groupSnap = await db.collection("rooms").get();
  let htmlGroup = "";
  groupSnap.forEach(doc => {
    if (doc.id.toLowerCase().includes(query)) {
      htmlGroup += `
        <div class="search-item">
          <b>#${doc.id}</b><br>
          Members: ${doc.data().members.length}<br>
          <button onclick="requestJoinGroup('${doc.id}')">Request to Join</button>
        </div><hr>
      `;
    }
  });
  groupRes.innerHTML = htmlGroup || "<i>No groups found.</i>";
}

function sendFriendRequest(uid) {
  alert(`Friend request sent to ${uid} (inbox system coming next)`);
  // TODO: Add to that user’s "inbox" collection in Firestore
}

function requestJoinGroup(groupId) {
  alert(`Request to join group #${groupId} sent.`);
  // TODO: Add request to group join queue (for approval)
}
