// ✅ UUID Generator
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
  if (id === "chatTab") loadChatList();
}

// ===== Unified Chat List =====
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;
  list.innerHTML = "<div>Loading chats...</div>";
  const chats = [];

  db.collection("friends").doc(currentUser.uid).collection("list").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      chats.push({
        id: data.uid,
        name: data.username,
        type: "friend",
        img: "default-avatar.png",
      });
    });

    return db.collection("groups").get();
  }).then(snapshot => {
    snapshot.forEach(doc => {
      chats.push({
        id: doc.id,
        name: doc.data().name,
        type: "group",
        img: "group-icon.png"
      });
    });

    renderChatList(chats);
  }).catch(console.error);
}

function renderChatList(chats) {
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  chats.forEach(chat => {
    const card = document.createElement("div");
    card.className = "chat-card";
    card.onclick = () => {
      if (chat.type === "group") joinRoom(chat.id);
      else openThread(chat.id, chat.name);
    };

    card.innerHTML = `
      <img src="${chat.img}" alt="avatar" />
      <div class="details">
        <div class="name">${chat.name}</div>
        <div class="last-message">Last message preview...</div>
      </div>
      <div class="meta">
        <div class="time">12:45 PM</div>
        <div class="badge">1</div>
      </div>
    `;
    list.appendChild(card);
  });
}

function searchChats() {
  const keyword = document.getElementById("globalSearch").value.toLowerCase();
  const cards = document.querySelectorAll(".chat-card");
  cards.forEach(card => {
    const name = card.querySelector(".name").textContent.toLowerCase();
    card.style.display = name.includes(keyword) ? "flex" : "none";
  });
}

// ===== Auth Logic =====
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    db.collection("users").doc(user.uid).get().then(doc => {
      if (doc.exists) {
        const data = doc.data();
        if (!data.username) {
          showTab("usernameDialog");
        } else {
          document.getElementById("usernameDisplay").textContent = data.username;
          showTab("appPage");
          loadChatList();
          listenInbox();
        }
      } else {
        showTab("usernameDialog");
      }
    });
  } else {
    showTab("loginPage");
  }
});

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

function showTab(id) {
  document.querySelectorAll(".tab, .tabContent").forEach(el => el.style.display = "none");
  const tab = document.getElementById(id);
  if (tab) tab.style.display = "block";
}

// ===== Username =====
function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username");
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
  }).catch(console.error);
}

// ===== Profile =====
function saveProfile() {
  const data = {
    name: document.getElementById("profileName").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value.trim(),
    emailPublic: document.getElementById("profileEmail").value.trim(),
    username: document.getElementById("profileUsername").value.trim()
  };

  db.collection("users").doc(currentUser.uid).update(data).then(() => {
    alert("Profile updated!");
  });
}

document.getElementById("profilePic").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const ref = storage.ref("avatars/" + currentUser.uid);
  ref.put(file).then(() => ref.getDownloadURL()).then(url => {
    db.collection("users").doc(currentUser.uid).update({ photoURL: url });
    document.getElementById("profilePicPreview").src = url;
  });
});

function logout() {
  auth.signOut();
}

function contactSupport() {
  alert("Contact us: support@stringwasp.com");
}

