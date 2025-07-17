/*************************************************************
 * StringWasp v1.0 – App Core (Part 1/6) – Merged & Updated
 *************************************************************/
"use strict";

/* ===================== CONFIG & CONSTANTS ===================== */
const STRINGWASP_VERSION = "1.0.0";
const DEBUG = true;
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 🔐 AES Key (placeholder for dev)
let ACTIVE_AES_KEY = "yourSecretKey";
function rotateContentKey(newKey) {
  if (!newKey || typeof newKey !== "string" || newKey.length < 16) return;
  ACTIVE_AES_KEY = newKey;
  console.info("🔐 AES key rotated");
}

/* ======================= FIREBASE HANDLES ====================== */
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

/* ======================== ERROR LOGGER ======================== */
function errorLog(prefix, err) {
  const msg = err?.message || (typeof err === "string" ? err :
    (() => { try { return JSON.stringify(err); } catch { return String(err); } })());
  console.error(prefix, msg, err);
  return msg;
}

/* ======================= UUID Generator ======================= */
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16)
  );
}

/* ======================== GLOBAL STATE ======================== */
let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;

let replyingTo = null;
let selectedMessageForAction = null;
let editingMessageData = null;

let unsubscribeMessages = null;
let unsubscribeThread = null;
let unsubscribeInbox = null;
let unsubscribeTyping = null;
let unsubscribeThreads = null;
let unsubscribeGroups = null;
let unsubscribeRoomMessages = null;
let unsubscribeUserPresence = null;

const renderedMessageIds = new Set();
const renderedGroupMsgIds = new Set();
const userCache = new Map();

/* ======================== DOM HELPERS ======================== */
function $(id) { return document.getElementById(id); }

function domRefs() {
  return {
    loadingOverlay: $("loadingOverlay"),
    appPage: $("appPage"),
    usernameDialog: $("usernameDialog"),
    usernameDisplay: $("usernameDisplay"),
    chatOptionsMenu: $("chatOptionsMenu"),
    chatTab: $("chatTab")
  };
}

/* ===================== SCROLL + FOCUS ===================== */
function scrollToBottom(el, {smooth=true}={}) {
  if (!el) return;
  el.scrollTo({top: el.scrollHeight, behavior: smooth ? "smooth" : "auto"});
}
function isNearBottom(el, px=120) {
  if (!el) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < px;
}
function safeFocus(el, {preventScroll=true, delay=0}={}) {
  if (!el) return;
  if (delay) {
    setTimeout(() => el.focus({preventScroll}), delay);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.focus({preventScroll});
    }));
  }
}

/* =================== TAB SWITCHING =================== */
function switchTab(tabId){
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const selected = $(tabId);
  if (selected) selected.style.display = "block";
  domRefs().chatOptionsMenu?.classList.remove("show");
}

/* =================== LOADING OVERLAY =================== */
function showLoading() { const o = domRefs().loadingOverlay; if (o) o.style.display = "flex"; }
function hideLoading() { const o = domRefs().loadingOverlay; if (o) o.style.display = "none"; }

/* =================== ESCAPE HTML =================== */
function escapeHtml(text){
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[m]));
}

/* ============== AUTH: LOGIN / REGISTER / ONBOARD ============== */
function login(){
  const email = $("email")?.value.trim();
  const password = $("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");
  showLoading();
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => alert("Login failed: " + errorLog("Login:", err)))
    .finally(hideLoading);
}

function register(){
  const email = $("email")?.value.trim();
  const password = $("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");
  showLoading();
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => switchTab("usernameDialog"))
    .catch(err => alert("❌ Registration failed: " + errorLog("Register:", err)))
    .finally(hideLoading);
}

function saveUsername(){
  if (!currentUser) return;
  const username = $("newUsername")?.value.trim();
  if (!username) return alert("Enter a username");
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true}).then(() => {
    domRefs().usernameDisplay.textContent = username;
    loadMainUI();
  }).catch(err => {
    alert("❌ Failed to save username: " + errorLog("saveUsername:", err));
  });
}

function checkUsername(){
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog");
    } else {
      domRefs().usernameDisplay.textContent = doc.data().username;
      loadMainUI();
    }
  }).catch(err => {
    alert("❌ Failed to check username: " + errorLog("checkUsername:", err));
  });
}

