// app.js - Part 1: Firebase Initialization, Auth, Setup

import { auth, db, storage } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  deleteUser
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const provider = new GoogleAuthProvider();

let currentUser = null;
let selectedChat = null;
let selectedGroup = null;

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function encrypt(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function decrypt(text) {
  try {
    return decodeURIComponent(escape(atob(text)));
  } catch {
    return '[Corrupted]';
  }
}

function setLoading(isLoading) {
  document.getElementById('loadingSpinner').style.display = isLoading ? 'block' : 'none';
}

function updateLastSeen(uid) {
  return updateDoc(doc(db, 'users', uid), {
    lastSeen: serverTimestamp()
  });
}

function signIn() {
  signInWithPopup(auth, provider).catch(console.error);
}

function signOutUser() {
  signOut(auth);
}

function deleteAccount() {
  if (currentUser) {
    deleteUser(currentUser).then(() => {
      showToast('Account deleted');
    });
  }
}

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    await initUser(user);
    document.getElementById('app').style.display = 'block';
    document.getElementById('authSection').style.display = 'none';
    setInterval(() => updateLastSeen(user.uid), 60000);
  } else {
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('app').style.display = 'none';
  }
});

async function initUser(user) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      theme: 'light',
      emotion: 'neutral',
      music: '',
      lastSeen: serverTimestamp(),
    });
  }
  const userData = (await getDoc(userRef)).data();
  if (userData.theme) setTheme(userData.theme);
  loadAll();
}

// USER SETTINGS EVENTS
document.getElementById('themeToggle').addEventListener('click', () => {
  toggleTheme();
  updateDoc(doc(db, 'users', currentUser.uid), { theme: document.documentElement.getAttribute('data-theme') });
});

document.getElementById('emotionSelect').addEventListener('change', e => {
  updateDoc(doc(db, 'users', currentUser.uid), { emotion: e.target.value });
});

document.getElementById('musicToggle').addEventListener('change', e => {
  const musicURL = e.target.checked ? document.getElementById('musicURL').value : '';
  updateDoc(doc(db, 'users', currentUser.uid), { music: musicURL });
});

// PROFILE PICTURE UPLOAD
document.getElementById('profilePicInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  const storageRef = ref(storage, `profiles/${currentUser.uid}`);
  await uploadBytes(storageRef, file);
  const photoURL = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'users', currentUser.uid), { photoURL });
  document.getElementById('profilePic').src = photoURL;
  showToast('Profile picture updated');
});

// DISPLAY NAME UPDATE
document.getElementById('displayNameForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('displayNameInput').value;
  await updateDoc(doc(db, 'users', currentUser.uid), { displayName: name });
  showToast('Name updated');
});

// PANIC BUTTON (redirect to Google)
document.getElementById('panicButton').addEventListener('click', () => {
  window.location.href = 'https://www.google.com';
});

// SIDEBAR TAB SWITCHING
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`${btn.dataset.tab}Tab`).style.display = 'block';
    btn.classList.add('active');
  });
});

// LOGOUT / DELETE
document.getElementById('logoutBtn').addEventListener('click', signOutUser);
document.getElementById('deleteBtn').addEventListener('click', deleteAccount);

// MAIN LOADER FOR ALL
async function loadAll() {
  setLoading(true);
  await Promise.all([
    loadUserProfile(),
    loadExploreUsers(),
    loadFriends(),
    loadGroups(),
    loadGroupChats(),
    loadDirectChats()
  ]);
  setLoading(false);
}

// USER PROFILE DATA INIT
async function loadUserProfile() {
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  if (snap.exists()) {
    const data = snap.data();
    document.getElementById('profilePic').src = data.photoURL || 'default.png';
    document.getElementById('displayNameInput').value = data.displayName || '';
    document.getElementById('emotionSelect').value = data.emotion || 'neutral';
    document.getElementById('musicURL').value = data.music || '';
    document.getElementById('musicToggle').checked = !!data.music;
  }
}

