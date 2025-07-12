// ====== StringWasp App.js (Final Unified Version, Part 1) ======

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

// ✅ WebTorrent Init
let client = null;

let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;

let unsubscribeMessages = null;
let unsubscribeThread = null;
let unsubscribeInbox = null;
let unsubscribeTyping = null;

// ===== UI Tab Switcher =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
  const target = document.getElementById(id);
  if (target) target.style.display = "block";

  if (id === "groupsTab") {
    loadRooms?.(); // optional
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
      switchTab("usernameDialog"); // Prompt for username
    } else {
      document.getElementById("usernameDisplay").textContent = userDoc.data().username;
      loadMainUI(); // Load chat, inbox, profile
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

// ===== Username Save After Register =====
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

// ===== Confirm Username Before Load =====
function checkUsername() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog"); // Ask username
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI(); // Proceed to app
    }
  });
}

// ===== Main App Load UI =====
function loadMainUI() {
  showLoading(true); // Optional: Show loading spinner

  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");

  // Safe calls with error catching
  try { loadInbox(); } catch (e) { console.warn("Inbox failed", e); }
  try { loadFriends(); } catch (e) { console.warn("Friends failed", e); }
  try { loadProfile(); } catch (e) { console.warn("Profile failed", e); }
  try { loadGroups?.(); } catch (e) { console.warn("Groups load skipped", e); }
  try { loadChatList(); } catch (e) { console.warn("Chats failed", e); }

  setTimeout(() => showLoading(false), 300); // Slight delay for smoother transition
}

// ===== Save Profile Data =====
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

// ===== Load Profile UI =====
function loadProfile() {
  const uid = currentUser?.uid;
  if (!uid) return;

  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.publicEmail || "";
    document.getElementById("profileUsername").value = data.username || "";
  });
}

  function saveProfile() {
  const updates = {
    name: document.getElementById("profileName").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value.trim(),
    publicEmail: document.getElementById("profileEmail").value.trim(),
    username: document.getElementById("profileUsername").value.trim()
  };

  db.collection("users").doc(currentUser.uid).update(updates).then(() => {
    alert("Profile updated!");
    document.getElementById("usernameDisplay").textContent = updates.username;
  }).catch(err => {
    console.error("Profile save error:", err);
    alert("Failed to save profile");
  });
  }

document.getElementById("profilePic").addEventListener("change", uploadProfilePic);

function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const ref = storage.ref().child(`avatars/${currentUser.uid}`);
  showLoading(true);

  ref.put(file).then(snapshot => snapshot.ref.getDownloadURL())
    .then(url => {
      return db.collection("users").doc(currentUser.uid).update({
        photoURL: url
      });
    }).then(() => {
      document.getElementById("profilePicPreview").src = URL.createObjectURL(file);
      alert("Profile picture updated!");
    }).catch(err => {
      console.error("Upload error:", err);
      alert("Failed to upload profile picture.");
    }).finally(() => {
      showLoading(false);
    });
}
  
let currentProfileUID = null;

function viewUserProfile(uid) {
  currentProfileUID = uid;

  db.collection("users").doc(uid).get().then(doc => {
    const u = doc.data();
    if (!u) return alert("User not found");

    document.getElementById("fullUserAvatar").src = u.photoURL || "default-avatar.png";
    document.getElementById("fullUserName").textContent = "@" + (u.username || "unknown");
    document.getElementById("fullUserBio").textContent = u.bio || "No bio";
    document.getElementById("fullUserEmail").textContent = u.email || "";
    document.getElementById("fullUserPhone").textContent = u.phone || "";

    document.getElementById("userFullProfile").style.display = "flex";
  });
}

let currentGroupID = null;

