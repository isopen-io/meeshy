/**
 * Vecteurs communs de la vérification d'appareil par code court (« meeshy-device-verification:v1 ») — spec 2026-11-17, v3,
 * § 4 et § 8. La COMPARAISON seulement : le registre de confiance (§ 6, entrées signées) attend la contre-relecture de
 * son texte v3, et son fichier (`trust-ledger-v1.cases.json`) arrivera avec le lot 0b, par ce même script.
 *
 *   node generate-device-verification-vectors.mjs [<sas-emoji.json amont> <dossier de sortie> <LICENSE amont>]
 *
 * Sans argument, le script lit la table amont versée au dépôt (fixtures/e2ee-device-verification/upstream/) et écrit dans
 * fixtures/e2ee-device-verification/ ; `--check` régénère dans un dossier temporaire et compare à l'octet (CI).
 *
 * Oracle node:crypto, contre-calculé par WebCrypto et par HKDF recomposé à la main sur HMAC-SHA-256 ; RFC 5869 A.1 et
 * A.3 rejoués d'abord par les trois chemins. Aucune bibliothèque tierce : la comparaison n'a besoin que de SHA-256,
 * HMAC et HKDF. Clés de TEST seulement (graines publiques, jamais réutilisées).
 */
import { createHash, createHmac, hkdfSync, createPrivateKey, createPublicKey, webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ARGS = process.argv.slice(2);
const CHECK = ARGS.includes('--check');
const positional = ARGS.filter((a) => !a.startsWith('--'));
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'e2ee-device-verification');
const emojiSourcePath = positional[0] ?? join(FIXTURES, 'upstream', 'matrix-sas-emoji.json');
const upstreamLicensePath = positional[2] ?? join(FIXTURES, 'upstream', 'LICENSE');
const outDir = CHECK ? mkdtempSync(join(tmpdir(), 'device-verification-')) : (positional[1] ?? FIXTURES);
if (!existsSync(emojiSourcePath)) {
  process.stderr.write(`table amont introuvable : ${emojiSourcePath}\n`);
  process.exit(2);
}

const PROTOCOL = 'meeshy-device-verification:v1';
const LABEL_COMMITMENT = `${PROTOCOL}|commitment`;
const LABEL_TRANSCRIPT = `${PROTOCOL}|transcript`;
const LABEL_SAS = `${PROTOCOL}|sas`;
const CODE_BYTES = 6;
const ACK_BYTES = 2;
const OKM_BYTES = CODE_BYTES + ACK_BYTES;
const TX_BYTES = 16;
const NONCE_BYTES = 32;
const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt_BR', 'ar'];

// ---------------------------------------------------------------- encodage

const u32 = (value) => {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `u32 hors bornes: ${value}`);
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};
const lp = (bytes) => Buffer.concat([u32(bytes.length), bytes]);
const utf8 = (text) => Buffer.from(text, 'utf8');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts)).digest();
const labelled = (label, n) => {
  const blocks = [];
  for (let i = 0; Buffer.concat(blocks).length < n; i += 1) blocks.push(sha256(utf8(`${label}#${i}`)));
  return n <= 32 ? sha256(utf8(label)).subarray(0, n) : Buffer.concat(blocks).subarray(0, n);
};

const OBJECT_ID = /^[0-9a-f]{24}$/;
const PLATFORMS = new Set(['ios', 'macos', 'android', 'web']);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

/** base64 canonique (RFC 4648 § 4, avec remplissage) : décodé puis réencodé, identique. */
function canonicalBase64(text, length) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const bytes = Buffer.from(text, 'base64');
  if (b64(bytes) !== text) return null;
  if (length !== undefined && bytes.length !== length) return null;
  return bytes;
}

/** Le libellé : scalaires Unicode bien formés, NFC, sans contrôle, 1 à 64 unités UTF-16 ; absent = champ omis. */
function labelProblem(label) {
  if (label === undefined) return null;
  if (typeof label !== 'string') return 'type';
  if (label.length === 0) return 'vide';
  if (!label.isWellFormed()) return 'demi-paire';
  if (label.normalize('NFC') !== label) return 'non-nfc';
  if (CONTROL.test(label)) return 'controle';
  if (label.length > 64) return 'trop-long';
  return null;
}

/** Validation à la réception d'un descripteur (§ 4.1, § 4.8) : rend la raison du refus, ou null. */
function descriptorProblem(device) {
  if (typeof device.userId !== 'string' || !OBJECT_ID.test(device.userId)) return 'userId';
  if (!Number.isInteger(device.deviceId) || device.deviceId < 1 || device.deviceId > 127) return 'deviceId';
  if (!Number.isInteger(device.registrationId) || device.registrationId < 1 || device.registrationId > 16383) return 'registrationId';
  const key = canonicalBase64(device.identityKey, 33);
  if (!key || key[0] !== 0x05) return 'identityKey';
  if (!PLATFORMS.has(device.platform)) return 'platform';
  return labelProblem(device.label) ? 'label' : null;
}

