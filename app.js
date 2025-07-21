/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 1: Firebase Auth + User Profiles
 * ========================================================= */

// ===== Firebase Initialization =====
const firebaseConfig = {
  apiKey: "AIzaSyAcUxoMaCV7H6CdT53KlxmQlY3nqBiLHb8",
  authDomain: "stringwaspv2.firebaseapp.com",
  projectId: "stringwaspv2",
  storageBucket: "stringwaspv2.firebasestorage.app",
  messagingSenderId: "691978301483",
  appId: "1:691978301483:web:a706a20155d7b2b506ba6e",
  measurementId: "G-FM5KK7D695"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===== Global State =====
let currentUser = null;   // Firebase auth user
let userProfile = null;   // { uid, username, avatar, bio }

// ===== Auth State Listener =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    console.log("✅ Logged in:", user.email);

    await loadUserProfile(user.uid);
    showMainUI(true);
  } else {
    currentUser = null;
    userProfile = null;
    showMainUI(false);
  }
});

// ===== Load User Profile =====
async function loadUserProfile(uid) {
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      userProfile = doc.data();
    } else {
      // New user → create default profile
      userProfile = {
        uid,
        username: currentUser.email.split("@")[0],
        avatar: "",
        bio: "Hey there! I'm using StringWasp."
      };
      await db.collection("users").doc(uid).set(userProfile);
    }
    updateProfileUI();
  } catch (err) {
    console.error("❌ Failed to load profile:", err);
  }
}

// ===== Update Profile UI =====
function updateProfileUI() {
  const usernameEl = document.getElementById("profileUsername");
  const bioEl = document.getElementById("profileBio");
  if (usernameEl && bioEl && userProfile) {
    usernameEl.textContent = userProfile.username;
    bioEl.textContent = userProfile.bio;
  }
}

// ===== Login / Register =====
async function loginUser(email, password) {
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast("✅ Login successful");
  } catch (err) {
    alert("❌ Login failed: " + err.message);
  }
}

async function registerUser(email, password, username) {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      uid: cred.user.uid,
      username: username || email.split("@")[0],
      avatar: "",
      bio: "Hey there! I'm using StringWasp."
    });
    showToast("✅ Account created");
  } catch (err) {
    alert("❌ Register failed: " + err.message);
  }
}

// ===== Logout =====
function logoutUser() {
  auth.signOut().then(() => showToast("👋 Logged out"));
}

