// ==== StringWasp App V2 - Full Final app.js (Part 1) ====

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;

let unsubscribeInbox = null;
let unsubscribeThread = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;

// ========== UI Tabs ==========
function switchTab(id) {
  document.querySelectorAll(".tab, .tabContent").forEach(el => el.style.display = "none");
  const tab = document.getElementById(id);
  if (tab) tab.style.display = "block";

  if (id === "chatTab") loadChatList();
}

// ========== Auth ==========
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    db.collection("users").doc(user.uid).get().then(doc => {
      const data = doc.data();
      if (!data?.username) {
        showTab("usernameDialog");
      } else {
        document.getElementById("usernameDisplay").textContent = data.username;
        showTab("appPage");
        loadChatList();
        listenInbox();
      }
    });
  } else {
    showTab("loginPage");
  }
});

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, password).catch(e => alert(e.message));
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Please enter a username");

  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    photoURL: "",
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    showTab("appPage");
    loadChatList();
    listenInbox();
  });
}

// ========== Inbox ==========
function listenInbox() {
  const list = document.getElementById("inboxList");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();
  unsubscribeInbox = db.collection("inbox").doc(currentUser.uid).collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      let unreadCount = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.read) unreadCount++;

        const sender = typeof data.from === "object"
          ? (data.from.username || data.from.email || "Unknown")
          : data.from;

        const div = document.createElement("div");
        div.className = "inbox-card";
        div.innerHTML = `
          <div>
            <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
            From: ${data.fromName || sender}
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${sender}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(div);
      });

      document.getElementById("inboxBadge").textContent = unreadCount || "";
    });
}

function acceptInbox(id, type, fromId) {
  if (type === "friend") {
    db.collection("friends").doc(currentUser.uid).collection("list").doc(fromId).set({ uid: fromId });
    db.collection("friends").doc(fromId).collection("list").doc(currentUser.uid).set({ uid: currentUser.uid });
  }
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

// ========== Chat List ==========
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  db.collection("friends").doc(currentUser.uid).collection("list").get().then(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const friend = doc.data();
      const div = document.createElement("div");
      div.className = "chat-card";
      div.innerHTML = `
        <img src="default-avatar.png" />
        <div class="details">
          <div class="name">${friend.username || "Friend"}</div>
        </div>
      `;
      div.onclick = () => openThread(friend.uid, friend.username || "Friend");
      list.appendChild(div);
    });
  });
}

// ========== Thread ID ==========
function threadId(a, b) {
  return [a, b].sort().join("_");
}

let unsubscribeThread;

function openThread(uid, username) {
  switchTab("threadView");
  currentThreadUser = uid;

  // Set default UI
  document.getElementById("chatName").textContent = username;
  document.getElementById("chatStatus").textContent = "Loading...";
  document.getElementById("chatProfilePic").src = "default-avatar.png";
  document.getElementById("typingIndicator").textContent = "";

  // Load profile
  db.collection("users").doc(uid).get().then(doc => {
    if (doc.exists) {
      const user = doc.data();
      const lastSeen = user.lastSeen?.toDate().toLocaleString() || "Online recently";
      document.getElementById("chatProfilePic").src = user.photoURL || "default-avatar.png";
      document.getElementById("chatStatus").textContent = lastSeen;
    } else {
      document.getElementById("chatStatus").textContent = "User not found";
    }
  }).catch(() => {
    document.getElementById("chatStatus").textContent = "Error loading status";
  });

  // Listen to thread messages
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = db.collection("threads")
    .doc(threadId(currentUser.uid, uid))
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        const displayText = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.from === currentUser.uid ? "right" : "left");

        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${msg.fromName || "Unknown"}</strong>`;
        bubble.appendChild(sender);

        const textDiv = document.createElement("div");
        textDiv.textContent = displayText;
        bubble.appendChild(textDiv);

        area.appendChild(bubble);
      });
      area.scrollTop = area.scrollHeight;
    });

  // Typing Indicator
  db.collection("threads")
    .doc(threadId(currentUser.uid, uid))
    .collection("typing")
    .onSnapshot(snapshot => {
      const typingDiv = document.getElementById("typingIndicator");
      const usersTyping = [];
      snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) usersTyping.push(doc.id);
      });
      typingDiv.textContent = usersTyping.length ? `${usersTyping.join(", ")} typing...` : "";
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent;
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const messageData = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages")
    .add(messageData)
    .then(() => {
      input.value = "";
    }).catch(console.error);
}

