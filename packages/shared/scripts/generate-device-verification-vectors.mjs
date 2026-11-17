/**
 * Vecteurs communs de la vérification d'appareil par code court (« meeshy-device-verification:v1 ») et du registre
 * de confiance de mes appareils (« meeshy-device-trust:v1 », entrées SIGNÉES XEdDSA par leur auteur) — spec 2026-11-17, v5.
 * La comparaison (sas-v1.vectors.json, sas-emoji-v1.json) et l'encodage signé n'ont pas changé depuis la v3 : seuls les cas du registre
 * (trust-ledger-v1.cases.json) suivent la v4 (réserve, copies de ma clé, ancres étrangères, JSON strict, forme des clés et des signatures) et la v5
 * (ordre total de la réserve ; vecteurs d'ÉMISSION et d'ADMISSION : ce qu'un appareil transmet, s'il est confirmé, s'il peut admettre).
 *
 *   node generate-device-verification-vectors.mjs [<sas-emoji.json amont> <dossier de sortie> <LICENSE amont>] [--previous <trust-ledger-v1.cases.json>]
 *
 * Sans argument, le script lit la table amont versée au dépôt (fixtures/e2ee-device-verification/upstream/) et écrit dans
 * fixtures/e2ee-device-verification/ ; `--check` régénère dans un dossier temporaire et compare à l'octet (CI).
 *
 * Comparaison : oracle node:crypto, contre-calculé par WebCrypto et par HKDF recomposé à la main sur HMAC-SHA-256 ;
 * RFC 5869 A.1 et A.3 rejoués d'abord par les trois chemins. Registre : chaque entrée est signée par la clé d'identité
 * de son auteur avec @signalapp/libsignal-client (XEdDSA, aléatoire) ; les signatures déjà publiées dans le fichier
 * précédent sont REPRISES quand elles se vérifient, pour que la régénération rende les mêmes octets. Le script vérifie
 * chaque signature et s'arrête au premier écart. Clés de TEST seulement (graines publiques, jamais réutilisées).
 *
 * Le script est découpé sous le budget de taille du dépôt : `device-verification-vectors/` porte la comparaison, l'encodage, le registre
 * et ses cas ; ce fichier rejoue les cas, fixe l'ordre total et les vecteurs de signature, et écrit les quatre fichiers.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { CHECK, FIXTURES, outDir, upstreamLicensePath } from './device-verification-vectors/cli.mjs';
import { OTHER_USER, USER, b64, hex, keyOfSeed } from './device-verification-vectors/bytes.mjs';
import { ACK_BYTES, CODE_BYTES, NONCE_BYTES, OKM_BYTES, PROTOCOL, RFC5869, TX_BYTES, negatives, optionVectors, properties, sourceSha256, table, vectors } from './device-verification-vectors/comparison.mjs';
import { COUNTED_TOMBSTONES_LIMIT, LABEL_APPROVAL, LABEL_INSCRIPTION, LABEL_REGIME_RESERVED, LABEL_REVOCATION, MAX_APPROVALS, MAX_REVOCATIONS, RESERVE_AUTHORS, RESERVE_PER_AUTHOR, authorOf, cmpApproval, cmpKey, cmpTomb, emissionOf, entryProblem, ingest, isTomb, permutationsOf, replay, signedBytes, slot, testKeys, verifySig } from './device-verification-vectors/ledger.mjs';
import { A, B, C, N, N_AS_6, Q, T0, appr, caseDefs, dev, malleate, self, signBytesV, sponsorship, tomb, twinOf, usedSignatures } from './device-verification-vectors/ledger-cases.mjs';

// ---------------------------------------------------------------- rejeu des cas : tous les ordres d'arrivée (au plus 6 contenus reçus), sinon
// 24 ordres tirés d'une graine FIXE plus l'ordre inverse et chaque rotation ; et chaque contenu en double. Puis les attendus écrits à la main.

const ids = (list) => list.map((g) => `${g.deviceId}:${g.registrationId}`);
const foreignIds = (list) => list.map((g) => `${g.deviceId}:${g.registrationId}${g.dead ? '!' : ''}`);
const stable = (r) => JSON.stringify({ e: r.effective, c: r.conflicts, s: r.revokedSelf, sp: r.sponsorsRevoked, fa: r.foreignAnchors, cg: r.cloneGenerations, p: r.proposed, st: r.stored, cl: r.cloneAlerts.length, ab: r.approvalsBlocked, rs: r.reserved });
/** Générateur pseudo-aléatoire déterministe (xorshift32) : les ordres échantillonnés ne changent jamais d'une exécution à l'autre. */
const seeded = (seed) => () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 2 ** 32; };
function ordersOf(received, name) {
  if (received.length <= 6) return permutationsOf(received);
  const rnd = seeded([...name].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261) || 1);
  const shuffled = Array.from({ length: 24 }, () => { const a = [...received]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  const rotations = received.map((_, k) => [...received.slice(k), ...received.slice(0, k)]);
  return [[...received].reverse(), ...rotations, ...shuffled];
}
/**
 * Statut des attendus d'ÉMISSION et d'ADMISSION (§ 6.4, § 4.8, « confirmé » du § 6.1, v5) : ils suivent un texte EN RELECTURE par
 * `auditeur-adversarial` (#19183). Ils sont versés pour que chaque banc puisse s'y préparer, jamais pour être livrés : le statut tombe
 * quand la relecture est portée, dans le même commit que ses constats.
 */
const EMISSION_STATUS = 'en revue';
const cases = caseDefs.map((def) => {
  const own = def.messages.filter((m) => m.from === 'self');
  const received = def.messages.filter((m) => m.from !== 'self');
  const result = replay(def.local, [...own, ...received]);
  for (const order of ordersOf(received, def.name)) assert.equal(stable(replay(def.local, [...own, ...order])), stable(result), `${def.name}: dépend de l’ordre d’arrivée`);
  assert.equal(stable(replay(def.local, [...own, ...received, ...received])), stable(result), `${def.name}: fusion non idempotente`);
  const x = def.expect;
  if (x.effective) assert.deepEqual(ids(result.effective), x.effective, `${def.name}: effectifs`);
  if (x.effectiveCount !== undefined) assert.equal(result.effective.length, x.effectiveCount, `${def.name}: nombre d’effectifs`);
  if (x.absent) x.absent.forEach((s) => assert.ok(!ids(result.effective).includes(s), `${def.name}: ${s} ne devrait pas être effectif`));
  assert.deepEqual(result.conflicts, x.conflicts ?? [], `${def.name}: conflits`);
  assert.equal(result.revokedSelf, x.revokedSelf ?? false, `${def.name}: revokedSelf`);
  assert.deepEqual(result.sponsorsRevoked, x.sponsorsRevoked ?? [], `${def.name}: parrains retirés`);
  assert.deepEqual(foreignIds(result.foreignAnchors), x.foreignAnchors ?? [], `${def.name}: ancres étrangères`);
  assert.deepEqual(result.cloneGenerations, x.cloneGenerations ?? [], `${def.name}: copies de ma clé`);
  assert.equal(result.proposed.length, x.proposed ?? 0, `${def.name}: proposées`);
  assert.equal(result.refusedContents, x.refusedContents ?? 0, `${def.name}: refusés`);
  assert.equal(result.overBound.length, x.overBound ?? 0, `${def.name}: au-delà des bornes`);
  assert.equal(result.cloneAlerts.length, x.cloneAlerts ?? 0, `${def.name}: alertes « clé copiée »`);
  assert.equal(result.approvalsBlocked, x.approvalsBlocked ?? false, `${def.name}: approbations bloquées`);
  assert.equal(result.reserved, x.reserved ?? 0, `${def.name}: réserve`);
  Object.entries(x.addedBy ?? {}).forEach(([s, by]) => assert.equal(result.effective.find((g) => slot(g) === s)?.addedBy, by, `${def.name}: ajouté par ${s}`));
  Object.entries(x.keyOf ?? {}).forEach(([s, k]) => assert.equal(result.effective.find((g) => slot(g) === s)?.identityKey, k));
  if (x.storedApproval) {
    const s = x.storedApproval;
    const found = result.stored.filter((e) => !isTomb(e) && slot(e) === s.of && slot(e.approvedBy) === s.by);
    assert.equal(found.length, 1); assert.equal(found[0].method, s.method); assert.equal(found[0].approvedAt, s.approvedAt);
  }
  Object.entries(x.storedApprovalsOf ?? {}).forEach(([s, n]) => assert.equal(result.stored.filter((e) => !isTomb(e) && slot(e) === s).length, n, `${def.name}: approbations rangées de ${s}`));
  let emission = null;
  if (def.emission) {
    const store = new Map();
    const log = { refusedContents: 0, overBound: [], cloneAlerts: new Map(), arrival: new Map() };
    [...own, ...received].forEach((m) => ingest(def.local, store, m, log));
    emission = emissionOf(def.local, store, def.emission);
    for (const order of ordersOf(received, def.name)) {
      const s2 = new Map(); const l2 = { refusedContents: 0, overBound: [], cloneAlerts: new Map(), arrival: new Map() };
      [...own, ...order].forEach((m) => ingest(def.local, s2, m, l2));
      assert.deepEqual(emissionOf(def.local, s2, def.emission), emission, `${def.name}: l’émission dépend de l’ordre d’arrivée`);
    }
    const xe = x.emission;
    assert.equal(emission.confirmed, xe.confirmed, `${def.name}: confirmé`);
    assert.equal(emission.mayAdmit, xe.mayAdmit, `${def.name}: peut admettre`);
    assert.deepEqual(emission.deadGenerations, xe.deadGenerations ?? [], `${def.name}: générations mortes`);
    const refs = (list) => list.map((r) => `${r.kind === 'revocation' ? 'T' : 'A'} ${r.subject} par ${r.author} #${r.seq}`);
    assert.deepEqual(refs(emission.transmits.changed), xe.changed, `${def.name}: transmises (changed)`);
    if (xe.verifiedAsJoiner) assert.deepEqual(refs(emission.transmits.verifiedAsJoiner), xe.verifiedAsJoiner, `${def.name}: ledger(verified) de celui qui rejoint`);
  }
  return {
    name: def.name,
    description: def.description,
    local: def.local,
    ...(def.emission ? { emissionInput: def.emission, emissionStatus: EMISSION_STATUS } : {}),
    messages: def.messages,
    expected: {
      effective: result.effective, conflicts: result.conflicts, revokedSelf: result.revokedSelf, sponsorsRevoked: result.sponsorsRevoked,
      foreignAnchors: result.foreignAnchors, cloneGenerations: result.cloneGenerations, proposed: result.proposed,
      refusedContents: result.refusedContents, overBound: result.overBound, cloneAlerts: result.cloneAlerts,
      approvalsBlocked: result.approvalsBlocked, reserved: result.reserved,
      ...(emission ? emission : {}),
    },
  };
});
// ---------------------------------------------------------------- ordre total de départage (§ 6.2) : listes mélangées, ordre attendu écrit à la main

const A_OTHER_KEY = dev('iphone-other-key', 1, 4211);
const orderPool = [
  appr(C, B, T0 + 30, 3, 2),                       // 0
  appr(C, A, T0 + 30, 4, 2),                       // 1
  appr(C, A, T0 + 30, 2, 2, 'qr'),                 // 2
  appr(C, A, T0 + 29, 9, 2),                       // 3
  appr(C, A, T0 + 30, 4, 3, 'reattested'),         // 4
  appr(C, A, T0 + 30, 4, undefined, 'migrated'),   // 5
  appr(C, A, T0 + 30, 4, 1),                       // 6
  appr(C, A_OTHER_KEY, T0 + 30, 1, 2),             // 7
  sponsorship(C, A, T0 + 30, 4, 2),                       // 8 : comme 1, avec sponsor
];
const otherFirst = cmpKey(A_OTHER_KEY.identityKey, A.identityKey) < 0;
const expectedApprovalOrder = otherFirst ? [3, 7, 5, 2, 4, 6, 1, 8, 0] : [3, 5, 2, 4, 6, 1, 8, 7, 0];
const sortedIdx = [...orderPool.keys()].sort((i, j) => cmpApproval(orderPool[i], orderPool[j]));
assert.deepEqual(sortedIdx, expectedApprovalOrder, 'ordre total des approbations');
const tombPool = [
  tomb(N, B, T0 + 5, 3),        // 0
  tomb(N, A, T0 + 5, 9),        // 1
  tomb(N, A, T0 + 4, 9),        // 2
  tomb(N, A, T0 + 5, 2),        // 3
  tomb(N_AS_6, A, T0 + 5, 2),   // 4 : même clé, même auteur, même revokedAt, même seq que 3 ; génération affichée 6:77 (deviceId 6 > 4)
];
const tombSorted = [...tombPool.keys()].sort((i, j) => cmpTomb(tombPool[i], tombPool[j]));
assert.deepEqual(tombSorted, [2, 3, 4, 1, 0], 'ordre total des pierres tombales');
const shuffledOrder = [6, 0, 8, 4, 7, 2, 5, 1, 3];
const totalOrder = {
  approvals: shuffledOrder.map((i) => orderPool[i]),
  expectedSorted: sortedIdx.map((i) => orderPool[i]),
  revocations: [1, 4, 3, 0, 2].map((i) => tombPool[i]),
  expectedSortedRevocations: tombSorted.map((i) => tombPool[i]),
};

// ---------------------------------------------------------------- vecteurs de signature (§ 6.1) : octets signés et signatures FIXES

const signatureVector = (name, kind, entry) => {
  const bytes = signedBytes(USER, entry);
  assert.ok(verifySig(authorOf(entry).identityKey, bytes, entry.sig), `${name}: la signature publiée doit se vérifier`);
  return { name, kind, entry, signer: authorOf(entry).identityKey, signedHex: hex(bytes), sig: entry.sig, expected: 'valide' };
};
const positives = [
  signatureVector('inscription', 'inscription', self(A, T0)),
  signatureVector('approbation-sas', 'approval', appr(B, A, T0 + 10, 2, 2)),
  signatureVector('approbation-de-parrainage', 'approval', sponsorship(A, B, T0 + 9, 2, 2)),
  signatureVector('approbation-qr', 'approval', appr(N, A, T0 + 30, 3, 2, 'qr')),
  signatureVector('approbation-migree', 'approval', appr(C, A, T0 + 20, 4, undefined, 'migrated')),
  signatureVector('approbation-maintenue', 'approval', appr(Q, A, T0 + 40, 5, 3, 'reattested')),
  signatureVector('pierre-tombale', 'revocation', tomb(C, A, T0 + 50, 6)),
];
// v4 (recommandée de la revue) : un positif signé par une clé dont le point d'Edwards a le bit de signe 1 (ipad) — XEdDSA de libsignal porte
// ce bit dans le bit 255 de la signature ; un vérificateur « XEdDSA de la spécification Signal » (signe forcé à 0) le refuserait.
const positivesV4 = [
  signatureVector('approbation-de-parrainage-cle-a-bit-de-signe-1', 'approval', sponsorship(A, N, T0 + 19, 2, 3)),
];
assert.equal(Buffer.from(positivesV4[0].sig, 'base64')[63] >> 7, 1, 'le positif v4 doit porter le bit de signe 1');
const base = positives[1].entry;
const baseBytes = signedBytes(USER, base);
const negativeVector = (name, { entry = base, verifyWith = authorOf(entry).identityKey, sig, expected = 'invalide', formProblem = 'sig', note }) => {
  const bytes = signedBytes(USER, entry);
  if (expected === 'invalide') assert.equal(verifySig(verifyWith, bytes, sig), false, `${name}: doit être invalide`);
  else assert.equal(entryProblem({ ...entry, sig }), formProblem, `${name}: doit être refusé par la forme`);
  return { name, entry, verifyWith, signedHex: hex(bytes), sig, expected, ...(note ? { note } : {}) };
};
const flipped = Buffer.from(base.sig, 'base64');
flipped[10] ^= 0x01;
const lastSigChar = base.sig[base.sig.length - 3];
const SIG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const sloppySig = `${base.sig.slice(0, -3)}${SIG_ALPHABET[SIG_ALPHABET.indexOf(lastSigChar) ^ 1]}==`;
assert.deepEqual(Buffer.from(sloppySig, 'base64'), Buffer.from(base.sig, 'base64'), 'mêmes octets décodés');
const negatives64 = [
  negativeVector('cle-d-un-autre-appareil', { verifyWith: B.identityKey, sig: base.sig, note: 'la signature de A vérifiée sous la clé de B' }),
  negativeVector('octet-signe-modifie', { entry: { ...base, seq: 3 }, sig: base.sig, note: 'seq 2 → 3 : les octets signés changent' }),
  negativeVector('parrainage-ajoute', { entry: { ...base, sponsor: true }, sig: base.sig, note: 'le drapeau sponsor est couvert par la signature' }),
  negativeVector('fromSeq-abaisse', { entry: { ...base, fromSeq: 1 }, sig: base.sig, note: 'le rang d’admission est couvert par la signature' }),
  negativeVector('autre-domaine', { sig: signBytesV(A.identityKey, signedBytes(USER, base, LABEL_REVOCATION)), note: 'A a signé les mêmes champs sous l’étiquette « meeshy-device-trust:v1|revocation »' }),
  negativeVector('autre-compte', { sig: signBytesV(A.identityKey, signedBytes(OTHER_USER, base)), note: `A a signé les mêmes champs pour le compte ${OTHER_USER}` }),
  negativeVector('octet-de-signature-retourne', { sig: b64(flipped) }),
  negativeVector('signature-de-63-octets', { sig: b64(Buffer.from(base.sig, 'base64').subarray(0, 63)), expected: 'refus-forme' }),
  negativeVector('signature-en-base64-non-canonique', { sig: sloppySig, expected: 'refus-forme', note: 'mêmes octets décodés, bits de remplissage non nuls : réencoder et comparer' }),
];
// v4 : négatifs ajoutés (les neuf de la v3 ci-dessus sont inchangés à l'octet).
const twinA = twinOf(A);
const twinEntry = { ...base, approvedBy: twinA };
const twinSig = signBytesV(A.identityKey, signedBytes(USER, twinEntry));
assert.ok(verifySig(twinA.identityKey, signedBytes(USER, twinEntry), twinSig), 'libsignal vérifie sous la jumelle (mesuré par la revue)');
const negativesV4 = [
  negativeVector('userId-en-majuscules', { sig: signBytesV(A.identityKey, signedBytes(USER.toUpperCase(), base)), note: `A a signé avec le compte écrit en majuscules (${USER.toUpperCase()}) : le compte voyage en minuscules et n’est jamais normalisé` }),
  negativeVector('signature-malleable-s-plus-L', { sig: malleate(base).sig, expected: 'refus-forme', note: '(R, s + L), bit de signe gardé : libsignal la vérifie, la forme exige s < L (bit 255 effacé)' }),
  negativeVector('auteur-a-cle-jumelle', { entry: twinEntry, verifyWith: twinA.identityKey, sig: twinSig, expected: 'refus-forme', formProblem: 'generation', note: 'la jumelle de la clé de A (bit 0x80 de l’octet 32) : libsignal y vérifie la signature de A, la forme la refuse (#19168)' }),
];
assert.ok(verifySig(A.identityKey, baseBytes, base.sig));
const testKeyList = ['iphone', 'pixel', 'browser', 'ipad', 'phantom'].map((name) => {
  const identityKey = keyOfSeed(name);
  const { priv } = testKeys.get(identityKey);
  return { name, seedLabel: `meeshy-sas-vector/${name}/identity`, identityKey, privateKeyHex: hex(priv.serialize()) };
});
const signatureVectors = { positives: [...positives, ...positivesV4], negatives: [...negatives64, ...negativesV4] };
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
const ledgerFile = {
  _doc: 'Registre de confiance de mes appareils (spec 2026-11-17, v5, § 6). Chaque entrée est SIGNÉE (XEdDSA, libsignal) par la clé d’identité de son auteur ; une entrée compte sans égard à qui l’a relayée. État effectif calculé depuis soi ; ancres = moi et, de proche en proche, les sujets des approbations « sponsor » des ancres (F = 0) ; ailleurs F(x) = plus petit fromSeq des approbations de x qui comptent ; pierre tombale par CLÉ, comptée si son auteur est moi ou admis à un rang ≥ F_admis. v4 : une COPIE (ma clé sous une autre place) n’est jamais effective ; une entrée d’un auteur non admis va en RÉSERVE (sans effet, bornée) ; une ancre ÉTRANGÈRE (qu’une autre de mes ancres vivantes n’admet pas) est signalée ; un message `raw` est le clair tel qu’il arrive, à analyser en JSON STRICT. v5 : dans un contenu, « reçue le plus tôt » (éviction de la réserve) suit l’ordre total ; les cas `emission-*`, `X1-*`, `X2-*`, `X4-*` portent aussi ce que l’appareil TRANSMET et s’il peut ADMETTRE (`expectedFields.emission`), attendus marqués « en revue » (`emissionStatus`). Attendus écrits à la main ; chaque cas est rejoué dans tous les ordres d’arrivée (au-delà de 6 contenus reçus : l’ordre inverse, chaque rotation et 24 ordres d’une graine fixe) et en double. Les signatures sont FIXES : XEdDSA est aléatoire, le script reprend celles de ce fichier quand elles se vérifient.',
  signing: {
    algorithm: 'XEdDSA (libsignal PrivateKey.sign / PublicKey.verify ; iOS generateSignature / verifySignature ; Android calculateSignature / verifySignature ; web signWithIdentity / verifyWithIdentity), clé d’identité de l’AUTEUR (33 octets, 0x05), signature de 64 octets en base64 canonique dans `sig`',
    inscription: 'LP(utf8("meeshy-device-trust:v1|inscription")) ‖ LP(ascii(userId)) ‖ gen(moi) ‖ u64(approvedAt) ‖ u64(seq = 1)',
    approval: 'LP(utf8("meeshy-device-trust:v1|approval")) ‖ LP(ascii(userId)) ‖ gen(sujet) ‖ gen(auteur) ‖ u64(approvedAt) ‖ LP(utf8(method)) ‖ u64(seq) ‖ u64(fromSeq, 0 si absent) ‖ u8(sponsor ? 1 : 0)',
    revocation: 'LP(utf8("meeshy-device-trust:v1|revocation")) ‖ LP(ascii(userId)) ‖ gen(clé retirée) ‖ gen(auteur) ‖ u64(revokedAt) ‖ u64(seq)',
    gen: 'gen(g) = u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey, 33 octets) ; u32 et u64 grand-boutiens ; LP(b) = u32(longueur) ‖ b',
    userId: 'le compte qui VÉRIFIE (24 caractères hexadécimaux minuscules) : une entrée d’un autre compte ne se vérifie pas',
    unknownFields: 'un champ inconnu est ignoré et n’entre pas dans les octets signés ; un champ SIGNÉ ne s’ajoute qu’avec une nouvelle étiquette ET un `d` supérieur (un appareil n’envoie à un pair que la version de `d` qu’il a déclarée ; un contenu d’une version inconnue n’accuse personne)',
    domains: {
      _doc: 'registre des domaines signés par la clé d’identité d’un appareil (§ 6.1) : chaque domaine a un premier octet ou une étiquette qui le distingue de tous les autres ; un nouveau domaine s’ajoute ici avant toute signature',
      'meeshy-e2ee-device-binding:v1': 'preuve de liaison d’enrôlement (utf8, premier octet 0x6d) — packages/shared/types/e2ee-directory.ts',
      'pré-clé signée': 'libsignal : 0x05 ‖ 32 octets (premier octet 0x05)',
      'pré-clé Kyber': 'libsignal : 0x08 ‖ 1 568 octets (premier octet 0x08)',
      [LABEL_INSCRIPTION]: 'registre, inscription (premier octet 0x00 : u32 de longueur)',
      [LABEL_APPROVAL]: 'registre, approbation',
      [LABEL_REVOCATION]: 'registre, pierre tombale',
      [LABEL_REGIME_RESERVED]: 'RÉSERVÉE : signature future des entrées de la mémoire du régime ; rien n’est signé sous elle en v1',
    },
  },
  form: {
    identityKey: '33 octets, 0x05 en tête, base64 canonique, bit 0x80 de l’octet 32 NUL (pas de clé « jumelle », #19168)',
    sig: '64 octets en base64 canonique ; s = octets 32 à 63 en petit-boutien, bit 255 (bit de signe XEdDSA) effacé, doit être < L = 2^252 + 27742317777372353535851937790883648493',
    json: 'le clair `d` est analysé en JSON STRICT, à tout niveau : null, clé en double (après décodage des échappements), nombre écrit autrement que 0 ou un chiffre non nul suivi de chiffres (point, exposant, signe) ⇒ refus de forme du contenu entier',
  },
  entryIdentity: { approval: '(deviceId, registrationId, identityKey, approvedBy.deviceId, approvedBy.registrationId, approvedBy.identityKey)', revocation: '(identityKey, revokedBy.deviceId, revokedBy.registrationId, revokedBy.identityKey)' },
  reserve: { authors: RESERVE_AUTHORS, entriesPerAuthor: RESERVE_PER_AUTHOR, eviction: 'une entrée dont l’auteur n’est pas ADMIS (membres sans les pierres tombales) n’a aucun effet ; elle va en réserve : au plus 16 auteurs et 32 entrées par auteur ; au-delà, la première reçue est évincée (l’auteur entier dont la première entrée reçue est la plus ancienne, quand un 17e arrive) ; elle quitte la réserve quand son auteur devient admis. « Reçue le plus tôt » est un ordre TOTAL : les contenus dans l’ordre où ils sont ouverts, et dans un contenu ses approbations gardées puis ses pierres tombales, chacune selon l’ordre total (v5)', countedTombstonesLimit: COUNTED_TOMBSTONES_LIMIT },
  expectedFields: {
    foreignAnchors: 'mes ancres (vivantes ou mortes, `dead`) qu’une AUTRE de mes ancres vivantes n’admet pas : l’appareil n’admet personne ; vivante, il alerte « s’est d’abord confirmé avec n° … » ; morte, il se réinitialise',
    cloneGenerations: 'places qui portent MA clé sous une autre place que la mienne et qu’une approbation qui compterait vise : jamais effectives, alerte « clé copiée »',
    approvalsBlocked: 'plus de 256 pierres tombales COMPTÉES : l’appareil refuse d’ajouter une approbation',
    reserved: 'nombre d’entrées en réserve (auteurs non admis) après le rejeu',
    rawMessages: 'un message `{ "raw": "…" }` est le clair reçu, à analyser avec l’analyseur JSON strict avant tout',
    emissionStatus: '« en revue » : `confirmed`, `mayAdmit` et `transmits` suivent le texte v5 du § 6.4, du § 4.8 et du § 6.1 (« confirmé »), en relecture adversariale (#19183) ; une plateforme ne les livre pas tant que le statut ne tombe pas. `deadGenerations` est une projection de l’état du § 6.2 (les générations nommées dans mon registre dont la clé est morte), que la référence d’évaluation rejoue ; ce qu’en fait le § 4.6 (aucune comparaison avec elles) est en revue avec le reste',
    emission: 'v5 (§ 6.4, § 4.8) — seulement dans les cas qui portent `emissionInput` : `confirmed` (chacune de mes ancres vivantes autres que moi m’admet, sur mon registre), `mayAdmit` (membre ∧ confirmé ∧ aucune ancre étrangère ∧ non retiré ∧ approbations non bloquées), `deadGenerations` (générations nommées dans mon registre dont la clé est morte : aucune comparaison avec elles), `transmits.changed` (ce que l’appareil transmet : hors quarantaine, les entrées retenues ; en quarantaine, ses entrées et les pierres tombales retenues dont l’auteur est vivant ; jamais la réserve) et, si `emissionInput.joinerHead` est donné, `transmits.verifiedAsJoiner` (ses entrées de rang ≤ joinerHead : le ledger(verified) de celui qui rejoint). Chaque entrée y est désignée par { kind, subject, author, seq }, dans l’ordre total',
  },
  bounds: { deviceId: '1…127', registrationId: '1…16383', approvedAt: '0…2^53−1 (entier)', revokedAt: '0…2^53−1 (entier)', seq: '1…2^53−1 (entier ; 1 pour l’inscription)', fromSeq: '1…2^53−1 (entier ; obligatoire pour sas, qr, reattested ; interdit pour self, migrated)', sponsor: 'true seulement, et seulement pour sas ou qr ; absent sinon', sig: '64 octets, base64 canonique', approvalsPerContent: MAX_APPROVALS, revocationsPerContent: MAX_REVOCATIONS, receiving: 'au-delà de 32 approbations dans un contenu, les plus petites selon l’ordre total sont gardées AVANT toute vérification, les autres ignorées ; toutes les pierres tombales sont vérifiées et appliquées' },
  account: USER,
  testKeys: { _doc: 'clés de TEST : graine = SHA-256(seedLabel), libsignal la clampe ; privateKeyHex est la forme clampée que rend PrivateKey.serialize(). Jamais réutilisées ailleurs.', keys: testKeyList },
  signatures: signatureVectors,
  totalOrder,
  cases,
  signatureIndex: { _doc: 'toutes les signatures de ce fichier, par signataire, SHA-256 des octets signés et variante (0, puis 1 pour une seconde signature des mêmes octets) : le script les reprend quand elles se vérifient, pour régénérer les mêmes octets ; une plateforme peut y contrôler son encodage', entries: usedSignatures.map(({ signer, signedSha256, variant, sig }) => ({ signer, signedSha256, variant, sig })).sort((a, b) => (a.signer < b.signer ? -1 : a.signer > b.signer ? 1 : a.signedSha256 < b.signedSha256 ? -1 : a.signedSha256 > b.signedSha256 ? 1 : a.variant - b.variant)) },
};
const files = {
  'sas-v1.vectors.json': `${JSON.stringify(sasFile, null, 2)}\n`,
  'sas-emoji-v1.json': `${JSON.stringify(emojiFile, null, 2)}\n`,
  'trust-ledger-v1.cases.json': `${JSON.stringify(ledgerFile, null, 2)}\n`,
  'LICENSE-sas-emoji.txt': licenseText,
};
Object.entries(files).forEach(([name, text]) => writeFileSync(join(outDir, name), text));

const log = (line) => process.stdout.write(`${line}\n`);
log(`ok: RFC 5869 ×${RFC5869.length}, ${vectors.length} vecteurs, ${properties.length} propriétés, ${negatives.length} négatifs, ${optionVectors.length} carrés, ${cases.length} cas de registre, ${signatureVectors.positives.length}+${signatureVectors.negatives.length} vecteurs de signature, ${usedSignatures.length} signatures ; source emoji sha256=${sourceSha256}`);
vectors.forEach((v) => log(`${v.name}: code=${v.expected.sasBytesHex} ${v.expected.emoji.join('')} [${v.expected.emojiNames.fr.join(', ')}] ${v.expected.decimal.join(' ')} · accusé=${v.expected.ack.bytesHex} ${v.expected.ack.emoji.join('')} [${v.expected.ack.emojiNames.fr.join(', ')}] ${v.expected.ack.decimal}`));
properties.forEach((p) => log(`PROP ${p.name}: code=${p.expected.sasBytesHex} ${p.expected.emoji.join('')}`));
negatives.forEach((n) => log(`NEG ${n.name}: ${n.outcome}${n.expected.sasBytesHex ? ` code=${n.expected.sasBytesHex} ${n.expected.emoji.join('')}` : ''}`));
optionVectors.forEach((o) => log(`CARRE ${o.name}: juste en position ${o.expected.correctAt} ; ${o.expected.displayed.map((d) => `${d.emoji.join('')}(${Array.isArray(d.decimal) ? d.decimal.join(' ') : d.decimal})`).join(' | ')}`));
signatureVectors.positives.forEach((s) => log(`SIG+ ${s.name}: ${s.signedHex.length / 2} octets signés, sig ${s.sig.slice(0, 12)}…`));
signatureVectors.negatives.forEach((s) => log(`SIG- ${s.name}: ${s.expected}`));
cases.forEach((c) => log(`CAS ${c.name}: effectifs=[${ids(c.expected.effective).join(', ')}]${c.expected.conflicts.length ? ` conflits=${c.expected.conflicts}` : ''}${c.expected.revokedSelf ? ' RETIRÉ' : ''}${c.expected.sponsorsRevoked.length ? ` parrains-retirés=${c.expected.sponsorsRevoked}` : ''}${c.expected.foreignAnchors.length ? ` ancres-étrangères=${foreignIds(c.expected.foreignAnchors)}` : ''}${c.expected.cloneGenerations.length ? ` copies=${c.expected.cloneGenerations}` : ''}${c.expected.approvalsBlocked ? ' BLOQUÉ' : ''} proposées=${c.expected.proposed.length} refusés=${c.expected.refusedContents} hors-borne=${c.expected.overBound.length} clé-copiée=${c.expected.cloneAlerts.length} réserve=${c.expected.reserved}`));

if (CHECK) {
  const drift = Object.entries(files).filter(([name, text]) => !existsSync(join(FIXTURES, name)) || readFileSync(join(FIXTURES, name), 'utf8') !== text).map(([name]) => name);
  if (drift.length > 0) {
    process.stderr.write(`les fichiers versés ne sont pas ceux que le script produit : ${drift.join(', ')}\n`);
    process.exit(1);
  }
  log('--check : les quatre fichiers versés sont identiques à l’octet');
}
