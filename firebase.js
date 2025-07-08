// DO NOT re-declare firebase
firebase.initializeApp({
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  ...
});

const db = firebase.firestore();
const auth = firebase.auth();