/* =================== MAIN UI LOAD =================== */
function loadMainUI(){
  showLoading();
  const r = domRefs();
  if (r.appPage) r.appPage.style.display = "block";

  loadProfile(() => {
    try { loadChatList(); } catch(e) { console.warn("Chats failed", e); }
    try { loadFriends(); } catch(e) { console.warn("Friends failed", e); }
    try { loadGroups?.(); } catch(e) { console.warn("Groups skipped", e); }
    try { listenInbox(); } catch(e) { console.warn("Inbox failed", e); }

    switchTab("chatTab");
    setTimeout(hideLoading, 300);
  });
}

/* =================== PRESENCE + LOGOUT =================== */
auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    hideLoading();
    return;
  }

  currentUser = user;
  const userRef = db.collection("users").doc(user.uid);

  try {
    await userRef.update({
      status: "online",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn("⚠️ Could not update user presence:", e.message);
  }

  window.addEventListener("beforeunload", () => {
    navigator.sendBeacon(`/offline?uid=${user.uid}`);
    userRef.update({
      status: "offline",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  });

  try {
    const snap = await userRef.get();
    const data = snap.data();

    if (!data?.username) {
      switchTab("usernameDialog");
      hideLoading();
      return;
    }

    domRefs().usernameDisplay.textContent = data.username;

    document.querySelector(".profile-edit-label").onclick = () => {
      $("profilePic").click();
    };

    loadMainUI();

    if (joinGroupId) {
      try { await tryJoinGroup(joinGroupId); }
      catch (e) { console.warn("Group join failed:", e); }
    }

    switchTab("chatTab");

  } catch (err) {
    alert("❌ Failed to load user info: " + errorLog("authState user load:", err));
  } finally {
    hideLoading();
  }
});

function logout(){
  if (currentUser){
    db.collection("users").doc(currentUser.uid).update({
      status: "offline",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
  auth.signOut().then(() => window.location.reload());
}

/* =================== VIEWPORT LAYOUT =================== */
function adjustThreadLayout(){
  const threadView = $("threadView");
  if (!threadView) return;
  const vh = window.visualViewport?.height || window.innerHeight;
  threadView.style.height = vh + "px";
}

window.addEventListener("resize", () => {
  adjustThreadLayout();
  const ti = $("threadInput");
  if (document.activeElement === ti) {
    setTimeout(() => scrollToBottomThread(true), 300);
  }
});

function scrollToBottomThread(smooth=true){
  const scrollArea = document.querySelector(".chat-scroll-area");
  if (!scrollArea) return;
  scrollToBottom(scrollArea, {smooth});
}

/* =================== URL JOIN PARAMS =================== */
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join");

/*************************************************************
 * StringWasp v1.0 – App Core (Part 2/6) – Profile + Theme + Cache
 *************************************************************/

/* ================== LOAD PROFILE UI ================== */
function loadProfile(callback){
  if (!currentUser) return;
  const uid = currentUser.uid;

  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return;
    const data = doc.data();

    $("profileName").textContent = data.username || "User";
    $("profileEmail").textContent = data.email || "";
    if (data.avatarUrl) {
      const img = $("profileAvatar");
      if (img) img.src = data.avatarUrl;
    }

    if (typeof callback === "function") callback();
  }).catch(err => {
    console.warn("Failed to load profile:", errorLog("loadProfile:", err));
    if (typeof callback === "function") callback();
  });
}

/* ================== HANDLE AVATAR UPLOAD ================== */
function handleAvatarUpload(){
  const fileInput = $("profilePic");
  if (!fileInput || !fileInput.files[0]) return;

  const file = fileInput.files[0];
  if (!file.type.startsWith("image/")){
    alert("Please select an image file.");
    return;
  }

  showLoading();
  const storageRef = storage.ref(`avatars/${currentUser.uid}`);
  storageRef.put(file).then(snapshot => snapshot.ref.getDownloadURL())
    .then(url => {
      return db.collection("users").doc(currentUser.uid).update({ avatarUrl: url });
    })
    .then(() => {
      $("profileAvatar").src = URL.createObjectURL(file); // quick preview
      alert("✅ Avatar updated!");
    })
    .catch(err => {
      alert("❌ Failed to update avatar: " + errorLog("handleAvatarUpload:", err));
    })
    .finally(hideLoading);
}

/* ================== THEME TOGGLE ================== */
function toggleTheme(){
  const body = document.body;
  const isDark = body.classList.toggle("dark-theme");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}
function applySavedTheme(){
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark-theme");
  }
}
applySavedTheme();

/* ================== USER CACHE ================== */
async function getUserData(uid){
  if (userCache.has(uid)) return userCache.get(uid);

  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      userCache.set(uid, data);
      return data;
    }
    return null;
  } catch(err) {
    console.warn("getUserData failed:", errorLog("getUserData:", err));
    return null;
  }
}

