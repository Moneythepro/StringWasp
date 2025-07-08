const { auth, db } = window.firebaseServices;

window.StringWaspP2P = {
  peerConnection: null,
  dataChannel: null,
  currentFile: null,
  CHUNK_SIZE: 16384,

  initP2P() {
    document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelect(e));
    this.listenForFileOffers();
  },

  handleFileSelect(event) {
    this.currentFile = event.target.files[0];
    if (!this.currentFile) return;
    
    const recipient = prompt("Enter recipient's email:");
    if (!recipient) return;
    
    this.startFileTransfer(recipient, this.currentFile);
  },

  async startFileTransfer(recipient, file) {
    try {
      this.showLoading(`Initiating transfer to ${recipient}...`);
      
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      this.dataChannel = this.peerConnection.createDataChannel('fileTransfer');
      
      this.dataChannel.onopen = () => {
        this.showLoading(`Sending ${file.name}...`);
        this.sendFileInChunks(file);
      };
      
      this.dataChannel.onclose = () => this.cleanupP2P();
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      await db.collection('fileTransfers').add({
        from: auth.currentUser.email,
        to: recipient,
        offer: JSON.stringify(offer),
        fileName: file.name,
        fileSize: file.size,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      this.peerConnection.onicecandidate = (e) => {
        if (e.candidate) console.log('New ICE candidate');
      };
      
    } catch (error) {
      console.error('File transfer error:', error);
      alert('Failed to initiate file transfer');
      this.cleanupP2P();
    }
  },

  // [Include all other existing methods...]
  listenForFileOffers() { /* ... */ },
  sendFileInChunks(file) { /* ... */ },
  cleanupP2P() { /* ... */ },
  showLoading(message) { /* ... */ },
  hideLoading() { /* ... */ }
};
