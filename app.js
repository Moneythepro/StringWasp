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
function showLoading(state) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = state ? "flex" : "none";
}

// ===== Switch UI Tabs =====
function switchTab(id) {
  const tab = document.getElementById(id);
  if (!tab) {
    console.warn(`⚠️ Tab ${id} not found. Retrying...`);
    setTimeout(() => switchTab(id), 200);
    return;
  }

  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  tab.style.display = "block";
}

// ===== Invite Link via URL =====
const urlParams = new URLSearchParams(window.location.search);
const joinGroupId = urlParams.get("join");

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
      switchTab("usernameDialog");
    } else {
      document.getElementById("usernameDisplay").textContent = doc.data().username;
      loadMainUI();
    }
  });
}

// ===== Main App Load UI =====
function loadMainUI() {
  showLoading(true);
  document.getElementById("appPage").style.display = "block";

  loadProfile(() => {
    switchTab("chatTab");
    try { loadChatList(); } catch (e) { console.warn("Chats failed", e); }
    try { loadFriends(); } catch (e) { console.warn("Friends failed", e); }
    try { loadGroups?.(); } catch (e) { console.warn("Groups skipped", e); }

    setTimeout(() => showLoading(false), 300);
  });
}

// ===== Load App After Login (MUST BE AT BOTTOM) =====
auth.onAuthStateChanged(async user => {
  if (!user) {
    switchTab("loginPage");
    return;
  }

  currentUser = user;

  try {
    const doc = await db.collection("users").doc(user.uid).get();
    const data = doc.data();

    if (!data?.username) {
      switchTab("usernameDialog");
      return;
    }

    document.getElementById("usernameDisplay").textContent = data.username;
    document.querySelector(".profile-edit-label").onclick = () => {
      document.getElementById("profilePic").click();
    };

    // ✅ INIT UI
    loadMainUI();

    // ✅ Handle invite link
    if (joinGroupId) {
      tryJoinGroup(joinGroupId);
    }

  } catch (err) {
    console.error("❌ User load error:", err.message || err);
    alert("❌ Failed to load user info: " + (err.message || JSON.stringify(err)));
  }
});

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
  db.collection("users").doc(currentUser.uid).onSnapshot(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("profileName").value = data.name || "";
    document.getElementById("profileBio").value = data.bio || "";
    document.getElementById("profileGender").value = data.gender || "";
    document.getElementById("profilePhone").value = data.phone || "";
    document.getElementById("profileEmail").value = data.email || "";
    document.getElementById("profileUsername").value = data.username || "";

    const avatar = data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || "User")}`;
    document.getElementById("profilePicPreview").src = avatar;

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
  const input = document.getElementById("profilePic");
  if (input) input.click();
}

document.getElementById("profilePic").addEventListener("change", uploadProfilePic);

let cropper = null;

function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = document.getElementById("cropImage");
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
  if (!cropper || !currentUser) return;

  showLoading(true);

  try {
    const canvas = cropper.getCroppedCanvas({
      width: 300,
      height: 300,
      imageSmoothingQuality: "high"
    });

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.7)
    );

    // Convert to base64 string
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;

      await db.collection("users").doc(currentUser.uid).update({
        avatarBase64: base64
      });

      document.getElementById("profilePicPreview").src = base64;
      closeCropModal();
      alert("✅ Profile picture updated!");

      loadProfile();
      loadChatList();
    };

    reader.readAsDataURL(blob);
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

function confirmCrop() {
  if (!cropper || !currentUser) {
    alert("❌ Missing cropper or user.");
    return;
  }

  const canvas = cropper.getCroppedCanvas({ width: 200, height: 200 });
  if (!canvas) {
    alert("❌ Failed to get canvas.");
    return;
  }

  try {
    const base64 = canvas.toDataURL("image/jpeg", 0.7); // Compress and convert to base64

    // Update Firestore with base64 image
    db.collection("users").doc(currentUser.uid).update({
      avatarBase64: base64
    }).then(() => {
      document.getElementById("profilePicPreview").src = base64;
      closeCropModal();
      alert("✔ Profile picture updated for all users!");
    }).catch(err => {
      console.error("❌ Firestore update failed:", err.message || err);
      alert("❌ Failed to update avatar.");
    });
  } catch (e) {
    console.error("❌ Crop failed:", e.message || e);
    alert("❌ Crop or upload failed.");
  }
}

  
let currentProfileUID = null;

function viewUserProfile(uid) {
  currentProfileUID = uid;

  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) {
      alert("❌ User not found");
      return;
    }

    const data = doc.data();
    document.getElementById("viewProfileModal").style.display = "block";
    document.getElementById("viewProfilePic").src =
      data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || "User")}`;
    document.getElementById("viewProfileName").textContent = data.name || "Unnamed";
    document.getElementById("viewProfileUsername").textContent = `@${data.username || "unknown"}`;
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfileEmail").textContent = data.email || "";
    document.getElementById("viewProfileStatus").textContent = data.status || "";
  }).catch(err => {
    console.error("❌ Profile view error:", err.message || err);
    alert("❌ Failed to view profile.");
  });
}