/* ================== SUPPORT HELPERS ================== */
function formatTimestamp(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function vibrateShort(){
  if (navigator.vibrate){
    navigator.vibrate([30]);
  }
}

function notifyBrowser(title, body){
  if (Notification.permission === "granted"){
    new Notification(title, { body });
  }
}

/* ========== BIND EVENTS FOR PROFILE & THEME ========== */
document.addEventListener("DOMContentLoaded", () => {
  const avatarInput = $("profilePic");
  if (avatarInput) {
    avatarInput.addEventListener("change", handleAvatarUpload);
  }

  const themeBtn = $("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTheme);
  }
});

/*************************************************************
 * StringWasp v1.0 – App Core (Part 3/6) – Inbox + Friends + Search
 *************************************************************/

/* ====================== INBOX LISTENER ====================== */
function listenInbox(){
  if (unsubscribeInbox) unsubscribeInbox();

  const colRef = db.collection("users").doc(currentUser.uid)
    .collection("inbox").orderBy("createdAt", "desc");

  unsubscribeInbox = colRef.onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const doc = change.doc;
      const data = doc.data();
      data.id = doc.id;

      switch (change.type){
        case "added":    renderInboxItem(data); break;
        case "modified": updateInboxItemUI(data); break;
        case "removed":  removeInboxItemUI(data.id); break;
      }

      if (change.type === "added" && data.status === "pending"){
        vibrateShort();
        notifyBrowser("New notification", data.fromName || data.message || "New activity");
      }
    });
  }, err => {
    errorLog("Inbox listener:", err);
  });
}

/* ====================== INBOX RENDERING ====================== */
function inboxListEl(){
  return $("inboxList") || $("inboxContainer") || document.querySelector(".inbox-list");
}

function buildInboxCard(data){
  const type = data.type || "alert";
  const fromName = escapeHtml(data.fromName || "Someone");
  const msg = escapeHtml(data.message || (type==="friend" ? "sent you a friend request" : (type==="groupInvite" ? "invited you to a group" : "")));
  const avatarUrl = data.fromAvatar || "assets/default-avatar.png";
  const createdTxt = formatTimestamp(data.createdAt);
  const id = data.id;

  let actionsHtml = "";
  if (data.status === "pending"){
    if (type === "friend"){
      actionsHtml = `
        <button class="btn-accept" data-inbox-accept="${id}">Accept</button>
        <button class="btn-decline" data-inbox-decline="${id}">Decline</button>`;
    } else if (type === "groupInvite"){
      actionsHtml = `
        <button class="btn-accept" data-group-accept="${id}" data-group-id="${escapeHtml(data.groupId || "")}">Join</button>
        <button class="btn-decline" data-group-decline="${id}">Decline</button>`;
    } else {
      actionsHtml = `<button class="btn-dismiss" data-inbox-dismiss="${id}">Dismiss</button>`;
    }
  } else {
    actionsHtml = `<span class="inbox-status">${escapeHtml(data.status)}</span>`;
  }

  return `
    <div class="inbox-card" id="inbox-${id}" data-type="${type}">
      <img class="inbox-avatar" src="${avatarUrl}" alt="">
      <div class="inbox-card-body">
        <div class="inbox-card-title">${fromName}</div>
        <div class="inbox-card-msg">${msg}</div>
        <div class="inbox-card-meta">${createdTxt}</div>
      </div>
      <div class="inbox-card-actions">${actionsHtml}</div>
    </div>`;
}

function renderInboxItem(data){
  const list = inboxListEl();
  if (!list) return;
  ensureInboxDisplayFields(data).then(fixed => {
    const existing = $("inbox-" + fixed.id);
    if (existing){
      existing.outerHTML = buildInboxCard(fixed);
      bindInboxCardActions(fixed);
    } else {
      list.insertAdjacentHTML("afterbegin", buildInboxCard(fixed));
      bindInboxCardActions(fixed);
    }
  });
}
function updateInboxItemUI(data){
  renderInboxItem(data);
}
function removeInboxItemUI(id){
  const el = $("inbox-" + id);
  if (el) el.remove();
}