function viewGroupInfo(groupId) {
  currentGroupID = groupId;

  db.collection("groups").doc(groupId).get().then(doc => {
    const g = doc.data();
    if (!g) return alert("Group not found");

    document.getElementById("groupAvatar").src = g.photoURL || "group-icon.png";
    document.getElementById("groupName").textContent = g.name || "Group";
    document.getElementById("groupDescription").textContent = g.description || "No description";
    document.getElementById("groupOwnerInfo").textContent = "Owner: @" + (g.ownerUsername || g.owner || "unknown");

    const memberList = document.getElementById("groupMembersList");
    memberList.innerHTML = "<b>Members:</b>";

    const promises = (g.members || []).map(uid =>
      db.collection("users").doc(uid).get().then(d => {
        const user = d.data();
        const div = document.createElement("div");
        div.textContent = "@" + (user?.username || uid);
        memberList.appendChild(div);
      })
    );

    Promise.all(promises).then(() => {
      document.getElementById("groupFullInfo").style.display = "flex";
    });
  });
}

// ===== Contact Support Shortcut =====
function contactSupport() {
  alert("Contact us at: support@stringwasp.com");
}

// ===== Logout & Reset App =====
function logout() {
  firebase.auth().signOut();
  window.location.reload();
}

// ===== Group List for Dropdowns =====
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

// ===== Load All Chats (DMs + Groups) =====
function loadChatList() {
  const container = document.getElementById("chatList");
  container.innerHTML = "";

  const uid = currentUser?.uid;
  if (!uid) return;

  // 🔹 Load DM Threads
  db.collection("threads")
    .where("participants", "array-contains", uid)
    .orderBy("updatedAt", "desc")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const friendId = data.participants.find(id => id !== uid);
        const friendName = data.names?.[friendId] || "Friend";
        const lastMsg = data.lastMessage || "";

        const div = document.createElement("div");
        div.className = "chat-card";
        div.innerHTML = `
          <img src="default-avatar.png" class="friend-avatar" />
          <div class="details">
            <div class="name">${friendName}</div>
            <div class="last-message">${lastMsg}</div>
          </div>
        `;
        div.onclick = () => openThread(friendId, friendName);
        container.appendChild(div);
      });
    });

  // 🔹 Load Group Chats
  db.collection("groups")
    .where("members", "array-contains", uid)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "chat-card";
        div.innerHTML = `
          <img src="${data.icon || 'group-icon.png'}" class="friend-avatar" />
          <div class="details">
            <div class="name">${data.name}</div>
            <div class="last-message">${data.lastMessage || ""}</div>
          </div>
        `;
        div.onclick = () => joinRoom(doc.id);
        container.appendChild(div);
      });
    });
}

function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = (menu.style.display === "block") ? "none" : "block";
}



