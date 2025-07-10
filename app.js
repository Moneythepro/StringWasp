// ===== UUID Generator =====
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// ===== Firebase Init =====
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeInbox = null;
let unsubscribeThread = null;

// ===== Theme =====
function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}
function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
}

// ===== UI Switch =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
  if (id === "groupsTab") {
    loadRooms();
    listenGroupMessages();
  }
}

function showLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

// ===== Auth =====
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI();
    }
  } else {
    switchTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;
  auth.signInWithEmailAndPassword(email, password).catch(alert);
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;
  auth.createUserWithEmailAndPassword(email, password).catch(alert);
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter username");
  db.collection("users").doc(currentUser.uid).set({ username }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

function logout() {
  auth.signOut().then(() => location.reload());
}

// ===== Main UI Loader =====
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("groupsTab");
  loadRooms();
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== Group =====
function createGroup() {
  const name = prompt("Enter group name");
  if (!name) return;
  db.collection("groups").doc(name).set({
    name,
    createdBy: currentUser.uid,
    members: { [currentUser.uid]: "owner" },
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => joinRoom(name));
}

function joinGroup() {
  const name = prompt("Enter group name");
  if (!name) return;
  db.collection("groups").doc(name).update({
    [`members.${currentUser.uid}`]: "member"
  }).then(() => joinRoom(name)).catch(alert);
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.members && data.members[currentUser.uid]) {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = doc.id;
        dropdown.appendChild(opt);
      }
    });
  });
}

function joinRoom(room) {
  currentRoom = room;
  listenGroupMessages();
}

function listenGroupMessages() {
  if (!currentRoom) return;
  const div = document.getElementById("groupMessages");
  if (!div) return;
  db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      div.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");
        bubble.innerHTML = `<strong>${msg.senderName}</strong>: ${msg.text}`;
        div.appendChild(bubble);
      });
      div.scrollTop = div.scrollHeight;
    });
}

function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input.value.trim();
  if (!text || !currentRoom) return;
  db.collection("groups").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

// ===== Inbox System =====
function loadInbox() {
  const list = document.getElementById("inboxList");
  if (!list) return;
  if (unsubscribeInbox) unsubscribeInbox();

  unsubscribeInbox = db.collection("inbox")
    .where("to", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = snapshot.empty
        ? "<div class='empty'>No new messages</div>"
        : snapshot.docs.map(doc => createInboxCard(doc)).join("");
    }, error => {
      console.error("❌ Inbox error:", error.message || error);
    });
}

function createInboxCard(doc) {
  const data = doc.data();
  let sender = "Unknown";

  try {
    if (data.fromName) {
      sender = data.fromName;
    } else if (typeof data.from === "string") {
      sender = data.from;
    } else if (typeof data.from === "object" && data.from !== null) {
      sender =
        data.from.username ||
        data.from.name ||
        data.from.email ||
        data.from.uid ||
        JSON.stringify(data.from);
    }
  } catch (e) {
    console.error("⚠️ Error parsing sender:", e);
  }

  return `
    <div class="inbox-card">
      <div><strong>${data.type || "Notification"}</strong>: ${sender}</div>
      <div class="btn-group">
        <button onclick="acceptRequest('${doc.id}')">✓</button>
        <button onclick="declineRequest('${doc.id}')">✕</button>
      </div>
    </div>
  `;
}

function acceptRequest(requestId) {
  if (!requestId) return console.error("❌ Invalid request ID");

  db.collection("inbox").doc(requestId).get().then(doc => {
    if (!doc.exists) return console.error("❌ Request not found");

    const request = doc.data();
    const fromUID = typeof request.from === "string" ? request.from : null;
    const fromName = request.fromName || "Unknown";

    if (!fromUID) return;

    if (request.type && request.type.includes("Friend Request")) {
      db.collection("friends").doc(currentUser.uid).collection("list").doc(fromUID).set({
        uid: fromUID,
        username: fromName,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        doc.ref.delete();
      });
    } else {
      doc.ref.delete();
    }
  }).catch(console.error);
}

function declineRequest(requestId) {
  if (!requestId) return console.error("❌ Invalid request ID");
  db.collection("inbox").doc(requestId).delete().catch(console.error);
}

function markAllRead() {
  db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  }).then(() => alert("✅ All messages marked as read"));
}

// ===== Friends =====
function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container) return;
  db.collection("friends").doc(currentUser.uid).collection("list")
    .onSnapshot(snapshot => {
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const friend = doc.data();
        const div = document.createElement("div");
        div.className = "friend-entry";
        div.textContent = friend.username;
        div.onclick = () => openThread(friend.uid, friend.username);
        container.appendChild(div);
      });
    });
}