// ===== UI Helpers =====
function showMainUI(isLoggedIn) {
  document.getElementById("authSection").style.display = isLoggedIn ? "none" : "block";
  document.getElementById("mainApp").style.display = isLoggedIn ? "block" : "none";
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 2: Inbox + User Search
 * ========================================================= */

// ===== Inbox (Friend Requests & Group Invites) =====

// Load inbox items
async function loadInbox() {
  if (!currentUser) return;
  const list = document.getElementById("inboxList");
  list.innerHTML = "<p>Loading...</p>";

  try {
    const snap = await db.collection("inbox")
      .doc(currentUser.uid)
      .collection("items")
      .orderBy("timestamp", "desc")
      .get();

    list.innerHTML = "";
    if (snap.empty) {
      list.innerHTML = "<p>No notifications.</p>";
      return;
    }

    snap.forEach(doc => {
      const item = doc.data();
      const card = renderInboxCard(item, doc.id);
      list.appendChild(card);
    });
  } catch (err) {
    console.error("❌ Inbox load failed:", err);
    list.innerHTML = "<p>Error loading inbox.</p>";
  }
}

// Render inbox card
function renderInboxCard(item, id) {
  const div = document.createElement("div");
  div.className = "inbox-card";
  div.innerHTML = `
    <div class="inbox-info">
      <strong>${escapeHtml(item.fromName || "Unknown")}</strong>
      <span>${item.type === "friend" ? "sent you a friend request" : "invited you to a group"}</span>
    </div>
    <div class="inbox-actions">
      <button onclick="acceptInboxItem('${id}', '${item.type}', '${item.from}')">Accept</button>
      <button onclick="declineInboxItem('${id}')">Decline</button>
    </div>
  `;
  return div;
}

// Accept inbox item
async function acceptInboxItem(id, type, from) {
  if (!currentUser) return;
  try {
    if (type === "friend") {
      await addFriend(from);
    } else if (type === "group") {
      await joinGroup(from);
    }
    await deleteInboxItem(id);
    showToast("✅ Accepted");
    loadInbox();
  } catch (err) {
    console.error("❌ Accept failed:", err);
  }
}

// Decline inbox item
async function declineInboxItem(id) {
  if (!currentUser) return;
  try {
    await deleteInboxItem(id);
    showToast("❌ Declined");
    loadInbox();
  } catch (err) {
    console.error("❌ Decline failed:", err);
  }
}

// Delete inbox item
async function deleteInboxItem(id) {
  await db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

// Send friend request
async function sendFriendRequest(toUid, fromName) {
  try {
    await db.collection("inbox").doc(toUid).collection("items").add({
      type: "friend",
      from: currentUser.uid,
      fromName: fromName || userProfile.username,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    showToast("📩 Friend request sent!");
  } catch (err) {
    console.error("❌ Friend request failed:", err);
  }
}

// ===== User Search =====
async function searchUsers(term) {
  const resultsEl = document.getElementById("searchResults");
  resultsEl.innerHTML = "<p>Searching...</p>";
  if (!term) {
    resultsEl.innerHTML = "";
    return;
  }

  try {
    const snap = await db.collection("users")
      .where("username", ">=", term)
      .where("username", "<=", term + "\uf8ff")
      .get();

    resultsEl.innerHTML = "";
    if (snap.empty) {
      resultsEl.innerHTML = "<p>No users found.</p>";
      return;
    }

    snap.forEach(doc => {
      if (doc.id === currentUser.uid) return; // Skip self
      const user = doc.data();
      const item = document.createElement("div");
      item.className = "search-card";
      item.innerHTML = `
        <span class="search-username">@${escapeHtml(user.username)}</span>
        <button onclick="sendFriendRequest('${doc.id}', '${escapeHtml(user.username)}')">Add</button>
      `;
      resultsEl.appendChild(item);
    });
  } catch (err) {
    console.error("❌ Search failed:", err);
    resultsEl.innerHTML = "<p>Error searching users.</p>";
  }
}

// ===== Bind Search Input =====
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => searchUsers(searchInput.value.trim().toLowerCase()));
  }
});

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 3: P2P Messaging (WebRTC)
 * ========================================================= */

let peerConnections = {};  // { uid: RTCPeerConnection }
let dataChannels = {};     // { uid: RTCDataChannel }
let ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

/* ===== IndexedDB (Local History) ===== */
let dbLocal;

function initIndexedDB() {
  const request = indexedDB.open("StringWaspDB", 1);
  request.onupgradeneeded = e => {
    dbLocal = e.target.result;
    dbLocal.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
  };
  request.onsuccess = e => dbLocal = e.target.result;
  request.onerror = e => console.error("❌ IndexedDB error:", e);
}

function saveLocalMessage(threadId, msg) {
  if (!dbLocal) return;
  const tx = dbLocal.transaction("messages", "readwrite");
  tx.objectStore("messages").add({ threadId, ...msg });
}

function loadLocalMessages(threadId, callback) {
  if (!dbLocal) return;
  const tx = dbLocal.transaction("messages", "readonly");
  const store = tx.objectStore("messages");
  const req = store.openCursor();
  const messages = [];
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.value.threadId === threadId) messages.push(cursor.value);
      cursor.continue();
    } else callback(messages);
  };
}

/* ===== WebRTC Setup ===== */
async function createPeer(uid) {
  if (peerConnections[uid]) return peerConnections[uid];

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = e => {
    if (e.candidate) sendSignaling(uid, { type: "ice", candidate: e.candidate });
  };

  pc.ondatachannel = e => {
    const channel = e.channel;
    setupDataChannel(uid, channel);
  };

  peerConnections[uid] = pc;
  return pc;
}

