const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization Vector

async function generateKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("stringwasp-salt"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(text, password) {
  const enc = new TextEncoder();
  const key = await generateKey(password);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(text)
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: Array.from(iv)
  };
}

async function decryptMessage(ciphertext, ivArr, password) {
  const dec = new TextDecoder();
  const key = await generateKey(password);
  const encryptedData = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = Uint8Array.from(ivArr);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );
  return dec.decode(decrypted);
}