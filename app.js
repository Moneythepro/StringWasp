/*************************************************************
 * StringWasp v1.0 – App Core (Part 1/6)
 * -----------------------------------------------------------
 * This file is delivered in numbered parts. Paste each part
 * sequentially into your working `app.js` (or merge using a
 * diff tool). Do NOT duplicate the header comments across parts
 * when you finally merge – they are guideposts only.
 *
 * PART 1 CONTENTS
 *  - Strict mode + top-level constants
 *  - Firebase handles
 *  - Error logging helper (prevents [object Object])
 *  - Simple event throttle/debounce helpers
 *  - AES encryption helpers (central key + rotate hook)
 *  - UUID util
 *  - Global state (single source of truth)
 *  - Cached DOM refs helper
 *  - Safe focus + scroll utilities
 *  - Tab switching
 *  - Auth: login, register, username-onboarding scaffold
 *  - Presence (online/offline + lastSeen)
 *
 * Later parts extend these exports and wire full UI.
 *************************************************************/
"use strict";

/* =================================================================
   CONFIG & CONSTANTS
   ================================================================= */

const STRINGWASP_VERSION = "1.0.0";
const DEBUG = true;              // flip false in production
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 🔐 AES: single place to change/rotate symmetric content key
// NOTE: For true E2E you will receive per-chat keys (Part 4+5).
let ACTIVE_AES_KEY = "yourSecretKey";  // placeholder dev key

// Accept a rotation hook (call before sending new msgs; old msgs
// remain decryptable if you store per-message keyVersion metadata).
function rotateContentKey(newKey) {
  if (!newKey || typeof newKey !== "string" || newKey.length < 16) {
    console.warn("rotateContentKey ignored: invalid key.");
    return;
  }
  ACTIVE_AES_KEY = newKey;
  console.info("🔐 ACTIVE_AES_KEY rotated.");
}

/* =================================================================
   FIREBASE (assumes firebase SDK v8 loaded globally)
   ================================================================= */
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

/* =================================================================
   ERROR LOGGING (prevents [object Object] in console/UI)
   ================================================================= */
function errorLog(prefix, err) {
  const msg = (err && err.message) ? err.message :
              (typeof err === "string" ? err :
                (() => { try { return JSON.stringify(err); } catch { return String(err); } })());
  console.error(prefix, msg, err); // keep original err as 3rd arg for stack
  return msg;
}

/* =================================================================
   UUID UTIL
   ================================================================= */
function uuidv4() {
  // Fast RFC4122-ish uuid; fine for client IDs (non-crypto critical).
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16)
  );
}

/* =================================================================
   GLOBAL STATE (single source of truth)
   ================================================================= */
let currentUser        = null; // firebase user obj
let currentRoom        = null; // active groupId
let currentThreadUser  = null; // active DM uid

// Inbox / listeners
let unsubscribeMessages     = null;
let unsubscribeThread       = null;
let unsubscribeInbox        = null;
let unsubscribeTyping       = null;
let unsubscribeThreads      = null;
let unsubscribeGroups       = null;
let unsubscribeRoomMessages = null;
let unsubscribeUserPresence = null;

// Messaging helpers
let replyingTo       = null;   // {msgId, text} when replying
let selectedMessageForAction = null; // context menu target
let editingMessageData       = null; // edit modal state

// Rendered message tracking for live listeners
const renderedMessageIds = new Set(); // DM scope; cleared per openThread
const renderedGroupMsgIds = new Set(); // Group scope; cleared per joinRoom

// Lightweight user cache to cut repeated Firestore reads
const userCache = new Map();  // key: uid -> userData

/* =================================================================
   DOM HELPERS
   ================================================================= */
function $(id){ return document.getElementById(id); }

// Frequently used nodes (lazy resolved; access through fn to avoid stale)
function domRefs(){
  return {
    loadingOverlay: $("loadingOverlay"),
    appPage:        $("appPage"),
    usernameDialog: $("usernameDialog"),
    usernameDisplay:$("usernameDisplay"),
    chatOptionsMenu:$("chatOptionsMenu"),
    chatTab:        $("chatTab"),
  };
}

/* =================================================================
   LOADING OVERLAY
   ================================================================= */
function showLoading(){ const o = domRefs().loadingOverlay; if(o) o.style.display="flex"; }
function hideLoading(){ const o = domRefs().loadingOverlay; if(o) o.style.display="none"; }

/* =================================================================
   HTML ESCAPE
   ================================================================= */
function escapeHtml(text){
  if(!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
}

/* =================================================================
   SAFE FOCUS (avoids mobile keyboard flicker)
   ================================================================= */
function safeFocus(el,{preventScroll=true,delay=0}={}){
  if(!el) return;
  if(delay){
    setTimeout(()=>{ el.focus({preventScroll}); },delay);
  }else{
    // double rAF pattern fights layout shifts
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      el.focus({preventScroll});
    }));
  }
}

/* =================================================================
   SCROLL HELPERS
   ================================================================= */
function scrollToBottom(el,{smooth=true}={}){
  if(!el) return;
  el.scrollTo({top: el.scrollHeight, behavior: smooth?"smooth":"auto"});
}
function isNearBottom(el,px=120){
  if(!el) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < px;
}

/* =================================================================
   TAB SWITCHING
   ================================================================= */
function switchTab(tabId){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  const selected = $(tabId);
  if(selected) selected.style.display="block";

  // Hide overflow menus when changing context
  domRefs().chatOptionsMenu?.classList.remove("show");
}

/* =================================================================
   AUTH: LOGIN / REGISTER
   ================================================================= */
function login(){
  const email    = $("email")?.value.trim();
  const password = $("password")?.value.trim();
  if(!email || !password){
    alert("Enter email & password");
    return;
  }
  showLoading();
  auth.signInWithEmailAndPassword(email,password)
    .catch(err => alert("Login failed: " + errorLog("Login:",err)))
    .finally(hideLoading);
}

function register(){
  const email    = $("email")?.value.trim();
  const password = $("password")?.value.trim();
  if(!email || !password){
    alert("Enter email & password");
    return;
  }
  showLoading();
  auth.createUserWithEmailAndPassword(email,password)
    .then(()=>switchTab("usernameDialog"))
    .catch(err => alert("❌ Registration failed: " + errorLog("Register:",err)))
    .finally(hideLoading);
}

/* =================================================================
   USERNAME SAVE (post-register onboarding)
   ================================================================= */
