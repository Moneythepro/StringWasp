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
let unsubscribeInbox = null; // Added missing unsubscribe
let currentThreadUser = null;

// ===== UI Functions =====
function switchTab(id) {
  const tabs = document.querySelectorAll(".tab");
  const targetTab = document.getElementById(id);
  if (!tabs.length || !targetTab) return;
  
  tabs.forEach(t => t.style.display = "none");
  targetTab.style.display = "block";
  
  if (id === "groupsTab") {
    loadRooms();
    if (currentRoom) listenMessages();
  }
}

function showLoading(show) {
  const loader = document.getElementById("loadingOverlay");
  if (loader) loader.style.display = show ? "flex" : "none";
}

// ===== Authentication =====
auth.onAuthStateChanged(async user => {
  try {
    if (user) {
      currentUser = user;
      const userDoc = await db.collection("users").doc(user.uid).get();
      const usernameDisplay = document.getElementById("usernameDisplay");
      
      if (!userDoc.exists || !userDoc.data().username) {
        switchTab("usernameDialog");
      } else {
        if (usernameDisplay) usernameDisplay.textContent = userDoc.data().username;
        loadMainUI();
      }
    } else {
      switchTab("loginPage");
    }
  } catch (error) {
    console.error("Auth error:", error);
  }
});

function login() {
  const email = document.getElementById("email")?.value.trim();
  const pass = document.getElementById("password")?.value;
  if (!email || !pass) return;
  
  auth.signInWithEmailAndPassword(email, pass)
    .catch(error => alert(error.message));
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const pass = document.getElementById("password")?.value;
  if (!email || !pass || pass.length < 6) return;
  
  auth.createUserWithEmailAndPassword(email, pass)
    .then(() => alert("Account created! Please set your username"))
    .catch(error => alert(error.message));
}

function saveUsername() {
  const username = document.getElementById("newUsername")?.value.trim();
  if (!username || username.length > 15) return;
  
  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = username;
    loadMainUI();
  });
}

// ===== Main App Functions =====
function loadMainUI() {
  const appPage = document.getElementById("appPage");
  if (appPage) appPage.style.display = "block";
  switchTab("groupsTab");
  loadInbox();
  loadFriends();
  loadProfile();
}

// ===== Group Management =====
function createGroup() {
  const groupName = prompt("Enter new group name:");
  if (!groupName || groupName.length > 20) return;
  
  db.collection("groups").doc(groupName).get().then(doc => {
    if (doc.exists) return alert("Group already exists");
    
    db.collection("groups").doc(groupName).set({
      name: groupName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid,
      members: { [currentUser.uid]: true }
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
  if (!confirm(`Leave group "${currentRoom}"?`)) return;
  
  db.collection("groups").doc(currentRoom).update({
    [`members.${currentUser.uid}`]: firebase.firestore.FieldValue.delete()
  }).then(() => {
    alert(`Left group "${currentRoom}"`);
    currentRoom = null;
    loadRooms();
    const messagesDiv = document.getElementById("messages");
    if (messagesDiv) messagesDiv.innerHTML = "";
  }).catch(error => alert(error.message));
}

function joinRoom(roomName) {
  currentRoom = roomName;
  if (unsubscribeMessages) unsubscribeMessages(); // If you use for global chats

  listenGroupMessages(); // For group messages
}

function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown) return;
  
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
  if (!currentRoom) return;
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;
  
  if (unsubscribeMessages) unsubscribeMessages();
  
  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => displayMessage(doc.data()));
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, error => console.error("Messages error:", error));
}

function listenGroupMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv) return;

  db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = "message-bubble left";
        bubble.textContent = `${msg.senderName}: ${msg.text}`;
        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function displayMessage(msg) {
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;
  
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
  const list = document.getElementById("inboxList");
  if (!list) return;

  if (unsubscribeInbox) unsubscribeInbox();

  unsubscribeInbox = db.collection("inbox")
    .where("to", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = snapshot.empty
        ? "<div class='empty'>No new messages</div>"
        : snapshot.docs.map(doc => createInboxCard(doc)).join("");
    }, error => console.error("❌ Inbox error:", error));
}

