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

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab =>
    tab.style.display = "none"
  );
  document.getElementById(tabId).style.display = "block";
}

// ---------------- AUTH STATE ----------------
auth.onAuthStateChanged(async user => {
  if (!user) {
    document.getElementById("loginPage").style.display = "block";
    document.getElementById("appPage").style.display = "none";
    return;
  }

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("appPage").style.display = "block";
  document.getElementById("usernameDisplay").textContent = user.email;

  const userRef = db.collection("users").doc(user.uid);
  const snap = await userRef.get();

  if (!snap.exists || !snap.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    startApp(user);
  }
});

async function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a valid username.");
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

// ---------------- ADMIN PANEL ----------------
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

function getAdminRoomRef() {
  return db.collection("rooms").doc(currentRoom);
}
function getAdminInput() {
  return document.getElementById("memberEmail").value.trim();
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
  if (!data.members.includes(email)) return alert("User not in group.");
  if (data.admins.length >= 3) return alert("Max 3 admins.");
  await getAdminRoomRef().update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

// ---------------- CHAT + TYPING ----------------
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
          e.textContent = "Edit";
          r.textContent = "Delete";
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

// ---------------- PROFILE ----------------
function saveProfile() {
  const user = auth.currentUser;
  const name = document.getElementById("displayName").value;
  const bio = document.getElementById("bio").value;

  const file = document.getElementById("avatarInput").files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      db.collection("users").doc(user.uid).update({
        displayName: name,
        bio,
        avatar: dataURL
      });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(user.uid).update({
      displayName: name,
      bio
    });
  }
}

function loadProfile(uid) {
  db.collection("users").doc(uid).onSnapshot(doc => {
    const d = doc.data() || {};
    document.getElementById("displayName").value = d.displayName || "";
    document.getElementById("bio").value = d.bio || "";
    if (d.avatar) {
      const img = document.getElementById("avatarPreview");
      img.src = d.avatar;
      img.style.display = "block";
    }
  });
}

// ---------------- NOTIFICATIONS ----------------
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted")
    new Notification(`Msg from ${sender}`, { body: msg });
  document.getElementById("notifSound").play().catch(() => {});
}
if ("Notification" in window && Notification.permission !== "granted")
  Notification.requestPermission();

// ---------------- AUTH / FILES ----------------
function login() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, pass).catch(e => alert(e.message));
}

function listenForOffers() {
  // Stub for WebRTC/WebTorrent
}
