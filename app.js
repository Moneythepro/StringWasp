document.addEventListener('DOMContentLoaded', () => {
  // Hide loader
  document.getElementById('init-overlay').style.display = 'none';

  // Tabs
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  // Theme toggle
  document.getElementById('themeSwitcher').addEventListener('change', (e) => {
    document.body.className = `${e.target.value}-theme`;
    localStorage.setItem('theme', e.target.value);
  });
  document.body.className = `${localStorage.getItem('theme') || 'light'}-theme`;

  // Panic button
  document.getElementById('panicBtn').addEventListener('click', () => {
    localStorage.clear();
    alert('All local data cleared. Reloading...');
    location.reload();
  });

  // Send chat
  document.getElementById('sendBtn').addEventListener('click', async () => {
    const msg = document.getElementById('chatInput').value;
    const isAnon = document.getElementById('anonToggle').checked;
    const user = auth.currentUser;
    if (!user || !msg) return;

    const encrypted = btoa(msg);
    await db.collection('chats').add({
      uid: user.uid,
      msg: encrypted,
      anon: isAnon,
      name: isAnon ? 'Anonymous' : user.displayName || 'User',
      time: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('chatInput').value = '';
  });

  // Load chat
  db.collection('chats').orderBy('time').onSnapshot(snapshot => {
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement('div');
      div.textContent = `${data.name}: ${atob(data.msg || '')}`;
      chatArea.appendChild(div);
    });
  });

  // Save profile
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const user = auth.currentUser;
    const name = document.getElementById('displayNameInput').value;
    const file = document.getElementById('profilePicInput').files[0];

    if (name) await user.updateProfile({ displayName: name });

    if (file) {
      const ref = storage.ref(`profiles/${user.uid}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      await user.updateProfile({ photoURL: url });
    }

    alert('Profile updated!');
  });
});
