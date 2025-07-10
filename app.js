// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('init-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Tab Switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Theme Switcher
  const themeSwitcher = document.getElementById('themeSwitcher');
  themeSwitcher.addEventListener('change', e => {
    document.body.className = `${e.target.value}-theme`;
    localStorage.setItem('theme', e.target.value);
  });
  const savedTheme = localStorage.getItem('theme') || 'light';
  themeSwitcher.value = savedTheme;
  document.body.className = `${savedTheme}-theme`;

  // Panic Button
  document.getElementById('panicBtn').addEventListener('click', () => {
    localStorage.clear();
    sessionStorage.clear();
    alert("All local data cleared.");
    location.reload();
  });

  // Send Encrypted Message
  document.getElementById('sendMessageBtn').addEventListener('click', async () => {
    const msg = document.getElementById('messageInput').value.trim();
    const anonymous = document.getElementById('anonymousToggle').checked;
    if (!msg) return;

    const encoded = btoa(msg);
    await db.collection('messages').add({
      content: encoded,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      uid: auth.currentUser ? auth.currentUser.uid : null,
      anonymous: anonymous
    });
    document.getElementById('messageInput').value = '';
  });

  // Realtime Chat Updates
  db.collection('messages').orderBy('createdAt').onSnapshot(snapshot => {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const msg = document.createElement('div');
      msg.textContent = `${data.anonymous ? 'Anonymous' : data.uid}: ${atob(data.content)}`;
      chatContainer.appendChild(msg);
    });
  });

  // Group Creation
  document.getElementById('createGroupBtn').addEventListener('click', async () => {
    const name = document.getElementById('groupNameInput').value.trim();
    const privacy = document.getElementById('groupPrivacy').value;
    if (!name) return;

    await db.collection('groups').add({
      name,
      privacy,
      members: [auth.currentUser ? auth.currentUser.uid : null],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('groupNameInput').value = '';
  });

  // Load Groups
  db.collection('groups').orderBy('createdAt').onSnapshot(snapshot => {
    const list = document.getElementById('groupList');
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement('div');
      div.textContent = `${data.name} (${data.privacy})`;
      list.appendChild(div);
    });
  });

  // Save Profile
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const displayName = document.getElementById('displayNameInput').value;
    const music = document.getElementById('musicToggle').checked;
    const emotion = document.getElementById('emotionalToggle').checked;
    const lastSeen = document.getElementById('lastSeenToggle').checked;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const file = document.getElementById('profilePicInput').files[0];
    let photoURL = null;
    if (file) {
      const ref = storage.ref(`profiles/${uid}`);
      await ref.put(file);
      photoURL = await ref.getDownloadURL();
    }

    await db.collection('users').doc(uid).set({
      displayName,
      music,
      emotion,
      lastSeen,
      photoURL
    }, { merge: true });

    alert('Profile saved!');
  });
});