/* ====================== ENSURE DISPLAY FIELDS ====================== */
async function ensureInboxDisplayFields(data){
  if (data.fromName && typeof data.fromName === "string") return data;

  if (data.type === "friend" || data.type === "groupInvite" || data.from){
    const fromData = await getUserData(data.from);
    if (fromData){
      data.fromName = fromData.username || fromData.email || "User";
      data.fromAvatar = fromData.avatarUrl || data.fromAvatar;
    }
  }
  if (data.type === "groupInvite" && data.groupId){
    const gdoc = await db.collection("groups").doc(data.groupId).get();
    if (gdoc.exists){
      const gdata = gdoc.data();
      data.groupName = gdata.name || data.groupName;
    }
  }

  try {
    await db.collection("users").doc(currentUser.uid)
      .collection("inbox").doc(data.id).set({
        fromName: data.fromName || "User",
        fromAvatar: data.fromAvatar || null,
        groupName: data.groupName || null
      }, {merge: true});
  } catch (e){
    console.warn("ensureInboxDisplayFields merge failed:", e.message);
  }
  return data;
}

/* ====================== INBOX ACTION BINDINGS ====================== */
function bindInboxCardActions(data){
  const id = data.id;

  const acceptBtn = document.querySelector(`[data-inbox-accept="${id}"]`);
  const declineBtn = document.querySelector(`[data-inbox-decline="${id}"]`);
  const gAccept = document.querySelector(`[data-group-accept="${id}"]`);
  const gDecline = document.querySelector(`[data-group-decline="${id}"]`);
  const dismissBtn = document.querySelector(`[data-inbox-dismiss="${id}"]`);

  if (acceptBtn) acceptBtn.onclick = () => acceptFriendRequest(id, data.from);
  if (declineBtn) declineBtn.onclick = () => declineFriendRequest(id);
  if (gAccept) gAccept.onclick = () => acceptGroupInvite(id, gAccept.dataset.groupId, data.from);
  if (gDecline) gDecline.onclick = () => declineGroupInvite(id);
  if (dismissBtn) dismissBtn.onclick = () => dismissInboxItem(id);
}

/* ====================== FRIEND REQUESTS ====================== */
async function sendFriendRequest(targetUid){
  if (!currentUser || !targetUid || targetUid === currentUser.uid) return;

  const senderData = await getUserData(currentUser.uid) || {};
  const senderName = senderData.username || currentUser.email || "User";

  const inboxCol = db.collection("users").doc(targetUid).collection("inbox").doc();
  const payload = {
    type: "friend",
    from: currentUser.uid,
    fromName: senderName,
    fromAvatar: senderData.avatarUrl || null,
    message: "sent you a friend request",
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  return inboxCol.set(payload).catch(err => {
    alert("Failed to send friend request: " + errorLog("sendFriendRequest:", err));
  });
}

async function acceptFriendRequest(inboxId, fromUid){
  if (!currentUser) return;
  const batch = db.batch();

  const inboxRef = db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId);
  batch.update(inboxRef, {status: "accepted"});

  const meRef = db.collection("users").doc(currentUser.uid);
  const themRef = db.collection("users").doc(fromUid);
  batch.update(meRef, {friends: firebase.firestore.FieldValue.arrayUnion(fromUid)});
  batch.update(themRef, {friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});

  const notifyRef = db.collection("users").doc(fromUid).collection("inbox").doc();
  const meData = await getUserData(currentUser.uid) || {};
  batch.set(notifyRef, {
    type: "alert",
    from: currentUser.uid,
    fromName: meData.username || currentUser.email || "User",
    message: "accepted your friend request",
    status: "seen",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  return batch.commit().catch(err => {
    alert("Failed to accept friend request: " + errorLog("acceptFriendRequest:", err));
  });
}

async function declineFriendRequest(inboxId){
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId)
    .update({status: "declined"}).catch(err => {
      alert("Failed to decline: " + errorLog("declineFriendRequest:", err));
    });
}

function dismissInboxItem(inboxId){
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId)
    .delete().catch(err => {
      alert("Failed to dismiss: " + errorLog("dismissInboxItem:", err));
    });
}

