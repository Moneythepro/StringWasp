// ====== StringWasp App.js PocketBase Version ======

// 🔐 UUID Generator
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

// ===== PocketBase Init =====
const pb = new PocketBase("https://your-pocketbase-url");  // Change this
let currentUser = pb.authStore.model;

// ===== Invite Link via URL =====
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join");

// ===== Global State =====
let currentRoom = null;
let currentThreadUser = null;

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
  const menu = document.getElementById("chatOptionsMenu");
  if (menu) menu.classList.remove("show");
  document.activeElement?.blur?.();
}

// ===== Login/Register =====
async function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!email || !password) return alert("Please enter both email and password.");

  showLoading("Logging in...");
  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    currentUser = authData.record;
    console.log("✅ Logged in:", currentUser);
    checkUsername();
  } catch (err) {
    console.error("❌ Login failed:", err.message || err);
    alert("❌ Login failed: " + err.message);
  } finally {
    hideLoading();
  }
}

async function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!email || !password) return alert("Please enter both email and password.");

  showLoading("Creating account...");
  try {
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    alert("✅ Registered successfully! Please login.");
    switchTab("loginPage");
  } catch (err) {
    console.error("❌ Registration failed:", err.message || err);
    alert("❌ Registration failed: " + err.message);
  } finally {
    hideLoading();
  }
}

async function saveUsername() {
  const username = document.getElementById("newUsername")?.value.trim();
  if (!username) return alert("Please enter a username.");

  showLoading("Saving username...");
  try {
    await pb.collection('users').update(currentUser.id, {
      username,
      email: currentUser.email
    });
    currentUser.username = username;
    document.getElementById("usernameDisplay").textContent = username;
    loadMainUI();
  } catch (err) {
    console.error("❌ Username save error:", err.message || err);
    alert("❌ Failed to save username");
  } finally {
    hideLoading();
  }
}

async function checkUsername() {
  if (!currentUser) {
    switchTab("loginPage");
    return;
  }
  showLoading("Checking profile...");
  try {
    const userData = await pb.collection('users').getOne(currentUser.id);
    currentUser = userData;
    if (!userData.username) {
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = userData.username;
      loadMainUI();
    }
  } catch (err) {
    console.error("❌ Username check failed:", err.message || err);
    alert("❌ Failed to load user profile.");
  } finally {
    hideLoading();
  }
}

function logout() {
  pb.authStore.clear();
  currentUser = null;
  switchTab("loginPage");
}

// ===== Save Profile Data =====
async function saveProfile() {
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

  try {
    // If file provided, upload file to PocketBase
    if (file) {
      const formData = new FormData();
      formData.append('avatar', file);
      for (const key in updates) {
        formData.append(key, updates[key]);
      }

      const updated = await pb.collection("users").update(currentUser.id, formData);
      document.getElementById("profilePicPreview").src = pb.files.getUrl(updated, updated.avatar);
    } else {
      await pb.collection("users").update(currentUser.id, updates);
    }

    document.getElementById("usernameDisplay").innerHTML = usernameWithBadge(
      currentUser.id,
      updates.username || "User"
    );

    alert("✅ Profile updated.");
  } catch (err) {
    console.error("❌ Profile save error:", err.message || err);
    alert("❌ Failed to save profile.");
  }
}

async function loadProfile(callback) {
  if (!currentUser?.id) {
    console.warn("🔒 No authenticated user to load profile.");
    callback?.();
    return;
  }

  try {
    const userData = await pb.collection("users").getOne(currentUser.id);
    const data = userData || {};

    // ---- Form fields (raw values, no badge markup!) ----
    document.getElementById("profileName").value   = data.name || "";
    document.getElementById("profileBio").value    = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value  = data.phone || "";
    document.getElementById("profileEmail").value  = data.publicEmail || data.email || "";
    document.getElementById("profileUsername").value = data.username || "";

    const previewImg = document.getElementById("profilePicPreview");
    if (previewImg) {
      previewImg.src =
        pb.files.getUrl(data, data.avatar) ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || "User")}`;
    }

    // ---- Global header username (with badge) ----
    const headerUser = document.getElementById("usernameDisplay");
    if (headerUser) {
      headerUser.innerHTML = usernameWithBadge(currentUser.id, data.username || "User");
      if (typeof lucide !== "undefined") lucide.createIcons();
    }

    callback?.();
  } catch (err) {
    console.error("❌ Profile load error:", err.message || err);
    callback?.();
  }
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

    await pb.collection("users").update(currentUser.id, {
      avatarBase64: base64
    });

    document.getElementById("profilePicPreview").src = base64;

    closeCropModal();
    alert("✅ Profile picture updated!");

    loadProfile?.();
    loadChatList?.();
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
async function viewUserProfile(uid) {
  currentProfileUID = uid;

  try {
    const user = await pb.collection("users").getOne(uid);

    const avatar = user.avatar
      ? pb.files.getUrl(user, user.avatar)
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

    document.getElementById("viewProfilePic").src = avatar;
    document.getElementById("viewProfileName").textContent = user.name || "Unnamed";
    document.getElementById("viewProfileUsername").innerHTML =
      `@${usernameWithBadge(uid, user.username || "unknown")}`;
    document.getElementById("viewProfileBio").textContent = user.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = user.email || "";
    document.getElementById("viewProfileStatus").textContent = user.status || "";

    document.getElementById("viewProfileModal").style.display = "flex";

    // Lucide icons (for badge-check)
    if (typeof lucide !== "undefined") lucide.createIcons();

    // Check friendship (assumes "friends" collection with from & to user IDs)
    const btnGroup = document.querySelector("#viewProfileModal .btn-group");
    if (!btnGroup) return;
    btnGroup.innerHTML = "";

    const existing = await pb.collection("friends").getFirstListItem(
      `from="${currentUser.id}" && to="${uid}"`, { requestKey: null }
    ).catch(() => null);

    const btn = document.createElement("button");
    if (existing) {
      btn.textContent = "Unfriend";
      btn.onclick = () => removeFriend(uid);
    } else {
      btn.textContent = "Add Friend";
      btn.onclick = () => addFriend(uid);
    }
    btnGroup.appendChild(btn);
  } catch (err) {
    console.error("❌ Failed to load user profile:", err.message || err);
    alert("User not found.");
  }
}

// ===== Contact Support Shortcut =====
function contactSupport() {
  alert("Contact us at: moneythepro7@gmail.com");
}

// ===== Logout & Reset App =====
async function logout() {
  if (currentUser) {
    try {
      await pb.collection("users").update(currentUser.id, {
        status: "offline",
        lastSeen: new Date().toISOString()
      });
    } catch (e) {
      console.warn("⚠️ Failed to update status:", e.message || e);
    }
  }

  try {
    await pb.authStore.clear(); // clears the auth token/session
    currentUser = null;
    window.location.reload();
  } catch (err) {
    console.error("❌ Logout failed:", err.message || err);
    alert("Failed to log out.");
  }
}

// ===== Group List for Dropdowns =====
function loadGroups() {
  const dropdown = document.getElementById("roomDropdown");
  if (!dropdown || !currentUser) return;

  const prevSelected = dropdown.value;
  const SHOW_HASH_PREFIX = true;

  if (unsubscribeGroups && typeof unsubscribeGroups === "function") {
    unsubscribeGroups();
  }

  // Subscribe to real-time group changes for the current user
  unsubscribeGroups = pb.collection("groups").subscribe("*", async ({ action, record }) => {
    try {
      const groups = await pb.collection("groups").getFullList({
        filter: `members ~ "${currentUser.id}"`,
        sort: "+name"
      });

      dropdown.innerHTML = "";

      if (!groups.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = "No groups yet";
        dropdown.appendChild(opt);
        return;
      }

      let restored = false;

      for (const group of groups) {
        const opt = document.createElement("option");
        opt.value = group.id;
        const label = group.name || group.id;
        opt.textContent = SHOW_HASH_PREFIX ? `#${label}` : label;
        if (group.id === prevSelected) {
          opt.selected = true;
          restored = true;
        }
        dropdown.appendChild(opt);
      }

      if (!restored && dropdown.options.length > 0) {
        dropdown.selectedIndex = 0;
      }
    } catch (err) {
      console.error("❌ Failed to load groups:", err.message || err);
    }
  });
}

async function createGroup() {
  const name = prompt("Enter group name:");
  if (!name || !currentUser) return;

  showLoading("Creating group...");
  try {
    // Step 1: Create group record
    const group = await pb.collection("groups").create({
      name,
      createdBy: currentUser.id,
      admins: [currentUser.id],
      members: [currentUser.id],
    });

    // Step 2: Optionally create associated thread (if using a "threads" collection per group)
    await pb.collection("group_threads").create({
      group: group.id,  // make sure this is a relation to the group
    });

    alert("✅ Group created!");
    joinRoom(group.id); // Open the group chat
  } catch (err) {
    console.error("❌ Group creation failed:", err.message || err);
    alert("❌ Failed to create group.");
  } finally {
    hideLoading();
  }
}

// ===== Chat List Loader =====
function loadChatList() {
  const list = document.getElementById("chatList");
  if (!list) return;

  list.innerHTML = "";
  setTimeout(() => {
    loadRealtimeGroups();
    loadFriendThreads();
  }, 200);
}