// ===== Escape HTML Utility =====
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===== Inbox Listener =====
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

        const senderName = data.fromName || "Unknown";

        const div = document.createElement("div");
        div.className = "inbox-card";
        div.innerHTML = `
          <div>
  <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
  From: ${senderName}
</div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${data.from}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(div);
      });

      const badge = document.getElementById("inboxBadge");
      if (badge) {
        badge.textContent = unreadCount || "";
        badge.style.display = unreadCount ? "inline-block" : "none";
      }
    });
}

// ===== Accept Inbox Item =====
function acceptInbox(id, type, from) {
  if (type === "friend") {
    const myRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(from);
    const theirRef = db.collection("users").doc(from).collection("friends").doc(currentUser.uid);
    Promise.all([myRef.set({ added: true }), theirRef.set({ added: true })]);
  } else if (type === "group") {
    db.collection("groups").doc(from).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  }

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

// ===== Decline Inbox Item =====
function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
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

// ===== Friend List =====
function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list || !currentUser) return;

  list.innerHTML = "<em>Loading friends...</em>";
  db.collection("users").doc(currentUser.uid).collection("friends").get().then(snapshot => {
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const div = document.createElement("div");
      div.className = "friend-entry";

      db.collection("users").doc(doc.id).get().then(friendDoc => {
        const friend = friendDoc.data() || {};
        const username = friend.username || friend.email || doc.id;

        div.innerHTML = `
          <img src="${friend.photoURL || 'default-avatar.png'}" class="friend-avatar" />
          <div class="friend-name">${username}</div>
          <button onclick="openThread('${doc.id}', '${escapeHtml(username)}')">💬 Chat</button>
        `;
        list.appendChild(div);
      });
    });
  });
}

// ===== Add Friend Shortcut =====
function addFriend(uid) {
  if (!uid || uid === currentUser.uid) return;

  db.collection("inbox").doc(uid).collection("items").add({
    type: "friend",
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => alert("Friend request sent!"));
}

// ===== Group Info Loader =====
function loadGroupInfo(groupId) {
  if (!groupId) return;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("groupOwner").textContent = "Owner: " + (data.createdBy || "Unknown");
    document.getElementById("groupAdmins").textContent = "Admins: " + (data.admins || []).join(", ");

    const memberList = document.getElementById("groupMembers");
    memberList.innerHTML = "";

    (data.members || []).forEach(uid => {
      db.collection("users").doc(uid).get().then(userDoc => {
        const user = userDoc.data();
        const div = document.createElement("div");
        div.className = "member-entry";
        div.textContent = user?.username || uid;
        memberList.appendChild(div);
      });
    });
  });
}

// ===== DM: Open Thread Chat =====
function openThread(uid, username) {
  currentThreadUser = uid;
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  document.getElementById("roomDropdown").style.display = "none";
  document.querySelector(".group-info").style.display = "none";

  if (unsubscribeThread) unsubscribeThread();

  const docId = threadId(currentUser.uid, uid);

  unsubscribeThread = db.collection("threads")
    .doc(docId)
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

        const textDiv = document.createElement("div");
        textDiv.innerHTML = `${msg.fromName || "User"}: ${decrypted}`;
        bubble.appendChild(textDiv);

        area.appendChild(bubble);
      });

      area.scrollTop = area.scrollHeight;
      renderWithMagnetSupport("threadMessages");
    });
}

function deleteThread() {
  showModal("Delete this chat?", () => {
    const docId = threadId(currentUser.uid, currentThreadUser);
    const ref = db.collection("threads").doc(docId).collection("messages");

    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("✅ Chat deleted");
    });
  });
}

// ===== DM: Send Thread Message with AES Encryption =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent;
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const docId = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(docId);

  const message = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  threadRef.collection("messages").add(message).then(() => {
    input.value = "";
    threadRef.set({
      participants: [currentUser.uid, currentThreadUser],
      names: {
        [currentUser.uid]: fromName,
        [currentThreadUser]: document.getElementById("threadWithName").textContent || "Friend"
      },
      lastMessage: text,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

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
        textDiv.innerHTML = decrypted;
        bubble.appendChild(textDiv);

        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      renderWithMagnetSupport("groupMessages");

      // 👇 Add magnet download handler
      renderWithMagnetSupport("groupMessages");
    });
}

// ===== Typing Indicator =====
function handleTyping(type) {
  const typingRef = type === "group"
    ? db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid)
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("typing").doc(currentUser.uid);

  typingRef.set({ typing: true });
  setTimeout(() => typingRef.delete(), 2000);
}

// ===== Search (Users + Groups) =====
function runSearch() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");

  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  // 👤 Search Users
  db.collection("users").where("username", ">=", input).limit(10).get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "search-result";

      div.innerHTML = `
        <img src="${data.photoURL || 'default-avatar.png'}" class="search-avatar" />
        <div class="search-info">
          <div class="username">@${data.username || "unknown"}</div>
          <div class="bio">${data.bio || "No bio available"}</div>
        </div>
        <button onclick="event.stopPropagation(); messageUser('${doc.id}', '${data.username}')">Message</button>
      `;

      div.onclick = () => viewUserProfile(doc.id);
      userResults.appendChild(div);
    });
  });

  // 👥 Search Groups
  db.collection("groups").where("name", ">=", input).limit(10).get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "search-result";

      div.innerHTML = `
        <img src="${data.icon || 'group-icon.png'}" class="search-avatar" />
        <div class="search-info">
          <div class="username">${data.name}</div>
          <div class="bio">${data.description || "No description"}</div>
        </div>
        <button onclick="event.stopPropagation(); joinGroupById('${doc.id}')">Join</button>
      `;

      div.onclick = () => viewGroupInfo(doc.id);
      groupResults.appendChild(div);
    });
  });
}

function searchChats() {
  const query = document.getElementById("globalSearch").value.toLowerCase();
  const cards = document.querySelectorAll(".chat-card");
  cards.forEach(card => {
    const name = card.querySelector(".name").textContent.toLowerCase();
    card.style.display = name.includes(query) ? "flex" : "none";
  });
}

// ==== For Group Setting ====
function viewGroupMembers() {
  switchTab("profileTab"); // Reuse profile tab to show group info for now
  alert("👥 Group members shown here (UI upgrade coming)");
}

function inviteByLink() {
  if (!currentRoom) return alert("❌ No group selected.");
  const link = `${window.location.origin}?join=${currentRoom}`;
  copyToClipboard(link);
  alert("🔗 Invite link copied:\n" + link);
}

function blockUser() {
  showModal("Block this user?", () => {
    alert("🚫 User blocked (placeholder)");
  });
}

function viewMedia() {
  alert("📎 Media viewer coming soon");
}

function leaveGroup() {
  if (!currentRoom) return;
  const ref = db.collection("groups").doc(currentRoom);
  ref.update({
    members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
  }).then(() => {
    alert("🚪 You left the group.");
    currentRoom = null;
    loadChatList();
    switchTab("chatTab");
  });
}

// ===== Search Tab Switcher =====
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

// ===== Join Group by ID (Used in search results) =====
function joinGroupById(groupId) {
  db.collection("groups").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  }).then(() => {
    alert("Joined group!");
    loadChatList(); // refresh chat list
    loadGroups();   // refresh dropdown
  }).catch(() => alert("Group not found or join failed."));
}

function joinRoom(roomId) {
  currentRoom = roomId;
  document.getElementById("roomDropdown").style.display = "block";
  document.querySelector(".group-info").style.display = "block";
  
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  listenMessages(); // ✅ Real-time group chat
  loadGroupInfo(roomId); // ✅ Load group metadata
}

// ===== Message User Shortcut =====
function messageUser(uid, username) {
  openThread(uid, username || "Friend");
}

// ===== Upload File (DM or Group) =====
function triggerFileInput(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  input.click();
}

function uploadFile(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  const file = input.files[0];
  if (!file || !currentUser) return;

  const ref = storage.ref(`${type}_uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
  showLoading(true);

  ref.put(file).then(snap => snap.ref.getDownloadURL()).then(url => {
    const msg = `📎 File: <a href="${url}" target="_blank">${file.name}</a>`;
    if (type === "thread") {
      document.getElementById("threadInput").value = msg;
      sendThreadMessage();
    } else {
      document.getElementById("groupMessageInput").value = msg;
      sendGroupMessage();
    }
  }).catch(err => {
    alert("Upload failed");
    console.error(err);
  }).finally(() => showLoading(false));
}