function createInboxCard(doc) {
  const data = doc.data();
  let sender = "Unknown";

  try {
    // Extract sender name
    if (typeof data.from === "string") {
      sender = data.from;
    } else if (data.fromName) {
      sender = data.fromName;
    } else if (typeof data.from === "object" && data.from !== null) {
      sender =
        data.from.username ||
        data.from.name ||
        data.from.email ||
        data.from.uid ||
        JSON.stringify(data.from);
    }
  } catch (e) {
    console.error("⚠️ Error parsing sender:", e);
  }

  return `
    <div class="inbox-card">
      <div><strong>${data.type || "Notification"}</strong><br>${sender}</div>
      <div class="btn-group">
        <button onclick="acceptRequest('${doc.id}')">✓</button>
        <button onclick="declineRequest('${doc.id}')">✕</button>
      </div>
    </div>
  `;
}

function acceptRequest(requestId) {
  if (!requestId) return console.error("❌ Invalid request ID");

  db.collection("inbox").doc(requestId).get().then(doc => {
    if (!doc.exists) return console.error("❌ Request not found");

    const request = doc.data();
    const fromUID = typeof request.from === "string" ? request.from : (request.from?.uid || null);
    const fromName = request.fromName || "Unknown";

    if (!fromUID) {
      console.error("❌ Missing or invalid sender UID in request:", request);
      return;
    }

    if (request.type && request.type.includes("Friend Request")) {
      db.collection("friends").doc(currentUser.uid).collection("list").doc(fromUID).set({
        uid: fromUID,
        username: fromName,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        doc.ref.delete();
        console.log("✅ Friend request accepted.");
      });
    } else {
      doc.ref.delete();
    }
  }).catch(error => {
    console.error("❌ Error accepting request:", error);
  });
}

function declineRequest(requestId) {
  if (!requestId) return console.error("❌ Invalid request ID");

  db.collection("inbox").doc(requestId).delete()
    .then(() => console.log("✅ Request declined."))
    .catch(error => console.error("❌ Error declining request:", error));
}

function markAllRead() {
  db.collection("inbox")
    .where("to", "==", currentUser.uid)
    .get()
    .then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    })
    .then(() => alert("✅ All messages marked as read"))
    .catch(error => console.error("❌ Failed to mark all as read:", error));
}

// ===== Friends System =====
function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container) return;
  
  db.collection("friends").doc(currentUser.uid).collection("list")
    .orderBy("addedAt", "desc")
    .onSnapshot(snapshot => {
      container.innerHTML = snapshot.empty
        ? "<div class='empty'>No friends yet</div>"
        : snapshot.docs.map(doc => createFriendElement(doc.data())).join("");
    }, error => console.error("Friends error:", error));
}

function createFriendElement(friend) {
  return `
    <div class="friend-item">
      <img src="${friend.photoURL || 'default-avatar.png'}" class="friend-avatar">
      <span class="friend-name">${friend.username}</span>
      <button onclick="openThread('${friend.uid}', '${friend.username}')">Message</button>
    </div>
  `;
}

// ===== Profile Management =====
function loadProfile() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    const nameInput = document.getElementById("profileName");
    const bioInput = document.getElementById("profileBio");
    const picPreview = document.getElementById("profilePicPreview");
    
    if (nameInput) nameInput.value = data.name || "";
    if (bioInput) bioInput.value = data.bio || "";
    if (picPreview) picPreview.src = data.photoURL || "default-avatar.png";
  });
}

function saveProfile() {
  const name = document.getElementById("profileName")?.value.trim();
  const bio = document.getElementById("profileBio")?.value.trim();
  const file = document.getElementById("profilePic")?.files[0];
  
  const updateData = { 
    name, 
    bio, 
    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
  };

  if (file) {
    const storageRef = firebase.storage().ref(`profile_pics/${currentUser.uid}`);
    storageRef.put(file).then(snapshot => snapshot.ref.getDownloadURL())
      .then(downloadURL => {
        updateData.photoURL = downloadURL;
        return saveProfileData(updateData);
      })
      .then(() => {
        const picPreview = document.getElementById("profilePicPreview");
        if (picPreview) picPreview.src = updateData.photoURL;
        alert("Profile updated with new photo!");
      })
      .catch(error => alert(error.message));
  } else {
    saveProfileData(updateData)
      .then(() => alert("Profile updated!"))
      .catch(error => alert(error.message));
  }
}

