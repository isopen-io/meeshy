/**
 * Le registre de confiance de mes appareils (spec 2026-11-17, § 6) vu par le GÉNÉRATEUR : octets signés (§ 6.1), forme, JSON strict, ordre
 * total, réception en six temps et état effectif (§ 6.2), et la fonction d'ÉMISSION (§ 6.4, v5, EN REVUE). Signatures par
 * @signalapp/libsignal-client avec les clés de TEST.
 */
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { MAX_SAFE, b64, canonicalBase64, hex, keyOfSeed, labelled, lp, u32, utf8 } from './bytes.mjs';

export const libsignal = await import(process.env.MEESHY_LIBSIGNAL_CLIENT ? pathToFileURL(process.env.MEESHY_LIBSIGNAL_CLIENT).href : '@signalapp/libsignal-client');

// ---------------------------------------------------------------- registre de confiance (§ 6, v4) : entrées SIGNÉES par leur auteur

export const TRUST = 'meeshy-device-trust:v1';
export const LABEL_INSCRIPTION = `${TRUST}|inscription`;
export const LABEL_APPROVAL = `${TRUST}|approval`;
export const LABEL_REVOCATION = `${TRUST}|revocation`;
/** Réservée (registre des domaines, § 6.1) : aucun octet n'est signé sous elle en v1 ; elle servira à signer les entrées de `regime`. */
export const LABEL_REGIME_RESERVED = `${TRUST}|regime`;
export const METHODS = new Set(['self', 'sas', 'qr', 'migrated', 'reattested']);
export const WITH_FROM_SEQ = new Set(['sas', 'qr', 'reattested']);
export const WITH_SPONSOR = new Set(['sas', 'qr']);
export const MAX_APPROVALS = 32;
export const MAX_REVOCATIONS = 32;
export const SIG_BYTES = 64;
/** Réserve des entrées d'auteurs NON admis (§ 6.2, v4) : sans effet sur l'état, bornée, la première reçue évincée d'abord. */
export const RESERVE_AUTHORS = 16;
export const RESERVE_PER_AUTHOR = 32;
/** Au-delà de 256 pierres tombales COMPTÉES, l'appareil refuse d'ajouter une approbation (§ 6.2, v4). */
export const COUNTED_TOMBSTONES_LIMIT = 256;
/** Ordre du groupe d'Ed25519 : une signature dont le scalaire s (bit 255 effacé) n'est pas < L est refusée par la forme (§ 6.2, #19168). */
export const ED25519_L = 2n ** 252n + 27742317777372353535851937790883648493n;

export const genOf = (d) => ({ deviceId: d.deviceId, registrationId: d.registrationId, identityKey: d.identityKey });
export const gid = (g) => `${g.deviceId}:${g.registrationId}:${g.identityKey}`;
export const slot = (g) => `${g.deviceId}:${g.registrationId}`;
export const isTomb = (e) => 'revokedBy' in e;
export const authorOf = (e) => (isTomb(e) ? e.revokedBy : e.approvedBy);
export const entryId = (e) => (isTomb(e) ? `T|${e.identityKey}|${gid(e.revokedBy)}` : `A|${gid(e)}|${gid(e.approvedBy)}`);
export const KNOWN = {
  approval: ['deviceId', 'registrationId', 'identityKey', 'approvedBy', 'approvedAt', 'method', 'seq', 'fromSeq', 'sponsor', 'sig'],
  tomb: ['deviceId', 'registrationId', 'identityKey', 'revokedBy', 'revokedAt', 'seq', 'sig'],
};
/** Un champ inconnu est ignoré, jamais refusé (§ 6.3) ; il n'entre pas dans les octets signés. Un champ SIGNÉ ne s'ajoute qu'avec une nouvelle étiquette ET un `d` supérieur. */
export const strip = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => (isTomb(e) ? KNOWN.tomb : KNOWN.approval).includes(k)));

export const u64 = (value) => {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= MAX_SAFE, `u64 hors bornes: ${value}`);
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
};
export const genBytes = (g) => Buffer.concat([u32(g.deviceId), u32(g.registrationId), lp(Buffer.from(g.identityKey, 'base64'))]);
export const accountBytes = (userId) => lp(Buffer.from(userId, 'ascii'));