// EXPLORE TAB – LOAD ALL USERS
async function loadExploreUsers() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const container = document.getElementById('exploreUsers');
  container.innerHTML = '';
  usersSnap.forEach(docSnap => {
    const user = docSnap.data();
    if (user.uid !== currentUser.uid) {
      const div = document.createElement('div');
      div.className = 'user-entry';
      div.innerHTML = `
        <img src="${user.photoURL || 'default.png'}" class="avatar-sm" />
        <span>${user.displayName}</span>
        <span class="last-seen">${timeAgo(user.lastSeen?.toDate())}</span>
        <button onclick="sendFriendRequest('${user.uid}')">Add</button>
      `;
      container.appendChild(div);
    }
  });
}

// FRIEND SYSTEM: REQUEST, ACCEPT, REJECT, LISTEN
async function sendFriendRequest(targetUid) {
  const ref = doc(db, 'friendRequests', `${currentUser.uid}_${targetUid}`);
  await setDoc(ref, {
    from: currentUser.uid,
    to: targetUid,
    timestamp: serverTimestamp()
  });
  showToast('Friend request sent');
}

async function acceptFriendRequest(requestId, fromUid) {
  await Promise.all([
    setDoc(doc(db, 'friends', `${currentUser.uid}_${fromUid}`), {
      users: [currentUser.uid, fromUid],
      timestamp: serverTimestamp()
    }),
    setDoc(doc(db, 'friends', `${fromUid}_${currentUser.uid}`), {
      users: [fromUid, currentUser.uid],
      timestamp: serverTimestamp()
    }),
    deleteDoc(doc(db, 'friendRequests', requestId))
  ]);
  showToast('Friend added');
}

async function rejectFriendRequest(requestId) {
  await deleteDoc(doc(db, 'friendRequests', requestId));
  showToast('Request rejected');
}

function loadFriends() {
  const container = document.getElementById('friendsList');
  const q = query(collection(db, 'friends'), where('users', 'array-contains', currentUser.uid));
  onSnapshot(q, async snapshot => {
    container.innerHTML = '';
    for (const docSnap of snapshot.docs) {
      const friendUid = docSnap.data().users.find(u => u !== currentUser.uid);
      const userSnap = await getDoc(doc(db, 'users', friendUid));
      const friend = userSnap.data();
      const div = document.createElement('div');
      div.className = 'user-entry';
      div.innerHTML = `
        <img src="${friend.photoURL || 'default.png'}" class="avatar-sm" />
        <span>${friend.displayName}</span>
        <span class="last-seen">${timeAgo(friend.lastSeen?.toDate())}</span>
        <button onclick="openPrivateChat('${friendUid}', '${friend.displayName}')">Chat</button>
      `;
      container.appendChild(div);
    }
  });

  const rq = query(collection(db, 'friendRequests'), where('to', '==', currentUser.uid));
  onSnapshot(rq, snapshot => {
    const requests = document.getElementById('friendRequests');
    requests.innerHTML = '';
    snapshot.forEach(req => {
      const data = req.data();
      const div = document.createElement('div');
      div.className = 'user-entry';
      div.innerHTML = `
        <span>Request from ${data.from}</span>
        <button onclick="acceptFriendRequest('${req.id}', '${data.from}')">Accept</button>
        <button onclick="rejectFriendRequest('${req.id}')">Reject</button>
      `;
      requests.appendChild(div);
    });
  });
}

// CREATE GROUP
document.getElementById('createGroupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('groupName').value;
  const isPublic = document.getElementById('groupPublic').checked;
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, {
    id: groupRef.id,
    name,
    public: isPublic,
    owner: currentUser.uid,
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, `groups/${groupRef.id}/members`, currentUser.uid), {
    uid: currentUser.uid,
    role: 'owner',
    joinedAt: serverTimestamp()
  });
  showToast('Group created');
  loadGroups();
  e.target.reset();
});