// Typing signal
function handleTyping(context) {
  const typingRef = db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("typing")
    .doc(currentUser.uid);

  typingRef.set({ typing: true });
  setTimeout(() => typingRef.delete(), 3000);
}

// File Upload
function triggerFileInput(context) {
  if (context === "thread") {
    document.getElementById("threadFile").click();
  }
}
function uploadFile(context) {
  alert("File upload not implemented yet.");
}

// Chat Menu
function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}
function closeChatMenu() {
  document.getElementById("chatOptionsMenu").style.display = "none";
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#chatOptionsMenu") && !e.target.closest("button[onclick='openChatMenu()']")) {
    closeChatMenu();
  }
});

function blockUser() {
  alert("User blocked (dummy action)");
  closeChatMenu();
}
function exportChat() {
  alert("Export feature not implemented yet.");
  closeChatMenu();
}
function viewMedia() {
  alert("Media viewer coming soon.");
  closeChatMenu();
}
function deleteThread() {
  const confirmed = confirm("Are you sure you want to delete this chat?");
  if (!confirmed) return;

  const ref = db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages");

  ref.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  }).then(() => {
    alert("Chat deleted.");
    switchTab("chatTab");
  }).catch(console.error);

  closeChatMenu();
}

// ===== Group Messaging =====