/**
 * Les octets que l'auteur signe (§ 6.1, INCHANGÉS depuis la v3) — encodage binaire à longueurs préfixées, comme le descripteur du § 4.1 :
 *   inscription : LP(utf8(label)) ‖ LP(ascii(userId)) ‖ gen(moi) ‖ u64(approvedAt) ‖ u64(seq)
 *   approbation : LP(utf8(label)) ‖ LP(ascii(userId)) ‖ gen(sujet) ‖ gen(auteur) ‖ u64(approvedAt) ‖ LP(utf8(method)) ‖ u64(seq) ‖ u64(fromSeq ou 0) ‖ u8(sponsor ? 1 : 0)
 *   pierre tombale : LP(utf8(label)) ‖ LP(ascii(userId)) ‖ gen(clé retirée) ‖ gen(auteur) ‖ u64(revokedAt) ‖ u64(seq)
 * gen(g) = u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey, 33 octets) ; u64 grand-boutien ; le userId est celui du compte qui vérifie.
 */
export function signedBytes(userId, e, label) {
  if (isTomb(e)) return Buffer.concat([lp(utf8(label ?? LABEL_REVOCATION)), accountBytes(userId), genBytes(e), genBytes(e.revokedBy), u64(e.revokedAt), u64(e.seq)]);
  if (e.method === 'self') return Buffer.concat([lp(utf8(label ?? LABEL_INSCRIPTION)), accountBytes(userId), genBytes(e), u64(e.approvedAt), u64(e.seq)]);
  return Buffer.concat([lp(utf8(label ?? LABEL_APPROVAL)), accountBytes(userId), genBytes(e), genBytes(e.approvedBy), u64(e.approvedAt), lp(utf8(e.method)), u64(e.seq), u64(e.fromSeq ?? 0), Buffer.from([e.sponsor === true ? 1 : 0])]);
}

// Clés privées de TEST : graine = SHA-256(« meeshy-sas-vector/<nom>/identity »), libsignal la clampe.
export const testKeys = new Map();
export function testKey(name) {
  const identityKey = keyOfSeed(name);
  if (!testKeys.has(identityKey)) {
    const priv = libsignal.PrivateKey.deserialize(labelled(`meeshy-sas-vector/${name}/identity`, 32));
    assert.equal(b64(priv.getPublicKey().serialize()), identityKey, `clé de test ${name} : libsignal et node:crypto divergent`);
    testKeys.set(identityKey, { name, priv });
  }
  return identityKey;
}

/** Forme d'une clé d'identité (§ 4.8, § 6.2, #19168) : 33 octets, 0x05 en tête, base64 canonique, bit 0x80 de l'octet 32 nul (pas de « jumelle »). */
export const identityKeyOk = (text) => { const k = canonicalBase64(text, 33); return k !== null && k[0] === 0x05 && (k[32] & 0x80) === 0; };
/** Forme d'une signature (§ 6.2) : 64 octets en base64 canonique ; s (octets 32 à 63, petit-boutien, bit 255 — le bit de signe de XEdDSA — effacé) < L. */
export function signatureOk(text) {
  const sig = canonicalBase64(text, SIG_BYTES);
  if (sig === null) return false;
  const s = Buffer.from(sig.subarray(32));
  s[31] &= 0x7f;
  return BigInt(`0x${Buffer.from(s).reverse().toString('hex')}`) < ED25519_L;
}

export const verifyMemo = new Map();
/** Vérifie `sigB64` (forme du § 6.2) sur `bytes` sous la clé d'identité publique `identityKey` (33 octets). */
export function verifySig(identityKey, bytes, sigB64) {
  const memoKey = `${identityKey}|${hex(bytes)}|${sigB64}`;
  if (!verifyMemo.has(memoKey)) {
    const sig = canonicalBase64(sigB64, SIG_BYTES);
    verifyMemo.set(memoKey, sig !== null && libsignal.PublicKey.deserialize(Buffer.from(identityKey, 'base64')).verify(bytes, sig));
  }
  return verifyMemo.get(memoKey);
}