// ===== Realtime Group Chats =====
async function loadGroupMessages(groupId) {
  const box = document.getElementById("groupMessages");
  if (!groupId || !currentUser || !box) return;

  showLoading("Loading group messages...");
  box.innerHTML = "";

  try {
    const result = await pb.collection("messages").getFullList({
      filter: `group="${groupId}"`,
      sort: "+timestamp"
    });

    const visible = result.filter(msg => !(msg.deletedFor?.includes?.(currentUser.id)));
    computeGroupClassesGroup(visible);

    const senderCache = {};

    for (const msg of visible) {
      const isSelf = msg.senderId === currentUser.id;
      const decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
      const isDeleted = msg.text === "";

      if (!senderCache[msg.senderId]) {
        senderCache[msg.senderId] = await pb.collection("users").getOne(msg.senderId);
      }

      const senderData = senderCache[msg.senderId];
      const senderName = usernameWithBadge(msg.senderId, senderData.username || senderData.name || "User");
      const avatar = senderData.avatar
        ? pb.files.getUrl(senderData, senderData.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.username || "User")}`;

      const showAuthorRow = msg._grp === "grp-start" || msg._grp === "grp-single";

      const wrapper = document.createElement("div");
      wrapper.className = `message-bubble-wrapper ${isSelf ? "right from-self" : "left from-other"} ${msg._grp}`;
      if (showAuthorRow) wrapper.classList.add("has-pfp");

      wrapper.innerHTML = `
        ${showAuthorRow ? `<img class="bubble-pfp" src="${avatar}" onclick="viewUserProfile('${msg.senderId}')">` : ""}
        <div class="message-bubble ${isSelf ? "right" : "left"}">
          ${showAuthorRow ? `<div class="msg-author">${senderName}</div>` : ""}
          <div class="msg-inner-wrapper ${isDeleted ? "msg-deleted" : ""}">
            <div class="msg-text-wrapper">
              <span class="msg-text">${isDeleted ? '<i data-lucide="trash-2"></i> Message deleted' : linkifyText(escapeHtml(decrypted))}</span>
              <span class="msg-meta-inline">${timeSince(new Date(msg.timestamp))}</span>
            </div>
          </div>
        </div>
      `;

      box.appendChild(wrapper);
    }

    box.scrollTop = box.scrollHeight;
    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (err) {
    console.error("❌ Failed to load group messages:", err.message || err);
    box.innerHTML = `<div class="no-results">Failed to load messages.</div>`;
  } finally {
    hideLoading();
  }
}

async function loadRealtimeGroups() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  try {
    const groups = await pb.collection("groups").getFullList({
      filter: `members~"${currentUser.id}"`,
      sort: "-updatedAt"
    });

    if (!groups.length) {
      list.innerHTML = `<div class="no-results">No group chats found.</div>`;
      return;
    }

    list.innerHTML = "";

    for (const group of groups) {
      const name = escapeHtml(group.name || "Group");
      const unread = group.unread?.[currentUser.id] || 0;
      const icon = group.icon || "group-icon.png";

      const card = document.createElement("div");
      card.className = "chat-card group-chat";
      card.onclick = () => openGroupChat(group.id);

      card.innerHTML = `
        <img class="group-avatar" src="${icon}" />
        <div class="details">
          <div class="name-row">
            <span class="name">#${name}</span>
            <span class="time">${timeSince(new Date(group.updatedAt))}</span>
          </div>
          <div class="last-message">${escapeHtml(group.lastMessage || "[No messages]")}</div>
        </div>
        ${unread > 0 ? `<span class="badge">${unread}</span>` : ""}
      `;

      list.appendChild(card);
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (err) {
    console.error("❌ Group list load failed:", err.message || err);
    list.innerHTML = `<div class="no-results">Failed to load group chats.</div>`;
  }
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
async function sendRoomMessage() {
  const input = document.getElementById("roomInput");
  const text = input?.value.trim();
  if (!text || !currentRoom || !currentUser) return;

  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();

  const message = {
    text: encryptedText,
    senderId: currentUser.id,
    senderName: currentUser.username,
    group: currentRoom,
    seenBy: [currentUser.id],
    timestamp: new Date().toISOString()
  };

  try {
    await pb.collection("messages").create(message);

    await pb.collection("groups").update(currentRoom, {
      lastMessage: text,
      updatedAt: new Date().toISOString()
    });

    input.value = "";
    cancelReply();

    // Scroll to bottom
    setTimeout(() => {
      const msgArea = document.getElementById("groupMessages");
      if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
    }, 100);
  } catch (err) {
    console.error("❌ Failed to send message:", err.message || err);
    alert("❌ Failed to send message.");
  }
}

async function loadFriendThreads() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  try {
    const threads = await pb.collection("threads").getFullList({
      filter: `participants~"${currentUser.id}"`,
      sort: "-updatedAt"
    });

    const userCache = {};
    list.innerHTML = "";

    for (const thread of threads) {
      const otherUid = thread.participants.find(uid => uid !== currentUser.id);
      if (!otherUid) continue;

      if (!userCache[otherUid]) {
        userCache[otherUid] = await pb.collection("users").getOne(otherUid);
      }

      const user = userCache[otherUid];
      const avatar = user.avatar
        ? pb.files.getUrl(user, user.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
      const name = usernameWithBadge(otherUid, user.username || user.name || "Friend");

      const card = document.createElement("div");
      card.className = "chat-card personal-chat";
      card.onclick = () => openThread(otherUid, user.username || user.name || "Friend");

      card.innerHTML = `
        <img class="friend-avatar" src="${avatar}" />
        <div class="details">
          <div class="name-row">
            <span class="name">${name}</span>
            <span class="time">${timeSince(new Date(thread.updatedAt))}</span>
          </div>
          <div class="last-message">${escapeHtml(thread.lastMessage || "[No messages]")}</div>
        </div>
      `;

      list.appendChild(card);
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (err) {
    console.error("❌ Friend threads load failed:", err.message || err);
    list.innerHTML = `<div class="no-results">Failed to load personal chats.</div>`;
  }
}

// ===== Typing Indicator Listener (dot dot dot dot) =====
function listenToTyping(targetId, context) {
  const typingBox = document.getElementById(
    context === "group" ? "groupTypingStatus" : "threadTypingStatus"
  );
  const statusBox = document.getElementById("chatStatus");

  if (!typingBox || !targetId || !currentUser) return;

  if (unsubscribeTyping) unsubscribeTyping();

  const typingCollection = "typing_status"; // ← PocketBase collection storing typing states
  const filter = context === "group"
    ? `context = "group" && target = "${targetId}"`
    : `context = "thread" && target = "${targetId}"`;

  unsubscribeTyping = pb.collection(typingCollection).subscribe("*", async ({ action, record }) => {
    try {
      // Refetch all typing states for this context + target
      const activeTypers = await pb.collection(typingCollection).getFullList({
        filter,
      });

      const someoneTyping = activeTypers.some(
        item => item.user !== currentUser.id && item.typing === true
      );

      typingBox.style.display = someoneTyping ? "flex" : "none";

      if (context === "thread" && statusBox) {
        statusBox.textContent = someoneTyping ? "Typing..." : "Online";
      }
    } catch (err) {
      console.warn("❌ Typing fetch failed:", err.message || err);
    }
  }, {
    expand: "user",
  });
}

// ===== Load Inbox Items (Cards + Badge) =====
// ✅ Listen to Inbox items (PocketBase)
function listenInbox() {
  const list = document.getElementById("inboxList");
  const badge = document.getElementById("inboxBadge");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox(); // Remove old listener

  unsubscribeInbox = pb.collection("inbox_items").subscribe("*", async ({ action, record }) => {
    if (record.user !== currentUser.id) return;

    try {
      const items = await pb.collection("inbox_items").getFullList({
        filter: `user = "${currentUser.id}"`,
        sort: "-created",
      });

      list.innerHTML = "";
      let unreadCount = 0;
      const senderCache = {};

      for (const item of items) {
        if (!item.read) unreadCount++;

        let senderName = "Unknown";
        let fromUID = "";
        let avatarURL = "default-avatar.png";

        if (typeof item.from === "string") {
          fromUID = item.from;

          if (!senderCache[fromUID]) {
            try {
              const sender = await pb.collection("users").getOne(fromUID);
              senderCache[fromUID] = {
                name: sender.username || sender.name || "Unknown",
                avatar: sender.avatar || sender.photoURL ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(sender.username || "User")}`
              };
            } catch (e) {
              console.warn("⚠️ Failed to fetch sender:", e.message);
            }
          }

          if (senderCache[fromUID]) {
            senderName = senderCache[fromUID].name;
            avatarURL = senderCache[fromUID].avatar;
          }
        }

        const typeText =
          item.type === "friend"
            ? `👤 Friend request from @${usernameWithBadge(fromUID, senderName)}`
            : item.type === "group"
              ? `📣 Group invite: ${escapeHtml(item.groupName || "Unnamed Group")}`
              : "📩 Notification";

        const card = document.createElement("div");
        card.className = "inbox-card";
        card.innerHTML = `
          <img src="${avatarURL}" alt="Avatar" />
          <div class="inbox-meta">
            <div class="inbox-title">${typeText}</div>
            <div class="inbox-time">${timeSince(new Date(item.created))}</div>
          </div>
          <div class="btn-group">
            <button onclick="acceptInbox('${item.id}', '${item.type}', '${fromUID}')">Accept</button>
            <button onclick="declineInbox('${item.id}')">Decline</button>
          </div>
        `;
        list.appendChild(card);
      }

      if (badge) {
        badge.textContent = unreadCount ? unreadCount : "";
        badge.style.display = unreadCount > 0 ? "inline-block" : "none";
      }

      lucide?.createIcons();
    } catch (err) {
      console.error("❌ Inbox render error:", err.message || err);
      alert("❌ Failed to load inbox");
    }
  });
}

