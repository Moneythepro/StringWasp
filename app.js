// ====== StringWasp v2 - app.js ======

// UUID Utility
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// Firebase Init
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

// UI Tabs
function switchTab(id) {
  document.querySelectorAll(".tab, .tabContent").forEach(tab => tab.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";

  if (id === "chatTab") loadChatList();
  if (id === "inboxTab") loadInbox();
  if (id === "friendsTab") loadFriends();
}

// Auth
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
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return;
  auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password || password.length < 6) return;
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => alert("✔️ Registered. Now choose a username."))
    .catch(e => alert(e.message));
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username || username.length > 20) return;
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// Main App Load
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== Chat List =====
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
        img: "default-avatar.png"
      });
    });
    return db.collection("groups").where("members", "array-contains", currentUser.uid).get();
  }).then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      chats.push({
        id: doc.id,
        name: group.name,
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
      <img src="${chat.img}" />
      <div class="details">
        <div class="name">${chat.name}</div>
        <div class="last-message">Tap to view chat</div>
      </div>
      <div class="meta">
        <div class="time">--</div>
        <div class="badge">1</div>
      </div>`;
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

// ===== Threads (DM) =====
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

  // Load profile info
  db.collection("users").doc(uid).get().then(doc => {
    if (doc.exists) {
      const user = doc.data();
      document.getElementById("chatProfilePic").src = user.photoURL || "default-avatar.png";
      const lastSeen = user.lastSeen?.toDate().toLocaleString() || "Online";
      document.getElementById("chatStatus").textContent = lastSeen;
    } else {
      document.getElementById("chatStatus").textContent = "User not found";
    }
  });

  // Load messages
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
      let decrypted = "";

      try {
        decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
      } catch (e) {
        decrypted = "[Message corrupted]";
      }

      const displayText = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);
      const div = document.createElement("div");
      div.className = "message-bubble " + (msg.from === currentUser.uid ? "right" : "left");
      div.textContent = `${msg.fromName || "User"}: ${displayText}`;
      area.appendChild(div);
    });

    area.scrollTop = area.scrollHeight;
  });

  // Typing
  db.collection("threads")
    .doc(threadId(currentUser.uid, uid))
    .collection("typing")
    .onSnapshot(snapshot => {
      const typingDiv = document.getElementById("typingIndicator");
      const typingUsers = [];
      snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) typingUsers.push(doc.id);
      });
      typingDiv.textContent = typingUsers.length ? `${typingUsers.join(", ")} typing...` : "";
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;

  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const fromName = document.getElementById("usernameDisplay").textContent;

  const msgData = {
    from: currentUser.uid,
    fromName,
    text: encryptedText,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages")
    .add(msgData)
    .then(() => input.value = "")
    .catch(console.error);
}

function handleThreadTyping(type) {
  const path = type === "thread"
    ? `threads/${threadId(currentUser.uid, currentThreadUser)}/typing`
    : `groups/${currentRoom}/typing`;
  db.collection(path.split("/")[0]).doc(path.split("/")[1])
    .collection("typing").doc(currentUser.uid)
    .set({ active: true });
  setTimeout(() => {
    db.collection(path.split("/")[0]).doc(path.split("/")[1])
      .collection("typing").doc(currentUser.uid)
      .delete().catch(() => {});
  }, 3000);
}

// ===== Inbox System =====
function listenInbox() {
  const inboxList = document.getElementById("inboxList");
  if (!inboxList || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();

  unsubscribeInbox = db.collection("inbox").doc(currentUser.uid).collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      inboxList.innerHTML = snapshot.empty ? "<div class='empty'>No notifications</div>" : "";

      snapshot.forEach(doc => {
        const data = doc.data();
        const fromDisplay =
          data.fromName ||
          (typeof data.from === "string"
            ? data.from
            : data.from?.username || data.from?.email || "Unknown");

        const div = document.createElement("div");
        div.className = "inbox-card";
        div.innerHTML = `
          <div>
            <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
            From: ${fromDisplay}
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${data.from || ""}', '${data.group || ""}')">Accept</button>
            <button onclick="declineInbox('${doc.id}')">Decline</button>
          </div>
        `;
        inboxList.appendChild(div);
      });
    });
}
  
function acceptInbox(id, type, from) {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items").doc(id);
  if (type === "friend") {
    db.collection("friends").doc(currentUser.uid).collection("list").doc(from).set({ uid: from });
    db.collection("friends").doc(from).collection("list").doc(currentUser.uid).set({ uid: currentUser.uid });
  } else if (type === "group") {
    db.collection("groups").doc(from).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  }
  ref.update({ read: true }).then(() => ref.delete());
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

function markAllRead() {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items");
  ref.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  });
}

// ===== Typing Indicator (both DM & Group) =====

function handleGroupTyping(type) {
  const typingRef = type === "group"
    ? db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid)
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("typing").doc(currentUser.uid);

  typingRef.set({ typing: true });
  setTimeout(() => typingRef.delete(), 3000);
}

// ===== File Uploads =====

function triggerFileInput(context) {
  const input = document.getElementById(context === "thread" ? "threadFile" : "groupFile");
  if (input) input.click();
}

function uploadFile(context) {
  const fileInput = document.getElementById(context === "thread" ? "threadFile" : "groupFile");
  const file = fileInput?.files[0];
  if (!file) return;

  const filePath = `${context}/${currentUser.uid}_${Date.now()}_${file.name}`;
  const ref = storage.ref().child(filePath);

  ref.put(file).then(snapshot => snapshot.ref.getDownloadURL()).then(url => {
    const message = {
      text: `📎 File: ${file.name}`,
      fileUrl: url,
      from: currentUser.uid,
      fromName: document.getElementById("usernameDisplay").textContent,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (context === "thread") {
      db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add(message);
    } else {
      db.collection("groups").doc(currentRoom).collection("messages").add({
        ...message,
        senderId: currentUser.uid,
        senderName: message.fromName
      });
    }
  }).catch(console.error);
}

// ===== Profile =====

function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const gender = document.getElementById("profileGender").value;
  const phone = document.getElementById("profilePhone").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const username = document.getElementById("profileUsername").value.trim();

  db.collection("users").doc(currentUser.uid).update({
    name, bio, gender, phone, email, username
  });

  const file = document.getElementById("profilePic").files[0];
  if (file) {
    const ref = storage.ref().child(`avatars/${currentUser.uid}`);
    ref.put(file).then(() => ref.getDownloadURL()).then(url => {
      document.getElementById("profilePicPreview").src = url;
      return db.collection("users").doc(currentUser.uid).update({ photoURL: url });
    });
  }
}

function contactSupport() {
  alert("Support email: support@stringwasp.com");
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null;
    location.reload();
  });
}

// ===== Chat Options Menu (⋮) =====

function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function closeChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  if (menu) menu.style.display = "none";
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#chatOptionsMenu") && !e.target.closest("button[onclick='openChatMenu()']")) {
    closeChatMenu();
  }
});

function blockUser() {
  alert("User blocked (not implemented yet).");
  closeChatMenu();
}

function viewMedia() {
  alert("Media viewer coming soon.");
  closeChatMenu();
}

function exportChat() {
  alert("Export chat feature coming soon.");
  closeChatMenu();
}

function deleteThread() {
  const confirmDelete = confirm("Delete entire chat?");
  if (!confirmDelete) return;

  const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
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

function viewGroupMembers() {
  alert("Group member list UI coming soon.");
  closeChatMenu();
}

function inviteByLink() {
  alert("Group invite link feature coming soon.");
  closeChatMenu();
}

function leaveGroup() {
  if (!currentRoom || !currentUser) return;

  db.collection("groups").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
  }).then(() => {
    alert("You left the group.");
    switchTab("chatTab");
  });
  closeChatMenu();
}

// ===== Utility =====

function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    if (doc.exists) {
      const user = doc.data();
      document.getElementById("viewProfileName").textContent = user.name || "No name";
      document.getElementById("viewProfileUsername").textContent = "@" + (user.username || "unknown");
      document.getElementById("viewProfileBio").textContent = user.bio || "No bio";
      document.getElementById("viewProfileEmail").textContent = user.email || "";
      document.getElementById("viewProfileStatus").textContent = user.lastSeen
        ? "Last seen: " + user.lastSeen.toDate().toLocaleString()
        : "Online recently";
      document.getElementById("viewProfilePic").src = user.photoURL || "default-avatar.png";
      document.getElementById("viewProfileModal").style.display = "block";
    }
  });
}

function addFriend() {
  const targetUid = document.getElementById("viewProfileUsername").textContent.replace("@", "");
  if (targetUid && currentUser) {
    db.collection("inbox").doc(targetUid).collection("items").add({
      from: currentUser.uid,
      fromName: document.getElementById("usernameDisplay").textContent,
      type: "friend",
      read: false
    }).then(() => alert("Friend request sent."));
  }
}

function messageUser() {
  const username = document.getElementById("viewProfileUsername").textContent.replace("@", "");
  db.collection("users").where("username", "==", username).get().then(snapshot => {
    if (!snapshot.empty) {
      const user = snapshot.docs[0];
      openThread(user.id, user.data().username);
      document.getElementById("viewProfileModal").style.display = "none";
    }
  });
}

// ===== App Startup =====

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      db.collection("users").doc(user.uid).get().then(doc => {
        if (!doc.exists || !doc.data().username) {
          showTab("usernameDialog");
        } else {
          showTab("chatTab");
          document.getElementById("usernameDisplay").textContent = doc.data().username;
          document.getElementById("profileUsername").value = doc.data().username;
          listenInbox();
          loadChatList();
          loadFriends();
        }
      });
    } else {
      showTab("loginPage");
    }
  });
});