// ===== Thread Chat =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  currentThreadUser = uid;
  document.getElementById("threadWithName").textContent = username;
  const area = document.getElementById("threadMessages");
  if (!area) return;
  if (unsubscribeThread) unsubscribeThread();

  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid))
    .collection("messages").orderBy("timestamp")
    .onSnapshot(snapshot => {
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.textContent = `${msg.fromName}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;

  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// ===== Friends System =====
function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container) return;
  
  db.collection("friends").doc(currentUser.uid).collection("list")
    .orderBy("addedAt", "desc")
    .onSnapshot(snapshot => {
      container.innerHTML = snapshot.empty
        ? "<div class='empty'>No friends yet</div>"
        : snapshot.docs.map(doc => createFriendElement(doc.data())).join("");
    }, error => console.error("Friends error:", error));
}

function createFriendElement(friend) {
  return `
    <div class="friend-item">
      <img src="${friend.photoURL || 'default-avatar.png'}" class="friend-avatar">
      <span class="friend-name">${friend.username}</span>
      <button onclick="openThread('${friend.uid}', '${friend.username}')">Message</button>
      <button onclick="viewUserProfile('${friend.uid}')">View Profile</button>
    </div>
  `;
}

// ===== Profile Management =====
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    const nameInput = document.getElementById("profileName");
    const bioInput = document.getElementById("profileBio");
    const picPreview = document.getElementById("profilePicPreview");
    const phoneInput = document.getElementById("profilePhone");
    const emailInput = document.getElementById("profileEmail");

    if (nameInput) nameInput.value = data.name || "";
    if (bioInput) bioInput.value = data.bio || "";
    if (phoneInput) phoneInput.value = data.phone || "";
    if (emailInput) emailInput.value = data.publicEmail || "";
    if (picPreview) picPreview.src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName")?.value.trim();
  const bio = document.getElementById("profileBio")?.value.trim();
  const phone = document.getElementById("profilePhone")?.value.trim();
  const email = document.getElementById("profileEmail")?.value.trim();
  const file = document.getElementById("profilePic")?.files[0];

  const updateData = { 
    name, 
    bio, 
    phone,
    publicEmail: email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
  };

  if (file) {
    const storageRef = firebase.storage().ref(`profile_pics/${currentUser.uid}`);
    storageRef.put(file).then(snapshot => snapshot.ref.getDownloadURL())
      .then(downloadURL => {
        updateData.photoURL = downloadURL;
        return saveProfileData(updateData);
      })
      .then(() => {
        const picPreview = document.getElementById("profilePicPreview");
        if (picPreview) picPreview.src = updateData.photoURL;
        alert("Profile updated with new photo!");
      })
      .catch(error => alert(error.message));
  } else {
    saveProfileData(updateData)
      .then(() => alert("Profile updated!"))
      .catch(error => alert(error.message));
  }
}

function saveProfileData(data) {
  return db.collection("users").doc(currentUser.uid).set(data, { merge: true });
}

// ===== Threads (Private Chat) =====
let unsubscribeThread = null;

function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;

  const threadId = [currentUser.uid, uid].sort().join("_");
  const area = document.getElementById("threadMessages");
  if (!area) return;

  if (unsubscribeThread) unsubscribeThread();

  unsubscribeThread = db.collection("threads").doc(threadId).collection("messages")
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = msg.from === currentUser.uid ? "thread-msg mine" : "thread-msg theirs";
        div.textContent = `${msg.fromName}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;

  const threadId = [currentUser.uid, currentThreadUser].sort().join("_");

  db.collection("threads").doc(threadId).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// ===== Search System =====
function switchSearchView(type) {
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = `@${user.username} (${user.name || "No Name"})`;
        if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
        div.onclick = () => viewUserProfile(doc.id);
        userResults.appendChild(div);
      });
    });

  db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = `#${group.name}`;
        div.onclick = () => joinRoomPrompt(group.name);
        groupResults.appendChild(div);
      });
    });
}

// ===== View Profile Modal =====
function viewUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    document.getElementById("viewProfileName").textContent = data.name || "Unnamed";
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
    
    document.getElementById("viewProfileModal").style.display = "block";
  });
}

// ===== Theme =====
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

// ===== Contact Support =====
function contactSupport() {
  const email = "mailto:moneythepro7@gmail.com?subject=Support%20Request%20from%20StringWasp%20User";
  window.open(email, "_blank");
}

// ===== Typing Indicators (Basic Demo) =====
// Future: Implement Firestore-based typing indicators

// ===== Init on Load =====
window.onload = () => {
  applySavedTheme();

  const msgInput = document.getElementById("messageInput");
  if (msgInput) {
    msgInput.addEventListener("keypress", e => {
      if (e.key === "Enter") sendMessage();
    });
  }

  const threadInput = document.getElementById("threadInput");
  if (threadInput) {
    threadInput.addEventListener("keypress", e => {
      if (e.key === "Enter") sendThreadMessage();
    });
  }

  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};
