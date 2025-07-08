const client = new WebTorrent();

function sendFile(file) {
  client.seed(file, torrent => {
    const magnetURI = torrent.magnetURI;
    alert("Send this Magnet URI to your friend:\n" + magnetURI);
  });
}

function receiveFile(magnetURI) {
  client.add(magnetURI, torrent => {
    torrent.files.forEach(file => {
      file.getBlobURL((err, url) => {
        if (err) return console.error(err);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.textContent = `Download ${file.name}`;
        document.body.appendChild(link);
        link.click();
      });
    });
  });
}
