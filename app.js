// Get Firebase services from global object
const { auth, db, rtdb } = window.firebaseServices;

class StringWasp {
  static init() {
    this.state = {
      currentUser: null,
      currentRoom: "general",
      unsubs: [],
      isTyping: false,
      typingTimeout: null,
      lastMessageTime: 0
    };
    this.setupEventListeners();
    this.checkAuthState();
    
    // Request notification permission
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }

  // ================= EVENT LISTENERS =================
  static setupEventListeners() {
    // Auth Listeners
    document.getElementById('loginBtn').addEventListener('click', this.login.bind(this));
    document.getElementById('registerBtn').addEventListener('click', this.register.bind(this));
    document.getElementById('saveUsernameBtn').addEventListener('click', this.saveUsername.bind(this));
    document.getElementById('logoutBtn').addEventListener('click', this.logout.bind(this));
    
    // Room Listeners
    document.getElementById('createRoomBtn').addEventListener('click', this.createOrJoinRoom.bind(this));
    document.getElementById('roomDropdown').addEventListener('change', (e) => this.joinRoom(e.target.value));
    document.getElementById('leaveRoomBtn').addEventListener('click', this.leaveRoom.bind(this));
    
    // Message Listeners
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
    document.getElementById('sendMessageBtn').addEventListener('click', this.sendMessage.bind(this));
    document.getElementById('messageInput').addEventListener('input', this.handleTyping.bind(this));
    
    // Admin Listeners
    document.getElementById('inviteBtn').addEventListener('click', () => {
      document.getElementById('adminModal').style.display = 'flex';
    });
    document.querySelector('.close-modal').addEventListener('click', () => {
      document.getElementById('adminModal').style.display = 'none';
    });
    document.getElementById('addMemberBtn').addEventListener('click', this.addMember.bind(this));
    document.getElementById('removeMemberBtn').addEventListener('click', this.removeMember.bind(this));
    document.getElementById('promoteMemberBtn').addEventListener('click', this.promoteMember.bind(this));
  }

  // ================= AUTHENTICATION =================
  static async login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!email || !password) {
      alert("Please enter both email and password");
      return;
    }

    try {
      this.showLoading("Signing in...");
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      alert(`Login failed: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  static async register() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!email || !password) {
      alert("Please enter both email and password");
      return;
    }

    try {
      this.showLoading("Creating account...");
      await auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
      alert(`Registration failed: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  static async saveUsername() {
    const username = document.getElementById('newUsername').value.trim();
    
    if (!username) {
      alert("Please enter a username");
      return;
    }

    try {
      this.showLoading("Saving username...");
      await db.collection('users').doc(this.state.currentUser.uid).set({
        username: username,
        email: this.state.currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      this.startApp(this.state.currentUser, { username });
    } catch (error) {
      alert(`Error saving username: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  static async logout() {
    try {
      this.showLoading("Logging out...");
      await auth.signOut();
    } catch (error) {
      alert(`Logout failed: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  // ================= ROOM MANAGEMENT =================
  static async createRoomIfMissing(roomName) {
    const roomRef = db.collection('rooms').doc(roomName);
    const roomDoc = await roomRef.get();
    
    if (!roomDoc.exists) {
      await roomRef.set({
        name: roomName,
        creator: this.state.currentUser.email,
        admins: [this.state.currentUser.email],
        members: [this.state.currentUser.email],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  static async joinRoom(roomName) {
    this.cleanupListeners();
    this.state.currentRoom = roomName;
    document.getElementById('currentRoomTitle').textContent = 
      roomName === 'general' ? 'General Chat' : roomName;

    try {
      await db.collection('rooms').doc(roomName).update({
        members: firebase.firestore.FieldValue.arrayUnion(this.state.currentUser.email)
      });
      
      this.setupMessageListener();
      this.setupTypingListener();
      this.setupAdminPanel();
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Failed to join room");
    }
  }

  // ================= MESSAGING =================
  static setupMessageListener() {
    const unsubscribe = db.collection('messages')
      .doc(this.state.currentRoom)
      .collection('chat')
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = '';
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            this.displayMessage(change.doc.data());
          }
        });
        
        this.scrollToBottom();
      });
    
    this.state.unsubs.push(unsubscribe);
  }

  static async sendMessage() {
    const messageText = document.getElementById('messageInput').value.trim();
    if (!messageText) return;

    try {
      this.showLoading("Sending message...");
      
      const messageData = {
        sender: this.state.currentUser.email,
        text: messageText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('messages')
        .doc(this.state.currentRoom)
        .collection('chat')
        .add(messageData);
      
      document.getElementById('messageInput').value = '';
      this.stopTyping();
      
      // Play notification sound for others
      this.playNotification();
    } catch (error) {
      alert(`Failed to send message: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  // ================= TYPING INDICATORS =================
  static handleTyping() {
    if (!this.state.isTyping) {
      this.state.isTyping = true;
      db.collection('typing').doc(this.state.currentRoom).set({
        [this.state.currentUser.email]: true
      }, { merge: true });
    }
    
    clearTimeout(this.state.typingTimeout);
    this.state.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  static stopTyping() {
    this.state.isTyping = false;
    db.collection('typing').doc(this.state.currentRoom).set({
      [this.state.currentUser.email]: false
    }, { merge: true });
  }

  // ================= UTILITIES =================
  static showLoading(message) {
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'flex';
    if (message) {
      loadingEl.querySelector('p').textContent = message;
    }
  }

  static hideLoading() {
    document.getElementById('loading').style.display = 'none';
  }

  static playNotification() {
    const audio = new Audio('notification.mp3');
    audio.play().catch(e => console.log("Audio play failed:", e));
  }

  static scrollToBottom() {
    const messagesEl = document.getElementById('messages');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// Initialize the app
window.StringWasp = StringWasp;