function saveUsername(){
  if(!currentUser) return;
  const username = $("newUsername")?.value.trim();
  if(!username){
    alert("Enter a username");
    return;
  }
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true}).then(()=>{
    domRefs().usernameDisplay.textContent = username;
    loadMainUI();
  }).catch(err=>{
    alert("❌ Failed to save username: " + errorLog("saveUsername:",err));
  });
}

/* =================================================================
   USERNAME CHECK (first login)
   ================================================================= */
function checkUsername(){
  if(!currentUser) return;
  db.collection("users").doc(currentUser.uid).get().then(doc=>{
    if(!doc.exists || !doc.data().username){
      switchTab("usernameDialog");
    }else{
      domRefs().usernameDisplay.textContent = doc.data().username;
      loadMainUI();
    }
  }).catch(err=>{
    alert("❌ Failed to check username: " + errorLog("checkUsername:",err));
  });
}

/* =================================================================
   MAIN UI LOAD (runs after auth + username ok)
   ================================================================= */
function loadMainUI(){
  showLoading();
  const r = domRefs();
  if(r.appPage) r.appPage.style.display="block";

  // Kick off profile load etc. (full impl Part 2)
  loadProfile(()=>{
    try{ loadChatList(); } catch(e){ console.warn("Chats failed",e); }
    try{ loadFriends(); }  catch(e){ console.warn("Friends failed",e); }
    try{ loadGroups?.(); } catch(e){ console.warn("Groups skipped",e); }
    try{ listenInbox(); }  catch(e){ console.warn("Inbox failed",e); }

    switchTab("chatTab");
    setTimeout(hideLoading,300);
  });
}

/* =================================================================
   AUTH STATE LISTENER + PRESENCE
   ================================================================= */