// ✅ Update inbox badge
function updateInboxBadge() {
  if (!currentUser) return;
  const badge = document.getElementById("inboxBadge");
  if (!badge) return;

  pb.collection("inbox_items").getList(1, 1, {
    filter: `user = "${currentUser.id}" && read = false`
  }).then(res => {
    const count = res.totalItems;
    badge.textContent = count ? count : "";
    badge.style.display = count > 0 ? "inline-block" : "none";
  }).catch(err => {
    console.warn("⚠️ Inbox badge fetch failed:", err.message || err);
  });
}

// ✅ Accept inbox item
function acceptInbox(id, type, fromUID) {
  if (!currentUser || !id || !type || !fromUID) return;

  if (type === "friend") {
    Promise.all([
      pb.collection("friends").create({ user: currentUser.id, friend: fromUID }),
      pb.collection("friends").create({ user: fromUID, friend: currentUser.id }),
      pb.collection("inbox_items").delete(id)
    ]).then(() => {
      alert("✅ Friend added!");
      openThread(fromUID, "Friend");
      loadFriends?.();
      loadChatList?.();
    }).catch(err => {
      console.error("❌ Friend accept failed:", err.message || err);
      alert("❌ Failed to accept friend.");
    });
  } else if (type === "group") {
    pb.collection("groups").update(fromUID, {
      members: [...new Set([...(currentUser.groupIds || []), currentUser.id])]
    }).then(() => {
      pb.collection("inbox_items").delete(id);
      alert("✅ Joined the group!");
      joinRoom(fromUID);
      loadChatList?.();
    }).catch(err => {
      console.error("❌ Group join failed:", err.message || err);
      alert("❌ Failed to join group.");
    });
  }
}

// ✅ Decline inbox item
function declineInbox(id) {
  if (!currentUser || !id) return;

  pb.collection("inbox_items").delete(id).then(() => {
    alert("❌ Request declined.");
  }).catch(err => {
    console.error("❌ Decline failed:", err.message || err);
    alert("❌ Could not decline request.");
  });
}

// ✅ Mark all inbox items as read
function markAllRead() {
  if (!currentUser) return;

  pb.collection("inbox_items").getFullList({
    filter: `user = "${currentUser.id}" && read = false`
  }).then(items => {
    const updates = items.map(item =>
      pb.collection("inbox_items").update(item.id, { read: true })
    );
    return Promise.all(updates);
  }).then(() => {
    alert("📬 All inbox items marked as read.");
    updateInboxBadge();
  }).catch(err => {
    console.error("❌ Mark-all-read failed:", err.message || err);
    alert("❌ Could not mark all as read.");
  });
}

// ===== Friend List =====
async function loadFriends() {
  const container = document.getElementById("friendsList");
  if (!container || !currentUser) return;

  container.innerHTML = "Loading...";

  try {
    const list = await pb.collection("friends").getFullList({
      filter: `from="${currentUser.id}"`
    });

    if (!list.length) {
      container.innerHTML = `<div class="no-results">You have no friends yet.</div>`;
      return;
    }

    container.innerHTML = "";

    for (const rel of list) {
      const uid = rel.to;
      try {
        const user = await pb.collection("users").getOne(uid);
        const avatar = user.avatar
          ? pb.files.getUrl(user, user.avatar)
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
        const isOnline = user.status === "online";

        const card = document.createElement("div");
        card.className = "friend-card";
        card.onclick = () => viewUserProfile(uid);

        card.innerHTML = `
          <img src="${avatar}" alt="Avatar" />
          <div class="friend-info">
            <div class="name">${usernameWithBadge(uid, user.username || "User")}</div>
            <div class="bio">${escapeHtml(user.bio || "")}</div>
          </div>
          <div class="status-dot ${isOnline ? "online" : "offline"}" title="${isOnline ? "Online" : "Offline"}"></div>
          <button class="chat-start-btn" onclick="event.stopPropagation(); openThread('${uid}', '${escapeHtml(user.username || "User")}')">💬 Chat</button>
        `;

        container.appendChild(card);
      } catch (err) {
        console.warn("❌ Failed to load friend:", err.message || err);
      }
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (err) {
    console.error("❌ Friend list load failed:", err.message || err);
    container.innerHTML = `<div class="error">Error loading friends.</div>`;
  }
}

async function removeFriend(uid) {
  if (!currentUser || !uid) return;

  if (!confirm("❌ Are you sure you want to remove this friend?")) return;

  try {
    // Find and delete both friend records
    const rel1 = await pb.collection("friends").getFirstListItem(
      `from="${currentUser.id}" && to="${uid}"`, { requestKey: null }
    ).catch(() => null);

    const rel2 = await pb.collection("friends").getFirstListItem(
      `from="${uid}" && to="${currentUser.id}"`, { requestKey: null }
    ).catch(() => null);

    if (rel1) await pb.collection("friends").delete(rel1.id);
    if (rel2) await pb.collection("friends").delete(rel2.id);

    alert("✅ Friend removed.");
    loadFriends?.();
  } catch (err) {
    console.error("❌ Remove friend failed:", err.message || err);
    alert("❌ Could not remove friend.");
  }
}

async function addFriend(uid) {
  if (!uid || !currentUser) return;

  if (uid === currentUser.id) {
    alert("❌ You can't add yourself.");
    return;
  }

  try {
    // Check if already friends
    const exists = await pb.collection("friends").getFirstListItem(
      `from="${currentUser.id}" && to="${uid}"`, { requestKey: null }
    ).catch(() => null);

    if (exists) {
      alert("✅ Already friends!");
      return;
    }

    // Create bi-directional friendship
    await pb.collection("friends").create({
      from: currentUser.id,
      to: uid,
      since: new Date().toISOString()
    });

    await pb.collection("friends").create({
      from: uid,
      to: currentUser.id,
      since: new Date().toISOString()
    });

    alert("✅ Friend added!");
    loadFriends?.();
    loadChatList?.();
  } catch (err) {
    console.error("❌ Add friend failed:", err.message || err);
    alert("❌ Failed to add friend.");
  }
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
    // Get group record
    const group = await pb.collection("groups").getOne(groupId);
    if (!group) {
      ownerLabel.textContent  = "Owner: Unknown";
      adminsLabel.textContent = "Admins: Unknown";
      memberList.innerHTML    = `<div class="error">Group not found.</div>`;
      return;
    }

    const admins = Array.isArray(group.admins) ? group.admins : [];
    const members = Array.isArray(group.members) ? group.members : [];
    const ownerUid = group.owner || null;

    // Fetch all unique user profiles
    const allUids = [...new Set([...admins, ...members, ownerUid].filter(Boolean))];
    const userMap = {};

    await Promise.all(allUids.map(async uid => {
      try {
        userMap[uid] = await pb.collection("users").getOne(uid);
      } catch {
        userMap[uid] = null;
      }
    }));

    const getDisplayName = uid => {
      const u = userMap[uid];
      return u?.username || u?.name || uid || "User";
    };

    // Owner label
    if (ownerUid) {
      ownerLabel.innerHTML = "Owner: " + usernameWithBadge(ownerUid, getDisplayName(ownerUid));
    } else {
      ownerLabel.textContent = "Owner: Unknown";
    }

    // Admins label
    if (admins.length) {
      const adminHtml = admins.map(uid => usernameWithBadge(uid, getDisplayName(uid))).join(", ");
      adminsLabel.innerHTML = "Admins: " + adminHtml;
    } else {
      adminsLabel.textContent = "Admins: None";
    }

    // Member list
    memberList.innerHTML = "";
    if (!members.length) {
      memberList.innerHTML = `<div class="no-results">No members.</div>`;
    } else {
      for (const uid of members) {
        const name = getDisplayName(uid);
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
      }
    }

    if (typeof lucide !== "undefined") lucide.createIcons();

  } catch (err) {
    console.error("❌ Group info fetch failed:", err.message || err);
    ownerLabel.textContent  = "Owner: Error";
    adminsLabel.textContent = "Admins: Error";
    memberList.innerHTML    = `<div class="error">Failed to load group info.</div>`;
  }
}

// ===== DM Utilities =====
function threadId(a, b) {
  return [a, b].sort().join("_");
}

/* =========================================================
 * PART 1: UNIFIED CORE HELPERS
 * ---------------------------------------------------------
 * Loaded once. Used by threads, groups, search, profile, etc.
 * ======================================================= */

/* ---------- Config ---------- */
const CHAT_AES_KEY = "yourSecretKey";   // TODO: replace w/ per-user/session key


/* ---------- HTML Escaping ---------- */
function escapeHtml(text = "") {
  return text.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}


/* ---------- Time Helpers ---------- */
// HH:MM (24h, local)
function formatTimeHM(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Relative age (used in lists, last-seen, etc.)
function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals = [
    { label: "year",   seconds: 31536000 },
    { label: "month",  seconds: 2592000 },
    { label: "day",    seconds: 86400 },
    { label: "hour",   seconds: 3600 },
    { label: "minute", seconds: 60 },
    { label: "second", seconds: 1 }
  ];
  for (const i of intervals) {
    const count = Math.floor(seconds / i.seconds);
    if (count >= 1) return `${count} ${i.label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

// Same calendar day?
function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// Day separator label (Today / Yesterday / DD Mon YYYY)
function formatDaySeparator(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}


/* ---------- Emoji Helpers ---------- */
// True if string contains only emoji glyph cluster(s) (no alphanumerics)
function isEmojiOnlyText(str = "") {
  if (typeof str !== "string") return false;
  const stripped = str.trim();
  if (!stripped) return false;
  // reject obvious non-emoji
  if (/[A-Za-z0-9]/.test(stripped)) return false;
  // contains at least one emoji pictographic char
  return /[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(stripped);
}


/* ---------- Link Helpers ---------- */
function linkifyText(text = "") {
  // NOTE: we intentionally *don't* escape first; callers should escapeHtml() before passing if needed.
  // If you want automatic escaping, wrap: linkifyText(escapeHtml(str)).
  const urlRegex = /((https?:\/\/)[^\s]+)/gi;
  return text.replace(urlRegex, url => {
    let displayUrl = url;
    if (displayUrl.length > 45) displayUrl = displayUrl.slice(0, 42) + "...";
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${displayUrl}</a>`;
  });
}

