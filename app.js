// UUID generator
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
let currentRoom = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;
let currentThreadUser = null;

// ===== UI Functions =====
function switchTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(id).style.display = "block";
  
  // Special handling for groups tab
  if (id === "groupsTab") {
    loadRooms();
    if (currentRoom) {
      listenMessages();
    }
  }
}

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// ===== Authentication =====
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
  auth.signInWithEmailAndPassword(email, pass)
    .catch(error => alert(error.message));
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  if (pass.length < 6) return alert("Password must be at least 6 characters");
  auth.createUserWithEmailAndPassword(email, pass)
    .then(() => alert("Account created! Please set your username"))
    .catch(error => alert(error.message));
}

function saveUsername() {
  const username = document.getElementById("newUsername").value.trim();
  if (!username) return alert("Username cannot be empty");
  if (username.length > 15) return alert("Username too long (max 15 chars)");
  
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// ===== Main App Functions =====
function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("groupsTab");
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== Group Management =====
function createGroup() {
  const groupName = prompt("Enter new group name:");
  if (!groupName) return;
  if (groupName.length > 20) return alert("Group name too long (max 20 chars)");

  db.collection("groups").doc(groupName).get().then(doc => {
    if (doc.exists) return alert("Group already exists");
    
    db.collection("groups").doc(groupName).set({
      name: groupName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid,
      members: {
        [currentUser.uid]: true
      }
    }).then(() => {
      joinRoom(groupName);
      alert(`Group "${groupName}" created successfully!`);
    });
  });
}

function joinGroup() {
  const groupName = prompt("Enter group name to join:");
  if (!groupName) return;
  
  db.collection("groups").doc(groupName).get().then(doc => {
    if (!doc.exists) return alert("Group doesn't exist");
    
    db.collection("groups").doc(groupName).update({
      [`members.${currentUser.uid}`]: true
    }).then(() => {
      joinRoom(groupName);
      alert(`Joined group "${groupName}" successfully!`);
    }).catch(error => alert(error.message));
  });
}

function leaveGroup() {
  if (!currentRoom) return alert("Not in any group");
  
  if (confirm(`Leave group "${currentRoom}"?`)) {
    db.collection("groups").doc(currentRoom).update({
      [`members.${currentUser.uid}`]: firebase.firestore.FieldValue.delete()
    }).then(() => {
      alert(`Left group "${currentRoom}"`);
      currentRoom = null;
      loadRooms();
      document.getElementById("messages").innerHTML = "";
    }).catch(error => alert(error.message));
  }
}

function joinRoom(roomName) {
  currentRoom = roomName;
  document.getElementById("roomDropdown").value = roomName;
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  dropdown.innerHTML = '<option value="">Select a group</option>';
  
  db.collection("groups").where(`members.${currentUser.uid}`, "==", true).get().then(snapshot => {
    if (snapshot.empty) {
      dropdown.innerHTML = '<option value="">No groups yet</option>';
    } else {
      snapshot.forEach(doc => {
        const opt = document.createElement("option");
        opt.textContent = doc.id;
        opt.value = doc.id;
        dropdown.appendChild(opt);
      });
    }
  });
}

// ===== Messaging =====
function listenMessages() {
  const messagesDiv = document.getElementById("messages");
  if (!currentRoom) return;
  
  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        displayMessage(doc.data());
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function displayMessage(msg) {
  const messagesDiv = document.getElementById("messages");
  const isMine = msg.senderId === currentUser.uid;

  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${isMine ? "right" : "left"}`;
  bubble.title = msg.timestamp?.toDate?.().toLocaleString() || "";

  if (!isMine) {
    const senderInfo = document.createElement("div");
    senderInfo.className = "sender-info";

    const img = document.createElement("img");
    img.src = msg.senderPic || "default-avatar.png";
    img.className = "message-avatar";
    img.onclick = () => showUserProfile(msg.senderId);

    const name = document.createElement("div");
    name.className = "sender-name";
    name.textContent = msg.senderName || "User";

    senderInfo.appendChild(img);
    senderInfo.appendChild(name);
    bubble.appendChild(senderInfo);
  }

  const text = document.createElement("div");
  text.textContent = msg.text;
  bubble.appendChild(text);
  messagesDiv.appendChild(bubble);
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const userData = doc.data();
    db.collection("groups").doc(currentRoom).collection("messages").add({
      text,
      senderName: userData.username,
      senderId: currentUser.uid,
      senderPic: userData.photoURL || "default-avatar.png",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = "";
  });
}

// ===== Inbox System =====
function loadInbox() {
  db.collection("inbox").where("to", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      const list = document.getElementById("inboxList");
      list.innerHTML = "";
      
      if (snapshot.empty) {
        list.innerHTML = "<div class='empty'>No new messages</div>";
        return;
      }
      
      snapshot.forEach(doc => {
        const item = doc.data();
        const card = document.createElement("div");
        card.className = "inbox-card";
        card.innerHTML = `
          <div class="inbox-type">${item.type}</div>
          <div class="inbox-from">From: ${item.fromName}</div>
          <div class="inbox-actions">
            <button onclick="acceptRequest('${doc.id}')">✓ Accept</button>
            <button onclick="declineRequest('${doc.id}')">✕ Decline</button>
          </div>
        `;
        list.appendChild(card);
      });
    });
}

function acceptRequest(requestId) {
  db.collection("inbox").doc(requestId).get().then(doc => {
    const request = doc.data();
    // Handle different request types (friend request, group invite, etc.)
    if (request.type.includes("Friend Request")) {
      db.collection("friends").doc(currentUser.uid).collection("list").doc(request.from).set({
        uid: request.from,
        username: request.fromName,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    doc.ref.delete();
  });
}

function declineRequest(requestId) {
  db.collection("inbox").doc(requestId).delete();
}

function markAllRead() {
  db.collection("inbox").where("to", "==", currentUser.uid).get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  }).then(() => alert("All messages marked as read"));
}

// ===== Friends System =====
function loadFriends() {
  db.collection("friends").doc(currentUser.uid).collection("list")
    .orderBy("addedAt", "desc")
    .onSnapshot(snapshot => {
      const container = document.getElementById("friendsList");
      container.innerHTML = "";
      
      if (snapshot.empty) {
        container.innerHTML = "<div class='empty'>No friends yet</div>";
        return;
      }
      
      snapshot.forEach(doc => {
        const friend = doc.data();
        const friendElement = document.createElement("div");
        friendElement.className = "friend-item";
        friendElement.innerHTML = `
          <img src="${friend.photoURL || 'default-avatar.png'}" class="friend-avatar">
          <span class="friend-name">${friend.username}</span>
          <button onclick="openThread('${friend.uid}', '${friend.username}')">Message</button>
        `;
        container.appendChild(friendElement);
      });
    });
}

// ===== Profile Management =====
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const fileInput = document.getElementById("profilePic");
  const file = fileInput.files[0];
  
  const updateData = { name, bio, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (file) {
    const storageRef = firebase.storage().ref(`profile_pics/${currentUser.uid}`);
    storageRef.put(file).then(snapshot => {
      return snapshot.ref.getDownloadURL();
    }).then(downloadURL => {
      updateData.photoURL = downloadURL;
      return db.collection("users").doc(currentUser.uid).set(updateData, { merge: true });
    }).then(() => {
      alert("Profile updated with new photo!");
      document.getElementById("profilePicPreview").src = updateData.photoURL;
    }).catch(error => alert(error.message));
  } else {
    db.collection("users").doc(currentUser.uid).set(updateData, { merge: true })
      .then(() => alert("Profile updated!"))
      .catch(error => alert(error.message));
  }
}

// ===== Threads (Private Messages) =====
function openThread(uid, username) {
  switchTab("threadView");
  document.getElementById("threadWithName").textContent = username;
  currentThreadUser = uid;
  if (unsubscribeThread) unsubscribeThread();

  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      area.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        displayThreadMessage(msg, msg.from === currentUser.uid);
      });
      area.scrollTop = area.scrollHeight;
    });
}

function displayThreadMessage(msg, isMine) {
  const area = document.getElementById("threadMessages");
  const msgDiv = document.createElement("div");
  msgDiv.className = `thread-message ${isMine ? "sent" : "received"}`;
  
  msgDiv.innerHTML = `
    <div class="message-content">${msg.text}</div>
    <div class="message-time">${msg.timestamp?.toDate?.().toLocaleTimeString() || ""}</div>
  `;
  area.appendChild(msgDiv);
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;
  
  const threadRef = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser));
  
  db.runTransaction(transaction => {
    return transaction.get(threadRef).then(doc => {
      if (!doc.exists) {
        transaction.set(threadRef, {
          participants: [currentUser.uid, currentThreadUser],
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    });
  }).then(() => {
    const fromName = document.getElementById("usernameDisplay").textContent;
    return threadRef.collection("messages").add({
      text,
      from: currentUser.uid,
      fromName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(() => {
    input.value = "";
  }).catch(error => alert(error.message));
}

function threadId(a, b) {
  return [a, b].sort().join("_");
}

function closeThread() {
  switchTab("friendsTab");
  if (unsubscribeThread) unsubscribeThread();
}

// ===== Search Functionality =====
function runSearch() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!query) return;

  // Search users
  db.collection("users").where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff")
    .limit(10)
    .get().then(snapshot => {
      const container = document.getElementById("searchResultsUser");
      container.innerHTML = "";
      
      snapshot.forEach(doc => {
        const user = doc.data();
        if (user.uid === currentUser.uid) return;
        
        const result = document.createElement("div");
        result.className = "search-result";
        result.innerHTML = `
          <img src="${user.photoURL || 'default-avatar.png'}" class="search-avatar">
          <span class="search-username">${user.username}</span>
          <button onclick="sendFriendRequest('${doc.id}', '${user.username}')">Add Friend</button>
        `;
        container.appendChild(result);
      });
    });

  // Search groups
  db.collection("groups").where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff")
    .limit(10)
    .get().then(snapshot => {
      const container = document.getElementById("searchResultsGroup");
      container.innerHTML = "";
      
      snapshot.forEach(doc => {
        const group = doc.data();
        const result = document.createElement("div");
        result.className = "search-result";
        result.innerHTML = `
          <div class="group-name">${group.name}</div>
          <div class="group-members">${Object.keys(group.members || {}).length} members</div>
          <button onclick="joinGroupFromSearch('${doc.id}')">Join Group</button>
        `;
        container.appendChild(result);
      });
    });
}

function sendFriendRequest(uid, username) {
  db.collection("inbox").add({
    to: uid,
    from: currentUser.uid,
    fromName: document.getElementById("usernameDisplay").textContent,
    type: "Friend Request",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => alert(`Friend request sent to ${username}`));
}

function joinGroupFromSearch(groupId) {
  db.collection("groups").doc(groupId).update({
    [`members.${currentUser.uid}`]: true
  }).then(() => {
    alert("Joined group successfully!");
    joinRoom(groupId);
  }).catch(error => alert(error.message));
}

// ===== Theme Management =====
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark");
}

// Initialize app
window.onload = () => {
  applySavedTheme();
  document.getElementById("profilePicPreview").onclick = () => 
    document.getElementById("profilePic").click();
};