/* ====================== GROUP INVITES ====================== */
async function sendGroupInvite(groupId, targetUid){
  if (!currentUser || !groupId || !targetUid) return;
  const gdoc = await db.collection("groups").doc(groupId).get();
  if (!gdoc.exists){
    alert("Group not found.");
    return;
  }
  const gdata = gdoc.data();
  const meData = await getUserData(currentUser.uid) || {};
  const inboxCol = db.collection("users").doc(targetUid).collection("inbox").doc();

  inboxCol.set({
    type: "groupInvite",
    from: currentUser.uid,
    fromName: meData.username || currentUser.email || "User",
    fromAvatar: meData.avatarUrl || null,
    groupId,
    groupName: gdata.name || "Group",
    message: `invited you to join ${gdata.name || "a group"}`,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => {
    alert("Failed to send group invite: " + errorLog("sendGroupInvite:", err));
  });
}

async function acceptGroupInvite(inboxId, groupId, fromUid){
  if (!currentUser || !groupId) return;
  const batch = db.batch();

  const inboxRef = db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId);
  batch.update(inboxRef, {status: "accepted"});

  const groupRef = db.collection("groups").doc(groupId);
  batch.update(groupRef, {members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});

  const meRef = db.collection("users").doc(currentUser.uid);
  batch.update(meRef, {groups: firebase.firestore.FieldValue.arrayUnion(groupId)});

  if (fromUid){
    const notifyRef = db.collection("users").doc(fromUid).collection("inbox").doc();
    const meData = await getUserData(currentUser.uid) || {};
    batch.set(notifyRef, {
      type: "alert",
      from: currentUser.uid,
      fromName: meData.username || currentUser.email || "User",
      message: "joined your group",
      status: "seen",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return batch.commit().catch(err => {
    alert("Failed to accept group invite: " + errorLog("acceptGroupInvite:", err));
  });
}

function declineGroupInvite(inboxId){
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId)
    .update({status: "declined"}).catch(err => {
      alert("Failed to decline group invite: " + errorLog("declineGroupInvite:", err));
    });
}

/* ====================== FRIENDS LIST ====================== */
function loadFriends(){
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).onSnapshot(doc => {
    const data = doc.data() || {};
    const friendUids = data.friends || [];
    renderFriendsList(friendUids);
  }, err => {
    errorLog("loadFriends listener:", err);
  });
}

async function renderFriendsList(friendUids){
  const list = $("friendsList");
  if (!list) return;
  list.innerHTML = "";
  for (const uid of friendUids){
    const data = await getUserData(uid) || {};
    const name = escapeHtml(data.username || data.email || "User");
    const avatar = data.avatarUrl || "assets/default-avatar.png";
    const devBadge = (data.username === "moneythepro") ? " 🛠️" : "";
    const li = document.createElement("div");
    li.className = "friend-row";
    li.innerHTML = `
      <img class="friend-avatar" src="${avatar}" alt="">
      <span class="friend-name">${name}${devBadge}</span>`;
    li.onclick = () => openThread(uid, name);
    list.appendChild(li);
  }
}

/* ====================== USER SEARCH ====================== */
let searchUserDebounceTimer = null;
function initSearch(){
  const userInput = $("searchUsersInput");
  const groupInput = $("searchGroupsInput");

  if (userInput){
    userInput.addEventListener("input", () => {
      clearTimeout(searchUserDebounceTimer);
      const q = userInput.value.trim();
      searchUserDebounceTimer = setTimeout(() => searchUsers(q), 250);
    });
  }

  if (groupInput){
    groupInput.addEventListener("input", () => {
      const q = groupInput.value.trim();
      searchGroups(q);
    });
  }
}
document.addEventListener("DOMContentLoaded", initSearch);

/* Will continue: searchUsers(), searchGroups(), tryJoinGroup() in Part 4 */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 4/6) – Threads & Messaging
 *************************************************************/

/* ===================== OPEN DIRECT THREAD ===================== */
function openThread(uid, name){
  if (!uid || !currentUser || uid === currentUser.uid) return;

  currentThreadUser = uid;
  switchTab("threadView");
  $("threadUserName").textContent = name || "User";
  $("threadMessages").innerHTML = "";
  renderedMessageIds.clear();

  if (unsubscribeThread) unsubscribeThread();
  const col = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(uid)
    .collection("messages").orderBy("createdAt", "asc");

  unsubscribeThread = col.onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const msg = change.doc.data();
      msg.id = change.doc.id;

      if (renderedMessageIds.has(msg.id)) return;

      renderedMessageIds.add(msg.id);
      renderThreadMessage(msg);
    });

    scrollToBottomThread(true);
  });
}

