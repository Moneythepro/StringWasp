let localConnection;
let remoteConnection;
let dataChannel;

function sendFile() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  const recipient = prompt("Enter receiver's email:");

  if (!file || !recipient) return;

  // Create PeerConnection
  localConnection = new RTCPeerConnection();

  // Create data channel
  dataChannel = localConnection.createDataChannel("fileChannel");

  dataChannel.onopen = () => {
    console.log("Data channel open, sending file...");
    sendChunks(file);
  };

  dataChannel.onclose = () => console.log("Data channel closed");

  // Send offer to Firebase
  localConnection.createOffer().then(offer => {
    localConnection.setLocalDescription(offer);

    db.collection("webrtc").add({
      type: "offer",
      offer: JSON.stringify(offer),
      to: recipient,
      from: auth.currentUser.email,
      fileName: file.name
    });
  });

  // ICE
  localConnection.onicecandidate = (e) => {
    if (e.candidate) {
      // Not required in this basic version
    }
  };
}

function listenForOffers() {
  db.collection("webrtc").where("to", "==", auth.currentUser.email)
    .onSnapshot(snapshot => {
      snapshot.forEach(async doc => {
        const data = doc.data();
        if (data.type === "offer") {
          const accept = confirm(`${data.from} wants to send "${data.fileName}". Accept?`);
          if (!accept) {
            db.collection("webrtc").doc(doc.id).delete();
            return;
          }

          // Create connection
          remoteConnection = new RTCPeerConnection();

          remoteConnection.ondatachannel = (event) => {
            const receiveChannel = event.channel;
            const chunks = [];
            receiveChannel.onmessage = (e) => {
              if (e.data === "DONE") {
                const blob = new Blob(chunks);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.fileName;
                a.click();
                alert("File received!");
              } else {
                chunks.push(e.data);
              }
            };
          };

          const offer = JSON.parse(data.offer);
          await remoteConnection.setRemoteDescription(offer);

          const answer = await remoteConnection.createAnswer();
          await remoteConnection.setLocalDescription(answer);

          // Send answer back to Firebase
          db.collection("webrtc").doc(doc.id).update({
            answer: JSON.stringify(answer)
          });

          remoteConnection.onicecandidate = (e) => {
            if (e.candidate) {
              // Not required in basic version
            }
          };
        }

        // Handle answer
        if (data.answer && localConnection && !localConnection.remoteDescription) {
          localConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.answer)));
        }
      });
    });
}

function sendChunks(file) {
  const chunkSize = 16 * 1024; // 16 KB
  const reader = new FileReader();
  let offset = 0;

  reader.onload = (e) => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;

    if (offset < file.size) {
      readSlice(offset);
    } else {
      dataChannel.send("DONE");
      alert("File sent!");
    }
  };

  function readSlice(o) {
    const slice = file.slice(offset, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  readSlice(0);
}