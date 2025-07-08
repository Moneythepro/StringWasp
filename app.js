// ---------------- GLOBALS ----------------
let currentRoom = "general";
let currentUser, currentFriendId = null;
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc, unsubscribeRoomList;
let typingTimeout, lastMessageTS = 0;
let db = firebase.firestore();
let auth = firebase.auth();

// ---------------- UTILS ----------------
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}
function switchTab(id) {
  document.querySelectorAll(".tab, .tabContent").forEach(el => el.style.display = "none");
  document.getElementById(id).style.display = "block";
}
function notify(msg) {
  const audio = document.getElementById("notifSound");
  if (Notification.permission === "granted") new Notification("StringWasp", { body: msg });
  if (audio) audio.play().catch(() => {});
}

// ---------------- AUTH ----------------
auth.onAuthStateChanged(async user => {
  if (!user) return switchTab("loginPage");
  currentUser = user;
  const doc = await db.collection("users").doc(user.uid).get();
  if (!doc.exists || !doc.data().username) {
    document.getElementById("usernameDialog").style.display = "block";
  } else {
    startApp(user);
  }
});

async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return alert("Missing credentials");
  showLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    alert(e.message);
  }
  showLoading(false);
}

async function register() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return alert("Missing credentials");
  showLoading(true);
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (e) {
    alert(e.message);
  }
  showLoading(false);
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
  showLoading(true);
  loadProfile(user.uid);
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
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
      creator: currentUser.email,
      admins: [currentUser.email],
      members: [currentUser.email],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function populateDropdown() {
  const dd = document.getElementById("roomDropdown");
  db.collection("rooms").orderBy("createdAt").get().then(qs => {
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
  joinRoom(name);
  document.getElementById("customRoom").value = "";
}

async function joinRoom(name) {
  currentRoom = name;
  document.getElementById("roomDropdown").value = name;

  await db.collection("rooms").doc(name).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.email)
  });

  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(name).collection("chat").orderBy("time")
    .onSnapshot(snap => {
      const box = document.getElementById("messages");
      box.innerHTML = "";
      snap.forEach(d => {
        const m = d.data();
        const div = document.createElement("div");
        div.className = "message";
        div.innerHTML = `<b>${m.sender}:</b> ${m.text}`;
        box.appendChild(div);
        if (m.time > lastMessageTS) {
          notify(`${m.sender}: ${m.text}`);
          lastMessageTS = m.time;
        }
      });
      box.scrollTop = box.scrollHeight;
    });
}

// ---------------- CHAT ----------------
function sendMessage() {
  const val = document.getElementById("messageInput").value.trim();
  if (!val) return;
  db.collection("messages").doc(currentRoom).collection("chat").add({
    sender: currentUser.email,
    text: val,
    time: Date.now()
  });
  document.getElementById("messageInput").value = "";
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
  db.collection("users").doc(currentUser.uid).update({
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value
  }).then(() => alert("Profile saved"));
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
  uBox.innerHTML = "";
  gBox.innerHTML = "";

  users.forEach(doc => {
    const d = doc.data();
    if (d.username?.toLowerCase().includes(query)) {
      const isDev = d.username === "moneythepro" ? " 🛠️ Developer" : "";
      uBox.innerHTML += `<div class="search-item"><b>@${d.username}${isDev}</b><br>${d.bio || ""}<br>
        <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Add Friend</button></div>`;
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
    .onSnapshot(snap => {
      list.innerHTML = "";
      if (snap.empty) return list.innerHTML = "No notifications yet.";
      snap.forEach(doc => {
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

function sendFriendRequest(uid, username) {
  db.collection("users").doc(uid).collection("inbox").add({
    type: "friend_request",
    from: currentUser.email,
    timestamp: Date.now()
  });
  alert(`Request sent to @${username}`);
}

function acceptFriend(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  alert("Friend added!");
}

function declineInbox(docId, uid) {
  db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
}

// ---------------- FRIENDS LIST ----------------
function loadFriends(uid) {
  const box = document.getElementById("friendsList");
  db.collection("users").get().then(qs => {
    box.innerHTML = "";
    qs.forEach(doc => {
      const d = doc.data();
      if (doc.id !== uid) {
        box.innerHTML += `<div class="friend-card">
          <b>@${d.username}</b>
          <button onclick="openThread('${doc.id}', '${d.username}')">Chat</button>
        </div>`;
      }
    });
  });
}

// ---------------- THREADS ----------------
function openThread(friendId, username) {
  currentFriendId = friendId;
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = `Chat with @${username}`;
  const box = document.getElementById("threadMessages");
  db.collection("threads").doc(currentUser.uid).collection(friendId)
    .orderBy("time").onSnapshot(snap => {
      box.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement("div");
        div.className = "message";
        div.textContent = `${d.sender === currentUser.uid ? "You" : "They"}: ${d.text}`;
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const val = input.value.trim();
  if (!val || !currentFriendId) return;
  const msg = {
    text: val,
    sender: currentUser.uid,
    time: Date.now()
  };
  db.collection("threads").doc(currentUser.uid).collection(currentFriendId).add(msg);
  db.collection("threads").doc(currentFriendId).collection(currentUser.uid).add(msg);
  input.value = "";
}

function closeThread() {
  currentFriendId = null;
  switchTab("friendsTab");
}

// ---------------- P2P (WebTorrent) Placeholder ----------------
// Future version will integrate WebTorrent securely between accepted friends