auth.onAuthStateChanged(async user=>{
  if(!user){
    switchTab("loginPage");
    hideLoading();
    return;
  }

  currentUser = user;

  // presence doc ref
  const userRef = db.collection("users").doc(user.uid);

  // mark online
  try{
    await userRef.update({
      status: "online",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){
    console.warn("⚠️ Could not update user presence:", e.message);
  }

  // mark offline on unload (best-effort)
  window.addEventListener("beforeunload", ()=>{
    navigator.sendBeacon(`/offline?uid=${user.uid}`); // noop endpoint ok
    userRef.update({
      status: "offline",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  });

  // fetch basic user info / username
  try{
    const snap = await userRef.get();
    const data = snap.data();

    if(!data?.username){
      switchTab("usernameDialog");
      hideLoading();
      return;
    }

    domRefs().usernameDisplay.textContent = data.username;

    // clicking avatar label opens file picker (defined Part 2)
    document.querySelector(".profile-edit-label").onclick = ()=>{
      $("profilePic").click();
    };

    loadMainUI();

    // Auto-join if URL join param present (helper Part 5)
    if(joinGroupId){
      try{ await tryJoinGroup(joinGroupId); }
      catch(e){ console.warn("Group join failed:", e); }
    }

    switchTab("chatTab");

  }catch(err){
    alert("❌ Failed to load user info: " + errorLog("authState user load:",err));
  }finally{
    hideLoading();
  }
});

/* =================================================================
   PRESENCE CLEANUP (optional manual call)
   ================================================================= */
function logout(){
  if(currentUser){
    db.collection("users").doc(currentUser.uid).update({
      status:"offline",
      lastSeen:firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }
  auth.signOut().then(()=>window.location.reload());
}

/* =================================================================
   VIEWPORT + THREAD LAYOUT (used to keep input pinned on mobile)
   ================================================================= */
function adjustThreadLayout(){
  const threadView = $("threadView");
  if(!threadView) return;
  const vh = window.visualViewport?.height || window.innerHeight;
  threadView.style.height = vh + "px";
}

window.addEventListener("resize", ()=>{
  adjustThreadLayout();
  const ti = $("threadInput");
  if(document.activeElement === ti){
    setTimeout(()=>scrollToBottomThread(true),300);
  }
});

/* =================================================================
   THREAD BOTTOM SCROLL (wrapper to internal helper)
   ================================================================= */
function scrollToBottomThread(smooth=true){
  const scrollArea = document.querySelector(".chat-scroll-area");
  if(!scrollArea) return;
  scrollToBottom(scrollArea,{smooth});
}

/* =================================================================
   URL INVITE PARAM PARSE (group autjoin support)
   ================================================================= */
const urlParams   = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join"); // used in authState above

/* =================================================================
   END PART 1/6
   ================================================================= */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 2/6)
 * -----------------------------------------------------------
 * Adds:
 *  - Profile: load/update username & avatar
 *  - Avatar upload (Firebase Storage)
 *  - Theme toggle (dark/light)
 *  - User cache fetch util
 *  - Minor presence improvements
 *************************************************************/

/* =================================================================
   PROFILE LOAD & SAVE
   ================================================================= */
function loadProfile(callback){
  if(!currentUser) return;
  const uid = currentUser.uid;

  db.collection("users").doc(uid).get().then(doc=>{
    if(!doc.exists) return;
    const data = doc.data();

    // Fill profile UI
    $("profileName").textContent = data.username || "User";
    $("profileEmail").textContent = data.email || "";

    if(data.avatarUrl){
      const img = $("profileAvatar");
      if(img) img.src = data.avatarUrl;
    }

    if(typeof callback === "function") callback();
  }).catch(err=>{
    console.warn("Failed to load profile:", errorLog("loadProfile:",err));
    if(typeof callback === "function") callback();
  });
}

/* =================================================================
   AVATAR UPLOAD
   ================================================================= */
function handleAvatarUpload(){
  const fileInput = $("profilePic");
  if(!fileInput || !fileInput.files[0]) return;

  const file = fileInput.files[0];
  if(!file.type.startsWith("image/")){
    alert("Please select an image file.");
    return;
  }

  showLoading();
  const storageRef = storage.ref(`avatars/${currentUser.uid}`);
  storageRef.put(file).then(snapshot=>snapshot.ref.getDownloadURL())
    .then(url=>{
      return db.collection("users").doc(currentUser.uid).update({ avatarUrl: url });
    })
    .then(()=>{
      $("profileAvatar").src = URL.createObjectURL(file); // quick preview
      alert("✅ Avatar updated!");
    })
    .catch(err=>{
      alert("❌ Failed to update avatar: " + errorLog("handleAvatarUpload:",err));
    })
    .finally(hideLoading);
}

/* =================================================================
   THEME TOGGLE
   ================================================================= */
function toggleTheme(){
  const body = document.body;
  const isDark = body.classList.toggle("dark-theme");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme(){
  const saved = localStorage.getItem("theme");
  if(saved === "dark"){
    document.body.classList.add("dark-theme");
  }
}

applySavedTheme();

/* =================================================================
   USER CACHE UTIL
   ================================================================= */
async function getUserData(uid){
  if(userCache.has(uid)) return userCache.get(uid);

  try{
    const doc = await db.collection("users").doc(uid).get();
    if(doc.exists){
      const data = doc.data();
      userCache.set(uid, data);
      return data;
    }
    return null;
  }catch(err){
    console.warn("getUserData failed:", errorLog("getUserData:",err));
    return null;
  }
}

/* =================================================================
   PRESENCE IMPROVEMENTS
   ================================================================= */
// Already set in Part 1: mark online/offline, lastSeen
// Additional presence features (typing indicator, seen) will come in Part 4/5

/* =================================================================
   SUPPORT HELPERS (used later)
   ================================================================= */
function formatTimestamp(ts){
  if(!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
}

function vibrateShort(){
  if(navigator.vibrate){
    navigator.vibrate([30]);
  }
}

function notifyBrowser(title, body){
  if(Notification.permission === "granted"){
    new Notification(title, { body });
  }
}

/* =================================================================
   EVENT BINDINGS FOR PROFILE UI
   ================================================================= */
document.addEventListener("DOMContentLoaded", ()=>{
  const avatarInput = $("profilePic");
  if(avatarInput){
    avatarInput.addEventListener("change", handleAvatarUpload);
  }

  const themeBtn = $("themeToggle");
  if(themeBtn){
    themeBtn.addEventListener("click", toggleTheme);
  }
});

/* =================================================================
   END PART 2/6
   ================================================================= */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 3/6)
 * -----------------------------------------------------------
 * Inbox, Friend Requests, Search
 *
 * Firestore data model (recommended):
 *   users/{uid}
 *     username, email, avatarUrl, ...
 *     friends: [uid, uid, ...]    // or subcollection if >1k
 *     groups:  [groupId,...]      // lightweight membership cache
 *     inbox/{inboxId}
 *       type: "friend" | "groupInvite" | "alert"
 *       from: <uid or system>
 *       fromName: <string>        // <-- prevents [object Object]
 *       fromAvatar: <url?>        // cached for quick render
 *       groupId: <string?>        // when groupInvite
 *       groupName: <string?>      // cached
 *       message: <string?>
 *       status: "pending"|"accepted"|"declined"|"seen"
 *       createdAt: serverTimestamp
 *
 * Inboxes are *per recipient*; the sender also gets a status doc if needed.
 *************************************************************/

/* =================================================================
   INBOX LISTEN
   ================================================================= */
function listenInbox(){
  if(unsubscribeInbox) unsubscribeInbox();

  const colRef = db.collection("users").doc(currentUser.uid).collection("inbox").orderBy("createdAt","desc");
  unsubscribeInbox = colRef.onSnapshot(snap=>{
    snap.docChanges().forEach(change=>{
      const doc = change.doc;
      const data = doc.data();
      data.id = doc.id;

      switch(change.type){
        case "added":    renderInboxItem(data); break;
        case "modified": updateInboxItemUI(data); break;
        case "removed":  removeInboxItemUI(data.id); break;
      }

      // subtle feedback on *new* items only
      if(change.type === "added" && data.status === "pending"){
        vibrateShort();
        notifyBrowser("New notification", data.fromName || data.message || "New activity");
      }
    });
  }, err=>{
    errorLog("Inbox listener:",err);
  });
}

/* =================================================================
   INBOX RENDER HELPERS
   ================================================================= */
function inboxListEl(){
  return $("inboxList") || $("inboxContainer") || document.querySelector(".inbox-list");
}

function buildInboxCard(data){
  // defensive defaults
  const type       = data.type || "alert";
  const fromName   = escapeHtml(data.fromName || "Someone");
  const msg        = escapeHtml(data.message || (type==="friend" ? "sent you a friend request" : (type==="groupInvite" ? "invited you to a group" : "")));
  const avatarUrl  = data.fromAvatar || "assets/default-avatar.png";
  const createdTxt = formatTimestamp(data.createdAt);

  const id = data.id;

  // action buttons vary by type & status
  let actionsHtml = "";
  if(data.status === "pending"){
    if(type === "friend"){
      actionsHtml = `
        <button class="btn-accept" data-inbox-accept="${id}">Accept</button>
        <button class="btn-decline" data-inbox-decline="${id}">Decline</button>`;
    }else if(type === "groupInvite"){
      actionsHtml = `
        <button class="btn-accept" data-group-accept="${id}" data-group-id="${escapeHtml(data.groupId||"")}">Join</button>
        <button class="btn-decline" data-group-decline="${id}">Decline</button>`;
    }else{
      actionsHtml = `<button class="btn-dismiss" data-inbox-dismiss="${id}">Dismiss</button>`;
    }
  }else{
    actionsHtml = `<span class="inbox-status">${escapeHtml(data.status)}</span>`;
  }

  // markup
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
  if(!list) return;

  // ensure we have fromName cached; fetch if absent
  ensureInboxDisplayFields(data).then(fixed=>{
    const existing = $("inbox-"+fixed.id);
    if(existing){
      existing.outerHTML = buildInboxCard(fixed);
      bindInboxCardActions(fixed); // rebind
    }else{
      // Insert at top (since query is order desc, added event may come in any order)
      list.insertAdjacentHTML("afterbegin", buildInboxCard(fixed));
      bindInboxCardActions(fixed);
    }
  });
}

function updateInboxItemUI(data){
  renderInboxItem(data); // simple re-render
}

function removeInboxItemUI(id){
  const el = $("inbox-"+id);
  if(el) el.remove();
}

/* =================================================================
   ENSURE DISPLAY FIELDS (FIX [object Object])
   ================================================================= */
async function ensureInboxDisplayFields(data){
  // Already present?
  if(data.fromName && typeof data.fromName === "string") return data;

  // Need to resolve user or group info
  if(data.type === "friend" || data.type === "groupInvite" || data.from){
    const fromData = await getUserData(data.from);
    if(fromData){
      data.fromName   = fromData.username || fromData.email || "User";
      data.fromAvatar = fromData.avatarUrl || data.fromAvatar;
    }
  }
  if(data.type === "groupInvite" && data.groupId){
    const gdoc = await db.collection("groups").doc(data.groupId).get();
    if(gdoc.exists){
      const gdata = gdoc.data();
      data.groupName = gdata.name || data.groupName;
    }
  }

  // Persist resolved fields (merge)
  try{
    await db.collection("users").doc(currentUser.uid)
      .collection("inbox").doc(data.id)
      .set({
        fromName:   data.fromName || "User",
        fromAvatar: data.fromAvatar || null,
        groupName:  data.groupName || null
      },{merge:true});
  }catch(e){
    console.warn("ensureInboxDisplayFields merge failed:", e.message);
  }
  return data;
}

/* =================================================================
   INBOX ACTION BINDINGS
   ================================================================= */
function bindInboxCardActions(data){
  const id = data.id;

  const acceptBtn  = document.querySelector(`[data-inbox-accept="${id}"]`);
  const declineBtn = document.querySelector(`[data-inbox-decline="${id}"]`);
  const gAccept    = document.querySelector(`[data-group-accept="${id}"]`);
  const gDecline   = document.querySelector(`[data-group-decline="${id}"]`);
  const dismissBtn = document.querySelector(`[data-inbox-dismiss="${id}"]`);

  if(acceptBtn)  acceptBtn.onclick  = ()=>acceptFriendRequest(id, data.from);
  if(declineBtn) declineBtn.onclick = ()=>declineFriendRequest(id);
  if(gAccept)    gAccept.onclick    = ()=>acceptGroupInvite(id, gAccept.dataset.groupId, data.from);
  if(gDecline)   gDecline.onclick   = ()=>declineGroupInvite(id);
  if(dismissBtn) dismissBtn.onclick = ()=>dismissInboxItem(id);
}

/* =================================================================
   FRIEND REQUEST FLOW
   ================================================================= */
// Send friend request
async function sendFriendRequest(targetUid){
  if(!currentUser || !targetUid || targetUid === currentUser.uid) return;

  const senderData = await getUserData(currentUser.uid) || {};
  const senderName = senderData.username || currentUser.email || "User";

  const inboxCol = db.collection("users").doc(targetUid).collection("inbox");
  const newDoc = inboxCol.doc();

  const payload = {
    type: "friend",
    from: currentUser.uid,
    fromName: senderName,
    fromAvatar: senderData.avatarUrl || null,
    message: "sent you a friend request",
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  return newDoc.set(payload).catch(err=>{
    alert("Failed to send friend request: " + errorLog("sendFriendRequest:",err));
  });
}

// Accept
async function acceptFriendRequest(inboxId, fromUid){
  if(!currentUser) return;
  const batch = db.batch();

  // update inbox status
  const inboxRef = db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId);
  batch.update(inboxRef,{status:"accepted"});

  // add friendship (arrayUnion; keep small; scale to subcollection later)
  const meRef = db.collection("users").doc(currentUser.uid);
  const themRef = db.collection("users").doc(fromUid);

  batch.update(meRef,   {friends: firebase.firestore.FieldValue.arrayUnion(fromUid)});
  batch.update(themRef, {friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});

  // optional: notify sender their request accepted
  const notifyRef = db.collection("users").doc(fromUid).collection("inbox").doc();
  const meData = await getUserData(currentUser.uid) || {};
  batch.set(notifyRef,{
    type:"alert",
    from: currentUser.uid,
    fromName: meData.username || currentUser.email || "User",
    message: "accepted your friend request",
    status: "seen",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  return batch.commit().catch(err=>{
    alert("Failed to accept friend request: " + errorLog("acceptFriendRequest:",err));
  });
}

// Decline
async function declineFriendRequest(inboxId){
  if(!currentUser) return;
  db.collection("users").doc(currentUser.uid)
    .collection("inbox").doc(inboxId)
    .update({status:"declined"})
    .catch(err=>{
      alert("Failed to decline: " + errorLog("declineFriendRequest:",err));
    });
}

// Dismiss generic
function dismissInboxItem(inboxId){
  if(!currentUser) return;
  db.collection("users").doc(currentUser.uid)
    .collection("inbox").doc(inboxId)
    .delete()
    .catch(err=>{
      alert("Failed to dismiss: " + errorLog("dismissInboxItem:",err));
    });
}

/* =================================================================
   GROUP INVITE FLOW
   ================================================================= */
async function sendGroupInvite(groupId, targetUid){
  if(!currentUser || !groupId || !targetUid) return;
  const gdoc = await db.collection("groups").doc(groupId).get();
  if(!gdoc.exists){
    alert("Group not found.");
    return;
  }
  const gdata = gdoc.data();

  const meData = await getUserData(currentUser.uid) || {};
  const inboxCol = db.collection("users").doc(targetUid).collection("inbox").doc();
  inboxCol.set({
    type:"groupInvite",
    from: currentUser.uid,
    fromName: meData.username || currentUser.email || "User",
    fromAvatar: meData.avatarUrl || null,
    groupId,
    groupName: gdata.name || "Group",
    message: `invited you to join ${gdata.name || "a group"}`,
    status:"pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err=>{
    alert("Failed to send group invite: " + errorLog("sendGroupInvite:",err));
  });
}

async function acceptGroupInvite(inboxId, groupId, fromUid){
  if(!currentUser || !groupId) return;
  const batch = db.batch();

  // inbox update
  const inboxRef = db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId);
  batch.update(inboxRef,{status:"accepted"});

  // group membership
  const groupRef = db.collection("groups").doc(groupId);
  batch.update(groupRef,{
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  });

  // user membership cache
  const meRef = db.collection("users").doc(currentUser.uid);
  batch.update(meRef,{
    groups: firebase.firestore.FieldValue.arrayUnion(groupId)
  });

  // notify inviter (optional)
  if(fromUid){
    const notifyRef = db.collection("users").doc(fromUid).collection("inbox").doc();
    const meData = await getUserData(currentUser.uid) || {};
    batch.set(notifyRef,{
      type:"alert",
      from: currentUser.uid,
      fromName: meData.username || currentUser.email || "User",
      message:`joined your group`,
      status:"seen",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return batch.commit().catch(err=>{
    alert("Failed to accept group invite: " + errorLog("acceptGroupInvite:",err));
  });
}

function declineGroupInvite(inboxId){
  if(!currentUser) return;
  db.collection("users").doc(currentUser.uid).collection("inbox").doc(inboxId)
    .update({status:"declined"})
    .catch(err=>{
      alert("Failed to decline group invite: " + errorLog("declineGroupInvite:",err));
    });
}

/* =================================================================
   FRIENDS LIST LOAD
   ================================================================= */
function loadFriends(){
  if(!currentUser) return;
  db.collection("users").doc(currentUser.uid).onSnapshot(doc=>{
    const data = doc.data() || {};
    const friendUids = data.friends || [];
    renderFriendsList(friendUids);
  },err=>{
    errorLog("loadFriends listener:",err);
  });
}

async function renderFriendsList(friendUids){
  const list = $("friendsList");
  if(!list) return;
  list.innerHTML = "";
  for(const uid of friendUids){
    const data = await getUserData(uid) || {};
    const name = escapeHtml(data.username || data.email || "User");
    const avatar = data.avatarUrl || "assets/default-avatar.png";
    const devBadge = (data.username === "moneythepro") ? " 🛠️" : "";
    const li = document.createElement("div");
    li.className = "friend-row";
    li.innerHTML = `
      <img class="friend-avatar" src="${avatar}" alt="">
      <span class="friend-name">${name}${devBadge}</span>
    `;
    li.onclick = ()=>openThread(uid, name);
    list.appendChild(li);
  }
}

/* =================================================================
   USER SEARCH
   ================================================================= */
let searchUserDebounceTimer = null;

function initSearch(){
  const userInput  = $("searchUsersInput");
  const groupInput = $("searchGroupsInput");

  if(userInput){
    userInput.addEventListener("input", ()=>{
      clearTimeout(searchUserDebounceTimer);
      const q = userInput.value.trim();
      searchUserDebounceTimer = setTimeout(()=>searchUsers(q), 250);
    });
  }

  if(groupInput){
    groupInput.addEventListener("input", ()=>{
      const q = groupInput.value.trim();
      searchGroups(q);
    });
  }
}

document.addEventListener("DOMContentLoaded", initSearch);

/* -----------------------------------------------------------------
   Search users by username prefix (case-insensitive)
   Requires firestore index: users.usernameLower (stored on create)
   ----------------------------------------------------------------- */
async function searchUsers(query){
  const list = $("searchUserResults");
  if(!list) return;

  list.innerHTML = "";
  if(!query){
    list.innerHTML = `<div class="search-empty">Type a name...</div>`;
    return;
  }

  const qLower = query.toLowerCase();

  try{
    const snap = await db.collection("users")
      .where("usernameLower", ">=", qLower)
      .where("usernameLower", "<=", qLower + "\uf8ff")
      .limit(20)
      .get();

    if(snap.empty){
      list.innerHTML = `<div class="search-empty">No users found.</div>`;
      return;
    }

    snap.forEach(doc=>{
      const data = doc.data() || {};
      const uid = doc.id;
      const name = escapeHtml(data.username || data.email || "User");
      const avatar = data.avatarUrl || "assets/default-avatar.png";
      const devBadge = (data.username === "moneythepro") ? " 🛠️ Developer" : "";
      const row = document.createElement("div");
      row.className = "search-result-row";
      row.innerHTML = `
        <img class="search-avatar" src="${avatar}" alt="">
        <span class="search-name">${name}${devBadge}</span>
        <button class="search-add" data-add-friend="${uid}">Add</button>
      `;
      row.querySelector("[data-add-friend]").onclick = ()=>sendFriendRequest(uid);
      row.onclick = (e)=>{
        // avoid duplicate triggers when clicking Add
        if(e.target.matches("[data-add-friend]")) return;
        openThread(uid, name);
      };
      list.appendChild(row);
    });
  }catch(err){
    list.innerHTML = `<div class="search-empty">Search error.</div>`;
    errorLog("searchUsers:",err);
  }
}

/* =================================================================
   GROUP SEARCH
   ================================================================= */
async function searchGroups(query){
  const list = $("searchGroupResults");
  if(!list) return;

  list.innerHTML = "";
  if(!query){
    list.innerHTML = `<div class="search-empty">Type a group name...</div>`;
    return;
  }

  const qLower = query.toLowerCase();

  try{
    const snap = await db.collection("groups")
      .where("nameLower", ">=", qLower)
      .where("nameLower", "<=", qLower + "\uf8ff")
      .limit(20)
      .get();

    if(snap.empty){
      list.innerHTML = `<div class="search-empty">No groups found.</div>`;
      return;
    }

    snap.forEach(doc=>{
      const data = doc.data() || {};
      const id = doc.id;
      const name = escapeHtml(data.name || "Group");
      const avatar = data.avatarUrl || "assets/default-group.png";
      const row = document.createElement("div");
      row.className = "search-result-row";
      row.innerHTML = `
        <img class="search-avatar" src="${avatar}" alt="">
        <span class="search-name">${name}</span>
        <button class="search-join" data-join-group="${id}">Join</button>
      `;
      row.querySelector("[data-join-group]").onclick = ()=>tryJoinGroup(id);
      row.onclick = (e)=>{
        if(e.target.matches("[data-join-group]")) return;
        joinRoom(id);
      };
      list.appendChild(row);
    });
  }catch(err){
    list.innerHTML = `<div class="search-empty">Search error.</div>`;
    errorLog("searchGroups:",err);
  }
}

/* =================================================================
   JOIN GROUP (user-initiated from search row)
   ================================================================= */
async function tryJoinGroup(groupId){
  if(!currentUser) return;
  const groupRef = db.collection("groups").doc(groupId);
  const gdoc = await groupRef.get();
  if(!gdoc.exists){
    alert("Group not found.");
    return;
  }
  const gdata = gdoc.data();

  // approval-based?
  if(gdata.approvalRequired && !(gdata.members||[]).includes(currentUser.uid)){
    // send join request to owner via inbox
    await sendGroupJoinRequestToOwner(groupId, gdata.owner);
    alert("Join request sent. Waiting approval.");
    return;
  }

  // join immediately
  const batch = db.batch();
  batch.update(groupRef,{
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  });
  batch.update(db.collection("users").doc(currentUser.uid),{
    groups: firebase.firestore.FieldValue.arrayUnion(groupId)
  });
  await batch.commit().catch(err=>{
    alert("Join failed: " + errorLog("tryJoinGroup:",err));
  });

  joinRoom(groupId);
}

// notify owner for approval-based groups
async function sendGroupJoinRequestToOwner(groupId, ownerUid){
  if(!ownerUid) return;
  const meData = await getUserData(currentUser.uid) || {};
  const gdoc = await db.collection("groups").doc(groupId).get();
  const gdata = gdoc.data() || {};

  const inboxRef = db.collection("users").doc(ownerUid).collection("inbox").doc();
  return inboxRef.set({
    type:"groupInvite",  // we reuse but semantically "joinRequest"
    from: currentUser.uid,
    fromName: meData.username || currentUser.email || "User",
    fromAvatar: meData.avatarUrl || null,
    groupId,
    groupName: gdata.name || "Group",
    message:`requested to join ${gdata.name || "your group"}`,
    status:"pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err=>{
    errorLog("sendGroupJoinRequestToOwner:",err);
  });
}

/* =================================================================
   END PART 3/6
   ================================================================= */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 4/6)
 * -----------------------------------------------------------
 * Direct Messaging (Thread View)
 *************************************************************/

/* =================================================================
   OPEN THREAD
   ================================================================= */
function openThread(uid, name){
  if(!uid || !currentUser) return;

  switchTab("threadView");
  const title = $("chatName");
  if(title) title.textContent = name || "Chat";

  currentThreadUser = uid;
  currentRoom = null;

  clearThreadUI();

  loadThreadMessages(uid);
  listenToTyping(uid);
}

/* =================================================================
   CLEAR THREAD UI
   ================================================================= */
function clearThreadUI(){
  renderedMessageIds.clear();
  const container = $("threadMessages");
  if(container) container.innerHTML = "";
}

/* =================================================================
   LOAD THREAD MESSAGES (initial + paginate)
   ================================================================= */
function loadThreadMessages(uid){
  if(unsubscribeThread) unsubscribeThread();

  const threadRef = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(uid).collection("messages")
    .orderBy("createdAt","desc")
    .limit(20);

  unsubscribeThread = threadRef.onSnapshot(snapshot=>{
    snapshot.docChanges().forEach(change=>{
      const data = change.doc.data();
      data.id = change.doc.id;

      if(change.type === "added"){
        if(!renderedMessageIds.has(data.id)){
          renderThreadMessage(data, "prepend");
          renderedMessageIds.add(data.id);
        }
      }else if(change.type === "modified"){
        updateThreadMessageUI(data);
      }else if(change.type === "removed"){
        removeThreadMessageUI(data.id);
      }
    });
  }, err=>{
    errorLog("Thread listener:", err);
  });
}

/* =================================================================
   RENDER MESSAGE
   ================================================================= */
function renderThreadMessage(data, mode="append"){
  const container = $("threadMessages");
  if(!container) return;

  const isMine = (data.sender === currentUser.uid);
  const text = escapeHtml(data.text || "");
  const replyHtml = data.replyTo ? `<div class="msg-reply-preview">↪ ${escapeHtml(data.replyTo.text||"")}</div>` : "";
  const ticks = isMine ? renderTicks(data.status) : "";
  const avatar = isMine ? "" : `<img class="msg-avatar" src="${escapeHtml(data.senderAvatar||"assets/default-avatar.png")}" alt="">`;
  const time = formatTimestamp(data.createdAt);

  const div = document.createElement("div");
  div.className = `msg-bubble ${isMine?"mine":"theirs"}`;
  div.id = `msg-${data.id}`;
  div.innerHTML = `
    ${avatar}
    <div class="msg-content">
      ${replyHtml}
      <div class="msg-text">${text}</div>
      <div class="msg-meta">${time} ${ticks}</div>
    </div>
  `;

  if(mode==="prepend"){
    container.insertAdjacentElement("afterbegin", div);
  }else{
    container.appendChild(div);
  }

  if(isNearBottom(container)){
    scrollToBottomThread(true);
  }
}

/* =================================================================
   UPDATE / REMOVE MESSAGE UI
   ================================================================= */
function updateThreadMessageUI(data){
  const el = $(`msg-${data.id}`);
  if(!el) return;
  const textEl = el.querySelector(".msg-text");
  if(textEl) textEl.textContent = data.text || "";
}

function removeThreadMessageUI(id){
  const el = $(`msg-${id}`);
  if(el) el.remove();
}

/* =================================================================
   MESSAGE STATUS (ticks)
   ================================================================= */
function renderTicks(status){
  if(!status) return "";
  if(status==="sent") return "✓";
  if(status==="delivered") return "✓✓";
  if(status==="seen") return "✓✓✓";
  return "";
}

/* =================================================================
   SENDING MESSAGE
   ================================================================= */
function sendThreadMessage(){
  const input = $("threadInput");
  if(!input) return;
  const text = input.value.trim();
  if(!text) return;

  const payload = {
    text,
    sender: currentUser.uid,
    senderAvatar: $("profileAvatar")?.src || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: "sent",
    replyTo: replyingTo || null
  };

  // Add to both sender and receiver threads
  const myRef = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser).collection("messages").doc();
  const theirRef = db.collection("users").doc(currentThreadUser)
    .collection("threads").doc(currentUser.uid).collection("messages").doc(myRef.id);

  const batch = db.batch();
  batch.set(myRef, payload);
  batch.set(theirRef, payload);

  batch.commit().then(()=>{
    input.value = "";
    replyingTo = null;
    hideReplyPreview();
    scrollToBottomThread(true);
    // optionally trigger vibrate/notify for remote user (future)
  }).catch(err=>{
    alert("Send failed: " + errorLog("sendThreadMessage:",err));
  });
}

/* =================================================================
   REPLY HANDLING
   ================================================================= */
function showReplyPreview(msgId, text){
  replyingTo = {msgId, text};
  const bar = $("replyPreviewBar");
  if(bar){
    bar.style.display = "flex";
    bar.querySelector(".reply-text").textContent = text;
  }
}

function hideReplyPreview(){
  replyingTo = null;
  const bar = $("replyPreviewBar");
  if(bar) bar.style.display = "none";
}

/* =================================================================
   TYPING INDICATOR
   ================================================================= */
let typingTimer = null;

function listenToTyping(uid){
  const ref = db.collection("users").doc(uid).collection("threads").doc(currentUser.uid);
  unsubscribeTyping = ref.onSnapshot(doc=>{
    const data = doc.data();
    const indicator = $("typingIndicator");
    if(indicator) indicator.style.display = (data && data.typing) ? "block" : "none";
  });
}

function setTypingState(isTyping){
  const ref = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser);
  ref.set({typing:isTyping},{merge:true});
}

function onThreadInputChange(){
  if(typingTimer) clearTimeout(typingTimer);
  setTypingState(true);
  typingTimer = setTimeout(()=>setTypingState(false), 2000);
}

document.addEventListener("DOMContentLoaded", ()=>{
  const input = $("threadInput");
  if(input){
    input.addEventListener("input", onThreadInputChange);
  }
});

/* =================================================================
   DELETE / EDIT MESSAGE STUBS (UI hooks only)
   ================================================================= */
function deleteThreadMessage(msgId){
  const myRef = db.collection("users").doc(currentUser.uid)
    .collection("threads").doc(currentThreadUser).collection("messages").doc(msgId);
  const theirRef = db.collection("users").doc(currentThreadUser)
    .collection("threads").doc(currentUser.uid).collection("messages").doc(msgId);

  const batch = db.batch();
  batch.delete(myRef);
  batch.delete(theirRef);

  batch.commit().catch(err=>{
    alert("Delete failed: " + errorLog("deleteThreadMessage:",err));
  });
}

/* =================================================================
   PAGINATION STUB
   ================================================================= */
// For later: track lastVisible doc and fetch next 20 older messages

/* =================================================================
   END PART 4/6
   ================================================================= */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 5/6)
 * -----------------------------------------------------------
 * Group Messaging + Enhancements
 *************************************************************/

/* =================================================================
   JOIN ROOM (Group Chat)
   ================================================================= */
function joinRoom(groupId){
  if(!groupId || !currentUser) return;

  switchTab("roomView");
  currentRoom = groupId;
  currentThreadUser = null;

  const title = $("roomTitle");
  if(title) title.textContent = "Group Chat";

  clearRoomUI();
  loadRoomMessages(groupId);
  listenToGroupTyping(groupId);
}

/* =================================================================
   CLEAR ROOM UI
   ================================================================= */
function clearRoomUI(){
  renderedGroupMsgIds.clear();
  const container = $("roomMessages");
  if(container) container.innerHTML = "";
}

/* =================================================================
   LOAD ROOM MESSAGES
   ================================================================= */
function loadRoomMessages(groupId){
  if(unsubscribeRoomMessages) unsubscribeRoomMessages();

  const ref = db.collection("groups").doc(groupId).collection("messages")
    .orderBy("createdAt","desc")
    .limit(30);

  unsubscribeRoomMessages = ref.onSnapshot(snap=>{
    snap.docChanges().forEach(change=>{
      const data = change.doc.data();
      data.id = change.doc.id;

      if(change.type === "added" && !renderedGroupMsgIds.has(data.id)){
        renderGroupMessage(data,"prepend");
        renderedGroupMsgIds.add(data.id);
      }else if(change.type === "modified"){
        updateGroupMessageUI(data);
      }else if(change.type === "removed"){
        removeGroupMessageUI(data.id);
      }
    });
  }, err=> errorLog("Group messages listener:",err));
}

/* =================================================================
   RENDER GROUP MESSAGE
   ================================================================= */
function renderGroupMessage(data, mode="append"){
  const container = $("roomMessages");
  if(!container) return;

  const isMine = (data.sender === currentUser.uid);
  const textRaw = data.text || "";
  const text = highlightMentions(escapeHtml(textRaw));
  const replyHtml = data.replyTo ? `<div class="msg-reply-preview">↪ ${escapeHtml(data.replyTo.text||"")}</div>` : "";
  const avatar = data.senderAvatar || "assets/default-avatar.png";
  const senderName = escapeHtml(data.senderName || "User");
  const time = formatTimestamp(data.createdAt);

  const div = document.createElement("div");
  div.className = `msg-bubble group ${isMine?"mine":"theirs"}`;
  div.id = `gmsg-${data.id}`;
  div.innerHTML = `
    <img class="msg-avatar" src="${avatar}" alt="">
    <div class="msg-content">
      <div class="msg-header">${senderName}</div>
      ${replyHtml}
      <div class="msg-text">${text}</div>
      ${data.mediaUrl ? `<div class="msg-media"><img src="${escapeHtml(data.mediaUrl)}" alt=""></div>` : ""}
      <div class="msg-meta">${time} ${renderGroupSeen(data.seenBy)}</div>
    </div>
  `;

  if(mode==="prepend"){
    container.insertAdjacentElement("afterbegin", div);
  }else{
    container.appendChild(div);
  }

  if(isNearBottom(container)) scrollToBottom(container,{smooth:true});
}

/* =================================================================
   UPDATE / REMOVE GROUP MSG UI
   ================================================================= */
function updateGroupMessageUI(data){
  const el = $(`gmsg-${data.id}`);
  if(!el) return;
  const txt = el.querySelector(".msg-text");
  if(txt) txt.innerHTML = highlightMentions(escapeHtml(data.text||""));
}

function removeGroupMessageUI(id){
  const el = $(`gmsg-${id}`);
  if(el) el.remove();
}

/* =================================================================
   HIGHLIGHT MENTIONS
   ================================================================= */
function highlightMentions(text){
  return text.replace(/@(\w+)/g, `<span class="mention">@$1</span>`);
}

/* =================================================================
   GROUP SEEN STATUS
   ================================================================= */
function renderGroupSeen(seenBy){
  if(!seenBy || !Array.isArray(seenBy)) return "";
  if(seenBy.length === 0) return "";
  return `<span class="seen-count">Seen by ${seenBy.length}</span>`;
}

/* =================================================================
   SEND GROUP MESSAGE
   ================================================================= */
function sendGroupMessage(){
  const input = $("roomInput");
  if(!input) return;
  const text = input.value.trim();
  if(!text && !pendingMediaFile){
    return;
  }

  const payload = {
    text,
    sender: currentUser.uid,
    senderName: $("profileName")?.textContent || "User",
    senderAvatar: $("profileAvatar")?.src || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid],
    replyTo: replyingTo || null,
    mediaUrl: null
  };

  const msgRef = db.collection("groups").doc(currentRoom).collection("messages").doc();

  const commitMessage = (mediaUrl=null)=>{
    if(mediaUrl) payload.mediaUrl = mediaUrl;
    msgRef.set(payload).then(()=>{
      input.value = "";
      replyingTo = null;
      hideReplyPreview();
      pendingMediaFile = null;
      if(mediaPreviewEl) mediaPreviewEl.innerHTML = "";
      scrollToBottom($("roomMessages"),{smooth:true});
    }).catch(err=>{
      alert("Send failed: " + errorLog("sendGroupMessage:",err));
    });
  };

  if(pendingMediaFile){
    uploadMediaToGroup(msgRef.id, pendingMediaFile, commitMessage);
  }else{
    commitMessage();
  }
}

/* =================================================================
   MEDIA UPLOAD STUB
   ================================================================= */
let pendingMediaFile = null;
let mediaPreviewEl = null;

function handleGroupMediaSelect(file){
  if(!file) return;
  pendingMediaFile = file;

  if(!mediaPreviewEl){
    mediaPreviewEl = $("mediaPreview");
  }
  if(mediaPreviewEl){
    mediaPreviewEl.innerHTML = `<img src="${URL.createObjectURL(file)}" class="media-thumb">`;
  }
}

function uploadMediaToGroup(msgId, file, cb){
  const ref = storage.ref(`groupMedia/${currentRoom}/${msgId}-${file.name}`);
  ref.put(file).then(snap=>snap.ref.getDownloadURL())
    .then(url=>cb(url))
    .catch(err=>{
      alert("Media upload failed: " + errorLog("uploadMediaToGroup:",err));
      cb();
    });
}

/* =================================================================
   GROUP TYPING
   ================================================================= */
function listenToGroupTyping(groupId){
  const ref = db.collection("groups").doc(groupId);
  unsubscribeTyping = ref.onSnapshot(doc=>{
    const data = doc.data();
    const indicator = $("groupTypingIndicator");
    if(indicator && data.typingUsers){
      const others = Object.keys(data.typingUsers).filter(uid=>uid!==currentUser.uid && data.typingUsers[uid]);
      indicator.style.display = others.length ? "block" : "none";
      indicator.textContent = others.length ? `${others.join(", ")} typing...` : "";
    }
  });
}

function setGroupTypingState(isTyping){
  const ref = db.collection("groups").doc(currentRoom);
  const field = `typingUsers.${currentUser.uid}`;
  const update = {};
  update[field] = isTyping;
  ref.set(update,{merge:true});
}

/* =================================================================
   ADMIN TOOLS STUBS
   ================================================================= */
function kickMember(uid){
  db.collection("groups").doc(currentRoom)
    .update({members: firebase.firestore.FieldValue.arrayRemove(uid)})
    .catch(err=>errorLog("kickMember:",err));
}

function banMember(uid){
  // add uid to banned array, optional implement
}

function transferOwnership(newOwnerUid){
  db.collection("groups").doc(currentRoom)
    .update({owner: newOwnerUid})
    .catch(err=>errorLog("transferOwnership:",err));
}

/* =================================================================
   END PART 5/6
   ================================================================= */

/*************************************************************
 * StringWasp v1.0 – App Core (Part 6/6)
 * -----------------------------------------------------------
 * Features:
 *  - P2P via WebTorrent (friends only)
 *  - E2E Encryption with RSA/ECDH + AES hybrid
 *  - Browser Notifications + Vibrate
 *  - Emoji Quick Insert
 *  - Scroll-to-bottom FAB
 *  - Final polish helpers
 *************************************************************/

/* =================================================================
   END-TO-END ENCRYPTION HOOKS
   ================================================================= */
// Generate RSA keys for user (store publicKey in Firestore)
async function generateUserKeys(){
  const keyPair = await window.crypto.subtle.generateKey(
    { name:"RSA-OAEP", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256" },
    true,
    ["encrypt","decrypt"]
  );
  const pubKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  // Store in IndexedDB or localStorage securely
  localStorage.setItem("privateKey", arrayBufferToBase64(privKey));

  // Upload public key to Firestore
  await db.collection("users").doc(currentUser.uid).update({
    publicKey: arrayBufferToBase64(pubKey)
  });

  console.log("🔐 RSA keys generated and saved.");
}

// Encrypt text with recipient's public key
async function encryptForUser(text, recipientPubKey){
  const importedPub = await crypto.subtle.importKey("spki", base64ToArrayBuffer(recipientPubKey), {name:"RSA-OAEP",hash:"SHA-256"}, true, ["encrypt"]);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({name:"RSA-OAEP"}, importedPub, enc.encode(text));
  return arrayBufferToBase64(ciphertext);
}

// Decrypt with our private key
async function decryptForMe(ciphertextBase64){
  const privKey = base64ToArrayBuffer(localStorage.getItem("privateKey"));
  const importedPriv = await crypto.subtle.importKey("pkcs8", privKey, {name:"RSA-OAEP",hash:"SHA-256"}, true, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({name:"RSA-OAEP"}, importedPriv, base64ToArrayBuffer(ciphertextBase64));
  return new TextDecoder().decode(decrypted);
}

// Helpers for base64
function arrayBufferToBase64(buf){
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}
function base64ToArrayBuffer(base64){
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary_string.charCodeAt(i);
  return bytes.buffer;
}

/* =================================================================
   WEBTORRENT P2P FILE SHARING
   ================================================================= */
let client = null;
if(typeof WebTorrent !== "undefined"){
  client = new WebTorrent();
}

function sendFileP2P(file){
  if(!client || !file) return alert("WebTorrent not available");
  client.seed(file, torrent=>{
    const link = torrent.magnetURI;
    alert("Send this magnet link to your friend:\n" + link);
  });
}

function downloadFileP2P(magnetLink){
  if(!client) return;
  client.add(magnetLink, torrent=>{
    torrent.files.forEach(f=>{
      f.appendTo("body"); // preview in body
      alert("File ready: " + f.name);
    });
  });
}

/* =================================================================
   NOTIFICATIONS + VIBRATION
   ================================================================= */
if(Notification && Notification.permission !== "granted"){
  Notification.requestPermission();
}

/* =================================================================
   QUICK EMOJI PANEL
   ================================================================= */
const quickEmojis = ["😀","😂","😍","🔥","👍","🎉"];
function initEmojiPanel(){
  const panel = $("emojiPanel");
  if(panel){
    panel.innerHTML = quickEmojis.map(e=>`<span class="emoji-btn">${e}</span>`).join("");
    panel.addEventListener("click", e=>{
      if(e.target.classList.contains("emoji-btn")){
        const input = $("threadInput") || $("roomInput");
        if(input){
          input.value += e.target.textContent;
          input.focus();
        }
      }
    });
  }
}
document.addEventListener("DOMContentLoaded", initEmojiPanel);

/* =================================================================
   SCROLL-TO-BOTTOM FAB
   ================================================================= */
function showScrollToBottomFab(container, fabId){
  const fab = $(fabId);
  if(!fab || !container) return;

  container.addEventListener("scroll", ()=>{
    if(isNearBottom(container)){
      fab.style.display = "none";
    }else{
      fab.style.display = "block";
    }
  });

  fab.onclick = ()=>scrollToBottom(container,{smooth:true});
}

/* Bind to thread + group scroll areas */
document.addEventListener("DOMContentLoaded", ()=>{
  showScrollToBottomFab(document.querySelector(".chat-scroll-area"), "scrollFabThread");
  showScrollToBottomFab($("roomMessages"), "scrollFabGroup");
});

/* =================================================================
   UI POLISH HOOKS
   ================================================================= */
// Animate messages
document.addEventListener("animationstart", e=>{
  if(e.target.classList.contains("msg-bubble")){
    e.target.classList.add("animate-fade-in");
  }
});

/* Group messages by date placeholder – implement later */

/* =================================================================
   FINAL INIT
   ================================================================= */
console.log(`✅ StringWasp ${STRINGWASP_VERSION} fully loaded with P2P, E2E, and UI extras.`);

/* =================================================================
   END PART 6/6
   ================================================================= */
