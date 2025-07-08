// Firebase Auth & Firestore
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentRoom = 'global';
let currentThreadUser = null;
let unsubscribeMessages = null;
let unsubscribeThread = null;

// UI Helpers
function showTab(id) {
  document.querySelectorAll('.tab, .tabContent').forEach(el => el.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// Auth
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    checkUsername();
  } else {
    showTab('loginPage');
  }
});

function login() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  auth.signInWithEmailAndPassword(email, pass).catch(alert);
}

function register() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  auth.createUserWithEmailAndPassword(email, pass).catch(alert);
}

function checkUsername() {
  db.collection('users').doc(currentUser.uid).get().then(doc => {
    if (doc.exists && doc.data().username) {
      initApp(doc.data().username);
    } else {
      showTab('usernameDialog');
    }
  });
}

function saveUsername() {
  const uname = document.getElementById('newUsername').value.trim();
  if (!uname) return alert('Enter username');
  db.collection('users').where('username', '==', uname).get().then(snapshot => {
    if (!snapshot.empty) return alert('Username taken');
    db.collection('users').doc(currentUser.uid).set({
      username: uname,
      email: currentUser.email,
      dev: currentUser.email === "moneythepro7@gmail.com"
    });
    initApp(uname);
  });
}

// App Init
function initApp(username) {
  document.getElementById('usernameDisplay').innerText = `@${username}`;
  showTab('appPage');
  loadRooms();
  joinRoom(currentRoom);
  loadInbox();
  loadFriends();
  loadProfile();
}

// Tabs
function switchTab(tabId) {
  showTab(tabId);
}

// Rooms
function loadRooms() {
  db.collection('rooms').onSnapshot(snapshot => {
    const sel = document.getElementById('roomDropdown');
    sel.innerHTML = '';
    snapshot.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.innerText = doc.id;
      sel.appendChild(opt);
    });
    sel.value = currentRoom;
  });
}

function createOrJoinRoom() {
  const name = document.getElementById('customRoom').value.trim();
  if (name) joinRoom(name);
}

function joinRoom(name) {
  currentRoom = name;
  if (unsubscribeMessages) unsubscribeMessages();
  document.getElementById('messages').innerHTML = '';
  unsubscribeMessages = db.collection('rooms').doc(name).collection('messages').orderBy('timestamp')
    .onSnapshot(snapshot => {
      const msgBox = document.getElementById('messages');
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          const div = document.createElement('div');
          div.innerText = `${msg.sender}: ${msg.text}`;
          msgBox.appendChild(div);
        }
      });
    });
  showAdminPanel(name);
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;
  db.collection('rooms').doc(currentRoom).collection('messages').add({
    sender: currentUser.email,
    text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = '';
}

// Threaded Chat
function openThread(uid, name) {
  currentThreadUser = uid;
  showTab('threadView');
  document.getElementById('threadWithName').innerText = name;
  const threadRef = db.collection('users').doc(currentUser.uid).collection('threads').doc(uid);
  unsubscribeThread = threadRef.collection('messages').orderBy('timestamp').onSnapshot(snapshot => {
    const box = document.getElementById('threadMessages');
    box.innerHTML = '';
    snapshot.forEach(doc => {
      const msg = doc.data();
      const div = document.createElement('div');
      div.innerText = `${msg.sender}: ${msg.text}`;
      box.appendChild(div);
    });
  });
}

function closeThread() {
  if (unsubscribeThread) unsubscribeThread();
  currentThreadUser = null;
  showTab('friendsTab');
}

function sendThreadMessage() {
  const input = document.getElementById('threadInput');
  const text = input.value.trim();
  if (!text || !currentThreadUser) return;
  const myThread = db.collection('users').doc(currentUser.uid).collection('threads').doc(currentThreadUser);
  const theirThread = db.collection('users').doc(currentThreadUser).collection('threads').doc(currentUser.uid);
  const msg = {
    sender: currentUser.email,
    text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  myThread.collection('messages').add(msg);
  theirThread.collection('messages').add(msg);
  input.value = '';
}

// Inbox
function loadInbox() {
  db.collection('users').doc(currentUser.uid).collection('inbox').onSnapshot(snapshot => {
    const box = document.getElementById('inboxList');
    box.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement('div');
      div.className = 'inbox-card';
      div.innerText = `${data.type}: ${data.from}`;
      const btn = document.createElement('button');
      btn.innerText = "Accept";
      btn.onclick = () => acceptInbox(doc.id, data);
      div.appendChild(btn);
      box.appendChild(div);
    });
  });
}

