// ====== StringWasp App.js Final Unified Version ======

// 🔐 UUID Generator
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

// ===== Firebase & Storage Init =====
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===== Invite Link via URL =====
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join");

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
let unsubscribeThreads = null;
let unsubscribeGroups = null;

// ===== Loading Overlay =====
function showLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";
}
function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

// ===== Switch UI Tabs =====
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const selected = document.getElementById(tabId);
  if (selected) selected.style.display = "block";
}

// ===== Login/Register =====
function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading();
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => alert("Login failed: " + err.message))
    .finally(() => hideLoading());
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  if (!email || !password) return alert("Enter email & password");

  showLoading();
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      switchTab("usernameDialog");
    })
    .catch(err => alert("❌ Registration failed: " + err.message))
    .finally(() => hideLoading());
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
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI();
    }
  });
}

// ===== Main App Load UI =====
function loadMainUI() {
  showLoading();

  document.getElementById("appPage").style.display = "block";

  loadProfile(() => {
    try { loadChatList(); } catch (e) { console.warn("Chats failed", e); }
    try { loadFriends(); } catch (e) { console.warn("Friends failed", e); }
    try { loadGroups?.(); } catch (e) { console.warn("Groups skipped", e); }
    try { listenInbox(); } catch (e) { console.warn("Inbox failed", e); }  // ✅ added

    switchTab("chatTab");

    setTimeout(() => {
      hideLoading();
    }, 300);
  });
}

// ===== Load App After Login =====
auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    hideLoading();
    return;
  }

  currentUser = user;

  // ✅ Set online status and last seen updater
  const userRef = db.collection("users").doc(user.uid);
  try {
    await userRef.update({
      status: "online",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 🔁 Automatically set lastSeen on tab close / refresh
    window.addEventListener("beforeunload", () => {
      navigator.sendBeacon(`/offline?uid=${user.uid}`);
      userRef.update({
        status: "offline",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    });
  } catch (e) {
    console.warn("⚠️ Could not update user presence:", e.message);
  }

  try {
    const doc = await userRef.get();
    const data = doc.data();

    if (!data?.username) {
      switchTab("usernameDialog");
      hideLoading();
      return;
    }

    document.getElementById("usernameDisplay").textContent = data.username;

    document.querySelector(".profile-edit-label").onclick = () => {
      document.getElementById("profilePic").click();
    };

    loadMainUI();

    if (joinGroupId) {
      try {
        await tryJoinGroup(joinGroupId);
      } catch (e) {
        console.warn("Group join failed:", e);
      }
    }

    switchTab("chatTab");

  } catch (err) {
    console.error("❌ User load error:", err.message || err);
    alert("❌ Failed to load user info: " + (err.message || JSON.stringify(err)));
  } finally {
    hideLoading();
  }
});

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
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
function loadProfile(callback) {
  if (!currentUser?.uid) {
    console.warn("🔒 No authenticated user to load profile.");
    if (typeof callback === "function") callback();
    return;
  }

  db.collection("users").doc(currentUser.uid).onSnapshot(doc => {
    if (!doc.exists) {
      console.warn("⚠️ User profile document not found.");
      if (typeof callback === "function") callback();
      return;
    }

    const data = doc.data() || {};

    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profileUsername").value = data.username || "";

    const avatarUrl = data.avatar?.trim()
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || "User")}&background=random`;

    document.getElementById("profilePicPreview").src = avatarUrl;

    if (typeof callback === "function") callback();
  }, err => {
    console.error("❌ Failed to load profile:", err.message || err);
    if (typeof callback === "function") callback();
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

function triggerProfileUpload() {
  document.getElementById("profilePic").addEventListener("change", uploadProfilePic);
}


let cropper = null;

function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const img = document.getElementById("cropImage");
  if (!img) return alert("❌ Crop image element not found!");

  const reader = new FileReader();
  reader.onload = () => {
    img.src = reader.result;

    if (cropper) cropper.destroy();
    cropper = new Cropper(img, {
      aspectRatio: 1,
      viewMode: 1,
      autoCropArea: 1
    });

    document.getElementById("cropModal").style.display = "flex";
  };
  reader.readAsDataURL(file);
}

async function confirmCrop() {
  if (!cropper || !currentUser) {
    alert("❌ Missing cropper or user.");
    return;
  }

  showLoading(true);

  try {
    const canvas = cropper.getCroppedCanvas({
      width: 300,
      height: 300,
      imageSmoothingQuality: "high"
    });

    if (!canvas) {
      alert("❌ Failed to get crop canvas.");
      return;
    }

    const base64 = canvas.toDataURL("image/jpeg", 0.7); // Compress to base64

    await db.collection("users").doc(currentUser.uid).update({
      avatarBase64: base64
    });

    document.getElementById("profilePicPreview").src = base64;

    closeCropModal();
    alert("✅ Profile picture updated!");

    loadProfile();
    loadChatList();
  } catch (err) {
    console.error("❌ Crop error:", err.message || err);
    alert("❌ Failed to upload avatar.");
  } finally {
    showLoading(false);
  }
}

function closeCropModal() {
  const modal = document.getElementById("cropModal");
  modal.style.display = "none";

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

  
let currentProfileUID = null;

// ===== View User Profile Modal =====
function viewUserProfile(uid) {
  currentProfileUID = uid;
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return alert("User not found");

    const user = doc.data();
    const avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

    document.getElementById("viewProfilePic").src = avatar;
    document.getElementById("viewProfileName").textContent = user.name || "Unnamed";
    document.getElementById("viewProfileUsername").textContent = `@${user.username || "unknown"}`;
    document.getElementById("viewProfileBio").textContent = user.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = user.email || "";
    document.getElementById("viewProfileStatus").textContent = user.status || "";

    document.getElementById("viewProfileModal").style.display = "flex";

    const btnGroup = document.querySelector("#viewProfileModal .btn-group");
    if (!btnGroup) return;
    btnGroup.innerHTML = "";

    db.collection("users").doc(currentUser.uid).collection("friends").doc(uid).get().then(friendDoc => {
      if (friendDoc.exists) {
        const btn = document.createElement("button");
        btn.textContent = "Unfriend";
        btn.onclick = () => removeFriend(uid);
        btnGroup.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.textContent = "Add Friend";
        btn.onclick = () => addFriend(uid);
        btnGroup.appendChild(btn);
      }
    });
  });
}

// ===== Contact Support Shortcut =====
function contactSupport() {
  alert("Contact us at: support@stringwasp.com");
}

// ===== Logout & Reset App =====
function logout() {
  if (currentUser) {
    const userRef = db.collection("users").doc(currentUser.uid);
    userRef.update({
      status: "offline",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }

  firebase.auth().signOut().then(() => {
    window.location.reload();
  });
}

// ===== Group List for Dropdowns =====
function loadGroups() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown || !currentUser) return;

  if (unsubscribeGroups) unsubscribeGroups(); // optional if used elsewhere

  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(
      snapshot => {
        dropdown.innerHTML = "";
        snapshot.forEach(doc => {
          const group = doc.data();
          const option = document.createElement("option");
          option.value = doc.id;
          option.textContent = group.name || doc.id;
          dropdown.appendChild(option);
        });
      },
      err => {
        console.error("❌ Real-time group loading error:", err.message || err);
      }
    );
}

function createGroup() {
  const name = prompt("Enter group name:");
  if (!name || !currentUser) return;

  const groupId = uuidv4();
  const group = {
    name,
    owner: currentUser.uid,
    admins: [currentUser.uid],
    members: [currentUser.uid],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), // ✅ Ensure it's added
    lastMessage: "Group created"
  };

  db.collection("groups").doc(groupId).set(group).then(() => {
    // Create associated thread
    db.collection("threads").doc(groupId).set({
      messages: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    joinRoom(groupId);
  }).catch(err => {
    console.error("❌ Group creation failed:", err.message || err);
    alert("❌ Failed to create group.");
  });
}

// ===== Chat List Loader =====
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list) return;

  list.innerHTML = ""; // ✅ Clear only once before loading both chats

  setTimeout(() => {
    try {
      loadRealtimeGroups();
    } catch (e) {
      console.error("❌ Group load failed:", e);
    }

    try {
      loadFriendThreads();
    } catch (e) {
      console.error("❌ Thread load failed:", e);
    }
  }, 200);
}

// ===== Realtime Group Chats =====
function loadRealtimeGroups() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  if (unsubscribeGroups) unsubscribeGroups();

  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .onSnapshot(snapshot => {
      if (snapshot.empty) {
        console.log("ℹ No groups found.");
        return;
      }

      snapshot.forEach(doc => {
        const group = doc.data();
        const icon = group.icon || "group-icon.png";
        const name = group.name || "Group";
        const unread = group.unread?.[currentUser.uid] || 0;

        let lastMsg = "[No message]";
        if (typeof group.lastMessage === "string") {
          lastMsg = group.lastMessage;
        } else if (typeof group.lastMessage === "object") {
          lastMsg = group.lastMessage?.text || "[No message]";
        }

        const card = document.createElement("div");
        card.className = "chat-card group-chat";
        card.onclick = () => joinRoom(doc.id);
        card.innerHTML = `
          <img class="group-avatar" src="${icon}" />
          <div class="details">
            <div class="name">#${escapeHtml(name)}</div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;
        list.appendChild(card);
      });
    }, err => {
      console.error("❌ Group snapshot error:", err.message || err);
    });
  setTimeout(() => {
  const list = document.getElementById("chatList");
  if (list && list.children.length === 0) {
    list.innerHTML = `<div class="no-results">No chats found.</div>`;
  }
}, 1500);
  
}

