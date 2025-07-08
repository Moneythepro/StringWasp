import { auth, db, rtdb } from './firebase.js';

// Global state
let currentUser = null;
let currentRoom = "general";
let unsubscribeFunctions = [];
let isTyping = false;
let typingTimeout = null;

// Initialize the app
function init() {
  setupEventListeners();
  checkAuthState();
}

function setupEventListeners() {
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('registerBtn').addEventListener('click', register);
  document.getElementById('saveUsernameBtn').addEventListener('click', saveUsername);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('createRoomBtn').addEventListener('click', createOrJoinRoom);
  document.getElementById('roomDropdown').addEventListener('change', (e) => joinRoom(e.target.value));
  document.getElementById('leaveRoomBtn').addEventListener('click', leaveRoom);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('input', handleTyping);
  document.getElementById('inviteBtn').addEventListener('click', () => {
    document.getElementById('adminModal').style.display = 'flex';
  });
  document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('adminModal').style.display = 'none';
  });
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('adminModal')) {
      document.getElementById('adminModal').style.display = 'none';
    }
  });
  document.getElementById('addMemberBtn').addEventListener('click', addMember);
  document.getElementById('removeMemberBtn').addEventListener('click', removeMember);
  document.getElementById('promoteMemberBtn').addEventListener('click', promoteMember);
}

function checkAuthState() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await handleAuthenticatedUser(user);
    } else {
      handleUnauthenticatedUser();
    }
  });
}

async function handleAuthenticatedUser(user) {
  const userDoc = await db.collection('users').doc(user.uid).get();
  
  if (!userDoc.exists || !userDoc.data().username) {
    showUsernameDialog();
  } else {
    startApp(user, userDoc.data());
  }
}

function showUsernameDialog() {
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('usernameDialog').style.display = 'block';
  document.getElementById('loading').style.display = 'none';
}

async function startApp(user, userData) {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('loading').style.display = 'none';
  
  document.getElementById('userBadge').textContent = userData.username || user.email;
  
  setupPresence(user.uid);
  initializeRooms();
  joinRoom(currentRoom);
  loadOnlineUsers();
  setupMessageListener();
  setupTypingListener();
}

function handleUnauthenticatedUser() {
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginPage').style.display = 'block';
  document.getElementById('usernameDialog').style.display = 'none';
  document.getElementById('loading').style.display = 'none';
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    showLoading('Signing in...');
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    alert(error.message);
  } finally {
    hideLoading();
  }
}

async function register() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    showLoading('Creating account...');
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (error) {
    alert(error.message);
  } finally {
    hideLoading();
  }
}

async function saveUsername() {
  const username = document.getElementById('newUsername').value.trim();
  
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  try {
    showLoading('Saving username...');
    await db.collection('users').doc(currentUser.uid).set({
      username: username,
      email: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    startApp(currentUser, { username });
  } catch (error) {
    alert(error.message);
  } finally {
    hideLoading();
  }
}

async function logout() {
  try {
    showLoading('Logging out...');
    await auth.signOut();
  } catch (error) {
    alert(error.message);
  } finally {
    hideLoading();
  }
}

async function initializeRooms() {
  await createRoomIfMissing('general');
  
  const unsubscribe = db.collection('rooms').onSnapshot((snapshot) => {
    const dropdown = document.getElementById('roomDropdown');
    dropdown.innerHTML = '';
    
    snapshot.forEach((doc) => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = doc.id === 'general' ? 'General' : doc.id;
      dropdown.appendChild(option);
    });
    
    dropdown.value = currentRoom;
  });
  
  unsubscribeFunctions.push(unsubscribe);
}

async function createRoomIfMissing(roomName) {
  const roomRef = db.collection('rooms').doc(roomName);
  const roomDoc = await roomRef.get();
  
  if (!roomDoc.exists) {
    await roomRef.set({
      name: roomName,
      creator: currentUser.email,
      admins: [currentUser.email],
      members: [currentUser.email],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function createOrJoinRoom() {
  const roomName = document.getElementById('customRoom').value.trim();
  
  if (!roomName) {
    alert('Please enter a room name');
    return;
  }
  
  try {
    showLoading(roomName === 'general' ? 'Joining general chat...' : `Creating ${roomName}...`);
    await createRoomIfMissing(roomName);
    await joinRoom(roomName);
    document.getElementById('customRoom').value = '';
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    hideLoading();
  }
}

async function joinRoom(roomName) {
  cleanupListeners();
  currentRoom = roomName;
  document.getElementById('currentRoomTitle').textContent = roomName === 'general' ? 'General Chat' : roomName;

  try {
    await db.collection('rooms').doc(roomName).update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.email)
    });
  } catch (error) {
    console.error('Error joining room:', error);
  }

  setupAdminPanel(roomName);
}

function cleanupListeners() {
  unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
  unsubscribeFunctions = [];
}

async function leaveRoom() {
  if (currentRoom === 'general') {
    alert('You cannot leave the general room');
    return;
  }
  
  if (!confirm(`Leave ${currentRoom}?`)) return;
  
  try {
    showLoading(`Leaving ${currentRoom}...`);
    await db.collection('rooms').doc(currentRoom).update({
      members: firebase.firestore.FieldValue.arrayRemove(currentUser.email),
      admins: firebase.firestore.FieldValue.arrayRemove(currentUser.email)
    });
    
    joinRoom('general');
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    hideLoading();
  }
}

function setupMessageListener() {
  const unsubscribe = db.collection('messages')
    .doc(currentRoom)
    .collection('chat')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      const messagesContainer = document.getElementById('messages');
      messagesContainer.innerHTML = '';
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          displayMessage(change.doc.data());
        }
      });
      
      scrollToBottom();
    });
  
  unsubscribeFunctions.push(unsubscribe);
}

