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
let lastThreadId = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;
let unsubscribeInbox = null;
let unsubscribeTyping = null;
let unsubscribeThreads = null;
let unsubscribeGroups = null;

// ===== Loading Overlay =====
function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loadingOverlay");
  const text = document.getElementById("loadingText");
  if (overlay) overlay.style.display = "flex";
  if (text) text.textContent = message;
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");

  const selected = document.getElementById(tabId);
  if (selected) selected.style.display = "block";

  // ✅ Hide 3-dot chat options menu
  const menu = document.getElementById("chatOptionsMenu");
  if (menu) menu.classList.remove("show");

  // ✅ Optionally hide keyboard on mobile
  document.activeElement?.blur?.();
}

// ===== Login/Register =====
function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  showLoading("Logging in...");

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      console.log("✅ Logged in");
    })
    .catch(err => {
      console.error("❌ Login failed:", err.message);
      alert("❌ Login failed: " + err.message);
    })
    .finally(hideLoading);
}

function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  showLoading("Creating account...");

  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      console.log("✅ Registered");
      switchTab("usernameDialog");
      setTimeout(() => document.getElementById("newUsername")?.focus(), 100);
    })
    .catch(err => {
      console.error("❌ Registration failed:", err.message);
      alert("❌ Registration failed: " + err.message);
    })
    .finally(hideLoading);
}

function saveUsername() {
  const username = document.getElementById("newUsername")?.value.trim();

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  showLoading("Saving username...");

  db.collection("users").doc(currentUser.uid).set({
    username,
    email: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
    .then(() => {
      document.getElementById("usernameDisplay").textContent = username;
      loadMainUI();
    })
    .catch(err => {
      console.error("❌ Username save error:", err.message);
      alert("❌ Failed to save username");
    })
    .finally(hideLoading);
}

function checkUsername() {
  showLoading("Checking profile...");

  db.collection("users").doc(currentUser.uid).get()
    .then(doc => {
      const data = doc.data();
      if (!doc.exists || !data?.username) {
        switchTab("usernameDialog");
      } else {
        document.getElementById("usernameDisplay").textContent = data.username;
        loadMainUI();
      }
    })
    .catch(err => {
      console.error("❌ Username check failed:", err.message);
      alert("❌ Failed to load user profile.");
    })
    .finally(hideLoading);
}

// ===== Main App Load UI =====
function loadMainUI() {
  showLoading("Loading your dashboard...");

  const appPage = document.getElementById("appPage");
  if (appPage) appPage.style.display = "block";

  loadProfile(() => {
    try { loadChatList(); } catch (e) { console.warn("⚠️ Chats failed", e); }
    try { loadFriends(); } catch (e) { console.warn("⚠️ Friends failed", e); }
    try { loadGroups?.(); } catch (e) { console.warn("⚠️ Groups skipped", e); }
    try { listenInbox(); } catch (e) { console.warn("⚠️ Inbox failed", e); }

    switchTab("chatTab");

    setTimeout(hideLoading, 300);
  });
}

auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    hideLoading();
    return;
  }

  currentUser = user;
  const userRef = db.collection("users").doc(user.uid);

  try {
    // ✅ Mark user as online
    await userRef.update({
      status: "online",
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });

    // ✅ Update last seen on tab close
    window.addEventListener("beforeunload", () => {
      try {
        userRef.update({
          status: "offline",
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.warn("⚠️ Unload update failed");
      }
    });

    // ✅ Get user document
    const doc = await userRef.get();
    const data = doc.data();

    if (!data?.username) {
      switchTab("usernameDialog");
      hideLoading();
      return;
    }

    document.getElementById("usernameDisplay").textContent = data.username;

    // ✅ Avatar edit trigger
    const label = document.querySelector(".profile-edit-label");
    if (label) label.onclick = () => document.getElementById("profilePic")?.click();

    loadMainUI();

    // ✅ Handle group invite via joinGroupId (optional)
    if (joinGroupId) {
      try {
        await tryJoinGroup(joinGroupId);
      } catch (e) {
        console.warn("⚠️ Auto group join failed:", e);
      }
    }

    switchTab("chatTab");

  } catch (err) {
    console.error("❌ Failed to load user:", err.message);
    alert("❌ Could not load user info: " + (err.message || "Unknown error"));
  } finally {
    hideLoading();
  }
});

// ===== Save Profile Data =====
function saveProfile() {
  if (!currentUser) return alert("❌ Not logged in.");

  const file = document.getElementById("profilePic")?.files?.[0];
  const updates = {
    name: document.getElementById("profileName").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    gender: document.getElementById("profileGender").value,
    phone: document.getElementById("profilePhone").value.trim(),
    publicEmail: document.getElementById("profileEmail").value.trim(),
    username: document.getElementById("profileUsername").value.trim()
  };

  const userRef = db.collection("users").doc(currentUser.uid);

  const updateFirestore = (extra = {}) => {
    userRef.update({ ...updates, ...extra })
      .then(() => {
        if (extra.avatarBase64) {
          document.getElementById("profilePicPreview").src = extra.avatarBase64;
        }
        document.getElementById("usernameDisplay").textContent = updates.username;
        alert("✅ Profile updated.");
      })
      .catch(err => {
        console.error("❌ Profile save error:", err.message || err);
        alert("❌ Failed to save profile.");
      });
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      updateFirestore({ avatarBase64: e.target.result });
    };
    reader.readAsDataURL(file);
  } else {
    updateFirestore();
  }
}

