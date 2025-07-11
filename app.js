// === StringWasp App V2 - Fully Cleaned Final app.js ===

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
        switchTab("usernameDialog");
      } else {
        document.getElementById("usernameDisplay").textContent = data.username;
        switchTab("appPage");
        loadChatList();
        listenInbox();
      }
    });
  } else {
    switchTab("loginPage");
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
    switchTab("appPage");
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
  } else if (type === "group") {
    db.collection("groups").doc(fromId).collection("members").doc(currentUser.uid).set({
      joinedAt: firebase.firestore.Timestamp.now()
    });
  }
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).update({ read: true });
}

// ========== Chat ==========
function threadId(a, b) {
  return [a, b].sort().join("_");
}

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
    }
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

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.from === currentUser.uid ? "right" : "left");

        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${msg.fromName || "Unknown"}</strong>`;
        bubble.appendChild(sender);

        const textDiv = document.createElement("div");
        textDiv.textContent = decrypted;
        bubble.appendChild(textDiv);

        area.appendChild(bubble);
      });
      area.scrollTop = area.scrollHeight;
    });

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
    .then(() => input.value = "");
}

function handleTyping(context) {
  if (context === "thread" && currentThreadUser) {
    const typingRef = db.collection("threads")
      .doc(threadId(currentUser.uid, currentThreadUser))
      .collection("typing")
      .doc(currentUser.uid);

    typingRef.set({ typing: true });
    setTimeout(() => typingRef.delete(), 3000);
  } else if (context === "group" && currentRoom) {
    const typingRef = db.collection("groups")
      .doc(currentRoom)
      .collection("typing")
      .doc(currentUser.uid);

    typingRef.set({ typing: true });
    setTimeout(() => typingRef.delete(), 3000);
  }
}

// === Part 2 - Group Chat, Profile, Friends & Misc ===

// ===== Group Messaging =====
function listenMessages() {
  const groupArea = document.getElementById("groupMessages");
  if (!groupArea || !currentRoom) return;

  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      groupArea.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");

        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${msg.senderName || "Unknown"}</strong>`;
        bubble.appendChild(sender);

        const textDiv = document.createElement("div");
        textDiv.textContent = decrypted;
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
    .then(() => input.value = "");
}

function listenGroupTyping() {
  const indicator = document.getElementById("groupTypingIndicator");
  if (!indicator || !currentRoom) return;

  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("groups").doc(currentRoom).collection("typing")
    .onSnapshot(snapshot => {
      const typing = [];
      snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) typing.push(doc.id);
      });
      indicator.textContent = typing.length ? `${typing.join(", ")} typing...` : "";
    });
}

function joinRoom(roomName) {
  currentRoom = roomName;
  listenMessages();
  listenGroupTyping();
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
        return `<div class='member-entry' onclick='showUserProfile("${uid}")'>${uid}${badge}</div>`;
      }).join("");

      infoDiv.innerHTML = `
        <div class='group-meta'>
          <strong>${group.name}</strong><br>
          👑 Owner: ${owner}<br>
          📅 Created: ${createdAt}<br>
          👥 Members (${members.length}):
          <div class='member-list'>${membersHTML}</div>
        </div>
      `;

      if (adminList.includes(currentUser.uid)) {
        infoDiv.innerHTML += `<button onclick='deleteGroup("${groupId}")'>🗑️ Delete Group</button>`;
      }

      document.getElementById("chatName").textContent = group.name || "Group";
      document.getElementById("chatProfilePic").src = "group-icon.png";
      document.getElementById("chatStatus").textContent = `Members: ${members.length}`;
    });
  });
}

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
        <div class='btn-group'>
          <button onclick='openThread("${friend.uid}", "${friend.username || "Friend"}")'>💬 Message</button>
          <button onclick='showUserProfile("${friend.uid}")'>👁️ View</button>
        </div>
      `;
      list.appendChild(div);
    });
  });
}

// ===== Profile & Misc =====
function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const gender = document.getElementById("profileGender").value;
  const phone = document.getElementById("profilePhone").value;
  const email = document.getElementById("profileEmail").value;
  const username = document.getElementById("profileUsername").value;

  const data = { name, bio, gender, phone, email, username };

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

function triggerFileInput(context) {
  const inputId = context === "group" ? "groupFile" : "threadFile";
  document.getElementById(inputId).click();
}

function uploadFile(context) {
  alert(`File upload for ${context} not implemented yet.`);
}

function showUserProfile(uid) {
  alert(`Viewing user: ${uid}`);
}

// === End of Final Cleaned StringWasp App ===
