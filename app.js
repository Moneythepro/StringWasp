// ====== StringWasp App.js (Final Unified Version, Part 1) ======

// 🔐 UUID Generator
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// ===== Firebase & Storage Init =====
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===== WebTorrent Init =====
let client = null;

// ===== Global State =====
let currentUser = null;
let currentRoom = null;
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;
let unsubscribeInbox = null;
let unsubscribeTyping = null;


function loadMainUI() {
  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");

  loadInbox();
  loadFriends();
  loadProfile();
  loadGroups?.();
  loadChatList();

  if (joinGroupId && auth.currentUser) {
    showModal("Join this group?", () => {
      joinGroupById(joinGroupId);

      if (list.innerHTML === "") {
  list.innerHTML = "<p>No chats yet. Start a conversation!</p>";
      }
      
    });
  }
}

// ===== Loading Overlay =====
function showLoading(state) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = state ? "flex" : "none";
}

// ===== Auth Listener =====
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join");

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;

    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.data();

    if (!userData?.username) {
      console.warn("User missing username, redirecting to setup.");
      switchTab("usernameDialog");
      return;
    }

    const nameEl = document.getElementById("usernameDisplay");
    if (nameEl) nameEl.textContent = userData.username;

    loadMainUI();

    // ✅ Handle group invite
    if (joinGroupId) {
      db.collection("groups").doc(joinGroupId).get().then(doc => {
        if (!doc.exists) return alert("⚠️ Group not found or invite expired.");
        const group = doc.data();
        showModal(`Join group "${group.name}"?`, () => {
          joinGroupById(joinGroupId);
          history.replaceState({}, document.title, window.location.pathname);
        });
      }).catch(err => {
        console.error("Group join error:", err);
        alert("⚠️ Could not process group invite.");
      });
    }

  } else {
    switchTab("loginPage");
  }
});

// ===== Login/Register =====
function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading(true);
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => alert("Login failed: " + err.message))
    .finally(() => showLoading(false));
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading(true);
  auth.createUserWithEmailAndPassword(email, password)
    .catch(err => alert("Registration failed: " + err.message))
    .finally(() => showLoading(false));
}

// ===== Username Save After Register =====
function saveUsername() {
  const username = document.getElementById("newUsername")?.value.trim();
  if (!username) return alert("Enter a username");

  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  });
}

// ===== Confirm Username Before Load =====
function checkUsername() {
  db.collection("users").doc(currentUser.uid).get().then(doc => {
    if (!doc.exists || !doc.data().username) {
      switchTab("usernameDialog"); // Ask username
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI(); // Proceed to app
    }
  });
}

// ===== Main App Load UI =====
function loadMainUI() {
  showLoading(true); // Optional: Show loading spinner

  document.getElementById("appPage").style.display = "block";
  switchTab("chatTab");

  // Safe calls with error catching
  try { loadInbox(); } catch (e) { console.warn("Inbox failed", e); }
  try { loadFriends(); } catch (e) { console.warn("Friends failed", e); }
  try { loadProfile(); } catch (e) { console.warn("Profile failed", e); }
  try { loadGroups?.(); } catch (e) { console.warn("Groups load skipped", e); }
  try { loadChatList(); } catch (e) { console.warn("Chats failed", e); }

  setTimeout(() => showLoading(false), 300); // Slight delay for smoother transition
}

// ===== Save Profile Data =====
function saveProfile() {
  const file = document.getElementById("profilePic").files[0];
  const data = {
    name: document.getElementById("profileName").value,
    bio: document.getElementById("profileBio").value,
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value,
    email: document.getElementById("profileEmail").value,
    username: document.getElementById("profileUsername").value
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      data.photoURL = e.target.result;
      db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
        document.getElementById("profilePicPreview").src = e.target.result;
        alert("✅ Profile updated.");
      });
    };
    reader.readAsDataURL(file);
  } else {
    db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(() => {
      alert("✅ Profile updated.");
    });
  }
}

