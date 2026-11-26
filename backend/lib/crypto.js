const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const secret = process.env.PANEL_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) {
    throw new Error('Chave de criptografia não configurada (PANEL_ENCRYPTION_KEY ou SUPABASE_SERVICE_KEY).');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Criptografa um texto usando AES-256-GCM.
 * Retorna o valor original se já estiver criptografado ou vazio.
 * @param {string | null | undefined} plainText
 * @returns {string | null}
 */
function encryptSecret(plainText) {
  if (!plainText) return null;
  if (typeof plainText === 'string' && plainText.startsWith(PREFIX)) {
    return plainText;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa um valor gerado por encryptSecret.
 * Mantém compatibilidade com senhas antigas salvas em texto puro.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function decryptSecret(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    return value;
  }

  const payload = value.slice(PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de senha criptografada inválido.');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret,
};