export const safeInt = (v, min) => Number.isInteger(v) && v >= min && v <= MAX_SAFE;
export const genOk = (g) => g && Number.isInteger(g.deviceId) && g.deviceId >= 1 && g.deviceId <= 127 && Number.isInteger(g.registrationId) && g.registrationId >= 1 && g.registrationId <= 16383 && identityKeyOk(g.identityKey);
/** Forme (§ 6.2, temps 1) : une seule entrée hors forme fait refuser le contenu entier, AVANT toute vérification de signature. */
export function entryProblem(e) {
  if (!genOk(e) || !genOk(authorOf(e))) return 'generation';
  if (!safeInt(e.seq, 1)) return 'seq';
  if (!signatureOk(e.sig)) return 'sig';
  if (isTomb(e)) return safeInt(e.revokedAt, 0) ? null : 'revokedAt';
  if (!safeInt(e.approvedAt, 0)) return 'approvedAt';
  if (!METHODS.has(e.method)) return 'method';
  if ((e.method === 'self') !== (gid(e) === gid(e.approvedBy))) return 'self';
  if (e.method === 'self' && e.seq !== 1) return 'self-seq';
  if (WITH_FROM_SEQ.has(e.method) !== (e.fromSeq !== undefined)) return 'fromSeq';
  if (e.fromSeq !== undefined && !safeInt(e.fromSeq, 1)) return 'fromSeq';
  if (e.sponsor !== undefined && (e.sponsor !== true || !WITH_SPONSOR.has(e.method))) return 'sponsor';
  return null;
}

/**
 * JSON STRICT du clair `d` (§ 6.3, v4) : à tout niveau, `null`, une clé en double (comparée après décodage des échappements) ou un nombre
 * écrit autrement que `0` ou un chiffre non nul suivi de chiffres (point, exposant, signe) font refuser le contenu entier. Sans cela, un
 * relais pouvait AJOUTER `"fromSeq": null` (les octets signés n'en changent pas) : un décodeur le refusait, un autre le lisait « absent ».
 */
export function strictJsonProblem(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i += 1; };
  const fail = (reason) => { throw new Error(reason); };
  const string = () => {
    const start = i;
    i += 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) fail('syntax');
    i += 1;
    return JSON.parse(text.slice(start, i));
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i += 1; ws();
      const seen = new Set();
      if (text[i] === '}') { i += 1; return; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('syntax');
        const key = string();
        if (seen.has(key)) fail('duplicate-key');
        seen.add(key);
        ws();
        if (text[i] !== ':') fail('syntax');
        i += 1;
        value();
        ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === '}') { i += 1; return; }
        fail('syntax');
      }
    }
    if (c === '[') {
      i += 1; ws();
      if (text[i] === ']') { i += 1; return; }
      for (;;) {
        value(); ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === ']') { i += 1; return; }
        fail('syntax');
      }
    }
    if (c === '"') { string(); return; }
    if (text.startsWith('true', i)) { i += 4; return; }
    if (text.startsWith('false', i)) { i += 5; return; }
    if (text.startsWith('null', i)) fail('null');
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (!m) fail('syntax');
    if (m[0] !== m[1]) fail('number');
    i += m[0].length;
  };
  try {
    value(); ws();
    if (i !== text.length) fail('syntax');
    return null;
  } catch (error) {
    return error.message;
  }
}

export const cmpBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
export const cmpKey = (a, b) => Buffer.compare(Buffer.from(a, 'base64'), Buffer.from(b, 'base64'));
export const cmpNum = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const cmpGen = (a, b) => cmpNum(a.deviceId, b.deviceId) || cmpNum(a.registrationId, b.registrationId) || cmpKey(a.identityKey, b.identityKey);
/** Ordre total (§ 6.2) : approvedAt, approvedBy (deviceId, registrationId, clé), method (octets UTF-8), seq, fromSeq (absent = 0), sponsor (absent d'abord), sujet, sig. */
export function cmpApproval(a, b) {
  return cmpNum(a.approvedAt, b.approvedAt) || cmpGen(a.approvedBy, b.approvedBy) || cmpBytes(a.method, b.method) || cmpNum(a.seq, b.seq)
    || cmpNum(a.fromSeq ?? 0, b.fromSeq ?? 0) || cmpNum(a.sponsor === true ? 1 : 0, b.sponsor === true ? 1 : 0) || cmpGen(a, b) || cmpKey(a.sig, b.sig);
}
/** Pierres tombales : revokedAt, revokedBy (deviceId, registrationId, clé), seq, puis deviceId, registrationId, clé de la génération retirée, sig. */
export function cmpTomb(a, b) {
  return cmpNum(a.revokedAt, b.revokedAt) || cmpGen(a.revokedBy, b.revokedBy) || cmpNum(a.seq, b.seq) || cmpGen(a, b) || cmpKey(a.sig, b.sig);
}
export const cmpEntry = (a, b) => (isTomb(a) !== isTomb(b) ? (isTomb(a) ? 1 : -1) : isTomb(a) ? cmpTomb(a, b) : cmpApproval(a, b));
export const sameSignedContent = (userId, a, b) => isTomb(a) === isTomb(b) && signedBytes(userId, a).equals(signedBytes(userId, b));