function loadProfile(callback) {
  if (!currentUser?.uid) {
    console.warn("🔒 No authenticated user to load profile.");
    callback?.();
    return;
  }

  const userRef = db.collection("users").doc(currentUser.uid);

  userRef.onSnapshot(doc => {
    if (!doc.exists) {
      console.warn("⚠️ Profile not found.");
      callback?.();
      return;
    }

    const data = doc.data() || {};

    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.publicEmail || data.email || "";
    document.getElementById("profileUsername").value = data.username || "";

    const preview = document.getElementById("profilePicPreview");
    preview.src = data.avatarBase64
      || data.photoURL
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || "User")}&background=random`;

    callback?.();
  }, err => {
    console.error("❌ Profile load error:", err.message || err);
    callback?.();
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
  alert("Contact us at: moneythepro7@gmail.com");
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
  currentUser = null;
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
      list.innerHTML = ""; // ✅ Clear previous content

      if (snapshot.empty) {
        list.innerHTML = `<div class="no-results">No group chats found.</div>`;
        return;
      }

      snapshot.forEach(doc => {
        const group = doc.data();
        const icon = group.icon || "group-icon.png";
        const name = group.name || "Group";
        const unread = group.unread?.[currentUser.uid] || 0;

        let lastMsg = "[No messages]";
        if (typeof group.lastMessage === "string") {
          lastMsg = group.lastMessage;
        } else if (typeof group.lastMessage === "object") {
          lastMsg = group.lastMessage?.text || "[No messages]";
        }

        const updatedTime = group.updatedAt?.toDate?.()
          ? timeSince(group.updatedAt.toDate())
          : "";

        const card = document.createElement("div");
        card.className = "chat-card group-chat";
        card.onclick = () => openGroupChat(doc.id); // ✅ Use actual handler

        card.innerHTML = `
          <img class="group-avatar" src="${icon}" />
          <div class="details">
            <div class="name-row">
              <span class="name">#${escapeHtml(name)}</span>
              <span class="time">${updatedTime}</span>
            </div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;

        list.appendChild(card);
      });
    }, err => {
      console.error("❌ Group snapshot error:", err.message || err);
      list.innerHTML = `<div class="no-results">Failed to load group chats.</div>`;
    });
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
      list.innerHTML = ""; // ✅ Clear previous content

      if (snapshot.empty) {
        list.innerHTML = `<div class="no-results">No personal chats found.</div>`;
        return;
      }

      const userCache = {};

      // Process all threads in parallel (faster)
      const promises = snapshot.docs.map(async doc => {
        const thread = doc.data();
        const otherUid = thread.participants.find(uid => uid !== currentUser.uid);
        if (!otherUid) return null;

        // 🧠 Use cache if already fetched
        let user = userCache[otherUid];
        if (!user) {
          try {
            const userDoc = await db.collection("users").doc(otherUid).get();
            if (!userDoc.exists) return null;
            user = userDoc.data();
            userCache[otherUid] = user;
          } catch {
            return null;
          }
        }

        const avatar = user.avatarBase64 || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
        const name = user.username || "Friend";

        let lastMsg = "[No messages]";
        if (typeof thread.lastMessage === "string") {
          lastMsg = thread.lastMessage;
        } else if (typeof thread.lastMessage === "object") {
          lastMsg = thread.lastMessage?.text || "[No messages]";
        }

        const updatedTime = thread.updatedAt?.toDate?.()
          ? timeSince(thread.updatedAt.toDate())
          : "";

        const unread = thread.unread?.[currentUser.uid] || 0;

        const card = document.createElement("div");
        card.className = "chat-card personal-chat";
        card.onclick = () => openThread(otherUid, name);
        card.innerHTML = `
          <img class="friend-avatar" src="${avatar}" />
          <div class="details">
            <div class="name-row">
              <span class="name">${escapeHtml(name)}</span>
              <span class="time">${updatedTime}</span>
            </div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;

        return card;
      });

      // Wait for all cards to build, then render
      const cards = await Promise.all(promises);
      cards.filter(Boolean).forEach(card => list.appendChild(card));
    }, err => {
      console.error("❌ Thread snapshot error:", err.message || err);
      list.innerHTML = `<div class="no-results">Failed to load personal chats.</div>`;
    });
}

// ===== Chat Filter (Local search) =====
function searchChats(term) {
  const normalized = term.trim().toLowerCase();
  const chats = document.querySelectorAll(".chat-card");

  let anyVisible = false;

  chats.forEach(chat => {
    const name = chat.querySelector(".name")?.textContent?.toLowerCase() || "";
    const lastMsg = chat.querySelector(".last-message")?.textContent?.toLowerCase() || "";

    const match = name.includes(normalized) || lastMsg.includes(normalized);
    chat.style.display = match ? "flex" : "none";
    if (match) anyVisible = true;
  });

  const list = document.getElementById("chatList");
  const noResult = document.getElementById("noResultsMsg");

  if (!anyVisible) {
    if (!noResult) {
      const msg = document.createElement("div");
      msg.id = "noResultsMsg";
      msg.className = "no-results";
      msg.textContent = "No chats match your search.";
      list.appendChild(msg);
    }
  } else {
    if (noResult) noResult.remove();
  }
}

// ===== Load Messages in Group =====
function loadGroupMessages(groupId) {
  const box = document.getElementById("groupMessages");
  if (!groupId || !currentUser || !box) return;

  box.innerHTML = "";

  db.collection("groups").doc(groupId).collection("messages")
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {
      box.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const isSelf = msg.senderId === currentUser.uid;
        const msgText = msg.text || "";
        let decrypted = "";

        try {
          if (typeof msgText === "string") {
            decrypted = CryptoJS.AES.decrypt(msgText, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
          } else {
            decrypted = "[Invalid]";
          }
        } catch {
          decrypted = "[Decryption error]";
        }

        // Skip if deleted for this user
        if (msg.deletedFor?.[currentUser.uid]) return;

        const bubble = document.createElement("div");
        bubble.className = `message-bubble ${isSelf ? "right" : "left"}`;

        // ✅ Support reply
        if (msg.replyTo?.text) {
          const reply = document.createElement("div");
          reply.className = "reply-preview";
          reply.textContent = `↪ ${msg.replyTo.text.slice(0, 50)}...`;
          bubble.appendChild(reply);
        }

        // ✅ Sender name
        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${escapeHtml(msg.senderName || "User")}</strong>`;
        bubble.appendChild(sender);

        // ✅ Message content
        const content = document.createElement("div");
        content.className = "msg-content";
        content.innerHTML = linkifyText(escapeHtml(decrypted));
        bubble.appendChild(content);

        // ✅ Timestamp
        const time = document.createElement("div");
        time.className = "message-time";
        time.textContent = timeSince(msg.timestamp?.toDate?.() || new Date());
        bubble.appendChild(time);

        // ✅ Touch / right-click handlers
        bubble.addEventListener("touchstart", handleTouchStart, { passive: true });
        bubble.addEventListener("touchmove", handleTouchMove, { passive: true });
        bubble.addEventListener("touchend", () => handleSwipeToReply(msg, decrypted), { passive: true });
        bubble.addEventListener("contextmenu", e => {
          e.preventDefault();
          handleLongPressMenu(msg, decrypted, isSelf);
        });

        box.appendChild(bubble);

        // ✅ Mark as seen
        if (!msg.seenBy?.includes(currentUser.uid)) {
          db.collection("groups").doc(groupId).collection("messages")
            .doc(doc.id)
            .update({
              seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            }).catch(() => {});
        }
      });

      box.scrollTop = box.scrollHeight;
    }, err => {
      console.error("❌ Group message load failed:", err.message || err);
    });
}

// === Send Room Message (Group Chat) ===
function sendRoomMessage() {
  const input = document.getElementById("roomInput");
  const text = input?.value.trim();
  if (!text || !currentRoom || !currentUser) return;

  const fromName = document.getElementById("usernameDisplay")?.textContent || "User";
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const message = {
    text: encryptedText,
    senderId: currentUser.uid,
    senderName: fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid]
  };

  if (replyingTo?.msgId && replyingTo?.text) {
    message.replyTo = {
      msgId: replyingTo.msgId,
      text: replyingTo.text
    };
  }

  const groupRef = db.collection("groups").doc(currentRoom);

  groupRef.collection("messages").add(message).then(() => {
    input.value = "";
    cancelReply();

    groupRef.set({
      lastMessage: text,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // ✅ Keep input focused
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    });

    setTimeout(() => {
      const msgArea = document.getElementById("groupMessages");
      if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
    }, 100);
  }).catch(err => {
    console.error("❌ Failed to send group message:", err.message || err);
    alert("❌ Failed to send message.");
  });
}

// ===== Typing Indicator Listener (dot dot dot dot) =====
function listenToTyping(targetId, context) {
  const typingBox = document.getElementById(
    context === "group" ? "groupTypingStatus" : "threadTypingStatus"
  );
  const statusBox = document.getElementById("chatStatus");

  if (!typingBox || !targetId || !currentUser) return;

  if (unsubscribeTyping) unsubscribeTyping();

  const path = db.collection(context === "group" ? "groups" : "threads")
    .doc(targetId)
    .collection("typing");

  unsubscribeTyping = path.onSnapshot(snapshot => {
    let someoneTyping = false;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (doc.id !== currentUser.uid && data?.typing) {
        someoneTyping = true;
      }
    });

    // ✅ Update typing display
    typingBox.style.display = someoneTyping ? "flex" : "none";

    // ✅ Thread-specific "Typing..." indicator
    if (context === "thread" && statusBox) {
      statusBox.textContent = someoneTyping ? "Typing..." : "Online";
    }
  }, err => {
    console.warn("❌ Typing listener error:", err.message || err);
  });
}

