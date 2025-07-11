// 📦 app.js — Part 1

import { auth, db, storage } from './firebase.js'; import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// =============== GLOBAL VARIABLES =============== // let currentUser = null; let currentChatUser = null; let currentGroupId = null; let allUsers = []; let currentTab = 'chats';

// =============== INIT APP =============== // window.addEventListener('DOMContentLoaded', () => { initTheme(); initAuth(); initTabs(); initSettings(); initEventListeners(); });

// =============== THEME INIT =============== // function initTheme() { const savedTheme = localStorage.getItem('theme') || 'light'; document.documentElement.setAttribute('data-theme', savedTheme); document.getElementById('themeToggle').checked = savedTheme === 'dark'; }

function toggleTheme() { const isDark = document.getElementById('themeToggle').checked; const theme = isDark ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); if (currentUser) updateDoc(doc(db, 'users', currentUser.uid), { theme }); }

// =============== TABS =============== // function initTabs() { document.querySelectorAll('.tab').forEach(tab => { tab.addEventListener('click', () => switchTab(tab.dataset.tab)); }); }

function switchTab(tabName) { currentTab = tabName; document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.querySelector(.tab[data-tab="${tabName}"]).classList.add('active'); document.getElementById(${tabName}Tab).classList.add('active'); }

// =============== AUTH INIT =============== // function initAuth() { onAuthStateChanged(auth, async (user) => { if (user) { currentUser = user; await loadUserData(user); renderApp(); } else { currentUser = null; renderLogin(); } }); }

function renderApp() { document.getElementById('authSection').style.display = 'none'; document.getElementById('mainApp').style.display = 'flex'; loadExploreUsers(); loadFriends(); loadGroups(); loadSettings(); updateLastSeen(); setInterval(updateLastSeen, 30000); }

function renderLogin() { document.getElementById('authSection').style.display = 'block'; document.getElementById('mainApp').style.display = 'none'; }

function login(email, password) { signInWithEmailAndPassword(auth, email, password) .catch(err => showToast(err.message)); }

function register(email, password, displayName) { createUserWithEmailAndPassword(auth, email, password) .then(async cred => { await updateProfile(cred.user, { displayName }); await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, displayName, lastSeen: serverTimestamp(), theme: 'light', music: '', emotion: '', }); }) .catch(err => showToast(err.message)); }

function logout() { signOut(auth); }

// =============== EVENT LISTENERS =============== // function initEventListeners() { document.getElementById('loginBtn').onclick = () => { const email = document.getElementById('loginEmail').value; const pass = document.getElementById('loginPassword').value; login(email, pass); };

document.getElementById('registerBtn').onclick = () => { const email = document.getElementById('registerEmail').value; const pass = document.getElementById('registerPassword').value; const name = document.getElementById('registerName').value; register(email, pass, name); };

document.getElementById('logoutBtn').onclick = logout; document.getElementById('themeToggle').onchange = toggleTheme; }

// ...Next Part: Load & Display Users, Friends, Groups, Explore, etc.

// 📦 app.js — Part 2: Users, Explore, Friends, Groups, Group Chat, Threading

// =============== USER DATA LOAD =============== // async function loadUserData(user) { const userDoc = await getDoc(doc(db, 'users', user.uid)); if (userDoc.exists()) { const data = userDoc.data(); document.getElementById('currentUserName').textContent = data.displayName; if (data.theme) document.documentElement.setAttribute('data-theme', data.theme); } }

function updateLastSeen() { if (currentUser) { updateDoc(doc(db, 'users', currentUser.uid), { lastSeen: serverTimestamp() }); } }

// =============== EXPLORE TAB =============== // function loadExploreUsers() { const usersRef = collection(db, 'users'); onSnapshot(usersRef, snapshot => { allUsers = snapshot.docs.map(doc => doc.data()); renderExploreUsers(); }); }