/**
 * Le plus petit point fixe de l'état (§ 6.2), vu DEPUIS `viewer` (moi, ou une de mes ancres pour la détection des ancres étrangères) :
 * - ANCRES : viewer, puis, de proche en proche, le sujet de toute approbation `sponsor` écrite par une ancre (sujet ≠ auteur, clé non morte,
 *   sujet qui n'est pas une copie) ; F = 0 ;
 * - une approbation de x par a COMPTE si a est membre, a ≠ x, la clé de x n'est pas morte, x n'est pas une COPIE (une génération qui porte
 *   la clé du viewer sous une autre place), et seq ≥ F(a) ; F(x) = plus petit fromSeq (0 pour migrated) des approbations de x qui comptent.
 */
export function solveFrom(viewer, approvals, deadKeys) {
  const viewerId = gid(viewer);
  const isCopy = (g) => g.identityKey === viewer.identityKey && gid(g) !== viewerId;
  const anchors = new Map();
  const queue = deadKeys.has(viewer.identityKey) ? [] : [genOf(viewer)];
  while (queue.length > 0) {
    const x = queue.shift();
    if (anchors.has(gid(x))) continue;
    anchors.set(gid(x), x);
    approvals.filter((a) => a.sponsor === true && gid(a.approvedBy) === gid(x) && gid(a) !== gid(x) && !deadKeys.has(a.identityKey) && !isCopy(a)).forEach((a) => queue.push(genOf(a)));
  }
  const members = new Map(anchors);
  const floor = new Map([...anchors.keys()].map((x) => [x, 0]));
  for (let changed = true; changed;) {
    changed = false;
    for (const a of approvals) {
      const author = gid(a.approvedBy);
      const subject = gid(a);
      if (!members.has(author) || author === subject || deadKeys.has(a.identityKey) || isCopy(a) || a.seq < floor.get(author)) continue;
      const contribution = a.method === 'migrated' ? 0 : a.fromSeq;
      if (!members.has(subject)) { members.set(subject, genOf(a)); floor.set(subject, contribution); changed = true; }
      else if (contribution < floor.get(subject)) { floor.set(subject, contribution); changed = true; }
    }
  }
  /** Copies RÉCLAMÉES : générations qui portent la clé du viewer sous une autre place et qu'une approbation qui compterait vise. */
  const claimedCopies = new Map();
  approvals.forEach((a) => {
    const author = gid(a.approvedBy);
    if (isCopy(a) && members.has(author) && author !== gid(a) && !deadKeys.has(a.identityKey) && a.seq >= floor.get(author)) claimedCopies.set(gid(a), genOf(a));
  });
  return { anchors, members, claimedCopies, F: (x) => floor.get(x) ?? Infinity };
}

/** Auteurs ADMIS (membres sans tenir compte des pierres tombales) depuis `viewer` : seuls leurs entrées peuvent avoir un effet. */
export const admittedFrom = (viewer, store) => solveFrom(viewer, [...store.values()].filter((e) => !isTomb(e) && e.method !== 'self'), new Set());

/**
 * Réserve (§ 6.2, v4) : une entrée dont l'auteur n'est pas ADMIS n'a aucun effet (un non-admis n'est jamais membre, n'ancre rien, et ses
 * pierres tombales ne comptent pas) ; elle est gardée dans une réserve bornée — au plus 16 auteurs et 32 entrées par auteur — d'où l'on
 * évince la PREMIÈRE REÇUE (l'auteur entier quand un 17e arrive : celui dont la première entrée reçue est la plus ancienne). Elle quitte la
 * réserve quand son auteur devient admis (l'admission ne fait que croître). Un auteur évincé retransmet à son admission (R3, R4, R6).
 */