function extractFirstURL(text = "") {
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

// External unfurler (best effort; safe-fail)
async function fetchLinkPreview(url) {
  try {
    const res = await fetch(
      `https://api.linkpreview.net/?key=89175199788eee7477f5ac45e693cb53&q=${encodeURIComponent(url)}`
    );
    const data = await res.json();
    if (data && data.title && data.url) return data;
  } catch (err) {
    console.warn("🔗 Link preview fetch failed:", err);
  }
  return null;
}

// Build preview snippet HTML
function buildLinkPreviewHTML(preview, url) {
  if (!preview && !url) return "";
  const img   = preview?.image ? `<img src="${preview.image}" class="preview-img">` : "";
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


/* ---------- Swipe-to-Reply Globals ---------- */
let touchStartX = 0;
let touchMoveX  = 0;
let replyingTo  = null;   // {msgId, text} or null

function handleTouchStart(e) {
  if (e.touches?.[0]) {
    touchStartX = e.touches[0].clientX;
    touchMoveX  = touchStartX;
  }
}
function handleTouchMove(e) {
  if (e.touches?.[0]) touchMoveX = e.touches[0].clientX;
}
function handleSwipeToReply(ev, msg, decryptedText) {
  const deltaX = touchMoveX - touchStartX;
  if (deltaX > 35 && deltaX < 150) {
    showReplyPreview(msg, decryptedText);
    // visual swipe feedback (optional)
    const wrapper = ev.target.closest(".message-bubble-wrapper");
    if (wrapper) {
      wrapper.classList.add("swiped");
      setTimeout(() => wrapper.classList.remove("swiped"), 500);
    }
  }
}

function showReplyPreview(msg, text) {
  replyingTo = { msgId: msg.id, text };
  const replyBox = document.getElementById("replyPreview");
  if (!replyBox) return;
  replyBox.innerHTML = `
    <div class="reply-box-inner" onclick="scrollToReplyMessage('${msg.id}')">
      <div class="reply-info">
        <div class="reply-text clamp-text">${escapeHtml(text)}</div>
      </div>
      <button class="reply-close" onclick="cancelReply()" aria-label="Cancel reply">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;
  replyBox.style.display = "flex";
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function cancelReply() {
  replyingTo = null;
  const box = document.getElementById("replyPreview");
  if (box) {
    box.style.display = "none";
    box.innerHTML = "";
  }
}


/* ---------- Reply Strip Builder (used in bubbles) ---------- */
function buildReplyStrip(msg) {
  if (!msg.replyTo) return "";
  const replyId = msg.replyTo.msgId || msg.replyTo.id || "";
  const rText   = escapeHtml(msg.replyTo.text || "");
  return `<div class="reply-to clamp-text" onclick="scrollToMessage('${replyId}')">${rText}</div>`;
}


/* ---------- Decrypt Text Helper ---------- */
function decryptMsgText(msg) {
  let decrypted = "";
  let isDeleted = false;

  if (typeof msg.text === "string") {
    if (msg.text === "") {
      isDeleted = true;
    } else {
      try {
        const bytes = CryptoJS.AES.decrypt(msg.text, CHAT_AES_KEY);
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

  return isDeleted
    ? { text: "", isDeleted: true, deletedHtml }
    : { text: decrypted, isDeleted: false, deletedHtml };
}


/* ---------- Message Grouping (grp-start/mid/end/single) ---------- */
/* Works for DM threads (msg.from) AND group chats if caller normalizes .from or .senderId prior */
function computeGroupClasses(msgs, gapMs = 5 * 60 * 1000) {
  for (let i = 0; i < msgs.length; i++) {
    const m    = msgs[i];
    const ts   = m.timestamp?.toMillis?.() ?? 0;
    const prev = msgs[i - 1];
    const next = msgs[i + 1];

    // Determine sender field (allow senderId fallback)
    const senderField = m.from ?? m.senderId;

    const prevOk = prev && (prev.from ?? prev.senderId) === senderField &&
      ts - (prev.timestamp?.toMillis?.() ?? 0) <= gapMs;
    const nextOk = next && (next.from ?? next.senderId) === senderField &&
      (next.timestamp?.toMillis?.() ?? 0) - ts <= gapMs;

    if (prevOk && nextOk)        m._grp = "grp-mid";
    else if (prevOk && !nextOk)  m._grp = "grp-end";
    else if (!prevOk && nextOk)  m._grp = "grp-start";
    else                         m._grp = "grp-single";
  }
  return msgs;
}


/* ---------- Meta Builders (ticks/time under bubble) ---------- */
function buildTickMeta(msg, otherUid) {
  let status = "sent";
  let icon   = "check";
  let cls    = "tick-sent";
  if (msg.deliveredAt) { status = "delivered"; icon = "check-check"; }
  if (Array.isArray(msg.seenBy) && msg.seenBy.includes(otherUid)) {
    status = "seen"; icon = "check-check"; cls = "tick-seen";
  }
  const timeHtml = msg.timestamp?.toDate
    ? `<span class="msg-time">${formatTimeHM(msg.timestamp.toDate())}</span>`
    : `<span class="msg-time">…</span>`;
  return `
    <span class="msg-meta-inline" data-status="${status}">
      ${timeHtml}
      <i data-lucide="${icon}" class="tick-icon ${cls}"></i>
    </span>
  `;
}

function buildOtherMeta(msg) {
  const timeHtml = msg.timestamp?.toDate
    ? `<span class="msg-time">${formatTimeHM(msg.timestamp.toDate())}</span>`
    : `<span class="msg-time">…</span>`;
  return `
    <span class="msg-meta-inline" data-status="other">
      ${timeHtml}
    </span>
  `;
}


/* ---------- Scroll Helpers (used by reply) ---------- */
function scrollToMessage(msgId) {
  const bubble = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
  if (!bubble) return;
  bubble.classList.add("highlight");
  bubble.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => bubble.classList.remove("highlight"), 2000);
}
function scrollToReplyMessage(msgId) {
  scrollToMessage(msgId);
}


/* ---------- Input Autosize ---------- */
function autoResizeInput(inputEl) {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}


/* ---------- Username + Badge Helper ---------- */
// Add a verified/dev badge for your UID (adjust to taste)
function usernameWithBadge(uid, name) {
  const safe = escapeHtml(name || "User");
  // Example: mark your own UID "moneythepro" (case-insensitive) with badge-check
  if ((uid || "").toLowerCase() === "moneythepro") {
    return `${safe} <i data-lucide="badge-check" class="dev-badge" aria-label="Verified"></i>`;
  }
  return safe;
}


/* ---------- Lightweight Profile Cache ---------- */
const _profileCache = new Map();  // uid -> {username, avatar}
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

  const fallback = {
    username: "User",
    avatar: `https://ui-avatars.com/api/?name=User`
  };
  _profileCache.set(uid, fallback);
  return fallback;
}

/* =========================================================
 * PART 2: THREAD CHAT (DM)
 * ======================================================= */


let renderedMessageIds = new Set();
let isSendingThread = false;

/* ---------- Open Thread ---------- */
async function openThread(uid, name) {
  if (!currentUser || !uid) return;

  try {
    // 1. Ensure friend relationship
    const friends = await pb.collection("friends").getFullList({
      filter: `user = "${currentUser.id}" && friend = "${uid}"`,
      limit: 1
    });

    if (!friends.length) {
      alert("⚠️ You must be friends to start a chat.");
      return;
    }

    // 2. Switch UI to thread
    switchTab("threadView");

    // 3. Setup input & send
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
      setupEmojiButton?.();
    }, 200);

    // 4. Header UI
    const headerNameEl = document.getElementById("threadWithName");
    const displayName = typeof name === "string" ? name : (name?.username || "Chat");
    if (headerNameEl) {
      headerNameEl.innerHTML = usernameWithBadge(uid, displayName);
      headerNameEl.onclick = () => openUserProfile(uid);
    }

    const headerImg = document.getElementById("chatProfilePic");
    if (headerImg) headerImg.onclick = () => openUserProfile(uid);

    // 5. Menu
    const menuBtn = document.getElementById("chatMenuBtn");
    if (menuBtn && !menuBtn.dataset.bound) {
      menuBtn.addEventListener("click", toggleChatOptions);
      menuBtn.dataset.bound = "true";
    }
    const opt = document.getElementById("chatOptionsMenu");
    if (opt) opt.style.display = "none";

    // 6. Thread state
    currentThreadUser = uid;
    currentRoom = null;
    const threadIdStr = threadId(currentUser.id, uid);
    const area = document.getElementById("threadMessages");
    renderedMessageIds.clear();

    if (area && lastThreadId !== threadIdStr) {
      area.innerHTML = "";
      lastThreadId = threadIdStr;
    }

    // 7. Scroll restore
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

    // 8. Load header avatar
    try {
      const user = await pb.collection("users").getOne(uid);
      if (headerImg) {
        headerImg.src =
          user.avatar || user.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;
      }
    } catch (e) {
      console.warn("⚠️ Could not load friend image:", e);
    }

    // 9. Cleanup old listeners
    if (typeof unsubscribeThread === "function") unsubscribeThread();
    if (typeof unsubscribeTyping === "function") unsubscribeTyping();

    // 10. Typing indicator
    listenToTyping(threadIdStr, "thread");

    // 11. Reset unread
    await pb.collection("threads").update(threadIdStr, {
      unread: {
        [currentUser.id]: 0
      }
    });

    // 12. Live status (polling fallback, no realtime user doc)
    const statusEl = document.getElementById("chatStatus");
    try {
      const user = await pb.collection("users").getOne(uid);
      if (statusEl) {
        if (user.typingFor === currentUser.id) statusEl.textContent = "Typing...";
        else if (user.status === "online") statusEl.textContent = "Online";
        else if (user.lastSeen) statusEl.textContent = "Last seen " + timeSince(new Date(user.lastSeen));
        else statusEl.textContent = "Offline";
      }
    } catch {
      if (statusEl) statusEl.textContent = "";
    }

    // 13. Message subscription
    unsubscribeThread = pb.collection("messages").subscribe("*", async ({ action, record }) => {
      if (!area || record.thread !== threadIdStr) return;
      const msgs = await pb.collection("messages").getFullList({
        filter: `thread = "${threadIdStr}"`,
        sort: "timestamp",
        $autoCancel: false
      });
      const parsed = msgs.map(msg => ({ id: msg.id, ...msg }));
      const isInitial = area.childElementCount === 0 || renderedMessageIds.size === 0;
      await renderThreadMessagesToArea({ area, msgs: parsed, otherUid: uid, threadIdStr, isInitial });
      renderedMessageIds.clear();
      parsed.forEach(m => renderedMessageIds.add(m.id));
    });

    lucide?.createIcons();
  } catch (err) {
    console.error("❌ openThread error:", err);
    alert("❌ Could not open chat: " + (err.message || JSON.stringify(err)));
  }
}

