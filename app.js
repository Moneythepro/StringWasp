// ---------------- IMPORTS ---------------- import { auth, db, firebase } from './firebase.js';

// ---------------- GLOBALS ---------------- let currentRoom = "general"; let unsubscribeChat = null; let unsubscribeTyping = null; let unsubscribeRoomDoc = null; let unsubscribeRoomList = null; let lastMessageTS = 0; let typingTO = null;

const getRoomPassword = () => document.getElementById("roomPassword")?.value || "";

// ---------------- TABS ---------------- function switchTab(tabId) { document.querySelectorAll(".tab").forEach(t => t.style.display = "none"); document.getElementById(tabId).style.display = "block"; }

// ---------------- AUTH STATE ---------------- auth.onAuthStateChanged(async user => { if (!user) { switchTab("loginPage"); return; }

document.getElementById("usernameDisplay").textContent = user.email; const userRef = db.collection("users").doc(user.uid); const userSnap = await userRef.get();

if (!userSnap.exists || !userSnap.data().username) { document.getElementById("usernameDialog").style.display = "block"; } else { startApp(user); } });

async function saveUsername() { const username = document.getElementById("newUsername").value.trim(); if (!username) return alert("Pick a username");

const user = auth.currentUser; await db.collection("users").doc(user.uid).set({ email: user.email, username, joined: Date.now() });

document.getElementById("usernameDialog").style.display = "none"; startApp(user); }

async function startApp(user) { document.getElementById("loginPage").style.display = "none"; document.getElementById("appPage").style.display = "block"; loadProfile(user.uid); startRoomListeners(); await createRoomIfMissing("general"); populateDropdown(); joinRoom("general"); switchTab("chatsTab"); }

// ---------------- AUTH ---------------- function login() { const email = document.getElementById("email").value.trim(); const pass = document.getElementById("password").value.trim(); if (!email || !pass) return alert("Missing credentials"); auth.signInWithEmailAndPassword(email, pass) .catch(e => alert(e.message)); }

function register() { const email = document.getElementById("email").value.trim(); const pass = document.getElementById("password").value.trim(); if (!email || !pass) return alert("Missing credentials"); auth.createUserWithEmailAndPassword(email, pass) .catch(e => alert(e.message)); }

// ---------------- [rest of your code remains unchanged] ---------------- // (You can keep the rest of your code as-is from your version.)