// ===== Direct Message Threads =====
function loadFriendThreads() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  if (unsubscribeThreads) unsubscribeThreads();

  unsubscribeThreads = db.collection("threads")
    .where("participants", "array-contains", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .onSnapshot(async snapshot => {
      if (snapshot.empty) {
        console.log("ℹ No threads found.");
        return;
      }

      for (const doc of snapshot.docs) {
        const thread = doc.data();
        const otherUid = thread.participants.find(uid => uid !== currentUser.uid);
        if (!otherUid) continue;

        let user;
        try {
          const userDoc = await db.collection("users").doc(otherUid).get();
          if (!userDoc.exists) continue;
          user = userDoc.data();
        } catch {
          continue;
        }

        const avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
        const name = user.username || "Friend";

        let lastMsg = "[No message]";
        if (typeof thread.lastMessage === "string") {
          lastMsg = thread.lastMessage;
        } else if (typeof thread.lastMessage === "object") {
          lastMsg = thread.lastMessage?.text || "[No message]";
        }

        const unread = thread.unread?.[currentUser.uid] || 0;

        const card = document.createElement("div");
        card.className = "chat-card personal-chat";
        card.onclick = () => openThread(otherUid, name);
        card.innerHTML = `
          <img class="friend-avatar" src="${avatar}" />
          <div class="details">
            <div class="name">${escapeHtml(name)}</div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;
        list.appendChild(card);
      }
    }, err => {
      console.error("❌ Thread snapshot error:", err.message || err);
    });
  setTimeout(() => {
  const list = document.getElementById("chatList");
  if (list && list.children.length === 0) {
    list.innerHTML = `<div class="no-results">No chats found.</div>`;
  }
}, 1500);
  
}

// ===== Chat Filter (Local search) =====
function searchChats(term) {
  const chats = document.querySelectorAll(".chat-card");
  chats.forEach(chat => {
    const text = chat.textContent.toLowerCase();
    chat.style.display = text.includes(term.toLowerCase()) ? "block" : "none";
  });
}

// ===== Load Messages in Group =====
function loadRoomMessages(groupId) {
  const box = document.getElementById("roomMessages");
  if (!groupId || !currentUser || !box) return;

  box.innerHTML = "";

  db.collection("threads").doc(groupId).collection("messages")
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {
      box.innerHTML = "";

      snapshot.forEach(doc => {
        const m = doc.data();
        const fromSelf = m.from === currentUser.uid;
        const msgText = m.text || "";
        let decrypted = "";

        try {
          decrypted = CryptoJS.AES.decrypt(msgText, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        } catch {
          decrypted = "[Encrypted]";
        }

        const bubble = document.createElement("div");
        bubble.className = `message-bubble ${fromSelf ? "right" : "left"}`;
        bubble.innerHTML = `
          <div class="msg-content">${escapeHtml(decrypted)}</div>
          <div class="message-time">${timeSince(m.timestamp?.toDate?.() || new Date())}</div>
        `;
        box.appendChild(bubble);
      });

      box.scrollTop = box.scrollHeight;
    }, err => {
      console.error("❌ Room message load failed:", err.message || err);
    });
}

// === Send Room Message (Group Chat) ===
function sendRoomMessage() {
  const input = document.getElementById("roomInput");
  const text = input?.value.trim();
  if (!text || !currentRoom || !currentUser) return;

  const encrypted = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const fromName = document.getElementById("usernameDisplay").textContent;

  const msg = {
    text: encrypted,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  const threadRef = db.collection("threads").doc(currentRoom);
  const groupRef = db.collection("groups").doc(currentRoom);

  // 🔄 Send message
  threadRef.collection("messages").add(msg).then(() => {
    input.value = "";

    // ✅ Update group lastMessage + updatedAt
    groupRef.set({
      lastMessage: text,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

  }).catch(err => {
    console.error("❌ Group message failed:", err.message || err);
    alert("❌ Failed to send message.");
  });
}

// ===== Typing Indicator (Unified Final Version) =====
function handleTyping(context) {
  if (!currentUser) return;

  let typingRef;
  if (context === "group" && currentRoom) {
    typingRef = db.collection("groups")
      .doc(currentRoom)
      .collection("typing")
      .doc(currentUser.uid);
  } else if (context === "thread" && currentThreadUser) {
    const thread = threadId(currentUser.uid, currentThreadUser);
    typingRef = db.collection("threads")
      .doc(thread)
      .collection("typing")
      .doc(currentUser.uid);
  } else {
    return;
  }

  typingRef.set({
    typing: true,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(console.warn);

  // Auto-clear after 3 seconds
  setTimeout(() => {
    typingRef.delete().catch(() => {});
  }, 3000);
}

// ===== Typing Indicator Listener (with usernames) =====
function listenToTyping(targetId, context) {
  const typingBox = document.getElementById(
    context === "group" ? "groupTypingStatus" : "threadTypingStatus"
  );
  const statusBox = document.getElementById("chatStatus"); // header

  if (!typingBox) return;
  if (unsubscribeTyping) unsubscribeTyping();

  unsubscribeTyping = db.collection("threads")
    .doc(targetId)
    .collection("typing")
    .onSnapshot(async snapshot => {
      const typingUsernames = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (doc.id !== currentUser.uid && data?.typing) {
          try {
            const userSnap = await db.collection("users").doc(doc.id).get();
            const username = userSnap.exists ? (userSnap.data().username || "Someone") : "Someone";
            typingUsernames.push(username);
          } catch {
            typingUsernames.push("Someone");
          }
        }
      }

      // Show who is typing
      if (typingUsernames.length === 1) {
        typingBox.innerText = `✍️ ${typingUsernames[0]} is typing...`;
        if (context === "thread" && statusBox) statusBox.textContent = "Typing...";
      } else if (typingUsernames.length > 1) {
        typingBox.innerText = `✍️ ${typingUsernames.join(", ")} are typing...`;
        if (context === "thread" && statusBox) statusBox.textContent = "Typing...";
      } else {
        typingBox.innerText = "";
        if (context === "thread" && statusBox) statusBox.textContent = "Online";
      }
    });
}

function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = (menu.style.display === "flex") ? "none" : "flex";
}

function timeSince(date) {
  if (!date) return "";
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = [
    [31536000, 'y'],
    [2592000, 'mo'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's']
  ];
  for (const [secs, label] of intervals) {
    const interval = Math.floor(seconds / secs);
    if (interval >= 1) return `${interval}${label}`;
  }
  return "just now";
}


// ===== Load Inbox Items (Cards + Badge) =====
function listenInbox() {
  const list = document.getElementById("inboxList");
  const badge = document.getElementById("inboxBadge");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox(); // clear previous listener

  unsubscribeInbox = db.collection("inbox")
    .doc(currentUser.uid)
    .collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(async (snapshot) => {
      try {
        list.innerHTML = "";
        let unreadCount = 0;

        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data) continue;

          // Count unread
          if (!data.read) unreadCount++;

          // Get sender info
          let senderName = "Unknown";
          let fromUID = "";
          let avatarURL = "default-avatar.png";

          if (typeof data.from === "string") {
            fromUID = data.from;
            try {
              const senderDoc = await db.collection("users").doc(fromUID).get();
              if (senderDoc.exists) {
                const senderData = senderDoc.data();
                senderName = senderData.username || senderData.name || "Unknown";
                avatarURL = senderData.photoURL || `https://ui-avatars.com/api/?name=${senderName}`;
              }
            } catch (e) {
              console.warn("⚠️ Sender fetch failed:", e.message);
            }
          } else if (data.from?.uid) {
            fromUID = data.from.uid;
            senderName = data.from.name || "Unknown";
          }

          const typeText = data.type === "friend"
            ? "👤 Friend request from @" + senderName
            : data.type === "group"
              ? `📣 Group invite: ${data.groupName || "Unnamed Group"}`
              : "📩 Notification";

          const card = document.createElement("div");
          card.className = "inbox-card";
          card.innerHTML = `
            <img src="${avatarURL}" alt="Avatar" />
            <div style="flex:1">
              <div style="font-weight:bold;">${typeText}</div>
              <div style="font-size:12px; color:#777;">${timeSince(data.timestamp?.toDate?.() || new Date())}</div>
            </div>
            <div class="btn-group">
              <button onclick="acceptInbox('${doc.id}', '${data.type}', '${fromUID}')">Accept</button>
              <button onclick="declineInbox('${doc.id}')">Decline</button>
            </div>
          `;
          list.appendChild(card);
        }

        if (badge) {
          badge.textContent = unreadCount ? unreadCount : "";
          badge.style.display = unreadCount ? "inline-block" : "none";
        }

      } catch (err) {
        console.error("❌ Inbox render error:", err.message);
        alert("❌ Failed to load inbox");
      }
    }, err => {
      console.error("❌ Inbox listener error:", err.message);
      alert("❌ Inbox loading failed");
    });
}

