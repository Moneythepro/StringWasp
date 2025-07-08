<script>
let currentRoom = "general";
let currentThread = null;
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc, unsubscribeRoomList;
let typingTimeout, lastMessageTS = 0;

// ---------------- LOADING ----------------
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// ---------------- TABS ----------------
function switchTab(tabId) {
  document.querySelectorAll(".tab, .tabContent").forEach(t => t.style.display = "none");
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";
}

// ---------------- AUTH ----------------
auth.onAuthStateChanged(async user => {
  if (!user) return switchTab("loginPage");
  document.getElementById("usernameDisplay").textContent = user.email;
  const doc = await db.collection("users").doc(user.uid).get();
  if (!doc.exists || !doc.data().username) {
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

function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  showLoading(true);
  auth.signInWithEmailAndPassword(email, pass).catch(e => {
    showLoading(false);
    alert(e.message);
  });
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("Missing credentials");
  showLoading(true);
  auth.createUserWithEmailAndPassword(email, pass).catch(e => {
    showLoading(false);
    alert(e.message);
  });
}

// ---------------- INIT ----------------
async function startApp(user) {
  showLoading(true);
  loadProfile(user.uid);
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  startRoomListeners();
  loadInbox(user.uid);
  loadFriends(user.uid);
  switchTab("chatTab");
  showLoading(false);
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

function startRoomListeners() {
  unsubscribeRoomList = db.collection("rooms").orderBy("createdAt").onSnapshot(populateDropdown);
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
  unsubscribeRoomDoc = db.collection("rooms").doc(roomName).onSnapshot(updateAdminPanel);

  listenForChat(roomName);
  listenForTyping(roomName);
}

// ---------------- CHAT ----------------
function listenForChat(roomName) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(roomName).collection("chat").orderBy("time")
    .onSnapshot(snap => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      let latest = 0;
      snap.forEach(d => {
        const m = d.data();
        const div = document.createElement("div");
        div.className = "message";
        const body = m.text || "[Encrypted]";
        if (m.sender === auth.currentUser.email) {
          const e = document.createElement("button");
          const r = document.createElement("button");
          e.textContent = "Edit"; r.textContent = "Delete";
          e.className = "action-btn"; r.className = "action-btn";
          e.onclick = () => editMessage(d.id, body);
          r.onclick = () => deleteMessage(d.id);
          div.appendChild(e); div.appendChild(r);
        }
        div.innerHTML += `<b>${m.sender}:</b> ${body}`;
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
  db.collection("typing").doc(currentRoom).set({ [auth.currentUser.email]: false }, { merge: true });
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

// ---------------- FRIEND SYSTEM ----------------
function sendFriendRequest(uid, username) {
  const user = auth.currentUser;
  db.collection("users").doc(uid).collection("inbox").add({
    type: "friend_request",
    from: user.email,
    timestamp: Date.now()
  });
  alert(`Friend request sent to @${username}`);
}

function loadFriends(uid) {
  const list = document.getElementById("friendsList");
  list.innerHTML = "";
  db.collection("users").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.email !== auth.currentUser.email) {
        const div = document.createElement("div");
        div.innerHTML = `<b>${data.username || data.email}</b>
          <button onclick="openThread('${doc.id}', '${data.username || data.email}')">Chat</button>`;
        list.appendChild(div);
      }
    });
  });
}

function openThread(friendId, friendName) {
  currentThread = friendId;
  document.getElementById("threadWithName").textContent = friendName;
  switchTab("threadView");
  const box = document.getElementById("threadMessages");
  db.collection("threads").doc(currentThread).collection("chat")
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
  const val = document.getElementById("threadInput").value.trim();
  if (!val || !currentThread) return;
  db.collection("threads").doc(currentThread).collection("chat").add({
    sender: auth.currentUser.email,
    text: val,
    time: Date.now()
  });
  document.getElementById("threadInput").value = "";
}

function closeThread() {
  currentThread = null;
  switchTab("friendsTab");
}

// ---------------- SEARCH ----------------
async function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;
  const [users, groups] = await Promise.all([
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
      uBox.innerHTML += `<div class="search-item"><b>@${d.username}${isDev}</b><br>${d.bio || ""}<br>
        <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Send Friend Request</button></div>`;
    }
  });
  groups.forEach(doc => {
    if (doc.id.toLowerCase().includes(query)) {
      const d = doc.data();
      gBox.innerHTML += `<div class="search-item"><b>#${doc.id}</b><br>Members: ${d.members.length}<br>
        <button onclick="requestJoinGroup('${doc.id}')">Request to Join</button></div>`;
    }
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
  }).then(() => alert("Profile updated"));
}

// ---------------- NOTIFICATIONS ----------------
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
</script>
