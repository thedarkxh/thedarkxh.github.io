// Cryptographic helper functions using the browser-native Web Crypto API.
// Implements PBKDF2 key derivation, ECDH key exchange, ECDSA signatures, and AES-GCM encryption.

// Helper to convert ArrayBuffer to Base64 string
export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper to convert Base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper to convert string to UTF-8 Uint8Array
export function stringToBytes(str) {
    return new TextEncoder().encode(str);
}

// Helper to convert Uint8Array/ArrayBuffer to string
export function bytesToString(buffer) {
    return new TextDecoder().decode(buffer);
}

/**
 * Derives a master key from user's passphrase and username (used as salt)
 */
export async function deriveMasterKey(username, passphrase) {
    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(username.toLowerCase()); // username as salt
    const passphraseBytes = encoder.encode(passphrase);

    // Import the raw passphrase as a key
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        passphraseBytes,
        'PBKDF2',
        false,
        ['deriveKey', 'deriveBits']
    );

    // Derive a 256-bit master key using PBKDF2-HMAC-SHA256
    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        {
            name: 'HMAC',
            hash: 'SHA-256',
            length: 256
        },
        true, // exportable so we can feed it into HKDF or subkey split
        ['sign', 'verify']
    );
}

/**
 * Splits the master key into K_auth (for server authentication) and K_encrypt (for local key wrapping)
 */
export async function deriveSubKeys(masterKey) {
    // Export the HMAC key to get raw bits
    const rawMasterKey = await window.crypto.subtle.exportKey('raw', masterKey);

    // Import raw bits as HKDF base key
    const hkdfBaseKey = await window.crypto.subtle.importKey(
        'raw',
        rawMasterKey,
        'HKDF',
        false,
        ['deriveKey']
    );

    // Derive K_encrypt (for encrypting private keys)
    const kEncrypt = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32), // empty salt
            info: new TextEncoder().encode('NULL_KEY_ENCRYPTION')
        },
        hkdfBaseKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['encrypt', 'decrypt']
    );

    // Derive K_auth (for server authentication hash)
    const kAuth = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32),
            info: new TextEncoder().encode('NULL_SERVER_AUTH')
        },
        hkdfBaseKey,
        {
            name: 'HMAC',
            hash: 'SHA-256',
            length: 256
        },
        true,
        ['sign']
    );

    // Generate K_auth signature value to send to the server
    const authRaw = await window.crypto.subtle.exportKey('raw', kAuth);
    const authHashBuffer = await window.crypto.subtle.digest('SHA-256', authRaw);
    const authHashHex = Array.from(new Uint8Array(authHashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return { kEncrypt, authHashHex };
}

/**
 * Generates identity key pair (ECDH) and signing key pair (ECDSA)
 */
export async function generateIdentityKeys() {
    // Generate ECDH P-256 key pair for encryption key exchange
    const identityKeyPair = await window.crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true, // exportable
        ['deriveKey', 'deriveBits']
    );

    // Generate ECDSA P-256 key pair for signing/verifying messages
    const signingKeyPair = await window.crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true, // exportable
        ['sign', 'verify']
    );

    return { identityKeyPair, signingKeyPair };
}

/**
 * Encrypts private keys using K_encrypt (AES-GCM)
 */
export async function encryptPrivateKeys(identityPrivate, signingPrivate, kEncrypt) {
    // Export private keys to JWK format
    const jwkIdentity = await window.crypto.subtle.exportKey('jwk', identityPrivate);
    const jwkSigning = await window.crypto.subtle.exportKey('jwk', signingPrivate);

    // Serialize to string
    const plaintext = JSON.stringify({ jwkIdentity, jwkSigning });
    const plaintextBytes = stringToBytes(plaintext);

    // Encrypt using AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        kEncrypt,
        plaintextBytes
    );

    return JSON.stringify({
        ciphertext: arrayBufferToBase64(ciphertextBuffer),
        iv: arrayBufferToBase64(iv)
    });
}

/**
 * Decrypts private keys using K_encrypt (AES-GCM)
 */
export async function decryptPrivateKeys(encryptedKeysJson, kEncrypt) {
    const { ciphertext, iv } = JSON.parse(encryptedKeysJson);
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));

    // Decrypt
    const plaintextBuffer = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes
        },
        kEncrypt,
        ciphertextBuffer
    );

    const plaintext = bytesToString(plaintextBuffer);
    const { jwkIdentity, jwkSigning } = JSON.parse(plaintext);

    // Import the keys back
    const identityPrivate = await window.crypto.subtle.importKey(
        'jwk',
        jwkIdentity,
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        ['deriveKey', 'deriveBits']
    );

    const signingPrivate = await window.crypto.subtle.importKey(
        'jwk',
        jwkSigning,
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true,
        ['sign']
    );

    return { identityPrivate, signingPrivate };
}