/* ---------- Render Thread Messages ---------- */
async function renderThreadMessagesToArea({ area, msgs, otherUid, threadIdStr, isInitial }) {
  if (!area) return;

  const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
  computeGroupClasses(msgs);

  const selfProfile = await getUserProfileCached(currentUser.id);
  const otherProfile = await getUserProfileCached(otherUid);

  if (isInitial) area.innerHTML = "";
  const distFromBottom = !isInitial ? (area.scrollHeight - area.scrollTop) : 0;

  const frag = document.createDocumentFragment();
  let lastMsgDate = null;

  for (const msg of msgs) {
    const isSelf = msg.from === currentUser.id;
    const { text: displayText, isDeleted, deletedHtml } = decryptMsgText(msg);
    const emojiOnly = isEmojiOnlyText(displayText);

    const msgDate = msg.timestamp ? new Date(msg.timestamp) : null;
    if (msgDate && (!lastMsgDate || !isSameDay(lastMsgDate, msgDate))) {
      const separator = document.createElement("div");
      separator.className = "day-separator";
      separator.textContent = formatDaySeparator(msgDate);
      frag.appendChild(separator);
    }
    if (msgDate) lastMsgDate = msgDate;

    const showPfp = msg._grp === "grp-start" || msg._grp === "grp-single";
    const prof = isSelf ? selfProfile : otherProfile;

    const pfpHtml = showPfp
      ? `<img class="bubble-pfp ${isSelf ? "pfp-self" : "pfp-other"}" 
            src="${prof.avatar}" 
            alt="${escapeHtml(prof.username)}" 
            onclick="openUserProfile('${isSelf ? currentUser.id : otherUid}')">`
      : "";

    const authorHtml = (!isSelf && showPfp)
      ? `<div class="msg-author">${usernameWithBadge(otherUid, prof.username)}</div>`
      : "";

    const replyBox = !isDeleted ? buildReplyStrip(msg) : "";
    const metaHtml = isSelf ? buildTickMeta(msg, otherUid) : buildOtherMeta(msg);

    const textHtml = escapeHtml(displayText);
    const shortText = textHtml.slice(0, 500);
    const hasLong = textHtml.length > 500;
    const content = isDeleted
      ? deletedHtml
      : hasLong
        ? `${shortText}<span class="show-more" onclick="this.parentElement.innerHTML=this.parentElement.dataset.full">... Show more</span>`
        : linkifyText(textHtml);

    // 🔗 Optional link preview
    let linkPreviewHTML = "";
    if (!isDeleted) {
      const url = extractFirstURL(displayText);
      if (msg.preview) {
        linkPreviewHTML = buildLinkPreviewHTML(msg.preview, msg.preview.url);
      } else if (url) {
        try {
          const preview = await fetchLinkPreview(url);
          if (preview?.title || preview?.image) {
            linkPreviewHTML = buildLinkPreviewHTML(preview, url);
          }
        } catch (_) {}
      }
    }

    const wrapper = document.createElement("div");
    wrapper.className = `message-bubble-wrapper fade-in ${isSelf ? "right from-self" : "left from-other"} ${msg._grp || "grp-single"} ${showPfp ? "has-pfp" : ""}`;

    if (!showPfp) {
      const indent = "calc(var(--pfp-size) + var(--pfp-gap))";
      if (isSelf) wrapper.style.marginRight = indent;
      else wrapper.style.marginLeft = indent;
    }

    const dataTime = msg.timestamp ? formatTimeHM(new Date(msg.timestamp)) : "00:00";
    wrapper.innerHTML = `
      ${pfpHtml}
      <div class="message-bubble ${isSelf ? "right" : "left"} ${emojiOnly ? "emoji-only" : ""} ${msg._grp || ""}"
           data-msg-id="${msg.id}" data-time="${dataTime}">
        ${authorHtml}
        ${replyBox}
        <div class="msg-inner-wrapper ${isDeleted ? "msg-deleted" : ""}">
          <div class="msg-text-wrapper">
            <span class="msg-text" data-full="${textHtml}" data-short="${shortText}">
              ${content}
            </span>
            ${metaHtml}
          </div>
          ${linkPreviewHTML}
        </div>
      </div>
    `;

    if (!isDeleted) {
      const bubbleEl = wrapper.querySelector(".message-bubble");
      if (bubbleEl) {
        bubbleEl.addEventListener("touchstart", handleTouchStart, { passive: true });
        bubbleEl.addEventListener("touchmove", handleTouchMove, { passive: true });
        bubbleEl.addEventListener("touchend", ev => handleSwipeToReply(ev, msg, displayText), { passive: true });
        bubbleEl.addEventListener("contextmenu", e => {
          e.preventDefault();
          handleLongPressMenu(msg, displayText, isSelf);
        });
      }
    }

    frag.appendChild(wrapper);

    // ✅ Update 'seenBy' (manual array update in PocketBase)
    if (!Array.isArray(msg.seenBy) || !msg.seenBy.includes(currentUser.id)) {
      try {
        const updatedSeenBy = Array.isArray(msg.seenBy) ? [...msg.seenBy, currentUser.id] : [currentUser.id];
        await pb.collection("thread_messages").update(msg.id, {
          seenBy: updatedSeenBy
        });
      } catch (_) {
        // Silent fail
      }
    }
  }

  area.appendChild(frag);
  lucide?.createIcons();

  if (isInitial || isNearBottom) {
    setTimeout(() => scrollToBottomThread(true), 50);
  } else {
    area.scrollTop = area.scrollHeight - distFromBottom;
  }
}

/* ---------- Optimistic Bubble ---------- */
function renderOptimisticBubble(text, localDate) {
  const area = document.getElementById("threadMessages");
  if (!area) return;

  const localHM = formatTimeHM(localDate);
  const tempId  = "temp-" + localDate.getTime();

  const wrapper = document.createElement("div");
  wrapper.className = "message-bubble-wrapper right from-self grp-single pending";

  wrapper.innerHTML = `
    <div class="message-bubble right pending" data-msg-id="${tempId}" data-time="${localHM}">
      <div class="msg-inner-wrapper">
        <div class="msg-text-wrapper">
          <span class="msg-text">${linkifyText(escapeHtml(text))}</span>
          <span class="msg-meta-inline" data-status="pending">
            <span class="msg-time">${localHM}</span>
            <i data-lucide="clock" class="tick-icon tick-pending"></i>
          </span>
        </div>
      </div>
    </div>
  `;

  area.appendChild(wrapper);
  requestAnimationFrame(() => scrollToBottomThread(true));
  lucide?.createIcons();
}

/* ---------- Send Thread Message ---------- */
async function sendThreadMessage() {
  if (isSendingThread) return;
  isSendingThread = true;

  const input = document.getElementById("threadInput");
  if (!input || !currentThreadUser || !currentUser) {
    isSendingThread = false;
    return;
  }

  const rawText = input.value;
  const text = rawText.trim();
  if (!text) {
    isSendingThread = false;
    return;
  }

  input.value = "";
  const localTimestamp = new Date();
  renderOptimisticBubble(text, localTimestamp);

  const pendingReply = replyingTo;
  cancelReply();

  const fromName = document.getElementById("usernameDisplay")?.textContent || "User";
  const toNameElem = document.getElementById("threadWithName");
  const toName = toNameElem ? toNameElem.textContent : "Friend";

  const threadIdStr = threadId(currentUser.id, currentThreadUser);
  const encryptedText = CryptoJS.AES.encrypt(text, CHAT_AES_KEY).toString();

  const message = {
    text: encryptedText,
    from: currentUser.id,
    fromName,
    threadId: threadIdStr,
    timestamp: new Date().toISOString(),
    localTime: localTimestamp.getTime(),
    seenBy: [currentUser.id]
  };

  if (pendingReply?.msgId && pendingReply?.text?.trim()) {
    message.replyTo = { msgId: pendingReply.msgId, text: pendingReply.text };
  }

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
    // Add message to `thread_messages` collection
    await pb.collection("thread_messages").create(message);

    // Update or upsert thread metadata in `threads` collection
    const threadData = {
      participants: [currentUser.id, currentThreadUser],
      names: {
        [currentUser.id]: fromName,
        [currentThreadUser]: toName
      },
      lastMessage: text,
      updatedAt: new Date().toISOString()
    };

    try {
      const thread = await pb.collection("threads").getOne(threadIdStr);
      const unread = thread.unread || {};
      unread[currentThreadUser] = (unread[currentThreadUser] || 0) + 1;
      threadData.unread = unread;

      await pb.collection("threads").update(threadIdStr, threadData);
    } catch {
      // If thread doesn't exist, create it
      threadData.unread = {
        [currentUser.id]: 0,
        [currentThreadUser]: 1
      };
      threadData.id = threadIdStr;
      await pb.collection("threads").create(threadData);
    }

    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  } catch (err) {
    console.error("❌ Send failed:", err);
    showToast("Message failed to send.");
  } finally {
    isSendingThread = false;
  }
}