export function applyReserveBound(local, store, arrival) {
  const admitted = admittedFrom(local.generation, store).members;
  const reserve = [...store.entries()].filter(([, e]) => !admitted.has(gid(authorOf(e))));
  const byAuthor = new Map();
  reserve.forEach(([id, e]) => byAuthor.set(gid(authorOf(e)), [...(byAuthor.get(gid(authorOf(e))) ?? []), id]));
  for (const ids of byAuthor.values()) {
    ids.sort((x, y) => arrival.get(x) - arrival.get(y));
    while (ids.length > RESERVE_PER_AUTHOR) store.delete(ids.shift());
  }
  const authors = [...byAuthor.entries()].filter(([, ids]) => ids.length > 0).sort(([, x], [, y]) => arrival.get(x[0]) - arrival.get(y[0]));
  while (authors.length > RESERVE_AUTHORS) authors.shift()[1].forEach((id) => store.delete(id));
}

/**
 * Fusion d'un contenu reçu (§ 6.2) : (0) un clair brut passe l'analyse JSON STRICTE, sinon refus en entier ; (1) forme de chaque entrée
 * (clé sans « jumelle », s < L), sinon refus en entier ; (2) au plus 32 approbations, les plus petites selon l'ordre total, AVANT toute
 * vérification, les autres ignorées ; toutes les pierres tombales ; (3) signature de chaque entrée retenue sous la clé de son auteur, dans le
 * compte, sinon refus en entier ; (4) une entrée signée par MA clé (sous ma place ou sous une autre) que je ne tiens pas est une alerte
 * « clé copiée », jamais rangée ; (5) union : pour un doublon de la même identité, la plus petite selon l'ordre total — mon magasin compris ;
 * puis la réserve des auteurs non admis est bornée.
 */
export function ingest(local, store, message, log) {
  let content = message;
  if (typeof message.raw === 'string') {
    if (strictJsonProblem(message.raw) !== null) { log.refusedContents += 1; return; }
    content = JSON.parse(message.raw);
  }
  const entries = [...content.approvals, ...content.revocations];
  if (entries.some((e) => entryProblem(e) !== null)) { log.refusedContents += 1; return; }
  const approvals = content.approvals.map(strip).sort(cmpApproval);
  const kept = approvals.slice(0, MAX_APPROVALS);
  approvals.slice(MAX_APPROVALS).forEach((e) => log.overBound.push(e));
  const tombs = content.revocations.map(strip).sort(cmpTomb); // v5 : « reçue le plus tôt » est un ordre TOTAL — dans un contenu, l'ordre total (§ 6.2)
  const all = [...kept, ...tombs];
  if (!all.every((e) => verifySig(authorOf(e).identityKey, signedBytes(local.userId, e), e.sig))) { log.refusedContents += 1; return; }
  const me = gid(local.generation);
  const fromSelf = content.from === 'self';
  for (const e of all) {
    const author = authorOf(e);
    if (fromSelf) assert.equal(gid(author), me, 'mes entrées sont écrites par moi');
    else if (author.identityKey === local.generation.identityKey) {
      const held = gid(author) === me ? store.get(entryId(e)) : undefined;
      if (!held || !sameSignedContent(local.userId, held, e)) log.cloneAlerts.set(entryId(e), e);
      continue;
    }
    const id = entryId(e);
    const prior = store.get(id);
    if (!log.arrival.has(id)) log.arrival.set(id, log.arrival.size);
    store.set(id, prior && cmpEntry(prior, e) <= 0 ? prior : e);
  }
  applyReserveBound(local, store, log.arrival);
}

/**
 * État effectif calculé DEPUIS SOI (§ 6.2, v4) :
 * - admis = solveFrom(moi, ∅) ; une pierre tombale compte si son auteur est moi, ou un admis à un rang ≥ F_admis(auteur) ; elle vise une CLÉ ;
 * - effectifs = solveFrom(moi, mortes) ; conflits = places qui portent au moins deux clés parmi effectifs ∪ copies réclamées ; s'il y en a,
 *   recalcul avec mortes ∪ ces clés, sauf MA CLÉ ; une COPIE (ma clé sous une autre place) n'est jamais effective et lève « clé copiée » ;
 * - ancres ÉTRANGÈRES (v5, relecture V5-1) : z ∈ ancres(moi, ∅), avec clé(z) ∈ mortes ou z ∈ ancres(moi, M final), est étrangère si une
 *   ancre VIVANTE y ≠ z donne z ∉ membres(y, mortes \ {clé(z)}) — les pierres tombales COMPTENT : une approbation posthume signée par la clé
 *   d'un appareil retiré n'admet personne. Jugée en v5 avec membres(y, ∅), elle faisait admettre l'appareil du voleur (NEUF-1) ;
 *   cet appareil n'admet personne tant qu'il en a une ; morte, il se réinitialise.
 */