/* ===================== THREAD MESSAGE RENDER ===================== */
function renderThreadMessage(msg){
  const container = $("threadMessages");
  if (!container) return;

  const isOwn = msg.from === currentUser.uid;
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${isOwn ? "own" : "other"}`;
  bubble.id = "msg-" + msg.id;

  const msgText = escapeHtml(msg.text || "");
  const time = formatTimestamp(msg.createdAt);
  const replyText = msg.replyText ? `<div class="reply-preview">${escapeHtml(msg.replyText)}</div>` : "";
  const editTag = msg.edited ? " <span class='edited-tag'>(edited)</span>" : "";

  bubble.innerHTML = `
    ${replyText}
    <div class="msg-text">${msgText}${editTag}</div>
    <div class="msg-meta">${time}</div>`;

  bubble.onclick = () => selectMessageForAction(msg);

  container.appendChild(bubble);
  scrollToBottomThread(true);
}

/* ===================== SEND THREAD MESSAGE ===================== */
function sendThreadMessage(){
  const input = $("threadInput");
  const text = input?.value.trim();
  if (!text || !currentUser || !currentThreadUser) return;

  const msg = {
    text,
    from: currentUser.uid,
    to: currentThreadUser,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...(replyingTo && {
      replyTo: replyingTo.id,
      replyText: replyingTo.text || ""
    })
  };

  const myCol = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser)
    .collection("messages");

  const theirCol = db.collection("users").doc(currentThreadUser)
    .collection("threads").doc(currentUser.uid)
    .collection("messages");

  myCol.add(msg).then(docRef => {
    msg.id = docRef.id;
    theirCol.doc(docRef.id).set(msg);
  });

  input.value = "";
  clearReplyPreview();
}

/* ===================== REPLY PREVIEW ===================== */
function replyToMessage(msg){
  replyingTo = msg;
  const replyEl = $("replyingPreview");
  if (!replyEl) return;
  replyEl.innerHTML = `
    <div class="reply-text">${escapeHtml(msg.text)}</div>
    <button onclick="clearReplyPreview()">✕</button>`;
  replyEl.style.display = "block";
}
function clearReplyPreview(){
  replyingTo = null;
  const replyEl = $("replyingPreview");
  if (replyEl) replyEl.style.display = "none";
}

/* ===================== SELECT MESSAGE (for edit/delete/reply) ===================== */
function selectMessageForAction(msg){
  selectedMessageForAction = msg;
  const menu = $("messageActionMenu");
  if (!menu) return;

  menu.style.display = "block";
  menu.style.top = (event?.clientY || 100) + "px";
  menu.style.left = (event?.clientX || 100) + "px";

  $("msgActReply").onclick = () => {
    replyToMessage(msg);
    hideMessageActionMenu();
  };
  $("msgActEdit").onclick = () => {
    editMessage(msg);
    hideMessageActionMenu();
  };
  $("msgActDelete").onclick = () => {
    deleteMessage(msg);
    hideMessageActionMenu();
  };
}
function hideMessageActionMenu(){
  const menu = $("messageActionMenu");
  if (menu) menu.style.display = "none";
}

/* ===================== EDIT MESSAGE ===================== */
function editMessage(msg){
  if (!msg || msg.from !== currentUser.uid) return;
  editingMessageData = msg;
  const input = $("threadInput");
  input.value = msg.text;
  input.focus();
}
function sendEditedMessage(){
  const input = $("threadInput");
  const newText = input.value.trim();
  if (!newText || !editingMessageData) return;

  const msgId = editingMessageData.id;
  const paths = [
    db.collection("users").doc(currentUser.uid)
      .collection("threads").doc(currentThreadUser)
      .collection("messages").doc(msgId),
    db.collection("users").doc(currentThreadUser)
      .collection("threads").doc(currentUser.uid)
      .collection("messages").doc(msgId)
  ];

  paths.forEach(ref => {
    ref.update({
      text: newText,
      edited: true
    });
  });

  editingMessageData = null;
  input.value = "";
}

/* ===================== DELETE MESSAGE ===================== */
function deleteMessage(msg){
  if (!msg || msg.from !== currentUser.uid) return;

  const msgId = msg.id;
  const myRef = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser)
    .collection("messages").doc(msgId);

  const theirRef = db.collection("users").doc(currentThreadUser)
    .collection("threads").doc(currentUser.uid)
    .collection("messages").doc(msgId);

  myRef.delete().catch(e => console.warn("Delete mine failed:", e));
  theirRef.delete().catch(e => console.warn("Delete theirs failed:", e));

  const el = $("msg-" + msgId);
  if (el) el.remove();
}

/* ===================== TYPING INDICATOR ===================== */
let typingTimeout = null;
function handleTyping(){
  if (!currentUser || !currentThreadUser) return;
  const typingRef = db.collection("users").doc(currentThreadUser)
    .collection("threads").doc(currentUser.uid);

  typingRef.set({
    typing: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge: true});

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingRef.set({typing: false}, {merge: true});
  }, 2000);
}

function listenTypingIndicator(){
  if (!currentUser || !currentThreadUser) return;

  const ref = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser);

  unsubscribeTyping = ref.onSnapshot(doc => {
    const data = doc.data();
    $("typingIndicator").style.display = (data?.typing) ? "block" : "none";
  });
}

/* ===================== MESSAGE INPUT BINDINGS ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const input = $("threadInput");
  const sendBtn = $("sendThreadBtn");

  if (input){
    input.addEventListener("input", handleTyping);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey){
        if (editingMessageData) {
          sendEditedMessage();
        } else {
          sendThreadMessage();
        }
        e.preventDefault();
      }
    });
  }

  if (sendBtn){
    sendBtn.addEventListener("click", () => {
      if (editingMessageData){
        sendEditedMessage();
      } else {
        sendThreadMessage();
      }
    });
  }
});

/*************************************************************
 * StringWasp v1.0 – App Core (Part 5/6) – Group Chat System
 *************************************************************/

/* ====================== LOAD GROUPS ====================== */
function loadGroups(){
  if (!currentUser) return;

  if (unsubscribeGroups) unsubscribeGroups();

  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(snap => {
      const list = $("groupList");
      if (!list) return;
      list.innerHTML = "";

      snap.docs.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        const li = document.createElement("div");
        li.className = "group-row";
        li.innerHTML = `
          <span class="group-name">${escapeHtml(data.name || "Unnamed Group")}</span>`;
        li.onclick = () => openGroup(id, data.name);
        list.appendChild(li);
      });
    });
}

/* ====================== OPEN GROUP CHAT ====================== */
function openGroup(groupId, groupName){
  if (!groupId || !currentUser) return;

  currentRoom = groupId;
  switchTab("roomView");
  $("roomName").textContent = groupName || "Group";
  $("roomMessages").innerHTML = "";
  renderedGroupMsgIds.clear();

  if (unsubscribeRoomMessages) unsubscribeRoomMessages();

  const col = db.collection("groups").doc(groupId)
    .collection("messages").orderBy("createdAt", "asc");

  unsubscribeRoomMessages = col.onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const msg = change.doc.data();
      msg.id = change.doc.id;
      if (!renderedGroupMsgIds.has(msg.id)){
        renderedGroupMsgIds.add(msg.id);
        renderGroupMessage(msg);
      }
    });

    scrollToBottom($("roomMessages"));
  });
}

/* ====================== RENDER GROUP MESSAGE ====================== */
async function renderGroupMessage(msg){
  const container = $("roomMessages");
  if (!container) return;

  const user = await getUserData(msg.from) || {};
  const name = escapeHtml(user.username || "User");
  const avatar = user.avatarUrl || "assets/default-avatar.png";
  const msgText = escapeHtml(msg.text || "");
  const time = formatTimestamp(msg.createdAt);

  const wrap = document.createElement("div");
  wrap.className = `group-msg ${msg.from === currentUser.uid ? "own" : "other"}`;
  wrap.id = "group-msg-" + msg.id;

  wrap.innerHTML = `
    <img class="group-avatar" src="${avatar}" alt="">
    <div class="group-bubble">
      <div class="group-msg-header">${name}</div>
      <div class="group-msg-body">${msgText}</div>
      <div class="group-msg-meta">${time}</div>
    </div>`;

  container.appendChild(wrap);
}

/* ====================== SEND GROUP MESSAGE ====================== */
function sendGroupMessage(){
  const input = $("roomInput");
  const text = input?.value.trim();
  if (!text || !currentRoom || !currentUser) return;

  const msg = {
    from: currentUser.uid,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("groups").doc(currentRoom)
    .collection("messages").add(msg).then(() => {
      input.value = "";
    }).catch(err => {
      alert("Failed to send group message: " + errorLog("sendGroupMessage:", err));
    });
}

/* ====================== CREATE GROUP ====================== */
function createGroup(){
  const groupName = prompt("Enter group name:");
  if (!groupName || !currentUser) return;

  const payload = {
    name: groupName,
    members: [currentUser.uid],
    createdBy: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("groups").add(payload).catch(err => {
    alert("Failed to create group: " + errorLog("createGroup:", err));
  });
}

/* ====================== ROOM INPUT HANDLER ====================== */
document.addEventListener("DOMContentLoaded", () => {
  const input = $("roomInput");
  const sendBtn = $("sendRoomBtn");

  if (input){
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey){
        sendGroupMessage();
        e.preventDefault();
      }
    });
  }

  if (sendBtn){
    sendBtn.addEventListener("click", sendGroupMessage);
  }

  const newGroupBtn = $("createGroupBtn");
  if (newGroupBtn){
    newGroupBtn.addEventListener("click", createGroup);
  }
});

/*************************************************************
 * StringWasp v1.0 – App Core (Part 6/6) – Search & Utilities
 *************************************************************/

/* ====================== SEARCH USERS ====================== */
function searchUsers(query){
  if (!query) return;
  const list = $("searchUserResults");
  if (!list) return;
  list.innerHTML = "Searching...";

  db.collection("users")
    .where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff")
    .limit(10)
    .get()
    .then(snap => {
      list.innerHTML = "";
      if (snap.empty){
        list.innerHTML = "<div class='empty'>No users found</div>";
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        if (doc.id === currentUser?.uid) return;

        const name = escapeHtml(data.username || "User");
        const avatar = data.avatarUrl || "assets/default-avatar.png";

        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <img class="search-avatar" src="${avatar}" alt="">
          <span class="search-name">${name}</span>
          <button class="search-add" data-add-friend="${doc.id}">Add</button>`;

        list.appendChild(div);
      });

      bindSearchFriendButtons();
    })
    .catch(err => {
      list.innerHTML = "<div class='error'>Search failed</div>";
      console.warn("searchUsers failed:", errorLog("searchUsers:", err));
    });
}