function escapeHtml(text) {
  return text?.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]) || "";
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
    { label: "second", seconds: 1 }
  ];
  for (const i of intervals) {
    const count = Math.floor(seconds / i.seconds);
    if (count >= 1) return `${count} ${i.label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}


// ===== Load Inbox Items (Cards + Badge) =====
function listenInbox() {
  const list = document.getElementById("inboxList");
  const badge = document.getElementById("inboxBadge");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox(); // Remove old listener

  unsubscribeInbox = db.collection("inbox")
    .doc(currentUser.uid)
    .collection("items")
    .orderBy("timestamp", "desc")
    .onSnapshot(async (snapshot) => {
      try {
        list.innerHTML = "";
        let unreadCount = 0;

        const senderCache = {};

        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data) continue;

          // 🔴 Unread count
          if (!data.read) unreadCount++;

          // 📤 Sender info
          let senderName = "Unknown";
          let fromUID = "";
          let avatarURL = "default-avatar.png";

          if (typeof data.from === "string") {
            fromUID = data.from;
            if (!senderCache[fromUID]) {
              try {
                const senderDoc = await db.collection("users").doc(fromUID).get();
                if (senderDoc.exists) {
                  const senderData = senderDoc.data();
                  senderCache[fromUID] = {
                    name: senderData.username || senderData.name || "Unknown",
                    avatar: senderData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.username || "User")}`
                  };
                }
              } catch (e) {
                console.warn("⚠️ Failed to fetch sender:", e.message);
              }
            }

            if (senderCache[fromUID]) {
              senderName = senderCache[fromUID].name;
              avatarURL = senderCache[fromUID].avatar;
            }

          } else if (data.from?.uid) {
            fromUID = data.from.uid;
            senderName = data.from.name || "Unknown";
          }

          // 🏷️ Message type
          const typeText =
            data.type === "friend"
              ? `👤 Friend request from @${senderName}`
              : data.type === "group"
              ? `📣 Group invite: ${escapeHtml(data.groupName || "Unnamed Group")}`
              : "📩 Notification";

          // 💌 Create card
          const card = document.createElement("div");
          card.className = "inbox-card";
          card.innerHTML = `
            <img src="${avatarURL}" alt="Avatar" />
            <div class="inbox-meta">
              <div class="inbox-title">${escapeHtml(typeText)}</div>
              <div class="inbox-time">${timeSince(data.timestamp?.toDate?.() || new Date())}</div>
            </div>
            <div class="btn-group">
              <button onclick="acceptInbox('${doc.id}', '${data.type}', '${fromUID}')">Accept</button>
              <button onclick="declineInbox('${doc.id}')">Decline</button>
            </div>
          `;
          list.appendChild(card);
        }

        // 🔔 Badge
        if (badge) {
          badge.textContent = unreadCount ? unreadCount : "";
          badge.style.display = unreadCount > 0 ? "inline-block" : "none";
        }
      } catch (err) {
        console.error("❌ Inbox render error:", err.message || err);
        alert("❌ Failed to load inbox");
      }
    }, (err) => {
      console.error("❌ Inbox listener error:", err.message || err);
      alert("❌ Inbox loading failed");
    });
}

function updateInboxBadge() {
  if (!currentUser) return;

  const badge = document.getElementById("inboxBadge");
  if (!badge) return;

  db.collection("inbox").doc(currentUser.uid).collection("items")
    .where("read", "==", false)
    .get().then(snapshot => {
      const count = snapshot.size;
      badge.textContent = count ? count : "";
      badge.style.display = count > 0 ? "inline-block" : "none";
    }).catch(err => {
      console.warn("⚠️ Inbox badge fetch failed:", err.message || err);
    });
}

function acceptInbox(id, type, fromUID) {
  if (!currentUser || !id || !type || !fromUID) return;

  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items").doc(id);

  if (type === "friend") {
    const batch = db.batch();

    const userRef = db.collection("users").doc(currentUser.uid)
      .collection("friends").doc(fromUID);

    const otherRef = db.collection("users").doc(fromUID)
      .collection("friends").doc(currentUser.uid);

    batch.set(userRef, { since: Date.now() });
    batch.set(otherRef, { since: Date.now() });
    batch.delete(inboxRef);

    batch.commit().then(() => {
      alert("✅ Friend added!");
      openThread(fromUID, "Friend");
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
      joinRoom(fromUID);
      loadChatList?.();
    }).catch(err => {
      console.error("❌ Group join failed:", err.message || err);
      alert("❌ Failed to join group.");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendButton");
  if (sendBtn) {
    sendBtn.addEventListener("click", sendThreadMessage);
  }

  const threadInput = document.getElementById("threadInput");
  if (threadInput) {
    threadInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendThreadMessage();
      }
    });
  }
});

function declineInbox(id) {
  if (!currentUser || !id) return;

  const ref = db.collection("inbox").doc(currentUser.uid).collection("items").doc(id);
  ref.delete().then(() => {
    alert("❌ Request declined.");
  }).catch(err => {
    console.error("❌ Decline failed:", err.message || err);
    alert("❌ Could not decline request.");
  });
}

function markAllRead() {
  if (!currentUser) return;

  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items");

  inboxRef.get().then(snapshot => {
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(inboxRef.doc(doc.id), { read: true });
    });
    return batch.commit();
  }).then(() => {
    alert("📬 All inbox items marked as read.");
    updateInboxBadge();
  }).catch(err => {
    console.error("❌ Mark-all-read failed:", err.message || err);
    alert("❌ Could not mark all as read.");
  });
}

