/* ------------------------------------------------------------------ */
/*  GLOBALS                                                           */
/* ------------------------------------------------------------------ */
let currentRoom = "general";
let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc, unsubscribeRoomList;
let lastMessageTS = 0;
let typingTO = null;

/* quick helpers */
const $ = id => document.getElementById(id);
const roomPwd = () => $("#roomPassword").value || "";

/* ------------------------------------------------------------------ */
/*  AUTH STATE                                                        */
/* ------------------------------------------------------------------ */
auth.onAuthStateChanged(async user => {
  if (!user) {               // ↩ not logged-in
    $("#chat").style.display  = "none";
    $("#login").style.display = "block";
    return;
  }

  $("#login").style.display = "none";
  $("#chat").style.display  = "block";

  /* ── USERNAME CHECK ────────────────────────────────────────────── */
  const userDoc = await db.collection("users").doc(user.uid).get();
  if (!userDoc.exists || !userDoc.data().username) {
    // show popup to pick a username
    $("#usernameDialog").style.display = "block";
    return; // halt until username saved
  }

  const username = userDoc.data().username;
  $("#usernameDisplay").textContent = "@" + username;

  /* main initialisation after username exists */
  loadProfile(user.uid);
  startRoomListeners();
  await createRoomIfMissing("general");
  populateDropdown();
  joinRoom("general");
  listenForOffers();
});

/* ------------------------------------------------------------------ */
/*  USERNAME CREATION                                                 */
/* ------------------------------------------------------------------ */
async function saveUsername() {
  const name = $("#newUsername").value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,15}$/.test(name)) {
    alert("Username must be 3-15 chars (a-z, 0-9, underscore).");
    return;
  }
  const taken = await db.collection("usernames").doc(name).get();
  if (taken.exists) { alert("Username already taken."); return; }

  const uid = auth.currentUser.uid;
  // batch write: map username ➜ uid  and uid ➜ username
  const batch = db.batch();
  batch.set(db.collection("usernames").doc(name), { uid });
  batch.set(db.collection("users").doc(uid), { username: name }, { merge: true });
  await batch.commit();

  $("#usernameDialog").style.display = "none";
  location.reload(); // reload to re-enter auth flow with username present
}

/* helper to fetch username quickly (used in chat) */
const cacheUsernames = {};    // uid ➜ username
async function uidToUsername(uid) {
  if (cacheUsernames[uid]) return cacheUsernames[uid];
  const snap = await db.collection("users").doc(uid).get();
  const u = snap.exists ? snap.data().username || snap.data().email : uid;
  cacheUsernames[uid] = u;
  return u;
}

/* ------------------------------------------------------------------ */
/*  ROOM MANAGEMENT  (unchanged logic, username-friendly displays)    */
/* ------------------------------------------------------------------ */
async function createRoomIfMissing(name) {
  const ref  = db.collection("rooms").doc(name);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      creator   : auth.currentUser.uid,
      admins    : [auth.currentUser.uid],
      members   : [auth.currentUser.uid],
      createdAt : firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

/* sidebar room list */
function startRoomListeners() {
  const ul = $("#roomList");
  unsubscribeRoomList = db.collection("rooms")
    .orderBy("createdAt")
    .onSnapshot(async qs => {
      ul.innerHTML = "";
      for (const doc of qs.docs) {
        const data = doc.data();
        const li = document.createElement("li");
        li.textContent = `${doc.id} (${data.members.length})`;
        li.style.cursor = "pointer";
        li.onclick = () => joinRoom(doc.id);
        ul.appendChild(li);
      }
      populateDropdown();
    });
}

function populateDropdown() {
  const dd = $("#roomDropdown");
  db.collection("rooms").get().then(qs => {
    dd.innerHTML = "";
    qs.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = "#" + doc.id;
      dd.appendChild(opt);
    });
    dd.value = currentRoom;
  });
}