function setupDataChannel(uid, channel) {
  dataChannels[uid] = channel;
  channel.onmessage = e => handleIncomingMessage(uid, e.data);
}

async function createOfferForUser(uid) {
  const pc = await createPeer(uid);
  const channel = pc.createDataChannel("chat");
  setupDataChannel(uid, channel);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignaling(uid, { type: "offer", sdp: offer });
}

async function handleOffer(uid, sdp) {
  const pc = await createPeer(uid);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  sendSignaling(uid, { type: "answer", sdp: answer });
}

async function handleAnswer(uid, sdp) {
  const pc = await createPeer(uid);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIceCandidate(uid, candidate) {
  const pc = await createPeer(uid);
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

/* ===== Signaling (via Firebase) ===== */
async function sendSignaling(toUid, data) {
  // Minimal signaling channel
  await db.collection("signals").doc(toUid).collection("msgs").add({
    from: currentUser.uid,
    data,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function listenForSignals() {
  if (!currentUser) return;
  db.collection("signals").doc(currentUser.uid).collection("msgs")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const { from, data } = doc.data();
        if (data.type === "offer") handleOffer(from, data.sdp);
        else if (data.type === "answer") handleAnswer(from, data.sdp);
        else if (data.type === "ice") handleIceCandidate(from, data.candidate);

        doc.ref.delete(); // Remove processed signals
      });
    });
}

/* ===== Sending Messages ===== */
function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;

  const msg = {
    from: currentUser.uid,
    text,
    timestamp: Date.now()
  };

  if (dataChannels[currentThreadUser] && dataChannels[currentThreadUser].readyState === "open") {
    dataChannels[currentThreadUser].send(JSON.stringify(msg));
  }

  renderMessage(msg, true);
  saveLocalMessage(currentThreadUser, msg);
  input.value = "";
}

/* ===== Receiving Messages ===== */
function handleIncomingMessage(uid, raw) {
  try {
    const msg = JSON.parse(raw);
    renderMessage(msg, false);
    saveLocalMessage(uid, msg);
  } catch (err) {
    console.error("❌ Invalid message:", err);
  }
}

function renderMessage(msg, isOwn) {
  const container = document.getElementById("threadMessages");
  const div = document.createElement("div");
  div.className = isOwn ? "msg-bubble own" : "msg-bubble";
  div.innerHTML = `<span>${escapeHtml(msg.text)}</span>`;
  container.appendChild(div);
  scrollToBottom("threadMessages");
}

/* ===== Open Thread (DM) ===== */
function openThread(uid, username) {
  if (!uid || !currentUser) return;
  currentThreadUser = uid;
  switchTab("threadView");
  document.getElementById("chatName").textContent = username || "Chat";

  // Create or connect P2P channel
  createOfferForUser(uid);

  // Load local messages
  loadLocalMessages(uid, msgs => {
    const container = document.getElementById("threadMessages");
    container.innerHTML = "";
    msgs.sort((a, b) => a.timestamp - b.timestamp).forEach(m => renderMessage(m, m.from === currentUser.uid));
  });
}

document.addEventListener("DOMContentLoaded", initIndexedDB);

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 4: Group Chat (P2P Mesh)
 * ========================================================= */

let currentRoom = null;
let groupMembers = [];        // UIDs of current group members
let groupDataChannels = {};   // { memberUid: RTCDataChannel }

/* ===== Local Group Message Storage ===== */
function saveGroupMessage(groupId, msg) {
  if (!dbLocal) return;
  const tx = dbLocal.transaction("messages", "readwrite");
  tx.objectStore("messages").add({ threadId: `group_${groupId}`, ...msg });
}