window.currentGroupProfileId = null;

function viewGroupProfile(groupId) {
  currentGroupProfileId = groupId;

  db.collection("groups").doc(groupId).get().then(doc => {
    if (!doc.exists) {
      alert("❌ Group not found");
      return;
    }

    const g = doc.data();
    document.getElementById("groupInfoModal").style.display = "block";

    document.getElementById("groupIcon").src =
      g.icon || `https://ui-avatars.com/api/?name=${encodeURIComponent(g.name || "Group")}`;
    document.getElementById("groupName").textContent = g.name || "Unnamed Group";
    document.getElementById("groupDesc").textContent = g.description || "No description provided.";
    document.getElementById("groupOwnerText").textContent = "Owner: " + (g.ownerName || g.owner || "Unknown");
    document.getElementById("groupMembersText").textContent = "Members: " + (g.members?.length || 0);
  }).catch(err => {
    console.error("❌ Group view error:", err.message || err);
    alert("❌ Failed to load group info.");
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

// ===== Load All Chats (DMs + Groups) =====
function loadChatList() {
  const list = document.getElementById("chatList");
  if (list) list.innerHTML = ""; // ✅ clear first
  loadRealtimeGroups();   // ✅ Loads group chats
  loadFriendThreads();    // ✅ Loads DMs
  listenInbox();          // ✅ Load inbox badge
}

  // === Realtime Groups ===
function loadRealtimeGroups() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  if (unsubscribeGroups) unsubscribeGroups();

  unsubscribeGroups = db.collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(snapshot => {
      list.innerHTML = "";

      snapshot.forEach(doc => {
        const g = doc.data();
        const groupName = g.name || "Group";
        const avatar = g.icon || `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}`;

        let msgText = "[No message]";
        let isMedia = false;
        let timeAgo = "";

        if (typeof g.lastMessage === "object") {
          msgText = g.lastMessage.text || "[No message]";
          isMedia = !!g.lastMessage.fileURL;
          if (g.lastMessage.timestamp) {
            timeAgo = timeSince(g.lastMessage.timestamp);
          }
        } else if (typeof g.lastMessage === "string") {
          msgText = g.lastMessage;
        }

        const preview = isMedia ? "📎 Media File" : escapeHtml(msgText);
        const unread = g.unread?.[currentUser.uid] || 0;
        const badgeHTML = unread ? `<span class="badge">${unread}</span>` : "";

        const card = document.createElement("div");
        card.className = "chat-card";
        card.onclick = () => joinRoom(doc.id);
        card.innerHTML = `
          <img src="${avatar}" class="friend-avatar" />
          <div class="details">
            <div class="name">#${escapeHtml(groupName)} ${badgeHTML}</div>
            <div class="last-message">${preview}</div>
            <div class="last-time">${timeAgo}</div>
          </div>
          <div class="chat-actions">
            <button title="Mute">🔕</button>
            <button title="Archive">🗂️</button>
          </div>
        `;
        list.appendChild(card);
      });
    }, err => {
      console.error("📛 Error in groups snapshot:", err.message || err);
      alert("❌ Group chat failed: " + (err.message || err));
    });
}

function loadFriendThreads() {
  const list = document.getElementById("chatList");
  if (!list || !currentUser) return;

  if (unsubscribeThreads) unsubscribeThreads();

  unsubscribeThreads = db.collection("threads")
    .where("participants", "array-contains", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .onSnapshot(async snapshot => {
      list.innerHTML = "";

      for (const doc of snapshot.docs) {
        const t = doc.data();
        const otherUID = t.participants.find(p => p !== currentUser.uid);

        let name = "Friend";
        let avatar = "default-avatar.png";

        try {
          const userDoc = await db.collection("users").doc(otherUID).get();
          if (userDoc.exists) {
            const user = userDoc.data();
            name = user.username || user.name || "Friend";
            avatar = user.avatarBase64 || avatar;
          }
        } catch (e) {
          console.warn("⚠️ Failed to fetch user avatar:", e.message);
        }

        let msgText = "[No message]";
        let fromSelf = false;
        let isMedia = false;
        let timeAgo = "";

        if (typeof t.lastMessage === "object") {
          msgText = t.lastMessage.text || "[No message]";
          fromSelf = t.lastMessage.from === currentUser.uid;
          isMedia = !!t.lastMessage.fileURL;
          if (t.lastMessage.timestamp) {
            timeAgo = timeSince(t.lastMessage.timestamp);
          }
        } else if (typeof t.lastMessage === "string") {
          msgText = t.lastMessage;
        }

        const preview = isMedia ? "📎 Media File" : `${fromSelf ? "You: " : ""}${escapeHtml(msgText)}`;
        const unread = t.unread?.[currentUser.uid] || 0;
        const badgeHTML = unread ? `<span class="badge">${unread}</span>` : "";

        const card = document.createElement("div");
        card.className = "chat-card";
        card.onclick = () => openThread(otherUID, name);
        card.innerHTML = `
          <img src="${avatar}" class="friend-avatar" />
          <div class="details">
            <div class="name">@${escapeHtml(name)} ${badgeHTML}</div>
            <div class="last-message">${preview}</div>
            <div class="last-time">${timeAgo}</div>
          </div>
          <div class="chat-actions">
            <button title="Mute">🔕</button>
            <button title="Archive">🗂️</button>
          </div>
        `;
        list.appendChild(card);
      }
    }, err => {
      console.error("❌ Error loading friend threads:", err.message || err);
      alert("❌ Chat threads failed: " + (err.message || err));
    });
}

function openChatMenu() {
  const menu = document.getElementById("chatOptionsMenu");
  menu.style.display = (menu.style.display === "block") ? "none" : "block";
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

// ===== Escape HTML Utility =====
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

// ===== Listen to Inbox =====
function listenInbox() {
  const list = document.getElementById("inboxList");
  if (!list || !currentUser) return;

  if (unsubscribeInbox) unsubscribeInbox();

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
          if (!data.read) unreadCount++;

          let senderName = "Unknown";
          let fromUID = "";
          let avatarURL = "default-avatar.png";

          if (typeof data.from === "string") {
            fromUID = data.from;
            try {
              const senderDoc = await db.collection("users").doc(data.from).get();
              if (senderDoc.exists) {
                const senderData = senderDoc.data();
                senderName = senderData.username || senderData.name || "Unknown";
                avatarURL = senderData.photoURL || `https://ui-avatars.com/api/?name=${senderName}`;
              }
            } catch (e) { console.warn("⚠️ Sender fetch failed:", e.message); }
          } else if (typeof data.from === "object" && data.from.uid) {
            fromUID = data.from.uid;
            senderName = data.from.name || "Unknown";
          } else if (data.fromName) {
            senderName = data.fromName;
          } else {
            console.warn("⚠️ Malformed inbox entry:", data);
            continue; // skip invalid item
          }

          if (!data || !data.type || !data.timestamp || (!data.from && !data.fromName)) {
            console.warn("❌ Skipping invalid inbox entry:", doc.id);
            continue;
          }

          const typeText = data.type === "friend"
            ? "Friend Request"
            : data.type === "group"
              ? "Group Invite"
              : "Notification";

          const card = document.createElement("div");
          card.className = "inbox-card";
          card.innerHTML = `
            <img src="${avatarURL}" class="friend-avatar" />
            <div>
              <strong>${escapeHtml(typeText)}</strong><br>
              From: ${escapeHtml(senderName)}
            </div>
            <div class="btn-group">
              <button onclick="acceptInbox('${doc.id}', '${data.type}', '${fromUID}')">✔</button>
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

      } catch (err) {
        const msg = err?.message || JSON.stringify(err, null, 2) || String(err);
        console.error("❌ Inbox render failed:", msg);
        alert("❌ Inbox failed:\n" + msg);
        document.body.innerHTML += `<pre style="color:red;font-size:12px;background:#000;padding:10px;overflow:auto;">
🔥 RENDER ERROR: ${escapeHtml(JSON.stringify(err, null, 2))}
</pre>`;
      }
    }, (err) => {
      const msg = err?.message || JSON.stringify(err, null, 2) || String(err);
      console.error("❌ Inbox snapshot error:", msg);
      console.error("🔥 Full error object:", err);
      alert("❌ Inbox listener failed:\n" + msg);
      document.body.innerHTML += `<pre style="color:red;font-size:12px;background:#000;padding:10px;overflow:auto;">
🔥 SNAPSHOT ERROR: ${escapeHtml(JSON.stringify(err, null, 2))}
</pre>`;
    });
}

// ===== Accept Inbox Item =====
function acceptInbox(docId, type, fromUID) {
  if (!currentUser || !docId || !type || !fromUID) return;

  const inboxRef = db.collection("inbox").doc(currentUser.uid).collection("items").doc(docId);

  if (type === "friend") {
    // Add each other to friend list
    const batch = db.batch();
    const userRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(fromUID);
    const friendRef = db.collection("users").doc(fromUID).collection("friends").doc(currentUser.uid);

    batch.set(userRef, { addedAt: Date.now() });
    batch.set(friendRef, { addedAt: Date.now() });
    batch.update(inboxRef, { read: true });

    batch.commit().then(() => {
      alert("✅ Friend added!");
      inboxRef.delete(); // remove from inbox
    }).catch(err => {
      console.error("❌ Friend accept failed:", err.message);
      alert("❌ Could not accept friend.");
    });

  } else if (type === "group") {
    // Join group by ID
    db.collection("groups").doc(fromUID).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    }).then(() => {
      alert("✅ Joined group!");
      inboxRef.delete();
    }).catch(err => {
      console.error("❌ Group join failed:", err.message);
      alert("❌ Could not join group.");
    });

  } else {
    alert("⚠️ Unknown request type.");
  }
}

// ===== Decline Inbox Item =====
function declineInbox(docId) {
  if (!currentUser || !docId) return;

  db.collection("inbox").doc(currentUser.uid).collection("items").doc(docId).delete()
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

// ===== Friend List =====
function loadFriends() {
  const list = document.getElementById("friendsList");
  if (!list || !currentUser) return;

  list.innerHTML = "<em>Loading friends...</em>";

  db.collection("users").doc(currentUser.uid).collection("friends").get()
    .then(snapshot => {
      list.innerHTML = "";

      snapshot.forEach(doc => {
        const div = document.createElement("div");
        div.className = "friend-entry";

        db.collection("users").doc(doc.id).get()
          .then(friendDoc => {
            const friend = friendDoc.data() || {};
            const username = friend.username || friend.email || doc.id;

            div.innerHTML = `
              <img src="${friend.photoURL || 'default-avatar.png'}" class="friend-avatar" />
              <div class="friend-name">${username}</div>
              <button onclick="openThread('${doc.id}', '${escapeHtml(username)}')">💬 Chat</button>
            `;
            list.appendChild(div);
          })
          .catch(err => {
            console.error(`❌ Error fetching friend profile (${doc.id}):`, err.message || err);
          });
      });
    })
    .catch(err => {
      console.error("❌ Error loading friends:", err.message || err);
      list.innerHTML = "<p style='color:red'>Failed to load friends.</p>";
    });
}

// ==== Add Friend Shortcut ====
function addFriend(uid) {
  if (!uid || !currentUser) return;

  if (uid === currentUser.uid) {
    alert("❌ You can't add yourself.");
    return;
  }

  // Step 1: Check if already friends
  const friendRef = db.collection("users").doc(currentUser.uid).collection("friends").doc(uid);
  friendRef.get().then(doc => {
    if (doc.exists) {
      alert("✅ Already friends!");
      return;
    }

    // Step 2: Send friend request to inbox (flat, valid format)
    const inboxRef = db.collection("inbox").doc(uid).collection("items");
    inboxRef.add({
      type: "friend",
      from: currentUser.uid, // ✅ must match Firestore rule
      fromName: currentUser.displayName || currentUser.email || "Unknown",
      read: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      alert("✅ Friend request sent!");
    }).catch(err => {
      console.error("❌ Friend request failed:", err.message || err);
      alert("❌ Failed to send friend request");
    });
  }).catch(err => {
    console.error("❌ Friend check error:", err.message || err);
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

function openThread(uid, username) {
  if (!currentUser || !uid) return;

  db.collection("users")
    .doc(currentUser.uid)
    .collection("friends")
    .doc(uid)
    .get()
    .then(friendDoc => {
      if (!friendDoc.exists) {
        alert("🔒 You must be friends to start a chat.");
        return;
      }

      currentThreadUser = uid;
      switchTab("threadView");

      document.getElementById("threadWithName").textContent = username;
      document.getElementById("roomDropdown").style.display = "none";
      document.querySelector(".group-info").style.display = "none";

      if (unsubscribeThread) unsubscribeThread();

      const docId = threadId(currentUser.uid, uid);
      const area = document.getElementById("threadMessages");

      // 🔄 Listen for typing status
      const typingArea = document.getElementById("threadTypingStatus");
      typingArea.textContent = "";

      unsubscribeTyping = db.collection("threads")
  .doc(docId)
  .collection("typing")
  .onSnapshot(snapshot => {
    const others = snapshot.docs.filter(doc => doc.id !== currentUser.uid);
    typingArea.textContent = others.length ? "✍️ Typing..." : "";
});

      // ✅ Reset unread count
      db.collection("threads").doc(docId).set({
        unread: { [currentUser.uid]: 0 }
      }, { merge: true });

      // 🔁 Listen for messages
      unsubscribeThread = db.collection("threads")
        .doc(docId)
        .collection("messages")
        .orderBy("timestamp")
        .onSnapshot(async snapshot => {
          area.innerHTML = "";

          for (const doc of snapshot.docs) {
            const msg = doc.data();
            if (!msg?.text) continue;

            // 🔐 Decrypt message
            let decrypted = "";
            try {
              decrypted = CryptoJS.AES.decrypt(msg.text, "yourSecretKey").toString(CryptoJS.enc.Utf8);
              if (!decrypted) decrypted = "[Encrypted]";
            } catch (e) {
              decrypted = "[Failed to decrypt]";
            }

            // 👤 Fetch sender avatar
            let avatar = "default-avatar.png";
            try {
              const userDoc = await db.collection("users").doc(msg.from).get();
              if (userDoc.exists) {
                const userData = userDoc.data();
                avatar = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username || "User")}`;
              }
            } catch (e) {
              console.warn("⚠️ Avatar fetch failed:", e.message);
            }

            // 🧾 Message bubble
            const isSelf = msg.from === currentUser.uid;
            const bubble = document.createElement("div");
            bubble.className = "message-bubble " + (isSelf ? "right" : "left");

            bubble.innerHTML = `
              <div class="msg-avatar">
                <img src="${avatar}" alt="avatar" />
              </div>
              <div class="msg-content">
                <div class="msg-text">
                  <strong>${escapeHtml(msg.fromName || "User")}</strong><br>
                  ${escapeHtml(decrypted)}
                </div>
                <div class="message-time">${msg.timestamp?.toDate ? timeSince(msg.timestamp.toDate()) : ""}</div>
              </div>
            `;

            area.appendChild(bubble);
          }

          area.scrollTop = area.scrollHeight;
          renderWithMagnetSupport?.("threadMessages");
        }, err => {
          console.error("❌ Thread snapshot error:", err.message || err);
          alert("❌ Failed to load messages: " + (err.message || err));
        });
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