function saveProfileData(data) {
  return db.collection("users").doc(currentUser.uid).set(data, { merge: true });
}

// ===== Threads (Private Messages) =====
function openThread(uid, username) {
  switchTab("threadView");
  const threadWithName = document.getElementById("threadWithName");
  if (threadWithName) threadWithName.textContent = username;
  
  currentThreadUser = uid;
  if (unsubscribeThread) unsubscribeThread();

  unsubscribeThread = db.collection("threads").doc(threadId(currentUser.uid, uid)).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const area = document.getElementById("threadMessages");
      if (!area) return;
      
      area.innerHTML = snapshot.docs.map(doc => 
        createThreadMessage(doc.data(), doc.data().from === currentUser.uid)
      ).join("");
      area.scrollTop = area.scrollHeight;
    }, error => console.error("Thread error:", error));
}

function createThreadMessage(msg, isMine) {
  return `
    <div class="thread-message ${isMine ? "sent" : "received"}">
      <div class="message-content">${msg.text}</div>
      <div class="message-time">${msg.timestamp?.toDate?.().toLocaleTimeString() || ""}</div>
    </div>
  `;
}

function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;
  
  const threadRef = db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser));
  const fromName = document.getElementById("usernameDisplay")?.textContent || "Anonymous";
  
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
  const query = document.getElementById("searchInput")?.value.trim().toLowerCase();
  if (!query) return;

  // Search users
  db.collection("users").where("username", ">=", query)
    .where("username", "<=", query + "\uf8ff")
    .limit(10)
    .get().then(snapshot => {
      const container = document.getElementById("searchResultsUser");
      if (!container) return;
      
      container.innerHTML = snapshot.docs
        .filter(doc => doc.data().uid !== currentUser.uid)
        .map(doc => createUserSearchResult(doc))
        .join("");
    });

  // Search groups
  db.collection("groups").where("name", ">=", query)
    .where("name", "<=", query + "\uf8ff")
    .limit(10)
    .get().then(snapshot => {
      const container = document.getElementById("searchResultsGroup");
      if (!container) return;
      
      container.innerHTML = snapshot.docs.map(doc => createGroupSearchResult(doc)).join("");
    });
}

function createUserSearchResult(doc) {
  const user = doc.data();
  return `
    <div class="search-result">
      <img src="${user.photoURL || 'default-avatar.png'}" class="search-avatar">
      <span class="search-username">${user.username}</span>
      <button onclick="sendFriendRequest('${doc.id}', '${user.username}')">Add Friend</button>
    </div>
  `;
}

function createGroupSearchResult(doc) {
  const group = doc.data();
  return `
    <div class="search-result">
      <div class="group-name">${group.name}</div>
      <div class="group-members">${Object.keys(group.members || {}).length} members</div>
      <button onclick="joinGroupFromSearch('${doc.id}')">Join Group</button>
    </div>
  `;
}

function sendFriendRequest(uid, username) {
  const fromName = document.getElementById("usernameDisplay")?.textContent;
  if (!fromName) return;
  
  db.collection("inbox").add({
    to: uid,
    from: currentUser.uid,
    fromName,
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

function sendGroupMessage() {
  const input = document.getElementById("groupMessageInput");
  const text = input?.value.trim();
  if (!text || !currentRoom) return;

  db.collection("groups").doc(currentRoom).collection("messages").add({
    text,
    senderId: currentUser.uid,
    senderName: document.getElementById("usernameDisplay").textContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
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
  const picPreview = document.getElementById("profilePicPreview");
  const picInput = document.getElementById("profilePic");
  if (picPreview && picInput) {
    picPreview.onclick = () => picInput.click();
  }
};