export function evaluate(local, store) {
  const me = gid(local.generation);
  const entries = [...store.values()];
  const approvals = entries.filter((e) => !isTomb(e) && e.method !== 'self');
  const tombs = entries.filter(isTomb);
  const admitted = solveFrom(local.generation, approvals, new Set());
  const counted = tombs.filter((t) => { const x = gid(t.revokedBy); return x === me || (admitted.members.has(x) && t.seq >= admitted.F(x)); });
  const dead = new Set(counted.map((t) => t.identityKey));
  let eff = solveFrom(local.generation, approvals, dead);
  const bySlot = new Map();
  [...eff.members.values(), ...eff.claimedCopies.values()].forEach((g) => bySlot.set(slot(g), new Set([...(bySlot.get(slot(g)) ?? []), g.identityKey])));
  const conflicts = [...bySlot.entries()].filter(([, keys]) => keys.size > 1).map(([s]) => s).sort();
  const conflictKeys = new Set([...eff.members.values()].filter((g) => conflicts.includes(slot(g)) && g.identityKey !== local.generation.identityKey).map((g) => g.identityKey));
  if (conflictKeys.size > 0) eff = solveFrom(local.generation, approvals, new Set([...dead, ...conflictKeys]));
  const proposed = [...approvals, ...tombs].filter((e) => { const x = gid(authorOf(e)); return !eff.anchors.has(x) && eff.members.has(x) && e.seq < eff.F(x); });
  const revokedSelf = dead.has(local.generation.identityKey);
  const members = revokedSelf ? [] : [...eff.members.values()];
  const mySponsors = approvals.filter((a) => a.sponsor === true && gid(a.approvedBy) === me);
  const addedBy = (g) => {
    if (gid(g) === me) return null;
    if (eff.anchors.has(gid(g))) return 'parrain';
    const counting = approvals.filter((a) => gid(a) === gid(g) && eff.members.has(gid(a.approvedBy)) && gid(a.approvedBy) !== gid(g) && a.seq >= eff.F(gid(a.approvedBy))).sort(cmpApproval);
    return counting.length ? slot(counting[0].approvedBy) : null;
  };
  const liveAnchors = revokedSelf ? [] : [...eff.anchors.values()].filter((y) => gid(y) !== me);
  const admits = (y, z) => solveFrom(y, approvals, new Set([...dead].filter((k) => k !== z.identityKey))).members.has(gid(z));
  const foreignAnchors = revokedSelf ? [] : [...admitted.anchors.values()]
    .filter((z) => gid(z) !== me && (dead.has(z.identityKey) || eff.anchors.has(gid(z))) && liveAnchors.some((y) => gid(y) !== gid(z) && !admits(y, z)))
    .map((z) => ({ ...genOf(z), dead: dead.has(z.identityKey) }))
    .sort(cmpGen);
  return {
    effective: members.map((g) => ({ ...g, addedBy: addedBy(g) })).sort(cmpGen),
    conflicts,
    revokedSelf,
    sponsorsRevoked: [...new Set(mySponsors.filter((a) => dead.has(a.identityKey)).map(slot))].sort(),
    foreignAnchors,
    cloneGenerations: revokedSelf ? [] : [...new Set([...eff.claimedCopies.values()].map(slot))].sort(),
    proposed: proposed.sort(cmpEntry),
    approvalsBlocked: counted.length > COUNTED_TOMBSTONES_LIMIT,
    reserved: entries.filter((e) => !admitted.members.has(gid(authorOf(e)))).length,
    deadKeys: [...dead].sort(),
    admittedIds: new Set(admitted.members.keys()),
  };
}

