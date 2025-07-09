// 📁 app.js – Fully Synced with index.html & style.css

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js"; import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ✅ Firebase Config const firebaseConfig = { apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4", authDomain: "stringwasp.firebaseapp.com", projectId: "stringwasp", storageBucket: "stringwasp.appspot.com", messagingSenderId: "974718019508", appId: "1:974718019508:web:59fabe6306517d10b374e1" };

const app = initializeApp(firebaseConfig); const db = getFirestore(app);

let currentUser = null; let currentChat = null; let encryptionKey = "stringwasp_encryption_key";

// 🔐 Encryption async function encrypt(text) { const enc = new TextEncoder(); const key = await crypto.subtle.digest("SHA-256", enc.encode(encryptionKey)); const iv = crypto.getRandomValues(new Uint8Array(12)); const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM", iv }, false, ["encrypt"]); const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(text)); return btoa(JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) })); }

async function decrypt(data) { try { const json = JSON.parse(atob(data)); const { iv, data: cipher } = json; const key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey)); const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM", iv: new Uint8Array(iv) }, false, ["decrypt"]); const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, cryptoKey, new Uint8Array(cipher)); return new TextDecoder().decode(decrypted); } catch (e) { return "[Decryption Error]"; } }

// 💬 Messaging async function sendMessage(text, selfDestruct = false, voiceBlob = null) { if (!currentUser || !currentChat) return; const encrypted = await encrypt(text); await addDoc(collection(db, "chats", currentChat, "messages"), { sender: currentUser, message: encrypted, timestamp: serverTimestamp(), seen: false, selfDestruct, voice: voiceBlob || null }); }

function listenToMessages(chatId) { const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp")); onSnapshot(q, async (snapshot) => { for (const doc of snapshot.docChanges()) { const data = doc.doc.data(); const msg = await decrypt(data.message); displayMessage(msg, data.sender, data.timestamp, data.voice); if (data.selfDestruct) setTimeout(() => deleteDoc(doc.doc.ref), 10000); else await updateDoc(doc.doc.ref, { seen: true }); } }); }

function displayMessage(msg, sender, time, voice = null) { const area = document.getElementById("chatArea"); const el = document.createElement("div"); el.className = "msg"; if (voice) { const audio = document.createElement("audio"); audio.controls = true; audio.src = voice; el.appendChild(audio); } else { el.textContent = ${sender}: ${msg}; } area.appendChild(el); }

// 🗣️ Voice function recordVoice(callback) { navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => { const recorder = new MediaRecorder(stream); const chunks = []; recorder.ondataavailable = (e) => chunks.push(e.data); recorder.onstop = () => { const blob = new Blob(chunks); const reader = new FileReader(); reader.onload = () => callback(reader.result); reader.readAsDataURL(blob); }; recorder.start(); setTimeout(() => recorder.stop(), 5000); }); }

// 📌 Pin async function pinMessage(msg) { if (!currentChat) return; await setDoc(doc(db, "chats", currentChat), { pinned: await encrypt(msg) }, { merge: true }); }

async function showPinnedMessage() { const docSnap = await getDoc(doc(db, "chats", currentChat)); if (docSnap.exists() && docSnap.data().pinned) { const pinned = await decrypt(docSnap.data().pinned); document.getElementById("pinnedMessage").textContent = 📌 ${pinned}; } }

// 🧩 Plugins function loadPlugin(pluginFn) { pluginFn({ db, currentUser, currentChat }); }

// 💾 Backup async function exportBackup() { const messages = await getDocs(collection(db, "chats", currentChat, "messages")); const data = []; messages.forEach((doc) => data.push(doc.data())); localStorage.setItem("stringwasp_backup", JSON.stringify(data)); }

async function importBackup() { const backup = JSON.parse(localStorage.getItem("stringwasp_backup")); for (const msg of backup) { await addDoc(collection(db, "chats", currentChat, "messages"), msg); } }

// 🎨 Theme function applyTheme(theme) { document.body.className = theme; localStorage.setItem("theme", theme); }

function loadTheme() { const t = localStorage.getItem("theme"); if (t) document.body.className = t; }

// 🚀 Init window.addEventListener("DOMContentLoaded", () => { loadTheme();

document.getElementById("btnSend").onclick = () => { const msg = document.getElementById("inputMsg").value; sendMessage(msg); };

document.getElementById("btnVoice").onclick = () => { recordVoice((audioData) => sendMessage("[Voice Message]", false, audioData)); };

document.getElementById("btnBackup").onclick = exportBackup; document.getElementById("btnRestore").onclick = importBackup;

document.getElementById("themeSwitcher").onchange = (e) => applyTheme(e.target.value); });

