// app.js

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll("nav button");
  const tabContents = document.querySelectorAll(".tab");
  const themeToggle = document.getElementById("themeToggle");
  const panicBtn = document.getElementById("panicBtn");

  const showTab = (tabId) => {
    tabContents.forEach((tab) => tab.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
  };

  tabs.forEach((btn) =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab))
  );

  // Theme toggle
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.add(`${savedTheme}-theme`);
  themeToggle.value = savedTheme;

  themeToggle.addEventListener("change", () => {
    document.body.classList.remove("light-theme", "dark-theme");
    document.body.classList.add(`${themeToggle.value}-theme`);
    localStorage.setItem("theme", themeToggle.value);
    saveUserSetting("theme", themeToggle.value);
  });

  // Panic Button
  panicBtn.addEventListener("click", () => {
    window.location.href = "https://google.com";
  });

  // Authentication
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      document.getElementById("init-overlay").style.display = "none";
      loadUserSettings(user);
      initApp(user);
    } else {
      firebase.auth().signInAnonymously().catch(console.error);
    }
  });

  async function saveUserSetting(key, value) {
    const user = firebase.auth().currentUser;
    if (user) {
      await db.collection("users").doc(user.uid).set({ [key]: value }, { merge: true });
    }
  }

  async function loadUserSettings(user) {
    const doc = await db.collection("users").doc(user.uid).get();
    const data = doc.data() || {};

    if (data.theme) {
      document.body.classList.remove("light-theme", "dark-theme");
      document.body.classList.add(`${data.theme}-theme`);
      themeToggle.value = data.theme;
    }

    if (data.emotion) document.getElementById("emotionToggle").checked = data.emotion;
    if (data.lastSeen !== false) updateLastSeen(user.uid);
    if (data.music) document.getElementById("musicToggle").checked = data.music;

    if (data.displayName) document.getElementById("displayName").value = data.displayName;
    if (data.photoURL) document.getElementById("profilePicPreview").src = data.photoURL;
  }

  function updateLastSeen(uid) {
    db.collection("users").doc(uid).set({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // Profile settings
  document.getElementById("saveProfile").addEventListener("click", async () => {
    const user = firebase.auth().currentUser;
    const displayName = document.getElementById("displayName").value;
    const photo = document.getElementById("profilePic").files[0];
    const updates = {
      displayName,
      emotion: document.getElementById("emotionToggle").checked,
      music: document.getElementById("musicToggle").checked,
      lastSeen: !document.getElementById("lastSeenToggle").checked
    };

    if (photo) {
      const ref = storage.ref(`profilePics/${user.uid}`);
      await ref.put(photo);
      updates.photoURL = await ref.getDownloadURL();
      document.getElementById("profilePicPreview").src = updates.photoURL;
    }

    await db.collection("users").doc(user.uid).set(updates, { merge: true });
  });

  // Messaging
  const sendMessage = async () => {
    const user = firebase.auth().currentUser;
    const text = document.getElementById("chatInput").value;
    const isAnon = document.getElementById("anonToggle").checked;
    if (!text.trim()) return;

    const encrypted = btoa(text);

    await db.collection("messages").add({
      uid: user.uid,
      text: encrypted,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      anonymous: isAnon
    });

    document.getElementById("chatInput").value = "";
  };

  document.getElementById("sendBtn").addEventListener("click", sendMessage);

  db.collection("messages").orderBy("createdAt").onSnapshot(snapshot => {
    const container = document.getElementById("chatMessages");
    container.innerHTML = "";
    snapshot.forEach(doc => {
      const msg = doc.data();
      const div = document.createElement("div");
      div.className = "message";
      if (msg.uid === firebase.auth().currentUser.uid) div.classList.add("self");
      if (msg.anonymous) {
        div.classList.add("anonymous");
        div.textContent = `Anonymous: ${atob(msg.text)}`;
      } else {
        div.textContent = `${msg.uid.substring(0, 6)}: ${atob(msg.text)}`;
      }
      container.appendChild(div);
    });
  });

  // Friends
  async function sendFriendRequest(targetUid) {
    const uid = firebase.auth().currentUser.uid;
    await db.collection("friendRequests").add({ from: uid, to: targetUid });
  }

  db.collection("friendRequests")
    .where("to", "==", firebase.auth().currentUser?.uid)
    .onSnapshot(snapshot => {
      const list = document.getElementById("friendRequests");
      list.innerHTML = "";
      snapshot.forEach(doc => {
        const req = doc.data();
        const item = document.createElement("div");
        item.innerHTML = `From: ${req.from.substring(0, 6)}
          <button onclick="acceptFriend('${req.from}', '${doc.id}')">Accept</button>
          <button onclick="rejectFriend('${doc.id}')">Reject</button>`;
        list.appendChild(item);
      });
    });

  window.acceptFriend = async (friendUid, requestId) => {
    const uid = firebase.auth().currentUser.uid;
    await db.collection("friends").add({ uids: [uid, friendUid] });
    await db.collection("friendRequests").doc(requestId).delete();
  };

  window.rejectFriend = async (requestId) => {
    await db.collection("friendRequests").doc(requestId).delete();
  };

  db.collection("friends").onSnapshot(snapshot => {
    const uid = firebase.auth().currentUser?.uid;
    const list = document.getElementById("friendList");
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.uids.includes(uid)) {
        const friendUid = data.uids.find(u => u !== uid);
        const div = document.createElement("div");
        div.textContent = `Friend: ${friendUid.substring(0, 6)}`;
        list.appendChild(div);
      }
    });
  });

  // Explore Tab
  db.collection("users").onSnapshot(snapshot => {
    const uid = firebase.auth().currentUser?.uid;
    const container = document.getElementById("userList");
    container.innerHTML = "";
    snapshot.forEach(doc => {
      const user = doc.data();
      if (doc.id !== uid) {
        const div = document.createElement("div");
        div.innerHTML = `${user.displayName || doc.id.substring(0, 6)} 
        ${user.lastSeen ? ` - Last Seen: ${user.lastSeen.toDate().toLocaleString()}` : ""}
        <button onclick="sendFriendRequest('${doc.id}')">Add Friend</button>`;
        container.appendChild(div);
      }
    });
  });

  // Groups
  document.getElementById("createGroupBtn").addEventListener("click", async () => {
    const name = document.getElementById("groupName").value;
    const isPrivate = document.getElementById("groupPrivate").checked;
    const uid = firebase.auth().currentUser.uid;
    if (!name.trim()) return;

    const ref = await db.collection("groups").add({
      name,
      private: isPrivate,
      owner: uid,
      members: { [uid]: "owner" }
    });

    alert(`Group created with ID: ${ref.id}`);
    document.getElementById("groupName").value = "";
  });

  document.getElementById("joinGroupBtn").addEventListener("click", async () => {
    const id = document.getElementById("groupId").value;
    const uid = firebase.auth().currentUser.uid;
    const ref = db.collection("groups").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return alert("Group not found");

    const data = doc.data();
    if (data.private && !data.members[uid]) return alert("Private group");
    await ref.update({ [`members.${uid}`]: "member" });
    alert("Joined group");
  });

  db.collection("groups").onSnapshot(snapshot => {
    const list = document.getElementById("groupList");
    list.innerHTML = "";
    snapshot.forEach(doc => {
      const group = doc.data();
      const li = document.createElement("div");
      li.innerHTML = `${group.name} (${Object.keys(group.members || {}).length}) - ${group.private ? "Private" : "Public"}`;
      list.appendChild(li);
    });
  });

  document.getElementById("sendGroupMsg").addEventListener("click", async () => {
    const uid = firebase.auth().currentUser.uid;
    const text = document.getElementById("groupMsg").value;
    const isAnon = document.getElementById("groupAnon").checked;
    const groupId = document.getElementById("groupId").value;

    if (!text.trim() || !groupId) return;
    const encrypted = btoa(text);

    await db.collection("groups").doc(groupId).collection("messages").add({
      uid,
      text: encrypted,
      anonymous: isAnon,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById("groupMsg").value = "";
  });

  document.getElementById("groupId").addEventListener("input", (e) => {
    const groupId = e.target.value;
    if (!groupId) return;
    db.collection("groups").doc(groupId).collection("messages")
      .orderBy("createdAt")
      .onSnapshot(snapshot => {
        const container = document.getElementById("groupMessages");
        container.innerHTML = "";
        snapshot.forEach(doc => {
          const msg = doc.data();
          const div = document.createElement("div");
          div.className = "message";
          if (msg.anonymous) {
            div.textContent = `Anonymous: ${atob(msg.text)}`;
            div.classList.add("anonymous");
          } else {
            const sender = msg.uid.substring(0, 6);
            div.textContent = `${sender}: ${atob(msg.text)}`;
          }
          container.appendChild(div);
        });
      });
  });
});