function acceptInbox(id, data) {
  if (data.type === 'friend') {
    db.collection('users').doc(currentUser.uid).collection('friends').doc(data.fromUid).set({ since: Date.now() });
    db.collection('users').doc(data.fromUid).collection('friends').doc(currentUser.uid).set({ since: Date.now() });
  }
  db.collection('users').doc(currentUser.uid).collection('inbox').doc(id).delete();
}

// Friends
function loadFriends() {
  db.collection('users').doc(currentUser.uid).collection('friends').onSnapshot(snapshot => {
    const box = document.getElementById('friendsList');
    box.innerHTML = '';
    snapshot.forEach(doc => {
      const uid = doc.id;
      db.collection('users').doc(uid).get().then(userDoc => {
        const name = userDoc.data().username || uid;
        const div = document.createElement('div');
        div.className = 'friend-entry';
        div.innerText = name;
        div.onclick = () => openThread(uid, name);
        box.appendChild(div);
      });
    });
  });
}

// Search
function switchSearchView(view) {
  document.getElementById('searchResultsUser').style.display = view === 'user' ? 'block' : 'none';
  document.getElementById('searchResultsGroup').style.display = view === 'group' ? 'block' : 'none';
}

function runSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) return;

  const userResults = document.getElementById('searchResultsUser');
  userResults.innerHTML = '';
  db.collection('users').get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.username?.toLowerCase().includes(query)) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.innerText = data.username + (data.dev ? ' 🛠️ Developer' : '');
        div.onclick = () => sendFriendRequest(doc.id);
        userResults.appendChild(div);
      }
    });
  });

  const groupResults = document.getElementById('searchResultsGroup');
  groupResults.innerHTML = '';
  db.collection('rooms').get().then(snapshot => {
    snapshot.forEach(doc => {
      if (doc.id.toLowerCase().includes(query)) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.innerText = doc.id;
        groupResults.appendChild(div);
      }
    });
  });
}

function sendFriendRequest(uid) {
  db.collection('users').doc(uid).collection('inbox').add({
    type: 'friend',
    from: currentUser.email,
    fromUid: currentUser.uid
  });
  alert("Friend request sent!");
}

// Admin Tools
function showAdminPanel(room) {
  const adminBox = document.getElementById('adminPanel');
  db.collection('rooms').doc(room).get().then(doc => {
    const data = doc.data();
    if (!data || data.owner !== currentUser.uid) {
      adminBox.style.display = 'none';
      return;
    }
    document.getElementById('adminInfo').innerText = `Owner: ${data.owner}`;
    adminBox.style.display = 'block';
  });
}

function addMember() {
  const email = document.getElementById('memberEmail').value.trim();
  if (!email) return;
  alert(`Add ${email} to ${currentRoom}`);
  // Add member logic (stub)
}

function removeMember() {
  const email = document.getElementById('memberEmail').value.trim();
  if (!email) return;
  alert(`Remove ${email} from ${currentRoom}`);
  // Remove member logic (stub)
}

function promoteMember() {
  const email = document.getElementById('memberEmail').value.trim();
  if (!email) return;
  alert(`Promote ${email} in ${currentRoom}`);
  // Promote logic (stub)
}

// Profile
function loadProfile() {
  db.collection('users').doc(currentUser.uid).get().then(doc => {
    const data = doc.data();
    document.getElementById('profileName').value = data.name || '';
    document.getElementById('profileBio').value = data.bio || '';
  });
}

function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const bio = document.getElementById('profileBio').value.trim();
  db.collection('users').doc(currentUser.uid).update({ name, bio });
}