function updateInboxBadge() {
  if (!currentUser) return;

  db.collection("inbox").doc(currentUser.uid).collection("items")
    .where("timestamp", ">", new Date(Date.now() - 86400000)) // recent 1 day
    .get().then(snapshot => {
      const badge = document.getElementById("inboxBadge");
      badge.textContent = snapshot.size ? snapshot.size : "";
    });
}

// ===== Accept Inbox Item =====
function acceptInbox(id, type, fromUID) {
  if (!currentUser || !id || !type || !fromUID) return;

  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items").doc(id);

  if (type === "friend") {
    const batch = db.batch();

    const userRef = db.collection("users")
      .doc(currentUser.uid)
      .collection("friends")
      .doc(fromUID);

    const otherRef = db.collection("users")
      .doc(fromUID)
      .collection("friends")
      .doc(currentUser.uid);

    batch.set(userRef, { since: Date.now() });
    batch.set(otherRef, { since: Date.now() });
    batch.delete(inboxRef);

    batch.commit().then(() => {
      alert("✅ Friend added!");
      
      // ✅ Optional: auto-open DM thread
      openThread(fromUID, "Friend");

      // ✅ Optional: reload updated UI
      loadFriends?.();
      loadChatList?.();

    }).catch(err => {
      console.error("❌ Friend accept failed:", err.message || err);
      alert("❌ Failed to accept friend.");
    });

  } else if (type === "group") {
    db.collection("groups").doc(fromUID).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    }).then(() => {
      inboxRef.delete();
      alert("✅ Joined the group!");

      joinRoom(fromUID); // ✅ Optional: enter group chat
      loadChatList?.();
    }).catch(err => {
      console.error("❌ Group join failed:", err.message || err);
      alert("❌ Failed to join group.");
    });
  }
}