// JOIN GROUP BY ID
document.getElementById('joinGroupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const groupId = document.getElementById('joinGroupId').value;
  const groupDoc = await getDoc(doc(db, 'groups', groupId));
  if (groupDoc.exists()) {
    await setDoc(doc(db, `groups/${groupId}/members`, currentUser.uid), {
      uid: currentUser.uid,
      role: 'member',
      joinedAt: serverTimestamp()
    });
    showToast('Joined group');
    loadGroups();
  } else {
    showToast('Group not found');
  }
  e.target.reset();
});

// LOAD GROUPS
function loadGroups() {
  const container = document.getElementById('groupsList');
  const q = query(collectionGroup(db, 'members'), where('uid', '==', currentUser.uid));
  onSnapshot(q, async snapshot => {
    container.innerHTML = '';
    for (const docSnap of snapshot.docs) {
      const groupId = docSnap.ref.parent.parent.id;
      const groupDoc = await getDoc(doc(db, 'groups', groupId));
      const group = groupDoc.data();
      const div = document.createElement('div');
      div.className = 'group-entry';
      div.innerHTML = `
        <span>${group.name}</span>
        <span class="role-badge">${docSnap.data().role}</span>
        <button onclick="openGroupChat('${groupId}', '${group.name}')">Enter</button>
      `;
      container.appendChild(div);
    }
  });
}

let activeGroupId = null;

// OPEN GROUP CHAT
async function openGroupChat(groupId, groupName) {
  activeGroupId = groupId;
  document.getElementById('groupChatTitle').innerText = groupName;
  document.getElementById('groupChatMessages').innerHTML = '';
  document.getElementById('groupChatBox').style.display = 'block';
  listenToGroupMessages(groupId);
}

// SEND GROUP MESSAGE
document.getElementById('sendGroupMsgBtn').addEventListener('click', async () => {
  const msgInput = document.getElementById('groupMsgInput');
  const text = msgInput.value.trim();
  if (!text || !activeGroupId) return;
  const isAnonymous = document.getElementById('anonGroupToggle').checked;

  const message = {
    text: btoa(text),
    sender: currentUser.uid,
    timestamp: serverTimestamp(),
    anonymous: isAnonymous
  };

  await addDoc(collection(db, `groups/${activeGroupId}/messages`), message);
  msgInput.value = '';
});

// LISTEN TO GROUP MESSAGES
function listenToGroupMessages(groupId) {
  const q = query(collection(db, `groups/${groupId}/messages`), orderBy('timestamp'));
  onSnapshot(q, async snapshot => {
    const container = document.getElementById('groupChatMessages');
    container.innerHTML = '';

    for (const docSnap of snapshot.docs) {
      const msg = docSnap.data();
      let displayName = 'Anonymous';
      let photoURL = 'anon.png';
      let role = '';

      if (!msg.anonymous) {
        const userSnap = await getDoc(doc(db, 'users', msg.sender));
        const memberSnap = await getDoc(doc(db, `groups/${groupId}/members`, msg.sender));
        if (userSnap.exists()) {
          displayName = userSnap.data().displayName || 'User';
          photoURL = userSnap.data().photoURL || 'default.png';
        }
        if (memberSnap.exists()) {
          role = memberSnap.data().role;
        }
      }

      const div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = `
        <img src="${photoURL}" class="avatar-sm" />
        <div>
          <strong>${displayName}</strong>
          ${role ? `<span class="role-tag">${role}</span>` : ''}
          <p>${atob(msg.text)}</p>
          <small>${timeAgo(msg.timestamp?.toDate())}</small>
        </div>
      `;
      container.appendChild(div);
    }

    container.scrollTop = container.scrollHeight;
  });
}

let activeChatUid = null;

// OPEN PRIVATE CHAT
async function openPrivateChat(friendUid, friendName) {
  activeChatUid = friendUid;
  document.getElementById('privateChatTitle').innerText = friendName;
  document.getElementById('privateChatBox').style.display = 'block';
  listenToPrivateMessages(friendUid);
}

