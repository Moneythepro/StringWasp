// app.js — StringWasp Final Production Build

// Firebase Setup
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Global State
let currentUser = null;
let currentUsername = '';
let typingTimeout;
let typingInterval;
let currentRoomId = '';
let chatTabMode = 'friends'; // friends | requests
let selectedProfilePicFile = null;

// Utility Functions
function $(id) {
  return document.getElementById(id);
}
function showTab(tabId) {
  document.querySelectorAll('.tab, .tabContent').forEach(el => el.style.display = 'none');
  $(tabId).style.display = 'block';
}
function showLoader(show = true) {
  $('loadingOverlay').style.display = show ? 'flex' : 'none';
}
function showAlert(title, body, actions = []) {
  const modal = $('viewProfileModal');
  modal.innerHTML = `<div class="modal-content">
    <h3>${title}</h3><p>${body}</p>
    ${actions.map(a => `<button onclick="${a.action}">${a.label}</button>`).join('')}
    <span class="close" onclick="closeModal()">×</span>
  </div>`;
  modal.style.display = 'block';
}
function closeModal() {
  $('viewProfileModal').style.display = 'none';
}
function compressImage(file, maxSize = 200) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = maxSize / Math.max(img.width, img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

// Auth Flow
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists && userDoc.data().username) {
      currentUsername = userDoc.data().username;
      $('usernameDisplay').innerText = `@${currentUsername}`;
      showTab('appPage');
      initApp();
    } else {
      showTab('usernameDialog');
    }
  } else {
    showTab('loginPage');
  }
});

function login() {
  const email = $('email').value;
  const password = $('password').value;
  auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
}
function register() {
  const email = $('email').value;
  const password = $('password').value;
  auth.createUserWithEmailAndPassword(email, password).catch(e => alert(e.message));
}
function saveUsername() {
  const username = $('newUsername').value.trim().toLowerCase();
  if (!username) return alert("Username can't be empty");
  db.collection('usernames').doc(username).get().then(doc => {
    if (doc.exists) return alert("Username taken");
    const batch = db.batch();
    const userRef = db.collection('users').doc(currentUser.uid);
    batch.set(userRef, { username }, { merge: true });
    batch.set(db.collection('usernames').doc(username), { uid: currentUser.uid });
    batch.commit().then(() => {
      currentUsername = username;
      $('usernameDisplay').innerText = `@${username}`;
      showTab('appPage');
      initApp();
    });
  });
}

// App Init
function initApp() {
  loadRooms();
  loadInbox();
  loadFriends();
  loadProfile();
  loadGroups();
}

// Room Functions
function loadRooms() {
  const dropdown = $('roomDropdown');
  dropdown.innerHTML = '';
  db.collection('rooms').onSnapshot(snapshot => {
    snapshot.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.data().name;
      dropdown.appendChild(opt);
    });
  });
}
function joinRoom(roomId) {
  currentRoomId = roomId;
  loadRoomMessages(roomId);
}
function loadRoomMessages(roomId) {
  const msgDiv = $('messages');
  msgDiv.innerHTML = '';
  db.collection('rooms').doc(roomId).collection('messages').orderBy('timestamp')
    .onSnapshot(snapshot => {
      msgDiv.innerHTML = '';
      snapshot.forEach(doc => renderMessage(doc.data(), msgDiv));
      msgDiv.scrollTop = msgDiv.scrollHeight;
    });
}
function sendMessage() {
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text || !currentRoomId) return;
  db.collection('rooms').doc(currentRoomId).collection('messages').add({
    text,
    sender: currentUsername,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = '';
}
$('messageInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') sendMessage();
});

// Inbox
function loadInbox() {
  const inboxDiv = $('inboxList');
  db.collection('users').doc(currentUser.uid).collection('inbox')
    .onSnapshot(snapshot => {
      inboxDiv.innerHTML = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'inbox-card';
        card.textContent = `${data.type}: ${data.from}`;
        card.onclick = () => showAlert(
          `${data.type} from ${data.from}`,
          'What would you like to do?',
          [
            { label: 'View Profile', action: `viewUserProfile('${data.from}')` },
            { label: data.type === 'Friend Request' ? 'Accept' : 'Join', action: `acceptInbox('${doc.id}')` }
          ]
        );
        inboxDiv.appendChild(card);
      });
    });
}
function acceptInbox(id) {
  // Handle accept logic...
  db.collection('users').doc(currentUser.uid).collection('inbox').doc(id).delete();
  closeModal();
}
function markAllRead() {
  db.collection('users').doc(currentUser.uid).collection('inbox').get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });
}

// Friends
function loadFriends() {
  const friendList = $('friendsList');
  friendList.innerHTML = '';
  db.collection('users').doc(currentUser.uid).collection('friends')
    .onSnapshot(snapshot => {
      friendList.innerHTML = '';
      snapshot.forEach(doc => {
        const div = document.createElement('div');
        div.className = 'friend-entry';
        div.textContent = doc.id;
        friendList.appendChild(div);
      });
    });
}

// Search
function runSearch() {
  const query = $('searchInput').value.trim().toLowerCase();
  if (!query) return;
  const usersDiv = $('searchResultsUser');
  const groupsDiv = $('searchResultsGroup');
  usersDiv.innerHTML = '';
  groupsDiv.innerHTML = '';

  db.collection('usernames').get().then(snapshot => {
    snapshot.forEach(doc => {
      if (doc.id.includes(query)) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.textContent = `@${doc.id}`;
        usersDiv.appendChild(div);
      }
    });
  });

  db.collection('rooms').get().then(snapshot => {
    snapshot.forEach(doc => {
      if (doc.data().name.includes(query)) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.textContent = doc.data().name;
        div.onclick = () => joinRoom(doc.id);
        groupsDiv.appendChild(div);
      }
    });
  });
}
function switchSearchView(view) {
  $('searchResultsUser').style.display = view === 'user' ? 'block' : 'none';
  $('searchResultsGroup').style.display = view === 'group' ? 'block' : 'none';
}

// Profile
function loadProfile() {
  const userRef = db.collection('users').doc(currentUser.uid);
  userRef.get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      $('profileName').value = data.name || '';
      $('profileBio').value = data.bio || '';
      $('profilePhone').value = data.phone || '';
      $('profileEmail').value = data.publicEmail || '';
      if (data.avatarUrl) $('profilePicPreview').src = data.avatarUrl;
    }
  });
}
$('profilePic').addEventListener('change', e => {
  selectedProfilePicFile = e.target.files[0];
});
function saveProfile() {
  const name = $('profileName').value;
  const bio = $('profileBio').value;
  const phone = $('profilePhone').value;
  const publicEmail = $('profileEmail').value;
  const userRef = db.collection('users').doc(currentUser.uid);

  const updateData = { name, bio, phone, publicEmail };

  if (selectedProfilePicFile) {
    compressImage(selectedProfilePicFile).then(blob => {
      const ref = storage.ref(`avatars/${currentUser.uid}.jpg`);
      ref.put(blob).then(() => ref.getDownloadURL()).then(url => {
        updateData.avatarUrl = url;
        userRef.update(updateData);
      });
    });
  } else {
    userRef.update(updateData);
  }
}

// Logout
function logout() {
  auth.signOut();
}

// Extra
function toggleFabMenu() {
  $('fabMenu').classList.toggle('hidden');
}
function refreshPage() {
  location.reload();
}
