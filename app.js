// ====== StringWasp App.js (Modern V2) ======

// 🔐 UUID Generator
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

// ===== UI Tab Switch =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  if (id === "groupsTab") {
    loadRooms();
    if (currentRoom) listenMessages();
  }
}

// ===== Loading Overlay =====
function showLoading(state) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = state ? "flex" : "none";
}

// ===== Auth Listener =====
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

// ===== Login/Register =====
function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading(true);
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => alert("Login failed: " + err.message))
    .finally(() => showLoading(false));
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading(true);
  auth.createUserWithEmailAndPassword(email, password)
    .catch(err => alert("Registration failed: " + err.message))
    .finally(() => showLoading(false));
}

// ===== Save Username After Registration =====
function saveUsername() {
  const username = document.getElementById("newUsername")?.value.trim();
  if (!username) return alert("Enter a username");

  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// ===== Username Check =====
function checkUsername() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog"); // 👤 Ask user to pick a username
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI(); // ✅ Load main UI only after username is confirmed
    }
  });
}

// ===== Load App UI After Login/Username =====
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab"); // ✅ Unified tab
  loadInbox();
  loadFriends();
  loadProfile();
  loadChatList(); // ✅ Combined chat list for friends + groups
}

// ===== Chat Helpers =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";
}

// ===== Send Message (Group) =====
function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  const encrypted = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const message = {
    text: encrypted,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("groups").doc(currentRoom).collection("messages").add(message).then(() => {
    input.value = "";
  });
}

// ===== Listen to Group Messages =====
function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom) return;

  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
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

        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// ===== Send Thread Message (DM) =====
function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent;
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const threadDocId = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(threadDocId);

  const messageData = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Add message to thread
  threadRef.collection("messages").add(messageData)
    .then(() => {
      input.value = "";

      // Update the thread root doc with metadata for chat list
      threadRef.set({
        participants: [currentUser.uid, currentThreadUser],
        names: {
          [currentUser.uid]: fromName,
          [currentThreadUser]: document.getElementById("threadWithName").textContent || "Friend"
        },
        lastMessage: text,
        lastSender: fromName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    }).catch(console.error);
}

// ===== Open Thread Chat =====
function openThread(uid, username) {
  currentThreadUser = uid;
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;

  // Set thread document metadata (ensures future chat list shows it)
  const threadRef = db.collection("threads").doc(threadId(currentUser.uid, uid));
  threadRef.set({
    participants: [currentUser.uid, uid],
    names: {
      [currentUser.uid]: document.getElementById("usernameDisplay").textContent || "You",
      [uid]: username
    },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Unsubscribe previous if needed
  if (unsubscribeThread) unsubscribeThread();

  // Start listening to thread messages
  unsubscribeThread = threadRef.collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";

      snapshot.forEach(doc => {
        const msg = doc.data();
        const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.from === currentUser.uid ? "right" : "left");

        const textDiv = document.createElement("div");
        textDiv.textContent = `${msg.fromName}: ${decrypted}`;
        bubble.appendChild(textDiv);

        area.appendChild(bubble);
      });

      area.scrollTop = area.scrollHeight;
    });
}

// ===== Unified Chat List (Groups + Friends) =====
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  list.innerHTML = "<em>Loading chats...</em>";

  const groupsRef = db.collection("groups").where("members", "array-contains", currentUser.uid);
  const friendsRef = db.collection("users").doc(currentUser.uid).collection("friends");

  Promise.all([groupsRef.get(), friendsRef.get()]).then(([groupsSnap, friendsSnap]) => {
    list.innerHTML = "";

    groupsSnap.forEach(doc => {
      const group = doc.data();
      const div = document.createElement("div");
      div.className = "chat-card";
      div.innerHTML = `
        <img src="group-icon.png" />
        <div class="details">
          <div class="name">${group.name}</div>
          <div class="last-message">Group chat</div>
        </div>
      `;
      div.onclick = () => {
        currentRoom = doc.id;
        listenMessages();
        switchTab("groupsTab");
        joinRoom(doc.id);
      };
      list.appendChild(div);
    });

    friendsSnap.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "chat-card";
      div.innerHTML = `
        <img src="${data.photoURL || 'default-avatar.png'}" />
        <div class="details">
          <div class="name">${data.username || data.email}</div>
          <div class="last-message">Friend</div>
        </div>
      `;
      div.onclick = () => openThread(doc.id, data.username || data.email);
      list.appendChild(div);
    });
  });
}

