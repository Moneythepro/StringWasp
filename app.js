<script>
window.onload = () => {
  // ---------- GLOBALS ----------
  let currentRoom = "general", typingTimeout, lastMessageTS = 0;
  let unsubscribeChat, unsubscribeTyping, unsubscribeRoomDoc;
  const audio = document.getElementById("notifSound");

  // ---------- UTILS ----------
  function showLoading(show) {
    document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
  }
  function switchTab(id) {
    document.querySelectorAll(".tab, .tabContent").forEach(e => e.style.display = "none");
    document.getElementById(id).style.display = "block";
  }

  // ---------- AUTH ----------
  auth.onAuthStateChanged(async user => {
    if (!user) return switchTab("loginPage");
    document.getElementById("usernameDisplay").textContent = user.email;
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists || !doc.data().username) {
      document.getElementById("usernameDialog").style.display = "block";
    } else {
      startApp(user);
    }
  });

  async function saveUsername() {
    const username = document.getElementById("newUsername").value.trim();
    if (!username) return alert("Pick a username");
    const user = auth.currentUser;
    await db.collection("users").doc(user.uid).set({
      email: user.email, username, joined: Date.now()
    });
    document.getElementById("usernameDialog").style.display = "none";
    startApp(user);
  }

  function login() {
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value.trim();
    if (!email || !pass) return alert("Missing credentials");
    showLoading(true);
    auth.signInWithEmailAndPassword(email, pass).catch(e => {
      showLoading(false);
      alert(e.message);
    });
  }

  function register() {
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value.trim();
    if (!email || !pass) return alert("Missing credentials");
    showLoading(true);
    auth.createUserWithEmailAndPassword(email, pass).catch(e => {
      showLoading(false);
      alert(e.message);
    });
  }

  // ---------- APP START ----------
  async function startApp(user) {
    showLoading(true);
    await generateAndStoreKeys(user.uid);
    loadProfile(user.uid);
    await createRoomIfMissing("general");
    populateDropdown();
    joinRoom("general");
    loadInbox(user.uid);
    loadFriends(user.uid);
    switchTab("chatTab");
    showLoading(false);
  }

  async function generateAndStoreKeys(uid) {
    if (localStorage.getItem("privateKey")) return;
    const keys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const pub = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const priv = await crypto.subtle.exportKey("jwk", keys.privateKey);
    localStorage.setItem("publicKey", JSON.stringify(pub));
    localStorage.setItem("privateKey", JSON.stringify(priv));
    await db.collection("users").doc(uid).update({ publicKey: pub });
  }

  // ---------- ROOMS ----------
  async function createRoomIfMissing(name) {
    const ref = db.collection("rooms").doc(name);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        creator: auth.currentUser.email,
        admins: [auth.currentUser.email],
        members: [auth.currentUser.email],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  function populateDropdown() {
    const dd = document.getElementById("roomDropdown");
    db.collection("rooms").get().then(qs => {
      dd.innerHTML = "";
      qs.forEach(doc => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = `#${doc.id}`;
        dd.appendChild(opt);
      });
      dd.value = currentRoom;
    });
  }

  async function createOrJoinRoom() {
    const name = document.getElementById("customRoom").value.trim();
    if (!name) return;
    await createRoomIfMissing(name);
    await joinRoom(name);
    document.getElementById("customRoom").value = "";
  }

  async function joinRoom(name) {
    currentRoom = name;
    document.getElementById("roomDropdown").value = name;
    db.collection("rooms").doc(name).update({
      members: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.email)
    });

    if (unsubscribeRoomDoc) unsubscribeRoomDoc();
    unsubscribeRoomDoc = db.collection("rooms").doc(name)
      .onSnapshot(updateAdminPanel);

    listenForChat(name);
    listenForTyping(name);
  }

  // ---------- CHAT ----------
  function listenForChat(roomName) {
    if (unsubscribeChat) unsubscribeChat();
    unsubscribeChat = db.collection("messages").doc(roomName).collection("chat").orderBy("time")
      .onSnapshot(snap => {
        const box = document.getElementById("messages");
        box.innerHTML = "";
        snap.forEach(doc => {
          const d = doc.data();
          const div = document.createElement("div");
          div.className = "message";
          div.innerHTML = `<b>${d.sender}:</b> ${d.text || "[Encrypted]"}`;
          box.appendChild(div);
          if (d.time > lastMessageTS) {
            lastMessageTS = d.time;
            triggerNotification(d.sender, d.text);
          }
        });
        box.scrollTop = box.scrollHeight;
      });
  }

  async function sendMessage() {
    const val = document.getElementById("messageInput").value.trim();
    if (!val) return;
    await db.collection("messages").doc(currentRoom).collection("chat").add({
      sender: auth.currentUser.email,
      text: val,
      time: Date.now()
    });
    document.getElementById("messageInput").value = "";
    db.collection("typing").doc(currentRoom).set({ [auth.currentUser.email]: false }, { merge: true });
  }

  // ---------- TYPING ----------
  document.getElementById("messageInput").addEventListener("input", () => {
    const ref = db.collection("typing").doc(currentRoom);
    ref.set({ [auth.currentUser.email]: true }, { merge: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      ref.set({ [auth.currentUser.email]: false }, { merge: true });
    }, 3000);
  });

  function listenForTyping(roomName) {
    if (unsubscribeTyping) unsubscribeTyping();
    unsubscribeTyping = db.collection("typing").doc(roomName).onSnapshot(snap => {
      const d = snap.data() || {};
      const me = auth.currentUser.email;
      const others = Object.keys(d).filter(u => u !== me && d[u]);
      document.getElementById("typingIndicator").textContent =
        others.length ? `${others.join(", ")} typing...` : "";
    });
  }

  // ---------- SEARCH ----------
  async function runSearch() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    if (!query) return;
    const [users, rooms] = await Promise.all([
      db.collection("users").get(),
      db.collection("rooms").get()
    ]);
    const uBox = document.getElementById("searchResultsUser");
    const gBox = document.getElementById("searchResultsGroup");
    uBox.innerHTML = ""; gBox.innerHTML = "";
    users.forEach(doc => {
      const d = doc.data();
      if (d.username?.toLowerCase().includes(query)) {
        const isDev = d.username === "moneythepro" ? " 🛠️ Developer" : "";
        uBox.innerHTML += `<div class="search-item"><b>@${d.username}${isDev}</b><br>${d.bio || ""}
        <button onclick="sendFriendRequest('${doc.id}', '${d.username}')">Send Friend Request</button></div>`;
      }
    });
    rooms.forEach(doc => {
      if (doc.id.toLowerCase().includes(query)) {
        const d = doc.data();
        gBox.innerHTML += `<div class="search-item"><b>#${doc.id}</b><br>Members: ${d.members.length}
        <button onclick="requestJoinGroup('${doc.id}')">Request to Join</button></div>`;
      }
    });
  }

  // ---------- FRIENDS ----------
  function sendFriendRequest(uid, username) {
    const user = auth.currentUser;
    db.collection("users").doc(uid).collection("inbox").add({
      type: "friend_request",
      from: user.email,
      timestamp: Date.now()
    });
    alert(`Friend request sent to @${username}`);
  }

  function requestJoinGroup(groupId) {
    alert(`Requested to join #${groupId}`);
  }

  function loadFriends(uid) {
    const box = document.getElementById("friendsList");
    db.collection("users").get().then(qs => {
      box.innerHTML = "";
      qs.forEach(doc => {
        const d = doc.data();
        if (d.email !== auth.currentUser.email) {
          box.innerHTML += `<div class="search-item"><b>${d.username || d.email}</b>
          <button onclick="startThreadChat('${doc.id}', '${d.username || d.email}')">Message</button></div>`;
        }
      });
    });
  }

  function startThreadChat(uid, name) {
    document.getElementById("threadWithName").textContent = name;
    document.getElementById("threadMessages").innerHTML = "";
    switchTab("threadView");
    db.collection("threads").doc(makeThreadId(uid)).collection("chat").orderBy("time")
      .onSnapshot(snap => {
        const box = document.getElementById("threadMessages");
        box.innerHTML = "";
        snap.forEach(doc => {
          const d = doc.data();
          box.innerHTML += `<div class="message"><b>${d.sender}:</b> ${d.text}</div>`;
        });
        box.scrollTop = box.scrollHeight;
      });
  }

  function sendThreadMessage() {
    const input = document.getElementById("threadInput");
    const val = input.value.trim();
    if (!val) return;
    const uid = auth.currentUser.uid;
    const id = makeThreadId(uid);
    db.collection("threads").doc(id).collection("chat").add({
      sender: auth.currentUser.email,
      text: val,
      time: Date.now()
    });
    input.value = "";
  }

  function makeThreadId(uid2) {
    const uid1 = auth.currentUser.uid;
    return [uid1, uid2].sort().join("_");
  }

  function closeThread() {
    switchTab("friendsTab");
  }

  // ---------- INBOX ----------
  function loadInbox(uid) {
    const box = document.getElementById("inboxList");
    db.collection("users").doc(uid).collection("inbox").orderBy("timestamp", "desc")
      .onSnapshot(snap => {
        box.innerHTML = "";
        if (snap.empty) return box.innerHTML = "No notifications yet.";
        snap.forEach(doc => {
          const d = doc.data();
          if (d.type === "friend_request") {
            box.innerHTML += `<div class="inbox-card"><b>Friend request from ${d.from}</b>
              <button onclick="acceptInbox('${doc.id}', '${uid}')">Accept</button>
              <button onclick="declineInbox('${doc.id}', '${uid}')">Decline</button></div>`;
          }
        });
      });
  }

  function acceptInbox(docId, uid) {
    db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
    alert("Friend accepted!");
  }
  function declineInbox(docId, uid) {
    db.collection("users").doc(uid).collection("inbox").doc(docId).delete();
  }

  // ---------- PROFILE ----------
  function loadProfile(uid) {
    db.collection("users").doc(uid).get().then(doc => {
      const d = doc.data() || {};
      document.getElementById("profileName").value = d.name || "";
      document.getElementById("profileBio").value = d.bio || "";
    });
  }

  function saveProfile() {
    const user = auth.currentUser;
    db.collection("users").doc(user.uid).update({
      name: document.getElementById("profileName").value,
      bio: document.getElementById("profileBio").value
    }).then(() => alert("Profile updated"));
  }

  // ---------- ADMIN ----------
  function updateAdminPanel(doc) {
    const panel = document.getElementById("adminPanel");
    if (!doc.exists) return panel.style.display = "none";
    const d = doc.data();
    const me = auth.currentUser.email;
    if (!d.admins.includes(me) && d.creator !== me) return panel.style.display = "none";
    panel.style.display = "block";
    document.getElementById("adminInfo").textContent =
      `Creator: ${d.creator}\nAdmins: ${d.admins.join(", ")}`;
  }

  function getAdminInput() {
    return document.getElementById("memberEmail").value.trim();
  }

  async function addMember() {
    const email = getAdminInput(); if (!email) return;
    await db.collection("rooms").doc(currentRoom).update({
      members: firebase.firestore.FieldValue.arrayUnion(email)
    });
  }

  async function removeMember() {
    const email = getAdminInput(); if (!email) return;
    await db.collection("rooms").doc(currentRoom).update({
      members: firebase.firestore.FieldValue.arrayRemove(email),
      admins: firebase.firestore.FieldValue.arrayRemove(email)
    });
  }

  async function promoteMember() {
    const email = getAdminInput(); if (!email) return;
    const snap = await db.collection("rooms").doc(currentRoom).get();
    const d = snap.data();
    if (d.admins.length >= 3) return alert("Max 3 admins.");
    if (!d.members.includes(email)) return alert("User must be a member.");
    await db.collection("rooms").doc(currentRoom).update({
      admins: firebase.firestore.FieldValue.arrayUnion(email)
    });
  }

  // ---------- NOTIFICATIONS ----------
  function triggerNotification(sender, msg) {
    if (Notification.permission === "granted") {
      new Notification(`Message from ${sender}`, { body: msg });
    }
    if (audio) audio.play().catch(() => {});
  }

  if ("Notification" in window && Notification.permission !== "granted")
    Notification.requestPermission();

  // Startup
  switchTab("loginPage");
};
</script>