// ===== Load Profile UI =====
function loadProfile() {
  const uid = currentUser?.uid;
  if (!uid) return;

  db.collection("users").doc(uid).get().then(doc => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("profilePicPreview").src = data.photoURL || "default-avatar.png";
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.publicEmail || "";
    document.getElementById("profileUsername").value = data.username || "";
  });
}

  function saveProfile() {
  const updates = {
    name: document.getElementById("profileName").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value.trim(),
    publicEmail: document.getElementById("profileEmail").value.trim(),
    username: document.getElementById("profileUsername").value.trim()
  };

  db.collection("users").doc(currentUser.uid).update(updates).then(() => {
    alert("Profile updated!");
    document.getElementById("usernameDisplay").textContent = updates.username;
  }).catch(err => {
    console.error("Profile save error:", err);
    alert("Failed to save profile");
  });
  }

document.getElementById("profilePic").addEventListener("change", uploadProfilePic);

function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const ref = storage.ref().child(`avatars/${currentUser.uid}`);
  showLoading(true);

  ref.put(file).then(snapshot => snapshot.ref.getDownloadURL())
    .then(url => {
      return db.collection("users").doc(currentUser.uid).update({
        photoURL: url
      });
    }).then(() => {
      document.getElementById("profilePicPreview").src = URL.createObjectURL(file);
      alert("Profile picture updated!");
    }).catch(err => {
      console.error("Upload error:", err);
      alert("Failed to upload profile picture.");
    }).finally(() => {
      showLoading(false);
    });
}
  
let currentProfileUID = null;

function viewUserProfile(uid) {
  currentProfileUID = uid;

  db.collection("users").doc(uid).get().then(doc => {
    const u = doc.data();
    if (!u) return alert("User not found");

    document.getElementById("fullUserAvatar").src = u.photoURL || "default-avatar.png";
    document.getElementById("fullUserName").textContent = "@" + (u.username || "unknown");
    document.getElementById("fullUserBio").textContent = u.bio || "No bio";
    document.getElementById("fullUserEmail").textContent = u.email || "";
    document.getElementById("fullUserPhone").textContent = u.phone || "";

    document.getElementById("userFullProfile").style.display = "flex";
  });
}

window.onclick = e => {
  if (e.target.id === "userFullProfile") {
    e.target.style.display = "none";
  }
};

let currentGroupProfileId = null;

function viewGroupInfo(groupId) {
  currentGroupProfileId = groupId;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) return alert("Group not found");

    const g = doc.data();
    document.getElementById("groupIcon").src = g.icon || "group-icon.png";
    document.getElementById("groupName").textContent = g.name || "Unnamed Group";
    document.getElementById("groupDesc").textContent = g.description || "No description";
    document.getElementById("groupOwnerText").textContent = `Owner: ${g.ownerName || g.owner || "Unknown"}`;
    document.getElementById("groupMembersText").textContent = `Members: ${g.members?.length || 0}`;

    document.getElementById("groupInfoModal").style.display = "flex";
  });
}

// ===== Contact Support Shortcut =====
function contactSupport() {
  alert("Contact us at: support@stringwasp.com");
}

// ===== Logout & Reset App =====
function logout() {
  firebase.auth().signOut();
  window.location.reload();
}

// ===== Group List for Dropdowns =====
function loadGroups() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown || !currentUser) return;

  db.collection("groups").where("members", "array-contains", currentUser.uid).get()
    .then(snapshot => {
      dropdown.innerHTML = "";
      snapshot.forEach(doc => {
        const group = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = group.name || doc.id;
        dropdown.appendChild(option);
      });
    });
}