// ===== DM: Send Thread Message with AES Encryption =====
function sendThreadMessage() {
  const input = document.getElementById("threadInput");
  const text = input?.value.trim();
  if (!text || !currentThreadUser) return;

  const fromName = document.getElementById("usernameDisplay").textContent;
  const encryptedText = CryptoJS.AES.encrypt(text, "yourSecretKey").toString();
  const docId = threadId(currentUser.uid, currentThreadUser);
  const threadRef = db.collection("threads").doc(docId);

  const message = {
    text: encryptedText,
    from: currentUser.uid,
    fromName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  threadRef.collection("messages").add(message).then(() => {
    input.value = "";

    threadRef.set({
      participants: [currentUser.uid, currentThreadUser],
      names: {
        [currentUser.uid]: fromName,
        [currentThreadUser]: document.getElementById("threadWithName").textContent || "Friend"
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

// ===== Typing Indicator =====
function handleTyping(type) {
  if (!currentUser) return;

  const typingRef = type === "group"
    ? db.collection("groups").doc(currentRoom).collection("typing").doc(currentUser.uid)
    : db.collection("threads").doc(threadId(currentUser.uid, currentThreadUser)).collection("typing").doc(currentUser.uid);

  typingRef.set({ typing: true }).catch(console.warn);
  setTimeout(() => typingRef.delete().catch(() => {}), 2000);
}

// ===== Search (Users + Groups) =====
function runSearch() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!term) return;

  const userResults = document.getElementById("searchResultsUser");
  const groupResults = document.getElementById("searchResultsGroup");

  userResults.innerHTML = "<p>Loading users...</p>";
  groupResults.innerHTML = "<p>Loading groups...</p>";

  // 🔍 USERS SEARCH
  db.collection("users")
    .where("username", ">=", term)
    .where("username", "<=", term + "\uf8ff")
    .limit(10)
    .get()
    .then(snapshot => {
      userResults.innerHTML = "";
      if (snapshot.empty) {
        userResults.innerHTML = "<p>No users found.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const user = doc.data();
        const card = document.createElement("div");
        card.className = "search-card";
        card.innerHTML = `
          <img src="${user.photoURL || 'default-avatar.png'}" class="friend-avatar" />
          <div>
            <strong>${escapeHtml(user.username)}</strong><br>
            ${escapeHtml(user.name || "")}
          </div>
          <button onclick="viewUserProfile('${doc.id}')">View</button>
        `;
        userResults.appendChild(card);
      });
    })
    .catch(err => {
      console.error("❌ User search failed:", err.message || err);
      userResults.innerHTML = "<p>Error loading users.</p>";
    });

  // 🔍 GROUPS SEARCH
  db.collection("groups")
    .where("name", ">=", term)
    .where("name", "<=", term + "\uf8ff")
    .limit(10)
    .get()
    .then(snapshot => {
      groupResults.innerHTML = "";
      if (snapshot.empty) {
        groupResults.innerHTML = "<p>No groups found.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const group = doc.data();
        const card = document.createElement("div");
        card.className = "search-card";
        card.innerHTML = `
          <strong>${escapeHtml(group.name)}</strong><br>
          <button onclick="viewGroupProfile('${doc.id}')">View</button>
        `;
        groupResults.appendChild(card);
      });
    })
    .catch(err => {
      console.error("❌ Group search failed:", err.message || err);
      groupResults.innerHTML = "<p>Error loading groups.</p>";
    });
}

function searchChats() {
  const term = document.getElementById("chatSearchInput")?.value.toLowerCase();
  const cards = document.querySelectorAll("#chatList .chat-card");

  cards.forEach(card => {
    const name = card.querySelector(".name")?.textContent.toLowerCase() || "";
    card.style.display = name.includes(term) ? "flex" : "none";
  });
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

function joinRoom(roomId) {
  currentRoom = roomId;

  switchTab("roomView");
  document.getElementById("roomDropdown").style.display = "block";
  document.querySelector(".group-info").style.display = "flex";

  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();

  listenMessages();       // ✅ Listen to group messages
  loadGroupInfo(roomId);  // ✅ Load name, members, description, etc.
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
  });
}

// Declare modal globally
const modal = document.getElementById("customModal");

document.getElementById("modalNo").onclick = () => {
  modal.style.display = "none";
};

function showModal(title, html) {
  modal.querySelector("#modalMessage").innerHTML = html;
  modal.querySelector("#modalYes").style.display = "none";
  modal.querySelector("#modalNo").textContent = "Close";
  modal.style.display = "flex";
}

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

// ===== Search Result Click: View Profile Modal =====
function viewUserProfile(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("viewProfileUsername").textContent = "@" + (data.username || "unknown");
    document.getElementById("viewProfileName").textContent = data.name || "";
    document.getElementById("viewProfileBio").textContent = data.bio || "No bio";
    document.getElementById("viewProfilePic").src = data.photoURL || "default-avatar.png";
    currentThreadUser = uid;

    document.getElementById("viewProfileModal").style.display = "flex";
  });
}

// ===== Close Profile Modal =====
function closeProfileModal() {
  document.getElementById("viewProfileModal").style.display = "none";
}

// ===== Toggle Dark Theme Persistently =====
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");

  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = isDark;
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
