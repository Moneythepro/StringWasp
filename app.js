// app.js – Fully Synced with style.css and Firebase v8

firebase.auth().onAuthStateChanged(async (user) => { if (user) { window.currentUser = user; document.getElementById("loginTab").classList.add("hidden"); document.getElementById("chatTab").classList.remove("hidden"); listenToThreads(); } else { document.getElementById("loginTab").classList.remove("hidden"); document.getElementById("chatTab").classList.add("hidden"); } });

function register() { const email = document.getElementById("regEmail").value; const pass = document.getElementById("regPass").value; firebase.auth().createUserWithEmailAndPassword(email, pass); }

function login() { const email = document.getElementById("logEmail").value; const pass = document.getElementById("logPass").value; firebase.auth().signInWithEmailAndPassword(email, pass); }

function logout() { firebase.auth().signOut(); }

async function sendMessage() { const text = document.getElementById("msgInput").value; const ref = firebase.firestore().collection("chats").doc("default").collection("messages"); await ref.add({ sender: currentUser.email, text, time: firebase.firestore.FieldValue.serverTimestamp() }); document.getElementById("msgInput").value = ""; }

function listenToThreads() { const ref = firebase.firestore().collection("chats").doc("default").collection("messages").orderBy("time"); ref.onSnapshot(snapshot => { const chatBox = document.getElementById("chatBox"); chatBox.innerHTML = ""; snapshot.forEach(doc => { const data = doc.data(); const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = ${data.sender}: ${data.text}; chatBox.appendChild(msg); }); }); }

function switchTab(tabId) { document.querySelectorAll(".tab").forEach(tab => tab.classList.add("hidden")); document.getElementById(tabId).classList.remove("hidden"); }

function setTheme(t) { document.body.className = t; localStorage.setItem("theme", t); }

function loadTheme() { const t = localStorage.getItem("theme") || ""; if (t) document.body.className = t; }

document.addEventListener("DOMContentLoaded", () => { loadTheme();

document.getElementById("btnSend").onclick = sendMessage; document.getElementById("btnRegister").onclick = register; document.getElementById("btnLogin").onclick = login; document.getElementById("btnLogout").onclick = logout; document.getElementById("themeSwitcher").onchange = e => setTheme(e.target.value);

document.querySelectorAll("#tabs button").forEach(btn => { btn.onclick = () => switchTab(btn.dataset.tab); }); });

