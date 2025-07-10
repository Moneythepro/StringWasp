// UUID generator with better error handling
function uuidv4() {
  try {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11)
      .replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
  } catch (e) {
    console.error("UUID generation failed:", e);
    return `fallback-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
}

// Firebase Initialization with null checks
const auth = firebase?.auth();
const db = firebase?.firestore();
if (!auth || !db) console.error("Firebase not properly initialized");

let currentUser = null;
let currentRoom = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;
let currentThreadUser = null;

// ===== UI Functions with null checks =====
function switchTab(id) {
  const tabs = document.querySelectorAll(".tab");
  const targetTab = document.getElementById(id);
  
  if (!tabs.length || !targetTab) {
    console.error("Tab elements not found");
    return;
  }

  tabs.forEach(t => t.style.display = "none");
  targetTab.style.display = "block";
  
  // Special handling for groups tab
  if (id === "groupsTab") {
    loadRooms();
    if (currentRoom) listenMessages();
  }
}

function showLoading(show) {
  const loader = document.getElementById("loadingOverlay");
  if (loader) loader.style.display = show ? "flex" : "none";
}

// ===== Authentication with enhanced validation =====
auth?.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    try {
      const userDoc = await db.collection("users").doc(user.uid).get();
      const usernameDisplay = document.getElementById("usernameDisplay");
      
      if (!userDoc.exists || !userDoc.data().username) {
        switchTab("usernameDialog");
      } else {
        if (usernameDisplay) usernameDisplay.textContent = userDoc.data().username;
        loadMainUI();
      }
    } catch (error) {
      console.error("Auth state error:", error);
      alert("Error loading user data");
    }
  } else {
    switchTab("loginPage");
  }
});

async function login() {
  const email = document.getElementById("email")?.value.trim();
  const pass = document.getElementById("password")?.value;
  
  if (!email || !pass) {
    alert("Please enter both email and password");
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (error) {
    alert(`Login failed: ${error.message}`);
  }
}

async function register() {
  const email = document.getElementById("email")?.value.trim();
  const pass = document.getElementById("password")?.value;
  
  if (!email || !pass) {
    alert("Please enter both email and password");
    return;
  }
  
  if (pass.length < 6) {
    alert("Password must be at least 6 characters");
    return;
  }

  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    alert("Account created! Please set your username");
  } catch (error) {
    alert(`Registration failed: ${error.message}`);
  }
}

async function saveUsername() {
  const usernameInput = document.getElementById("newUsername");
  if (!usernameInput) return;
  
  const username = usernameInput.value.trim();
  
  if (!username) {
    alert("Username cannot be empty");
    return;
  }
  
  if (username.length > 15) {
    alert("Username too long (max 15 chars)");
    return;
  }

  try {
    await db.collection("users").doc(currentUser.uid).set({
      username,
      email: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = username;
    loadMainUI();
  } catch (error) {
    alert(`Error saving username: ${error.message}`);
  }
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

// ===== Group Management with enhanced error handling =====
async function createGroup() {
  const groupName = prompt("Enter new group name:");
  if (!groupName) return;
  
  if (groupName.length > 20) {
    alert("Group name too long (max 20 chars)");
    return;
  }

  try {
    const groupDoc = await db.collection("groups").doc(groupName).get();
    
    if (groupDoc.exists) {
      alert("Group already exists");
      return;
    }
    
    await db.collection("groups").doc(groupName).set({
      name: groupName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid,
      members: {
        [currentUser.uid]: true
      }
    });
    
    joinRoom(groupName);
    alert(`Group "${groupName}" created successfully!`);
  } catch (error) {
    alert(`Error creating group: ${error.message}`);
  }
}

async function joinGroup() {
  const groupName = prompt("Enter group name to join:");
  if (!groupName) return;
  
  try {
    const groupDoc = await db.collection("groups").doc(groupName).get();
    
    if (!groupDoc.exists) {
      alert("Group doesn't exist");
      return;
    }
    
    await db.collection("groups").doc(groupName).update({
      [`members.${currentUser.uid}`]: true
    });
    
    joinRoom(groupName);
    alert(`Joined group "${groupName}" successfully!`);
  } catch (error) {
    alert(`Error joining group: ${error.message}`);
  }
}

async function leaveGroup() {
  if (!currentRoom) {
    alert("Not in any group");
    return;
  }
  
  if (!confirm(`Leave group "${currentRoom}"?`)) return;
  
  try {
    await db.collection("groups").doc(currentRoom).update({
      [`members.${currentUser.uid}`]: firebase.firestore.FieldValue.delete()
    });
    
    alert(`Left group "${currentRoom}"`);
    currentRoom = null;
    loadRooms();
    
    const messagesDiv = document.getElementById("messages");
    if (messagesDiv) messagesDiv.innerHTML = "";
  } catch (error) {
    alert(`Error leaving group: ${error.message}`);
  }
}

function joinRoom(roomName) {
  currentRoom = roomName;
  
  const dropdown = document.getElementById("roomDropdown");
  if (dropdown) dropdown.value = roomName;
  
  if (unsubscribeMessages) unsubscribeMessages();
  listenMessages();
}

async function loadRooms() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown) return;
  
  dropdown.innerHTML = '<option value="">Select a group</option>';
  
  try {
    const snapshot = await db.collection("groups")
      .where(`members.${currentUser.uid}`, "==", true)
      .get();
    
    if (snapshot.empty) {
      dropdown.innerHTML = '<option value="">No groups yet</option>';
      return;
    }
    
    snapshot.forEach(doc => {
      const opt = document.createElement("option");
      opt.textContent = doc.id;
      opt.value = doc.id;
      dropdown.appendChild(opt);
    });
  } catch (error) {
    console.error("Error loading rooms:", error);
  }
}

// ===== Messaging System =====
function listenMessages() {
  if (!currentRoom) return;
  
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;
  
  unsubscribeMessages = db.collection("groups").doc(currentRoom)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(
      snapshot => {
        messagesDiv.innerHTML = "";
        snapshot.forEach(doc => {
          displayMessage(doc.data());
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      },
      error => console.error("Message listener error:", error)
    );
}

function displayMessage(msg) {
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;
  
  const isMine = msg.senderId === currentUser.uid;
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${isMine ? "right" : "left"}`;
  
  const timestamp = msg.timestamp?.toDate?.();
  bubble.title = timestamp ? timestamp.toLocaleString() : "";

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

async function sendMessage() {
  const input = document.getElementById("messageInput");
  if (!input) return;
  
  const text = input.value.trim();
  if (!text || !currentRoom) return;

  try {
    const userDoc = await db.collection("users").doc(currentUser.uid).get();
    const userData = userDoc.data();
    
    await db.collection("groups").doc(currentRoom).collection("messages").add({
      text,
      senderName: userData?.username || "Anonymous",
      senderId: currentUser.uid,
      senderPic: userData?.photoURL || "default-avatar.png",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    input.value = "";
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// ===== Inbox System with improved UI =====
function loadInbox() {
  const list = document.getElementById("inboxList");
  if (!list) return;
  
  unsubscribeInbox = db.collection("inbox")
    .where("to", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .onSnapshot(
      snapshot => {
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
            <div class="inbox-header">
              <span class="inbox-type">${item.type}</span>
              <span class="inbox-time">${item.timestamp?.toDate?.().toLocaleTimeString() || ""}</span>
            </div>
            <div class="inbox-from">From: ${item.fromName}</div>
            <div class="inbox-actions">
              <button onclick="acceptRequest('${doc.id}')">✓ Accept</button>
              <button onclick="declineRequest('${doc.id}')">✕ Decline</button>
            </div>
          `;
          list.appendChild(card);
        });
      },
      error => console.error("Inbox error:", error)
    );
}

// ... (rest of the code remains similar with added null checks)

// Initialize app with error handling
window.onload = () => {
  try {
    applySavedTheme();
    
    const picPreview = document.getElementById("profilePicPreview");
    const picInput = document.getElementById("profilePic");
    
    if (picPreview && picInput) {
      picPreview.onclick = () => picInput.click();
    }
  } catch (error) {
    console.error("Initialization error:", error);
  }
};
