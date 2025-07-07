<!-- firebase.js -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
<script>
  // Your Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
    authDomain: "stringwasp.firebaseapp.com",
    projectId: "stringwasp",
    storageBucket: "stringwasp.appspot.com",
    messagingSenderId: "974718019508",
    appId: "1:974718019508:web:79e30ee86f15bf36b374e1"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);

  // Global auth & db
  window.auth = firebase.auth();
  window.db = firebase.firestore();
</script>