function loadGroupMessages(groupId, callback) {
  if (!dbLocal) return;
  const tx = dbLocal.transaction("messages", "readonly");
  const store = tx.objectStore("messages");
  const req = store.openCursor();
  const messages = [];
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.value.threadId === `group_${groupId}`) messages.push(cursor.value);
      cursor.continue();
    } else callback(messages);
  };
}

/* ===== Group Messaging ===== */
function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input.value.trim();
  if (!text || !currentRoom) return;

  const msg = {
    from: currentUser.uid,
    text,
    timestamp: Date.now()
  };

  // Send to all peers
  Object.values(groupDataChannels).forEach(channel => {
    if (channel.readyState === "open") {
      channel.send(JSON.stringify(msg));
    }
  });

  renderGroupMessage(msg, true);
  saveGroupMessage(currentRoom, msg);
  input.value = "";
}

function handleIncomingGroupMessage(fromUid, raw) {
  try {
    const msg = JSON.parse(raw);
    renderGroupMessage(msg, false);
    saveGroupMessage(currentRoom, msg);
  } catch (err) {
    console.error("❌ Invalid group message:", err);
  }
}

function renderGroupMessage(msg, isOwn) {
  const container = document.getElementById("groupMessages");
  const div = document.createElement("div");
  div.className = isOwn ? "msg-bubble own" : "msg-bubble";
  div.innerHTML = `<span>${escapeHtml(msg.text)}</span>`;
  container.appendChild(div);
  scrollToBottom("groupMessages");
}

/* ===== Group P2P Connections ===== */
async function connectToGroupMembers(members) {
  groupMembers = members.filter(uid => uid !== currentUser.uid);
  groupDataChannels = {};

  for (const uid of groupMembers) {
    const pc = await createPeer(uid);

    // Create data channel for group messages
    const channel = pc.createDataChannel("group_chat");
    channel.onmessage = e => handleIncomingGroupMessage(uid, e.data);
    groupDataChannels[uid] = channel;

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignaling(uid, { type: "offer", sdp: offer, group: currentRoom });
  }
}

function joinRoom(groupId) {
  if (!groupId || !currentUser) return;
  switchTab("groupView");

  currentRoom = groupId;
  currentThreadUser = null;

  document.getElementById("roomTitle").textContent = "Group Chat";

  // Fetch members from Firebase
  db.collection("groups").doc(groupId).get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      const members = data.members || [];
      connectToGroupMembers(members);
    }
  });

  // Load local history
  loadGroupMessages(groupId, msgs => {
    const container = document.getElementById("groupMessages");
    container.innerHTML = "";
    msgs.sort((a, b) => a.timestamp - b.timestamp)
        .forEach(m => renderGroupMessage(m, m.from === currentUser.uid));
  });
}

/* ===== Group Admin Tools ===== */
function inviteToGroup(uid) {
  if (!currentRoom) return alert("❌ No group selected.");
  db.collection("inbox").doc(uid).collection("items").add({
    type: "group",
    from: currentRoom,
    fromName: "Group Invite",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => {
    alert("✅ Group invite sent!");
  }).catch(err => {
    console.error("❌ Failed to send invite:", err.message);
    alert("❌ Could not send invite.");
  });
}

function removeMemberFromGroup(uid) {
  if (!currentRoom) return;
  db.collection("groups").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayRemove(uid)
  }).then(() => {
    alert("Member removed.");
    loadGroupInfo(currentRoom);
  });
}

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

function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  db.collection("groups").doc(groupId).delete().then(() => {
    alert("Group deleted.");
    loadChatList();
  });
}

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 5: Search, Inbox, Profiles
 * ========================================================= */

