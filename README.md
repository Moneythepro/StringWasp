# 🐝 StringWasp — A Secure, Fast, P2P Chat Web App

StringWasp is a modern, Telegram/Instagram-style chat application built with **Firebase**, **WebRTC**, and **end-to-end encryption** — all hosted **free on GitHub Pages**.

> ⚡ Real-time chat, file sharing, encryption, and group controls — no server needed!

---

## 🚀 Features

- 🔐 **End-to-End Encrypted** chat (AES-256 using room password)
- 🧑‍🤝‍🧑 **Group chats** with creator/admin/member roles
- ✍️ Live **typing indicators**
- 📎 **Peer-to-peer file sharing** (WebRTC — no server storage!)
- 🛠 Room management:
  - Create / leave rooms freely
  - View public room list & member counts
  - Creator/admin can **add/remove users**
  - Creator can promote **up to 3 admins**
- 🔔 Desktop **notifications + sounds**
- 🖼 Upload avatar, name, bio
- 📱 Fully responsive & mobile friendly

---

## 🛠 Technologies Used

- 🔥 Firebase (Auth, Firestore)
- 📡 WebRTC (P2P file transfer)
- 🛡 JavaScript Crypto API (AES-GCM)
- 🌐 Hosted with GitHub Pages

---

## 🧑‍💻 How to Run Locally

> You can run it offline or host it live:

### 🔹 Option 1: Open Offline

1. Download all files in this repo  
2. Open `index.html` in your browser  
3. Sign up with Firebase credentials  
4. Start chatting in rooms (use same password to decrypt messages)

---

### 🔹 Option 2: Host on GitHub Pages (FREE)

1. Fork or upload this project to your own GitHub repo  
2. Go to **Settings > Pages**  
3. Under “Source”, select `main` branch, `/root` folder  
4. GitHub will give you a public link like:

https://Moneythepro.github.io/stringwasp/

5. ✅ Done! Fully working P2P encrypted chat site

---

## ⚠️ Security Note

- Room passwords are **not stored anywhere**
- To read past messages, you must enter the correct password
- Files are **shared peer-to-peer** and never uploaded to Firebase

---

## 📂 Project Structure

chat-app/ ├── index.html       ← Main page ├── style.css        ← Layout & visuals ├── app.js           ← Login, chat, logic ├── firebase.js      ← Firebase config ├── p2p.js           ← WebRTC file sharing ├── crypto.js        ← AES-GCM encryption └── README.md        ← This file

---

## 📣 Credits

Created by Moneythepro 
Inspired by Telegram, Discord, and secure messaging protocols  
Hosted on GitHub Pages — forever free 🧡