/** Une clé d'identité libsignal sérialisée : 0x05 puis 32 octets X25519 (clé de TEST tirée d'une étiquette). */
function identityKeyFromSeed(seedLabel) {
  const privateScalar = labelled(seedLabel, 32);
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), privateScalar]);
  const publicDer = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' });
  return Buffer.concat([Buffer.from([0x05]), publicDer.subarray(publicDer.length - 32)]);
}

/**
 * enc(X) = LP(ascii(userId)) ‖ u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey) ‖ LP(utf8(platform)) ‖ LP(utf8(label ?? ""))
 * Le userId voyage en minuscules ; rien n'est normalisé ici (§ 4.1, B.3).
 */
function deviceDescriptor(device) {
  const problem = descriptorProblem(device);
  assert.equal(problem, null, `descripteur refusé (${problem})`);
  return Buffer.concat([
    lp(Buffer.from(device.userId, 'ascii')),
    u32(device.deviceId),
    u32(device.registrationId),
    lp(Buffer.from(device.identityKey, 'base64')),
    lp(utf8(device.platform)),
    lp(utf8(device.label ?? '')),
  ]);
}

/** Même encodage, SANS validation : sert aux propriétés de la fonction (un champ change ⇒ le code change). */
function rawDescriptor(device) {
  return Buffer.concat([
    lp(Buffer.from(device.userId, 'ascii')), u32(device.deviceId), u32(device.registrationId),
    lp(Buffer.from(device.identityKey, 'base64')), lp(utf8(device.platform)), lp(utf8(device.label ?? '')),
  ]);
}

const commitmentOf = ({ tx, initiatorNonce }, encI) => sha256(lp(utf8(LABEL_COMMITMENT)), lp(tx), lp(encI), lp(initiatorNonce));
const transcriptOf = ({ tx }, encI, encR, commit) => Buffer.concat([lp(utf8(LABEL_TRANSCRIPT)), lp(tx), lp(encI), lp(encR), lp(commit)]);
const sasInfo = (transcriptBytes) => Buffer.concat([utf8(LABEL_SAS), sha256(transcriptBytes)]);

// ---------------------------------------------------------------- HKDF par trois chemins