/* ===== User & Group Search ===== */
function searchUsers(term) {
  if (!term) return;
  db.collection("users")
    .where("username", ">=", term)
    .where("username", "<=", term + "\uf8ff")
    .limit(10)
    .get()
    .then(snapshot => {
      const container = document.getElementById("userSearchResults");
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <span class="search-username">@${escapeHtml(data.username)}</span>
          <button onclick="openThread('${doc.id}', '${escapeHtml(data.username)}')">Chat</button>
          <button onclick="sendFriendRequest('${doc.id}')">Add</button>
        `;
        container.appendChild(div);
      });
      decorateUsernamesWithBadges();
    })
    .catch(err => console.error("❌ User search failed:", err));
}

function searchGroups(term) {
  if (!term) return;
  db.collection("groups")
    .where("name", ">=", term)
    .where("name", "<=", term + "\uf8ff")
    .limit(10)
    .get()
    .then(snapshot => {
      const container = document.getElementById("groupSearchResults");
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <span class="search-group">${escapeHtml(data.name)}</span>
          <button onclick="joinRoom('${doc.id}')">Join</button>
        `;
        container.appendChild(div);
      });
    })
    .catch(err => console.error("❌ Group search failed:", err));
}

/* ===== Inbox System ===== */
function loadInbox() {
  const container = document.getElementById("inboxList");
  container.innerHTML = "<p>Loading...</p>";
  db.collection("inbox").doc(currentUser.uid).collection("items")
    .orderBy("timestamp", "desc")
    .get()
    .then(snapshot => {
      container.innerHTML = "";
      if (snapshot.empty) {
        container.innerHTML = "<p>No notifications.</p>";
      }
      snapshot.forEach(doc => {
        const item = doc.data();
        const card = document.createElement("div");
        card.className = "inbox-card";
        card.innerHTML = `
          <div class="inbox-text">${escapeHtml(item.fromName || "User")}: ${escapeHtml(item.type || "")}</div>
          ${item.type === "friend" ? `
            <button onclick="acceptFriend('${doc.id}')">Accept</button>
            <button onclick="declineFriend('${doc.id}')">Decline</button>
          ` : item.type === "group" ? `
            <button onclick="acceptGroupInvite('${doc.id}')">Join</button>
            <button onclick="declineGroupInvite('${doc.id}')">Ignore</button>
          ` : ""}
        `;
        container.appendChild(card);
      });
    });
}

function sendFriendRequest(uid) {
  db.collection("inbox").doc(uid).collection("items").add({
    type: "friend",
    from: currentUser.uid,
    fromName: currentUser.displayName || "User",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => showToast("✅ Friend request sent!"))
    .catch(err => console.error("❌ Friend request failed:", err));
}

function acceptFriend(requestId) {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items").doc(requestId);
  ref.get().then(doc => {
    if (!doc.exists) return;
    const from = doc.data().from;
    db.collection("users").doc(currentUser.uid).collection("friends").doc(from).set({ uid: from });
    db.collection("users").doc(from).collection("friends").doc(currentUser.uid).set({ uid: currentUser.uid });
    ref.delete();
    showToast("🤝 Friend added!");
    loadInbox();
  });
}

function declineFriend(requestId) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(requestId).delete()
    .then(() => {
      showToast("❌ Friend request declined.");
      loadInbox();
    });
}

function acceptGroupInvite(requestId) {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items").doc(requestId);
  ref.get().then(doc => {
    if (!doc.exists) return;
    const groupId = doc.data().from;
    db.collection("groups").doc(groupId).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    }).then(() => {
      ref.delete();
      showToast("✅ Joined group!");
      loadInbox();
    });
  });
}

function declineGroupInvite(requestId) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(requestId).delete()
    .then(() => {
      showToast("❌ Group invite ignored.");
      loadInbox();
    });
}

/* ===== Profile View ===== */
function viewProfile(uid) {
  const modal = document.getElementById("viewProfileModal");
  const nameEl = document.getElementById("profileName");
  const bioEl = document.getElementById("profileBio");
  const avatarEl = document.getElementById("profileAvatar");

  db.collection("users").doc(uid).get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      nameEl.textContent = usernameWithBadge(uid, data.username);
      bioEl.textContent = escapeHtml(data.bio || "No bio set.");
      avatarEl.src = data.avatar || "default-avatar.png";
      modal.style.display = "block";
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  });
}