/* join/create, leave remain same (emails → uids) */
async function createOrJoinRoom() {
  const name = $("#customRoom").value.trim();
  if (!name) return;
  await createRoomIfMissing(name);
  await joinRoom(name);
  $("#customRoom").value = "";
}

async function joinRoom(roomName) {
  currentRoom = roomName;
  $("#roomDropdown").value = roomName;

  db.collection("rooms").doc(roomName)
    .update({ members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.uid) });

  if (unsubscribeRoomDoc) unsubscribeRoomDoc();
  unsubscribeRoomDoc = db.collection("rooms").doc(roomName)
    .onSnapshot(doc => updateAdminPanel(doc));

  listenForChat(roomName);
  listenForTyping(roomName);
}

function leaveRoom() {
  if (currentRoom === "general") { alert("You can’t leave #general"); return; }
  if (!confirm(`Leave #${currentRoom}?`)) return;
  db.collection("rooms").doc(currentRoom)
    .update({
      members: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.uid),
      admins : firebase.firestore.FieldValue.arrayRemove(auth.currentUser.uid)
    });
  joinRoom("general");
}

/* ------------------------------------------------------------------ */
/*  ADMIN PANEL (uids not emails)                                     */
/* ------------------------------------------------------------------ */
function updateAdminPanel(doc) {
  const panel = $("#adminPanel");
  if (!doc.exists) { panel.style.display = "none"; return; }
  const data = doc.data();
  const you  = auth.currentUser.uid;
  const isAdmin = data.admins.includes(you);
  const isCreator = data.creator === you;
  if (!(isAdmin || isCreator)) { panel.style.display = "none"; return; }

  panel.style.display = "block";
  // show creator/admins usernames
  Promise.all([
    uidToUsername(data.creator),
    Promise.all(data.admins.map(uidToUsername))
  ]).then(([creatorName, adminNames]) => {
    $("#adminInfo").textContent = `Creator: @${creatorName}\nAdmins: ${adminNames.map(a=>"@"+a).join(", ")}`;
  });
}

function getAdminRoomRef() { return db.collection("rooms").doc(currentRoom); }
const memberInput = () => $("#memberEmail").value.trim().toLowerCase();

/* look up by username OR email */
async function emailOrUid(str){
  if (str.includes("@")) return str;               // raw email used as uid fallback
  // username path
  const snap = await db.collection("usernames").doc(str).get();
  return snap.exists ? snap.data().uid : str;      // returns uid or str
}

async function addMember()   {
  const id = await emailOrUid(memberInput()); if(!id) return;
  getAdminRoomRef().update({ members: firebase.firestore.FieldValue.arrayUnion(id) });
}
async function removeMember(){
  const id = await emailOrUid(memberInput()); if(!id) return;
  getAdminRoomRef().update({
    members: firebase.firestore.FieldValue.arrayRemove(id),
    admins : firebase.firestore.FieldValue.arrayRemove(id)
  });
}
async function promoteMember(){
  const id = await emailOrUid(memberInput()); if(!id) return;
  const snap = await getAdminRoomRef().get();
  const data = snap.data();
  if (data.admins.length >= 3) { alert("Max 3 admins"); return; }
  if (!data.members.includes(id)) { alert("User must be member first"); return; }
  getAdminRoomRef().update({ admins: firebase.firestore.FieldValue.arrayUnion(id) });
}

