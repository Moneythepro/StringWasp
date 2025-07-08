import { auth, db } from './firebase.js';

let peerConnection;
let dataChannel;
let currentFile = null;
const CHUNK_SIZE = 16384; // 16KB chunks

function initP2P() {
  document.getElementById('fileInput').addEventListener('change', handleFileSelect);
  listenForFileOffers();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  currentFile = file;
  const recipient = prompt("Enter recipient's email:");
  if (!recipient) return;
  
  startFileTransfer(recipient, file);
}

async function startFileTransfer(recipient, file) {
  try {
    showLoading(`Initiating transfer to ${recipient}...`);
    
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    
    dataChannel.onopen = () => {
      showLoading(`Sending ${file.name}...`);
      sendFileInChunks(file);
    };
    
    dataChannel.onclose = () => {
      console.log('Data channel closed');
      cleanupP2P();
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await db.collection('fileTransfers').add({
      from: auth.currentUser.email,
      to: recipient,
      offer: JSON.stringify(offer),
      fileName: file.name,
      fileSize: file.size,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
      }
    };
    
  } catch (error) {
    console.error('File transfer error:', error);
    alert('Failed to initiate file transfer');
    cleanupP2P();
  } finally {
    hideLoading();
  }
}

function listenForFileOffers() {
  db.collection('fileTransfers')
    .where('to', '==', auth.currentUser.email)
    .onSnapshot(async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const offerData = change.doc.data();
          const accept = confirm(`${offerData.from} wants to send you "${offerData.fileName}" (${formatFileSize(offerData.fileSize)}). Accept?`);
          
          if (!accept) {
            await change.doc.ref.delete();
            return;
          }
          
          await handleFileOffer(change.doc.id, offerData);
        }
      });
    });
}

async function handleFileOffer(docId, offerData) {
  try {
    showLoading(`Receiving ${offerData.fileName}...`);
    
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    
    const receivedChunks = [];
    
    peerConnection.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      
      receiveChannel.onmessage = (event) => {
        if (event.data === 'DONE') {
          completeFileDownload(receivedChunks, offerData.fileName);
        } else {
          receivedChunks.push(event.data);
        }
      };
    };
    
    await peerConnection.setRemoteDescription(JSON.parse(offerData.offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    await db.collection('fileTransfers').doc(docId).update({
      answer: JSON.stringify(answer)
    });
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
      }
    };
    
  } catch (error) {
    console.error('File offer error:', error);
    alert('Failed to handle file transfer');
    cleanupP2P();
  } finally {
    hideLoading();
  }
}

function sendFileInChunks(file) {
  const fileReader = new FileReader();
  let offset = 0;
  
  fileReader.onload = (event) => {
    if (dataChannel.readyState === 'open') {
      dataChannel.send(event.target.result);
      offset += event.target.result.byteLength;
      
      if (offset < file.size) {
        readNextChunk(file, fileReader, offset);
      } else {
        dataChannel.send('DONE');
        showTransferComplete(file.name);
        cleanupP2P();
      }
    }
  };
  
  readNextChunk(file, fileReader, offset);
}

function readNextChunk(file, fileReader, offset) {
  const slice = file.slice(offset, offset + CHUNK_SIZE);
  fileReader.readAsArrayBuffer(slice);
}

function completeFileDownload(chunks, fileName) {
  const blob = new Blob(chunks);
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showTransferComplete(fileName, true);
    cleanupP2P();
  }, 100);
}

function showTransferComplete(fileName, isDownload = false) {
  alert(`${isDownload ? 'Received' : 'Sent'} file "${fileName}" successfully!`);
}

function cleanupP2P() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  currentFile = null;
  document.getElementById('fileInput').value = '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { initP2P };
