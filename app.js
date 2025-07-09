const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentRoom = null;
let currentThread = null;
let theme = localStorage.getItem("theme") || "light";

window.onload = () => {
  setTheme(theme);
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (!userDoc.exists || !userDoc.data().username) {
        showTab("usernameDialog");
      } else {
        document.getElementById("usernameDisplay").textContent = `@${userDoc.data().username}`;
        showTab("chatTab");
        document.getElementById("appPage").style.display = "block";
        loadFriends();
        loadRooms();
        switchTab("chatTab");
      }
    } else {
      showTab("loginPage");
    }
  });
};

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password).catch(console.error);
}

function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.createUserWithEmailAndPassword(email, password).catch(console.error);
}

function saveUsername() {
  const username = document.getElementById("newUsername").value;
  db.collection("users").doc(currentUser.uid).set({
    email: currentUser.email,
    username,
    status: "online",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => {
    document.getElementById("usernameDisplay").textContent = `@${username}`;
    showTab("chatTab");
    document.getElementById("appPage").style.display = "block";
    switchTab("chatTab");
    loadRooms();
  });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  if (!currentRoom || !input.value) return;
  db.collection("rooms").doc(currentRoom).collection("messages").add({
    uid: currentUser.uid,
    text: input.value,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  if (!currentThread || !input.value) return;
  db.collection("threads").doc(currentThread).collection("messages").add({
    uid: currentUser.uid,
    text: input.value,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = "none");
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = "block";
}

function switchTab(tabId) {
  showTab(tabId);
}

function toggleTheme() {
  theme = (theme === "light") ? "dark" : "light";
  localStorage.setItem("theme", theme);
  setTheme(theme);
}

function setTheme(theme) {
  document.body.className = theme;
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = "";
  db.collection("rooms").get().then(snapshot => {
    snapshot.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.data().name;
      dropdown.appendChild(opt);
    });
  });
}

function joinRoom(roomId) {
  currentRoom = roomId;
  const msgBox = document.getElementById("messages");
  msgBox.innerHTML = "";
  db.collection("rooms").doc(roomId).collection("messages")
    .orderBy("createdAt")
    .onSnapshot(snapshot => {
      msgBox.innerHTML = "";
      snapshot.forEach(doc => {
        const div = document.createElement("div");
        div.textContent = doc.data().text;
        msgBox.appendChild(div);
      });
    });
}

function createOrJoinRoom() {
  const name = prompt("Enter room name:");
  if (!name) return;
  db.collection("rooms").add({ name }).then(doc => {
    loadRooms();
    joinRoom(doc.id);
  });
}

function loadFriends() {
  const friendsBox = document.getElementById("friendsList");
  friendsBox.innerHTML = "";
  db.collection("users").get().then(snapshot => {
    snapshot.forEach(doc => {
      const user = doc.data();
      const div = document.createElement("div");
      div.textContent = `@${user.username}`;
      div.onclick = () => openThreadWithUser(doc.id, user.username);
      friendsBox.appendChild(div);
    });
  });
}

function openThreadWithUser(userId, username) {
  currentThread = [currentUser.uid, userId].sort().join("-");
  document.getElementById("threadWithName").textContent = `Chat with @${username}`;
  showTab("threadView");
  const threadBox = document.getElementById("threadMessages");
  db.collection("threads").doc(currentThread).collection("messages")
    .orderBy("createdAt")
    .onSnapshot(snapshot => {
      threadBox.innerHTML = "";
      snapshot.forEach(doc => {
        const div = document.createElement("div");
        div.textContent = doc.data().text;
        threadBox.appendChild(div);
      });
    });
}

function closeThread() {
  currentThread = null;
  switchTab("friendsTab");
}

function markAllRead() {
  alert("All inbox messages marked as read!");
}

function runSearch() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = groupResults.innerHTML = "";

  db.collection("users").where("username", ">=", input).get().then(snapshot => {
    snapshot.forEach(doc => {
      const div = document.createElement("div");
      div.textContent = `@${doc.data().username}`;
      userResults.appendChild(div);
    });
  });

  db.collection("rooms").where("name", ">=", input).get().then(snapshot => {
    snapshot.forEach(doc => {
      const div = document.createElement("div");
      div.textContent = doc.data().name;
      groupResults.appendChild(div);
    });
  });
}

function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = (view === "user") ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = (view === "group") ? "block" : "none";
}

function saveProfile() {
  const name = document.getElementById("profileName").value;
  const bio = document.getElementById("profileBio").value;
  db.collection("users").doc(currentUser.uid).update({
    name,
    bio
  });
}

function toggleFabMenu() {
  alert("FAB Menu clicked – add more actions here!");
}