// ===== Decline Inbox Item =====
function declineInbox(id) {
  if (!currentUser || !id) return;

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(id).delete()
    .then(() => {
      alert("❌ Request declined.");
    })
    .catch(err => {
      console.error("❌ Decline failed:", err.message);
      alert("❌ Failed to decline request.");
    });
}

// ===== Mark All as Read =====
function markAllRead() {
  if (!currentUser) return;

  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items");

  inboxRef.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => {
      const ref = inboxRef.doc(doc.id);
      batch.update(ref, { read: true });
    });
    return batch.commit();
  }).then(() => {
    alert("📬 All inbox items marked as read.");
  }).catch(err => {
    console.error("❌ Failed to mark all read:", err.message);
    alert("❌ Could not mark all as read.");
  });
}

function renderInboxCard(data) {
  return `
    <div class="inbox-card">
      <img src="${data.photo || 'default-avatar.png'}" />
      <div style="flex:1;">
        <strong>${data.name || "Unknown"}</strong><br/>
        <small>${data.message || "Notification"}</small>
      </div>
      <div class="btn-group">
        <button onclick="acceptInbox('${data.id}')">✔</button>
        <button onclick="declineInbox('${data.id}')">✖</button>
      </div>
    </div>
  `;
}

// ===== Friend List =====
function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container || !currentUser) return;

  container.innerHTML = "Loading...";

  db.collection("users").doc(currentUser.uid).collection("friends")
    .onSnapshot(async snapshot => {
      if (snapshot.empty) {
        container.innerHTML = `<div class="no-results">You have no friends yet.</div>`;
        return;
      }

      container.innerHTML = "";

      for (const doc of snapshot.docs) {
        const friendId = doc.id;

        try {
          const friendDoc = await db.collection("users").doc(friendId).get();
          if (!friendDoc.exists) continue;

          const user = friendDoc.data();
          const avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
          const isOnline = user.status === "online"; // Optional: status check

          const card = document.createElement("div");
          card.className = "friend-card";

          card.innerHTML = `
            <img src="${avatar}" alt="Avatar" />
            <div class="friend-info">
              <div class="name">${escapeHtml(user.username || "User")}</div>
              <div class="bio">${escapeHtml(user.bio || "")}</div>
            </div>
            <div class="status-dot ${isOnline ? "online" : ""}"></div>
            <button class="chat-start-btn" onclick="event.stopPropagation(); openThread('${friendId}', '${escapeHtml(user.username || "User")}')">💬 Chat</button>
          `;

          card.onclick = () => viewUserProfile(friendId); // Tap card = view profile
          container.appendChild(card);
        } catch (err) {
          console.warn("❌ Friend load error:", err.message || err);
        }
      }
    });
}

function removeFriend(uid) {
  if (!currentUser || !uid) return;

  if (confirm("❌ Remove this friend?")) {
    db.collection("users").doc(currentUser.uid).collection("friends").doc(uid).delete()
      .then(() => alert("✅ Friend removed"))
      .catch(err => alert("❌ Failed: " + err.message));
  }
}

// ==== Add Friend Shortcut ====
function addFriend(uid) {
  if (!uid || !currentUser) return;

  if (uid === currentUser.uid) {
    alert("❌ You can't add yourself.");
    return;
  }

  const friendRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(uid);

  friendRef.get().then(doc => {
    if (doc.exists) {
      alert("✅ Already friends!");
      return;
    }

    // Check if request already sent
    db.collection("inbox").doc(uid).collection("items")
      .where("type", "==", "friend")
      .where("from.uid", "==", currentUser.uid)
      .limit(1)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          alert("📨 Friend request already sent!");
          return;
        }

        // ✅ Send friend request
        db.collection("inbox").doc(uid).collection("items").add({
          type: "friend",
          from: {
            uid: currentUser.uid,
            name: currentUser.displayName || currentUser.email || "User"
          },
          read: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          alert("✅ Friend request sent!");
        }).catch(err => {
          console.error("❌ Inbox write error:", err);
          alert("❌ Could not send friend request (inbox write failed)");
        });
      }).catch(err => {
        console.error("❌ Inbox check error:", err);
        alert("❌ Could not verify existing request");
      });

  }).catch(err => {
    console.error("❌ Friend check error:", err);
    alert("❌ Could not verify friend status");
  });
}

