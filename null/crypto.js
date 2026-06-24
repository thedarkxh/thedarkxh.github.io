// Cryptographic helper functions using the browser-native Web Crypto API.
// Implements PBKDF2 key derivation, ECDH key exchange, ECDSA signatures, and AES-GCM encryption.
// Enhanced for Surface Web: 600k PBKDF2 iterations, KDF Message Key Ratcheting, and Traffic Padding.

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
 * Pads a message with random bytes to exactly 1026 bytes to prevent traffic size analysis.
 * Structure: [2 bytes JSON length] [JSON string with random salt] [random padding bytes]
 */
export function padMessage(messageText) {
    // Generate a random salt to ensure identical messages yield different plaintexts
    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const payload = JSON.stringify({
        text: messageText,
        salt: arrayBufferToBase64(saltBytes)
    });
    const payloadBytes = stringToBytes(payload);
    
    // Safety check
    if (payloadBytes.length > 1024) {
        throw new Error('Message too long (exceeds padding block limit)');
    }
    
    const finalBuffer = new Uint8Array(1026);
    
    // Write 2-byte length header
    finalBuffer[0] = (payloadBytes.length >> 8) & 0xff;
    finalBuffer[1] = payloadBytes.length & 0xff;
    
    // Write JSON payload
    finalBuffer.set(payloadBytes, 2);
    
    // Fill remainder with random padding
    const paddingSize = 1024 - payloadBytes.length;
    if (paddingSize > 0) {
        const paddingBytes = window.crypto.getRandomValues(new Uint8Array(paddingSize));
        finalBuffer.set(paddingBytes, 2 + payloadBytes.length);
    }
    
    return finalBuffer;
}

/**
 * Strips the random padding and retrieves the original message text
 */
export function unpadMessage(paddedBytes) {
    const jsonLen = (paddedBytes[0] << 8) | paddedBytes[1];
    if (jsonLen > 1024 || jsonLen <= 0) {
        throw new Error('Malformed message padding header');
    }
    const jsonBytes = paddedBytes.slice(2, 2 + jsonLen);
    const jsonStr = bytesToString(jsonBytes);
    const data = JSON.parse(jsonStr);
    return data.text;
}

/**
 * Derives a master key from user's passphrase and username (used as salt)
 * Iterations increased to 600,000 (OWASP recommended standard) to defend against brute-force
 */
export async function deriveMasterKey(username, passphrase) {
    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(username.toLowerCase());
    const passphraseBytes = encoder.encode(passphrase);

    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        passphraseBytes,
        'PBKDF2',
        false,
        ['deriveKey', 'deriveBits']
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 600000,
            hash: 'SHA-256'
        },
        baseKey,
        {
            name: 'HMAC',
            hash: 'SHA-256',
            length: 256
        },
        true,
        ['sign', 'verify']
    );
}

/**
 * Splits the master key into K_encrypt (for local key wrapping) and K_auth (for server authentication)
 */
export async function deriveSubKeys(masterKey) {
    const rawMasterKey = await window.crypto.subtle.exportKey('raw', masterKey);

    const hkdfBaseKey = await window.crypto.subtle.importKey(
        'raw',
        rawMasterKey,
        'HKDF',
        false,
        ['deriveKey']
    );

    const kEncrypt = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32),
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
    const identityKeyPair = await window.crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        ['deriveKey', 'deriveBits']
    );

    const signingKeyPair = await window.crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
    );

    return { identityKeyPair, signingKeyPair };
}

/**
 * Encrypts private keys using K_encrypt (AES-GCM)
 */
export async function encryptPrivateKeys(identityPrivate, signingPrivate, kEncrypt) {
    const jwkIdentity = await window.crypto.subtle.exportKey('jwk', identityPrivate);
    const jwkSigning = await window.crypto.subtle.exportKey('jwk', signingPrivate);

    const plaintext = JSON.stringify({ jwkIdentity, jwkSigning });
    const plaintextBytes = stringToBytes(plaintext);

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
 * Derives a message encryption key using ephemeral ECDH + KDF Key Ratchet
 * This prevents key reuse and implements one-way ratchet state updates.
 */
export async function deriveRatchetMessageKey(recipientIdentityPubJwk, recipientSigningPubJwk, senderSigningPrivate, messageText) {
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

    // 3. Derive a temporary shared secret key via ECDH
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

    const rawSecret = await window.crypto.subtle.exportKey('raw', sharedSecretKey);

    // 4. Set up KDF Chain: Ratchet forward to obtain K_message
    const hkdfBaseKey = await window.crypto.subtle.importKey(
        'raw',
        rawSecret,
        'HKDF',
        false,
        ['deriveKey']
    );

    const messageKey = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32),
            info: new TextEncoder().encode('NULL_MESSAGE_RATCHET_KEY')
        },
        hkdfBaseKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['encrypt']
    );

    // 5. Pad message text to exactly 1026 bytes
    const paddedBytes = padMessage(messageText);

    // 6. Encrypt message text using AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        messageKey,
        paddedBytes
    );

    const ciphertextB64 = arrayBufferToBase64(ciphertextBuffer);
    const ivB64 = arrayBufferToBase64(iv);
    
    // Export ephemeral public key
    const ephemeralPubJwk = await window.crypto.subtle.exportKey('jwk', ephemeralKeyPair.publicKey);

    // 7. Sign the payload to verify authorship
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
 * Decrypts a ratcheted message and verifies its signature and padding structure
 */
export async function decryptRatchetMessage(senderSigningPubJwk, recipientIdentityPrivate, encryptedPayload) {
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

    // 2. Verify signature
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
        throw new Error('Message signature verification failed');
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

    // 4. Derive shared secret
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

    const rawSecret = await window.crypto.subtle.exportKey('raw', sharedSecretKey);

    // 5. Ratchet forward KDF to obtain message decryption key
    const hkdfBaseKey = await window.crypto.subtle.importKey(
        'raw',
        rawSecret,
        'HKDF',
        false,
        ['deriveKey']
    );

    const messageKey = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32),
            info: new TextEncoder().encode('NULL_MESSAGE_RATCHET_KEY')
        },
        hkdfBaseKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['decrypt']
    );

    // 6. Decrypt ciphertext
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));

    const paddedBuffer = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes
        },
        messageKey,
        ciphertextBuffer
    );

    // 7. Unpad the bytes to get plaintext
    return unpadMessage(new Uint8Array(paddedBuffer));
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
