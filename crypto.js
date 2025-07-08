async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  localStorage.setItem("publicKey", JSON.stringify(publicKeyJwk));
  localStorage.setItem("privateKey", JSON.stringify(privateKeyJwk));
  return { publicKeyJwk, privateKeyJwk };
}

async function importKey(jwk, type) {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    type === "public" ? ["encrypt"] : ["decrypt"]
  );
}

async function encryptMessage(message, publicKeyJwk) {
  const key = await importKey(publicKeyJwk, "public");
  const enc = new TextEncoder().encode(message);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, enc);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptMessage(encryptedBase64, privateKeyJwk) {
  const key = await importKey(privateKeyJwk, "private");
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}
