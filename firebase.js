<!-- Firebase App (the core Firebase SDK) -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>

<script>
  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
    authDomain: "stringwasp.firebaseapp.com",
    projectId: "stringwasp",
    storageBucket: "stringwasp.appspot.com",  // ✅ FIXED typo here
    messagingSenderId: "974718019508",
    appId: "1:974718019508:web:59fabe6306517d10b374e1"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);

  // Make auth and db globally available
  const auth = firebase.auth();
  const db = firebase.firestore();
  window.auth = auth;
  window.db = db;
</script>