// ===== Clipboard Copy =====
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard"));
}

// ===== Theme Toggle =====
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = true;
}

// ===== Modal Handler =====
function showModal(message, yesCallback) {
  const modal = document.getElementById("customModal");
  document.getElementById("modalMessage").textContent = message;

  document.getElementById("modalYes").onclick = () => {
    modal.style.display = "none";
    yesCallback();
  };

  document.getElementById("modalNo").onclick = () => {
    modal.style.display = "none";
  };

  modal.style.display = "flex";
}

// ===== Delete Chat =====
function deleteThread() {
  showModal("Delete this chat?", () => {
    const ref = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Chat deleted");
    });
  });
}

// ===== Export Chat (Stub) =====
function exportChat() {
  alert("Export coming soon!");
}

// ===== WebTorrent (P2P File Share) =====

function startTorrentClient() {
  if (!client) client = new WebTorrent();
}

// Send file to friend using magnet
function sendTorrentFile(file) {
  startTorrentClient();

  client.seed(file, torrent => {
    const magnet = torrent.magnetURI;
    document.getElementById("threadInput").value = `📎 Torrent: <a href="${magnet}" target="_blank">Download</a>`;
    sendThreadMessage();
  });
}

// Download magnet file
function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  client.add(magnetURI, torrent => {
    torrent.files.forEach(file => {
      file.getBlob((err, blob) => {
        if (err) return alert("Download failed");

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 100);
      });
    });
  });

  client.on('error', err => console.error("WebTorrent error:", err));
}

