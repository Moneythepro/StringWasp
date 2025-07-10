// Firebase config and init already in firebase.js

document.addEventListener("DOMContentLoaded", () => {
  // Hide loading
  document.getElementById("init-overlay").style.display = "none";

  // Tab switching
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  // Theme switching
  const themeSwitcher = document.getElementById("themeSwitcher");
  themeSwitcher.addEventListener("change", (e) => {
    document.body.className = `${e.target.value}-theme`;
  });

  // Panic button
  document.getElementById("panicBtn").addEventListener("click", () => {
    if (confirm("Clear chat data from this session?")) {
      localStorage.clear();
      location.reload();
    }
  });

  // Load groups
  const groupSelect = document.getElementById("groupSelect");
  db.collection("groups").onSnapshot((snapshot) => {
    groupSelect.innerHTML = "";
    snapshot.forEach((doc) => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.data().name || doc.id;
      groupSelect.appendChild(opt);
    });
  });

  // Group chat send
  document.getElementById("sendGroupMessage").addEventListener("click", async () => {
    const groupId = groupSelect.value;
    const message = document.getElementById("groupMessageInput").value.trim();
    const anonymous = document.getElementById("anonGroupToggle").checked;
    if (!groupId || !message) return;

    const user = auth.currentUser;
    const encoded = btoa(message);

    await db.collection("groups").doc(groupId).collection("messages").add({
      text: encoded,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      uid: user ? user.uid : "anon",
      displayName: anonymous ? "Anonymous" : (user?.displayName || "Unknown"),
      anonymous
    });

    document.getElementById("groupMessageInput").value = "";
  });

  // Listen for messages
  groupSelect.addEventListener("change", () => {
    const groupId = groupSelect.value;
    const messagesDiv = document.getElementById("groupMessages");
    messagesDiv.innerHTML = "";
    if (!groupId) return;

    db.collection("groups").doc(groupId).collection("messages")
      .orderBy("timestamp")
      .onSnapshot((snapshot) => {
        messagesDiv.innerHTML = "";
        snapshot.forEach((doc) => {
          const msg = doc.data();
          const div = document.createElement("div");
          div.textContent = `${msg.displayName}: ${atob(msg.text || "")}`;
          messagesDiv.appendChild(div);
        });
      });
  });
});