// ===== Group Create / Join =====
function createGroup() {
  const name = prompt("Enter group name:");
  if (!name) return;

  const groupId = db.collection("groups").doc().id;
  const group = {
    name,
    createdBy: currentUser.uid,
    members: [currentUser.uid],
    admins: [currentUser.uid],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("groups").doc(groupId).set(group).then(() => {
    alert("Group created!");
    joinRoom(groupId);
    loadChatList();
  });
}

function joinGroup() {
  const id = prompt("Enter group ID:");
  if (!id) return;

  db.collection("groups").doc(id).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  }).then(() => {
    alert("Joined group!");
    joinRoom(id);
    loadChatList();
  }).catch(() => alert("Group not found."));
}

function joinRoom(roomId) {
  currentRoom = roomId;
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  listenMessages();
  loadGroupInfo(roomId);
}

// ===== Inbox System =====
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
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${data.from}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(div);
      });

      document.getElementById("inboxBadge").textContent = unreadCount || "";
      document.getElementById("inboxBadge").style.display = unreadCount ? "inline-block" : "none";
    });
}

function markAllRead() {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items");
  ref.get().then(snapshot => {
    snapshot.forEach(doc => {
      if (!doc.data().read) {
        ref.doc(doc.id).update({ read: true });
      }
    });
  });
}

// ===== Friend System =====
function addFriend(uid) {
  if (!uid || uid === currentUser.uid) return;

  const ref = db.collection("inbox").doc(uid).collection("items").doc(currentUser.uid);
  ref.set({
    type: "friend",
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => alert("Friend request sent"));
}

function acceptInbox(id, type, from) {
  if (type === "friend") {
    const myRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(from);
    const theirRef = db.collection("users").doc(from).collection("friends").doc(currentUser.uid);

    Promise.all([
      myRef.set({ added: true }),
      theirRef.set({ added: true })
    ]);
  } else if (type === "group") {
    db.collection("groups").doc(from).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  }

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list || !currentUser) return;

  list.innerHTML = "<em>Loading friends...</em>";
  db.collection("users").doc(currentUser.uid).collection("friends").get().then(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "friend-entry";
      div.innerHTML = `
        <div class="friend-name">${data.username || doc.id}</div>
        <button onclick="openThread('${doc.id}', '${data.username || doc.id}')">Chat</button>
      `;
      list.appendChild(div);
    });
  });
}

function loadGroupInfo(groupId) {
  if (!groupId) return;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("groupOwner").textContent = "Owner: " + data.createdBy;
    document.getElementById("groupAdmins").textContent = "Admins: " + (data.admins || []).join(", ");
    const memberList = document.getElementById("groupMembers");
    memberList.innerHTML = "";

    (data.members || []).forEach(uid => {
      const div = document.createElement("div");
      div.className = "member-entry";
      div.textContent = uid;
      memberList.appendChild(div);
    });
  });
}

function saveProfile() {
  const file = document.getElementById("profilePic").files[0];
  const data = {
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value,
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value,
    email: document.getElementById("profileEmail").value,
    username: document.getElementById("profileUsername").value
  };

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

function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profileUsername").value = data.username || "";
  });
}

function contactSupport() {
  alert("Contact us at: support@stringwasp.com");
}

function logout() {
  firebase.auth().signOut();
  window.location.reload();
}

function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// ===== Upload File (Thread or Group) =====
function triggerFileInput(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  input.click();
}

