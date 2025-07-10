// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('init-overlay');
  const themeSwitcher = document.getElementById('themeSwitcher');
  const musicToggle = document.getElementById('musicToggle');
  const emotionalToggle = document.getElementById('emotionalToggle');
  const lastSeenToggle = document.getElementById('lastSeenToggle');
  const roleBadge = document.getElementById('roleBadge');

  const userId = localStorage.getItem("uid");

  function saveSetting(key, value) {
    if (userId) {
      db.collection('users').doc(userId).set({ [key]: value }, { merge: true });
    }
  }

  function applyUserSettings(userData) {
    if (userData.theme) {
      document.body.className = `${userData.theme}-theme`;
      themeSwitcher.value = userData.theme;
    }
    if (userData.music !== undefined) musicToggle.checked = userData.music;
    if (userData.emotion !== undefined) emotionalToggle.checked = userData.emotion;
    if (userData.lastSeen !== undefined) lastSeenToggle.checked = userData.lastSeen;
    if (userData.role) roleBadge.textContent = userData.role;
  }

  // Tab System
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  // Theme
  themeSwitcher.addEventListener('change', (e) => {
    const theme = e.target.value;
    document.body.className = `${theme}-theme`;
    saveSetting("theme", theme);
  });

  // Music Toggle
  musicToggle.addEventListener('change', e => {
    saveSetting("music", e.target.checked);
  });

  // Emotion Toggle
  emotionalToggle.addEventListener('change', e => {
    saveSetting("emotion", e.target.checked);
  });

  // Last Seen
  lastSeenToggle.addEventListener('change', e => {
    saveSetting("lastSeen", e.target.checked);
  });

  // Panic Button
  document.getElementById('panicBtn').addEventListener('click', () => {
    localStorage.clear();
    firebase.auth().signOut().then(() => {
      location.reload();
    });
  });

  // Load user data
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      localStorage.setItem("uid", user.uid);
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        applyUserSettings(userDoc.data());
      }
    } else {
      localStorage.removeItem("uid");
    }
    overlay.style.display = "none";
  });

  // Explore Content Loader
  const exploreContent = document.getElementById("exploreContent");
  db.collection("groups").where("public", "==", true).onSnapshot(snapshot => {
    exploreContent.innerHTML = '';
    snapshot.forEach(doc => {
      const group = doc.data();
      const div = document.createElement("div");
      div.textContent = `#${group.name}`;
      exploreContent.appendChild(div);
    });
  });
});