// Automatically parse incoming magnet links
function detectMagnetAndRender(text) {
  if (text.includes("magnet:?")) {
    const match = text.match(/magnet:\?[^"]+/);
    if (match) handleMagnetDownload(match[0]);
  }
}

function isFriend(uid) {
  return db.collection("users").doc(currentUser.uid)
    .collection("friends").doc(uid).get().then(doc => doc.exists);
}

function shareFileViaTorrent(type) {
  if (!client) client = new WebTorrent();

  const input = document.createElement("input");
  input.type = "file";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    client.seed(file, torrent => {
      const magnet = torrent.magnetURI;
      const msg = `📎 File: <a href="${magnet}" target="_blank">${file.name}</a>`;

      if (type === "dm" && currentThreadUser) {
        isFriend(currentThreadUser).then(ok => {
          if (!ok) return alert("❌ Only friends can share P2P files.");
          document.getElementById("threadInput").value = msg;
          sendThreadMessage();
        });
      } else if (type === "group" && currentRoom) {
        document.getElementById("groupMessageInput").value = msg;
        sendGroupMessage();
      } else {
        alert("⚠️ Sharing not allowed in this context.");
      }
    });
  };
  input.click();
}

function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  const torrent = client.add(magnetURI);

  torrent.on('ready', () => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error("Download error:", err);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      });
    });
  });

  torrent.on('error', err => console.error("Torrent error:", err));
}

function renderWithMagnetSupport(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const links = container.querySelectorAll("a[href^='magnet:']");
  links.forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      const confirmed = confirm(`Download file: ${link.textContent}?`);
      if (confirmed) autoDownloadMagnet(link.href);
    };
  });
}

// ===== Search Result Click: View Profile Modal =====
function viewUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileName").textContent = data.name || "";
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    currentThreadUser = uid;

    document.getElementById("viewProfileModal").style.display = "flex";
  });
}

// ===== Close Profile Modal =====
function closeProfileModal() {
  document.getElementById("viewProfileModal").style.display = "none";
}

// ===== Toggle Dark Theme Persistently =====
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");

  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = isDark;
}

// ===== Restore Theme on Load =====
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = true;
}

// ===== Inbox Filter/Search (optional) =====
function filterInbox(term) {
  const items = document.querySelectorAll("#inboxList .inbox-card");
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(term.toLowerCase()) ? "block" : "none";
  });
}

// ===== Toggle Room Dropdown to Chat =====
function selectGroupFromDropdown() {
  const dropdown = document.getElementById("roomDropdown");
  const groupId = dropdown.value;
  if (groupId) {
    joinRoom(groupId);
    switchTab("chatTab");
  }
}

// ===== Show Room ID (for invite manually) =====
function showRoomId() {
  if (!currentRoom) return;
  alert("Group ID:\n" + currentRoom);
}