function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  
  if (message.sender === currentUser.email) {
    messageElement.classList.add('sent');
  } else {
    messageElement.classList.add('received');
  }

  const isEncrypted = message.ciphertext && message.iv;
  const messageContent = isEncrypted ? '[Encrypted Message]' : message.text;
  
  messageElement.innerHTML = `
    <div class="message-info">
      <span class="message-sender">${message.sender}</span>
      <span class="message-time">${formatTime(message.timestamp?.toDate() || new Date())}</span>
    </div>
    <div class="message-content">${messageContent}</div>
  `;
  
  document.getElementById('messages').appendChild(messageElement);
}

async function sendMessage() {
  const messageText = document.getElementById('messageInput').value.trim();
  
  if (!messageText) return;
  
  try {
    showLoading('Sending message...');
    
    const messageData = {
      sender: currentUser.email,
      text: messageText,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('messages')
      .doc(currentRoom)
      .collection('chat')
      .add(messageData);
    
    document.getElementById('messageInput').value = '';
    stopTyping();
  } catch (error) {
    alert(`Error sending message: ${error.message}`);
  } finally {
    hideLoading();
  }
}

function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    db.collection('typing').doc(currentRoom).set({
      [currentUser.email]: true
    }, { merge: true });
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 3000);
}

function stopTyping() {
  isTyping = false;
  db.collection('typing').doc(currentRoom).set({
    [currentUser.email]: false
  }, { merge: true });
}

function setupTypingListener() {
  const unsubscribe = db.collection('typing').doc(currentRoom).onSnapshot((doc) => {
    const data = doc.data() || {};
    const typingUsers = Object.keys(data).filter(email => email !== currentUser.email && data[email]);
    
    if (typingUsers.length > 0) {
      document.getElementById('typingIndicator').textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
    } else {
      document.getElementById('typingIndicator').textContent = '';
    }
  });
  
  unsubscribeFunctions.push(unsubscribe);
}

function setupPresence(userId) {
  const userStatusRef = db.collection('status').doc(userId);
  const isOfflineForDatabase = {
    online: false,
    lastChanged: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  const isOnlineForDatabase = {
    online: true,
    lastChanged: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  rtdb.ref('.info/connected').on('value', (snapshot) => {
    if (!snapshot.val()) return;
    
    userStatusRef.onDisconnect().set(isOfflineForDatabase).then(() => {
      userStatusRef.set(isOnlineForDatabase);
    });
  });
}

function loadOnlineUsers() {
  const unsubscribe = db.collection('status')
    .where('online', '==', true)
    .onSnapshot((snapshot) => {
      const onlineUsersContainer = document.getElementById('onlineUsers');
      onlineUsersContainer.innerHTML = '';
      
      snapshot.forEach((doc) => {
        const userElement = document.createElement('div');
        userElement.classList.add('online-user');
        userElement.innerHTML = `
          <div class="user-status"></div>
          <span>${doc.id === currentUser.uid ? 'You' : doc.id}</span>
        `;
        
        onlineUsersContainer.appendChild(userElement);
      });
    });
  
  unsubscribeFunctions.push(unsubscribe);
}

function setupAdminPanel(roomName) {
  const unsubscribe = db.collection('rooms').doc(roomName).onSnapshot((doc) => {
    if (!doc.exists) return;
    
    const roomData = doc.data();
    const isAdmin = roomData.admins.includes(currentUser.email);
    const isCreator = roomData.creator === currentUser.email;
    
    document.getElementById('inviteBtn').style.display = isAdmin || isCreator ? 'block' : 'none';
    
    if (isAdmin || isCreator) {
      document.getElementById('creatorDisplay').textContent = roomData.creator;
      document.getElementById('adminsDisplay').textContent = roomData.admins.join(', ');
    }
  });
  
  unsubscribeFunctions.push(unsubscribe);
}

async function addMember() {
  const email = document.getElementById('memberEmail').value.trim();
  
  if (!email) {
    alert('Please enter an email');
    return;
  }
  
  try {
    showLoading(`Adding ${email}...`);
    await db.collection('rooms').doc(currentRoom).update({
      members: firebase.firestore.FieldValue.arrayUnion(email)
    });
    document.getElementById('memberEmail').value = '';
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    hideLoading();
  }
}

async function removeMember() {
  const email = document.getElementById('memberEmail').value.trim();
  
  if (!email) {
    alert('Please enter an email');
    return;
  }
  
  try {
    showLoading(`Removing ${email}...`);
    await db.collection('rooms').doc(currentRoom).update({
      members: firebase.firestore.FieldValue.arrayRemove(email),
      admins: firebase.firestore.FieldValue.arrayRemove(email)
    });
    document.getElementById('memberEmail').value = '';
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    hideLoading();
  }
}

async function promoteMember() {
  const email = document.getElementById('memberEmail').value.trim();
  
  if (!email) {
    alert('Please enter an email');
    return;
  }
  
  try {
    showLoading(`Promoting ${email}...`);
    const roomDoc = await db.collection('rooms').doc(currentRoom).get();
    const roomData = roomDoc.data();
    
    if (!roomData.members.includes(email)) {
      alert('User must be a member first');
      return;
    }
    
    if (roomData.admins.length >= 3) {
      alert('Maximum 3 admins per room');
      return;
    }
    
    await db.collection('rooms').doc(currentRoom).update({
      admins: firebase.firestore.FieldValue.arrayUnion(email)
    });
    
    document.getElementById('memberEmail').value = '';
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    hideLoading();
  }
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

function showLoading(message) {
  document.getElementById('loading').style.display = 'flex';
  if (message) {
    document.querySelector('#loading p').textContent = message;
  }
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

// Initialize the app
init();