function closeProfileModal() {
  document.getElementById("viewProfileModal").style.display = "none";
}
/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 6: UI Helpers + Thread Enhancements + Badge System
 * ========================================================= */

/* ===== Theme & UI Helpers ===== */
function toggleTheme() {
  const toggle = document.getElementById("darkModeToggle");
  const isDark = toggle && toggle.checked;
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.classList.add("dark");
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) toggle.checked = true;
  }
});

/* Toast Notification */
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("visible"), 10);
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* Scroll Helper */
function scrollToBottom(divId) {
  const div = document.getElementById(divId);
  if (div) div.scrollTop = div.scrollHeight;
}

/* ===== Thread View Enhancements ===== */
(function() {
  const THREAD_VIEW_ID     = "threadView";
  const THREAD_MSGS_ID     = "threadMessages";
  const THREAD_INPUT_ID    = "threadInput";
  const THREAD_SEND_BTN_ID = "sendButton";
  const KEYBOARD_THRESHOLD = 150;

  let initialHeight = window.innerHeight;

  function adjustThreadLayout() {
    const threadView = document.getElementById(THREAD_VIEW_ID);
    if (!threadView) return;
    const vh = window.visualViewport?.height || window.innerHeight;
    threadView.style.height = vh + "px";
  }

  function scrollToBottomThread(smooth = true) {
    const msgs = document.getElementById(THREAD_MSGS_ID);
    if (!msgs) return;
    const scrollTarget = msgs.closest(".chat-scroll-area") || msgs;
    scrollTarget.scrollTo({
      top: scrollTarget.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  }

  function focusThreadInput() {
    const input = document.getElementById(THREAD_INPUT_ID);
    if (input) input.focus({ preventScroll: false });
  }

  function handleThreadKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (typeof sendThreadMessage === "function") sendThreadMessage();
    }
  }

  // Auto-resize input
  function autoResizeInput(input) {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }

  function detectKeyboardResize() {
    const isKeyboardOpen = window.innerHeight < initialHeight - KEYBOARD_THRESHOLD;
    document.body.classList.toggle("keyboard-open", isKeyboardOpen);
    if (isKeyboardOpen) {
      setTimeout(() => scrollToBottomThread(true), 100);
    }
  }

  let resizeRAF = null;
  function viewportChanged() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      detectKeyboardResize();
      adjustThreadLayout();
      const input = document.getElementById(THREAD_INPUT_ID);
      if (document.activeElement === input) {
        setTimeout(() => scrollToBottomThread(true), 150);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    adjustThreadLayout();
    const input = document.getElementById(THREAD_INPUT_ID);
    if (input) {
      input.addEventListener("keydown", handleThreadKey);
      input.addEventListener("input", () => autoResizeInput(input));
      input.addEventListener("focus", () => {
        setTimeout(() => {
          adjustThreadLayout();
          scrollToBottomThread(true);
        }, 100);
      });
      autoResizeInput(input);
    }

    window.addEventListener("resize", viewportChanged);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", viewportChanged);
      window.visualViewport.addEventListener("scroll", viewportChanged);
    }
  });

  // Expose globally
  window.adjustThreadLayout   = adjustThreadLayout;
  window.scrollToBottomThread = scrollToBottomThread;
  window.focusThreadInput     = focusThreadInput;
  window.handleThreadKey      = handleThreadKey;
})();

/* ===== Developer Badge (Extended) ===== */
const DEV_UIDS = []; // Add any verified UIDs here

function usernameWithBadge(uidOrName, maybeName) {
  let uid = uidOrName;
  let name = maybeName;
  if (typeof maybeName === "undefined") {
    name = uidOrName;
    uid = "";
  }

  const safe = escapeHtml(name || "User");
  const isDev = safe.toLowerCase() === "moneythepro" || DEV_UIDS.includes(uid);
  return isDev ? `${safe} <i data-lucide="badge-check" class="dev-badge"></i>` : safe;
}

