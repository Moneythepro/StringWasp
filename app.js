// ====== StringWasp App.js (Full Updated with Features) ======

// UUID Generator
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// 🔥 Firebase Init
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;

let unsubscribeMessages = null;
let unsubscribeThread = null;
let unsubscribeInbox = null;
let unsubscribeTyping = null;

// ===== UI Switch =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  if (id === "groupsTab") {
    loadRooms();
    if (currentRoom) listenMessages();
  }
}

// ===== Loading Spinner =====
function showLoading(state) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = state ? "flex" : "none";
}

// ===== Auth Handlers =====
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists || !userDoc.data().username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = userDoc.data().username;
      loadMainUI();
    }
  } else {
    switchTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  if (!email || !pass) return;
  auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  if (!email || !pass || pass.length < 6) return;
  auth.createUserWithEmailAndPassword(email, pass)
    .then(() => alert("Account created! Now set a username"))
    .catch(err => alert(err.message));
}

function logout() {
  auth.signOut().then(() => {
    alert("Logged out.");
    switchTab("loginPage");
  });
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username || username.length > 15) return;
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// ===== Init App Page =====
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("groupsTab");
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== Groups =====

function createGroup() {
  const room = prompt("Enter new group name:");
  if (!room) return;
  const ref = db.collection("groups").doc(room);
  ref.set({
    name: room,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    autoJoin: true
  });
  ref.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
  joinRoom(room);
}

function joinGroup() {
  const room = prompt("Enter group name to join:");
  if (!room) return;
  db.collection("groups").doc(room).get().then(doc => {
    if (doc.exists) {
      db.collection("groups").doc(room).collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
      joinRoom(room);
    } else {
      alert("Group not found");
    }
  });
}

function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
  loadGroupInfo(roomName); // ✅ ADD THIS
}

function loadGroupInfo(groupId) {
  const infoDiv = document.getElementById("groupInfo");
  if (!infoDiv) return;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) {
      infoDiv.innerHTML = "Group not found.";
      return;
    }

    const group = doc.data();
    const createdBy = group.createdBy;
    const createdAt = group.createdAt?.toDate().toLocaleString() || "N/A";
    const adminList = group.admins || [];

    db.collection("groups").doc(groupId).collection("members").get().then(membersSnap => {
      const members = membersSnap.docs.map(doc => doc.id);

      let membersHTML = members.map(uid => {
        let badge = "";
        if (uid === createdBy) badge = " 👑";
        else if (adminList.includes(uid)) badge = " 🛠️";

        return `<div class="member-entry" onclick="showUserProfile('${uid}')">${uid}${badge}</div>`;
      }).join("");

      infoDiv.innerHTML = `
        <div class="group-meta">
          <strong>${group.name}</strong><br>
          🧑‍💼 Owner: ${createdBy}<br>
          🕓 Created: ${createdAt}<br>
          👥 Members (${members.length}):
          <div class="member-list">${membersHTML}</div>
        </div>
      `;
    });
  });
}
    const group = doc.data();
    let owner = group.createdBy || "Unknown";
    let createdAt = group.createdAt?.toDate().toLocaleString() || "N/A";

    db.collection("groups").doc(groupId).collection("members").get().then(membersSnap => {
      const members = membersSnap.docs.map(m => m.id);
      const isAdmin = group.admins?.includes(currentUser.uid);

      infoDiv.innerHTML = `
        <div class="group-meta">
          <strong>${group.name}</strong><br>
          👑 Owner: ${owner}<br>
          📅 Created: ${createdAt}<br>
          👥 Members (${members.length})
        </div>
      `;

      if (isAdmin) {
        infoDiv.innerHTML += `<button onclick="deleteGroup('${groupId}')">🗑️ Delete Group</button>`;
      }
    });
  });
}

// ===== Group Messages =====
function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom) return;

  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");

        const senderInfo = document.createElement("div");
        senderInfo.className = "sender-info";

        const name = document.createElement("div");
        name.className = "sender-name";
        name.textContent = msg.senderName || "Unknown";

        senderInfo.appendChild(name);
        bubble.appendChild(senderInfo);

        const text = document.createElement("div");
        text.textContent = msg.text;
        bubble.appendChild(text);
        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  db.collection("groups").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
  updateTypingStatus(false);
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  db.collection("rooms").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
}

// ===== Rooms (Group List) =====
function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";

  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      db.collection("groups").doc(doc.id).collection("members").doc(currentUser.uid).get().then(memberDoc => {
        if (memberDoc.exists) {
          const opt = document.createElement("option");
          opt.value = doc.id;
          opt.textContent = doc.id;
          dropdown.appendChild(opt);
        }
      });
    });
  });
}

