/* =========================================================
 * StringWasp v2 – P2P Messaging (WebRTC + E2E)
 * ========================================================= */

/* ===== GLOBALS ===== */
let rtcPeerConnections = {};   // Active peer connections { uid: RTCPeerConnection }
let dataChannels = {};         // Data channels for direct messaging { uid: RTCDataChannel }
let encryptionKeys = {};       // Symmetric keys for each friend { uid: AESKey }

/* ===== CONFIG ===== */
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/* =========================================================
 * P2P INITIALIZATION
 * ========================================================= */
function initP2P() {
  console.log("🔗 P2P Engine Ready");
}

/* =========================================================
 * CREATE CONNECTION
 * ========================================================= */
async function createConnection(friendUID) {
  if (rtcPeerConnections[friendUID]) return rtcPeerConnections[friendUID];

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  rtcPeerConnections[friendUID] = pc;

  // DataChannel for sending messages
  const dc = pc.createDataChannel("chat");
  setupDataChannel(dc, friendUID);
  dataChannels[friendUID] = dc;

  // Handle ICE candidates
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignaling(friendUID, { type: "candidate", candidate: event.candidate });
    }
  };

  // Handle remote data channels
  pc.ondatachannel = event => {
    setupDataChannel(event.channel, friendUID);
  };

  // Offer creation
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignaling(friendUID, { type: "offer", offer });

  return pc;
}

/* =========================================================
 * ANSWER CONNECTION
 * ========================================================= */
async function handleOffer(friendUID, offer) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  rtcPeerConnections[friendUID] = pc;

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignaling(friendUID, { type: "candidate", candidate: event.candidate });
    }
  };

  pc.ondatachannel = event => {
    setupDataChannel(event.channel, friendUID);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignaling(friendUID, { type: "answer", answer });
}

/* =========================================================
 * HANDLE ANSWER
 * ========================================================= */
async function handleAnswer(friendUID, answer) {
  const pc = rtcPeerConnections[friendUID];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/* =========================================================
 * HANDLE ICE CANDIDATE
 * ========================================================= */
async function handleCandidate(friendUID, candidate) {
  const pc = rtcPeerConnections[friendUID];
  if (!pc) return;
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

/* =========================================================
 * DATA CHANNEL SETUP
 * ========================================================= */
function setupDataChannel(channel, friendUID) {
  channel.onopen = () => console.log(`📡 DataChannel open with ${friendUID}`);
  channel.onclose = () => console.log(`❌ DataChannel closed with ${friendUID}`);
  channel.onmessage = async (event) => {
    const decrypted = await decryptMessage(friendUID, event.data);
    renderIncomingMessage(friendUID, decrypted);
  };
}

/* =========================================================
 * SEND MESSAGE
 * ========================================================= */
async function sendP2PMessage(friendUID, message) {
  if (!dataChannels[friendUID] || dataChannels[friendUID].readyState !== "open") {
    console.warn("⚠ No open channel with", friendUID);
    return;
  }
  const encrypted = await encryptMessage(friendUID, message);
  dataChannels[friendUID].send(encrypted);
  renderOwnMessage(message);
}

/* =========================================================
 * ENCRYPTION (AES)
 * ========================================================= */
async function getAESKey(friendUID) {
  if (encryptionKeys[friendUID]) return encryptionKeys[friendUID];
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  encryptionKeys[friendUID] = key;
  return key;
}

async function encryptMessage(friendUID, message) {
  const key = await getAESKey(friendUID);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) });
}

async function decryptMessage(friendUID, encryptedData) {
  const key = await getAESKey(friendUID);
  const parsed = JSON.parse(encryptedData);
  const iv = new Uint8Array(parsed.iv);
  const data = new Uint8Array(parsed.data);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

/* =========================================================
 * SIGNALING (VIA FIREBASE)
 * ========================================================= */
function sendSignaling(friendUID, payload) {
  // This uses Firestore's "signals" collection
  db.collection("signals").add({
    from: currentUser.uid,
    to: friendUID,
    payload,
    timestamp: Date.now()
  });
}

function listenForSignals() {
  db.collection("signals").where("to", "==", currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          const { from, payload } = change.doc.data();
          if (payload.type === "offer") handleOffer(from, payload.offer);
          if (payload.type === "answer") handleAnswer(from, payload.answer);
          if (payload.type === "candidate") handleCandidate(from, payload.candidate);
          db.collection("signals").doc(change.doc.id).delete();
        }
      });
    });
}

/* =========================================================
 * MESSAGE RENDER HOOKS
 * ========================================================= */
function renderIncomingMessage(uid, text) {
  addMessageToThread(uid, text, false);
}
function renderOwnMessage(text) {
  addMessageToThread(currentThreadUser, text, true);
}