/* =========================================================
 * PART 3: GROUP CHAT
 * ======================================================= */

/* ---------- Listen to Group Messages ---------- */
let unsubscribeMessages = null;

function listenMessages() {
  const messagesDiv = document.getElementById("groupMessages");
  if (!messagesDiv || !currentRoom || !currentUser) return;

  // Cancel any previous poll
  if (unsubscribeMessages) unsubscribeMessages();

  let lastFetched = null;
  let polling = true;

  async function fetchAndRenderMessages() {
    if (!polling) return;

    try {
      const prevScrollTop = messagesDiv.scrollTop;
      const isNearBottom =
        messagesDiv.scrollHeight - prevScrollTop - messagesDiv.clientHeight < 100;

      const result = await pb.collection("messages").getFullList({
        filter: `group="${currentRoom}"`,
        sort: "+timestamp"
      });

      messagesDiv.innerHTML = "";
      const frag = document.createDocumentFragment();
      const renderedIds = new Set();
      let lastMsgDate = null;

      for (const msg of result) {
        const msgId = msg.id;
        if (!msg || renderedIds.has(msgId)) continue;
        renderedIds.add(msgId);

        if (msg.deletedFor?.includes?.(currentUser.id)) continue;

        const isSelf = msg.senderId === currentUser.id;

        // --- Decrypt ---
        let decrypted = "";
        try {
          decrypted = CryptoJS.AES.decrypt(msg.text, CHAT_AES_KEY).toString(CryptoJS.enc.Utf8) || "[Encrypted]";
        } catch (e) {
          console.error("Decryption failed:", e);
          decrypted = "[Decryption error]";
        }

        // --- Date Separator ---
        const msgDate = msg.timestamp ? new Date(msg.timestamp) : null;
        if (msgDate && (!lastMsgDate || !isSameDay(lastMsgDate, msgDate))) {
          const separator = document.createElement("div");
          separator.className = "day-separator";
          separator.textContent = formatDaySeparator(msgDate);
          frag.appendChild(separator);
        }
        if (msgDate) lastMsgDate = msgDate;

        const emojiOnly = isEmojiOnlyText(decrypted) ? "emoji-only" : "";
        const cleanSenderName = (msg.senderName || "User").replace(/<[^>]*>/g, "");
        const senderLabel = `<div class="msg-author">${usernameWithBadge(msg.senderId, cleanSenderName)}</div>`;

        const replyHtml = msg.replyTo?.text
          ? `<div class="reply-to clamp-text" onclick="scrollToMessage('${msg.replyTo.msgId}')">
              ↪ ${escapeHtml(msg.replyTo.text).slice(0, 120)}
            </div>`
          : "";

        const metaHtml = `
          <span class="msg-meta-inline" data-status="${isSelf ? 'self' : 'other'}">
            ${msgDate ? `<span class="msg-time">${formatTimeHM(msgDate)}</span>` : ""}
          </span>
        `;

        const bodyHtml = linkifyText(escapeHtml(decrypted));

        const wrapper = document.createElement("div");
        wrapper.className = `message-bubble-wrapper ${isSelf ? "right from-self" : "left from-other"} grp-single`;

        wrapper.innerHTML = `
          <div class="message-bubble ${isSelf ? "right" : "left"} ${emojiOnly}" data-msg-id="${msgId}"
               data-time="${msgDate ? formatTimeHM(msgDate) : ""}">
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

        // ✅ Update seenBy if not already seen
        if (!Array.isArray(msg.seenBy) || !msg.seenBy.includes(currentUser.id)) {
          try {
            const updatedSeenBy = Array.isArray(msg.seenBy)
              ? [...msg.seenBy, currentUser.id]
              : [currentUser.id];
            await pb.collection("messages").update(msgId, { seenBy: updatedSeenBy });
          } catch (_) {}
        }
      }

      messagesDiv.appendChild(frag);

      if (isNearBottom) {
        requestAnimationFrame(() => {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
      } else {
        messagesDiv.scrollTop = prevScrollTop;
      }

      lucide?.createIcons();
      renderWithMagnetSupport?.("groupMessages");
    } catch (err) {
      console.error("❌ Error fetching messages:", err.message || err);
    }
  }

  // Initial fetch + polling
  fetchAndRenderMessages();
  const interval = setInterval(fetchAndRenderMessages, 4000); // poll every 4s

  unsubscribeMessages = () => {
    polling = false;
    clearInterval(interval);
  };
}

/* ---------- Group Date & Time Helpers ---------- */
function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function formatDaySeparator(date) {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- Scroll to specific group message ---------- */
function scrollToMessage(msgId) {
  const bubble = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
  if (bubble) {
    bubble.classList.add("highlight");
    bubble.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => bubble.classList.remove("highlight"), 2000);
  }
}

/* =========================================================
 * PART 4: USER PROFILES & SEARCH
 * ======================================================= */

/* ---------- Open Profile Preview (Header Tap) ---------- */
async function openProfilePreview(uid) {
  try {
    const modal = document.getElementById("profilePreviewModal");
    if (!modal) return;

    const profile = await getUserProfileCached(uid);
    document.getElementById("profilePreviewPic").src = profile.avatar;
    document.getElementById("profilePreviewName").textContent = profile.username || "User";
    document.getElementById("profilePreviewStatus").textContent = "Loading status...";

    // Fetch live user status
    const user = await pb.collection("users").getOne(uid);
    const lastSeen = user.lastSeen ? new Date(user.lastSeen) : null;
    const status = user.status === "online"
      ? "Online"
      : lastSeen
        ? `Last seen ${timeSince(lastSeen)}`
        : "Offline";

    document.getElementById("profilePreviewStatus").textContent = status;
    modal.classList.remove("hidden");
  } catch (e) {
    console.error("Profile preview error:", e);
  }
}

function closeProfilePreview(event) {
  const modal = document.getElementById("profilePreviewModal");
  if (!modal) return;
  if (!event || event.target === modal) {
    modal.classList.add("hidden");
  }
}

function viewUserFullProfile() {
  closeProfilePreview();
  viewUserProfile(currentThreadUser);
}

async function openUserProfile(uid, opts = {}) {
  if (!uid) return;

  const modal = document.getElementById("userProfileModal");
  if (!modal) {
    console.warn("userProfileModal missing");
    return;
  }

  let userData = null;
  try {
    userData = await pb.collection("users").getOne(uid);
  } catch (err) {
    console.error("openUserProfile fetch failed:", err);
    return;
  }

  const username = userData.username || userData.name || "User";
  const avatar = userData.avatar
    ? pb.files.getUrl(userData, userData.avatar)
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}`;
  const bio = userData.bio || "No bio yet.";
  const status = userData.status || "offline";

  const picEl  = document.getElementById("userProfileModalPic");
  const nameEl = document.getElementById("userProfileModalName");
  const userEl = document.getElementById("userProfileModalUsername");
  const statEl = document.getElementById("userProfileModalStatus");
  const bioEl  = document.getElementById("userProfileModalBio");
  const actEl  = document.getElementById("userProfileModalActions");

  if (picEl)  picEl.src = avatar;
  if (nameEl) nameEl.innerHTML = usernameWithBadge(uid, username);
  if (userEl) userEl.textContent = "@" + username;
  if (statEl) statEl.textContent = status;
  if (bioEl)  bioEl.textContent = bio;

  if (actEl) {
    actEl.innerHTML = "";
    const isFriend = await isFriendOfCurrentUser(uid);

    if (uid !== currentUser?.id) {
      const chatBtn = document.createElement("button");
      chatBtn.textContent = "Open Chat";
      chatBtn.onclick = () => {
        closeUserProfileModal();
        openThread(uid, username);
      };
      actEl.appendChild(chatBtn);

      const friendBtn = document.createElement("button");
      friendBtn.textContent = isFriend ? "Unfriend" : "Add Friend";
      friendBtn.onclick = () => {
        isFriend ? removeFriend(uid) : addFriend(uid);
      };
      actEl.appendChild(friendBtn);

      const blockBtn = document.createElement("button");
      blockBtn.textContent = "Block";
      blockBtn.onclick = () => {
        closeUserProfileModal();
        blockUser(uid);
      };
      actEl.appendChild(blockBtn);
    } else {
      const meBtn = document.createElement("button");
      meBtn.textContent = "Edit My Profile";
      meBtn.onclick = () => {
        closeUserProfileModal();
        switchTab("profileTab");
      };
      actEl.appendChild(meBtn);
    }
  }

  modal.classList.remove("hidden");
  lucide?.createIcons();
}

function closeUserProfileModal() {
  const modal = document.getElementById("userProfileModal");
  if (!modal) return;
  modal.classList.add("hidden");
}

async function isFriendOfCurrentUser(uid) {
  if (!currentUser || !uid) return false;
  try {
    const match = await pb.collection("friends").getFirstListItem(
      `from="${currentUser.id}" && to="${uid}"`,
      { requestKey: null }
    );
    return !!match;
  } catch {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const pfp = document.getElementById("chatProfilePic");
  if (pfp && !pfp.dataset.bound) {
    pfp.addEventListener("click", () => {
      if (currentThreadUser) openUserProfile(currentThreadUser, { fromHeader: true });
    });
    pfp.dataset.bound = "true";
  }

  const menuBtn = document.getElementById("chatHeaderMenuBtn");
  if (menuBtn && !menuBtn.dataset.bound) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentThreadUser) openUserProfile(currentThreadUser, { fromMenu: true });
    });
    menuBtn.dataset.bound = "true";
  }
});