// ===== Typing Indicator =====
function listenTyping() {
  const typingDiv = document.getElementById("groupTypingIndicator");
  if (!typingDiv || !currentRoom) return;

  unsubscribeTyping = db.collection("groups").doc(currentRoom).collection("typing").onSnapshot(snapshot => {
    const others = [];
    snapshot.forEach(doc => {
      if (doc.id !== currentUser.uid && doc.data().typing) {
        others.push(doc.data().username || "User");
      }
    });
    typingDiv.textContent = others.length ? `${others.join(", ")} typing...` : "";
  });
}

function updateTypingStatus(isTyping) {
  if (!currentRoom) return;
  db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid).set({
    typing: isTyping,
    username: document.getElementById("usernameDisplay").textContent
  });
}

document.getElementById("groupMessageInput")?.addEventListener("input", () => {
  updateTypingStatus(true);
  setTimeout(() => updateTypingStatus(false), 3000);
});

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
    }, error => console.error("❌ Inbox error:", error));
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

    if (!fromUID) {
      console.error("❌ Missing or invalid sender UID in request:", request);
      return;
    }

    if (request.type && request.type.includes("Friend Request")) {
      db.collection("friends").doc(currentUser.uid).collection("list").doc(fromUID).set({
        uid: fromUID,
        username: fromName,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        doc.ref.delete();
        console.log("✅ Friend request accepted.");
      });
    } else {
      doc.ref.delete();
    }
  }).catch(error => {
    console.error("❌ Error accepting request:", error);
  });
}

function declineRequest(requestId) {
  if (!requestId) return console.error("❌ Invalid request ID");
  db.collection("inbox").doc(requestId).delete()
    .then(() => console.log("✅ Request declined."))
    .catch(error => console.error("❌ Error declining request:", error));
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

  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
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

// ===== Threads (DMs) =====

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;

  if (unsubscribeThread) unsubscribeThread();

  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = "message-bubble " + (msg.from === currentUser.uid ? "right" : "left");
        div.textContent = `${msg.fromName}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent;

  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// ===== Profile =====

function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profileUsername").value = data.username || "";
    const avatar = document.getElementById("profilePicPreview");
    if (avatar) avatar.src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const phone = document.getElementById("profilePhone").value.trim();
  const gender = document.getElementById("profileGender").value;
  const username = document.getElementById("profileUsername").value.trim();
  const file = document.getElementById("profilePic").files[0];
  const data = { name, bio, email, phone, gender };

  if (username) {
    data.username = username;
    document.getElementById("usernameDisplay").textContent = username;
  }

  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
        document.getElementById("profilePicPreview").src = e.target.result;
        alert("✅ Profile updated.");
      });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
      alert("✅ Profile updated.");
    });
  }
}

function logout() {
  auth.signOut().then(() => location.reload());
}

function contactSupport() {
  alert("📧 Contact us at: moneythepro7@gmail.com");
}

// ===== View Public Profile =====

function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    document.getElementById("viewProfileName").textContent = data.name || "Unnamed";
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
    document.getElementById("viewProfileModal").style.display = "block";
  });
}

function addFriend() {
  if (!currentThreadUser) return;
  db.collection("inbox").add({
    to: currentThreadUser,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    type: "Friend Request",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => alert("✅ Friend request sent"));
}

function messageUser() {
  if (!currentThreadUser) return;
  openThread(currentThreadUser, document.getElementById("viewProfileUsername").textContent.replace("@", ""));
  document.getElementById("viewProfileModal").style.display = "none";
}

// ===== Search =====

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

  db.collection("users")
    .where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.textContent = `@${user.username} ${user.name || ""}`;
        if (user.username === "moneythepro") div.textContent += " 🛠️ Developer";
        div.onclick = () => {
          currentThreadUser = doc.id;
          showUserProfile(doc.id);
        };
        userResults.appendChild(div);
      });
    });

  db.collection("groups")
    .where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.textContent = group.name;
        div.onclick = () => joinGroup(group.name);
        groupResults.appendChild(div);
      });
    });
}

// ===== Theme & Modal Utils =====

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

function showCustomModal(message, onConfirm) {
  const modal = document.getElementById("customModal");
  document.getElementById("modalMessage").textContent = message;
  modal.style.display = "block";

  document.getElementById("modalYes").onclick = () => {
    modal.style.display = "none";
    if (typeof onConfirm === "function") onConfirm();
  };
  document.getElementById("modalNo").onclick = () => {
    modal.style.display = "none";
  };
}

// ===== Init =====

window.onload = () => {
  applySavedTheme();

  const msgInput = document.getElementById("messageInput");
  if (msgInput) msgInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });

  const threadInput = document.getElementById("threadInput");
  if (threadInput) threadInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendThreadMessage();
  });

  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};