// ===== Group Info Loader =====
function loadGroupInfo(groupId) {
  if (!groupId) return;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("groupOwner").textContent = "Owner: " + (data.createdBy || "Unknown");
    document.getElementById("groupAdmins").textContent = "Admins: " + (data.admins || []).join(", ");

    const memberList = document.getElementById("groupMembers");
    memberList.innerHTML = "";

    (data.members || []).forEach(uid => {
      db.collection("users").doc(uid).get().then(userDoc => {
        const user = userDoc.data();
        const div = document.createElement("div");
        div.className = "member-entry";
        div.textContent = user?.username || uid;
        memberList.appendChild(div);
      });
    });
  });
}

// ===== DM Utilities =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

// ===== DM: Open Thread Chat =====
function openThread(uid, name) {
  if (!currentUser || !uid) return;

  db.collection("users").doc(currentUser.uid).collection("friends").doc(uid)
    .get()
    .then(friendDoc => {
      if (!friendDoc.exists) {
        alert("🔒 You must be friends to start a chat.");
        return;
      }

      switchTab("threadView");

      // UI Setup
      document.getElementById("threadWithName").textContent = name || "Chat";
      document.getElementById("chatOptionsMenu").style.display = "none";

      const dropdown = document.getElementById("roomDropdown");
      if (dropdown) dropdown.style.display = "none";

      const groupInfo = document.querySelector(".group-info");
      if (groupInfo) groupInfo.style.display = "none";

      const groupButton = document.getElementById("groupInfoButton");
      if (groupButton) groupButton.style.display = "none";

      currentThreadUser = uid;
      currentRoom = null;

      const threadIdStr = threadId(currentUser.uid, uid);
      const area = document.getElementById("threadMessages");
      if (area) area.innerHTML = "";

      if (unsubscribeThread) unsubscribeThread();
      if (unsubscribeTyping) unsubscribeTyping();

      // Typing listener
      listenToTyping(threadIdStr, "thread");

      // Mark messages as read
      db.collection("threads").doc(threadIdStr).set({
        unread: { [currentUser.uid]: 0 }
      }, { merge: true });

      // Status updates
      db.collection("users").doc(uid).onSnapshot(doc => {
        const data = doc.data();
        const status = document.getElementById("chatStatus");

        if (data.typingFor === currentUser.uid) {
          status.textContent = "Typing...";
        } else if (data.status === "online") {
          status.textContent = "Online";
        } else if (data.lastSeen?.toDate) {
          status.textContent = "Last seen " + timeSince(data.lastSeen.toDate());
        } else {
          status.textContent = "Offline";
        }
      });

      // Load messages
      unsubscribeThread = db.collection("threads")
        .doc(threadIdStr)
        .collection("messages")
        .orderBy("timestamp")
        .onSnapshot(async snapshot => {
          if (!area) return;
          area.innerHTML = "";

          for (const doc of snapshot.docs) {
            const msg = doc.data();
            if (!msg?.text) continue;

            // Decrypt
            let decrypted = "";
            try {
              decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
              if (!decrypted) decrypted = "[Encrypted]";
            } catch (e) {
              decrypted = "[Failed to decrypt]";
            }

            // Mark as seen
            if (!msg.seenBy?.includes(currentUser.uid)) {
              db.collection("threads").doc(threadIdStr)
                .collection("messages").doc(doc.id)
                .update({
                  seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
                }).catch(console.warn);
            }

            // Avatar
            let avatar = "default-avatar.png";
            try {
              const userDoc = await db.collection("users").doc(msg.from).get();
              if (userDoc.exists) {
                const user = userDoc.data();
                avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
              }
            } catch (e) {
              console.warn("⚠️ Avatar fetch failed:", e.message);
            }

            const isSelf = msg.from === currentUser.uid;
            const isRead = msg.seenBy?.includes(currentThreadUser);
            const isDelivered = msg.seenBy?.length > 1;

            const ticks = isSelf
              ? `<span class="msg-ticks">${isRead ? '✔️✔️' : isDelivered ? '✔️✔️' : '✔️'}</span>`
              : '';

            const bubble = document.createElement("div");
            bubble.className = "message-bubble " + (isSelf ? "right" : "left");
            bubble.innerHTML = `
              <div class="msg-content">
                <div class="msg-text">
                  <strong>${escapeHtml(msg.fromName || "User")}</strong><br>
                  ${escapeHtml(decrypted)}
                </div>
                <div class="message-time">
                  ${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}
                  ${ticks}
                </div>
              </div>
            `;

            const wrapper = document.createElement("div");
            wrapper.className = "message-bubble-wrapper " + (isSelf ? "right" : "left");

            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar-img";

            wrapper.appendChild(avatarImg);
            wrapper.appendChild(bubble);
            area.appendChild(wrapper);
          }

          // Scroll to bottom after render
          setTimeout(() => {
  area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
}, 100);

          renderWithMagnetSupport?.("threadMessages");
        }, err => {
          console.error("❌ Thread snapshot error:", err.message || err);
          alert("❌ Failed to load messages: " + (err.message || err));
        });

      // Optional: do NOT auto-focus keyboard on desktop
      if (window.innerWidth < 768) {
        setTimeout(() => {
          document.getElementById("threadInput")?.focus();
        }, 300);
      }
    })
    .catch(err => {
      console.error("❌ Friend check failed:", err.message || err);
      alert("❌ Failed to verify friendship.");
    });
}
      
function deleteThread() {
  showModal("Delete this chat?", () => {
    const docId = threadId(currentUser.uid, currentThreadUser);
    const ref = db.collection("threads").doc(docId).collection("messages");

    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("✅ Chat deleted");
    });
  });
}

function renderChatCard(chat) {
  return `
    <div class="chat-card" onclick="openThread('${chat.uid}', '${chat.name}')">
      <img src="${chat.photo || 'default-avatar.png'}" class="friend-avatar" />
      <div class="details">
        <div class="name">${chat.name}</div>
        <div class="last-message">${chat.lastMessage || "No messages yet"}</div>
      </div>
      <div class="meta">${chat.timestamp || ""}</div>
    </div>
  `;
}

