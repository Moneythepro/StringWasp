// Firebase
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = "global";
let unsubscribeMessages = null;
let unsubscribeThread = null;
let currentThreadUser = null;

// Utility
function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(id).style.display = "block";
}

// Auth
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

function login() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, pass).catch(alert);
}

function register() {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, pass).catch(alert);
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter username");
  db.collection("users").doc(currentUser.uid).set({ username }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// Main UI
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");
  loadRooms();
  listenMessages();
  loadInbox();
  loadFriends();
  loadProfile();
}

// Rooms
function createOrJoinRoom() {
  const room = document.getElementById("customRoom").value.trim();
  if (!room) return;

  const ref = db.collection("groups").doc(room);
  ref.get().then(doc => {
    if (!doc.exists) {
      ref.set({
        name: room,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        autoJoin: true
      });
    }
    joinRoom(room);
  });
}

function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("groups").get().then(snapshot => {
    snapshot.forEach(doc => {
      const opt = document.createElement("option");
      opt.textContent = doc.id;
      opt.value = doc.id;
      dropdown.appendChild(opt);
    });
  });
}

// Messages
function listenMessages() {
  const messagesDiv = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        const isMine = msg.senderId === currentUser.uid;

        div.className = "message " + (isMine ? "mine" : "other");
        const avatar = msg.senderPic || "default-avatar.png";
        if (!isMine) {
          const img = document.createElement("img");
          img.src = avatar;
          img.className = "avatar";
          img.onclick = () => showUserProfile(msg.senderId);
          div.appendChild(img);
        }

        const content = document.createElement("span");
        content.textContent = `${msg.senderName}: ${msg.text}`;
        div.appendChild(content);

        if (isMine) {
          div.oncontextmenu = (e) => {
            e.preventDefault();
            showMessageOptions(doc.id, msg);
          };
        }

        messagesDiv.appendChild(div);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const { username, photoURL } = doc.data();
    db.collection("rooms").doc(currentRoom).collection("messages").add({
      text,
      senderName: username,
      senderId: currentUser.uid,
      senderPic: photoURL || "",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  input.value = "";
}

function showMessageOptions(msgId, msg) {
  const choice = confirm("Edit = OK\nDelete = Cancel");
  if (choice) {
    const newText = prompt("Edit message:", msg.text);
    if (newText !== null)
      db.collection("rooms").doc(currentRoom).collection("messages").doc(msgId).update({ text: newText });
  } else {
    const del = confirm("Delete from everyone = OK\nOnly from me = Cancel");
    if (del) {
      db.collection("rooms").doc(currentRoom).collection("messages").doc(msgId).delete();
    } else {
      alert("Only from me - not implemented yet.");
    }
  }
}

// Inbox
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid)
    .onSnapshot(snapshot => {
      const list = document.getElementById("inboxList");
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const item = doc.data();
        const card = document.createElement("div");
        card.className = "inbox-card";
        card.innerHTML = `${item.type}: ${item.fromName} 
        <button onclick="acceptRequest('${doc.id}')">✓</button>
        <button onclick="declineRequest('${doc.id}')">✕</button>`;
        list.appendChild(card);
      });
    });
}

function acceptRequest(id) {
  db.collection("inbox").doc(id).delete();
  alert("Request Accepted");
}

function declineRequest(id) {
  db.collection("inbox").doc(id).delete();
  alert("Request Rejected");
}

// Friends
function loadFriends() {
  const container = document.getElementById("friendsList");
  db.collection("friends").doc(currentUser.uid).collection("list")
    .onSnapshot(snapshot => {
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const friend = doc.data();
        const btn = document.createElement("button");
        btn.textContent = friend.username;
        btn.onclick = () => openThread(friend.uid, friend.username);
        container.appendChild(btn);
      });
    });
}

// Threaded Chat
function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;
  if (unsubscribeThread) unsubscribeThread();
  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp").onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.textContent = `${msg.fromName}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;
  const fromName = document.getElementById("usernameDisplay").textContent;
  db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages").add({
    text, from: currentUser.uid, fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// Profile
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  const fileInput = document.getElementById("profilePic");
  const file = fileInput.files[0];

  const data = { name, bio };
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true });
  }
}

function showUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    alert(`User: ${data.username}\nBio: ${data.bio || "No bio"}`);
  });
}

// Search
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  db.collection("users").where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff").get().then(snapshot => {
      const container = document.getElementById("searchResultsUser");
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const user = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = user.username;
        div.onclick = () => {
          const choice = confirm("OK = View Profile\nCancel = Send Friend Request");
          if (choice) showUserProfile(doc.id);
          else sendFriendRequest(doc.id, user.username);
        };
        container.appendChild(div);
      });
    });

  db.collection("groups").where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff").get().then(snapshot => {
      const container = document.getElementById("searchResultsGroup");
      container.innerHTML = "";
      snapshot.forEach(doc => {
        const group = doc.data();
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = group.name;
        div.onclick = () => {
          const choice = confirm("OK = Join Group\nCancel = View Info");
          if (choice) {
            if (group.autoJoin) joinRoom(group.name);
            else alert("Request sent for approval");
          } else {
            alert(`Group: ${group.name}\nCreated by: ${group.createdBy}`);
          }
        };
        container.appendChild(div);
      });
    });
}

function sendFriendRequest(toUid, toName) {
  db.collection("inbox").add({
    to: toUid,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    type: "Friend Request",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Theme
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

window.onload = () => {
  applySavedTheme();
};