function renderInboxCard(data) {
  const name = escapeHtml(data.name || "Unknown");
  const msg = escapeHtml(data.message || "Notification");
  const photo = data.photo || "default-avatar.png";

  return `
    <div class="inbox-card">
      <img src="${photo}" />
      <div style="flex:1;">
        <strong>${name}</strong><br/>
        <small>${msg}</small>
      </div>
      <div class="btn-group">
        <button onclick="acceptInbox('${data.id}', '${data.type}', '${data.fromUID || ""}')">✔</button>
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
          const isOnline = user.status === "online";

          const card = document.createElement("div");
          card.className = "friend-card";
          card.onclick = () => viewUserProfile(friendId);

          card.innerHTML = `
            <img src="${avatar}" alt="Avatar" />
            <div class="friend-info">
              <div class="name">${escapeHtml(user.username || "User")}</div>
              <div class="bio">${escapeHtml(user.bio || "")}</div>
            </div>
            <div class="status-dot ${isOnline ? "online" : "offline"}" title="${isOnline ? "Online" : "Offline"}"></div>
            <button class="chat-start-btn" onclick="event.stopPropagation(); openThread('${friendId}', '${escapeHtml(user.username || "User")}')">💬 Chat</button>
          `;

          container.appendChild(card);
        } catch (err) {
          console.warn("❌ Failed to load friend data:", err.message || err);
        }
      }
    }, err => {
      console.error("❌ Friend snapshot failed:", err.message || err);
      container.innerHTML = `<div class="error">Error loading friends.</div>`;
    });
}

function removeFriend(uid) {
  if (!currentUser || !uid) return;

  if (confirm("❌ Are you sure you want to remove this friend?")) {
    const ownRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(uid);
    const otherRef = db.collection("users").doc(uid).collection("friends").doc(currentUser.uid);

    const batch = db.batch();
    batch.delete(ownRef);
    batch.delete(otherRef);

    batch.commit()
      .then(() => alert("✅ Friend removed"))
      .catch(err => {
        console.error("❌ Remove friend failed:", err.message);
        alert("❌ Failed to remove friend");
      });
  }
}

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

    // 🔍 Check if friend request already sent
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

        // 📤 Send friend request
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
          console.error("❌ Inbox write error:", err.message || err);
          alert("❌ Failed to send request");
        });

      }).catch(err => {
        console.error("❌ Friend request check failed:", err.message || err);
        alert("❌ Could not verify request status");
      });

  }).catch(err => {
    console.error("❌ Friend existence check failed:", err.message || err);
    alert("❌ Could not check friendship");
  });
}

// ===== Group Info Loader =====
function loadGroupInfo(groupId) {
  if (!groupId) return;

  const ownerLabel = document.getElementById("groupOwner");
  const adminsLabel = document.getElementById("groupAdmins");
  const memberList = document.getElementById("groupMembers");

  if (!ownerLabel || !adminsLabel || !memberList) return;

  // Reset UI
  ownerLabel.textContent = "Owner: ...";
  adminsLabel.textContent = "Admins: ...";
  memberList.innerHTML = `<div class="loading">Loading members...</div>`;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) {
      ownerLabel.textContent = "Owner: Unknown";
      adminsLabel.textContent = "Admins: Unknown";
      memberList.innerHTML = `<div class="error">Group not found.</div>`;
      return;
    }

    const data = doc.data();
    const admins = data.admins || [];
    const members = data.members || [];

    ownerLabel.textContent = "Owner: " + (data.createdBy || "Unknown");
    adminsLabel.textContent = "Admins: " + (admins.length ? admins.join(", ") : "None");

    memberList.innerHTML = "";

    members.forEach(uid => {
      db.collection("users").doc(uid).get().then(userDoc => {
        const user = userDoc.data();
        const name = user?.username || uid;
        const isAdmin = admins.includes(uid);
        const isOwner = uid === data.createdBy;

        const div = document.createElement("div");
        div.className = "member-entry";
        div.innerHTML = `
          <span>${escapeHtml(name)}</span>
          ${isOwner ? `<span class="badge owner-badge">Owner</span>` : ""}
          ${isAdmin && !isOwner ? `<span class="badge admin-badge">Admin</span>` : ""}
        `;
        memberList.appendChild(div);
      }).catch(err => {
        console.warn("⚠️ Failed to fetch user:", err.message);
      });
    });

  }).catch(err => {
    console.error("❌ Group info fetch failed:", err.message);
    ownerLabel.textContent = "Owner: Error";
    adminsLabel.textContent = "Admins: Error";
    memberList.innerHTML = `<div class="error">Failed to load group info.</div>`;
  });
}

// ===== DM Utilities =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

// ===== DM: Open Thread Chat =====
let handleSendClick = null;
let replyingTo = null;
let touchStartX = 0;
let touchMoveX = 0;

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
}
function handleTouchMove(e) {
  touchMoveX = e.touches[0].clientX;
}
function handleSwipeToReply(msg, decrypted) {
  const deltaX = touchMoveX - touchStartX;
  if (deltaX > 35 && deltaX < 150) {
    const wrapper = event.target.closest(".message-bubble-wrapper");
    if (wrapper) {
      wrapper.classList.add("swiped");
      setTimeout(() => wrapper.classList.remove("swiped"), 500);

      replyingTo = {
        msgId: msg.id,
        text: decrypted
      };

      const replyBox = document.getElementById("replyPreview");
      if (replyBox) {
        replyBox.innerHTML = `
          <div class="reply-box-inner" onclick="scrollToReplyMessage('${msg.id}')">
            <span class="reply-label">
              <i data-lucide="corner-up-left" style="width:14px;height:14px;"></i> Replying to
            </span>
            <div class="reply-text clamp-text">${escapeHtml(decrypted)}</div>
            <button class="reply-close" onclick="cancelReply()" aria-label="Cancel reply">
  <i data-lucide="x" style="width:14px;height:14px;"></i>
</button>
          </div>
        `;
        replyBox.style.display = "flex";
        if (typeof lucide !== "undefined") lucide.createIcons();
      }

      const input = document.getElementById("threadInput");
      if (input) {
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      }
    }
  }
}

function cancelReply() {
  replyingTo = null;
  const box = document.getElementById("replyPreview");
  if (box) {
    box.style.display = "none";
    box.innerHTML = "";
  }
}


function extractFirstURL(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

async function fetchLinkPreview(url) {
  try {
    const res = await fetch(`https://api.linkpreview.net/?key=89175199788eee7477f5ac45e693cb53&q=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data && data.title && data.url) return data;
  } catch (e) {
    console.warn("🔗 Link preview fetch failed:", e);
  }
  return null;
}

