/** Encodage commun aux vecteurs de la comparaison (§ 4.1) et du registre (§ 6.1) : u32, LP, base64 canonique, graines de TEST et compte des vecteurs. */
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import assert from 'node:assert/strict';

export const MAX_SAFE = 2 ** 53 - 1;

// ---------------------------------------------------------------- encodage

export const u32 = (value) => {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `u32 hors bornes: ${value}`);
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};
export const lp = (bytes) => Buffer.concat([u32(bytes.length), bytes]);
export const utf8 = (text) => Buffer.from(text, 'utf8');
export const b64 = (bytes) => Buffer.from(bytes).toString('base64');
export const hex = (bytes) => Buffer.from(bytes).toString('hex');
export const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts)).digest();
export const labelled = (label, n) => {
  const blocks = [];
  for (let i = 0; Buffer.concat(blocks).length < n; i += 1) blocks.push(sha256(utf8(`${label}#${i}`)));
  return n <= 32 ? sha256(utf8(label)).subarray(0, n) : Buffer.concat(blocks).subarray(0, n);
};

/** base64 canonique (RFC 4648 § 4, avec remplissage) : décodé puis réencodé, identique. */
export function canonicalBase64(text, length) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const bytes = Buffer.from(text, 'base64');
  if (b64(bytes) !== text) return null;
  if (length !== undefined && bytes.length !== length) return null;
  return bytes;
}

/** Une clé d'identité libsignal sérialisée : 0x05 puis 32 octets X25519 (clé de TEST tirée d'une étiquette). */
export function identityKeyFromSeed(seedLabel) {
  const privateScalar = labelled(seedLabel, 32);
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), privateScalar]);
  const publicDer = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' });
  return Buffer.concat([Buffer.from([0x05]), publicDer.subarray(publicDer.length - 32)]);
}

export const USER = '6745a1b2c3d4e5f601234567';
export const OTHER_USER = '6745a1b2c3d4e5f601234568';
export const keyOfSeed = (key) => b64(identityKeyFromSeed(`meeshy-sas-vector/${key}/identity`));