function renderExploreUsers() { const container = document.getElementById('exploreList'); container.innerHTML = ''; allUsers.forEach(user => { if (user.uid !== currentUser.uid) { const item = document.createElement('div'); item.className = 'user-item'; item.innerHTML = <span>${user.displayName}</span> <button onclick="sendFriendRequest('${user.uid}')">Add Friend</button>; container.appendChild(item); } }); }

// =============== FRIEND SYSTEM =============== // function sendFriendRequest(toUid) { const request = { from: currentUser.uid, to: toUid, status: 'pending' }; addDoc(collection(db, 'friendRequests'), request); showToast('Friend request sent'); }

function loadFriends() { const q = query(collection(db, 'friendRequests'), where('status', '==', 'accepted')); onSnapshot(q, snapshot => { const friends = []; snapshot.forEach(doc => { const data = doc.data(); if (data.from === currentUser.uid) friends.push(data.to); else if (data.to === currentUser.uid) friends.push(data.from); }); renderFriends(friends); }); }

async function renderFriends(friendIds) { const container = document.getElementById('friendsList'); container.innerHTML = ''; for (let uid of friendIds) { const docSnap = await getDoc(doc(db, 'users', uid)); if (docSnap.exists()) { const user = docSnap.data(); const item = document.createElement('div'); item.className = 'friend-item'; item.innerHTML = <span>${user.displayName}</span> <button onclick="startPrivateChat('${uid}')">Chat</button>; container.appendChild(item); } } }

// =============== GROUP SYSTEM =============== // function loadGroups() { const groupRef = collection(db, 'groups'); onSnapshot(groupRef, snapshot => { const container = document.getElementById('groupList'); container.innerHTML = ''; snapshot.forEach(docSnap => { const group = docSnap.data(); if (group.members && group.members.includes(currentUser.uid)) { const item = document.createElement('div'); item.className = 'group-item'; item.innerHTML = <span>${group.name}</span> <button onclick="openGroup('${docSnap.id}')">Enter</button>; container.appendChild(item); } }); }); }

async function openGroup(groupId) { currentGroupId = groupId; const docSnap = await getDoc(doc(db, 'groups', groupId)); const group = docSnap.data(); document.getElementById('groupChatTitle').textContent = group.name; loadGroupMessages(groupId); }

function loadGroupMessages(groupId) { const messagesRef = collection(db, 'groups', groupId, 'messages'); const q = query(messagesRef, orderBy('timestamp')); onSnapshot(q, snapshot => { const container = document.getElementById('groupMessages'); container.innerHTML = ''; snapshot.forEach(docSnap => { const msg = docSnap.data(); const item = document.createElement('div'); item.className = msg.sender === currentUser.uid ? 'my-msg' : 'their-msg'; item.innerHTML = <div class="msg-header"> <strong>${msg.anonymous ? 'Anonymous' : msg.senderName || 'User'}</strong> <small>${new Date(msg.timestamp?.toDate()).toLocaleTimeString()}</small> </div> <div class="msg-body">${atob(msg.text)}</div>; container.appendChild(item); }); container.scrollTop = container.scrollHeight; }); }

function sendGroupMessage() { const input = document.getElementById('groupMsgInput'); const text = input.value.trim(); const anonymous = document.getElementById('anonToggle').checked; if (!text || !currentGroupId) return; const msg = { text: btoa(text), timestamp: serverTimestamp(), sender: currentUser.uid, senderName: currentUser.displayName, anonymous: anonymous }; addDoc(collection(db, 'groups', currentGroupId, 'messages'), msg); input.value = ''; }

// ...Next Part: Profile Settings, Music, Emotions, Panic Button, Toasts, Thread UI Enhancements, etc.

// 📦 app.js — Part 3: Profile Music, Emotion, Panic, Toasts, UI

// =============== PROFILE SETTINGS =============== // function saveUserSettings() { const displayName = document.getElementById('displayNameInput').value; const theme = document.getElementById('themeToggle').checked ? 'dark' : 'light'; const emotion = document.getElementById('emotionSelect').value; const music = document.getElementById('musicLink').value;

