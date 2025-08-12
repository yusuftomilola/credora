import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recommended for GCM

export function encrypt(text: string, base64Key: string) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32)
    throw new Error('TOKEN_ENC_KEY must be base64 of 32 bytes');

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // package: iv | tag | encrypted, base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(ciphertextB64: string, base64Key: string) {
  const key = Buffer.from(base64Key, 'base64');
  const buff = Buffer.from(ciphertextB64, 'base64');

  const iv = buff.slice(0, IV_LEN);
  const tag = buff.slice(IV_LEN, IV_LEN + 16);
  const encrypted = buff.slice(IV_LEN + 16);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return out.toString('utf8');
}