/**
 * Encrypts a message for a recipient using ephemeral ECDH key exchange & AES-GCM
 */
export async function encryptMessage(recipientIdentityPubJwk, senderSigningPrivate, messageText) {
    // 1. Import recipient's identity public key from JWK
    const recipientPub = await window.crypto.subtle.importKey(
        'jwk',
        recipientIdentityPubJwk,
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        []
    );

    // 2. Generate an ephemeral ECDH key pair
    const ephemeralKeyPair = await window.crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        ['deriveKey']
    );

    // 3. Derive shared secret from ephemeral private key and recipient's public key
    const sharedSecretKey = await window.crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: recipientPub
        },
        ephemeralKeyPair.privateKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['encrypt']
    );

    // 4. Encrypt message text using AES-GCM
    const plaintextBytes = stringToBytes(messageText);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        sharedSecretKey,
        plaintextBytes
    );

    const ciphertextB64 = arrayBufferToBase64(ciphertextBuffer);
    const ivB64 = arrayBufferToBase64(iv);
    
    // Export ephemeral public key so recipient can do the same DH
    const ephemeralPubJwk = await window.crypto.subtle.exportKey('jwk', ephemeralKeyPair.publicKey);

    // 5. Sign the payload using sender's private signing key to guarantee authenticity
    const payloadToSign = stringToBytes(JSON.stringify({
        ciphertext: ciphertextB64,
        iv: ivB64,
        ephemeralPubJwk
    }));

    const signatureBuffer = await window.crypto.subtle.sign(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-256' }
        },
        senderSigningPrivate,
        payloadToSign
    );

    const signatureB64 = arrayBufferToBase64(signatureBuffer);

    return {
        ciphertext: ciphertextB64,
        iv: ivB64,
        ephemeralPubJwk,
        signature: signatureB64
    };
}

/**
 * Decrypts a message from a sender using recipient's identity private key and verifies signature
 */
export async function decryptMessage(senderSigningPubJwk, recipientIdentityPrivate, encryptedPayload) {
    const { ciphertext, iv, ephemeralPubJwk, signature } = encryptedPayload;

    // 1. Import sender's signing public key
    const senderPub = await window.crypto.subtle.importKey(
        'jwk',
        senderSigningPubJwk,
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true,
        ['verify']
    );

    // 2. Verify signature before decrypting
    const payloadToVerify = stringToBytes(JSON.stringify({
        ciphertext,
        iv,
        ephemeralPubJwk
    }));

    const signatureBuffer = base64ToArrayBuffer(signature);
    const isValid = await window.crypto.subtle.verify(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-256' }
        },
        senderPub,
        signatureBuffer,
        payloadToVerify
    );

    if (!isValid) {
        throw new Error('Message signature verification failed (possible tampering or spoofing)');
    }

    // 3. Import ephemeral public key
    const ephemeralPub = await window.crypto.subtle.importKey(
        'jwk',
        ephemeralPubJwk,
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        []
    );

    // 4. Derive shared secret from recipient's identity private key and ephemeral public key
    const sharedSecretKey = await window.crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: ephemeralPub
        },
        recipientIdentityPrivate,
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['decrypt']
    );

    // 5. Decrypt using AES-GCM
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));

    const plaintextBuffer = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes
        },
        sharedSecretKey,
        ciphertextBuffer
    );

    return bytesToString(plaintextBuffer);
}

/**
 * Signs user authentication data (for websocket handshake verification)
 */
export async function signAuthHandshake(username, timestamp, signingPrivate) {
    const payload = stringToBytes(`${username}:${timestamp}`);
    const signatureBuffer = await window.crypto.subtle.sign(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-256' }
        },
        signingPrivate,
        payload
    );
    return arrayBufferToBase64(signatureBuffer);
}

/**
 * Sign a token using the Admin's signing key to create an invitation
 */
export async function signInviteToken(token, adminSigningPrivate) {
    const payload = stringToBytes(token);
    const signatureBuffer = await window.crypto.subtle.sign(
        {
            name: 'ECDSA',
            hash: { name: 'SHA-256' }
        },
        adminSigningPrivate,
        payload
    );
    return arrayBufferToBase64(signatureBuffer);
}
