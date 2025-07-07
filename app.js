/* ----- GLOBALS ----------------------------------------------------------- */
let currentRoom = "general";
let unsubscribeChat = null;
let unsubscribeTyping = null;
let unsubscribeRoomDoc = null;
let unsubscribeRoomList = null;
let lastMessageTS = 0;
let typingTO = null;

const getRoomPassword = () =>
  document.getElementById("roomPassword").value || "";

/* firebase auth state ----------------------------------------------------- */
auth.onAuthStateChanged(async user => {
  if (!user) {
    document.getElementById("chat").style.display = "none";
    document.getElementById("login").style.display = "block";
    return;
  }

  document.getElementById("login").style.display = "none";
  document.getElementById("chat").style.display = "block";
  document.getElementById("usernameDisplay").textContent = user.email;

  loadProfile(user.uid);
  startRoomListeners();
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  listenForOffers();
});

/* ---------------------------  ROOM MANAGEMENT  -------------------------- */
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
  if (currentRoom === "general") {
    alert("You can’t leave the #general room.");
    return;
  }
  if (!confirm(`Leave #${currentRoom}?`)) return;

  db.collection("rooms").doc(currentRoom)
    .update({
      members: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email),
      admins: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.email)
    });

  joinRoom("general");
}

/* ---------------------------  ADMIN TOOLS  ------------------------------ */
function updateAdminPanel(roomDoc) {
  const panel = document.getElementById("adminPanel");
  if (!roomDoc.exists) {
    panel.style.display = "none";
    return;
  }

  const data = roomDoc.data();
  const you = auth.currentUser.email;
  const isAdmin = data.admins.includes(you);
  const isCreator = data.creator === you;

  if (!(isAdmin || isCreator)) {
    panel.style.display = "none";
    return;
  }

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
  if (data.admins.length >= 3) {
    alert("Max 3 admins.");
    return;
  }
  if (!data.members.includes(email)) {
    alert("User must be a member first.");
    return;
  }
  await getAdminRoomRef().update({
    admins: firebase.firestore.FieldValue.arrayUnion(email)
  });
}

/* ---------------------------  CHAT / TYPING  ---------------------------- */
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
        try {
          body = await decryptMessage(m.encryptedText, m.iv, getRoomPassword());
        } catch { }
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

/* ---------------------------  PROFILE (unchanged) ----------------------- */
function saveProfile() { /* keep your existing profile save code */ }
function loadProfile(uid) { /* keep your existing profile load code */ }

/* ---------------------------  NOTIFICATIONS ----------------------------- */
function triggerNotification(sender, msg) {
  if (Notification.permission === "granted")
    new Notification(`Msg from ${sender}`, { body: msg });
  document.getElementById("notifSound").play().catch(() => { });
}
if ("Notification" in window && Notification.permission !== "granted")
  Notification.requestPermission();

/* ---------------------------  AUTH FUNCTIONS ---------------------------- */
function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email.includes("@")) {
    alert("Please enter a valid email.");
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      alert("Registration successful. You can now log in.");
    })
    .catch(error => {
      alert("Error: " + error.message);
    });
}

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .catch(error => {
      alert("Error: " + error.message);
    });
}

function listenForOffers() { /* keep existing code for P2P offers */ }
