import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "A256GCM";

const getEncryptionKey = () => {
  const encoded = process.env.ATTENDANCE_FACE_ENCRYPTION_KEY_BASE64;
  if (!encoded) {
    const error = new Error("Face embedding encryption is not configured");
    error.statusCode = 503;
    error.code = "FACE_ENCRYPTION_NOT_CONFIGURED";
    throw error;
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    const error = new Error("Face embedding encryption key must decode to 32 bytes");
    error.statusCode = 503;
    error.code = "FACE_ENCRYPTION_NOT_CONFIGURED";
    throw error;
  }
  return key;
};

export const encryptFaceEmbedding = (embedding) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(embedding), "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: ENVELOPE_ALGORITHM,
    keyVersion: "v1",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

export const decryptFaceEmbedding = (envelope) => {
  const key = getEncryptionKey();
  if (!envelope || envelope.algorithm !== ENVELOPE_ALGORITHM || envelope.keyVersion !== "v1") {
    const error = new Error("Stored face embedding has an unsupported encryption format");
    error.statusCode = 500;
    error.code = "FACE_SAMPLE_DECRYPT_FAILED";
    throw error;
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const embedding = JSON.parse(plaintext);
    if (!Array.isArray(embedding) || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error("Invalid decrypted embedding payload");
    }
    return embedding;
  } catch {
    const error = new Error("Unable to read stored face embedding");
    error.statusCode = 500;
    error.code = "FACE_SAMPLE_DECRYPT_FAILED";
    throw error;
  }
};