const hkdfNode = (ikm, salt, info, length) => Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
/** HKDF recomposé sur HMAC (RFC 5869 § 2.2, § 2.3) ; un sel vide s'écrit en 32 octets nuls (contrat JCE). */
function hkdfManual(ikm, salt, info, length) {
  const prk = createHmac('sha256', salt.length === 0 ? Buffer.alloc(32) : salt).update(ikm).digest();
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let i = 1; Buffer.concat(blocks).length < length; i += 1) {
    previous = createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([i])])).digest();
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}
async function hkdfWebCrypto(ikm, salt, info, length) {
  const key = await webcrypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return Buffer.from(await webcrypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}
async function hkdfAllPaths(ikm, salt, info, length, what) {
  const out = hkdfNode(ikm, salt, info, length);
  assert.deepEqual(hkdfManual(ikm, salt, info, length), out, `${what}: HKDF manuel ≠ node`);
  assert.deepEqual(await hkdfWebCrypto(ikm, salt, info, length), out, `${what}: HKDF WebCrypto ≠ node`);
  return out;
}

// RFC 5869, annexe A, cas 1 (sel non vide) et cas 3 (sel et info vides) : chaque banc les rejoue d'abord (R1).
const RFC5869 = [
  { name: 'rfc5869-A.1', ikm: '0b'.repeat(22), salt: '000102030405060708090a0b0c', info: 'f0f1f2f3f4f5f6f7f8f9', length: 42,
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865' },
  { name: 'rfc5869-A.3', ikm: '0b'.repeat(22), salt: '', info: '', length: 42,
    okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8' },
];
for (const v of RFC5869) {
  const out = await hkdfAllPaths(Buffer.from(v.ikm, 'hex'), Buffer.from(v.salt, 'hex'), Buffer.from(v.info, 'hex'), v.length, v.name);
  assert.equal(hex(out), v.okm, `${v.name}: sortie ≠ RFC 5869`);
}

// ---------------------------------------------------------------- rendus

const bigOf = (bytes) => [...bytes].reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
/** Code, emoji : 42 premiers bits des 6 octets du code, 7 groupes de 6 bits poids fort d'abord (m.sas.v1). */
const codeSymbols = (code) => Array.from({ length: 7 }, (_, i) => Number((bigOf(code.subarray(0, 6)) >> BigInt(42 - 6 * i)) & 0x3fn));
/** Code, chiffres : 39 bits, 3 nombres de 13 bits + 1000 (m.sas.v1). */
const codeDecimals = ([b0, b1, b2, b3, b4]) => [((b0 << 5) | (b1 >> 3)) + 1000, (((b1 & 7) << 10) | (b2 << 2) | (b3 >> 6)) + 1000, (((b3 & 63) << 7) | (b4 >> 1)) + 1000];
/** Accusé (octets 6 et 7 de la sortie HKDF) : 2 symboles (12 bits) ou 1 nombre (13 bits + 1000). */
const ackSymbols = ([a0, a1]) => [a0 >> 2, ((a0 & 3) << 4) | (a1 >> 4)];
const ackDecimal = ([a0, a1]) => ((a0 << 5) | (a1 >> 3)) + 1000;
/** Symboles (7) → 6 octets du code dont seuls les 42 premiers bits comptent ; les 6 derniers bits sont repris de `tail`. */
function codeFromSymbols(symbols, tailBits) {
  const n = symbols.reduce((acc, s) => (acc << 6n) | BigInt(s), 0n);
  const full = (n << 6n) | BigInt(tailBits);
  return Buffer.from(Array.from({ length: 6 }, (_, i) => Number((full >> BigInt(40 - 8 * i)) & 0xffn)));
}

// ---------------------------------------------------------------- table emoji (dérivée de matrix-spec, Apache-2.0)

const sourceBytes = readFileSync(emojiSourcePath);
const sourceSha256 = hex(sha256(sourceBytes));
assert.equal(sourceSha256, '2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887', 'source matrix-spec inattendue');
const source = JSON.parse(sourceBytes.toString('utf8'));
assert.equal(source.length, 64, 'la table SAS compte 64 emoji');
const table = source.map((entry, index) => {
  assert.equal(entry.number, index, 'table non ordonnée');
  const names = Object.fromEntries(LANGS.map((lang) => [lang === 'pt_BR' ? 'pt-BR' : lang, lang === 'en' ? entry.description : entry.translated_descriptions[lang]]));
  Object.entries(names).forEach(([lang, name]) => assert.ok(typeof name === 'string' && name.length > 0, `nom manquant ${index}/${lang}`));
  return { number: entry.number, emoji: entry.emoji, unicode: entry.unicode, names };
});
const render = (indexes) => ({
  indexes,
  emoji: indexes.map((i) => table[i].emoji),
  names: Object.fromEntries(Object.keys(table[0].names).map((lang) => [lang, indexes.map((i) => table[i].names[lang])])),
});

// ---------------------------------------------------------------- appareils de test

const USER = '6745a1b2c3d4e5f601234567';
const OTHER_USER = '6745a1b2c3d4e5f601234568';
const keyOfSeed = (key) => b64(identityKeyFromSeed(`meeshy-sas-vector/${key}/identity`));
const device = (key, fields) => ({ userId: USER, identityKey: keyOfSeed(key), ...fields });

const IPHONE = device('iphone', { deviceId: 1, registrationId: 4211, platform: 'ios', label: 'iPhone de Zoé' });
const PIXEL = device('pixel', { deviceId: 2, registrationId: 9054, platform: 'android', label: 'Pixel 8' });
const BROWSER = device('browser', { deviceId: 3, registrationId: 15022, platform: 'web', label: 'Navigateur — Mac de Zoé' });
const IPAD = device('ipad', { deviceId: 4, registrationId: 1, platform: 'ios' });
const PHANTOM = device('phantom', { deviceId: 5, registrationId: 777, platform: 'ios', label: 'iPhone de Zoé' });

const inputsOf = (name, initiator, responder, overrides = {}) => ({
  name,
  tx: labelled(`meeshy-sas-vector/${name}/tx`, TX_BYTES),
  initiator,
  responder,
  initiatorNonce: labelled(`meeshy-sas-vector/${name}/initiator-nonce`, NONCE_BYTES),
  responderNonce: labelled(`meeshy-sas-vector/${name}/responder-nonce`, NONCE_BYTES),
  ...overrides,
});

/** Calcule tout ce qu'une plateforme doit retrouver ; `encode` = deviceDescriptor (validé) ou rawDescriptor (propriétés). */
async function compute(inputs, encode = deviceDescriptor) {
  const encI = encode(inputs.initiator);
  const encR = encode(inputs.responder);
  const commit = commitmentOf(inputs, encI);
  const commitWeb = Buffer.from(await webcrypto.subtle.digest('SHA-256', Buffer.concat([lp(utf8(LABEL_COMMITMENT)), lp(inputs.tx), lp(encI), lp(inputs.initiatorNonce)])));
  assert.deepEqual(commitWeb, commit, `${inputs.name}: engagement WebCrypto ≠ node`);
  const transcriptBytes = transcriptOf(inputs, encI, encR, commit);
  const okm = await hkdfAllPaths(Buffer.concat([inputs.initiatorNonce, inputs.responderNonce]), Buffer.alloc(0), sasInfo(transcriptBytes), OKM_BYTES, inputs.name);
  const code = okm.subarray(0, CODE_BYTES);
  const ack = okm.subarray(CODE_BYTES, OKM_BYTES);
  const symbols = render(codeSymbols(code));
  const ackRender = render(ackSymbols(ack));
  return {
    initiatorDescriptorHex: hex(encI),
    responderDescriptorHex: hex(encR),
    commitment: b64(commit),
    transcriptSha256Hex: hex(sha256(transcriptBytes)),
    hkdfOutputHex: hex(okm),
    sasBytesHex: hex(code),
    emojiIndexes: symbols.indexes,
    emoji: symbols.emoji,
    emojiNames: symbols.names,
    decimal: codeDecimals(code),
    ack: { bytesHex: hex(ack), emojiIndexes: ackRender.indexes, emoji: ackRender.emoji, emojiNames: ackRender.names, decimal: ackDecimal(ack) },
  };
}

const wireDescriptor = (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
const wireOf = (inputs, expected) => ({
  request: { v: 1, type: 'request', tx: b64(inputs.tx), from: wireDescriptor(inputs.initiator), commitment: expected.commitment, methods: ['emoji', 'decimal'] },
  accept: { v: 1, type: 'accept', tx: b64(inputs.tx), from: wireDescriptor(inputs.responder), nonce: b64(inputs.responderNonce), method: 'emoji' },
  reveal: { v: 1, type: 'reveal', tx: b64(inputs.tx), nonce: b64(inputs.initiatorNonce) },
  relayed: { relayedFrom: { deviceId: inputs.initiator.deviceId, registrationId: inputs.initiator.registrationId }, message: '<request ci-dessus>' },
});
const serialize = (inputs) => ({ tx: b64(inputs.tx), initiator: wireDescriptor(inputs.initiator), responder: wireDescriptor(inputs.responder), initiatorNonce: b64(inputs.initiatorNonce), responderNonce: b64(inputs.responderNonce) });

const nominal = [
  inputsOf('ios-nouveau-android-approuve', IPHONE, PIXEL),
  inputsOf('web-nouveau-ios-approuve', BROWSER, IPHONE),
  inputsOf('android-nouveau-web-approuve', PIXEL, BROWSER),
  inputsOf('ipad-sans-libelle-ios-approuve', IPAD, IPHONE),
];
const vectors = [];
for (const inputs of nominal) {
  const expected = await compute(inputs);
  vectors.push({ name: inputs.name, input: serialize(inputs), expected, wire: wireOf(inputs, expected) });
}
const V1 = vectors[0];
// Les 6 octets du code ne changent pas avec L = 8 (préfixe de la sortie HKDF) : codes de la v1 de la spec inchangés.
assert.deepEqual(vectors.map((v) => v.expected.sasBytesHex), ['9780485edff4', '9b244f18549f', '9dc4da3f0181', 'de830b801cdf']);
// Libellé omis : le descripteur se termine par LP("") = 00000000, et le champ est ABSENT du fil.
assert.ok(vectors[3].expected.initiatorDescriptorHex.endsWith('0000000369' + '6f73' + '00000000'));
assert.ok(!('label' in vectors[3].wire.request.from));

// ---------------------------------------------------------------- propriétés de la fonction (un champ change ⇒ le code change)

const properties = [];
{
  const base = nominal[0];
  const mutate = async (name, mutated, encode = deviceDescriptor) => {
    const expected = await compute({ ...mutated, name }, encode);
    assert.notEqual(expected.sasBytesHex, V1.expected.sasBytesHex, `${name}: le code devrait changer`);
    properties.push({ name, input: serialize(mutated), expected, mustDifferFrom: V1.name, outcome: 'codes-differents' });
  };
  await mutate('libelle-entre-dans-le-code', { ...base, initiator: { ...base.initiator, label: 'Support Meeshy' } });
  await mutate('inversion-des-roles', { ...base, initiator: base.responder, responder: base.initiator, initiatorNonce: base.responderNonce, responderNonce: base.initiatorNonce });
}

// ---------------------------------------------------------------- négatifs : homme du milieu, champs substitués, refus à la réception

const negatives = [];
{
  const base = nominal[0];
  const substituted = async (name, field, value, note) => {
    const attacked = { ...base, name, responder: { ...base.responder, [field]: value } };
    const expected = await compute(attacked);
    assert.notEqual(expected.sasBytesHex, V1.expected.sasBytesHex);
    negatives.push({ name, input: serialize(attacked), expected, mustDifferFrom: V1.name, outcome: 'codes-differents', ...(note ? { note } : {}) });
  };
  // N1 : clé du répondeur substituée (homme du milieu), mêmes aléas.
  await substituted('cle-du-repondeur-substituee', 'identityKey', PHANTOM.identityKey);
  // Un négatif PAR champ du descripteur (A.3) : le champ substitué dans le descripteur du répondeur que voit l'initiateur.
  await substituted('userId-du-repondeur-substitue', 'userId', OTHER_USER, 'à la réception, un from.userId qui n’est pas mon compte est refusé AVANT tout code (refus:unexpected-message) ; le vecteur prouve en plus que le userId entre dans le code');
  await substituted('deviceId-du-repondeur-substitue', 'deviceId', 6);
  await substituted('registrationId-du-repondeur-substitue', 'registrationId', 9055);
  await substituted('platform-du-repondeur-substituee', 'platform', 'ios');

  // N2-bis : libellé altéré DANS `request` par le relais ; le répondeur recalcule l'engagement sur ce qu'il a reçu.
  const altered = { ...base.initiator, label: 'Support Meeshy' };
  const recomputed = commitmentOf(base, deviceDescriptor(altered));
  assert.notEqual(b64(recomputed), V1.expected.commitment);
  negatives.push({
    name: 'libelle-altere-dans-request',
    input: { ...serialize(base), receivedInitiator: altered },
    expected: { commitment: V1.expected.commitment, recomputedFromReceivedRequest: b64(recomputed) },
    outcome: 'annuler:commitment-mismatch',
  });
  // N3 : révélation qui n'ouvre pas l'engagement.
  const forgedNonce = labelled('meeshy-sas-vector/forged-reveal', NONCE_BYTES);
  const opened = commitmentOf({ ...base, initiatorNonce: forgedNonce }, deviceDescriptor(base.initiator));
  assert.notEqual(b64(opened), V1.expected.commitment);
  negatives.push({ name: 'revelation-qui-n-ouvre-pas-l-engagement', input: { ...serialize(base), revealedNonce: b64(forgedNonce) }, expected: { commitment: V1.expected.commitment, recomputedFromReveal: b64(opened) }, outcome: 'annuler:commitment-mismatch' });
  // N4 : engagement rejoué sous un autre tx.
  const otherTx = labelled('meeshy-sas-vector/replayed-tx', TX_BYTES);
  const replayed = commitmentOf({ ...base, tx: otherTx }, deviceDescriptor(base.initiator));
  assert.notEqual(b64(replayed), V1.expected.commitment);
  negatives.push({ name: 'engagement-rejoue-sous-un-autre-tx', input: { ...serialize(base), replayedUnderTx: b64(otherTx) }, expected: { commitment: V1.expected.commitment, recomputedUnderReplayedTx: b64(replayed) }, outcome: 'annuler:commitment-mismatch' });

  // Refus à la réception (schéma strict, § 4.1 et § 4.8) : aucun code n'est calculé.
  const refused = (name, from, reason, note) => {
    assert.equal(descriptorProblem(from), reason, `${name}: refus attendu pour ${reason}`);
    negatives.push({ name, input: { from: wireDescriptor(from) }, expected: { refusedField: reason }, outcome: 'refus:unexpected-message', ...(note ? { note } : {}) });
  };
  refused('userId-majuscules-refuse', { ...base.initiator, userId: USER.toUpperCase() }, 'userId', 'ex-vecteur 5 : le userId voyage en minuscules ; aucune normalisation');
  refused('cle-de-34-octets-refusee', { ...base.initiator, identityKey: b64(Buffer.concat([Buffer.from(base.initiator.identityKey, 'base64'), Buffer.from([0])])) }, 'identityKey');
  refused('cle-de-type-inconnu-refusee', { ...base.initiator, identityKey: b64(Buffer.concat([Buffer.from([0x06]), Buffer.from(base.initiator.identityKey, 'base64').subarray(1)])) }, 'identityKey');
  refused('cle-en-base64-avec-blanc-refusee', { ...base.initiator, identityKey: `${base.initiator.identityKey.slice(0, 22)}\n${base.initiator.identityKey.slice(22)}` }, 'identityKey', 'une clé de 33 octets n’a pas de bits de remplissage : ses formes non canoniques sont un blanc, un saut de ligne ou l’alphabet « url » ; certains décodeurs les acceptent, le protocole les refuse');
  refused('libelle-a-demi-paire-refuse', { ...base.initiator, label: 'iPhone \ud83d' }, 'label', 'un emoji coupé à 64 unités UTF-16 : TextEncoder écrirait EF BF BD, Java 3F, Swift refuse ; le client tronque sur une frontière de graphème');
  refused('libelle-vide-refuse', { ...base.initiator, label: '' }, 'label', 'un libellé vide s’écrit en OMETTANT le champ');
  refused('libelle-non-nfc-refuse', { ...base.initiator, label: 'iPhone de Zoé' }, 'label');
  refused('plateforme-inconnue-refusee', { ...base.initiator, platform: 'unknown' }, 'platform', 'une génération de plateforme inconnue se réenrôle avant toute comparaison');
  // Aléa de 31 octets et base64 non canonique d'un aléa (bits de remplissage non nuls) : refus du message `accept` / `reveal`.
  const nonce31 = b64(labelled('meeshy-sas-vector/short-nonce', 31));
  assert.equal(canonicalBase64(nonce31, NONCE_BYTES), null);
  negatives.push({ name: 'alea-de-31-octets-refuse', input: { nonce: nonce31 }, expected: { refusedField: 'nonce' }, outcome: 'refus:unexpected-message' });
  const canonicalNonce = b64(base.responderNonce);
  const lastChar = canonicalNonce[42];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const sloppy = `${canonicalNonce.slice(0, 42)}${alphabet[alphabet.indexOf(lastChar) | 1]}=`;
  assert.notEqual(sloppy, canonicalNonce);
  assert.deepEqual(Buffer.from(sloppy, 'base64'), base.responderNonce, 'même octets décodés');
  assert.equal(canonicalBase64(sloppy, NONCE_BYTES), null);
  negatives.push({ name: 'alea-en-base64-non-canonique-refuse', input: { nonce: sloppy, decodesTo: canonicalNonce }, expected: { refusedField: 'nonce' }, outcome: 'refus:unexpected-message', note: 'mêmes octets décodés, bits de remplissage non nuls : réencoder et comparer' });
}

// ---------------------------------------------------------------- options en carré (répondeur) et accusés (initiateur)

/** Lit les octets d'un flux et rend le premier < bound (rejet : aucun biais de modulo). */
function drawBelow(stream, bound) {
  while (stream.offset < stream.bytes.length) {
    const b = stream.bytes[stream.offset];
    stream.offset += 1;
    if (b < bound) return b;
  }
  throw new Error('flux épuisé');
}
const PERMUTATIONS = (() => {
  const out = [];
  const walk = (prefix, rest) => (rest.length === 0 ? out.push(prefix) : rest.forEach((x, i) => walk([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)])));
  walk([], [0, 1, 2, 3]);
  return out;
})();
assert.equal(PERMUTATIONS.length, 24);
/**
 * Carré : deux « bits » portés par des positions disjointes ; option 0 = le vrai, 1 = bit 1 changé, 2 = bit 2 changé, 3 = les deux.
 * Pour chaque position (bit 1 puis bit 2, dans l'ordre croissant) : un octet b < 252, autre symbole = (s + 1 + b mod 63) mod 64.
 * Puis un octet b < 240 : permutation n° (b mod 24) des quatre options, dans l'ordre lexicographique.
 */
function squareOptions(symbols, bit1, bit2, streamBytes) {
  const stream = { bytes: streamBytes, offset: 0 };
  const alt = [...symbols];
  [...bit1, ...bit2].forEach((p) => { alt[p] = (symbols[p] + 1 + (drawBelow(stream, 252) % 63)) % 64; });
  const permutation = drawBelow(stream, 240) % 24;
  const variant = (flip1, flip2) => symbols.map((s, i) => ((flip1 && bit1.includes(i)) || (flip2 && bit2.includes(i)) ? alt[i] : s));
  const all = [variant(false, false), variant(true, false), variant(false, true), variant(true, true)];
  const order = PERMUTATIONS[permutation];
  return { alternatives: Object.fromEntries([...bit1, ...bit2].map((p) => [p, alt[p]])), permutation, order, displayed: order.map((k) => all[k]), correctAt: order.indexOf(0), bytesUsed: stream.offset };
}
const isolates = (values) => values.some((v, i) => values.filter((w) => w === v).length === 1);
function checkSquare(displayed, decimalsOf) {
  const keys = displayed.map((s) => s.join(','));
  assert.equal(new Set(keys).size, 4, 'options distinctes (emoji)');
  const decs = displayed.map(decimalsOf);
  assert.equal(new Set(decs.map((d) => d.join(','))).size, 4, 'options distinctes (chiffres)');
  for (let p = 0; p < displayed[0].length; p += 1) assert.ok(!isolates(displayed.map((s) => s[p])), `un symbole seul (position ${p}) départage`);
  for (let p = 0; p < decs[0].length; p += 1) assert.ok(!isolates(decs.map((d) => d[p])), `un nombre seul (${p}) départage`);
  return decs;
}
const optionVectors = [];
{
  const code = Buffer.from(V1.expected.sasBytesHex, 'hex');
  const tail = code[5] & 0x3f;
  const streamBytes = labelled('meeshy-sas-vector/options/code-stream', 32);
  const sq = squareOptions(V1.expected.emojiIndexes, [0, 1], [3, 5], streamBytes);
  const decs = checkSquare(sq.displayed, (s) => codeDecimals(codeFromSymbols(s, tail)));
  assert.deepEqual(sq.displayed[sq.correctAt], V1.expected.emojiIndexes);
  optionVectors.push({ name: 'carre-du-code-vecteur-1', of: V1.name, role: 'répondeur', bit1: [0, 1], bit2: [3, 5], streamHex: hex(streamBytes), expected: { ...sq, displayed: sq.displayed.map((s, i) => ({ ...render(s), decimal: decs[i] })) } });

  const ack = Buffer.from(V1.expected.ack.bytesHex, 'hex');
  const ackStream = labelled('meeshy-sas-vector/options/ack-stream', 32);
  const sqa = squareOptions(V1.expected.ack.emojiIndexes, [0], [1], ackStream);
  const ackDecOf = (s) => [ackDecimal(Buffer.from([(s[0] << 2) | (s[1] >> 4), ((s[1] & 0xf) << 4) | (ack[1] & 0xf)]))];
  const adecs = sqa.displayed.map(ackDecOf);
  assert.equal(new Set(sqa.displayed.map((s) => s.join(','))).size, 4);
  assert.equal(new Set(adecs.map((d) => d[0])).size, 4, 'accusés distincts (chiffres)');
  for (let p = 0; p < 2; p += 1) assert.ok(!isolates(sqa.displayed.map((s) => s[p])));
  assert.equal(adecs[sqa.correctAt][0], V1.expected.ack.decimal);
  optionVectors.push({ name: 'carre-de-l-accuse-vecteur-1', of: V1.name, role: 'initiateur', bit1: [0], bit2: [1], streamHex: hex(ackStream), expected: { ...sqa, displayed: sqa.displayed.map((s, i) => ({ ...render(s), decimal: adecs[i][0] })) } });
}
// ---------------------------------------------------------------- écriture

const licenseText = readFileSync(upstreamLicensePath, 'utf8');
assert.match(licenseText, /Apache License\s+Version 2\.0/, 'texte Apache-2.0 attendu');
mkdirSync(outDir, { recursive: true });
const MODIFIED = 'Dérivée de matrix-org/matrix-spec data-definitions/sas-emoji.json (SHA-256 2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887), Apache-2.0 ; modifiée par Meeshy le 2026-11-17 : clés renommées (number, emoji, unicode, names), sept langues retenues (fr, en, es, de, it, pt-BR, ar), métadonnées ajoutées (_doc, source, license). Texte de la licence : LICENSE-sas-emoji.txt.';
const sasFile = {
  _doc: 'Vérification d’un appareil par code court (spec 2026-11-17, v3, § 4 et § 8). Généré par packages/shared/scripts/generate-device-verification-vectors.mjs — oracle node:crypto, contre-vérifié par WebCrypto et par HKDF recomposé sur HMAC ; RFC 5869 A.1 et A.3 rejoués d’abord. Clés de TEST.',
  protocol: PROTOCOL,
  primitives: {
    commitment: 'C = SHA-256( LP(utf8("meeshy-device-verification:v1|commitment")) ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(nonce_I) )',
    transcript: 'T = LP(utf8("meeshy-device-verification:v1|transcript")) ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(enc(R)) ‖ LP(C)',
    hkdf: 'OKM = HKDF-SHA-256(IKM = nonce_I ‖ nonce_R, salt = 32 octets nuls (≡ sel vide), info = utf8("meeshy-device-verification:v1|sas") ‖ SHA-256(T), L = 8)',
    code: 'les 6 premiers octets de OKM (inchangés depuis la v1 de la spec : L = 8 ne change pas le préfixe)',
    ack: 'l’accusé : les octets 6 et 7 de OKM',
    descriptor: 'enc(X) = LP(ascii(userId en minuscules, tel que reçu)) ‖ u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey 33 o) ‖ LP(utf8(platform)) ‖ LP(utf8(label, ou "" si le champ est omis))',
    lp: 'LP(b) = u32 grand-boutien(longueur de b) ‖ b',
    emoji: 'code : 42 premiers bits, 7 groupes de 6 bits poids fort d’abord → sas-emoji-v1.json ; accusé : (A0 >> 2), ((A0 & 3) << 4 | A1 >> 4)',
    decimal: 'code : (B0<<5|B1>>3)+1000, ((B1&7)<<10|B2<<2|B3>>6)+1000, ((B3&63)<<7|B4>>1)+1000 ; accusé : (A0<<5|A1>>3)+1000',
    options: 'carré (§ 4.9) : bit 1 = positions {0,1} (code) ou {0} (accusé), bit 2 = {3,5} ou {1}. Ordre de lecture du flux d’octets du générateur sûr : pour chaque position du bit 1, puis du bit 2, par ordre croissant, le premier octet b < 252 (un octet ≥ 252 est sauté, et le suivant lu), autre symbole a_p = (s_p + 1 + b mod 63) mod 64 ; puis le premier octet b < 240, perm = permutation n° (b mod 24) de [0,1,2,3] dans l’ordre lexicographique. options[0] = le vrai, options[1] = bit 1 changé, options[2] = bit 2 changé, options[3] = les deux ; écran[i] = options[perm[i]] ; le vrai est en position perm.indexOf(0)',
    sizes: { txBytes: TX_BYTES, nonceBytes: NONCE_BYTES, commitmentBytes: 32, codeBytes: CODE_BYTES, ackBytes: ACK_BYTES, okmBytes: OKM_BYTES },
    base64: 'RFC 4648 § 4, avec remplissage, canonique (décodé puis réencodé, identique ; sinon refus)',
    label: 'scalaires Unicode bien formés, NFC, sans caractère de contrôle, 1 à 64 unités UTF-16 ; absent = champ omis ; "" refusé',
  },
  rfc5869: RFC5869,
  vectors,
  properties,
  negatives,
  options: optionVectors,
};
const emojiFile = {
  _doc: `Table des 64 emoji de la méthode SAS « emoji » de Matrix (m.sas.v1). ${MODIFIED}`,
  source: { repository: 'matrix-org/matrix-spec', path: 'data-definitions/sas-emoji.json', sha256: sourceSha256, license: 'Apache-2.0', fetchedOn: '2026-11-17', notice: 'aucun fichier NOTICE amont (relevé le 2026-11-17) ; à revérifier à chaque mise à jour' },
  modified: { by: 'Meeshy', on: '2026-11-17', changes: ['clés renommées (number, emoji, unicode, names)', 'sept langues retenues (fr, en, es, de, it, pt-BR, ar)', 'métadonnées ajoutées (_doc, source, modified, license)'] },
  license: { spdx: 'Apache-2.0', file: 'LICENSE-sas-emoji.txt' },
  emoji: table,
};
const files = {
  'sas-v1.vectors.json': `${JSON.stringify(sasFile, null, 2)}\n`,
  'sas-emoji-v1.json': `${JSON.stringify(emojiFile, null, 2)}\n`,
  'LICENSE-sas-emoji.txt': licenseText,
};
Object.entries(files).forEach(([name, text]) => writeFileSync(join(outDir, name), text));

const log = (line) => process.stdout.write(`${line}\n`);
log(`ok: RFC 5869 ×${RFC5869.length}, ${vectors.length} vecteurs, ${properties.length} propriétés, ${negatives.length} négatifs, ${optionVectors.length} carrés ; source emoji sha256=${sourceSha256}`);
vectors.forEach((v) => log(`${v.name}: code=${v.expected.sasBytesHex} ${v.expected.emoji.join('')} [${v.expected.emojiNames.fr.join(', ')}] ${v.expected.decimal.join(' ')} · accusé=${v.expected.ack.bytesHex} ${v.expected.ack.emoji.join('')} [${v.expected.ack.emojiNames.fr.join(', ')}] ${v.expected.ack.decimal}`));
properties.forEach((p) => log(`PROP ${p.name}: code=${p.expected.sasBytesHex} ${p.expected.emoji.join('')}`));
negatives.forEach((n) => log(`NEG ${n.name}: ${n.outcome}${n.expected.sasBytesHex ? ` code=${n.expected.sasBytesHex} ${n.expected.emoji.join('')}` : ''}`));
optionVectors.forEach((o) => log(`CARRE ${o.name}: juste en position ${o.expected.correctAt} ; ${o.expected.displayed.map((d) => `${d.emoji.join('')}(${Array.isArray(d.decimal) ? d.decimal.join(' ') : d.decimal})`).join(' | ')}`));

if (CHECK) {
  const drift = Object.entries(files).filter(([name, text]) => !existsSync(join(FIXTURES, name)) || readFileSync(join(FIXTURES, name), 'utf8') !== text).map(([name]) => name);
  if (drift.length > 0) {
    process.stderr.write(`les fichiers versés ne sont pas ceux que le script produit : ${drift.join(', ')}\n`);
    process.exit(1);
  }
  log('--check : les trois fichiers versés sont identiques à l’octet');
}