// ===== DM: Send Thread Message with AES Encryption =====
function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const nameEl = document.getElementById("usernameDisplay");
  const fromName = nameEl ? nameEl.textContent : "User";

  const threadNameEl = document.getElementById("threadWithName");
  const toName = threadNameEl ? threadNameEl.textContent : "Friend";

  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const docId = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(docId);

  const message = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid]  // ✅ Mark as seen by sender
  };

  threadRef.collection("messages").add(message).then(() => {
    input.value = "";

    threadRef.set({
      participants: [currentUser.uid, currentThreadUser],
      names: {
        [currentUser.uid]: fromName,
        [currentThreadUser]: toName
      },
      lastMessage: text,
      unread: {
        [currentUser.uid]: 0,
        [currentThreadUser]: firebase.firestore.FieldValue.increment(1)
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }).catch(err => {
    console.error("❌ Send failed:", err.message || err);
    alert("❌ Failed to send message.");
  });
}

function renderMessage(msg, isOwn) {
  return `
    <div class="message-bubble ${isOwn ? 'right' : 'left'}">
      ${msg.text}
    </div>
  `;
}

function handleThreadKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendThreadMessage();
  }
}

function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom) return;

  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (msg.senderId === currentUser.uid ? "right" : "left");

        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${msg.senderName || "Unknown"}</strong>`;
        bubble.appendChild(sender);

        const textDiv = document.createElement("div");
        textDiv.innerHTML = decrypted;
        bubble.appendChild(textDiv);

        messagesDiv.appendChild(bubble);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      renderWithMagnetSupport("groupMessages");
    });
}


// ===== Search (Users + Groups) =====
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function runSearch() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!term || !currentUser) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  userResults.innerHTML = "";
  groupResults.innerHTML = "";

  // 🔍 USER SEARCH
  db.collection("users")
    .where("username", ">=", term)
    .where("username", "<=", term + "\uf8ff")
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        userResults.innerHTML = `<div class="no-results">No users found.</div>`;
        return;
      }

      snapshot.forEach(async doc => {
        if (doc.id === currentUser.uid) return; // skip self

        const user = doc.data();
        const avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

        const card = document.createElement("div");
        card.className = "search-result";
        card.innerHTML = `
          <img src="${avatar}" class="search-avatar" />
          <div class="search-info">
            <div class="username">@${escapeHtml(user.username)}</div>
            <div class="bio">${escapeHtml(user.bio || "No bio")}</div>
          </div>
          <button id="friendBtn_${doc.id}" onclick="addFriend('${doc.id}')">Add Friend</button>
        `;
        userResults.appendChild(card);

        // ✅ Mark as Friend if exists
        const friendDoc = await db.collection("users").doc(currentUser.uid).collection("friends").doc(doc.id).get();
        if (friendDoc.exists) {
          const btn = card.querySelector("button");
          btn.textContent = "Friend";
          btn.disabled = true;
          btn.classList.add("disabled-btn");
        }
      });
    });

  // 🔍 GROUP SEARCH
  db.collection("groups")
    .where("name", ">=", term)
    .where("name", "<=", term + "\uf8ff")
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        groupResults.innerHTML = `<div class="no-results">No groups found.</div>`;
        return;
      }

      snapshot.forEach(doc => {
        const group = doc.data();
        const icon = group.icon || "group-icon.png";
        const members = group.members || [];
        const joined = members.includes(currentUser.uid);

        const card = document.createElement("div");
        card.className = "search-result";
        card.innerHTML = `
          <img src="${icon}" class="search-avatar" />
          <div class="search-info">
            <div class="username">#${escapeHtml(group.name)}</div>
            <div class="bio">${escapeHtml(group.description || "No description.")}</div>
          </div>
          <button ${joined ? "disabled" : `onclick="joinGroupById('${doc.id}')"`}>
            ${joined ? "Joined" : "Join"}
          </button>
        `;
        groupResults.appendChild(card);
      });
    });
}

function renderUserSearchResult(user) {
  return `
    <div class="search-result">
      <img class="search-avatar" src="${user.photo || 'default-avatar.png'}" />
      <div class="search-info">
        <div class="username">@${user.username}</div>
        <div class="bio">${user.bio || "No bio"}</div>
      </div>
      <button onclick="addFriend('${user.uid}')">Add</button>
    </div>
  `;
}

// ==== For Group Setting ====
function viewGroupMembers() {
  switchTab("profileTab"); // Reuse profile tab to show group info for now
  alert("👥 Group members shown here (UI upgrade coming)");
}

function inviteByLink() {
  if (!currentRoom) return alert("❌ No group selected.");
  const link = `${window.location.origin}?join=${currentRoom}`;
  copyToClipboard(link);
  alert("🔗 Invite link copied:\n" + link);
}

function blockUser() {
  showModal("Block this user?", () => {
    alert("🚫 User blocked (placeholder)");
  });
}

function viewMedia() {
  if (!currentRoom && !currentThreadUser) {
    alert("❌ No chat selected");
    return;
  }

  const container = document.createElement("div");
  container.style.padding = "20px";

  const messagesRef = currentRoom
    ? db.collection("groups").doc(currentRoom).collection("messages")
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");

  messagesRef
    .where("fileURL", "!=", null)
    .orderBy("fileURL") // ✅ Required first
    .orderBy("timestamp", "desc") // ✅ Then timestamp
    .limit(20)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        alert("📎 No media found");
        return;
      }

      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.style.marginBottom = "12px";
        div.innerHTML = `
          <p>${escapeHtml(msg.fromName || "User")} - ${msg.timestamp?.toDate?.().toLocaleString?.() || ""}</p>
          <a href="${msg.fileURL}" target="_blank">${msg.fileName || "Download File"}</a>
        `;
        container.appendChild(div);
      });

      showModal("📎 Shared Media", container.innerHTML);
    }).catch(err => {
      console.error("❌ Media fetch failed:", err.message || err);
      alert("❌ Failed to load media.");
    });
}

function leaveGroup() {
  if (!currentRoom) return;
  const ref = db.collection("groups").doc(currentRoom);
  ref.update({
    members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
  }).then(() => {
    alert("🚪 You left the group.");
    currentRoom = null;
    loadChatList();
    switchTab("chatTab");
  });
}

// ===== Search Tab Switcher =====
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

// ===== Join Group by ID (Used in search results) =====
function joinGroupById(groupId) {
  if (!currentUser || !groupId) return alert("⚠️ Invalid group or user.");

  db.collection("groups").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  })
  .then(() => {
    alert("✅ Joined group!");
    loadChatList?.(); // refresh chats
    loadGroups?.();   // refresh group dropdown
  })
  .catch(err => {
    console.error("❌ Failed to join group:", err.message || err);
    alert("❌ Group not found or join failed.");
  });
}

let unsubscribeRoomMessages = null;

function joinRoom(groupId) {
  if (!groupId || !currentUser) return;

  currentRoom = groupId;
  currentThreadUser = null;

  switchTab("roomView");

  const title = document.getElementById("roomTitle");
  const messageList = document.getElementById("roomMessages");
  const typingStatus = document.getElementById("groupTypingStatus");

  title.textContent = "Loading...";
  messageList.innerHTML = "";
  typingStatus.textContent = "";

  // ⏳ Load group metadata
  db.collection("groups").doc(groupId).get().then(doc => {
    if (doc.exists) {
      const group = doc.data();
      title.textContent = group.name || "Group Chat";
    } else {
      title.textContent = "Group (Not Found)";
    }
  });

  // ❌ Unsubscribe from previous listeners
  if (unsubscribeRoomMessages) unsubscribeRoomMessages();
  if (unsubscribeTyping) unsubscribeTyping();

  // ✅ Start typing listener for this group
  listenToTyping(groupId, "group");

  // 💬 Load group messages
  unsubscribeRoomMessages = db.collection("threads")
    .doc(groupId)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(async snapshot => {
      messageList.innerHTML = "";

      for (const doc of snapshot.docs) {
        const msg = doc.data();
        const isSelf = msg.from === currentUser.uid;
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (isSelf ? "right" : "left");

        let avatar = "default-avatar.png";

        try {
          const senderDoc = await db.collection("users").doc(msg.from).get();
          if (senderDoc.exists) {
            const user = senderDoc.data();
            avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
          }
        } catch (e) {
          console.warn("⚠️ Failed to fetch group sender avatar:", e.message);
        }

        const decrypted = (() => {
          try {
            return CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
          } catch {
            return "[Failed to decrypt]";
          }
        })();

        bubble.innerHTML = `
          <div class="msg-avatar">
            <img src="${avatar}" />
          </div>
          <div class="msg-content">
            <div class="msg-text">
              <strong>${escapeHtml(msg.fromName || "User")}</strong><br>
              ${escapeHtml(decrypted)}
            </div>
            <div class="message-time">${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}</div>
          </div>
        `;
        messageList.appendChild(bubble);
      }

      messageList.scrollTop = messageList.scrollHeight;
      renderWithMagnetSupport?.("roomMessages");
    }, err => {
      console.error("❌ Room message error:", err.message || err);
      alert("❌ Failed to load group chat: " + (err.message || err));
    });
}

// ===== Message User Shortcut =====
function messageUser(uid, username) {
  if (!uid || !currentUser) return;

  db.collection("users").doc(currentUser.uid).collection("friends").doc(uid)
    .get()
    .then(doc => {
      if (doc.exists) {
        openThread(uid, username || "Friend");
        document.getElementById("userFullProfile").style.display = "none";
        document.getElementById("viewProfileModal").style.display = "none";
      } else {
        alert("⚠️ You are not friends with this user. Send a request first.");
      }
    });
}

// ===== Upload File (DM or Group) =====
function triggerFileInput(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  input.click();
}

function uploadFile(type) {
  const input = type === "thread" ? document.getElementById("threadFile") : document.getElementById("groupFile");
  const file = input.files[0];
  if (!file || !currentUser) return;

  const ref = storage.ref(`${type}_uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
  showLoading(true);

  ref.put(file).then(snap => snap.ref.getDownloadURL()).then(url => {
    const msg = `📎 File: <a href="${url}" target="_blank">${file.name}</a>`;
    if (type === "thread") {
      document.getElementById("threadInput").value = msg;
      sendThreadMessage();
    } else {
      document.getElementById("groupMessageInput").value = msg;
      sendGroupMessage();
    }
  }).catch(err => {
    alert("Upload failed");
    console.error(err);
  }).finally(() => showLoading(false));
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied to clipboard");
    showToast("🔗 Invite link copied!");
  }).catch((err) => {
    console.error("Clipboard error:", err);
    alert("❌ Failed to copy");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Setup modal
  const modal = document.getElementById("customModal");
  const modalNo = document.getElementById("modalNo");
  const modalYes = document.getElementById("modalYes");
  const modalMessage = document.getElementById("modalMessage");

  if (modal && modalNo) {
    modalNo.onclick = () => {
      modal.style.display = "none";
    };
  }
}
                          
document.addEventListener("DOMContentLoaded", () => {
  // Set height on load
  const threadView = document.getElementById("threadView");
  if (threadView) {
    threadView.style.height = window.innerHeight + "px";
  }

  // Fix on focus
  const input = document.getElementById("threadInput");
  if (input) {
    input.addEventListener("focus", () => {
      const area = document.getElementById("threadMessages");
      setTimeout(() => {
        area?.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
      }, 300);
    });
  }
});

// Resize (keyboard open/close or rotate)
window.addEventListener("resize", () => {
  const threadView = document.getElementById("threadView");
  if (threadView) {
    threadView.style.height = window.innerHeight + "px";
  }

  const input = document.getElementById("threadInput");
  const area = document.getElementById("threadMessages");
  if (document.activeElement === input && area) {
    setTimeout(() => {
      area.scrollTop = area.scrollHeight;
    }, 300);
  }
});

// ===== Export Chat (Stub) =====
function exportChat() {
  alert("Export coming soon!");
}

// ===== WebTorrent (P2P File Share) =====

function startTorrentClient() {
  if (!client) client = new WebTorrent();
}

// Send file to friend using magnet
function sendTorrentFile(file) {
  startTorrentClient();

  client.seed(file, torrent => {
    const magnet = torrent.magnetURI;
    document.getElementById("threadInput").value = `📎 Torrent: <a href="${magnet}" target="_blank">Download</a>`;
    sendThreadMessage();
  });
}


// Automatically parse incoming magnet links
function detectMagnetAndRender(text) {
  if (text.includes("magnet:?")) {
    const match = text.match(/magnet:\?[^"]+/);
    if (match) handleMagnetDownload(match[0]);
  }
}

function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  const torrent = client.add(magnetURI);

  torrent.on('ready', () => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error("Download error:", err);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      });
    });
  });

  torrent.on('error', err => console.error("Torrent error:", err));
}