// ===== Developer Badge & Trust Tagging =====
function applyDeveloperBadge(uid, usernameElement) {
  if (uid === "moneythepro") {
    const badge = document.createElement("span");
    badge.textContent = "🛠️ Developer";
    badge.className = "badge developer";
    usernameElement.appendChild(badge);
  }
}

// Called after search renders
function decorateUsernamesWithBadges() {
  const usernames = document.querySelectorAll(".search-username");
  usernames.forEach(el => {
    const username = el.textContent.replace("@", "").trim();
    if (username === "moneythepro") {
      const badge = document.createElement("span");
      badge.textContent = " 🛠️";
      badge.style.color = "#f39c12";
      el.appendChild(badge);
    }
  });
}

// ===== Group Ownership Transfer =====
function transferGroupOwnership(newOwnerId) {
  if (!currentRoom || !newOwnerId) return;
  db.collection("groups").doc(currentRoom).update({
    createdBy: newOwnerId,
    admins: firebase.firestore.FieldValue.arrayUnion(newOwnerId)
  }).then(() => {
    alert("Ownership transferred.");
    loadGroupInfo(currentRoom);
  });
}

// ===== Delete Group (Owner Only) =====
function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  db.collection("groups").doc(groupId).delete().then(() => {
    alert("Group deleted.");
    loadChatList();
  });
}

// ===== Report DM User (stub only) =====
function reportUser(uid) {
  showModal("Report this user?", () => {
    alert("Thank you for reporting. Our team will review.");
  });
}

// ===== Clear All Chat (DM only) =====
function clearThreadMessages() {
  const ref = db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages");

  showModal("Clear all messages?", () => {
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Messages cleared.");
    });
  });
}

// ===== Chat Scroll to Bottom Button =====
function scrollToBottom(divId) {
  const div = document.getElementById(divId);
  if (div) div.scrollTop = div.scrollHeight;
}

// ===== Emoji Picker (basic integration) =====
function insertEmoji(targetId, emoji) {
  const input = document.getElementById(targetId);
  if (input) input.value += emoji;
}

// ===== Copy Room ID =====
function copyRoomId() {
  if (!currentRoom) return;
  copyToClipboard(currentRoom);
  alert("Group ID copied!");
}

// ===== Helper to Show Toast (if not modal) =====
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ====== WebTorrent (P2P File Share) ======

// ✅ Only friends or group members can share
function isFriend(uid) {
  return db.collection("users").doc(currentUser.uid)
    .collection("friends").doc(uid).get().then(doc => doc.exists);
}

function shareFileViaTorrent(type) {
  if (!client) client = new WebTorrent();  // ✅ Lazy init

  const input = document.createElement("input");
  input.type = "file";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    client.seed(file, torrent => {
      const magnet = torrent.magnetURI;
      const msg = `📎 File: <a href="${magnet}" target="_blank">${file.name}</a>`;

      if (type === "dm" && currentThreadUser) {
        isFriend(currentThreadUser).then(ok => {
          if (!ok) return alert("❌ Only friends can share P2P files.");
          document.getElementById("threadInput").value = msg;
          sendThreadMessage();
        });
      } else if (type === "group" && currentRoom) {
        document.getElementById("groupMessageInput").value = msg;
        sendGroupMessage();
      } else {
        alert("⚠️ Sharing not allowed in this context.");
      }
    });
  };
  input.click();
}

// ✅ Auto download magnet link with confirmation
function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  const torrent = client.add(magnetURI);

  torrent.on('ready', () => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error("Download error:", err);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      });
    });
  });

  torrent.on('error', err => console.error("Torrent error:", err));
}

// ✅ Scan chat for magnet links and bind download
function renderWithMagnetSupport(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const links = container.querySelectorAll("a[href^='magnet:']");
  links.forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      const confirmed = confirm(`Download file: ${link.textContent}?`);
      if (confirmed) autoDownloadMagnet(link.href);
    };
  });
}