async function openThread(uid, name) {
  if (!currentUser || !uid) return;

  try {
    const friendDoc = await db.collection("users").doc(currentUser.uid)
      .collection("friends").doc(uid).get();

    if (!friendDoc.exists) {
      alert("⚠️ You must be friends to start a chat.");
      return;
    }

    switchTab("threadView");

    setTimeout(() => {
      const input = document.getElementById("threadInput");
      if (input && !input.dataset.bound) {
        input.addEventListener("keydown", handleThreadKey);
        input.dataset.bound = "true";
      }

      const sendBtn = document.getElementById("sendButton");
      if (sendBtn && !sendBtn.dataset.bound) {
        sendBtn.addEventListener("click", handleSendClick);
        sendBtn.dataset.bound = "true";
      }

      // ✅ Setup emoji button
      setupEmojiButton();

    }, 200);

    document.getElementById("threadWithName").textContent =
      typeof name === "string" ? name : (name?.username || "Chat");

    document.getElementById("chatOptionsMenu").style.display = "none";

    currentThreadUser = uid;
    currentRoom = null;

    const threadIdStr = threadId(currentUser.uid, uid);
    const area = document.getElementById("threadMessages");
    renderedMessageIds = new Set();

    if (area && lastThreadId !== threadIdStr) {
      area.innerHTML = "";
      lastThreadId = threadIdStr;
    }

    const savedScroll = sessionStorage.getItem("threadScroll_" + threadIdStr);
    if (savedScroll !== null && !isNaN(savedScroll)) {
      setTimeout(() => {
        area.scrollTop = parseInt(savedScroll);
      }, 300);
    } else {
      setTimeout(() => scrollToBottomThread(true), 200);
    }

    area.onscroll = () => {
      sessionStorage.setItem("threadScroll_" + threadIdStr, area.scrollTop);
    };

    try {
      const friendUserDoc = await db.collection("users").doc(uid).get();
      if (friendUserDoc.exists) {
        const user = friendUserDoc.data();
        const headerImg = document.getElementById("chatProfilePic");
        if (headerImg) {
          headerImg.src = user.avatarBase64 || user.photoURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
        }
      }
    } catch (e) {
      console.warn("⚠️ Could not load friend image:", e);
    }

    if (typeof unsubscribeThread === "function") unsubscribeThread();
    if (typeof unsubscribeTyping === "function") unsubscribeTyping();

    listenToTyping(threadIdStr, "thread");

    await db.collection("threads").doc(threadIdStr).set({
      unread: { [currentUser.uid]: 0 }
    }, { merge: true });

    db.collection("users").doc(uid).onSnapshot(doc => {
      const data = doc.data();
      const status = document.getElementById("chatStatus");
      if (!status || !data) return;

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

    unsubscribeThread = db.collection("threads").doc(threadIdStr)
      .collection("messages").orderBy("timestamp")
      .onSnapshot(async snapshot => {
        if (!area) return;

        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;

        for (const change of snapshot.docChanges()) {
          const msgDoc = change.doc;
          const msg = msgDoc.data();
          msg.id = msgDoc.id;

          const isSelf = msg.from === currentUser.uid;

          const old = area.querySelector(`.message-bubble[data-msg-id="${msg.id}"]`);
          if (old?.parentElement) old.parentElement.remove();
          if (msg.deletedFor?.[currentUser.uid]) continue;

          let decrypted = "";
          let isDeleted = false;

          if (typeof msg.text === "string") {
            if (msg.text === "") {
              isDeleted = true;
              decrypted = '<i data-lucide="trash-2"></i> Message deleted';
            } else {
              try {
                const bytes = CryptoJS.AES.decrypt(msg.text, "yourSecretKey");
                decrypted = bytes.toString(CryptoJS.enc.Utf8) || "[Encrypted]";
              } catch {
                decrypted = "[Decryption error]";
              }
            }
          } else {
            decrypted = "[Invalid text]";
          }

          const wrapper = document.createElement("div");
          wrapper.className = "message-bubble-wrapper fade-in " + (isSelf ? "right" : "left");

          const bubble = document.createElement("div");
          bubble.className = "message-bubble " + (isSelf ? "right" : "left");
          bubble.dataset.msgId = msg.id;

          const replyHtml = msg.replyTo && !isDeleted
            ? `<div class="reply-to clamp-text"><i data-lucide="corner-up-left"></i> ${escapeHtml(msg.replyTo.text || "")}</div>`
            : "";

          const url = extractFirstURL(decrypted);
          let linkPreviewHTML = "";
          if (url) {
            const preview = await fetchLinkPreview(url);
            if (preview?.title || preview?.image) {
              linkPreviewHTML = `
                <div class="link-preview">
                  ${preview.image ? `<img src="${preview.image}" alt="Preview" class="preview-img">` : ""}
                  <div class="preview-info">
                    <div class="preview-title">${escapeHtml(preview.title || "")}</div>
                    <div class="preview-url">${url}</div>
                  </div>
                </div>
              `;
            }
          }

          const textHtml = escapeHtml(decrypted);
          const shortText = textHtml.slice(0, 500);
          const hasLong = textHtml.length > 500;

          const seenClass = msg.seenBy?.includes(currentThreadUser) ? "tick-seen" : "tick-sent";

          const meta = `
            <span class="msg-meta-inline">
              ${msg.timestamp?.toDate ? `<span class="msg-time">${timeSince(msg.timestamp.toDate())}</span>` : ""}
              ${msg.edited ? '<span class="edited-tag">(edited)</span>' : ""}
              ${isSelf && !isDeleted ? `<i data-lucide="check-check" class="tick-icon ${seenClass}"></i>` : ""}
            </span>
          `;

          const content = hasLong
            ? `${shortText}<span class="show-more" onclick="this.parentElement.innerHTML=this.parentElement.dataset.full">... Show more</span>`
            : linkifyText(textHtml);

          const textPreview = `
            <div class="msg-text-wrapper">
              <span class="msg-text clamp-text" data-full="${textHtml}" data-short="${shortText}">
                ${content}
              </span>
              ${meta}
            </div>
          `;

          bubble.innerHTML = `
            <div class="msg-content ${isDeleted ? "msg-deleted" : ""}">
              ${replyHtml || ""}
              <div class="msg-inner-wrapper">
                ${textPreview}
              </div>
              ${linkPreviewHTML}
            </div>
          `;

          if (!isDeleted) {
            bubble.addEventListener("touchstart", handleTouchStart);
            bubble.addEventListener("touchmove", handleTouchMove);
            bubble.addEventListener("touchend", () => handleSwipeToReply(msg, decrypted));
            if (isSelf) {
              bubble.addEventListener("contextmenu", e => {
                e.preventDefault();
                handleLongPressMenu(msg, decrypted, true);
              });
            }
          }

          wrapper.appendChild(bubble);
          area.appendChild(wrapper);

          if (!msg.seenBy?.includes(currentUser.uid)) {
            db.collection("threads").doc(threadIdStr).collection("messages").doc(msg.id)
              .update({ seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }).catch(() => {});
          }
        }

        if (typeof lucide !== "undefined") lucide.createIcons();
        if (isNearBottom) {
          setTimeout(() => scrollToBottomThread(true), 100);
        }
      });

  } catch (err) {
    console.error("❌ openThread error:", err);
    alert("❌ Could not open chat: " + (err.message || JSON.stringify(err)));
  }
}

function toggleChatOptions(event) {
  event.stopPropagation();
  const menu = document.getElementById("chatOptionsMenu");
  if (!menu) return;

  const isOpen = menu.classList.contains("show");
  if (isOpen) {
    menu.classList.remove("show");
  } else {
    menu.classList.add("show");
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove("show");
      }
    }, { once: true });
  }
}

document.getElementById("chatOptionsMenu")?.addEventListener("click", e => e.stopPropagation());

// Placeholder functions
function blockUser() { alert("🚫 Block user feature coming soon."); }
function viewMedia() { alert("🖼️ View media feature coming soon."); }
function exportChat() { alert("📁 Export chat feature coming soon."); }
function deleteChat() { alert("🗑️ Delete chat feature coming soon."); }

function linkifyText(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="link-text">$1</a>');
}


// Long press modal
let selectedMessageForAction = null;

function handleLongPressMenu(msg, text, isSelf) {
  if (!isSelf) {
    alert("⚠️ You can only edit or delete your own messages.");
    return;
  }
  selectedMessageForAction = { msg, text };

  const modal = document.getElementById("messageOptionsModal");
  modal.querySelector('[onclick="editMessage()"]').style.display = "flex";
  modal.querySelector('[onclick="deleteForMe()"]').style.display = "flex";
  modal.querySelector('[onclick="deleteForEveryone()"]').style.display = "flex";

  openOptionsModal();
}

