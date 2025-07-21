/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 1: Firebase Auth + User Profiles
 * ========================================================= */

// ===== Global State =====
let currentUser = null;   // Firebase auth user
let userProfile = null;   // { uid, username, avatar, bio }

// ===== Auth State Listener =====
// Prevent duplicate registration if scripts load twice
if (!window.__SW_AUTH_LISTENER__) {
  window.__SW_AUTH_LISTENER__ = true;
  auth.onAuthStateChanged(handleAuthState);
}

async function handleAuthState(user) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";

  // Simple debug marker so we know how many times this fires
  console.error("Error:", error?.message || JSON.stringify(error) || error);
  if (user) {
    currentUser = user;
    try {
      await loadUserProfile(user.uid);
    } catch (err) {
      console.error("Error:", error?.message || JSON.stringify(error) || error);
    }
    showMainUI(true);
  } else {
    currentUser = null;
    userProfile = null;
    showMainUI(false);
  }
}

function switchTab(tabId) {
  // Hide all tabs
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => tab.style.display = "none");

  // Show the selected tab
  const target = document.getElementById(tabId);
  if (target) {
    target.style.display = "block";
  } else {
    console.warn(`⚠ switchTab: No tab with ID '${tabId}'`);
  }

  // Update active tab button styling
  const tabButtons = document.querySelectorAll(".tabs button");
  tabButtons.forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`#tab-${tabId.replace("Tab", "").toLowerCase()}`);
  if (activeBtn) activeBtn.classList.add("active");
}
// ===== Load User Profile =====
async function loadUserProfile(uid) {
  console.log("[DEBUG] Loading profile for UID:", uid);
  try {
    const doc = await db.collection("users").doc(uid).get();
    console.log("[DEBUG] Profile doc exists:", doc.exists);

    if (doc.exists) {
      userProfile = doc.data();
      console.log("[DEBUG] Profile data:", userProfile);
    } else {
      // New user → create default profile
      userProfile = {
        uid,
        username: currentUser?.email?.split("@")[0] || "User",
        avatar: "",
        bio: "Hey there! I'm using StringWasp."
      };
      await db.collection("users").doc(uid).set(userProfile);
      console.log("[DEBUG] Default profile created:", userProfile);
    }

    updateProfileUI();
    console.log("Profile loaded!");
  } catch (err) {
    console.error("❌ Failed to load profile:", err?.message || err);
    throw err; // Let global error listener catch it
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
/* =========================================================
 * INBOX SYSTEM – CLEAN FIXED VERSION
 * ========================================================= */

// Load inbox items
// Load Inbox Items
async function loadInbox() {
  if (!currentUser) return;
  const list = document.getElementById("inboxList");
  list.innerHTML = "<p>Loading...</p>";

  try {
    const itemsRef = db
      .collection("inbox")
      .doc(currentUser.uid)
      .collection("items")
      .orderBy("timestamp", "desc");

    // Mark all unread items as read
    const unreadSnap = await itemsRef.where("read", "==", false).get();
    const batch = db.batch();
    unreadSnap.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();

    const snap = await itemsRef.get();
    list.innerHTML = "";

    if (snap.empty) {
      list.innerHTML = "<p>No notifications.</p>";
      updateInboxBadge();
      return;
    }

    snap.forEach(doc => {
      const item = doc.data();
      const card = renderInboxCard(item, doc.id);
      list.appendChild(card);
    });

    // Update badge count
    updateInboxBadge();
  } catch (err) {
    console.error("❌ Inbox load failed:", err);
    list.innerHTML = "<p>Error loading inbox.</p>";
  }
}

// Render inbox card
function renderInboxCard(item, id) {
  const displayName = typeof item.fromName === "string" ? item.fromName : "Unknown";

  const div = document.createElement("div");
  div.className = "inbox-card";
  div.innerHTML = `
    <div class="inbox-info">
      <strong>${escapeHtml(displayName)}</strong>
      <span>${
        item.type === "friend"
          ? "sent you a friend request"
          : "invited you to a group"
      }</span>
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
  await db
    .collection("inbox")
    .doc(currentUser.uid)
    .collection("items")
    .doc(id)
    .delete();
}

// Send friend request
async function sendFriendRequest(toUid, fromName) {
  try {
    const name = fromName || userProfile?.username || currentUser?.email || "Unknown";

    await db.collection("inbox").doc(toUid).collection("items").add({
      type: "friend",
      from: currentUser.uid,
      fromName: String(name), // Always a string
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    showToast("📩 Friend request sent!");
  } catch (err) {
    console.error("❌ Friend request failed:", err);
  }
}

// Update Inbox badge count
async function updateInboxBadge() {
  if (!currentUser) return;
  try {
    const snap = await db
      .collection("inbox")
      .doc(currentUser.uid)
      .collection("items")
      .where("read", "==", false)
      .get();

    const badge = document.getElementById("inboxBadge");
    if (!snap.empty) {
      badge.textContent = snap.size;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch (err) {
    console.error("❌ Failed to update inbox badge:", err);
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
 * Part 3A: P2P Core + IndexedDB + Signaling + Direct Chat
 * =========================================================
 * Requires (already defined elsewhere):
 *   - currentUser, userProfile
 *   - escapeHtml(), usernameWithBadge(), scrollToBottom(), switchTab()
 *   - fetchUserProfile(), decorateUsernamesWithBadges()
 * ======================================================= */

/* ---------------- Globals ---------------- */
let peerConnections      = {}; // { uid: RTCPeerConnection } DM
let groupPeerConnections = {}; // { uid: RTCPeerConnection } Groups (used in Part 3B)
let groupDataChannels    = {}; // { uid: RTCDataChannel }   Groups (used in Part 3B)



/* Local IndexedDB handle */
let dbLocal = null;

/* ---------------- IndexedDB Setup ---------------- */
function initIndexedDB() {
  const request = indexedDB.open("StringWaspDB", 1);
  request.onupgradeneeded = e => {
    dbLocal = e.target.result;
    if (!dbLocal.objectStoreNames.contains("messages")) {
      dbLocal.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
    }
  };
  request.onsuccess = e => { dbLocal = e.target.result; };
  request.onerror  = e => console.error("❌ IndexedDB error:", e);
}
document.addEventListener("DOMContentLoaded", initIndexedDB);

/* ---------------- Local Save / Load ---------------- */
function saveLocalMessage(threadKey, msg) {
  if (!dbLocal) return;
  const tx = dbLocal.transaction("messages", "readwrite");
  tx.objectStore("messages").add({ threadKey, ...msg });
}

function loadLocalMessages(threadKey, callback) {
  if (!dbLocal) { callback([]); return; }
  const tx = dbLocal.transaction("messages", "readonly");
  const store = tx.objectStore("messages");
  const req = store.openCursor();
  const out = [];
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.value.threadKey === threadKey) out.push(cursor.value);
      cursor.continue();
    } else {
      callback(out);
    }
  };
  req.onerror = () => callback(out);
}

/* Helpers to derive thread keys */
function dmThreadKey(uidA, uidB) {
  return ["dm", uidA, uidB].sort().join("_");
}
function groupThreadKey(groupId) {
  return `group_${groupId}`;
}

/* =========================================================
 * WebRTC Peer Creation
 * ======================================================= */
async function getOrCreatePeer(uid, isGroup = false) {
  const map = isGroup ? groupPeerConnections : peerConnections;
  if (map[uid]) return map[uid];

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  map[uid] = pc;

  // ICE → Firestore signaling
  pc.onicecandidate = e => {
    if (e.candidate) {
      sendSignaling(uid, {
        type: "ice",
        candidate: e.candidate,
        ...(isGroup ? { group: currentRoom || true } : {})
      });
    }
  };

  // Remote channel
  pc.ondatachannel = e => {
    if (isGroup) {
      setupGroupDataChannel(uid, e.channel); // defined in Part 3B
    } else {
      setupDMDataChannel(uid, e.channel);
    }
  };

  return pc;
}

/* ---------------- DM DataChannel ---------------- */
function setupDMDataChannel(uid, channel) {
  dataChannels[uid] = channel;
  channel.onopen    = () => console.log(`📡 DM channel OPEN with ${uid}`);
  channel.onclose   = () => console.log(`❌ DM channel CLOSED with ${uid}`);
  channel.onerror   = err => console.error(`⚠ DM channel error (${uid}):`, err);
  channel.onmessage = e   => handleIncomingDM(uid, e.data);
}

/* =========================================================
 * Signaling (Firestore)
 * ======================================================= */
/*
signals/{targetUid}/msgs/{autoId}:
  {
    from,
    data: { type:'offer'|'answer'|'ice', sdp?|candidate?, group? },
    timestamp
  }
*/
async function sendSignaling(targetUid, data) {
  if (!currentUser) return;
  await db.collection("signals")
    .doc(targetUid)
    .collection("msgs")
    .add({
      from: currentUser.uid,
      data,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

let _signalsUnsub = null;
function listenForSignals() {
  if (!currentUser) return;
  if (_signalsUnsub) _signalsUnsub(); // rebind

  _signalsUnsub = db.collection("signals")
    .doc(currentUser.uid)
    .collection("msgs")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const { from, data } = change.doc.data() || {};
        if (!from || !data) return;

        if (data.type === "offer") {
          data.group ? handleGroupOffer(from, data.sdp, data.group)
                     : handleDMOffer(from, data.sdp);
        } else if (data.type === "answer") {
          data.group ? handleGroupAnswer(from, data.sdp, data.group)
                     : handleDMAnswer(from, data.sdp);
        } else if (data.type === "ice") {
          data.group ? handleGroupIce(from, data.candidate, data.group)
                     : handleDMIce(from, data.candidate);
        }

        // done
        change.doc.ref.delete().catch(()=>{});
      });
    }, err => {
      console.error("❌ Signal listener error:", err);
    });
}

/* =========================================================
 * DM SDP / ICE Handlers
 * ======================================================= */
async function createDMOffer(uid) {
  const pc = await getOrCreatePeer(uid, false);
  if (!dataChannels[uid]) {
    const dc = pc.createDataChannel("chat");
    setupDMDataChannel(uid, dc);
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignaling(uid, { type: "offer", sdp: offer });
}

async function handleDMOffer(uid, sdp) {
  const pc = await getOrCreatePeer(uid, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignaling(uid, { type: "answer", sdp: answer });
}

async function handleDMAnswer(uid, sdp) {
  const pc = await getOrCreatePeer(uid, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleDMIce(uid, candidate) {
  const pc = await getOrCreatePeer(uid, false);
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("DM ICE add error:", err);
  }
}

/* =========================================================
 * DM Messaging
 * ======================================================= */
// (Encryption hooks – no-op for now)
function dmEncrypt(text) { return text; }
function dmDecrypt(text) { return text; }

/* Send DM */
function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  if (!input || !currentThreadUser) return;
  const raw = input.value;
  const text = raw.trim();
  if (!text) return;

  const msg = {
    from: currentUser.uid,
    text: dmEncrypt(text),
    timestamp: Date.now()
  };

  // P2P send
  const chan = dataChannels[currentThreadUser];
  if (chan && chan.readyState === "open") {
    chan.send(JSON.stringify(msg));
  } else {
    console.warn("⚠ DM channel not open; message not sent.");
  }

  // Render & save
  renderDMMessage(msg, true);
  saveLocalMessage(dmThreadKey(currentUser.uid, currentThreadUser), msg);

  input.value = "";
}

/* Incoming DM (DataChannel) */
function handleIncomingDM(fromUid, raw) {
  try {
    const msg = JSON.parse(raw);
    msg.text = dmDecrypt(msg.text);
    renderDMMessage(msg, false);
    saveLocalMessage(dmThreadKey(currentUser.uid, fromUid), msg);
  } catch (err) {
    console.error("❌ Invalid DM message:", err);
  }
}

/* Legacy wrapper (if older code calls this) */
function handleIncomingMessage(uid, raw) {
  handleIncomingDM(uid, raw);
}

/* =========================================================
 * DM Message Rendering (Badges)
 * ======================================================= */
async function renderDMMessage(msg, isOwn) {
  const container = document.getElementById("threadMessages");
  if (!container) return;

  const div = document.createElement("div");
  div.className = isOwn ? "msg-bubble own" : "msg-bubble other";

  // only show name for incoming
  let nameHtml = "";
  if (!isOwn) {
    const prof = await fetchUserProfile(msg.from);
    nameHtml = `<span class="message-username">${usernameWithBadge(msg.from, prof.username)}</span>`;
  }

  div.innerHTML = `
    <div class="message-header">
      ${nameHtml}
      <span class="message-time">${formatTime(msg.timestamp)}</span>
    </div>
    <div class="message-text">${escapeHtml(msg.text)}</div>
  `;
  container.appendChild(div);
  scrollToBottom("threadMessages");
}

/* Timestamp helper */
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* =========================================================
 * Open Thread (DM)
 * ======================================================= */
function openThread(uid, username) {
  if (!uid || !currentUser) return;
  currentThreadUser = uid;
  currentRoom = null;

  // UI
  switchTab("threadView");
  const headerEl = document.getElementById("threadWithName");
  if (headerEl) {
    headerEl.innerHTML = usernameWithBadge(uid, username || "Chat");
  }

  // ensure signaling
  listenForSignals();

  // start offer
  createDMOffer(uid).catch(err => console.error("DM offer error:", err));

  // load local history
  const tk = dmThreadKey(currentUser.uid, uid);
  loadLocalMessages(tk, async msgs => {
    const container = document.getElementById("threadMessages");
    if (!container) return;
    container.innerHTML = "";
    // Render sequentially to honor async profile fetch
    for (const m of msgs.sort((a,b)=>a.timestamp-b.timestamp)) {
      await renderDMMessage(m, m.from === currentUser.uid);
    }
    decorateUsernamesWithBadges();
  });
    }

/* =========================================================
 * StringWasp v2 – Hybrid App.js
 * Part 3B: Group Mesh Chat (P2P) + Badges + Local History
 * =========================================================
 * Requires Part 3A loaded first.
 * Uses: currentUser, currentRoom, db, usernameWithBadge(), fetchUserProfile()
 * ======================================================= */

/* ---------------- Group Messaging Helpers ---------------- */
// (Encryption hooks – swap in real E2E later if needed)
function groupEncrypt(text) { return text; }
function groupDecrypt(text) { return text; }

/* Called by Part 3A’s getOrCreatePeer() when remote channel appears */
function setupGroupDataChannel(uid, channel) {
  groupDataChannels[uid] = channel;
  channel.onopen    = () => console.log(`📡 GROUP channel OPEN with ${uid}`);
  channel.onclose   = () => console.log(`❌ GROUP channel CLOSED with ${uid}`);
  channel.onerror   = err => console.error(`⚠ GROUP channel error (${uid}):`, err);
  channel.onmessage = e   => handleIncomingGroup(uid, e.data);
}

/* ---------------------------------------------------------
 * Group Message Rendering
 * ------------------------------------------------------- */
async function renderGroupMessage(msg, isOwn) {
  const container = document.getElementById("groupMessages");
  if (!container) return;

  const bubble = document.createElement("div");
  bubble.className = isOwn ? "msg-bubble own" : "msg-bubble other";

  const prof = await fetchUserProfile(msg.from);
  const nameHtml = usernameWithBadge(msg.from, prof.username);

  bubble.innerHTML = `
    <div class="msg-meta">
      <span class="msg-username">${nameHtml}</span>
      <span class="msg-time">${formatTime(msg.timestamp)}</span>
    </div>
    <div class="msg-text">${escapeHtml(msg.text)}</div>
  `;
  container.appendChild(bubble);
  scrollToBottom("groupMessages");
}

/* ---------------------------------------------------------
 * Send Group Message (broadcast all channels)
 * ------------------------------------------------------- */
function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  if (!input || !currentRoom) return;
  const raw = input.value;
  const text = raw.trim();
  if (!text) return;

  const msg = {
    from: currentUser.uid,
    text: groupEncrypt(text),
    timestamp: Date.now(),
    groupId: currentRoom
  };

  // broadcast
  Object.values(groupDataChannels).forEach(chan => {
    if (chan.readyState === "open") {
      chan.send(JSON.stringify(msg));
    }
  });

  renderGroupMessage(msg, true);
  saveLocalMessage(groupThreadKey(currentRoom), msg);

  input.value = "";
}

/* ---------------------------------------------------------
 * Incoming Group Message (DataChannel)
 * ------------------------------------------------------- */
function handleIncomingGroup(fromUid, raw) {
  try {
    const msg = JSON.parse(raw);
    msg.text = groupDecrypt(msg.text);
    renderGroupMessage(msg, msg.from === currentUser.uid);
    saveLocalMessage(groupThreadKey(msg.groupId || currentRoom), msg);
  } catch (err) {
    console.error("❌ Invalid group message:", err);
  }
}

/* Legacy wrapper if older code calls handleIncomingGroupMessage */
function handleIncomingGroupMessage(fromUid, raw) {
  handleIncomingGroup(fromUid, raw);
}

/* ---------------------------------------------------------
 * Group SDP / ICE (called from signal listener)
 * ------------------------------------------------------- */
async function createGroupOffer(uid) {
  const pc = await getOrCreatePeer(uid, true);
  if (!groupDataChannels[uid]) {
    const dc = pc.createDataChannel("group_chat");
    setupGroupDataChannel(uid, dc);
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignaling(uid, { type: "offer", sdp: offer, group: currentRoom || true });
}

async function handleGroupOffer(uid, sdp, groupId) {
  const pc = await getOrCreatePeer(uid, true);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignaling(uid, { type: "answer", sdp: answer, group: groupId });
}

async function handleGroupAnswer(uid, sdp, _groupId) {
  const pc = await getOrCreatePeer(uid, true);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleGroupIce(uid, candidate, _groupId) {
  const pc = await getOrCreatePeer(uid, true);
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("GROUP ICE add error:", err);
  }
}

/* ---------------------------------------------------------
 * Connect to all group members (mesh)
 * ------------------------------------------------------- */
async function connectToGroupMembers(memberUids) {
  const peers = memberUids.filter(u => u !== currentUser.uid);
  groupDataChannels = {}; // reset

  // prefetch user names for rendering
  await Promise.all(peers.map(uid => fetchUserProfile(uid)));

  for (const uid of peers) {
    try {
      await createGroupOffer(uid);
    } catch (err) {
      console.error("Group offer error:", uid, err);
    }
  }
}

/* ---------------------------------------------------------
 * Join Group
 * ------------------------------------------------------- */
function joinRoom(groupId) {
  if (!groupId || !currentUser) return;

  currentRoom = groupId;
  currentThreadUser = null;

  // UI
  switchTab("roomView");
  const title = document.getElementById("roomTitle");
  if (title) title.textContent = "Loading...";

  // signaling
  listenForSignals();

  // fetch group meta
  db.collection("groups").doc(groupId).get().then(async doc => {
    if (!doc.exists) {
      if (title) title.textContent = "Group (Not Found)";
      return;
    }
    const data = doc.data();
    if (title) {
      title.innerHTML = usernameWithBadge(groupId, data.name || "Group Chat");
    }
    const members = Array.isArray(data.members) ? data.members : [];
    await connectToGroupMembers(members);
    if (typeof loadGroupInfo === "function") loadGroupInfo(groupId);
  }).catch(err => {
    console.error("❌ Group fetch failed:", err);
  });

  // load local history
  loadLocalMessages(groupThreadKey(groupId), async msgs => {
    const container = document.getElementById("groupMessages");
    if (!container) return;
    container.innerHTML = "";
    for (const m of msgs.sort((a,b)=>a.timestamp-b.timestamp)) {
      await renderGroupMessage(m, m.from === currentUser.uid);
    }
    decorateUsernamesWithBadges();
  });
}

/* =========================================================
 * User Cache (for rendering names)
 * ======================================================= */  // { uid: { username, isDeveloper } }

async function fetchUserProfile(uid) {
  if (!uid) return { username: "Unknown", isDeveloper: false };
  if (userCache[uid]) return userCache[uid];

  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const profile = {
        username: data.username || "User",
        isDeveloper: (data.username === "moneythepro")  // dev badge
      };
      userCache[uid] = profile;
      return profile;
    }
  } catch (err) {
    console.error("❌ Failed to fetch profile:", err);
  }
  return { username: "Unknown", isDeveloper: false };
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

/* =========================================================
 * Developer Badge + Username System
 * ======================================================= */

const DEV_UIDS = []; // Add any verified UIDs here
const userCache = {}; // { uid: { username, isDeveloper } }

/* ===== Username Fetch & Cache ===== */
async function fetchUserProfile(uid) {
  if (!uid) return { username: "Unknown", isDeveloper: false };
  if (userCache[uid]) return userCache[uid];

  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const profile = {
        username: data.username || "User",
        isDeveloper: (data.username?.toLowerCase() === "moneythepro" || DEV_UIDS.includes(uid))
      };
      userCache[uid] = profile;
      return profile;
    }
  } catch (err) {
    console.error("❌ Failed to fetch profile:", err);
  }
  return { username: "Unknown", isDeveloper: false };
}

/* ===== Username with Badge ===== */
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

// =============================
// StringWasp UI Stub Functions
// =============================

// Chat Tab
function searchChats(query = "") {
  console.log("searchChats() called with:", query);
}

function loadChatList() {
  console.log("loadChatList() called");
}

function createGroup() {
  alert("Create Group clicked (function not implemented yet)");
}

// Friends & Profile
function triggerProfileUpload() {
  document.getElementById("profilePic").click();
}

function saveProfile() {
  alert("saveProfile() clicked - not implemented yet");
}

function logout() {
  auth.signOut().then(() => {
    console.log("User logged out");
    showMainUI(false);
  }).catch(err => console.error("Logout error:", err));
}

// Inbox
function markAllRead() {
  alert("All inbox messages marked as read");
}

// Search
function switchSearchView(type) {
  console.log("switchSearchView() called with:", type);
  document.getElementById("searchResultsUser").style.display = type === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = type === "group" ? "block" : "none";
}

function runSearch() {
  console.log("runSearch() called");
}

// User Search Error Fix
function loadInbox() {
  console.log("loadInbox() called");
}

window.addEventListener("unhandledrejection", (e) => {
  console.error("[GLOBAL PROMISE REJECTION]", e.reason?.message || e.reason);
});
window.addEventListener("error", (e) => {
  console.error("[GLOBAL ERROR]", e.message, e.error);
});