// ===== Inbox =====
function listenInbox() {
  const list = document.getElementById("inboxList");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();

  unsubscribeInbox = db.collection("inbox")
    .doc(currentUser.uid)
    .collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = "";
      let unreadCount = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.read) unreadCount++;

        const div = document.createElement("div");
        div.className = "inbox-card";

        // ✅ Fix sender name
        const sender = typeof data.from === "object"
  ? (data.from.username || data.from.email || data.from.uid || JSON.stringify(data.from))
  : data.from;

        div.innerHTML = `
          <div>
            <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
            From: ${data.fromName || sender}
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${fromUid}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;

        list.appendChild(div);
      });

      // ✅ Update badge count
      document.getElementById("inboxBadge").textContent = unreadCount || "";
    });
}

function acceptInbox(id, type, from) {
  if (type === "friend") {
    db.collection("friends").doc(currentUser.uid).collection("list").doc(from).set({ uid: from });
    db.collection("friends").doc(from).collection("list").doc(currentUser.uid).set({ uid: currentUser.uid });
  }
  if (type === "group") {
    db.collection("groups").doc(from).collection("members").doc(currentUser.uid).set({ uid: currentUser.uid });
  }

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

function markAllRead() {
  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items");
  inboxRef.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.update(doc.ref, { read: true }));
    return batch.commit();
  });
}

// ===== Friends Tab =====
function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list) return;

  db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => {
    list.innerHTML = snapshot.empty ? "<div class='empty'>No friends yet</div>" : "";

    snapshot.forEach(doc => {
      const friend = doc.data();
      const div = document.createElement("div");
      div.className = "friend-entry";
      div.innerHTML = `
        <strong>${friend.username || "Friend"}</strong>
        <div class="btn-group">
          <button onclick="openThread('${friend.uid}', '${friend.username || "Friend"}')">💬 Message</button>
          <button onclick="showUserProfile('${friend.uid}')">👁️ View</button>
        </div>
      `;
      list.appendChild(div);
    });
  });
}

// ===== Direct Threads (DM) =====
let unsubscribeThread = null;
let currentThreadUser = null;

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function openThread(uid, username) {
  switchTab("threadView");
  currentThreadUser = uid;

  document.getElementById("chatName").textContent = username;
  document.getElementById("chatStatus").textContent = "Loading...";
  document.getElementById("chatProfilePic").src = "default-avatar.png";
  document.getElementById("typingIndicator").textContent = "";

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
bubble.textContent = `${msg.fromName}: ${displayText}`;
        area.appendChild(bubble);
      });
      area.scrollTop = area.scrollHeight;
    });

  // Typing
  db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("typing")
    .onSnapshot(snapshot => {
      const typingDiv = document.getElementById("typingIndicator");
      const usersTyping = [];

      snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) {
          usersTyping.push(doc.id);
        }
      });

      typingDiv.textContent = usersTyping.length ? `${usersTyping.join(", ")} typing...` : "";
    });
}

function handleTyping(type) {
  const thread = threadId(currentUser.uid, currentThreadUser);
  const typingRef = db.collection("threads").doc(thread).collection("typing").doc(currentUser.uid);
  typingRef.set({ typing: true });

  clearTimeout(window._typingTimeout);
  window._typingTimeout = setTimeout(() => typingRef.delete(), 2000);
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser || !currentUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent || "Unknown";

  // 🔒 AES Encryption
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const messageData = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  // 🔄 Send to thread collection
  db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages")
    .add(messageData)
    .then(() => {
      input.value = "";
      input.focus();
    })
    .catch(error => {
      console.error("Failed to send message:", error);
      alert("Message failed to send. Please try again.");
    });
}

// ===== File Uploads =====
function triggerFileInput(target) {
  document.getElementById(target + "File").click();
}

function uploadFile(target) {
  const fileInput = document.getElementById(target + "File");
  const file = fileInput.files[0];
  if (!file) return;

  const id = Date.now();
  const storageRef = storage.ref(`uploads/${currentUser.uid}/${id}_${file.name}`);
  storageRef.put(file).then(() => {
    return storageRef.getDownloadURL();
  }).then(url => {
    const fileMsg = `[File]: ${file.name} - ${url}`;
    if (target === "thread") {
      document.getElementById("threadInput").value = fileMsg;
      sendThreadMessage();
    }
  });
}

// ===== Menu Options =====
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
  alert("User blocked (dummy action).");
  closeChatMenu();
}
function viewMedia() {
  alert("Media viewer not implemented yet.");
  closeChatMenu();
}
function exportChat() {
  alert("Exporting chat (not implemented).");
  closeChatMenu();
}
function deleteThread() {
  const confirmed = confirm("Delete chat?");
  if (confirmed) {
    const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
    ref.get().then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).then(() => {
      alert("Chat deleted.");
      switchTab("chatTab");
    });
  }
  closeChatMenu();
}

// ===== Group System =====
let currentRoom = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;

// 🔁 Join Room
function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();

  listenMessages();
  loadGroupInfo(roomName);

  db.collection("groups").doc(roomName).get().then(doc => {
    const group = doc.data();
    document.getElementById("chatName").textContent = group.name || roomName;
    document.getElementById("chatStatus").textContent = "Group Chat";
    document.getElementById("chatProfilePic").src = group.photoURL || "group-icon.png";
  });
}

// ➕ Create Group
function createGroup() {
  const name = prompt("Enter group name:");
  if (!name) return;

  const id = `grp_${Date.now()}`;
  const groupData = {
    name,
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    admins: [currentUser.uid]
  };

  db.collection("groups").doc(id).set(groupData).then(() => {
    return db.collection("groups").doc(id).collection("members").doc(currentUser.uid).set({
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(() => {
    alert("Group created.");
    joinRoom(id);
  }).catch(console.error);
}

// 🔗 Join by Group ID
function joinGroup() {
  const id = prompt("Enter group ID to join:");
  if (!id) return;

  db.collection("groups").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Group does not exist.");
    return db.collection("groups").doc(id).collection("members").doc(currentUser.uid).set({
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(() => {
    alert("Joined group.");
    joinRoom(id);
  }).catch(console.error);
}

// 🧾 Group Messaging
function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  const fromName = document.getElementById("usernameDisplay").textContent;
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  db.collection("groups").doc(currentRoom).collection("messages").add({
    text: encryptedText,
    senderId: currentUser.uid,
    senderName: fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    input.value = "";
  }).catch(console.error);
}

// 🔄 Group Message Listener
function listenMessages() {
  const groupArea = document.getElementById("groupMessages");
  if (!groupArea || !currentRoom) return;

  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = db.collection("groups")
    .doc(currentRoom)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      groupArea.innerHTML = "";

      snapshot.forEach(doc => {
        const msg = doc.data();

        // 🔐 Decrypt safely
        let decrypted;
        try {
          decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        } catch (e) {
          decrypted = "[Unable to decrypt]";
        }

        const displayText = typeof decrypted === "string" && decrypted
          ? decrypted
          : JSON.stringify(decrypted || msg.text || "");

        // 💬 Create message bubble
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

// ⌨️ Typing Indicator (Group)
function handleTyping(source) {
  if (source === "group" && currentRoom) {
    const typingRef = db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid);
    typingRef.set({ typing: true });

    clearTimeout(window._typingTimeoutGroup);
    window._typingTimeoutGroup = setTimeout(() => typingRef.delete(), 2000);
  } else if (source === "thread" && currentThreadUser) {
    const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("typing").doc(currentUser.uid);
    ref.set({ typing: true });

    clearTimeout(window._typingTimeoutDM);
    window._typingTimeoutDM = setTimeout(() => ref.delete(), 2000);
  }
}

// 👥 Load Group Info
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
    });
  });
}

// 🔘 Group Menu Controls
function openGroupMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function viewGroupMembers() {
  document.getElementById("groupInfo").scrollIntoView({ behavior: "smooth" });
  closeChatMenu();
}

function inviteByLink() {
  const link = `${location.origin}/#join=${currentRoo