function listenMessages() {
  const groupArea = document.getElementById("groupMessages");
  if (!groupArea || !currentRoom) return;

  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      groupArea.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        const displayText = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");

        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${msg.senderName || "Unknown"}</strong>`;
        bubble.appendChild(sender);

        const textDiv = document.createElement("div");
        textDiv.textContent = displayText;
        bubble.appendChild(textDiv);

        groupArea.appendChild(bubble);
      });
      groupArea.scrollTop = groupArea.scrollHeight;
    });
}

function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  const encrypted = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const messageData = {
    text: encrypted,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("groups").doc(currentRoom).collection("messages").add(messageData)
    .then(() => {
      input.value = "";
    }).catch(console.error);
}

function handleTyping(context) {
  if (context === "group" && currentRoom) {
    const typingRef = db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid);
    typingRef.set({ typing: true });
    setTimeout(() => typingRef.delete(), 3000);
  }
}

// Group Typing Indicator
function listenGroupTyping() {
  const indicator = document.getElementById("groupTypingIndicator");
  if (!indicator || !currentRoom) return;

  unsubscribeTyping = db.collection("groups").doc(currentRoom).collection("typing")
    .onSnapshot(snapshot => {
      const typing = [];
      snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) typing.push(doc.id);
      });
      indicator.textContent = typing.length ? `${typing.join(", ")} typing...` : "";
    });
}

// Join Room and Load Info
function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  listenMessages();
  loadGroupInfo(roomName);
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
    const owner = group.createdBy || "Unknown";
    const createdAt = group.createdAt?.toDate().toLocaleString() || "N/A";
    const adminList = group.admins || [];

    db.collection("groups").doc(groupId).collection("members").get().then(membersSnap => {
      const members = membersSnap.docs.map(doc => doc.id);

      let membersHTML = members.map(uid => {
        let badge = "";
        if (uid === owner) badge = " 👑";
        else if (adminList.includes(uid)) badge = " 🛠️";
        return `<div class="member-entry" onclick="showUserProfile('${uid}')">${uid}${badge}</div>`;
      }).join("");

      infoDiv.innerHTML = `
        <div class="group-meta">
          <strong>${group.name}</strong><br>
          👑 Owner: ${owner}<br>
          📅 Created: ${createdAt}<br>
          👥 Members (${members.length}):
          <div class="member-list">${membersHTML}</div>
        </div>
      `;

      if (adminList.includes(currentUser.uid)) {
        infoDiv.innerHTML += `<button onclick="deleteGroup('${groupId}')">🗑️ Delete Group</button>`;
      }

      // Update group header
      document.getElementById("chatName").textContent = group.name || "Group";
      document.getElementById("chatProfilePic").src = "group-icon.png";
      document.getElementById("chatStatus").textContent = `Members: ${members.length}`;
    });
  });
}

// File Upload for Groups
function triggerFileInput(context) {
  if (context === "group") {
    document.getElementById("groupFile").click();
  } else {
    document.getElementById("threadFile").click();
  }
}

function uploadFile(context) {
  alert(`File upload for ${context} not implemented yet.`);
}

// ===== Friends =====

function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list || !currentUser) return;

  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
    list.innerHTML = snapshot.empty ? "<div class='empty'>No friends yet</div>" : "";

    snapshot.forEach(doc => {
      const friend = doc.data();
      const div = document.createElement("div");
      div.className = "friend-entry";
      div.innerHTML = `
        <strong>${friend.username || "Unknown"}</strong>
        <div class="btn-group">
          <button onclick="openThread('${friend.uid}', '${friend.username || "Friend"}')">💬 Message</button>
          <button onclick="showUserProfile('${friend.uid}')">👁️ View</button>
        </div>
      `;
      list.appendChild(div);
    });
  });
}

// ===== Groups =====

function createGroup() {
  const name = prompt("Group name?");
  if (!name) return;

  const groupId = `${currentUser.uid}-${Date.now()}`;
  const groupData = {
    name,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.Timestamp.now(),
    admins: [currentUser.uid]
  };

  db.collection("groups").doc(groupId).set(groupData).then(() => {
    db.collection("groups").doc(groupId).collection("members").doc(currentUser.uid).set({
      joinedAt: firebase.firestore.Timestamp.now()
    });
    alert("Group created.");
    joinRoom(groupId);
  });
}

function joinGroup() {
  const groupId = prompt("Enter group ID to join:");
  if (!groupId) return;

  db.collection("groups").doc(groupId).collection("members").doc(currentUser.uid).set({
    joinedAt: firebase.firestore.Timestamp.now()
  }).then(() => {
    alert("Joined group!");
    joinRoom(groupId);
  }).catch(() => alert("Group not found"));
}

function deleteGroup(groupId) {
  const confirmed = confirm("Are you sure to delete this group?");
  if (!confirmed) return;

  db.collection("groups").doc(groupId).delete().then(() => {
    alert("Group deleted.");
    document.getElementById("groupInfo").innerHTML = "";
  });
}

// ===== Profile =====

function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const gender = document.getElementById("profileGender").value;
  const phone = document.getElementById("profilePhone").value;
  const email = document.getElementById("profileEmail").value;
  const username = document.getElementById("profileUsername").value;

  const data = {
    name, bio, gender, phone, email, username
  };

  if (currentUser) {
    db.collection("users").doc(currentUser.uid).update(data).then(() => {
      alert("Profile updated");
      document.getElementById("usernameDisplay").textContent = username;
    });
  }
}

function logout() {
  firebase.auth().signOut().then(() => {
    switchTab("loginPage");
    currentUser = null;
  });
}

function contactSupport() {
  alert("Contact support: support@stringwasp.com");
}

// ===== Tab Switching =====

function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  const page = document.getElementById(id);
  if (page) page.style.display = "block";
}

// ===== Inbox =====

function listenInbox() {
  const list = document.getElementById("inboxList");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();
  unsubscribeInbox = db.collection("inbox").doc(currentUser.uid).collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      let unreadCount = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.read) unreadCount++;

        const div = document.createElement("div");
        div.className = "inbox-card";

        const sender = typeof data.from === "object"
          ? (data.from.username || data.from.email || "Unknown")
          : data.from;

        div.innerHTML = `
          <div>
            <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
            From: ${data.fromName || sender}
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${sender}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(div);
      });

      document.getElementById("inboxBadge").textContent = unreadCount || "";
    });
}

function acceptInbox(id, type, fromId) {
  if (type === "friend") {
    db.collection("friends").doc(currentUser.uid).collection("list").doc(fromId).set({ uid: fromId });
    db.collection("friends").doc(fromId).collection("list").doc(currentUser.uid).set({ uid: currentUser.uid });
  } else if (type === "group") {
    db.collection("groups").doc(fromId).collection("members").doc(currentUser.uid).set({
      joinedAt: firebase.firestore.Timestamp.now()
    });
  }
  declineInbox(id);
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

function markAllRead() {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items");
  ref.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.update(doc.ref, { read: true }));
    batch.commit();
  });
}

// ===== Init =====

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById("usernameDisplay").textContent = user.email;
    switchTab("chatTab");
    loadChatList();
    loadFriends();
    listenInbox();
  } else {
    switchTab("loginPage");
  }
});
