<!-- DO NOT use import/export syntax in firebase.js -->
<script>
  // Firebase configuration
  var firebaseConfig = {
    apiKey: "AIzaSyAynlob2NhiLZZ0Xh2JPXgAnYNef_gTzs4",
    authDomain: "stringwasp.firebaseapp.com",
    projectId: "stringwasp",
    storageBucket: "stringwasp.appspot.com",
    messagingSenderId: "974718019508",
    appId: "1:974718019508:web:59fabe6306517d10b374e1"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();
  var auth = firebase.auth();
</script>
