// Firebase Auth and Firestore const auth = firebase.auth(); const db = firebase.firestore(); let currentUser = null; let currentRoom = "global"; let unsubscribeMessages = null; let unsubscribeThread = null; let currentThreadUser = null;

// Tabs function showUsernameDialog() { switchTab("usernameDialog"); }

function showLoading(show) { document.getElementById("loadingOverlay").style.display = show ? "flex" : "none"; }

function switchTab(id) { document.querySelectorAll(".tab").forEach(t => t.style.display = "none"); document.getElementById(id).style.display = "block"; }

// Auth auth.onAuthStateChanged(async user => { if (user) { currentUser = user; const userDoc = await db.collection("users").doc(user.uid).get(); if (!userDoc.exists || !userDoc.data().username) { switchTab("usernameDialog"); } else { document.getElementById("usernameDisplay").textContent = userDoc.data().username; loadMainUI(); } } else { switchTab("loginPage"); } });

function login() { const email = document.getElementById("email").value.trim(); const pass = document.getElementById("password").value; auth.signInWithEmailAndPassword(email, pass).catch(alert); }

function register() { const email = document.getElementById("email").value.trim(); const pass = document.getElementById("password").value; auth.createUserWithEmailAndPassword(email, pass).catch(alert); }

function saveUsername() { const username = document.getElementById("newUsername").value.trim(); if (!username) return alert("Enter username"); db.collection("users").doc(currentUser.uid).set({ username }, { merge: true }).then(() => { document.getElementById("usernameDisplay").textContent = username; loadMainUI(); }); }

function loadMainUI() { document.getElementById("appPage").style.display = "block"; switchTab("chatTab"); loadRooms(); listenMessages(); loadInbox(); loadFriends(); loadProfile(); }

// Rooms function createOrJoinRoom() { const room = prompt("Enter group name:"); if (!room) return; const ref = db.collection("groups").doc(room); ref.get().then(doc => { if (!doc.exists) { ref.set({ name: room, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.uid, autoJoin: true }); } db.collection("groups").doc(room).collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() }); joinRoom(room); }); }

function joinRoom(roomName) { currentRoom = roomName; if (unsubscribeMessages) unsubscribeMessages(); listenMessages(); }

function loadRooms() { const dropdown = document.getElementById("roomDropdown"); dropdown.innerHTML = ""; db.collection("groups").get().then(snapshot => { snapshot.forEach(doc => { db.collection("groups").doc(doc.id).collection("members").doc(currentUser.uid).get().then(memberDoc => { if (memberDoc.exists) { const opt = document.createElement("option"); opt.textContent = doc.id; opt.value = doc.id; dropdown.appendChild(opt); } }); }); }); }

// Messages function listenMessages() { const messagesDiv = document.getElementById("messages"); unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages") .orderBy("timestamp").onSnapshot(snapshot => { messagesDiv.innerHTML = ""; snapshot.forEach(doc => { const msg = doc.data(); const isMine = msg.senderId === currentUser.uid;

const bubble = document.createElement("div");
    bubble.className = "message-bubble " + (isMine ? "right" : "left");
    bubble.title = msg.timestamp?.toDate?.().toLocaleString() || "";

    if (!isMine) {
      const senderInfo = document.createElement("div");
      senderInfo.className = "sender-info";

      const img = document.createElement("img");
      img.src = msg.senderPic || "default-avatar.png";
      img.className = "message-avatar";
      img.onclick = () => showUserProfile(msg.senderId);
      senderInfo.appendChild(img);

      const name = document.createElement("div");
      name.className = "sender-name";
      name.textContent = msg.senderName || "User";
      senderInfo.appendChild(name);

      bubble.appendChild(senderInfo);
    }

    const text = document.createElement("div");
    text.textContent = msg.text;
    if (isMine) {
      text.oncontextmenu = e => {
        e.preventDefault();
        showMessageOptions(doc.id, msg);
      };
    }
    bubble.appendChild(text);
    messagesDiv.appendChild(bubble);
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

}

function sendMessage() { const input = document.getElementById("messageInput"); const text = input.value.trim(); if (!text) return; db.collection("users").doc(currentUser.uid).get().then(doc => { const { username, photoURL } = doc.data(); db.collection("rooms").doc(currentRoom).collection("messages").add({ text, senderName: username, senderId: currentUser.uid, senderPic: photoURL || "default-avatar.png", timestamp: firebase.firestore.FieldValue.serverTimestamp() }); }); input.value = ""; }

function showMessageOptions(msgId, msg) { const choice = confirm("Edit = OK\nDelete = Cancel"); if (choice) { const newText = prompt("Edit message:", msg.text); if (newText !== null) db.collection("rooms").doc(currentRoom).collection("messages").doc(msgId).update({ text: newText }); } else { const del = confirm("Delete from everyone = OK\nOnly from me = Cancel"); if (del) { db.collection("rooms").doc(currentRoom).collection("messages").doc(msgId).delete(); } else { alert("Delete from me only: not implemented."); } } }

// Inbox function loadInbox() { db.collection("inbox").where("to", "==", currentUser.uid).onSnapshot(snapshot => { const list = document.getElementById("inboxList"); list.innerHTML = ""; snapshot.forEach(doc => { const item = doc.data(); const card = document.createElement("div"); card.className = "inbox-card"; card.innerHTML = ${item.type}: ${item.fromName} <button onclick="acceptRequest('${doc.id}')">✓</button> <button onclick="declineRequest('${doc.id}')">✕</button>; list.appendChild(card); }); }); }

function acceptRequest(id) { db.collection("inbox").doc(id).delete(); alert("Request Accepted"); }