function uploadFile(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  const file = input.files[0];
  if (!file || !currentUser) return;

  const storageRef = firebase.storage().ref(`${type}_uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
  showLoading(true);

  storageRef.put(file).then(snapshot => {
    return snapshot.ref.getDownloadURL();
  }).then(url => {
    const msg = `📎 File: <a href="${url}" target="_blank">${file.name}</a>`;
    if (type === "thread") {
      document.getElementById("threadInput").value = msg;
      sendThreadMessage();
    } else {
      document.getElementById("groupMessageInput").value = msg;
      sendGroupMessage();
    }
  }).catch(console.error).finally(() => {
    showLoading(false);
  });
}

function handleTyping(type) {
  const typingRef = type === "group"
    ? db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid)
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("typing").doc(currentUser.uid);

  typingRef.set({ typing: true });

  setTimeout(() => typingRef.delete(), 2000); // Clear after 2s
}

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
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${data.from}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(div);
      });

      document.getElementById("inboxBadge").textContent = unreadCount || "";
    });
}

function markAllRead() {
  db.collection("inbox").doc(currentUser.uid).collection("items")
    .get().then(snapshot => {
      snapshot.forEach(doc => {
        doc.ref.update({ read: true });
      });
    });
}

function showModal(message, yesCallback) {
  const modal = document.getElementById("customModal");
  document.getElementById("modalMessage").textContent = message;

  const yesBtn = document.getElementById("modalYes");
  const noBtn = document.getElementById("modalNo");

  yesBtn.onclick = () => {
    modal.style.display = "none";
    yesCallback();
  };
  noBtn.onclick = () => {
    modal.style.display = "none";
  };

  function openModal() {
  modal.style.display = "flex";
}

function blockUser() {
  showModal("Block this user?", () => {
    alert("Blocked (stub)");
  });
}

function exportChat() {
  alert("Export coming soon!");
}

function deleteThread() {
  showModal("Delete this chat?", () => {
    const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Chat deleted");
    });
  });
}

function viewMedia() {
  alert("Media viewer coming soon");
}

function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  document.getElementById("darkModeToggle").checked = true;
}

function searchChats() {
  const query = document.getElementById("globalSearch").value.toLowerCase();
  const cards = document.querySelectorAll(".chat-card");
  cards.forEach(card => {
    const name = card.querySelector(".name").textContent.toLowerCase();
    card.style.display = name.includes(query) ? "flex" : "none";
  });
}

function runSearch() {
  const term = document.getElementById("searchInput").value.toLowerCase();
  if (!term) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  db.collection("users").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      if ((user.username || "").toLowerCase().includes(term)) {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <img src="${user.photoURL || 'default-avatar.png'}" class="search-avatar" />
          <div class="search-username">${user.username || user.email}</div>
          <button onclick="sendFriendRequest('${doc.id}')">➕ Add Friend</button>
        `;
        userResults.appendChild(div);
      }
    });
  });

  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      if ((group.name || "").toLowerCase().includes(term)) {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <div class="search-username">👥 ${group.name}</div>
          <button onclick="joinGroupById('${doc.id}')">Join</button>
        `;
        groupResults.appendChild(div);
      }
    });
  });
}

function switchSearchView(view) {
  currentSearchView = view;
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard"));
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const user = doc.data();
    if (!user) return;
    document.getElementById("profileName").value = user.name || "";
    document.getElementById("profileBio").value = user.bio || "";
    document.getElementById("profileUsername").value = user.username || "";
    document.getElementById("profilePhone").value = user.phone || "";
    document.getElementById("profileEmail").value = user.email || "";
    if (user.photoURL) {
      document.getElementById("profilePicPreview").src = user.photoURL;
    }
  });
}

function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container) return;
  db.collection("users").doc(currentUser.uid).collection("friends")
    .onSnapshot(snapshot => {
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const friendId = doc.id;
        db.collection("users").doc(friendId).get().then(friendDoc => {
          const data = friendDoc.data();
          const div = document.createElement("div");
          div.className = "friend-entry";
          div.innerHTML = `
            <img src="${data.photoURL || 'default-avatar.png'}" class="friend-avatar" />
            <span class="friend-name">${data.username || 'Unknown'}</span>
            <button onclick="openThread('${friendId}', '${data.username || 'Unknown'}')">Message</button>
          `;
          container.appendChild(div);
        });
      });
    });
}

function loadChatList() {
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  list.innerHTML = `<div class="loader"></div>`;

  const chats = [];

  // 🔹 Load Direct Messages
  db.collection("threads")
    .where("participants", "array-contains", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const otherUid = data.participants.find(uid => uid !== currentUser.uid);
        const name = data.names?.[otherUid] || "Unknown";
        const last = data.lastMessage || "";
        const time = data.updatedAt?.toDate().toLocaleTimeString() || "";

        chats.push({
          type: "dm",
          id: otherUid,
          name,
          last,
          time
        });
      });

      // 🔹 Load Group Chats
      db.collection("groups")
        .where("members", "array-contains", currentUser.uid)
        .get()
        .then(groupSnap => {
          groupSnap.forEach(doc => {
            const group = doc.data();
            chats.push({
              type: "group",
              id: doc.id,
              name: group.name,
              last: group.lastMessage || "",
              time: group.updatedAt?.toDate().toLocaleTimeString() || ""
            });
          });

          // ✅ Sort all chats by latest
          chats.sort((a, b) => new Date(b.time) - new Date(a.time));

          // ✅ Render
          list.innerHTML = "";
          chats.forEach(chat => {
            const div = document.createElement("div");
            div.className = "chat-card";
            div.onclick = () => {
              if (chat.type === "dm") openThread(chat.id, chat.name);
              else joinRoom(chat.id);
            };
            div.innerHTML = `
              <div class="chat-avatar">${chat.type === "group" ? "👥" : "👤"}</div>
              <div class="details">
                <div class="name">${chat.name}</div>
                <div class="last-message">${chat.last}</div>
              </div>
              <div class="meta">${chat.time}</div>
            `;
            list.appendChild(div);
          });

          if (chats.length === 0) {
            list.innerHTML = `<div style="padding:10px;">No chats yet</div>`;
          }
        });
    });
}

function runSearch() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");

  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  // Users
  db.collection("users").where("username", ">=", input).limit(10).get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `
        <img src="${data.photoURL || 'default-avatar.png'}" class="search-avatar" />
        <div class="search-username">@${data.username || "Unknown"}</div>
        <button onclick="messageUser('${doc.id}', '${data.username}')">Message</button>
      `;
      userResults.appendChild(div);
    });
  });

  // Groups
  db.collection("groups").where("name", ">=", input).limit(10).get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `
        <img src="${data.icon || 'group-icon.png'}" class="search-avatar" />
        <div class="search-username">${data.name}</div>
        <button onclick="joinRoom('${doc.id}')">Join</button>
      `;
      groupResults.appendChild(div);
    });
  });
}

function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab"); // Start on Chat tab
  loadInbox();
  loadFriends();
  loadProfile();
  loadGroups();     // Ensure groups dropdown is loaded
  loadChatList();   // Load both group and DM chats
}

function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profileUsername").value = data.username || "";
    document.getElementById("usernameDisplay").textContent = data.username || "";
  });
}

function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list) return;
  db.collection("users").doc(currentUser.uid).collection("friends").onSnapshot(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const friendId = doc.id;
      db.collection("users").doc(friendId).get().then(userDoc => {
        const user = userDoc.data();
        const div = document.createElement("div");
        div.className = "friend-entry";
        div.innerHTML = `
          <img class="friend-avatar" src="${user.photoURL || 'default-avatar.png'}" />
          <div class="friend-name">${user.username || user.email}</div>
          <button onclick="openThread('${friendId}', '${user.username || user.email}')">💬</button>
        `;
        list.appendChild(div);
      });
    });
  });
}

function loadGroups() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown || !currentUser) return;

  db.collection("groups").where("members", "array-contains", currentUser.uid).get()
    .then(snapshot => {
      dropdown.innerHTML = "";
      snapshot.forEach(doc => {
        const group = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = group.name || doc.id;
        dropdown.appendChild(option);
      });
    });
}

function sendFriendRequest(uid) {
  db.collection("inbox").doc(uid).collection("items").add({
    type: "friend",
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => {
    alert("Friend request sent!");
  });
}

function joinGroupById(groupId) {
  db.collection("groups").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  }).then(() => {
    alert("Joined group!");
    loadGroups(); // refresh dropdown
  });
}

function messageUser() {
  if (!currentThreadUser) return;
  const username = document.getElementById("viewProfileUsername").textContent.replace("@", "");
  openThread(currentThreadUser, username);
  document.getElementById("viewProfileModal").style.display = "none";
}

function displayUserSearchResults(users) {
  const container = document.getElementById("searchResultsUser");
  container.innerHTML = "";

  users.forEach(user => {
    const div = document.createElement("div");
    div.className = "search-result";

    div.innerHTML = `
      <img class="search-avatar" src="${user.photoURL || 'default-avatar.png'}" alt="Avatar" />
      <div class="search-info">
        <div class="username">@${user.username}</div>
        <div class="bio">${user.bio || "No bio yet"}</div>
      </div>
      <button onclick="addFriend('${user.uid}')">Add</button>
    `;

    div.onclick = () => viewUserProfile(user.uid); // Optional profile preview
    container.appendChild(div);
  });
}

function displayGroupSearchResults(groups) {
  const container = document.getElementById("searchResultsGroup");
  container.innerHTML = "";

  groups.forEach(group => {
    const div = document.createElement("div");
    div.className = "search-result";

    div.innerHTML = `
      <img class="search-avatar" src="${group.photoURL || 'default-avatar.png'}" alt="Group" />
      <div class="search-info">
        <div class="username">${group.name}</div>
        <div class="bio">${group.description || "No description"}</div>
      </div>
      <button onclick="joinGroupById('${group.id}')">Join</button>
    `;

    container.appendChild(div);
  });
}

function addFriend(uid) {
  // Example logic — adjust as needed
  db.collection("inbox").doc(uid).collection("items").add({
    type: "friend",
    from: currentUser.uid,
    fromName: currentUser.displayName || currentUser.email,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => showToast("Friend request sent!"));
}

function joinGroupById(groupId) {
  db.collection("groups").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  }).then(() => showToast("Joined group!"));
}

  modal.style.display = "flex";
}

function blockUser() {
  showModal("Block this user?", () => {
    alert("Blocked (stub)");
  });
}

function exportChat() {
  alert("Export coming soon!");
}

function deleteThread() {
  showModal("Delete this chat?", () => {
    const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Chat deleted");
    });
  });
}

function viewMedia() {
  alert("Media viewer coming soon");
}

function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = true;
}

function searchChats() {
  const query = document.getElementById("globalSearch")?.value.toLowerCase();
  const cards = document.querySelectorAll(".chat-card");
  cards.forEach(card => {
    const name = card.querySelector(".name").textContent.toLowerCase();
    card.style.display = name.includes(query) ? "flex" : "none";
  });
}

function runSearch() {
  const term = document.getElementById("searchInput")?.value.toLowerCase();
  if (!term) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  db.collection("users").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      if ((user.username || "").toLowerCase().includes(term)) {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <img src="${user.photoURL || 'default-avatar.png'}" class="search-avatar" />
          <div class="search-username">${user.username || user.email}</div>
          <button onclick="sendFriendRequest('${doc.id}')">➕ Add Friend</button>
        `;
        userResults.appendChild(div);
      }
    });
  });

  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      const group = doc.data();
      if ((group.name || "").toLowerCase().includes(term)) {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <div class="search-username">👥 ${group.name}</div>
          <button onclick="joinGroupById('${doc.id}')">Join</button>
        `;
        groupResults.appendChild(div);
      }
    });
  });
}

function switchSearchView(view) {
  currentSearchView = view;
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard"));
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}
