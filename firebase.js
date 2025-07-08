<!-- leave the three CDN scripts exactly as-is -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>

<script>
  // ← paste everything from Project Settings exactly
  const firebaseConfig = {
    apiKey:            "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
    authDomain:        "stringwasp.firebaseapp.com",
    projectId:         "stringwasp",
    storageBucket:     "stringwasp.appspot.com",
    messagingSenderId: "974718019508",
    appId:             "1:974718019508:web:79e30ee86f15bf36b374e1"
  };

  firebase.initializeApp(firebaseConfig);

  /* export globals for app.js */
  const auth = firebase.auth();
  const db   = firebase.firestore();
  window.auth = auth;
  window.db   = db;
</script>
