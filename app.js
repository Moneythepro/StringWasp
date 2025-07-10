<script>
// === UUID Generator ===
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// Firebase Initialization
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let currentRoom = "global";
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// ===== Init =====
window.onload = () => {
  applySavedTheme();
  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};

// ===== Auth =====
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
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, pass).catch(alert);
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, pass).catch(alert);
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Enter a username");
  db.collection("users").doc(currentUser.uid).set({ username, email: currentUser.email }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");
  loadRooms();
  listenMessages();
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== UI Helpers =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(id).style.display = "block";
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// ===== FAB Menu =====
function toggleFabMenu() {
  const menu = document.getElementById("fabMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

function handleFabClick() {
  const choice = prompt("1. Create Group\n2. Join Group\n3. Leave Current Group");
  if (!choice) return;

  if (choice === "1") return createGroup();
  if (choice === "2") return joinGroupPrompt();
  if (choice === "3") return leaveCurrentGroup();
  alert("Invalid choice");
}

// ===== Group FAB Logic =====
function createGroup() {
  const name = prompt("Enter new group name:");
  if (!name) return;

  const groupRef = db.collection("groups").doc(name);
  groupRef.get().then(doc => {
    if (doc.exists) return alert("Group already exists");
    groupRef.set({
      name,
      createdBy: currentUser.uid,
      createdAt: Date.now(),
      autoJoin: true
    }).then(() => {
      groupRef.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
      joinRoom(name);
    });
  });
}

function joinGroupPrompt() {
  const name = prompt("Enter group name to join:");
  if (!name) return;

  const groupRef = db.collection("groups").doc(name);
  groupRef.get().then(doc => {
    if (!doc.exists) return alert("Group not found.");
    groupRef.collection("members").doc(currentUser.uid).set({ joinedAt: Date.now() });
    joinRoom(name);
  });
}

function leaveCurrentGroup() {
  if (!currentRoom || currentRoom === "global") return alert("You can't leave this room.");
  const confirmLeave = confirm(`Leave group "${currentRoom}"?`);
  if (!confirmLeave) return;

  db.collection("groups").doc(currentRoom).collection("members").doc(currentUser.uid).delete().then(() => {
    alert(`You left "${currentRoom}".`);
    currentRoom = "global";
    listenMessages();
    updateGroupHeader(null);
  });
}

// ===== Room Logic =====
function joinRoom(name) {
  currentRoom = name;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
  updateGroupHeader(name);
}

// ===== Group Header =====
function updateGroupHeader(groupName) {
  const groupHeader = document.querySelector(".group-header");
  const groupNameDiv = document.getElementById("groupHeaderName");
  if (!groupHeader || !groupNameDiv) return;

  if (!groupName) {
    groupHeader.style.display = "none";
    return;
  }

  groupNameDiv.textContent = groupName;
  groupHeader.style.display = "flex";
  groupHeader.onclick = () => showGroupInfo(groupName);
}

function showGroupInfo(groupName) {
  const modal = document.getElementById("groupInfoModal");
  const nameEl = document.getElementById("groupModalName");
  const membersList = document.getElementById("groupMembersList");
  nameEl.textContent = groupName;
  membersList.innerHTML = "Loading...";

  db.collection("groups").doc(groupName).collection("members").get().then(snapshot => {
    membersList.innerHTML = "";
    snapshot.forEach(doc => {
      const div = document.createElement("div");
      div.textContent = "👤 " + doc.id;
      membersList.appendChild(div);
    });
  });

  modal.style.display = "block";
}

function closeGroupModal() {
  document.getElementById("groupInfoModal").style.display = "none";
}

// ===== Messages =====
function listenMessages() {
  const messagesDiv = document.getElementById("messages");
  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        const isMine = msg.senderId === currentUser.uid;
        bubble.className = "message-bubble " + (isMine ? "right" : "left");

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

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const { username } = doc.data();
    db.collection("rooms").doc(currentRoom).collection("messages").add({
      text,
      senderName: username,
      senderId: currentUser.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = "";
  });
}

// === Variables ===
let currentUser = {};
let currentRoom = "global";
let unsubscribeMessages = null;
let unsubscribeThread = null;
let currentThreadUser = null;

// === Theme ===
function toggleTheme() {
  const dark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
}
function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

// === FAB Menu ===
function toggleFabMenu() {
  const menu = document.getElementById("fabMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}
function handleFabClick() {
  const choice = prompt("1. Create Group\n2. Join Group\n3. Leave Current Group");
  if (!choice) return;
  if (choice === "1") return createGroup();
  if (choice === "2") return joinGroup();
  if (choice === "3") return leaveGroup();
  alert("Invalid choice.");
}

// === Group Header UI ===
function updateGroupHeader(groupName) {
  const header = document.querySelector(".group-header");
  const nameEl = document.getElementById("groupHeaderName");
  if (!header || !nameEl) return;
  nameEl.textContent = groupName;
  header.style.display = "flex";
  header.onclick = () => showGroupInfo(groupName);
}

// === Join Room ===
function joinRoom(name) {
  currentRoom = name;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
  updateGroupHeader(name);
}

// === Create Group ===
function createGroup() {
  const name = prompt("Enter group name:");
  if (!name) return;
  const ref = db.collection("groups").doc(name);
  ref.get().then(doc => {
    if (doc.exists) return alert("Group already exists");
    ref.set({
      name,
      createdAt: Date.now(),
      createdBy: currentUser.uid,
      autoJoin: true
    }).then(() => {
      ref.collection("members").doc(currentUser.uid).set({
        joinedAt: Date.now()
      });
      joinRoom(name);
    });
  });
}

// === Join Group ===
function joinGroup() {
  const name = prompt("Enter group to join:");
  if (!name) return;
  db.collection("groups").doc(name).get().then(doc => {
    if (!doc.exists) return alert("Group not found");
    db.collection("groups").doc(name).collection("members").doc(currentUser.uid).set({
      joinedAt: Date.now()
    }).then(() => joinRoom(name));
  });
}

// === Leave Group ===
function leaveGroup() {
  if (!currentRoom || currentRoom === "global") return alert("Cannot leave global room.");
  const confirmLeave = confirm(`Leave "${currentRoom}"?`);
  if (!confirmLeave) return;
  db.collection("groups").doc(currentRoom).collection("members").doc(currentUser.uid).delete().then(() => {
    alert("You left the group");
    document.getElementById("groupInfoModal").style.display = "none";
    document.querySelector(".group-header").style.display = "none";
    currentRoom = "global";
    listenMessages();
  });
}

// === Group Info Modal ===
function showGroupInfo(groupName) {
  const modal = document.getElementById("groupInfoModal");
  const nameEl = document.getElementById("groupModalName");
  const imgEl = document.getElementById("groupModalImage");
  const membersList = document.getElementById("groupMembersList");

  nameEl.textContent = groupName;
  imgEl.src = "group-avatar.png";
  membersList.innerHTML = "Loading...";

  db.collection("groups").doc(groupName).get().then(doc => {
    const groupData = doc.data();
    const createdBy = groupData?.createdBy;

    db.collection("groups").doc(groupName).collection("members").get().then(snapshot => {
      membersList.innerHTML = "";

      snapshot.forEach(memberDoc => {
        const memberId = memberDoc.id;
        db.collection("users").doc(memberId).get().then(userDoc => {
          const data = userDoc.data();
          const div = document.createElement("div");
          div.textContent = data?.username || "User";
          div.className = "search-result";

          if (currentUser.uid === createdBy && memberId !== currentUser.uid) {
            div.onclick = () => {
              const confirmKick = confirm("Kick " + (data?.username || "user") + "?");
              if (confirmKick) {
                db.collection("groups").doc(groupName).collection("members").doc(memberId).delete();
                alert("User kicked");
                div.remove();
              }
            };
          }

          membersList.appendChild(div);
        });
      });

      document.getElementById("editGroupBtn").style.display =
        currentUser.uid === createdBy ? "block" : "none";
    });
  });

  modal.style.display = "block";
}

function closeGroupModal() {
  document.getElementById("groupInfoModal").style.display = "none";
}
function editGroupSettings() {
  const newName = prompt("New group name:", currentRoom);
  if (!newName || newName === currentRoom) return;

  db.collection("groups").doc(currentRoom).update({ name: newName }).then(() => {
    alert("Group name updated");
    document.getElementById("groupModalName").textContent = newName;
    updateGroupHeader(newName);
    currentRoom = newName;
  });
}

// === Messages ===
function listenMessages() {
  const chatArea = document.getElementById("chatArea");
  if (!chatArea) return;

  unsubscribeMessages = db.collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      chatArea.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.textContent = `${msg.fromName || "?"}: ${msg.text}`;
        chatArea.appendChild(div);
      });
      chatArea.scrollTop = chatArea.scrollHeight;
    });
}

// === Init ===
window.onload = () => {
  applySavedTheme();
  const preview = document.getElementById("profilePicPreview");
  if (preview) preview.onclick = () => document.getElementById("profilePic").click();
};