function bindSearchFriendButtons(){
  document.querySelectorAll("[data-add-friend]").forEach(btn => {
    btn.onclick = () => {
      const uid = btn.dataset.addFriend;
      sendFriendRequest(uid);
    };
  });
}

/* ====================== SEARCH GROUPS ====================== */
function searchGroups(query){
  if (!query) return;
  const list = $("searchGroupResults");
  if (!list) return;
  list.innerHTML = "Searching...";

  db.collection("groups")
    .where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff")
    .limit(10)
    .get()
    .then(snap => {
      list.innerHTML = "";
      if (snap.empty){
        list.innerHTML = "<div class='empty'>No groups found</div>";
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <span class="search-name">${escapeHtml(data.name || "Group")}</span>
          <button class="search-join" data-join-group="${doc.id}">Join</button>`;

        list.appendChild(div);
      });

      bindSearchJoinButtons();
    })
    .catch(err => {
      list.innerHTML = "<div class='error'>Search failed</div>";
      console.warn("searchGroups failed:", errorLog("searchGroups:", err));
    });
}

function bindSearchJoinButtons(){
  document.querySelectorAll("[data-join-group]").forEach(btn => {
    btn.onclick = () => {
      const gid = btn.dataset.joinGroup;
      tryJoinGroup(gid);
    };
  });
}

/* ====================== TRY JOIN GROUP ====================== */
async function tryJoinGroup(groupId){
  if (!currentUser || !groupId) return;

  const ref = db.collection("groups").doc(groupId);
  const doc = await ref.get();
  if (!doc.exists){
    alert("❌ Group not found.");
    return;
  }

  const data = doc.data();
  if (data.members?.includes(currentUser.uid)){
    openGroup(groupId, data.name);
    return;
  }

  await ref.update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  });

  await db.collection("users").doc(currentUser.uid).update({
    groups: firebase.firestore.FieldValue.arrayUnion(groupId)
  });

  openGroup(groupId, data.name);
}

/* ====================== MISC CLEANUP ====================== */
window.addEventListener("click", e => {
  if (!e.target.closest("#messageActionMenu")){
    hideMessageActionMenu();
  }
});