// ===== Load All Chats (DMs + Groups) =====
function loadChatList() {
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  // === Load Threads (DMs) - Real-time ===
  if (unsubscribeThreads) unsubscribeThreads();
  unsubscribeThreads = db.collection("threads")
    .where("participants", "array-contains", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .onSnapshot(snapshot => {
      list.innerHTML = ""; // Clear old list before redraw

      snapshot.forEach(doc => {
        const t = doc.data();
        const otherUID = t.participants.find(p => p !== currentUser.uid);
        const name = t.names?.[otherUID] || "Friend";

        // === Last Message Preview ===
        let msgText = "[No message]";
        let fromSelf = false;
        if (typeof t.lastMessage === "string") {
          msgText = t.lastMessage;
        } else if (typeof t.lastMessage === "object") {
          msgText = t.lastMessage.text || "[No message]";
          fromSelf = t.lastMessage.from === currentUser.uid;
        }

        const senderPrefix = fromSelf ? "You: " : "";
        const preview = `${senderPrefix}${msgText}`;

        // === Unread badge ===
        const unread = t.unread?.[currentUser.uid] || 0;
        const badgeHTML = unread ? `<span class="badge">${unread}</span>` : "";

        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;

        const card = document.createElement("div");
        card.className = "chat-card";
        card.onclick = () => openThread(otherUID, name);
        card.innerHTML = `
          <img src="${avatar}" class="friend-avatar" />
          <div class="details">
            <div class="name">@${name} ${badgeHTML}</div>
            <div class="last-message">${preview}</div>
          </div>
        `;
        list.appendChild(card);
      });
    });

  // === Load Groups - Real-time ===
  if (unsubscribeGroups) unsubscribeGroups();
  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const g = doc.data();
        const groupName = g.name || "Unnamed Group";

        // === Last Group Message Preview ===
        let msgText = g.description || "[No recent message]";
        if (typeof g.lastMessage === "string") {
          msgText = g.lastMessage;
        } else if (typeof g.lastMessage === "object" && g.lastMessage.text) {
          msgText = g.lastMessage.text;
        }

        const preview = `${msgText}`;

        // === Unread badge ===
        const unread = g.unread?.[currentUser.uid] || 0;
        const badgeHTML = unread ? `<span class="badge">${unread}</span>` : "";

        const card = document.createElement("div");
        card.className = "chat-card";
        card.onclick = () => joinRoom(doc.id);
        card.innerHTML = `
          <div class="details">
            <div class="name">#${groupName} ${badgeHTML}</div>
            <div class="last-message">${preview}</div>
          </div>
        `;
        list.appendChild(card);
      });
    });
}
  

function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = (menu.style.display === "block") ? "none" : "block";
}



// ===== Escape HTML Utility =====
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===== Inbox Listener =====
function listenInbox() {
  const list = document.getElementById("inboxList");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();
  unsubscribeInbox = db.collection("inbox").doc(currentUser.uid).collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(async snapshot => {
      list.innerHTML = "";
      let unreadCount = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data.read) unreadCount++;

        let senderName = "Unknown";
        if (data.fromName) {
          senderName = data.fromName;
        } else if (data.from) {
          const senderDoc = await db.collection("users").doc(data.from).get();
          senderName = senderDoc.exists ? (senderDoc.data().username || senderDoc.data().name || "Unknown") : "Unknown";
        }

        const card = document.createElement("div");
        card.className = "inbox-card";
        card.innerHTML = `
          <div>
            <strong>${data.type === "friend" ? "Friend Request" : "Group Invite"}</strong><br>
            From: ${senderName}
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${doc.id}', '${data.type}', '${data.from}')">✔</button>
            <button onclick="declineInbox('${doc.id}')">✖</button>
          </div>
        `;
        list.appendChild(card);
      }

      const badge = document.getElementById("inboxBadge");
      if (badge) {
        badge.textContent = unreadCount || "";
        badge.style.display = unreadCount ? "inline-block" : "none";
      }
    });
}

// ===== Accept Inbox Item =====
function acceptInbox(id, type, from) {
  if (!from || !currentUser?.uid) return;

  if (type === "friend") {
    const myRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(from);
    const theirRef = db.collection("users").doc(from).collection("friends").doc(currentUser.uid);
    Promise.all([
      myRef.set({ added: true }),
      theirRef.set({ added: true })
    ]);
  } else if (type === "group") {
    db.collection("groups").doc(from).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  }

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

// ===== Decline Inbox Item =====
function declineInbox(id) {
  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete();
}

// ===== Mark All as Read =====
function markAllRead() {
  const ref = db.collection("inbox").doc(currentUser.uid).collection("items");
  ref.get().then(snapshot => {
    snapshot.forEach(doc => {
      if (!doc.data().read) {
        ref.doc(doc.id).update({ read: true });
      }
    });
  });
}