// ===== Close Profile Modal =====
function closeProfileModal() {
  document.getElementById("viewProfileModal").style.display = "none";
}

// ===== Toggle Dark Theme Persistently =====
function toggleTheme() {
  const isDark = document.getElementById("darkModeToggle").checked;
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// ===== Restore Theme on Load =====
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = true;
}

// ===== Inbox Filter/Search (optional) =====
function filterInbox(term) {
  const items = document.querySelectorAll("#inboxList .inbox-card");
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(term.toLowerCase()) ? "block" : "none";
  });
}

// ===== Toggle Room Dropdown to Chat =====
function selectGroupFromDropdown() {
  const dropdown = document.getElementById("roomDropdown");
  const groupId = dropdown.value;
  if (groupId) {
    joinRoom(groupId);
    switchTab("chatTab");
  }
}

// ===== Show Room ID (for invite manually) =====
function showRoomId() {
  if (!currentRoom) return;
  alert("Group ID:\n" + currentRoom);
}

// ===== Developer Badge & Trust Tagging =====
function applyDeveloperBadge(uid, usernameElement) {
  if (uid === "moneythepro") {
    const badge = document.createElement("span");
    badge.textContent = "🛠️ Developer";
    badge.className = "badge developer";
    usernameElement.appendChild(badge);
  }
}