function openOptionsModal() {
  const modal = document.getElementById("messageOptionsModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.addEventListener("click", closeOptionsModal);
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeOptionsModal(event) {
  const modal = document.getElementById("messageOptionsModal");
  if (!modal) return;
  if (!event || event.target === modal) {
    modal.classList.add("hidden");
    modal.removeEventListener("click", closeOptionsModal);
  }
}

function renderMessage(msg, isOwn) {
  let decrypted = "[Encrypted]";
  let isDeleted = false;

  try {
    decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
    if (!decrypted) decrypted = "[Encrypted]";
  } catch {
    decrypted = "[Error decoding]";
  }

  if (msg.text === "") {
    decrypted = '<i data-lucide="trash-2"></i> Message deleted';
    isDeleted = true;
  }

  const escaped = escapeHtml(decrypted);
  const replyHtml = msg.replyTo && !isDeleted
    ? `<div class="reply-to"><i data-lucide="corner-up-left"></i> ${escapeHtml(msg.replyTo.text || "")}</div>`
    : "";

  const meta = `
    <span class="msg-time">${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}</span>
    ${msg.edited ? `<span class="edited-tag">(edited)</span>` : ""}
    ${isOwn && !isDeleted ? '<i data-lucide="check-check" class="tick-icon tick-sent"></i>' : ""}
  `;

  const linkPreviewHtml = msg.preview && !isDeleted
    ? `
      <div class="link-preview">
        ${msg.preview.image ? `<img src="${msg.preview.image}" alt="Link image" class="preview-img">` : ""}
        <div class="preview-info">
          <div class="preview-title">${escapeHtml(msg.preview.title)}</div>
          <div class="preview-url">${escapeHtml(msg.preview.url)}</div>
        </div>
      </div>
    `
    : "";

  return `
    <div class="message-bubble ${isOwn ? 'right' : 'left'}" 
         oncontextmenu="handleLongPressMenu(${JSON.stringify(msg)}, \`${escaped}\`, ${isOwn}); return false;"
         data-msg-id="${msg.id}">
      <div class="msg-content ${isDeleted ? 'msg-deleted' : ''}">
        ${replyHtml}
        <span class="msg-text">${linkifyText(escaped)}</span>
        ${linkPreviewHtml}
        <div class="msg-meta">${meta}</div>
      </div>
    </div>
  `;
}

// Edit message modal
let editingMessageData = null;

function editMessage() {
  closeOptionsModal();
  if (!selectedMessageForAction) return;

  const { msg } = selectedMessageForAction;
  if (msg.from !== currentUser.uid) {
    alert("⚠️ You can only edit your own messages.");
    return;
  }

  editingMessageData = selectedMessageForAction;
  document.getElementById("editMessageInput").value = editingMessageData.text;
  document.getElementById("editMessageModal").style.display = "flex";
}

function deleteForMe() {
  closeOptionsModal();
  if (!selectedMessageForAction) return;

  const { msg } = selectedMessageForAction;
  const threadIdStr = threadId(currentUser.uid, currentThreadUser);

  db.collection("threads").doc(threadIdStr)
    .collection("messages").doc(msg.id)
    .update({
      [`deletedFor.${currentUser.uid}`]: true
    })
    .then(() => {
      showToast("🗑️ Message deleted for you");

      // Immediately hide message in DOM
      const bubble = document.querySelector(`.message-bubble[data-msg-id="${msg.id}"]`);
      if (bubble?.parentElement) {
        bubble.parentElement.remove();
      }
    })
    .catch(console.error);
}

function deleteForEveryone() {
  closeOptionsModal();
  if (!selectedMessageForAction) return;

  const { msg } = selectedMessageForAction;
  if (msg.from !== currentUser.uid) {
    alert("⚠️ You can only delete your own messages for everyone.");
    return;
  }

  const threadIdStr = threadId(currentUser.uid, currentThreadUser);

  db.collection("threads").doc(threadIdStr)
    .collection("messages").doc(msg.id)
    .update({
      text: "",  // Optionally wipe out text
      deletedFor: {
        [currentUser.uid]: true,
        [currentThreadUser]: true
      }
    })
    .then(() => {
      showToast("✅ Message deleted for everyone");

      const bubble = document.querySelector(`.message-bubble[data-msg-id="${msg.id}"]`);
      if (bubble?.parentElement) {
        bubble.parentElement.remove();
      }
    })
    .catch(console.error);
}

function saveEditedMessage() {
  const newText = document.getElementById("editMessageInput").value.trim();
  if (!newText || !editingMessageData) return;

  const encrypted = CryptoJS.AES.encrypt(newText, "yourSecretKey").toString();
  const threadIdStr = threadId(currentUser.uid, currentThreadUser);

  db.collection("threads").doc(threadIdStr)
    .collection("messages").doc(editingMessageData.msg.id)
    .update({
      text: encrypted,
      edited: true
    })
    .then(() => {
      showToast(" Message edited");
      closeEditModal();
      editingMessageData = null;
    })
    .catch(err => {
      console.error("❌ Failed to edit:", err);
    });
}

function closeEditModal() {
  editingMessageData = null;
  document.getElementById("editMessageModal").style.display = "none";
}

// Toast display
function showToast(message) {
  const toast = document.getElementById("chatToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

// Chat card template
function renderChatCard(chat) {
  return `
    <div class="chat-card" onclick="openThread('${chat.uid}', '${chat.name.replace(/'/g, "\\'")}')">
      <img src="${chat.photo || 'default-avatar.png'}" class="friend-avatar" />
      <div class="details">
        <div class="name">${escapeHtml(chat.name)}</div>
        <div class="last-message">${escapeHtml(chat.lastMessage || "No messages yet")}</div>
      </div>
      <div class="meta">${chat.timestamp || ""}</div>
    </div>
  `;
}


// ===== DM: Send Thread Message with AES Encryption ====
async function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  if (!input || !currentThreadUser) return;

  const text = input.value.trim();
  if (!text) return;

  const fromName = document.getElementById("usernameDisplay")?.textContent || "User";
  const toNameElem = document.getElementById("threadWithName");
  const toName = toNameElem ? toNameElem.textContent : "Friend";

  const threadIdStr = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(threadIdStr);

  // ✅ Encrypt message
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const message = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid]
  };

  // ✅ Handle reply
  if (replyingTo?.msgId && replyingTo?.text?.trim()) {
    message.replyTo = {
      msgId: replyingTo.msgId,
      text: replyingTo.text
    };
  }

  // ✅ Detect link & fetch preview
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    try {
      const preview = await fetchLinkPreview(urlMatch[0]);
      if (preview?.title) {
        message.preview = {
          title: preview.title,
          image: preview.image || "",
          url: preview.url
        };
      }
    } catch (err) {
      console.warn("Preview fetch failed:", err);
    }
  }

  // ✅ Clear input without losing focus
  input.value = "";
  cancelReply();

  try {
    await threadRef.collection("messages").add(message);

    // ✅ Update thread metadata
    await threadRef.set({
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

    // ✅ Keep keyboard open and scroll down smoothly
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
    });
    setTimeout(() => scrollToBottomThread(true), 150);

    console.log("📨 Thread message sent:", text);
  } catch (err) {
    console.error("❌ Send failed:", err.message || err);
    alert("❌ Failed to send message.");
  }
}