updateDoc(doc(db, 'users', currentUser.uid), { displayName, theme, emotion, music }).then(() => showToast('Profile updated')); }

function loadProfileSettings() { getDoc(doc(db, 'users', currentUser.uid)).then(docSnap => { if (docSnap.exists()) { const data = docSnap.data(); document.getElementById('displayNameInput').value = data.displayName || ''; document.getElementById('themeToggle').checked = data.theme === 'dark'; document.getElementById('emotionSelect').value = data.emotion || ''; document.getElementById('musicLink').value = data.music || ''; if (data.theme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); } } }); }

// =============== EMOTION MODE =============== // function displayEmotion() { const emojiMap = { happy: '😊', sad: '😢', angry: '😠', excited: '🤩', neutral: '😐' }; getDoc(doc(db, 'users', currentUser.uid)).then(docSnap => { if (docSnap.exists()) { const emotion = docSnap.data().emotion; document.getElementById('emotionIcon').textContent = emojiMap[emotion] || ''; } }); }

// =============== MUSIC PLAYER =============== // function playProfileMusic() { getDoc(doc(db, 'users', currentUser.uid)).then(docSnap => { if (docSnap.exists()) { const musicLink = docSnap.data().music; if (musicLink) { const audio = document.getElementById('profileAudio'); audio.src = musicLink; audio.play(); } } }); }

// =============== PANIC BUTTON =============== // function activatePanicMode() { document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;">Loading...</h1>'; setTimeout(() => window.location.href = 'https://www.google.com', 1000); }

// =============== TOAST SYSTEM =============== // function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }

// =============== AUTO-SCROLL, UNREAD, PRESENCE =============== // function scrollToBottom(el) { el.scrollTop = el.scrollHeight; }

function updateOnlineStatus(isOnline) { updateDoc(doc(db, 'users', currentUser.uid), { online: isOnline }); }

window.addEventListener('beforeunload', () => updateOnlineStatus(false)); window.addEventListener('load', () => updateOnlineStatus(true));

// =============== LOGOUT + DELETE =============== // function logout() { signOut(auth).then(() => location.reload()); }

function deleteAccount() { if (confirm('Are you sure? This will delete your account permanently.')) { deleteDoc(doc(db, 'users', currentUser.uid)).then(() => { auth.currentUser.delete().then(() => location.reload()); }); } }

// 📦 app.js — Part 4: Loading, Errors, Modals, Polish

// =============== LOADING SPINNERS =============== // function showLoading(id) { document.getElementById(id).classList.add('loading'); }

function hideLoading(id) { document.getElementById(id).classList.remove('loading'); }

// =============== ERROR HANDLING =============== // function handleError(error) { console.error(error); showToast('❌ Error: ' + error.message); }

// =============== MODALS =============== // function openModal(id) { document.getElementById(id).classList.add('active'); }

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// =============== RESPONSIVE TAB NAVIGATION =============== // const tabButtons = document.querySelectorAll('.tab-button'); tabButtons.forEach(btn => { btn.addEventListener('click', () => { const target = btn.dataset.target; document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden')); document.getElementById(target).classList.remove('hidden'); }); });

// =============== THEME PERSISTENCE =============== // function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }

// =============== INIT =============== // onAuthStateChanged(auth, user => { if (user) { currentUser = user; loadProfileSettings(); loadFriends(); loadGroups(); displayEmotion(); playProfileMusic(); updateOnlineStatus(true); } else { showToast('Please log in'); document.getElementById('loginScreen').classList.remove('hidden'); document.getElementById('mainApp').classList.add('hidden'); } });

// Auto-scroll on new message helper (used after renderGroupMessages or renderThread) function autoScrollChat(containerId) { const el = document.getElementById(containerId); if (el) el.scrollTop = el.scrollHeight; }