let selectedMessageForAction = null;
let editingMessageData = null;

function handleLongPressMenu(msg, text, isSelf) {
  selectedMessageForAction = { msg, text };

  const modal = document.getElementById("messageOptionsModal");
  if (!modal) return;

  // Show Edit only if it's your own message
  modal.querySelector('[onclick="editMessage()"]').style.display = isSelf ? "flex" : "none";
  modal.querySelector('[onclick="deleteForMe()"]').style.display = "flex";
  modal.querySelector('[onclick="deleteForEveryone()"]').style.display = isSelf ? "flex" : "none";

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

/* ===== Edit Message ===== */
function editMessage() {
  closeOptionsModal();
  if (!selectedMessageForAction || selectedMessageForAction.msg.from !== currentUser.uid)
    return alert("⚠️ You can only edit your own messages.");

  editingMessageData = selectedMessageForAction;
  document.getElementById("editMessageInput").value = editingMessageData.text;
  document.getElementById("editMessageModal").style.display = "flex";
}

async function saveEditedMessage() {
  const newText = document.getElementById("editMessageInput").value.trim();
  if (!newText || !editingMessageData) return;

  const encrypted = CryptoJS.AES.encrypt(newText, "yourSecretKey").toString();
  const messageId = editingMessageData.msg.id;

  try {
    await pb.collection("thread_messages").update(messageId, {
      text: encrypted,
      edited: true
    });
    showToast("✏️ Message edited");
    closeEditModal();
    editingMessageData = null;
  } catch (err) {
    console.error("❌ Failed to edit:", err);
  }
}

function closeEditModal() {
  editingMessageData = null;
  document.getElementById("editMessageModal").style.display = "none";
}

async function deleteForMe() {
  closeOptionsModal();
  if (!selectedMessageForAction) return;

  const { msg } = selectedMessageForAction;
  const messageId = msg.id;

  try {
    const updated = Array.isArray(msg.deletedFor) ? [...msg.deletedFor, currentUser.id] : [currentUser.id];
    await pb.collection("thread_messages").update(messageId, {
      deletedFor: updated
    });

    showToast("🗑️ Message deleted for you");
    document.querySelector(`.message-bubble[data-msg-id="${msg.id}"]`)?.parentElement?.remove();
  } catch (err) {
    console.error("❌ Failed to delete for me:", err);
  }
}

async function deleteForEveryone() {
  closeOptionsModal();

  if (!selectedMessageForAction || selectedMessageForAction.msg.from !== currentUser.id) {
    return alert("⚠️ You can only delete your own messages.");
  }

  const { msg } = selectedMessageForAction;
  const messageId = msg.id;

  try {
    await pb.collection("thread_messages").update(messageId, {
      text: "",
      deletedFor: [currentUser.id, currentThreadUser]
    });

    showToast("✅ Message deleted for everyone");
    document.querySelector(`.message-bubble[data-msg-id="${msg.id}"]`)?.parentElement?.remove();
  } catch (err) {
    console.error("❌ Failed to delete for everyone:", err);
  }
}

function showToast(message) {
  const toast = document.getElementById("chatToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

/* =========================================================
 * PART 5: FINAL UTILITIES & HELPERS
 * ======================================================= */

/* ---------- Scroll Helpers ---------- */
function scrollToMessage(msgId) {
  const bubble = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
  if (bubble) {
    bubble.classList.add("highlight");
    bubble.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => bubble.classList.remove("highlight"), 2000);
  }
}

function scrollToReplyMessage(msgId) {
  scrollToMessage(msgId);
}

function scrollToBottomThread(smooth = false) {
  const area = document.getElementById("threadMessages");
  if (area) {
    area.scrollTo({
      top: area.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  }
}

/* ---------- Input Auto-Resize ---------- */
function autoResizeInput(inputEl) {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}

/* ---------- Toast Notification ---------- */
function showToast(message) {
  const toast = document.getElementById("chatToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

/* ---------- Day Separator Helpers ---------- */
function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function formatDaySeparator(date) {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- Escape HTML (for security) ---------- */
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Username with Badge ---------- */
function usernameWithBadge(uid, name) {
  const isDeveloper = uid === "moneythepro";
  const badge = isDeveloper
    ? ` <i data-lucide="check-circle" class="verified-badge"></i>`
    : "";
  return `${escapeHtml(name || "User")}${badge}`;
}

function switchSearchView(view) {
  document.getElementById("searchResultsUser").style.display = view === "user" ? "block" : "none";
  document.getElementById("searchResultsGroup").style.display = view === "group" ? "block" : "none";
}

async function runSearch() {
  const inputEl = document.getElementById("searchInput");
  if (!inputEl || !currentUser) return;

  const rawTerm = inputEl.value.trim();
  if (!rawTerm) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");
  if (userResults) userResults.innerHTML = "";
  if (groupResults) groupResults.innerHTML = "";

  const searchTerm = rawTerm.toLowerCase();

  /* ---------------- USER SEARCH ---------------- */
  try {
    const users = await pb.collection("users").getFullList({
      filter: `username ~ "${searchTerm}"`,
      sort: "username"
    });

    if (!userResults) return;
    if (!users.length) {
      userResults.innerHTML = `<div class="no-results">No users found.</div>`;
    }

    const friendChecks = [];

    for (const user of users) {
      if (user.id === currentUser.id) continue;

      const avatar = user.avatar
        ? pb.files.getUrl(user, user.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

      const unameHtml = usernameWithBadge(user.id, user.username || "unknown");

      const card = document.createElement("div");
      card.className = "search-result";
      card.innerHTML = `
        <img src="${avatar}" class="search-avatar" />
        <div class="search-info">
          <div class="username">@${unameHtml}</div>
          <div class="bio">${escapeHtml(user.bio || "No bio")}</div>
        </div>
        <button id="friendBtn_${user.id}">Add Friend</button>
      `;
      userResults.appendChild(card);

      const btn = card.querySelector("button");
      if (btn) {
        const p = pb.collection("friends")
          .getFirstListItem(`from="${currentUser.id}" && to="${user.id}"`)
          .then(() => {
            btn.textContent = "Friend";
            btn.disabled = true;
            btn.classList.add("disabled-btn");
          })
          .catch(() => {
            btn.onclick = () => addFriend(user.id);
          });
        friendChecks.push(p);
      }
    }

    await Promise.all(friendChecks);
    lucide?.createIcons();
  } catch (err) {
    console.error("❌ User search failed:", err);
  }

  /* ---------------- GROUP SEARCH ---------------- */
  try {
    const groups = await pb.collection("groups").getFullList({
      filter: `name ~ "${searchTerm}"`,
      sort: "name"
    });

    if (!groupResults) return;
    if (!groups.length) {
      groupResults.innerHTML = `<div class="no-results">No groups found.</div>`;
    }

    for (const group of groups) {
      const icon = group.icon || "group-icon.png";
      const members = group.members || [];
      const joined = members.includes(currentUser.id);

      const card = document.createElement("div");
      card.className = "search-result";
      card.innerHTML = `
        <img src="${icon}" class="search-avatar" />
        <div class="search-info">
          <div class="username">#${escapeHtml(group.name || "unknown")}</div>
          <div class="bio">${escapeHtml(group.description || "No description.")}</div>
        </div>
        <button ${joined ? "disabled" : `onclick="joinGroupById('${group.id}')"`}>
          ${joined ? "Joined" : "Join"}
        </button>
      `;
      groupResults.appendChild(card);
    }

    lucide?.createIcons();
  } catch (err) {
    console.error("❌ Group search failed:", err);
  }
}

function openUserProfile(uid) {
  if (!uid) return;

  pb.collection("users").getOne(uid)
    .then(user => {
      const modal = document.getElementById("userProfileModal");
      if (!modal) return;

      const avatar = user.avatar
        ? pb.files.getUrl(user, user.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "User")}`;

      modal.querySelector(".profile-avatar").src = avatar;
      modal.querySelector(".profile-username").textContent = user.username || "User";
      modal.querySelector(".profile-email").textContent = user.email || "N/A";
      modal.classList.add("show");
    })
    .catch(err => {
      console.error("❌ Profile load error:", err);
      alert("⚠️ User profile not found");
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

async function viewMedia() {
  if (!currentRoom && !currentThreadUser) return alert("❌ No chat selected");

  const container = document.createElement("div");
  container.style.padding = "20px";

  try {
    const collectionName = currentRoom ? "group_messages" : "thread_messages";
    const filterStr = currentRoom
      ? `group="${currentRoom}" && fileURL != ""`
      : `thread="${threadId(currentUser.id, currentThreadUser)}" && fileURL != ""`;

    const messages = await pb.collection(collectionName).getFullList({
      filter: filterStr,
      sort: "-created",
      perPage: 20
    });

    if (!messages.length) return alert("📎 No media found");

    for (const msg of messages) {
      const div = document.createElement("div");
      div.style.marginBottom = "12px";
      div.innerHTML = `
        <p>${escapeHtml(msg.fromName || "User")} - ${new Date(msg.created).toLocaleString()}</p>
        <a href="${msg.fileURL}" target="_blank">${escapeHtml(msg.fileName || "Download File")}</a>
      `;
      container.appendChild(div);
    }

    showModal("📎 Shared Media", container.innerHTML);
  } catch (err) {
    console.error("❌ Media fetch failed:", err.message || err);
    alert("❌ Failed to load media.");
  }
}

async function leaveGroup() {
  if (!currentRoom) return;

  try {
    const group = await pb.collection("groups").getOne(currentRoom);
    const updatedMembers = (group.members || []).filter(id => id !== currentUser.id);
    await pb.collection("groups").update(currentRoom, { members: updatedMembers });

    alert("🚪 You left the group.");
    currentRoom = null;
    loadChatList?.();
    switchTab("chatTab");
  } catch (err) {
    console.error("❌ Failed to leave group:", err.message);
    alert("❌ Unable to leave group.");
  }
}

async function joinGroupById(groupId) {
  if (!currentUser || !groupId) return alert("⚠️ Invalid group or user.");

  try {
    const group = await pb.collection("groups").getOne(groupId);
    const members = new Set(group.members || []);
    members.add(currentUser.id);

    await pb.collection("groups").update(groupId, { members: Array.from(members) });

    alert("✅ Joined group!");
    loadChatList?.();
    loadGroups?.();
  } catch (err) {
    console.error("❌ Failed to join group:", err.message);
    alert("❌ Group not found or join failed.");
  }
}

let unsubscribeRoomMessages = null;

async function joinRoom(groupId) {
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

  try {
    const group = await pb.collection("groups").getOne(groupId);
    title.innerHTML = usernameWithBadge(group.id, group.name || "Group Chat");
    lucide?.createIcons();
  } catch {
    title.textContent = "Group (Not Found)";
  }

  if (unsubscribeRoomMessages) unsubscribeRoomMessages();
  if (unsubscribeTyping) unsubscribeTyping();

  listenToTyping(groupId, "group");

  unsubscribeRoomMessages = pb.collection("group_messages").subscribe("*", async ({ action, record }) => {
    if (record.group !== groupId) return;

    const msg = record;
    const isSelf = msg.from === currentUser.id;
    const bubble = document.createElement("div");
    bubble.className = "message-bubble " + (isSelf ? "right" : "left");

    let avatar = "default-avatar.png";
    try {
      const sender = await pb.collection("users").getOne(msg.from);
      avatar = sender.avatar
        ? pb.files.getUrl(sender, sender.avatar)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(sender.username || "User")}`;
    } catch (e) {
      console.warn("⚠️ Group sender avatar load failed:", e.message);
    }

    let decrypted;
    try {
      decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8) || "[Encrypted]";
    } catch {
      decrypted = "[Decryption failed]";
    }

    bubble.innerHTML = `
      <div class="msg-avatar"><img src="${avatar}" /></div>
      <div class="msg-content">
        <div class="msg-text">
          <strong>${usernameWithBadge(msg.from, msg.fromName || "User")}</strong><br>
          ${escapeHtml(decrypted)}
        </div>
        <div class="message-time">${timeSince(new Date(msg.created))}</div>
      </div>
    `;

    messageList.appendChild(bubble);
    messageList.scrollTop = messageList.scrollHeight;
    renderWithMagnetSupport?.("roomMessages");
    lucide?.createIcons();
  }, err => {
    console.error("❌ Room message error:", err.message || err);
    alert("❌ Failed to load group chat.");
  });
}

async function messageUser(uid, username) {
  if (!uid || !currentUser) return;

  try {
    const friend = await pb.collection("friends").getFirstListItem(`from="${currentUser.id}" && to="${uid}"`);
    if (friend) {
      openThread(uid, username || "Friend");
      document.getElementById("userFullProfile").style.display = "none";
      document.getElementById("viewProfileModal").style.display = "none";
    }
  } catch {
    alert("⚠️ Not friends yet. Send a request first.");
  }
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
 * Developer / verified badge tagging
 * Call as usernameWithBadge(uid, name) OR usernameWithBadge(nameOnly)
 * --------------------------------------------------------- */

// Add your verified PocketBase user record IDs here
const DEV_UIDS = [
  // "admin-user-id", // Replace with actual PocketBase record IDs
  "moneythepro", // Username match fallback
];

function usernameWithBadge(uidOrName, maybeName) {
  let uid = uidOrName;
  let name = maybeName;

  // Support 1-arg version: usernameWithBadge(nameOnly)
  if (typeof maybeName === "undefined") {
    name = uidOrName;
    uid = "";
  }

  const rawName = name || "User";
  const safe = escapeHtml(rawName);

  const lowerUid = (uid || "").toLowerCase();
  const lowerName = (rawName || "").toLowerCase();

  const isDev =
    DEV_UIDS.includes(lowerUid) ||
    DEV_UIDS.includes(lowerName) ||
    lowerName === "moneythepro" ||
    lowerUid === "moneythepro";

  if (isDev) {
    return `${safe} <i data-lucide="badge-check" class="dev-badge" aria-label="Verified"></i>`;
  }

  return safe;
}

// ✅ Add Developer Badge to a DOM Element
function applyDeveloperBadge(usernameElement, username) {
  if (!usernameElement || !username) return;

  const lower = username.trim().toLowerCase();
  const isDev = DEV_UIDS.includes(lower) || lower === "moneythepro";

  if (isDev && !usernameElement.querySelector(".dev-badge")) {
    const badge = document.createElement("i");
    badge.setAttribute("data-lucide", "badge-check");
    badge.className = "dev-badge";
    badge.style.marginLeft = "4px";
    usernameElement.appendChild(badge);
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}

// ✅ Automatically Add Badges Based on Text Content
function decorateUsernamesWithBadges() {
  document.querySelectorAll(
    ".search-username, .username-display, .chat-username, .message-username"
  ).forEach(el => {
    const raw = el.textContent.replace("@", "").trim();
    applyDeveloperBadge(el, raw);
  });
}

// Auto-decorate on DOM load
document.addEventListener("DOMContentLoaded", decorateUsernamesWithBadges);

// Observe DOM changes for dynamic badge rendering
const badgeObserver = new MutationObserver(() => {
  requestAnimationFrame(decorateUsernamesWithBadges);
});
badgeObserver.observe(document.body, { childList: true, subtree: true });

// ✅ Group controls (PocketBase version)

async function transferGroupOwnership(newOwnerId) {
  if (!currentRoom || !newOwnerId) return;
  try {
    const group = await pb.collection("groups").getOne(currentRoom);
    const updatedAdmins = Array.from(new Set([...(group.admins || []), newOwnerId]));
    await pb.collection("groups").update(currentRoom, {
      createdBy: newOwnerId,
      admins: updatedAdmins
    });
    alert("Ownership transferred.");
    loadGroupInfo(currentRoom);
  } catch (err) {
    console.error("❌ Ownership transfer failed:", err.message || err);
    alert("❌ Failed to transfer ownership.");
  }
}

async function deleteGroup(groupId) {
  if (!confirm("Are you sure? This will permanently delete the group.")) return;
  try {
    await pb.collection("groups").delete(groupId);
    alert("Group deleted.");
    loadChatList();
  } catch (err) {
    console.error("❌ Failed to delete group:", err.message || err);
    alert("❌ Could not delete group.");
  }
}

function reportUser(uid) {
  showModal("Report this user?", () => {
    alert("Thank you for reporting. Our team will review.");
    // Optional: store the report in PocketBase
    // pb.collection("reports").create({ reportedUser: uid, reporter: currentUser.id });
  });
}

async function clearThreadMessages() {
  const threadIdStr = threadId(currentUser.id, currentThreadUser);
  try {
    const messages = await pb.collection("messages").getFullList({
      filter: `thread = "${threadIdStr}"`,
      batch: 100
    });

    for (const msg of messages) {
      await pb.collection("messages").delete(msg.id);
    }

    alert("Messages cleared.");
  } catch (err) {
    console.error("❌ Failed to clear messages:", err.message || err);
    alert("❌ Could not clear messages.");
  }
}

// ✅ Scroll to bottom helper
function scrollToBottom(divId) {
  const div = document.getElementById(divId);
  if (div) div.scrollTop = div.scrollHeight;
}

// ✅ Group Invite to inbox (PocketBase version)
async function inviteToGroup(uid) {
  if (!currentGroupProfileId) return alert("❌ No group selected.");
  try {
    await pb.collection("inbox").create({
      user: uid,
      type: "group",
      from: currentGroupProfileId,
      fromName: "Group Invite",
      timestamp: new Date().toISOString(),
      read: false
    });
    alert("✅ Group invite sent!");
  } catch (err) {
    console.error("❌ Failed to send invite:", err.message);
    alert("❌ Could not send invite.");
  }
}

// ✅ Toast Message
function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ✅ Check if user is a friend (used in DMs)
async function isFriend(uid) {
  if (!currentUser?.id || !uid) return false;
  try {
    const records = await pb.collection("friends").getFullList({
      filter: `user = "${currentUser.id}" && friend = "${uid}"`,
      limit: 1
    });
    return records.length > 0;
  } catch (err) {
    console.error("❌ isFriend check failed:", err.message || err);
    return false;
  }
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
      window.visualViewport.addEventListener("resize", viewportChanged);
      window.visualViewport.addEventListener("scroll", viewportChanged);
    }
  });
})();

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
        input.value = input.value.slice(0, start) + chosenEmoji + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + chosenEmoji.length;
        input.focus();
      });
    }

    pickerOpen = !pickerOpen;
    pickerOpen ? emojiPicker.showPicker(emojiBtn) : emojiPicker.hidePicker();
  });
}