// Called after search renders
function decorateUsernamesWithBadges() {
  const usernames = document.querySelectorAll(".search-username");
  usernames.forEach(el => {
    const username = el.textContent.replace("@", "").trim();
    if (username === "moneythepro") {
      const badge = document.createElement("span");
      badge.textContent = " 🛠️";
      badge.style.color = "#f39c12";
      el.appendChild(badge);
    }
  });
}

// ===== Group Ownership Transfer =====
function transferGroupOwnership(newOwnerId) {
  if (!currentRoom || !newOwnerId) return;
  db.collection("groups").doc(currentRoom).update({
    createdBy: newOwnerId,
    admins: firebase.firestore.FieldValue.arrayUnion(newOwnerId)
  }).then(() => {
    alert("Ownership transferred.");
    loadGroupInfo(currentRoom);
  });
}

// ===== Delete Group (Owner Only) =====
function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  db.collection("groups").doc(groupId).delete().then(() => {
    alert("Group deleted.");
    loadChatList();
  });
}

// ===== Report DM User (stub only) =====
function reportUser(uid) {
  showModal("Report this user?", () => {
    alert("Thank you for reporting. Our team will review.");
  });
}

// ===== Clear All Chat (DM only) =====
function clearThreadMessages() {
  const ref = db.collection("threads")
    .doc(threadId(currentUser.uid, currentThreadUser))
    .collection("messages");

  showModal("Clear all messages?", () => {
    ref.get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
      alert("Messages cleared.");
    });
  });
}

// ===== Chat Scroll to Bottom Button =====
function scrollToBottom(divId) {
  const div = document.getElementById(divId);
  if (div) div.scrollTop = div.scrollHeight;
}

// ===== Emoji Picker (basic integration) =====
function insertEmoji(targetId, emoji) {
  const input = document.getElementById(targetId);
  if (input) input.value += emoji;
}

// ===== Copy Room ID =====
function copyRoomId() {
  if (!currentRoom) return;
  copyToClipboard(currentRoom);
  alert("Group ID copied!");
}

// === Invite user to group ===
function inviteToGroup(uid) {
  if (!currentGroupProfileId) return alert("❌ No group selected.");
  db.collection("inbox").doc(uid).collection("items").add({
    type: "group",
    from: currentGroupProfileId,
    fromName: "Group Invite",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  }).then(() => {
    alert("✅ Group invite sent!");
  }).catch(err => {
    console.error("❌ Failed to send invite:", err.message);
    alert("❌ Could not send invite.");
  });
}

// ===== Helper to Show Toast (if not modal) =====
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function uploadFile(context) {
  const fileInput = context === "thread" ? document.getElementById("threadFile") : document.getElementById("roomFile");
  const file = fileInput.files[0];
  if (!file) return;
  sendFileMessage(file, context);
}

// ====== WebTorrent (P2P File Share) ======

// ✅ Only friends or group members can share
function isFriend(uid) {
  return db.collection("users").doc(currentUser.uid)
    .collection("friends").doc(uid).get().then(doc => doc.exists);
}

function shareFileViaTorrent(type) {
  if (!client) client = new WebTorrent();  // ✅ Lazy init

  const input = document.createElement("input");
  input.type = "file";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    client.seed(file, torrent => {
      const magnet = torrent.magnetURI;
      const msg = `📎 File: <a href="${magnet}" target="_blank">${file.name}</a>`;

      if (type === "dm" && currentThreadUser) {
        isFriend(currentThreadUser).then(ok => {
          if (!ok) return alert("❌ Only friends can share P2P files.");
          document.getElementById("threadInput").value = msg;
          sendThreadMessage();
        });
      } else if (type === "group" && currentRoom) {
        document.getElementById("groupMessageInput").value = msg;
        sendGroupMessage();
      } else {
        alert("⚠️ Sharing not allowed in this context.");
      }
    });
  };
  input.click();
}

// ✅ Auto download magnet link with confirmation
function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  const torrent = client.add(magnetURI);

  torrent.on('ready', () => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error("Download error:", err);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      });
    });
  });

  torrent.on('error', err => console.error("Torrent error:", err));
}

// ✅ Scan chat for magnet links and bind download
function renderWithMagnetSupport(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const links = container.querySelectorAll("a[href^='magnet:']");
  links.forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      const confirmed = confirm(`Download file: ${link.textContent}?`);
      if (confirmed) autoDownloadMagnet(link.href);
    };
  });
}