function declineRequest(id) { db.collection("inbox").doc(id).delete(); alert("Request Rejected"); }

function markAllRead() { db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => { snapshot.forEach(doc => doc.ref.delete()); }); alert("All inbox notifications marked as read."); }

// Profile function loadProfile() { db.collection("users").doc(currentUser.uid).get().then(doc => { const data = doc.data(); document.getElementById("profileName").value = data.name || ""; document.getElementById("profileBio").value = data.bio || ""; const avatar = document.getElementById("profilePicPreview"); if (avatar) avatar.src = data.photoURL || "default-avatar.png"; }); }

function saveProfile() { const name = document.getElementById("profileName").value.trim(); const bio = document.getElementById("profileBio").value.trim(); const fileInput = document.getElementById("profilePic"); const file = fileInput.files[0]; const data = { name, bio };

if (file) { const reader = new FileReader(); reader.onload = function (e) { data.photoURL = e.target.result; db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => { document.getElementById("profilePicPreview").src = e.target.result; alert("Profile updated."); }); }; reader.readAsDataURL(file); } else { db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => { alert("Profile updated."); }); } }

function showUserProfile(uid) { db.collection("users").doc(uid).get().then(doc => { const data = doc.data(); document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png"; document.getElementById("viewProfileName").textContent = data.name || "Unnamed"; document.getElementById("viewProfileBio").textContent = data.bio || "No bio"; document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown"); document.getElementById("viewProfileEmail").textContent = data.email || ""; document.getElementById("viewProfileStatus").textContent = data.status || ""; document.getElementById("viewProfileModal").style.display = "block"; }); }

// Friends function loadFriends() { const container = document.getElementById("friendsList"); db.collection("friends").doc(currentUser.uid).collection("list").onSnapshot(snapshot => { container.innerHTML = ""; snapshot.forEach(doc => { const friend = doc.data(); const btn = document.createElement("button"); btn.textContent = friend.username; btn.onclick = () => openThread(friend.uid, friend.username); container.appendChild(btn); }); }); }

// Thread Chat function threadId(a, b) { return [a, b].sort().join("_"); }

function openThread(uid, username) { switchTab("threadView"); document.getElementById("threadWithName").textContent = username; currentThreadUser = uid; if (unsubscribeThread) unsubscribeThread(); unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages") .orderBy("timestamp").onSnapshot(snapshot => { const area = document.getElementById("threadMessages"); area.innerHTML = ""; snapshot.forEach(doc => { const msg = doc.data(); const div = document.createElement("div"); div.textContent = ${msg.fromName}: ${msg.text}; area.appendChild(div); }); area.scrollTop = area.scrollHeight; }); }

function sendThreadMessage() { const input = document.getElementById("threadInput"); const text = input.value.trim(); if (!text || !currentThreadUser) return; const fromName = document.getElementById("usernameDisplay").textContent; db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({ text, from: currentUser.uid, fromName, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); input.value = ""; }

function closeThread() { switchTab("friendsTab"); if (unsubscribeThread) unsubscribeThread(); }

// Search function switchSearchView(view) { document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none"; document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none"; }

function runSearch() { const query = document.getElementById("searchInput").value.trim().toLowerCase();

db.collection("users").where("username", ">=", query).where("username", "<=", query + "\uf8ff").get().then(snapshot => { const container = document.getElementById("searchResultsUser"); container.innerHTML = ""; snapshot.forEach(doc => { const user = doc.data(); const div = document.createElement("div"); div.className = "search-result"; const badge = user.username === "moneythepro" ? " 🛠️ Developer" : ""; div.textContent = user.username + badge; div.onclick = () => { const choice = confirm("OK = View Profile\nCancel = Send Friend Request"); if (choice) showUserProfile(doc.id); else sendFriendRequest(doc.id, user.username); }; container.appendChild(div); }); });

db.collection("groups").where("name", ">=", query).where("name", "<=", query + "\uf8ff").get().then(snapshot => { const container = document.getElementById("searchResultsGroup"); container.innerHTML = ""; snapshot.forEach(doc => { const group = doc.data(); const div = document.createElement("div"); div.className = "search-result"; div.textContent = ${group.name}; div.onclick = () => { const choice = confirm("OK = Join Group\nCancel = View Info"); if (choice) { if (group.autoJoin) { db.collection("groups").doc(group.name).collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() }); joinRoom(group.name); alert("Joined group successfully."); } else { db.collection("inbox").add({ to: group.createdBy, from: currentUser.uid, fromName: document.getElementById("usernameDisplay").textContent, type: Group Join Request: ${group.name}, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); alert("Join request sent."); } } else { db.collection("groups").doc(group.name).collection("members").get().then(members => { alert(Group: ${group.name}\nMembers: ${members.size}); }); } }; container.appendChild(div); }); }); }

// Theme function toggleTheme() { const isDark = document.body.classList.toggle("dark"); localStorage.setItem("theme", isDark ? "dark" : "light"); }

function applySavedTheme() { const theme = localStorage.getItem("theme"); if (theme === "dark") document.body.classList.add("dark"); }

// Private Chat function promptPrivateChat() { const username = prompt("Enter username to chat:"); if (!username) return; db.collection("users").where("username", "==", username).limit(1).get().then(snapshot => { if (snapshot.empty) return alert("User not found."); const doc = snapshot.docs[0]; openThread(doc.id, username); }); }

// Floating Button Menu Fix function ToggleFabMenu() { const side = document.getElementById("sideMenu"); if (side) side.classList.toggle("show"); }

// INIT window.onload = () => { applySavedTheme();

const preview = document.getElementById("profilePicPreview"); if (preview) { preview.onclick = () => document.getElementById("profilePic").click(); }

