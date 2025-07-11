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
const client = new WebTorrent();

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
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");

  loadInbox();
  loadFriends();
  loadProfile();
  loadGroups?.();
  loadChatList();
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
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profileUsername").value = data.username || "";
    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
    document.getElementById("usernameDisplay").textContent = data.username || "";
  });
}

// ===== Upload Profile Picture =====
document.getElementById("profilePic").addEventListener("change", uploadProfilePic);

function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const ref = storage.ref().child(`avatars/${currentUser.uid}`);
  showLoading(true);

  ref.put(file).then(snapshot => snapshot.ref.getDownloadURL())
    .then(url => db.collection("users").doc(currentUser.uid).update({ photoURL: url }))
    .then(() => {
      document.getElementById("profilePicPreview").src = URL.createObjectURL(file);
      alert("✅ Profile picture updated!");
    }).catch(err => {
      console.error("Upload error:", err);
      alert("Failed to upload profile picture.");
    }).finally(() => showLoading(false));
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

        const textDiv = document.createElement("div");
        textDiv.textContent = `${msg.fromName || "User"}: ${decrypted}`;
        bubble.appendChild(textDiv);
        area.appendChild(bubble);
      });

      area.scrollTop = area.scrollHeight;
      renderWithMagnetSupport("threadMessages");
    });
}

// ===== DM: Send Thread Message with AES Encryption =====
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

  threadRef.collection("messages").add(messageData).then(() => {
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

  db.collection("groups").where("name", ">=", input).limit(10).get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `
        <img src="${data.icon || 'group-icon.png'}" class="search-avatar" />
        <div class="search-username">${data.name}</div>
        <button onclick="joinGroupById('${doc.id}')">Join</button>
      `;
      groupResults.appendChild(div);
    });
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
let client = null;

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
function handleMagnetDownload(magnetURI) {
  startTorrentClient();

  client.add(magnetURI, torrent => {
    torrent.files.forEach(file => {
      file.getBlob((err, blob) => {
        if (err) return alert("Download failed");

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
      });
    });
  });
}

// Automatically parse incoming magnet links
function detectMagnetAndRender(text) {
  if (text.includes("magnet:?")) {
    const match = text.match(/magnet:\?[^"]+/);
    if (match) handleMagnetDownload(match[0]);
  }
}

// ===== Search Result Click: View Profile Modal =====
function viewUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileName").textContent = data.name || "";
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileAvatar").src = data.photoURL || "default-avatar.png";
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

// ====== WebTorrent Setup ======

// ✅ Only friends or group members can share
function isFriend(uid) {
  return db.collection("users").doc(currentUser.uid)
    .collection("friends").doc(uid).get().then(doc => doc.exists);
}

function shareFileViaTorrent(type) {
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
          if (!ok) return alert("Only friends can share P2P files.");
          document.getElementById("threadInput").value = msg;
          sendThreadMessage();
        });
      } else if (type === "group" && currentRoom) {
        document.getElementById("groupMessageInput").value = msg;
        sendGroupMessage();
      } else {
        alert("Sharing not allowed in this context.");
      }
    });
  };
  input.click();
}

// ====== Download Magnet Link File (Auto trigger) ======
function autoDownloadMagnet(magnetURI) {
  client.add(magnetURI, torrent => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error("Download error:", err);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
      });
    });
  });
}

// ====== Detect & Replace Magnet Link in Messages ======
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
