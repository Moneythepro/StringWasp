// ---------------- GLOBALS ----------------
let currentRoom = "general";
let unsubscribeChat = null;
let unsubscribeTyping = null;
let unsubscribeRoomDoc = null;
let unsubscribeRoomList = null;
let lastMessageTS = 0;
let typingTO = null;

// ---------------- TAB NAVIGATION ----------------
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(tabId).style.display = "block";
}

// ---------------- AUTH ----------------
auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    return;
  }

  document.getElementById("usernameDisplay").textContent = user.email;
  const userRef = db.collection("users").doc(user.uid);
  const snap = await userRef.get();

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
  auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  auth.createUserWithEmailAndPassword(email, pass).catch(e => alert(e.message));
}

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
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  startRoomListeners();
  loadInbox(user.uid);
  switchTab("appPage");
}

// ---------------- CHAT ----------------
function listenForChat(room) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(room)
    .collection("chat").orderBy("time")
    .onSnapshot(snapshot => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      let latest = 0;

      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = "message";

        let content = msg.text || "[Encrypted]";
        if (msg.sender === auth.currentUser.email) {
          const editBtn = document.createElement("button");
          const delBtn = document.createElement("button");
          editBtn.textContent = "Edit";
          delBtn.textContent = "Delete";
          editBtn.className = delBtn.className = "action-btn";
          editBtn.onclick = () => editMessage(doc.id, content);
          delBtn.onclick = () => deleteMessage(doc.id);
          div.appendChild(editBtn);
          div.appendChild(delBtn);
        }

        div.innerHTML += `<b>${msg.sender}:</b> ${content}`;
        box.appendChild(div);

        if (msg.time > lastMessageTS) {
          latest = msg.time;
          triggerNotification(msg.sender, content);
        }
      });

      box.scrollTop = box.scrollHeight;
      if (latest) lastMessageTS = latest;
    });
}

async function sendMessage() {
  const val = document.getElementById("messageInput").value.trim();
  if (!val) return;

  await db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: auth.currentUser.email,
    text: val,
    time: Date.now()
  });

  document.getElementById("messageInput").value = "";
  db.collection("typing").doc(currentRoom).set({ [auth.currentUser.email]: false }, { merge: true });
}

function deleteMessage(id) {
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).delete();
}

function editMessage(id, oldText) {
  const newText = prompt("Edit:", oldText);
  if (!newText || newText === oldText) return;
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).update({ text: newText, edited: true });
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

function listenForTyping(room) {
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(room).onSnapshot(snap => {
    const data = snap.data() || {};
    const me = auth.currentUser.email;
    const others = Object.keys(data).filter(u => u !== me && data[u]);
    document.getElementById("typingIndicator").textContent =
      others.length ? `${others.join(", ")} typing...` : "";
  });
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

async function createOrJoinRoom() {
  const name = document.getElementById("customRoom").value.trim();
  if (!name) return;
  await createRoomIfMissing(name);
  await joinRoom(name);
  document.getElementById("customRoom").value = "";
}

async function joinRoom(name) {
  currentRoom = name;
  document.getElementById("roomDropdown").value = name;

  db.collection("rooms").doc(name).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });

  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(name).onSnapshot(doc => updateAdminPanel(doc));

  listenForChat(name);
  listenForTyping(name);
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

function startRoomListeners() {
  unsubscribeRoomList = db.collection("rooms").orderBy("createdAt").onSnapshot(() => populateDropdown());
}

function populateDropdown() {
  const dd = document.getElementById("roomDropdown");
  db.collection("rooms").get().then(snap => {
    dd.innerHTML = "";
    snap.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `#${doc.id}`;
      dd.appendChild(opt);
    });
    dd.value = currentRoom;
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
          <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Send Friend Request</button>
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

function sendFriendRequest(uid, username) {
  const me = auth.currentUser;
  db.collection("users").doc(uid).collection("inbox").add({
    type: "friend_request",
    from: me.email,
    timestamp: Date.now()
  });
  alert(`Friend request sent to @${username}`);
}

function requestJoinGroup(groupId) {
  const me = auth.currentUser;
  db.collection("rooms").doc(groupId).collection("requests").add({
    from: me.email,
    timestamp: Date.now()
  });
  alert(`Requested to join #${groupId}`);
}

// ---------------- PROFILE ----------------
function loadProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const d = doc.data();
    document.getElementById("profileName").value = d.name || "";
    document.getElementById("profileBio").value = d.bio || "";
  });
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

// ---------------- INBOX ----------------
function loadInbox(uid) {
  const list = document.getElementById("inboxList");
  const ref = db.collection("users").doc(uid).collection("inbox").orderBy("timestamp", "desc");

  ref.onSnapshot(snap => {
    list.innerHTML = "";
    if (snap.empty) {
      list.innerHTML = "No notifications yet.";
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.className = "inbox-card";

      if (d.type === "friend_request") {
        card.innerHTML = `
          <h4>Friend request from ${d.from}</h4>
          <button onclick="acceptFriend('${doc.id}', '${uid}')">Accept</button>
          <button onclick="declineInbox('${doc.id}', '${uid}')">Decline</button>
        `;
      } else if (d.type === "group_invite") {
        card.innerHTML = `
          <h4>Group invite to #${d.groupId} from ${d.from}</h4>
          <button onclick="acceptGroup('${doc.id}', '${uid}', '${d.groupId}')">Accept</button>
          <button onclick="declineInbox('${doc.id}', '${uid}')">Decline</button>
        `;
      }

      list.appendChild(card);
    });
  });
}

function acceptFriend(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  alert("Friend accepted (not implemented yet)");
}

function acceptGroup(docId, uid, groupId) {
  db.collection("rooms").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
  });
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  alert(`You joined #${groupId}`);
}

function declineInbox(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
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

// ---------------- ADMIN PANEL ----------------
function updateAdminPanel(doc) {
  const panel = document.getElementById("adminPanel");
  if (!doc.exists) return panel.style.display = "none";

  const data = doc.data();
  const me = auth.currentUser.email;
  const isAdmin = data.admins.includes(me);
  const isCreator = data.creator === me;

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