/* ------------------------------------------------------------------ */
/*  CHAT LISTENERS (uids → usernames)                                 */
/* ------------------------------------------------------------------ */
function listenForChat(roomName) {
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection("messages").doc(roomName)
    .collection("chat").orderBy("time")
    .onSnapshot(snapshot => {
      const box = $("#messages");
      box.innerHTML = "";
      let latest = 0;
      snapshot.forEach(async doc => {
        const m = doc.data();
        const div = document.createElement("div");
        div.className = "message";

        let body=""; let senderName="unknown";
        try {
          body = await decryptMessage(m.encryptedText, m.iv, roomPwd());
        } catch { body = "[Cannot decrypt]"; }

        senderName = await uidToUsername(m.sender);

        div.innerHTML = `<b>@${senderName}:</b> ${body} ${m.edited?"<i>(edited)</i>":""}`;

        if (m.sender === auth.currentUser.uid) {
          const e = document.createElement("button"),
                r = document.createElement("button");
          e.textContent="Edit"; r.textContent="Delete";
          e.className="action-btn"; r.className="action-btn";
          e.onclick = ()=> editMessage(doc.id,body,m.iv);
          r.onclick = ()=> deleteMessage(doc.id);
          div.append(e,r);
        } else if (m.time > lastMessageTS) {
          latest = Math.max(latest, m.time);
          triggerNotification(senderName, body);
        }
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
      if (latest) lastMessageTS = latest;
    });
}

function listenForTyping(roomName){
  if (unsubscribeTyping) unsubscribeTyping();
  unsubscribeTyping = db.collection("typing").doc(roomName)
    .onSnapshot(async snap => {
      const data = snap.data() || {}, me = auth.currentUser.uid;
      const othersUIDs = Object.keys(data).filter(u=>u!==me && data[u]);
      const names = await Promise.all(othersUIDs.map(uidToUsername));
      $("#typingIndicator").textContent = names.length ? `${names.join(", ")} typing…` : "";
    });
}

/* ---------------------------  SEND / EDIT / DELETE --------------------- */
async function sendMessage() {
  const val = $("#messageInput").value.trim(); if(!val) return;
  const enc = await encryptMessage(val, roomPwd());
  db.collection("messages").doc(currentRoom).collection("chat")
    .add({ sender: auth.currentUser.uid, ...enc, time:Date.now(), edited:false });
  $("#messageInput").value="";
  db.collection("typing").doc(currentRoom)
    .set({ [auth.currentUser.uid]: false }, { merge: true });
}

function deleteMessage(id){
  db.collection("messages").doc(currentRoom).collection("chat").doc(id).delete();
}
async function editMessage(id,oldText){
  const n=prompt("Edit:",oldText); if(!n||n===oldText) return;
  const enc=await encryptMessage(n,roomPwd());
  db.collection("messages").doc(currentRoom).collection("chat").doc(id)
    .update({ ...enc, edited:true });
}

/* typing flag */
$("#messageInput").addEventListener("input",() => {
  const ref=db.collection("typing").doc(currentRoom);
  ref.set({[auth.currentUser.uid]:true},{merge:true});
  clearTimeout(typingTO);
  typingTO=setTimeout(()=>ref.set({[auth.currentUser.uid]:false},{merge:true}),3000);
});

/* ------------------------------------------------------------------ */
/*  PROFILE (leave your existing logic here)                          */
/* ------------------------------------------------------------------ */
function saveProfile(){ /* existing code */ }
function loadProfile(uid){ /* existing code */ }

/* ------------------------------------------------------------------ */
/*  NOTIFICATIONS                                                     */
/* ------------------------------------------------------------------ */
function triggerNotification(sender,msg){
  if(Notification.permission==="granted")
    new Notification(`Msg from @${sender}`,{body:msg});
  $("#notifSound").play().catch(()=>{});
}
if("Notification" in window && Notification.permission!=="granted")
  Notification.requestPermission();

/* ------------------------------------------------------------------ */
/*  AUTH (now using valid email check)                                */
/* ------------------------------------------------------------------ */
function register(){
  const email=$("#email").value, pass=$("#password").value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    alert("Enter a valid email"); return;
  }
  auth.createUserWithEmailAndPassword(email,pass)
    .then(()=>alert("Registered! Now log in"))
    .catch(e=>alert("Error: "+e.message));
}

function login(){
  auth.signInWithEmailAndPassword($("#email").value,$("#password").value)
    .catch(e=>alert("Error: "+e.message));
}

/* ------------------------------------------------------------------ */
/*  P2P OFFER HANDLER (unchanged)                                     */
/* ------------------------------------------------------------------ */
function listenForOffers(){ /* keep your existing P2P code */ }
