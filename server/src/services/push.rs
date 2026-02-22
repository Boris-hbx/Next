//! Web Push notification sender using pure Rust crypto.
//! Implements VAPID authentication (RFC 8292) and payload encryption (RFC 8188).

use aes_gcm::{aead::Aead, Aes128Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hkdf::Hkdf;
use p256::{
    ecdh::EphemeralSecret,
    ecdsa::{signature::Signer, SigningKey, Signature},
    PublicKey,
};
use sha2::Sha256;

/// VAPID key pair loaded from environment variables
pub struct VapidKeys {
    pub signing_key: SigningKey,
    pub public_key_bytes: Vec<u8>, // uncompressed 65 bytes
}

impl VapidKeys {
    /// Load VAPID keys from environment.
    /// VAPID_PRIVATE_KEY: base64url-encoded 32-byte private key
    /// VAPID_PUBLIC_KEY: base64url-encoded 65-byte uncompressed public key
    pub fn from_env() -> Option<Self> {
        let priv_b64 = std::env::var("VAPID_PRIVATE_KEY").ok()?;
        let pub_b64 = std::env::var("VAPID_PUBLIC_KEY").ok()?;

        let priv_bytes = URL_SAFE_NO_PAD.decode(&priv_b64).ok()?;
        let pub_bytes = URL_SAFE_NO_PAD.decode(&pub_b64).ok()?;

        let signing_key = SigningKey::from_bytes(priv_bytes.as_slice().into()).ok()?;

        Some(VapidKeys {
            signing_key,
            public_key_bytes: pub_bytes,
        })
    }

    /// Get the base64url-encoded public key (for frontend subscription)
    pub fn public_key_base64(&self) -> String {
        URL_SAFE_NO_PAD.encode(&self.public_key_bytes)
    }

    /// Create a VAPID Authorization header value for a given push endpoint
    pub fn create_auth_header(&self, endpoint: &str) -> Result<String, String> {
        let url = url::Url::parse(endpoint).map_err(|e| format!("invalid endpoint: {}", e))?;
        let audience = format!("{}://{}", url.scheme(), url.host_str().unwrap_or(""));

        let now = chrono::Utc::now().timestamp();
        let exp = now + 12 * 3600; // 12 hours

        // Build JWT: header.payload.signature
        let header = serde_json::json!({"typ": "JWT", "alg": "ES256"});
        let payload = serde_json::json!({
            "aud": audience,
            "exp": exp,
            "sub": std::env::var("VAPID_SUBJECT").unwrap_or_else(|_| "mailto:admin@example.com".into())
        });

        let h = URL_SAFE_NO_PAD.encode(serde_json::to_string(&header).unwrap().as_bytes());
        let p = URL_SAFE_NO_PAD.encode(serde_json::to_string(&payload).unwrap().as_bytes());
        let signing_input = format!("{}.{}", h, p);

        let sig: Signature = self.signing_key.sign(signing_input.as_bytes());
        let s = URL_SAFE_NO_PAD.encode(sig.to_bytes());

        let jwt = format!("{}.{}", signing_input, s);
        let k = URL_SAFE_NO_PAD.encode(&self.public_key_bytes);

        Ok(format!("vapid t={},k={}", jwt, k))
    }
}

/// Subscription info from the browser's PushManager
pub struct PushSubscription {
    pub endpoint: String,
    pub p256dh: Vec<u8>,  // client public key (65 bytes uncompressed)
    pub auth: Vec<u8>,    // client auth secret (16 bytes)
}

/// Encrypt a payload for Web Push (aes128gcm, RFC 8188)
pub fn encrypt_payload(sub: &PushSubscription, plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    // Generate ephemeral ECDH key pair
    let ephemeral_secret = EphemeralSecret::random(&mut rand_core_06::OsRng);
    let ephemeral_public = ephemeral_secret.public_key();
    let ephemeral_public_bytes = ephemeral_public.to_sec1_bytes();

    // Parse client public key
    let client_public = PublicKey::from_sec1_bytes(&sub.p256dh)
        .map_err(|e| format!("invalid client key: {}", e))?;

    // ECDH shared secret
    let shared_secret = ephemeral_secret.diffie_hellman(&client_public);

    // HKDF for auth_secret → PRK
    let auth_info = build_info(b"WebPush: info\x00", &sub.p256dh, &ephemeral_public_bytes);
    let hk_auth = Hkdf::<Sha256>::new(Some(&sub.auth), shared_secret.raw_secret_bytes());
    let mut prk = [0u8; 32];
    hk_auth.expand(&auth_info, &mut prk)
        .map_err(|_| "HKDF auth expand failed")?;

    // Derive content encryption key (CEK) and nonce
    let hk_cek = Hkdf::<Sha256>::new(Some(&[0u8; 0]), &prk);
    let mut cek = [0u8; 16];
    hk_cek.expand(b"Content-Encoding: aes128gcm\x00", &mut cek)
        .map_err(|_| "HKDF CEK failed")?;

    let mut nonce_bytes = [0u8; 12];
    let hk_nonce = Hkdf::<Sha256>::new(Some(&[0u8; 0]), &prk);
    hk_nonce.expand(b"Content-Encoding: nonce\x00", &mut nonce_bytes)
        .map_err(|_| "HKDF nonce failed")?;

    // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65)
    let mut salt = [0u8; 16];
    rand_core_06::RngCore::fill_bytes(&mut rand_core_06::OsRng, &mut salt);

    // Re-derive with salt
    let hk2 = Hkdf::<Sha256>::new(Some(&salt), &prk);
    let mut cek2 = [0u8; 16];
    hk2.expand(b"Content-Encoding: aes128gcm\x00", &mut cek2)
        .map_err(|_| "HKDF CEK2 failed")?;
    let mut nonce2 = [0u8; 12];
    hk2.expand(b"Content-Encoding: nonce\x00", &mut nonce2)
        .map_err(|_| "HKDF nonce2 failed")?;

    // Encrypt: plaintext + padding delimiter (0x02 for final record)
    let mut padded = Vec::with_capacity(plaintext.len() + 1);
    padded.extend_from_slice(plaintext);
    padded.push(0x02); // final record delimiter

    let cipher = Aes128Gcm::new_from_slice(&cek2)
        .map_err(|_| "AES init failed")?;
    let nonce = Nonce::from_slice(&nonce2);
    let ciphertext = cipher.encrypt(nonce, padded.as_slice())
        .map_err(|_| "AES encrypt failed")?;

    // Build aes128gcm content: header + ciphertext
    let rs: u32 = 4096;
    let mut body = Vec::new();
    body.extend_from_slice(&salt);
    body.extend_from_slice(&rs.to_be_bytes());
    body.push(ephemeral_public_bytes.len() as u8);
    body.extend_from_slice(&ephemeral_public_bytes);
    body.extend_from_slice(&ciphertext);

    Ok((body, ephemeral_public_bytes.to_vec()))
}

fn build_info(prefix: &[u8], client_pub: &[u8], server_pub: &[u8]) -> Vec<u8> {
    let mut info = Vec::new();
    info.extend_from_slice(prefix);
    info.extend_from_slice(client_pub);
    info.extend_from_slice(server_pub);
    info
}

/// Send a Web Push notification
pub async fn send_push(
    vapid: &VapidKeys,
    sub: &PushSubscription,
    payload: &str,
) -> Result<(), PushError> {
    let (body, _) = encrypt_payload(sub, payload.as_bytes())
        .map_err(|e| PushError::Encryption(e))?;

    let auth_header = vapid.create_auth_header(&sub.endpoint)
        .map_err(|e| PushError::Vapid(e))?;

    let client = reqwest::Client::new();
    let resp = client
        .post(&sub.endpoint)
        .header("Authorization", &auth_header)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Encoding", "aes128gcm")
        .header("TTL", "86400")
        .body(body)
        .send()
        .await
        .map_err(|e| PushError::Network(e.to_string()))?;

    let status = resp.status().as_u16();
    match status {
        200 | 201 | 202 => Ok(()),
        404 | 410 => Err(PushError::Gone), // subscription expired
        429 => Err(PushError::RateLimit),
        s if s >= 500 => Err(PushError::ServerError(status)),
        _ => {
            let body = resp.text().await.unwrap_or_default();
            Err(PushError::Other(format!("HTTP {}: {}", status, body)))
        }
    }
}

#[derive(Debug)]
pub enum PushError {
    Encryption(String),
    Vapid(String),
    Network(String),
    Gone,       // 410: subscription no longer valid
    RateLimit,  // 429
    ServerError(u16),
    Other(String),
}

impl std::fmt::Display for PushError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PushError::Encryption(e) => write!(f, "encryption: {}", e),
            PushError::Vapid(e) => write!(f, "vapid: {}", e),
            PushError::Network(e) => write!(f, "network: {}", e),
            PushError::Gone => write!(f, "subscription gone (410)"),
            PushError::RateLimit => write!(f, "rate limited (429)"),
            PushError::ServerError(s) => write!(f, "server error ({})", s),
            PushError::Other(e) => write!(f, "{}", e),
        }
    }
}