function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom) return;

  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = db.collection("groups").doc(currentRoom).collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const prevScroll = messagesDiv.scrollTop;
      const isNearBottom = messagesDiv.scrollHeight - prevScroll - messagesDiv.clientHeight < 100;

      messagesDiv.innerHTML = "";
      const renderedIds = new Set();

      snapshot.forEach(doc => {
        const msg = doc.data();
        const msgId = doc.id;
        if (!msg || renderedIds.has(msgId)) return;
        renderedIds.add(msgId);

        const isSelf = msg.senderId === currentUser.uid;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (isSelf ? "right" : "left");
        bubble.dataset.msgId = msgId;

        if (msg.deletedFor?.[currentUser.uid]) {
          bubble.classList.add("deleted");
          bubble.textContent = "This message was deleted";
          messagesDiv.appendChild(bubble);
          return;
        }

        // ✅ Decrypt safely
        let decrypted = "";
        try {
          decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
        } catch (e) {
          console.error("Decryption failed:", e);
          decrypted = "[Decryption error]";
        }

        // ✅ Sender Info
        const sender = document.createElement("div");
        sender.className = "sender-info";
        sender.innerHTML = `<strong>${escapeHtml(msg.senderName || "Unknown")}</strong>`;
        bubble.appendChild(sender);

        // ✅ Reply Preview (optional)
        if (msg.replyTo?.text) {
          const reply = document.createElement("div");
          reply.className = "reply-preview";
          reply.textContent = "↪ " + msg.replyTo.text.slice(0, 60) + (msg.replyTo.text.length > 60 ? "..." : "");
          bubble.appendChild(reply);
        }

        // ✅ Message text
        const textDiv = document.createElement("div");
        textDiv.innerHTML = linkifyText(escapeHtml(decrypted));
        bubble.appendChild(textDiv);

        // ✅ Timestamp
        if (msg.timestamp?.toDate) {
          const meta = document.createElement("div");
          meta.className = "msg-meta";
          meta.textContent = timeSince(msg.timestamp.toDate());
          bubble.appendChild(meta);
        }

        // ✅ Touch & Right-click
        bubble.addEventListener("touchstart", handleTouchStart, { passive: true });
        bubble.addEventListener("touchmove", handleTouchMove, { passive: true });
        bubble.addEventListener("touchend", () => handleSwipeToReply(msg, decrypted), { passive: true });
        bubble.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          handleLongPressMenu(msg, decrypted, isSelf);
        });

        messagesDiv.appendChild(bubble);
      });

      if (isNearBottom) {
        requestAnimationFrame(() => {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
      }

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
            <div class="username">@${escapeHtml(user.username || "unknown")}</div>
            <div class="bio">${escapeHtml(user.bio || "No bio")}</div>
          </div>
          <button id="friendBtn_${doc.id}">Add Friend</button>
        `;
        userResults.appendChild(card);

        const btn = card.querySelector("button");

        // ✅ Check if already friends
        const friendDoc = await db.collection("users").doc(currentUser.uid).collection("friends").doc(doc.id).get();
        if (friendDoc.exists) {
          btn.textContent = "Friend";
          btn.disabled = true;
          btn.classList.add("disabled-btn");
        } else {
          btn.onclick = () => addFriend(doc.id);
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
            <div class="username">#${escapeHtml(group.name || "unknown")}</div>
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

// ==== GROUP SETTINGS ====

function viewGroupMembers() {
  if (!currentRoom) return alert("❌ No group selected.");
  switchTab("profileTab");
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
  if (!currentRoom && !currentThreadUser) return alert("❌ No chat selected");

  const container = document.createElement("div");
  container.style.padding = "20px";

  const messagesRef = currentRoom
    ? db.collection("groups").doc(currentRoom).collection("messages")
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("messages");

  messagesRef
    .where("fileURL", "!=", null)
    .orderBy("fileURL")
    .orderBy("timestamp", "desc")
    .limit(20)
    .get()
    .then(snapshot => {
      if (snapshot.empty) return alert("📎 No media found");

      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.style.marginBottom = "12px";
        div.innerHTML = `
          <p>${escapeHtml(msg.fromName || "User")} - ${msg.timestamp?.toDate?.().toLocaleString?.() || ""}</p>
          <a href="${msg.fileURL}" target="_blank">${escapeHtml(msg.fileName || "Download File")}</a>
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

  db.collection("groups").doc(currentRoom).update({
    members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
  }).then(() => {
    alert("🚪 You left the group.");
    currentRoom = null;
    loadChatList?.();
    switchTab("chatTab");
  }).catch(err => {
    console.error("❌ Failed to leave group:", err.message);
    alert("❌ Unable to leave group.");
  });
}

function joinGroupById(groupId) {
  if (!currentUser || !groupId) return alert("⚠️ Invalid group or user.");

  db.collection("groups").doc(groupId).update({
    members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  }).then(() => {
    alert("✅ Joined group!");
    loadChatList?.();
    loadGroups?.();
  }).catch(err => {
    console.error("❌ Failed to join group:", err.message);
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

  db.collection("groups").doc(groupId).get().then(doc => {
    title.textContent = doc.exists ? (doc.data().name || "Group Chat") : "Group (Not Found)";
  });

  if (unsubscribeRoomMessages) unsubscribeRoomMessages();
  if (unsubscribeTyping) unsubscribeTyping();

  listenToTyping(groupId, "group");

  unsubscribeRoomMessages = db.collection("threads").doc(groupId)
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
          console.warn("⚠️ Group sender avatar load failed:", e.message);
        }

        const decrypted = (() => {
          try {
            return CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
          } catch {
            return "[Decryption failed]";
          }
        })();

        bubble.innerHTML = `
          <div class="msg-avatar"><img src="${avatar}" /></div>
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
      alert("❌ Failed to load group chat.");
    });
}

function messageUser(uid, username) {
  if (!uid || !currentUser) return;

  db.collection("users").doc(currentUser.uid).collection("friends").doc(uid).get()
    .then(doc => {
      if (doc.exists) {
        openThread(uid, username || "Friend");
        document.getElementById("userFullProfile").style.display = "none";
        document.getElementById("viewProfileModal").style.display = "none";
      } else {
        alert("⚠️ Not friends yet. Send a request first.");
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
    const msg = `📎 File: <a href="${url}" target="_blank">${escapeHtml(file.name)}</a>`;
    if (type === "thread") {
      document.getElementById("threadInput").value = msg;
      sendThreadMessage();
    } else {
      document.getElementById("groupMessageInput").value = msg;
      sendGroupMessage();
    }
  }).catch(err => {
    console.error("❌ Upload error:", err);
    alert("❌ Upload failed.");
  }).finally(() => showLoading(false));
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("🔗 Invite link copied!");
  }).catch(err => {
    console.error("❌ Clipboard error:", err);
    alert("❌ Failed to copy");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Setup modal behavior
  const modal = document.getElementById("customModal");
  const modalNo = document.getElementById("modalNo");
  if (modal && modalNo) {
    modalNo.onclick = () => modal.style.display = "none";
  }
});
  // ✅ Restore theme
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) toggle.checked = true;
  }


// ✅ Toggle theme
function toggleTheme() {
  const isDark = document.getElementById("darkModeToggle").checked;
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// ✅ WebTorrent init
function startTorrentClient() {
  if (!client) client = new WebTorrent();
}

// ✅ Send Torrent File
function sendTorrentFile(file) {
  startTorrentClient();
  client.seed(file, torrent => {
    const magnet = torrent.magnetURI;
    document.getElementById("threadInput").value = `📎 Torrent: <a href="${magnet}" target="_blank">Download</a>`;
    sendThreadMessage();
  });
}

// ✅ Handle magnet link
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

// ✅ Modal: close profile
function closeProfileModal() {
  document.getElementById("viewProfileModal").style.display = "none";
}

// ✅ Inbox search filter
function filterInbox(term) {
  const items = document.querySelectorAll("#inboxList .inbox-card");
  items.forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(term.toLowerCase()) ? "block" : "none";
  });
}

// ✅ Group dropdown join
function selectGroupFromDropdown() {
  const dropdown = document.getElementById("roomDropdown");
  const groupId = dropdown.value;
  if (groupId) {
    joinRoom(groupId);
    switchTab("chatTab");
  }
}

// ✅ Copy Room ID
function showRoomId() {
  if (!currentRoom) return;
  alert("Group ID:\n" + currentRoom);
}

function copyRoomId() {
  if (!currentRoom) return;
  copyToClipboard(currentRoom);
  alert("Group ID copied!");
}

// ✅ Add Developer Badge
function applyDeveloperBadge(uid, usernameElement) {
  if (uid === "moneythepro") {
    const badge = document.createElement("span");
    badge.textContent = "🛠️ Developer";
    badge.className = "badge developer";
    usernameElement.appendChild(badge);
  }
}

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

// ✅ Group controls
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

function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  db.collection("groups").doc(groupId).delete().then(() => {
    alert("Group deleted.");
    loadChatList();
  });
}

function reportUser(uid) {
  showModal("Report this user?", () => {
    alert("Thank you for reporting. Our team will review.");
  });
}

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

// ✅ Scroll to bottom helper
function scrollToBottom(divId) {
  const div = document.getElementById(divId);
  if (div) div.scrollTop = div.scrollHeight;
}

// ✅ Emoji Picker
function insertEmoji(targetId, emoji) {
  const input = document.getElementById(targetId);
  if (input) input.value += emoji;
}

// ✅ Group Invite to inbox
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

// ✅ Toast Message
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ✅ Upload File (refactored)
function uploadFileToThreadOrGroup(context) {
  const fileInput = context === "thread"
    ? document.getElementById("threadFile")
    : document.getElementById("roomFile");
  const file = fileInput?.files?.[0];
  if (!file) return;
  sendFileMessage(file, context);
}

// ====== WebTorrent (P2P File Share) ======

// ✅ Check if user is a friend (used in DMs)
function isFriend(uid) {
  return db.collection("users").doc(currentUser.uid)
    .collection("friends").doc(uid).get()
    .then(doc => doc.exists);
}

// ✅ Share a file via torrent (DM or group context)
function shareFileViaTorrent(type) {
  if (!client) client = new WebTorrent(); // 🔄 Lazy initialize if needed

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "*/*";
  input.style.display = "none";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    client.seed(file, torrent => {
      const magnet = torrent.magnetURI;
      const htmlMsg = `📎 File: <a href="${magnet}" target="_blank">${file.name}</a>`;

      if (type === "dm" && currentThreadUser) {
        isFriend(currentThreadUser).then(ok => {
          if (!ok) return alert("❌ Only friends can share P2P files.");
          document.getElementById("threadInput").value = htmlMsg;
          sendThreadMessage();
        });
      } else if (type === "group" && currentRoom) {
        document.getElementById("groupMessageInput").value = htmlMsg;
        sendGroupMessage();
      } else {
        alert("⚠️ Sharing not allowed in this context.");
      }
    });
  };

  document.body.appendChild(input); // Needed for iOS
  input.click();
  setTimeout(() => input.remove(), 5000);
}

// ✅ Auto download file from magnet link with confirmation
function autoDownloadMagnet(magnetURI) {
  if (!client) client = new WebTorrent();

  const torrent = client.add(magnetURI);

  torrent.on("ready", () => {
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

  torrent.on("error", err => console.error("Torrent error:", err));
}

// ✅ Find all magnet links in container and bind download click
function renderWithMagnetSupport(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const links = container.querySelectorAll("a[href^='magnet:']");
  links.forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      const confirmed = confirm(`📦 Download file: ${link.textContent}?`);
      if (confirmed) autoDownloadMagnet(link.href);
    };
  });
}

/* =========================================================
 * Thread View Enhancements — Full with Emoji, Autosize
 * ======================================================= */
(function(){
  const THREAD_VIEW_ID     = "threadView";
  const THREAD_MSGS_ID     = "threadMessages";
  const THREAD_INPUT_ID    = "threadInput";
  const THREAD_SEND_BTN_ID = "sendButton";
  const EMOJI_BTN_ID       = "emojiToggle";
  const KEYBOARD_THRESHOLD = 150;

  let initialViewportHeight = window.innerHeight;

  const getThreadView  = () => document.getElementById(THREAD_VIEW_ID);
  const getThreadMsgs  = () => document.getElementById(THREAD_MSGS_ID);
  const getThreadInput = () => document.getElementById(THREAD_INPUT_ID);
  const getSendBtn     = () => document.getElementById(THREAD_SEND_BTN_ID);
  const getEmojiBtn    = () => document.getElementById(EMOJI_BTN_ID);

  function adjustThreadLayout() {
    const el = getThreadView();
    if (!el) return;
    const vh = window.visualViewport?.height || window.innerHeight;
    el.style.height = vh + "px";
  }

  function scrollToBottomThread(smooth = true) {
    const msgs = getThreadMsgs();
    if (!msgs) return;
    const scrollTarget = msgs.closest(".chat-scroll-area") || msgs;
    scrollTarget.scrollTo({
      top: scrollTarget.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  }

  function focusThreadInput() {
    requestAnimationFrame(() => {
      const input = getThreadInput();
      if (input) input.focus({ preventScroll: false });
    });
  }

  function handleThreadKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (typeof sendThreadMessage === "function") {
        sendThreadMessage();
      }
    }
  }

  function scrollToReplyMessage(msgId) {
    const el = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.classList.add("highlighted-reply");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.classList.remove("highlighted-reply"), 2000);
  }

  // ✨ Emoji Picker Setup
  function setupEmojiButton() {
  const emojiBtn = getEmojiBtn();
  const input = getThreadInput();
  if (!emojiBtn || !input) return;

  let emojiPicker;
  let pickerOpen = false;

  emojiBtn.addEventListener("click", async () => {
    // Lazy load emoji picker
    if (!emojiPicker) {
      const module = await import("https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.2");
      emojiPicker = new module.default({
        position: 'top-end',
        theme: document.body.classList.contains("dark") ? "dark" : "light",
        autoHide: false,
        showSearch: true,
        showRecents: true,
        emojiSize: '1.3em',
        zIndex: 9999
      });

      // Insert emoji at caret position
      emojiPicker.on("emoji", emoji => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;

        input.value = text.slice(0, start) + emoji + text.slice(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;

        autoResizeInput(input);
        input.focus();
      });
    }

    // Show/hide toggle
    if (pickerOpen) {
      emojiPicker.hidePicker();
      pickerOpen = false;
    } else {
      emojiPicker.setTheme(document.body.classList.contains("dark") ? "dark" : "light");
      emojiPicker.showPicker(emojiBtn);
      pickerOpen = true;
    }
  });
  }

  // ✨ Auto-resize input height
  function autoResizeInput(input) {
    input.style.height = "auto";
    input.style.height = (input.scrollHeight) + "px";
  }

  // Make these usable globally
  window.adjustThreadLayout     = adjustThreadLayout;
  window.scrollToBottomThread   = scrollToBottomThread;
  window.focusThreadInput       = focusThreadInput;
  window.handleThreadKey        = handleThreadKey;
  window.scrollToReplyMessage   = scrollToReplyMessage;

  function detectKeyboardResize() {
    const isKeyboardOpen = window.innerHeight < initialViewportHeight - KEYBOARD_THRESHOLD;
    document.body.classList.toggle("keyboard-open", isKeyboardOpen);
    if (isKeyboardOpen) {
      setTimeout(() => scrollToBottomThread(true), 100);
    }
  }

  let resizeRAF = null;
  function viewportChanged() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      detectKeyboardResize();
      adjustThreadLayout();
      const input = getThreadInput();
      if (document.activeElement === input) {
        setTimeout(() => scrollToBottomThread(true), 150);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    adjustThreadLayout();

    const input = getThreadInput();
    if (input) {
      input.addEventListener("keydown", handleThreadKey);
      input.addEventListener("input", () => autoResizeInput(input));
      input.addEventListener("focus", () => {
        setTimeout(() => {
          adjustThreadLayout();
          scrollToBottomThread(true);
        }, 100);
      });
      autoResizeInput(input); // Initial
    }

    const sendBtn = getSendBtn();
    if (sendBtn) sendBtn.addEventListener("click", () => {
      if (typeof sendThreadMessage === "function") sendThreadMessage();
    });

    setupEmojiButton();

    window.addEventListener("resize", viewportChanged);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", viewportChanged);
      window.visualViewport.addEventListener("scroll", viewportChanged);
    }
  });
})();
