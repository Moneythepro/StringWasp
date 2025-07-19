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

    // Ensure Lucide icons are refreshed globally
    if (typeof lucide !== "undefined") lucide.createIcons();

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

    // ✅ Show username with badge
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) {
      usernameDisplay.innerHTML = usernameWithBadge(user.uid, data.username || "User");
      if (typeof lucide !== "undefined") lucide.createIcons();
    }

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

        // ✅ Update global username with badge
        const header = document.getElementById("usernameDisplay");
        if (header) {
          header.innerHTML = usernameWithBadge(currentUser.uid, updates.username || "User");
          if (typeof lucide !== "undefined") lucide.createIcons();
        }

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

    // ---- Form fields (raw values, no badge markup!) ----
    const nameEl     = document.getElementById("profileName");
    const bioEl      = document.getElementById("profileBio");
    const genderEl   = document.getElementById("profileGender");
    const phoneEl    = document.getElementById("profilePhone");
    const emailEl    = document.getElementById("profileEmail");
    const userEl     = document.getElementById("profileUsername");
    const previewImg = document.getElementById("profilePicPreview");

    if (nameEl)   nameEl.value   = data.name || "";
    if (bioEl)    bioEl.value    = data.bio || "";
    if (genderEl) genderEl.value = data.gender || "";
    if (phoneEl)  phoneEl.value  = data.phone || "";
    if (emailEl)  emailEl.value  = data.publicEmail || data.email || "";
    if (userEl)   userEl.value   = data.username || "";

    if (previewImg) {
      previewImg.src =
        data.avatarBase64 ||
        data.photoURL ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          data.username || "User"
        )}&background=random`;
    }

    // ---- Global header username (with badge) ----
    const headerUser = document.getElementById("usernameDisplay");
    if (headerUser) {
      // Use innerHTML so badge icon renders.
      headerUser.innerHTML = usernameWithBadge(currentUser.uid, data.username || "User");
      // Lucide redraw (badge-check)
      if (typeof lucide !== "undefined") lucide.createIcons();
    }

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
    const avatar = user.avatarBase64 || user.photoURL || 
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

    document.getElementById("viewProfilePic").src = avatar;
    document.getElementById("viewProfileName").textContent = user.name || "Unnamed";

    // ✅ Apply badge to username
    document.getElementById("viewProfileUsername").innerHTML =
      `@${usernameWithBadge(uid, user.username || "unknown")}`;

    document.getElementById("viewProfileBio").textContent = user.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = user.email || "";
    document.getElementById("viewProfileStatus").textContent = user.status || "";

    document.getElementById("viewProfileModal").style.display = "flex";

    // Refresh Lucide icons for the badge
    if (typeof lucide !== "undefined") lucide.createIcons();

    // Handle friend/unfriend buttons
    const btnGroup = document.querySelector("#viewProfileModal .btn-group");
    if (!btnGroup) return;
    btnGroup.innerHTML = "";

    db.collection("users").doc(currentUser.uid)
      .collection("friends").doc(uid)
      .get()
      .then(friendDoc => {
        const btn = document.createElement("button");
        if (friendDoc.exists) {
          btn.textContent = "Unfriend";
          btn.onclick = () => removeFriend(uid);
        } else {
          btn.textContent = "Add Friend";
          btn.onclick = () => addFriend(uid);
        }
        btnGroup.appendChild(btn);
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

  // Remember current selection so we can restore it after refresh
  const prevSelected = dropdown.value;

  if (unsubscribeGroups) unsubscribeGroups(); // clear old listener

  const SHOW_HASH_PREFIX = true; // flip to false if you don't want '#'

  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(
      snapshot => {
        dropdown.innerHTML = "";

        if (snapshot.empty) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.disabled = true;
          opt.selected = true;
          opt.textContent = "No groups yet";
          dropdown.appendChild(opt);
          return;
        }

        let restored = false;

        snapshot.forEach(doc => {
          const group = doc.data();
          const opt = document.createElement("option");
          opt.value = doc.id;
          const label = group.name || doc.id;
          opt.textContent = SHOW_HASH_PREFIX ? `#${label}` : label;
          if (doc.id === prevSelected) {
            opt.selected = true;
            restored = true;
          }
          dropdown.appendChild(opt);
        });

        // If we couldn't restore (maybe group deleted), select first
        if (!restored && dropdown.options.length > 0) {
          dropdown.selectedIndex = 0;
        }
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
        const name = escapeHtml(group.name || "Group");
        const unread = group.unread?.[currentUser.uid] || 0;

        // Last message preview
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
              <span class="name">#${name}</span>
              <span class="time">${updatedTime}</span>
            </div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;

        list.appendChild(card);
      });

      // Refresh icons (if lucide icons are used in last message or elsewhere)
      if (typeof lucide !== "undefined") lucide.createIcons();
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
      list.innerHTML = ""; // Clear previous content

      if (snapshot.empty) {
        list.innerHTML = `<div class="no-results">No personal chats found.</div>`;
        return;
      }

      const userCache = {};

      const promises = snapshot.docs.map(async threadDoc => {
        const thread = threadDoc.data();
        const otherUid = thread.participants.find(uid => uid !== currentUser.uid);
        if (!otherUid) return null;

        // Pull user (cached)
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

        const avatar =
          user.avatarBase64 ||
          user.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

        // Raw name (no escaping yet; needed for badge + header)
        const rawName = user.username || user.name || "Friend";
        const nameHtml = usernameWithBadge(otherUid, rawName); // helper escapes internally

        // Last message preview
        let lastMsg = "[No messages]";
        if (typeof thread.lastMessage === "string") {
          lastMsg = thread.lastMessage;
        } else if (thread.lastMessage && typeof thread.lastMessage === "object") {
          lastMsg = thread.lastMessage.text || "[No messages]";
        }

        const updatedTime = thread.updatedAt?.toDate?.()
          ? timeSince(thread.updatedAt.toDate())
          : "";

        const unread = thread.unread?.[currentUser.uid] || 0;

        const card = document.createElement("div");
        card.className = "chat-card personal-chat";
        // Pass rawName so openThread can re-render w/ badge
        card.onclick = () => openThread(otherUid, rawName);

        card.innerHTML = `
          <img class="friend-avatar" src="${avatar}" />
          <div class="details">
            <div class="name-row">
              <span class="name">${nameHtml}</span>
              <span class="time">${updatedTime}</span>
            </div>
            <div class="last-message">${escapeHtml(lastMsg)}</div>
          </div>
          ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
        `;
        return card;
      });

      const cards = await Promise.all(promises);
      cards.filter(Boolean).forEach(card => list.appendChild(card));

      // Render Lucide icons (verified badge)
      if (typeof lucide !== "undefined") lucide.createIcons();
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
    const nameEl = chat.querySelector(".name");
    const lastMsgEl = chat.querySelector(".last-message");

    // Extract plain text (ignore badge icons)
    const name = nameEl ? nameEl.textContent.toLowerCase() : "";
    const lastMsg = lastMsgEl ? lastMsgEl.textContent.toLowerCase() : "";

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
  } else if (noResult) {
    noResult.remove();
  }
}