export function replay(local, messages) {
  const store = new Map();
  const log = { refusedContents: 0, overBound: [], cloneAlerts: new Map(), arrival: new Map() };
  messages.forEach((m) => ingest(local, store, m, log));
  const state = evaluate(local, store);
  const stored = [...store.values()].filter((e) => state.admittedIds.has(gid(authorOf(e))))
    .sort((a, b) => (entryId(a) < entryId(b) ? -1 : entryId(a) > entryId(b) ? 1 : cmpEntry(a, b)));
  return { ...state, stored, refusedContents: log.refusedContents, overBound: log.overBound.sort(cmpEntry), cloneAlerts: [...log.cloneAlerts.values()].sort(cmpEntry) };
}
export const permutationsOf = (items) => (items.length <= 1 ? [items] : items.flatMap((x, i) => permutationsOf([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest])));

/**
 * ÉMISSION (§ 6.4, v5 — correction G : vecteurs `transmits`) et ADMISSION (§ 4.8, § 6.1 — corrections B et D), sur le registre de l'instant :
 * - transmises : hors quarantaine, les entrées RETENUES (auteur admis : tout sauf la réserve) ; en quarantaine (ancre étrangère), mes entrées
 *   et les pierres tombales retenues dont la clé de l'auteur n'est pas morte ;
 * - verifiedAsJoiner(head) : mes entrées de rang ≤ head (le ledger(verified) de celui qui REJOINT) ;
 * - confirmé : chacune de mes ancres vivantes autres que moi m'admet (moi ∈ membres(y, mortes), sur MON registre ; relecture V5-1) ;
 * - peutAdmettre : membre ∧ confirmé ∧ aucune ancre étrangère ∧ non retiré ∧ approbations non bloquées ;
 * - deadGenerations : générations nommées dans mon registre dont la clé est morte — aucune comparaison avec elles.
 * Une entrée et une génération y sont désignées par leur place ET leur clé : une même place peut porter une clé morte et une vivante.
 * La fonction d'évaluation n'est pas touchée : les ancres vivantes sont recalculées ici comme `evaluate` les calcule.
 */
export const entryRef = (e) => ({ kind: isTomb(e) ? 'revocation' : 'approval', subject: genOf(e), author: genOf(authorOf(e)), seq: e.seq });
export function emissionOf(local, store, { joinerHead } = {}) {
  const v = evaluate(local, store);
  const me = gid(local.generation);
  const entries = [...store.values()];
  const approvals = entries.filter((e) => !isTomb(e) && e.method !== 'self');
  const dead = new Set(v.deadKeys);
  let eff = solveFrom(local.generation, approvals, dead);
  if (v.conflicts.length > 0) {
    const conflictKeys = new Set([...eff.members.values()].filter((g) => v.conflicts.includes(slot(g)) && g.identityKey !== local.generation.identityKey).map((g) => g.identityKey));
    eff = solveFrom(local.generation, approvals, new Set([...dead, ...conflictKeys]));
  }
  const liveAnchors = v.revokedSelf ? [] : [...eff.anchors.values()].filter((y) => gid(y) !== me);
  const confirmed = !v.revokedSelf && liveAnchors.every((y) => solveFrom(y, approvals, dead).members.has(me));
  const member = !v.revokedSelf && (v.effective.length > 1 || (local.root === true && v.effective.length === 1));
  const quarantined = v.foreignAnchors.length > 0;
  const retained = entries.filter((e) => v.admittedIds.has(gid(authorOf(e))));
  const mine = (e) => gid(authorOf(e)) === me;
  const changed = quarantined ? retained.filter((e) => mine(e) || (isTomb(e) && !dead.has(authorOf(e).identityKey))) : retained;
  const known = new Map();
  entries.forEach((e) => [genOf(e), authorOf(e)].forEach((g) => known.set(gid(g), g)));
  return {
    confirmed,
    mayAdmit: member && confirmed && !quarantined && !v.revokedSelf && !v.approvalsBlocked,
    deadGenerations: [...known.values()].filter((g) => dead.has(g.identityKey) && gid(g) !== me).map(genOf).sort(cmpGen),
    transmits: {
      changed: [...changed].sort(cmpEntry).map(entryRef),
      ...(joinerHead !== undefined ? { verifiedAsJoiner: entries.filter((e) => mine(e) && e.seq <= joinerHead).sort(cmpEntry).map(entryRef) } : {}),
    },
  };
}