// SEND PRIVATE MESSAGE
document.getElementById('sendPrivateMsgBtn').addEventListener('click', async () => {
  const text = document.getElementById('privateMsgInput').value.trim();
  const isAnon = document.getElementById('anonPrivateToggle').checked;
  if (!text || !activeChatUid) return;

  const message = {
    from: currentUser.uid,
    to: activeChatUid,
    text: btoa(text),
    timestamp: serverTimestamp(),
    anonymous: isAnon
  };

  await addDoc(collection(db, 'messages'), message);
  document.getElementById('privateMsgInput').value = '';
});

// LISTEN TO PRIVATE MESSAGES
function listenToPrivateMessages(friendUid) {
  const q = query(
    collection(db, 'messages'),
    where('from', 'in', [currentUser.uid, friendUid]),
    orderBy('timestamp')
  );

  onSnapshot(q, snapshot => {
    const container = document.getElementById('privateChatMessages');
    container.innerHTML = '';

    snapshot.docs
      .filter(doc => {
        const data = doc.data();
        return (
          (data.from === currentUser.uid && data.to === friendUid) ||
          (data.from === friendUid && data.to === currentUser.uid)
        );
      })
      .forEach(doc => {
        const msg = doc.data();
        const isMe = msg.from === currentUser.uid;
        const div = document.createElement('div');
        div.className = `chat-msg ${isMe ? 'me' : ''}`;
        div.innerHTML = `
          <div>
            <strong>${msg.anonymous ? 'Anonymous' : isMe ? 'You' : 'Friend'}</strong>
            <p>${atob(msg.text)}</p>
            <small>${timeAgo(msg.timestamp?.toDate())}</small>
          </div>
        `;
        container.appendChild(div);
      });

    container.scrollTop = container.scrollHeight;
  });
}

// UPDATE LAST SEEN ON ACTIVITY
function updateLastSeen() {
  if (currentUser) {
    setDoc(doc(db, 'users', currentUser.uid), {
      lastSeen: serverTimestamp()
    }, { merge: true });
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateLastSeen();
});

// EMOTION MODE TOGGLE
document.getElementById('emotionToggle').addEventListener('change', async e => {
  const enabled = e.target.checked;
  await setDoc(doc(db, 'users', currentUser.uid), { emotion: enabled }, { merge: true });
});

// THEME TOGGLE
document.getElementById('themeToggle').addEventListener('change', e => {
  const theme = e.target.checked ? 'dark' : 'light';
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  setDoc(doc(db, 'users', currentUser.uid), { theme }, { merge: true });
});

// APPLY SAVED THEME
function applySavedTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').checked = theme === 'dark';
}

// PROFILE MUSIC URL SET
document.getElementById('musicForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url = document.getElementById('musicUrl').value;
  await setDoc(doc(db, 'users', currentUser.uid), { music: url }, { merge: true });
  document.getElementById('musicPlayer').src = url;
  showToast('Music updated');
});

// LOAD PROFILE MUSIC
function loadMusic(url) {
  if (url) {
    document.getElementById('musicPlayer').src = url;
  }
}

// LOGOUT
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await auth.signOut();
  location.reload();
});

// DELETE ACCOUNT
document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  if (confirm('Are you sure? This is irreversible.')) {
    await deleteDoc(doc(db, 'users', currentUser.uid));
    await currentUser.delete();
    location.reload();
  }
});

// PANIC BUTTON
document.getElementById('panicBtn').addEventListener('click', () => {
  document.body.innerHTML = '<h1>News Reader</h1><iframe src="https://news.google.com" style="width:100%; height:90vh;"></iframe>';
});

// TIME AGO HELPER
function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const intervals = {
    year: 31536000, month: 2592000, day: 86400,
    hour: 3600, minute: 60
  };
  for (const key in intervals) {
    const val = Math.floor(seconds / intervals[key]);
    if (val > 0) return `${val} ${key}${val !== 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