// ===== Load Messages in Group =====
function loadGroupMessages(groupId) {
  const box = document.getElementById("groupMessages");
  if (!groupId || !currentUser || !box) return;

  box.innerHTML = "";

  // Live listener
  db.collection("groups").doc(groupId).collection("messages")
    .orderBy("timestamp", "asc")
    .onSnapshot(async snapshot => {
      box.innerHTML = "";
      const frag = document.createDocumentFragment();

      if (snapshot.empty) {
        box.innerHTML = `<div class="no-results">No messages yet.</div>`;
        return;
      }

      /* -------- Normalize + collect sender ids -------- */
      const msgs = snapshot.docs.map(d => {
        const m = d.data();
        m.id = d.id;
        m.from = m.senderId; // unify for grouping
        return m;
      });

      // Remove messages deleted for current user
      const visible = msgs.filter(m => !(m.deletedFor?.[currentUser.uid]));

      // Grouping (5 min window)
      computeGroupClassesGroup(visible);

      // Unique sender cache
      const uidSet = new Set();
      visible.forEach(m => uidSet.add(m.senderId));
      const senderCache = {};

      // Fetch sender docs in parallel
      await Promise.all(
        [...uidSet].map(async uid => {
          try {
            const uDoc = await db.collection("users").doc(uid).get();
            if (uDoc.exists) senderCache[uid] = uDoc.data();
          } catch (_) {}
        })
      );

      /* -------- Build DOM -------- */
      for (const msg of visible) {
        const isSelf = msg.senderId === currentUser.uid;

        /* --- Decrypt --- */
        let decrypted;
        let isDeleted = false;
        try {
          if (msg.text === "") {
            isDeleted = true;
            decrypted = "";
          } else if (typeof msg.text === "string") {
            decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey")
              .toString(CryptoJS.enc.Utf8) || "[Encrypted]";
          } else {
            decrypted = "[Invalid]";
          }
        } catch {
          decrypted = "[Decryption error]";
        }

        /* --- Reply strip --- */
        const replyHtml = (!isDeleted && msg.replyTo?.text)
          ? `<div class="reply-to clamp-text" onclick="scrollToMessage('${msg.replyTo.msgId || msg.replyTo.id || ""}')">↪ ${escapeHtml(msg.replyTo.text || "").slice(0,120)}</div>`
          : "";

        /* --- Sender data --- */
        const senderData = senderCache[msg.senderId] || {};
        const senderNameRaw = (msg.senderName || senderData.username || senderData.name || "User").replace(/<[^>]*>/g,"");
        const senderNameHtml = usernameWithBadge(msg.senderId, senderNameRaw);

        /* --- Show author row --- */
        const showAuthorRow = msg._grp === "grp-start" || msg._grp === "grp-single";
        const authorLabel = showAuthorRow
          ? `<div class="msg-author">${senderNameHtml}</div>`
          : "";

        /* --- Meta (time only) --- */
        const metaHtml = `
          <span class="msg-meta-inline" data-status="other">
            ${msg.timestamp?.toDate ? `<span class="msg-time">${timeSince(msg.timestamp.toDate())}</span>` : ""}
          </span>
        `;

        /* --- Body --- */
        const bodyHtml = isDeleted
          ? `<i data-lucide="trash-2"></i> <span class="deleted-msg-label">Message deleted</span>`
          : linkifyText(escapeHtml(decrypted));

        /* --- Avatar (only grp-start / grp-single) --- */
        const showPfp = showAuthorRow;
        let avatarSrc = "default-avatar.png";
        if (senderData.avatarBase64) avatarSrc = senderData.avatarBase64;
        else if (senderData.photoURL) avatarSrc = senderData.photoURL;
        else avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.username || senderNameRaw || "User")}`;

        /* --- Wrapper --- */
        const wrapper = document.createElement("div");
        wrapper.className = `message-bubble-wrapper ${isSelf ? "right from-self" : "left from-other"} ${msg._grp}`;
        if (showPfp) wrapper.classList.add("has-pfp");

        // Corrected camelCase margin properties
        if (!showPfp && !isSelf) {
          wrapper.style.marginLeft = `calc(var(--pfp-size) + var(--pfp-gap))`;
        }
        if (!showPfp && isSelf) {
          wrapper.style.marginRight = `calc(var(--pfp-size) + var(--pfp-gap))`;
        }

        wrapper.innerHTML = `
          ${showPfp ? `<img class="bubble-pfp" src="${avatarSrc}" alt="${escapeHtml(senderNameRaw)}" onclick="viewUserProfile('${msg.senderId}')">` : ""}
          <div class="message-bubble ${isSelf ? "right" : "left"} ${msg._grp}" data-msg-id="${msg.id}" data-time="${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}">
            ${authorLabel}
            ${replyHtml}
            <div class="msg-inner-wrapper ${isDeleted ? "msg-deleted" : ""}">
              <div class="msg-text-wrapper">
                <span class="msg-text">${bodyHtml}</span>
                ${!isDeleted ? metaHtml : ""}
              </div>
            </div>
          </div>
        `;

        /* --- Gestures / context menu --- */
        const bubbleEl = wrapper.querySelector(".message-bubble");
        if (bubbleEl) {
          bubbleEl.addEventListener("touchstart", handleTouchStart, { passive: true });
          bubbleEl.addEventListener("touchmove", handleTouchMove, { passive: true });
          bubbleEl.addEventListener("touchend", ev => handleSwipeToReply(ev, msg, decrypted), { passive: true });
          bubbleEl.addEventListener("contextmenu", e => {
            e.preventDefault();
            handleLongPressMenu(msg, decrypted, isSelf);
          });
        }

        frag.appendChild(wrapper);

        /* --- Mark as seen --- */
        if (!msg.seenBy?.includes(currentUser.uid)) {
          db.collection("groups").doc(groupId).collection("messages")
            .doc(msg.id)
            .update({
              seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            }).catch(() => {});
        }
      }

      box.appendChild(frag);

      // Scroll to bottom after render
      box.scrollTop = box.scrollHeight;

      // Refresh Lucide icons
      if (typeof lucide !== "undefined") lucide.createIcons();
    }, err => {
      console.error("❌ Group message load failed:", err.message || err);
    });
}

/* ---------------------------------------------------------
 * Grouping helper for group chat (senderId-based)
 * gapMs default 5m
 * sets ._grp on each message: grp-start | grp-mid | grp-end | grp-single
 * --------------------------------------------------------- */
function computeGroupClassesGroup(msgs, gapMs = 5 * 60 * 1000) {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const ts = m.timestamp?.toMillis?.() ?? 0;
    const prev = msgs[i - 1];
    const next = msgs[i + 1];

    const prevOk = prev && prev.senderId === m.senderId && ts - (prev.timestamp?.toMillis?.() ?? 0) <= gapMs;
    const nextOk = next && next.senderId === m.senderId && (next.timestamp?.toMillis?.() ?? 0) - ts <= gapMs;

    if (prevOk && nextOk) m._grp = "grp-mid";
    else if (prevOk && !nextOk) m._grp = "grp-end";
    else if (!prevOk && nextOk) m._grp = "grp-start";
    else m._grp = "grp-single";
  }
  return msgs;
}

// === Send Room Message (Group Chat) ===
function sendRoomMessage() {
  const input = document.getElementById("roomInput");
  const text = input?.value.trim();
  if (!text || !currentRoom || !currentUser) return;

  // Use proper username from user data (with badge if moneythepro)
  const fromName = usernameWithBadge(currentUser.uid, document.getElementById("usernameDisplay")?.textContent || "User");

  // Encrypt text
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  // Message object
  const message = {
    text: encryptedText,
    senderId: currentUser.uid,
    senderName: fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid]
  };

  // Reply feature
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

    // Update group metadata
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

    // Scroll to bottom
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
                    avatar: senderData.avatarBase64 || senderData.photoURL || 
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.username || "User")}`
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

          // 🏷️ Message type with badge
          const typeText =
            data.type === "friend"
              ? `👤 Friend request from @${usernameWithBadge(fromUID, senderName)}`
              : data.type === "group"
              ? `📣 Group invite: ${escapeHtml(data.groupName || "Unnamed Group")}`
              : "📩 Notification";

          // 💌 Create card
          const card = document.createElement("div");
          card.className = "inbox-card";
          card.innerHTML = `
            <img src="${avatarURL}" alt="Avatar" />
            <div class="inbox-meta">
              <div class="inbox-title">${typeText}</div>
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

        // Render Lucide icons (for badge-check)
        if (typeof lucide !== "undefined") lucide.createIcons();

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
  const uid = data.fromUID || "";  
  const name = usernameWithBadge(uid, data.name || "Unknown");
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
        <button onclick="acceptInbox('${data.id}', '${data.type}', '${uid}')">✔</button>
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

  db.collection("users")
    .doc(currentUser.uid)
    .collection("friends")
    .onSnapshot(async (snapshot) => {
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
          const avatar =
            user.avatarBase64 ||
            user.photoURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.username || "User"
            )}`;
          const isOnline = user.status === "online";

          const displayName = usernameWithBadge(friendId, user.username || "User");

          const card = document.createElement("div");
          card.className = "friend-card";
          card.onclick = () => viewUserProfile(friendId);

          card.innerHTML = `
            <img src="${avatar}" alt="Avatar" />
            <div class="friend-info">
              <div class="name">${displayName}</div>
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

      // Refresh Lucide icons (for badge-check, etc.)
      if (typeof lucide !== "undefined") lucide.createIcons();
    }, (err) => {
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
async function loadGroupInfo(groupId) {
  if (!groupId) return;

  const ownerLabel  = document.getElementById("groupOwner");
  const adminsLabel = document.getElementById("groupAdmins");
  const memberList  = document.getElementById("groupMembers");
  if (!ownerLabel || !adminsLabel || !memberList) return;

  // Reset UI
  ownerLabel.textContent  = "Owner: ...";
  adminsLabel.textContent = "Admins: ...";
  memberList.innerHTML    = `<div class="loading">Loading members...</div>`;

  try {
    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (!groupDoc.exists) {
      ownerLabel.textContent  = "Owner: Unknown";
      adminsLabel.textContent = "Admins: Unknown";
      memberList.innerHTML    = `<div class="error">Group not found.</div>`;
      return;
    }

    const data      = groupDoc.data();
    const admins    = Array.isArray(data.admins) ? data.admins : [];
    const members   = Array.isArray(data.members) ? data.members : [];
    const ownerUid  = data.owner || data.createdBy || null;

    /* ---------- Fetch all needed users in one go ---------- */
    const needUids = new Set([...members, ...admins, ownerUid].filter(Boolean));
    const userMap  = {}; // uid -> { username, name, avatar }

    if (needUids.size) {
      const promises = [];
      needUids.forEach(uid => {
        promises.push(
          db.collection("users").doc(uid).get().then(uDoc => {
            if (uDoc.exists) {
              const udata = uDoc.data();
              userMap[uid] = udata;
            } else {
              userMap[uid] = null; // preserve key
            }
          }).catch(() => { userMap[uid] = null; })
        );
      });
      await Promise.all(promises);
    }

    const getDisplayName = uid => {
      const u = userMap[uid];
      return u?.username || u?.name || uid || "User";
    };

    /* ---------- Owner label ---------- */
    if (ownerUid) {
      ownerLabel.innerHTML = "Owner: " + usernameWithBadge(ownerUid, getDisplayName(ownerUid));
    } else {
      ownerLabel.textContent = "Owner: Unknown";
    }

    /* ---------- Admins label ---------- */
    if (admins.length) {
      const adminHtml = admins.map(a => usernameWithBadge(a, getDisplayName(a))).join(", ");
      adminsLabel.innerHTML = "Admins: " + adminHtml;
    } else {
      adminsLabel.textContent = "Admins: None";
    }

    /* ---------- Member list ---------- */
    memberList.innerHTML = "";
    if (!members.length) {
      memberList.innerHTML = `<div class="no-results">No members.</div>`;
    } else {
      members.forEach(uid => {
        const name    = getDisplayName(uid);
        const isAdmin = admins.includes(uid);
        const isOwner = uid === ownerUid;

        const div = document.createElement("div");
        div.className = "member-entry";
        div.innerHTML = `
          <span>${usernameWithBadge(uid, name)}</span>
          ${isOwner ? `<span class="badge owner-badge">Owner</span>` : ""}
          ${isAdmin && !isOwner ? `<span class="badge admin-badge">Admin</span>` : ""}
        `;
        memberList.appendChild(div);
      });
    }

    // Re-draw Lucide icons (badge-check, etc.)
    if (typeof lucide !== "undefined") lucide.createIcons();

  } catch (err) {
    console.error("❌ Group info fetch failed:", err.message || err);
    ownerLabel.textContent  = "Owner: Error";
    adminsLabel.textContent = "Admins: Error";
    memberList.innerHTML    = `<div class="error">Failed to load group info.</div>`;
  }
}

function setupEmojiButton() {
  const emojiBtn = document.getElementById("emojiToggleBtn");
  const input = document.getElementById("threadInput");
  if (!emojiBtn || !input) return;

  let emojiPicker;
  let pickerOpen = false;

  emojiBtn.addEventListener("click", async () => {
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

      emojiPicker.on("emoji", selection => {
        const chosenEmoji = selection.emoji;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;

        input.value = text.slice(0, start) + chosenEmoji + text.slice(end);
        input.selectionStart = input.selectionEnd = start + chosenEmoji.length;

        autoResizeInput(input);
        input.focus();
      });
    }

    // Toggle emoji picker
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

// ===== DM Utilities =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

// ===== DM: Open Thread Chat =====
/* =========================================================
 * Enhanced openThread
 * ======================================================= */
let handleSendClick = null;          // will assign below
let replyingTo = null;
let touchStartX = 0;
let touchMoveX = 0;
let isSendingThread = false;

/* Track touches for swipe-to-reply */
function handleTouchStart(e) {
  if (!e.touches || !e.touches[0]) return;
  touchStartX = e.touches[0].clientX;
  touchMoveX = touchStartX;
}
function handleTouchMove(e) {
  if (!e.touches || !e.touches[0]) return;
  touchMoveX = e.touches[0].clientX;
}

/* Swipe right -> reply */
function handleSwipeToReply(ev, msg, decrypted) {
  const deltaX = touchMoveX - touchStartX;
  if (deltaX > 35 && deltaX < 150) {
    const wrapper = ev.target.closest(".message-bubble-wrapper");
    if (!wrapper) return;

    wrapper.classList.add("swiped");
    setTimeout(() => wrapper.classList.remove("swiped"), 500);

    replyingTo = { msgId: msg.id, text: decrypted };

    const replyBox = document.getElementById("replyPreview");
    if (replyBox) {
      replyBox.innerHTML = `
        <div class="reply-box-inner" onclick="scrollToReplyMessage('${msg.id}')">
          <div class="reply-info">
            <div class="reply-text clamp-text">${escapeHtml(decrypted)}</div>
          </div>
          <button class="reply-close" onclick="cancelReply()" aria-label="Cancel reply">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
      replyBox.style.display = "flex";
      if (typeof lucide !== "undefined") lucide.createIcons();
    }

    const input = document.getElementById("threadInput");
    if (input) requestAnimationFrame(() => input.focus({ preventScroll: true }));
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

/* =========================================================
 * Link helpers
 * ======================================================= */
function linkifyText(text) {
  const urlRegex = /((https?:\/\/)[^\s]+)/gi;
  return text.replace(urlRegex, (url) => {
    let displayUrl = url;
    if (displayUrl.length > 45) displayUrl = displayUrl.slice(0, 42) + "...";
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${displayUrl}</a>`;
  });
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

/* =========================================================
 * Send message in thread
 * ======================================================= */
async function sendThreadMessage() {
  if (isSendingThread) return;
  isSendingThread = true;

  const input = document.getElementById("threadInput");
  if (!input || !currentThreadUser) {
    isSendingThread = false;
    return;
  }

  const rawText = input.value;
  const text = rawText.trim();
  if (!text) {
    isSendingThread = false;
    return;
  }

  input.value = ""; // clear to avoid dup send
  cancelReply();
  replyingTo = null;

  const fromName = document.getElementById("usernameDisplay")?.textContent || "User";
  const toNameElem = document.getElementById("threadWithName");
  const toName = toNameElem ? toNameElem.textContent : "Friend";

  const threadIdStr = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(threadIdStr);

  // Encrypt
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const message = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    seenBy: [currentUser.uid]
  };

  // Reply
  if (replyingTo?.msgId && replyingTo?.text?.trim()) {
    message.replyTo = {
      msgId: replyingTo.msgId,
      text: replyingTo.text
    };
  }

// Link preview (best effort, one)
  const urlMatch = rawText.match(/https?:\/\/[^\s]+/);
  if (urlMatch && urlMatch[0]) {
    try {
      const preview = await fetchLinkPreview(urlMatch[0]);
      if (preview?.title) {
        message.preview = {
          title: preview.title,
          image: preview.image || "",
          url: preview.url || urlMatch[0]
        };
      }
    } catch (err) {
      console.warn("⚠️ Link preview fetch failed:", err);
    }
  }

  try {
    await threadRef.collection("messages").add(message);

    // Update thread metadata
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

    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    setTimeout(() => scrollToBottomThread(true), 100);
  } catch (err) {
    console.error("❌ Send failed:", err.message || err);
    alert("❌ Failed to send message.");
  } finally {
    isSendingThread = false;
  }
}

/* Bind globals used in openThread */
if (!handleSendClick) {
  handleSendClick = () => sendThreadMessage();
}
if (typeof handleThreadKey !== "function") {
  window.handleThreadKey = function handleThreadKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendThreadMessage();
    }
  };
}

/* =========================================================
 * Helpers for Enhanced Bubble Rendering
 * ======================================================= */

/* Emoji-only detector */
function isEmojiOnlyText(str = "") {
  if (typeof str !== "string") return false;
  const stripped = str.replace(/\s+/g, "");
  if (!stripped) return false;
  if (/[A-Za-z0-9]/.test(stripped)) return false;
  return /[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(stripped);
}

/* Compute grp-* flags */
function computeGroupClasses(msgs, gapMs = 5 * 60 * 1000) {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const ts = m.timestamp?.toMillis?.() ?? 0;
    const prev = msgs[i - 1];
    const next = msgs[i + 1];

    const prevOk = prev && prev.from === m.from && ts - (prev.timestamp?.toMillis?.() ?? 0) <= gapMs;
    const nextOk = next && next.from === m.from && (next.timestamp?.toMillis?.() ?? 0) - ts <= gapMs;

    if (prevOk && nextOk) m._grp = "grp-mid";
    else if (prevOk && !nextOk) m._grp = "grp-end";
    else if (!prevOk && nextOk) m._grp = "grp-start";
    else m._grp = "grp-single";
  }
  return msgs;
}

/* ---------------------------------------------------------
 * Global lightweight user cache (uid -> {avatar, username})
 * --------------------------------------------------------- */
const USER_CACHE = {};

/* ---------------------------------------------------------
 * Self/other meta (unchanged except minor formatting)
 * --------------------------------------------------------- */
function buildTickMeta(msg, otherUid) {
  let status = "sent";
  let tickClass = "tick-sent";
  let icon = "check"; // single

  if (msg.deliveredAt) {
    status = "delivered";
    tickClass = "tick-sent";
    icon = "check-check";
  }
  if (Array.isArray(msg.seenBy) && msg.seenBy.includes(otherUid)) {
    status = "seen";
    tickClass = "tick-seen";
    icon = "check-check";
  }

  const timeHtml = msg.timestamp?.toDate
    ? `<span class="msg-time">${timeSince(msg.timestamp.toDate())}</span>`
    : "";

  return `
    <span class="msg-meta-inline" data-status="${status}">
      ${timeHtml}
      <i data-lucide="${icon}" class="tick-icon ${tickClass}"></i>
    </span>
  `;
}

function buildOtherMeta(msg) {
  return `
    <span class="msg-meta-inline" data-status="other">
      ${msg.timestamp?.toDate ? `<span class="msg-time">${timeSince(msg.timestamp.toDate())}</span>` : ""}
    </span>
  `;
}

/* ---------------------------------------------------------
 * Reply strip
 * --------------------------------------------------------- */
function buildReplyStrip(msg) {
  if (!msg.replyTo) return "";
  const replyId = msg.replyTo.msgId || msg.replyTo.id || "";
  const rText = escapeHtml(msg.replyTo.text || "");
  return `<div class="reply-to clamp-text" onclick="scrollToMessage('${replyId}')">${rText}</div>`;
}

/* ---------------------------------------------------------
 * Link preview markup
 * --------------------------------------------------------- */
function buildLinkPreviewHTML(preview, url) {
  if (!preview && !url) return "";
  const img = preview?.image ? `<img src="${preview.image}" class="preview-img">` : "";
  const title = escapeHtml(preview?.title || "");
  const showUrl = escapeHtml(preview?.url || url || "");
  if (!img && !title && !showUrl) return "";
  return `
    <div class="link-preview">
      ${img}
      <div class="preview-info">
        <div class="preview-title">${title}</div>
        <div class="preview-url">${showUrl}</div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------
 * Decrypt & interpret msg text
 * --------------------------------------------------------- */
function decryptMsgText(msg) {
  let decrypted = "";
  let isDeleted = false;

  if (typeof msg.text === "string") {
    if (msg.text === "") {
      isDeleted = true;
      decrypted = "";
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

  const deletedHtml =
    '<i data-lucide="trash-2"></i> <span class="deleted-msg-label">Message deleted</span>';

  if (isDeleted) {
    return { text: "", isDeleted: true, deletedHtml };
  }
  return { text: decrypted, isDeleted: false, deletedHtml };
}


/* ---------------------------------------------------------
 * Lightweight profile cache (uid -> {username, avatar})
 * --------------------------------------------------------- */
const _profileCache = new Map();

async function getUserProfileCached(uid) {
  if (!uid) {
    return {
      username: "User",
      avatar: `https://ui-avatars.com/api/?name=User`
    };
  }
  if (_profileCache.has(uid)) return _profileCache.get(uid);

  try {
    const snap = await db.collection("users").doc(uid).get();
    if (snap.exists) {
      const u = snap.data() || {};
      const prof = {
        username: u.username || u.name || "User",
        avatar:
          u.avatarBase64 ||
          u.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || u.name || "User")}`
      };
      _profileCache.set(uid, prof);
      return prof;
    }
  } catch (err) {
    console.warn("getUserProfileCached error:", err);
  }

  // fallback
  const fallback = {
    username: "User",
    avatar: `https://ui-avatars.com/api/?name=User`
  };
  _profileCache.set(uid, fallback);
  return fallback;
}

/* ---------------------------------------------------------
 * Render snapshot -> DOM (Direct Message Thread)
 * Adds slim circular PFP at grp-start/single; indents followups.
 * --------------------------------------------------------- */
async function renderThreadMessagesToArea({ area, msgs, otherUid, threadIdStr, isInitial }) {
  if (!area) return;

  const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
  computeGroupClasses(msgs);

  const selfProfile  = await getUserProfileCached(currentUser.uid);
  const otherProfile = await getUserProfileCached(otherUid);

  let distFromBottom;
  if (isInitial) {
    area.innerHTML = "";
  } else {
    distFromBottom = area.scrollHeight - area.scrollTop;
    area.innerHTML = "";
  }

  const frag = document.createDocumentFragment();

  for (const msg of msgs) {
    const isSelf = msg.from === currentUser.uid;
    const { text: displayText, isDeleted, deletedHtml } = decryptMsgText(msg);
    const emojiOnly = isEmojiOnlyText(displayText);

    const showPfp = msg._grp === "grp-start" || msg._grp === "grp-single";
    const prof    = isSelf ? selfProfile : otherProfile;
    const pfpHtml = showPfp
      ? `<img class="bubble-pfp ${isSelf ? "pfp-self" : "pfp-other"}" src="${prof.avatar}" alt="${escapeHtml(prof.username)}" onclick="viewUserProfile('${isSelf ? currentUser.uid : otherUid}')">`
      : "";

    const showAuthorRow = !isSelf && showPfp;
    const authorHtml = showAuthorRow
      ? `<div class="msg-author">${usernameWithBadge(otherUid, prof.username)}</div>`
      : "";

    const replyBox = !isDeleted ? buildReplyStrip(msg) : "";

    const meta = isSelf && !isDeleted
      ? buildTickMeta(msg, otherUid)
      : buildOtherMeta(msg);

    const textHtml  = escapeHtml(displayText);
    const shortText = textHtml.slice(0, 500);
    const hasLong   = textHtml.length > 500;
    const content   = hasLong
      ? `${shortText}<span class="show-more" onclick="this.parentElement.innerHTML=this.parentElement.dataset.full">... Show more</span>`
      : linkifyText(textHtml);

    let linkPreviewHTML = "";
    if (msg.preview) {
      linkPreviewHTML = buildLinkPreviewHTML(msg.preview, msg.preview.url);
    } else if (!isDeleted) {
      const url = extractFirstURL(displayText);
      if (url) {
        try {
          const preview = await fetchLinkPreview(url);
          if (preview?.title || preview?.image) {
            linkPreviewHTML = buildLinkPreviewHTML(preview, url);
          }
        } catch (_) {}
      }
    }

    const wrapper = document.createElement("div");
    wrapper.className = `message-bubble-wrapper fade-in ${isSelf ? "right from-self" : "left from-other"} ${msg._grp || "grp-single"}`;
    if (showPfp) wrapper.classList.add("has-pfp");

    // indent follow-up bubbles that *don't* show a pfp
    if (!showPfp) {
      const indent = "calc(var(--pfp-size) + var(--pfp-gap))";
      if (isSelf) wrapper.style.marginRight = indent;
      else wrapper.style.marginLeft = indent;
    }

    wrapper.innerHTML = `
      ${pfpHtml}
      <div class="message-bubble ${isSelf ? "right" : "left"} ${emojiOnly ? "emoji-only" : ""} ${msg._grp || ""}"
           data-msg-id="${msg.id}"
           data-time="${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}">
        ${authorHtml}
        ${replyBox}
        <div class="msg-inner-wrapper ${isDeleted ? "msg-deleted" : ""}">
          <div class="msg-text-wrapper">
            <span class="msg-text clamp-text" data-full="${textHtml}" data-short="${shortText}">
              ${isDeleted ? deletedHtml : content}
            </span>
            ${!isDeleted ? meta : ""}
          </div>
          ${linkPreviewHTML}
        </div>
      </div>
    `;

    if (!isDeleted) {
      const bubbleEl = wrapper.querySelector(".message-bubble");
      if (bubbleEl) {
        bubbleEl.addEventListener("touchstart", handleTouchStart);
        bubbleEl.addEventListener("touchmove", handleTouchMove);
        bubbleEl.addEventListener("touchend", ev => handleSwipeToReply(ev, msg, displayText));
        bubbleEl.addEventListener("contextmenu", e => {
          e.preventDefault();
          handleLongPressMenu(msg, displayText, isSelf);
        });
      }
    }

    frag.appendChild(wrapper);

    // seen
    if (!Array.isArray(msg.seenBy) || !msg.seenBy.includes(currentUser.uid)) {
      db.collection("threads").doc(threadIdStr).collection("messages").doc(msg.id)
        .update({ seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) })
        .catch(() => {});
    }
  }

  area.appendChild(frag);

  if (typeof lucide !== "undefined") lucide.createIcons();

  if (isInitial) {
    // handled elsewhere
  } else if (isNearBottom) {
    setTimeout(() => scrollToBottomThread(true), 40);
  } else if (typeof distFromBottom === "number") {
    setTimeout(() => { area.scrollTop = area.scrollHeight - distFromBottom; }, 0);
  }
}


async function openThread(uid, name) {
  if (!currentUser || !uid) return;

  try {
    // 1. Must be friends
    const friendDoc = await db.collection("users").doc(currentUser.uid)
      .collection("friends").doc(uid).get();
    if (!friendDoc.exists) {
      alert("⚠️ You must be friends to start a chat.");
      return;
    }

    // 2. Switch view
    switchTab("threadView");

    // 3. Bind input + send + emoji after paint
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
      if (typeof setupEmojiButton === "function") setupEmojiButton();
    }, 200);

    // 4. Header name with badge
    const headerNameEl = document.getElementById("threadWithName");
    if (headerNameEl) {
      const displayName = typeof name === "string"
        ? name
        : name?.username || "Chat";
      headerNameEl.innerHTML = usernameWithBadge(uid, displayName);
    }

    // Hide options menu
    const opt = document.getElementById("chatOptionsMenu");
    if (opt) opt.style.display = "none";

    // 5. Context
    currentThreadUser = uid;
    currentRoom = null;

    const threadIdStr = threadId(currentUser.uid, uid);
    const area = document.getElementById("threadMessages");
    renderedMessageIds = new Set();

    if (area && lastThreadId !== threadIdStr) {
      area.innerHTML = "";
      lastThreadId = threadIdStr;
    }

    // 6. Restore scroll
    const savedScrollKey = "threadScroll_" + threadIdStr;
    const savedScroll = sessionStorage.getItem(savedScrollKey);
    if (area) {
      if (savedScroll !== null && !isNaN(savedScroll)) {
        setTimeout(() => { area.scrollTop = parseInt(savedScroll, 10); }, 300);
      } else {
        setTimeout(() => scrollToBottomThread(true), 200);
      }
      area.onscroll = () => sessionStorage.setItem(savedScrollKey, area.scrollTop);
    }

    // 7. Header avatar
    try {
      const friendUserDoc = await db.collection("users").doc(uid).get();
      if (friendUserDoc.exists) {
        const user = friendUserDoc.data();
        const headerImg = document.getElementById("chatProfilePic");
        if (headerImg) {
          headerImg.src =
            user.avatarBase64 ||
            user.photoURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.username || "User"
            )}`;
        }
      }
    } catch (e) {
      console.warn("⚠️ Could not load friend image:", e);
    }

    // 8. Clean old listeners
    if (typeof unsubscribeThread === "function") unsubscribeThread();
    if (typeof unsubscribeTyping === "function") unsubscribeTyping();

    // 9. Typing indicator
    listenToTyping(threadIdStr, "thread");

    // 10. Reset unread counter for self
    await db.collection("threads").doc(threadIdStr)
      .set({ unread: { [currentUser.uid]: 0 } }, { merge: true });

    // 11. Live status
    db.collection("users").doc(uid).onSnapshot((doc) => {
      const data = doc.data();
      const status = document.getElementById("chatStatus");
      if (!status || !data) return;
      if (data.typingFor === currentUser.uid) status.textContent = "Typing...";
      else if (data.status === "online") status.textContent = "Online";
      else if (data.lastSeen?.toDate) status.textContent =
        "Last seen " + timeSince(data.lastSeen.toDate());
      else status.textContent = "Offline";
    });

    // 12. Subscribe to messages
    unsubscribeThread = db.collection("threads").doc(threadIdStr)
      .collection("messages").orderBy("timestamp")
      .onSnapshot(async (snapshot) => {
        if (!area) return;

        const msgs = snapshot.docs.map((d) => {
          const m = d.data();
          m.id = d.id;
          return m;
        });

        const isInitial = area.childElementCount === 0 || renderedMessageIds.size === 0;
        await renderThreadMessagesToArea({
          area,
          msgs,
          otherUid: uid,
          threadIdStr,
          isInitial,
        });

        renderedMessageIds.clear();
        msgs.forEach((m) => renderedMessageIds.add(m.id));
      });

  } catch (err) {
    console.error("❌ openThread error:", err);
    alert("❌ Could not open chat: " + (err.message || JSON.stringify(err)));
  }
}


/* =========================================================
 * Legacy renderMessage() (fallback if other code still calls it)
 * Returns markup string (NOT auto-binding events).
 * Use only where quick render needed; recommended to migrate
 * to renderThreadMessagesToArea().
 * ======================================================= */
function renderMessage(msg, isOwn) {
  const { text, isDeleted, deletedHtml } = decryptMsgText(msg);
  const escaped = escapeHtml(text);

  // Determine display name (fallback if missing)
  const authorName = escapeHtml(msg.fromName || "User");

  // Add author row with verified tick if it's moneythepro
  const authorHtml = `<div class="msg-author">${usernameWithBadge(msg.from, authorName)}</div>`;

  // Reply section (if exists)
  const replyHtml = msg.replyTo && !isDeleted
    ? `<div class="reply-to">${escapeHtml(msg.replyTo.text || "")}</div>`
    : "";

  // Meta info (ticks/time)
  const meta = isOwn && !isDeleted
    ? buildTickMeta(msg, currentThreadUser)  // correct other uid
    : buildOtherMeta(msg);

  // Link preview (if exists)
  const linkPreviewHtml = msg.preview && !isDeleted
    ? buildLinkPreviewHTML(msg.preview, msg.preview.url)
    : "";

  // Final message text
  const bodyHtml = isDeleted ? deletedHtml : linkifyText(escaped);
  const emojiOnly = isEmojiOnlyText(text) ? "emoji-only" : "";

  return `
    <div class="message-bubble-wrapper ${isOwn ? 'right from-self' : 'left from-other'} grp-single">
      <div class="message-bubble ${isOwn ? 'right' : 'left'} ${emojiOnly}" data-msg-id="${msg.id}">
        ${!isOwn ? authorHtml : ""}  <!-- Show author only for other users -->
        ${replyHtml}
        <div class="msg-inner-wrapper ${isDeleted ? "msg-deleted" : ""}">
          <div class="msg-text-wrapper">
            <span class="msg-text">${bodyHtml}</span>
            ${!isDeleted ? meta : ""}
          </div>
          ${linkPreviewHtml}
        </div>
      </div>
    </div>
  `;
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
function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom) return;

  // Tear down prior listener
  if (unsubscribeMessages) unsubscribeMessages();

  const groupMsgRef = db.collection("groups").doc(currentRoom).collection("messages");

  unsubscribeMessages = groupMsgRef
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      // Scroll state before rebuild
      const prevScrollTop = messagesDiv.scrollTop;
      const isNearBottom =
        messagesDiv.scrollHeight - prevScrollTop - messagesDiv.clientHeight < 100;

      messagesDiv.innerHTML = "";
      const frag = document.createDocumentFragment();
      const renderedIds = new Set();

      snapshot.forEach(doc => {
        const msg = doc.data();
        const msgId = doc.id;
        if (!msg || renderedIds.has(msgId)) return;
        renderedIds.add(msgId);

        // Skip if deleted for this user
        if (msg.deletedFor?.[currentUser.uid]) return;

        const isSelf = msg.senderId === currentUser.uid;

        /* --- Decrypt --- */
        let decrypted = "";
        try {
          decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey")
            .toString(CryptoJS.enc.Utf8) || "[Encrypted]";
        } catch (e) {
          console.error("Decryption failed:", e);
          decrypted = "[Decryption error]";
        }

        /* --- Clean sender name (strip stored markup) --- */
        const cleanSenderName = (msg.senderName || "User").replace(/<[^>]*>/g, "");

        /* --- Sender label (show for everyone incl. self? change here) --- */
        const senderLabel = `<div class="msg-author">${usernameWithBadge(
          msg.senderId,
          cleanSenderName
        )}</div>`;

        /* --- Reply preview --- */
        const replyHtml = msg.replyTo?.text
          ? `<div class="reply-to clamp-text">↪ ${escapeHtml(msg.replyTo.text).slice(0, 120)}</div>`
          : "";

        /* --- Meta (time only in group) --- */
        const metaHtml = `
          <span class="msg-meta-inline" data-status="other">
            ${
              msg.timestamp?.toDate
                ? `<span class="msg-time">${timeSince(msg.timestamp.toDate())}</span>`
                : ""
            }
          </span>
        `;

        /* --- Body --- */
        const bodyHtml = linkifyText(escapeHtml(decrypted));

        /* --- Build DOM wrapper --- */
        const wrapper = document.createElement("div");
        wrapper.className = `message-bubble-wrapper ${
          isSelf ? "right from-self" : "left from-other"
        } grp-single`;

        wrapper.innerHTML = `
          <div class="message-bubble ${isSelf ? "right" : "left"}" data-msg-id="${msgId}">
            ${senderLabel}
            ${replyHtml}
            <div class="msg-inner-wrapper">
              <div class="msg-text-wrapper">
                <span class="msg-text">${bodyHtml}</span>
                ${metaHtml}
              </div>
            </div>
          </div>
        `;

        /* --- Gestures / context menu --- */
        const bubbleEl = wrapper.querySelector(".message-bubble");
        if (bubbleEl) {
          bubbleEl.addEventListener("touchstart", handleTouchStart, { passive: true });
          bubbleEl.addEventListener("touchmove", handleTouchMove, { passive: true });
          bubbleEl.addEventListener("touchend", ev => handleSwipeToReply(ev, msg, decrypted), {
            passive: true
          });
          bubbleEl.addEventListener("contextmenu", e => {
            e.preventDefault();
            handleLongPressMenu(msg, decrypted, isSelf);
          });
        }

        frag.appendChild(wrapper);

        /* --- Seen receipt --- */
        if (!Array.isArray(msg.seenBy) || !msg.seenBy.includes(currentUser.uid)) {
          groupMsgRef
            .doc(msgId)
            .update({
              seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            })
            .catch(() => {});
        }
      });

      messagesDiv.appendChild(frag);

      // Scroll restore
      if (isNearBottom) {
        requestAnimationFrame(() => {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
      } else {
        // preserve previous relative position (optional; else do nothing)
        // messagesDiv.scrollTop = prevScrollTop;
      }

      // Re-run Lucide for badge-check icons
      if (typeof lucide !== "undefined") lucide.createIcons();

      // If you still use magnet layout plugin:
      renderWithMagnetSupport?.("groupMessages");
    });
}

// ===== Search (Users + Groups) =====
function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

function runSearch() {
  const inputEl = document.getElementById("searchInput");
  if (!inputEl || !currentUser) return;

  const rawTerm = inputEl.value.trim();
  if (!rawTerm) return;

  const termLower = rawTerm.toLowerCase(); // for any client-side filtering if needed

  const userResults  = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  if (userResults)  userResults.innerHTML  = "";
  if (groupResults) groupResults.innerHTML = "";

  /* ---------------- USER SEARCH ---------------- */
  db.collection("users")
    // Use rawTerm for Firestore (case-sensitive prefix search)
    .where("username", ">=", rawTerm)
    .where("username", "<=", rawTerm + "\uf8ff")
    .get()
    .then(async snapshot => {
      if (!userResults) return;
      if (snapshot.empty) {
        userResults.innerHTML = `<div class="no-results">No users found.</div>`;
        return;
      }

      const friendChecks = [];

      snapshot.forEach(doc => {
        if (doc.id === currentUser.uid) return; // skip self

        const user = doc.data();
        const avatar = user.avatarBase64 || user.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

        const rawName = user.username || "unknown";
        const unameHtml = usernameWithBadge(doc.id, rawName);

        const card = document.createElement("div");
        card.className = "search-result";
        card.innerHTML = `
          <img src="${avatar}" class="search-avatar" />
          <div class="search-info">
            <div class="username">@${unameHtml}</div>
            <div class="bio">${escapeHtml(user.bio || "No bio")}</div>
          </div>
          <button id="friendBtn_${doc.id}">Add Friend</button>
        `;
        userResults.appendChild(card);

        // friend status check (async)
        const btn = card.querySelector("button");
        if (btn) {
          const p = db.collection("users").doc(currentUser.uid)
            .collection("friends").doc(doc.id).get()
            .then(friendDoc => {
              if (friendDoc.exists) {
                btn.textContent = "Friend";
                btn.disabled = true;
                btn.classList.add("disabled-btn");
              } else {
                btn.onclick = () => addFriend(doc.id);
              }
            })
            .catch(() => {/* ignore */});
          friendChecks.push(p);
        }
      });

      await Promise.all(friendChecks);
      if (typeof lucide !== "undefined") lucide.createIcons();
    });

  /* ---------------- GROUP SEARCH ---------------- */
  db.collection("groups")
    .where("name", ">=", rawTerm)
    .where("name", "<=", rawTerm + "\uf8ff")
    .get()
    .then(snapshot => {
      if (!groupResults) return;
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

      if (typeof lucide !== "undefined") lucide.createIcons();
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
    title.innerHTML = doc.exists
      ? usernameWithBadge(groupId, doc.data().name || "Group Chat")
      : "Group (Not Found)";
    if (typeof lucide !== "undefined") lucide.createIcons();
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
            avatar = user.avatarBase64 || user.photoURL ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
          }
        } catch (e) {
          console.warn("⚠️ Group sender avatar load failed:", e.message);
        }

        const decrypted = (() => {
          try {
            return CryptoJS.AES.decrypt(msg.text, "yourSecretKey")
              .toString(CryptoJS.enc.Utf8) || "[Encrypted]";
          } catch {
            return "[Decryption failed]";
          }
        })();

        bubble.innerHTML = `
          <div class="msg-avatar"><img src="${avatar}" /></div>
          <div class="msg-content">
            <div class="msg-text">
              <strong>${usernameWithBadge(msg.from, msg.fromName || "User")}</strong><br>
              ${escapeHtml(decrypted)}
            </div>
            <div class="message-time">${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}</div>
          </div>
        `;

        messageList.appendChild(bubble);
      }

      messageList.scrollTop = messageList.scrollHeight;
      renderWithMagnetSupport?.("roomMessages");
      if (typeof lucide !== "undefined") lucide.createIcons();
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

/* ---------------------------------------------------------
 * Dynamic Multi-Level Badge System with Cache + Legend
 * --------------------------------------------------------- */

// Cache expiration (1 hour)
const BADGE_CACHE_KEY = "verified_badges_cache";
const BADGE_CACHE_TIME = 3600000; // 1 hour in ms
let VERIFIED_BADGES = {
  developer: ["moneythepro"],
  gold: [],
  silver: [],
  bronze: []
};

// Load verified badge data (cached or from JSON)
async function loadVerifiedBadges() {
  const now = Date.now();
  try {
    // 1. Check cache
    const cached = localStorage.getItem(BADGE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (now - parsed.timestamp < BADGE_CACHE_TIME) {
        VERIFIED_BADGES = parsed.data;
        console.log("Badges loaded from cache:", JSON.stringify(VERIFIED_BADGES, null, 2));
        decorateUsernamesWithBadges();
        return;
      }
    }

    // 2. Fetch from verified.json (with cache-busting)
    const res = await fetch("./verified.json?cb=" + Date.now());
    if (!res.ok) throw new Error("Failed to fetch verified.json");
    const data = await res.json();

    // 3. Normalize data
    VERIFIED_BADGES = {
      developer: (data.developer || []).map(u => u.toLowerCase()),
      gold: (data.gold || []).map(u => u.toLowerCase()),
      silver: (data.silver || []).map(u => u.toLowerCase()),
      bronze: (data.bronze || []).map(u => u.toLowerCase())
    };

    // 4. Save to cache
    localStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({
      timestamp: now,
      data: VERIFIED_BADGES
    }));

    console.log("Verified badge list loaded:", JSON.stringify(VERIFIED_BADGES, null, 2));
    decorateUsernamesWithBadges(); // ensure update
  } catch (err) {
    console.warn("⚠️ Could not load verified.json:", err);
  }
}
document.addEventListener("DOMContentLoaded", loadVerifiedBadges);

/**
 * Get username with badge HTML
 */
function usernameWithBadge(uidOrName, maybeName) {
  let uid = uidOrName;
  let name = maybeName;

  if (typeof maybeName === "undefined") {
    name = uidOrName;
    uid = "";
  }

  const rawName = name || "User";
  const safe = escapeHtml(rawName);
  const lowerName = rawName.toLowerCase();
  const lowerUid = (uid || "").toLowerCase();

  const badgeType = getBadgeLevel(lowerName, lowerUid);
  if (!badgeType) return safe;

  return `${safe} ${getBadgeIcon(badgeType)}`;
}

/**
 * Determine badge level
 */
function getBadgeLevel(name, uid) {
  if (VERIFIED_BADGES.developer.includes(name) || VERIFIED_BADGES.developer.includes(uid))
    return "developer";
  if (VERIFIED_BADGES.gold.includes(name) || VERIFIED_BADGES.gold.includes(uid))
    return "gold";
  if (VERIFIED_BADGES.silver.includes(name) || VERIFIED_BADGES.silver.includes(uid))
    return "silver";
  if (VERIFIED_BADGES.bronze.includes(name) || VERIFIED_BADGES.bronze.includes(uid))
    return "bronze";
  return null;
}

/**
 * Return badge icon HTML based on level
 */
function getBadgeIcon(level) {
  switch (level) {
    case "developer":
      return `<i data-lucide="crown" class="dev-badge supreme" aria-label="Developer"></i>`;
    case "gold":
      return `<i data-lucide="badge-check" class="dev-badge gold" aria-label="Gold Verified"></i>`;
    case "silver":
      return `<i data-lucide="badge-check" class="dev-badge silver" aria-label="Silver Verified"></i>`;
    case "bronze":
      return `<i data-lucide="badge-check" class="dev-badge bronze" aria-label="Bronze Verified"></i>`;
    default:
      return "";
  }
}

/**
 * Automatically decorate usernames
 */
function decorateUsernamesWithBadges() {
  document.querySelectorAll(
    ".search-username, .username-display, .chat-username, .message-username"
  ).forEach(el => {
    const raw = el.textContent.replace("@", "").trim().toLowerCase();
    const badgeLevel = getBadgeLevel(raw, raw);
    if (badgeLevel && !el.querySelector(".dev-badge")) {
      el.insertAdjacentHTML("beforeend", getBadgeIcon(badgeLevel));
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  });
}

// Observe DOM for dynamic updates
const badgeObserver = new MutationObserver(() => {
  requestAnimationFrame(decorateUsernamesWithBadges);
});
badgeObserver.observe(document.body, { childList: true, subtree: true });

/* ---------------------------------------------------------
 * Badge Legend Modal
 * --------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("badgeLegendModal");
  const closeBtn = document.getElementById("closeBadgeLegend");

  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("dev-badge")) {
      modal?.classList.remove("hidden");
    }
  });

  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal?.classList.add("hidden");
  });
});

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


    window.addEventListener("resize", viewportChanged);
    if (window.visualViewport) {
      window. visualViewport.addEventListener("resize", viewportChanged);
      window.visualViewport.addEventListener("scroll", viewportChanged);
    }
  });
})();