function applyDeveloperBadge(usernameElement, username) {
  if (!usernameElement || !username) return;
  if (username.trim().toLowerCase() === "moneythepro") {
    if (!usernameElement.querySelector(".dev-badge")) {
      const badge = document.createElement("i");
      badge.setAttribute("data-lucide", "badge-check");
      badge.className = "dev-badge";
      usernameElement.appendChild(badge);
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  }
}

function decorateUsernamesWithBadges() {
  document.querySelectorAll(
    ".search-username, .username-display, .chat-username, .message-username"
  ).forEach(el => {
    const raw = el.textContent.replace("@", "").trim();
    if (raw.toLowerCase() === "moneythepro") {
      applyDeveloperBadge(el, raw);
    }
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", decorateUsernamesWithBadges);

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 7: Group Management + Inbox + Final Utilities
 * ========================================================= */

/* ===== Inbox Filters ===== */
function filterInbox(term) {
  const items = document.querySelectorAll("#inboxList .inbox-card");
  const lower = term.toLowerCase();
  items.forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(lower)
      ? "block"
      : "none";
  });
}

/* ===== Group Dropdown Helpers ===== */
function selectGroupFromDropdown() {
  const dropdown = document.getElementById("roomDropdown");
  const groupId = dropdown ? dropdown.value : "";
  if (groupId) {
    joinRoom(groupId);
    switchTab("chatTab");
  }
}

function showRoomId() {
  if (!currentRoom) return;
  alert("Group ID:\n" + currentRoom);
}

function copyRoomId() {
  if (!currentRoom) return;
  navigator.clipboard.writeText(currentRoom).then(() => {
    showToast("Group ID copied!");
  }).catch(err => console.error("Clipboard error:", err));
}

/* ===== Group Controls (Admin) ===== */
function transferGroupOwnership(newOwnerId) {
  if (!currentRoom || !newOwnerId) return;
  db.collection("groups").doc(currentRoom).update({
    createdBy: newOwnerId,
    admins: firebase.firestore.FieldValue.arrayUnion(newOwnerId)
  }).then(() => {
    alert("Ownership transferred.");
    loadGroupInfo(currentRoom);
  }).catch(err => console.error("Ownership transfer error:", err));
}

function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  db.collection("groups").doc(groupId).delete()
    .then(() => {
      alert("Group deleted.");
      loadChatList();
    })
    .catch(err => console.error("Delete group error:", err));
}

function inviteToGroup(uid) {
  if (!currentGroupProfileId) return alert("❌ No group selected.");
  db.collection("inbox").doc(uid).collection("items").add({
    type: "group",
    from: currentGroupProfileId,
    fromName: "Group Invite",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => {
    showToast("✅ Group invite sent!");
  }).catch(err => {
    console.error("❌ Failed to send invite:", err.message);
    alert("❌ Could not send invite.");
  });
}

/* ===== User Moderation ===== */
function reportUser(uid) {
  showModal("Report this user?", () => {
    alert("Thank you for reporting. Our team will review.");
  });
}

function clearThreadMessages() {
  if (!currentThreadUser || !currentUser) return;
  const ref = db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages");

  showModal("Clear all messages?", () => {
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Messages cleared.");
    }).catch(err => console.error("Clear messages error:", err));
  });
}

/* ===== Utilities ===== */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ===== Modal Helper ===== */
function showModal(message, onConfirm) {
  const modal = document.getElementById("customModal");
  const modalYes = document.getElementById("modalYes");
  const modalNo = document.getElementById("modalNo");
  const modalMessage = document.getElementById("modalMessage");

  if (!modal || !modalYes || !modalNo || !modalMessage) {
    if (confirm(message)) onConfirm();
    return;
  }

  modalMessage.textContent = message;
  modal.style.display = "block";

  modalYes.onclick = () => {
    modal.style.display = "none";
    onConfirm();
  };
  modalNo.onclick = () => modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("customModal");
  const modalNo = document.getElementById("modalNo");
  if (modal && modalNo) {
    modalNo.onclick = () => modal.style.display = "none";
  }
});