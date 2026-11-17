/**
 * Les cas communs du registre (spec 2026-11-17, § 8) : registres écrits à la main, entrées signées par les clés de TEST, attendus écrits à la
 * main. Les signatures déjà publiées sont REPRISES quand elles se vérifient (XEdDSA est aléatoire).
 */
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { previousLedgerPath } from './cli.mjs';
import { OTHER_USER, USER, b64, hex, sha256, utf8 } from './bytes.mjs';
import { ED25519_L, LABEL_REVOCATION, SIG_BYTES, authorOf, isTomb, signatureOk, signedBytes, slot, testKey, testKeys, verifySig } from './ledger.mjs';

// ---------------------------------------------------------------- cas communs du registre v3 (attendus écrits à la main)

// Signatures déjà publiées : reprises si elles se vérifient (index « signataire | SHA-256 des octets signés | variante »).
export const previousIndex = new Map();
if (existsSync(previousLedgerPath)) {
  const previous = JSON.parse(readFileSync(previousLedgerPath, 'utf8'));
  (previous.signatureIndex?.entries ?? []).forEach((s) => previousIndex.set(`${s.signer}|${s.signedSha256}|${s.variant}`, s.sig));
}
export const usedSignatures = [];
export const signBytesV = (signerKey, bytes, variant = 0) => {
  const key = `${signerKey}|${hex(sha256(bytes))}|${variant}`;
  const reused = previousIndex.get(key);
  let sig = reused !== undefined && verifySig(signerKey, bytes, reused) ? reused : undefined;
  if (sig === undefined) {
    const holder = testKeys.get(signerKey);
    assert.ok(holder, `aucune clé privée de test pour ${signerKey}`);
    sig = b64(holder.priv.sign(bytes));
    if (variant > 0) for (let k = 0; k < variant; k += 1) assert.notEqual(sig, previousIndex.get(`${signerKey}|${hex(sha256(bytes))}|${k}`));
  }
  assert.ok(verifySig(signerKey, bytes, sig), 'signature invalide');
  previousIndex.set(key, sig);
  if (!usedSignatures.some((u) => u.key === key)) usedSignatures.push({ key, signer: signerKey, signedSha256: hex(sha256(bytes)), variant, sig });
  return sig;
};
export const signedBy = (signerKey, userId, e, { label, variant } = {}) => ({ ...e, sig: signBytesV(signerKey, signedBytes(userId, e, label), variant ?? 0) });

export const T0 = 1_790_000_000_000;
export const dev = (name, deviceId, registrationId) => ({ deviceId, registrationId, identityKey: testKey(name) });
export const A = dev('iphone', 1, 4211), B = dev('pixel', 2, 9054), C = dev('browser', 3, 15022), N = dev('ipad', 4, 1), P = dev('phantom', 5, 777);
export const Q = dev('q', 6, 801), X = dev('x', 7, 4242), Z = dev('z', 8, 5150), P2 = dev('p2', 9, 909), N2 = dev('n2', 10, 1010), Y = dev('y', 12, 1212), D = dev('d', 13, 1313);
export const B2 = dev('pixel-reinstall', 2, 9055);
export const G = Array.from({ length: 33 }, (_, i) => dev(`g${i}`, 40 + i, 1000 + i));
export const PH = { ...C, identityKey: P.identityKey };
export const N_AS_6 = { deviceId: 6, registrationId: 77, identityKey: N.identityKey };

export const sign = (e, opts) => signedBy(authorOf(e).identityKey, USER, e, opts);
export const self = (g, at) => sign({ ...g, approvedBy: g, approvedAt: at, method: 'self', seq: 1 });
export const approval = (g, by, at, seq, fromSeq, method = 'sas', sponsor = false) => ({ ...g, approvedBy: by, approvedAt: at, method, seq, ...(fromSeq !== undefined ? { fromSeq } : {}), ...(sponsor ? { sponsor: true } : {}) });
export const appr = (g, by, at, seq, fromSeq, method = 'sas') => sign(approval(g, by, at, seq, fromSeq, method));
/** L'approbation de parrainage : l'initiateur (celui qui rejoint) approuve le répondeur et adopte sa vue. */
export const sponsorship = (sponsor, by, at, seq, fromSeq, method = 'sas') => sign(approval(sponsor, by, at, seq, fromSeq, method, true));
export const revocation = (g, by, at, seq) => ({ ...g, revokedBy: by, revokedAt: at, seq });
export const tomb = (g, by, at, seq) => sign(revocation(g, by, at, seq));
/** Une entrée FORGÉE : l'auteur déclaré n'est pas le signataire. */
export const forgedBy = (forger, e) => signedBy(forger.identityKey, USER, e);
/** Un contenu reçu : les pierres tombales glissées dans la première liste vont avec les autres (aucun cas v3 ne le fait : sortie inchangée). */
export const msg = (from, approvals, revocations = []) => ({ from, approvals: approvals.filter((e) => !isTomb(e)), revocations: [...approvals.filter(isTomb), ...revocations] });
export const ROOT = (g) => ({ userId: USER, generation: g, root: true });
export const LOCAL = (g) => ({ userId: USER, generation: g, root: false });
export const DUMMY_SIG = b64(Buffer.alloc(SIG_BYTES, 1));

export const caseDefs = [
  // ---- les cas de la v2, sur entrées signées
  { name: 'propagation-par-un-appareil-effectif', description: 'B, admis par A, admet C : C devient effectif chez A, « ajouté par » B', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2), appr(C, B, T0 + 20, 3, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], addedBy: { '2:9054': '1:4211', '3:15022': '2:9054' } } },
  { name: 'la-revocation-gagne-quel-que-soit-l-ordre', description: 'la pierre tombale de A sur C l’emporte sur l’approbation de C par B, plus récente', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)], [tomb(C, A, T0 + 50, 3)]), msg(B, [self(B, T0 + 5), appr(C, B, T0 + 99, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'] } },
  { name: 'deux-cles-pour-une-generation-conflit', description: 'deux clés vivantes pour 3:15022 : aucune n’est effective', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 11, 3, 2)]), msg(B, [self(B, T0 + 5), appr(PH, B, T0 + 12, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'], conflicts: ['3:15022'] } },
  { name: 'conflit-resolu-par-pierre-tombale', description: 'la pierre tombale de la clé fantôme résout le conflit au profit de la vraie clé', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 11, 3, 2)], [tomb(PH, A, T0 + 13, 4)]), msg(B, [self(B, T0 + 5), appr(PH, B, T0 + 12, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], keyOf: { '3:15022': C.identityKey } } },
  { name: 'nouvelle-generation-sur-la-meme-place', description: 'deux générations de la place 2 coexistent', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(B2, A, T0 + 20, 3, 2)])],
    expect: { effective: ['1:4211', '2:9054', '2:9055'] } },
  { name: 'doublon-garde-la-plus-petite-approbation', description: 'deux approbations de C par B (auteur fautif) : on garde la plus petite selon l’ordre total (qr, approvedAt le plus ancien)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), appr(C, B, T0 + 9, 3, 2)]), msg(B, [appr(C, B, T0 + 1, 2, 2, 'qr')])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], storedApproval: { of: '3:15022', by: '2:9054', method: 'qr', approvedAt: T0 + 1 } } },
  { name: 'pierre-tombale-de-moi-meme', description: 'mon parrain me retire : état « retiré »', local: LOCAL(C),
    messages: [msg('self', [self(C, T0 + 1), sponsorship(A, C, T0 + 3, 2, 2)]), msg(A, [self(A, T0), appr(C, A, T0 + 4, 2, 2)], [tomb(C, A, T0 + 7, 3)])],
    expect: { effective: [], revokedSelf: true } },
  { name: 'approbations-ex-aequo-departagees', description: 'même approvedAt : « ajouté par » A (deviceId 1 < 2) ; doublon de B : qr < sas (octets UTF-8)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 30, 3, 2)]), msg(B, [self(B, T0 + 5), appr(C, B, T0 + 30, 2, 2)]), msg(B, [appr(C, B, T0 + 30, 2, 2, 'qr')])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], addedBy: { '3:15022': '1:4211' }, storedApproval: { of: '3:15022', by: '2:9054', method: 'qr', approvedAt: T0 + 30 } } },
  { name: 'horodatage-hors-borne-refuse', description: 'approvedAt = 2^53, approvedAt = 1.5, seq = 0 : chaque contenu est refusé en entier, avant toute signature', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]),
      msg(B, [{ ...approval(C, B, 2 ** 53, 2, 2), sig: DUMMY_SIG }]), msg(B, [{ ...approval(C, B, 1.5, 2, 2), sig: DUMMY_SIG }]), msg(B, [{ ...approval(C, B, T0, 0, 2), sig: DUMMY_SIG }])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 3 } },
  { name: 'inscription-self-ne-masque-pas-l-approbation', description: 'N s’inscrit à T0+1000, A l’approuve à T0+2000 : « ajouté par » A, l’inscription n’approuve rien', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(N, A, T0 + 2000, 2, 2)]), msg(N, [self(N, T0 + 1000)])],
    expect: { effective: ['1:4211', '4:1'], addedBy: { '4:1': '1:4211' }, storedApprovalsOf: { '4:1': 2 } } },
  { name: 'cle-revoquee-sous-une-autre-generation', description: 'la clé de 4:1 a une pierre tombale ; la même clé sous 6:77 est écartée', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)], [tomb(N, A, T0 + 20, 3)]), msg(B, [self(B, T0 + 5), appr(N_AS_6, B, T0 + 30, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'] } },
  { name: 'approbation-d-un-auteur-revoque', description: 'B est retiré : son approbation de N ne compte plus (cascade automatique)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 11, 3, 2)], [tomb(B, A, T0 + 40, 4)]), msg(B, [self(B, T0 + 5), appr(N, B, T0 + 20, 2, 2)])],
    expect: { effective: ['1:4211', '3:15022'] } },
  { name: 'entree-anterieure-a-l-admission-reste-proposee', description: 'N avait approuvé Q et retiré B AVANT d’être admis (fromSeq 4) : proposées, sans effet ; son approbation postérieure de C compte', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 100, 3, 4)]), msg(B, [self(B, T0 + 5)]),
      msg(N, [self(N, T0 + 50), appr(Q, N, T0 + 60, 2, 2), appr(C, N, T0 + 200, 4, 2)], [tomb(B, N, T0 + 70, 3)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], addedBy: { '3:15022': '4:1' }, proposed: 2 } },
  { name: 'parrain-retire-ce-qu-il-tenait-tombe', description: 'C retire A, mon parrain : ce que je ne tenais que par A tombe, je repasse en attente', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 50), sponsorship(A, N, T0 + 59, 2, 3)]),
      msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 60, 3, 2), self(B, T0 + 5), appr(C, B, T0 + 20, 2, 2), self(C, T0 + 15)]),
      msg(C, [self(C, T0 + 15)], [tomb(A, C, T0 + 90, 2)])],
    expect: { effective: ['4:1'], sponsorsRevoked: ['1:4211'] } },
  { name: 'revocation-retenue-n-ouvre-rien-ailleurs', description: 'B, en retard, relaie l’approbation de Z signée par X, que A a retiré : retenue, sans effet ; X ne compte plus', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(X, A, T0 + 11, 3, 2)], [tomb(X, A, T0 + 40, 4)]),
      msg(B, [self(B, T0 + 5), self(X, T0 + 6), appr(Z, X, T0 + 50, 2, 2)]), msg(X, [self(X, T0 + 6), appr(Z, X, T0 + 50, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'] } },
  { name: 'pierre-tombale-d-un-auteur-jamais-admis-sans-effet', description: 'mon parrain relaie une pierre tombale signée par P, que personne n’a admis : sans effet', local: LOCAL(C),
    messages: [msg('self', [self(C, T0 + 15), sponsorship(A, C, T0 + 16, 2, 3)]), msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 17, 3, 2), self(P, T0 + 12)], [tomb(B, P, T0 + 30, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], reserved: 2 } },
  { name: 'registre-au-dela-des-bornes', description: '34 approbations dans un contenu de B : les 32 plus petites (ordre total) gardées, avant toute vérification ; sa pierre tombale appliquée', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), ...G.map((g, i) => appr(g, B, T0 + 100 + i, i + 2, 2))], [tomb(G[2], B, T0 + 500, 40)])],
    expect: { effectiveCount: 32, overBound: 2, absent: [slot(G[2]), slot(G[31]), slot(G[32])] } },
  { name: 'champ-inconnu-ignore', description: 'un champ inconnu est ignoré, jamais refusé ; il n’entre pas dans les octets signés', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), { ...appr(C, B, T0 + 20, 2, 2), accountKey: 'AAAA', note: 'champ futur' }])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'] } },
];
// ---- ce que la signature ferme, et ce qu'elle laisse (revue de confirmation : R-1 à R-5 ; R-6 trouvé en écrivant la v3)
caseDefs.push(
  { name: 'a-mon-nom-forgee-par-le-parrain-refusee', description: 'R-1 (vue de N) : P, parrain de N, glisse « approbation de P2 par N » qu’il a signée lui-même : contenu refusé ; en v2, P2 devenait effectif chez N', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 50), sponsorship(P, N, T0 + 60, 2, 2)]),
      msg(P, [self(P, T0 + 40), appr(N, P, T0 + 61, 2, 2), forgedBy(P, approval(P2, N, T0 + 70, 1000, 1))])],
    expect: { effective: ['4:1', '5:777'], refusedContents: 1 } },
  { name: 'a-mon-nom-retransmise-refusee', description: 'R-1 (vue de A) : la même forge, et « approbation de P par N », retransmises dans le registre de N : refusé ; en v2, P et P2 entraient chez un membre', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 20, 3, 2)]), msg(B, [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2)]),
      msg(N, [self(N, T0 + 15), sponsorship(A, N, T0 + 19, 2, 3), forgedBy(P, approval(P2, N, T0 + 70, 1000, 1)), forgedBy(P, approval(P, N, T0 + 71, 1001, 1))])],
    expect: { effective: ['1:4211', '2:9054', '4:1'], refusedContents: 1 } },
  { name: 'pierre-tombale-a-mon-nom-refusee', description: 'R-1 (vue de A) : des pierres tombales « de N » sur A et sur B, signées par P : refusées ; en v2, A se retirait lui-même', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 20, 3, 2)]), msg(B, [self(B, T0 + 5)]),
      msg(N, [self(N, T0 + 15)], [forgedBy(P, revocation(A, N, T0 + 80, 1000)), forgedBy(P, revocation(B, N, T0 + 81, 1001))])],
    expect: { effective: ['1:4211', '2:9054', '4:1'], refusedContents: 1 } },
  { name: 'rang-d-admission-non-abaisse-par-une-approbation-proposee', description: 'R-2 : X (racine fabriquée) avait admis Y, puis Y P2, avant que A ne confirme X (fromSeq 3) et Y (fromSeq 4). L’approbation de Y par X ne compte pas chez A, donc ne fixe pas F(Y) : P2 reste dehors', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(X, A, T0 + 300, 2, 3), appr(Y, A, T0 + 320, 3, 4)]),
      msg(X, [self(X, T0 + 100), appr(Y, X, T0 + 122, 2, 2), sponsorship(A, X, T0 + 299, 3, 2)]),
      msg(Y, [self(Y, T0 + 110), sponsorship(X, Y, T0 + 121, 2, 2), appr(P2, Y, T0 + 200, 3, 2), sponsorship(A, Y, T0 + 319, 4, 3)]), msg(P2, [self(P2, T0 + 150)])],
    expect: { effective: ['1:4211', '7:4242', '12:1212'], proposed: 3, reserved: 1 } },
  { name: 'relais-de-second-rang-ne-transmet-rien-de-forge', description: 'R-3 (vue de N2, filleul de N, filleul de A) : le registre honnête de N passe ; un second contenu relaie « approbation de P2 par A » et « pierre tombale de B par A » signées par P : refusé', local: LOCAL(N2),
    messages: [msg('self', [self(N2, T0 + 400), sponsorship(N, N2, T0 + 410, 2, 3)]),
      msg(N, [self(N, T0 + 200), sponsorship(A, N, T0 + 210, 2, 3), appr(N2, N, T0 + 411, 3, 2), self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 211, 3, 2), self(P, T0 + 30), self(B, T0 + 5)], [tomb(P, A, T0 + 300, 4)]),
      msg(N, [forgedBy(P, approval(P2, A, T0 + 500, 99, 1))], [forgedBy(P, revocation(B, A, T0 + 501, 98))])],
    expect: { effective: ['1:4211', '2:9054', '4:1', '10:1010'], refusedContents: 1, reserved: 1 } },
  { name: 'approbation-sas-sans-fromSeq-refusee', description: 'R-4 : une approbation sas sans fromSeq (même signée) fait refuser le contenu : aucune approbation non fixée ne voyage ni ne compte', local: LOCAL(B),
    messages: [msg('self', [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2)]), msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 20, 3)]),
      msg(N, [self(N, T0 + 15), appr(P2, N, T0 + 16, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1, reserved: 2 } },
  { name: 'F-non-abaisse-par-un-auteur-retire', description: 'R-5 : C, retiré par A, avait approuvé X avec fromSeq 2 ; B l’a approuvé avec fromSeq 5 ; l’approbation de P2 par X (rang 3) reste PROPOSÉE (F(X) ne prend que les approbations qui comptent)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 11, 3, 2)], [tomb(C, A, T0 + 90, 4)]),
      msg(B, [self(B, T0 + 5), appr(X, B, T0 + 40, 2, 5)]), msg(C, [self(C, T0 + 6), appr(X, C, T0 + 30, 2, 2)]), msg(X, [self(X, T0 + 20), appr(P2, X, T0 + 25, 3, 1)])],
    expect: { effective: ['1:4211', '2:9054', '7:4242'], proposed: 1 } },
  { name: 'le-filleul-d-un-filleul-fait-confiance-a-la-racine', description: 'R-6 (vue de C) : A (racine) avait admis D ; B a rejoint A, puis C a rejoint B : C compte A, B et D ; en v2, C ne comptait que B et lui-même', local: LOCAL(C),
    messages: [msg('self', [self(C, T0 + 300), sponsorship(B, C, T0 + 310, 2, 3)]),
      msg(B, [self(B, T0 + 100), sponsorship(A, B, T0 + 110, 2, 3), appr(C, B, T0 + 311, 3, 2), self(A, T0), appr(D, A, T0 + 50, 2, 2), appr(B, A, T0 + 111, 3, 2), self(D, T0 + 40)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '13:1313'], addedBy: { '1:4211': 'parrain', '2:9054': 'parrain', '13:1313': '1:4211' } } },
  { name: 'entree-signee-relayee-par-un-tiers-compte', description: 'B relaie l’approbation de Q signée par C : retenue et comptée (C est effectif) ; en v2, ignorée faute de venir de son auteur', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), appr(C, B, T0 + 20, 2, 2), self(C, T0 + 15), appr(Q, C, T0 + 30, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '6:801'], addedBy: { '6:801': '3:15022' } } },
  { name: 'attribution-forgee-refusee', description: 'N relaie « approbation de Q par A » et « approbation de P par B », signées par N : contenu refusé', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(N, A, T0 + 20, 3, 2)]), msg(B, [self(B, T0 + 5)]),
      msg(N, [self(N, T0 + 15), forgedBy(N, approval(Q, A, T0 + 30, 9, 2)), forgedBy(N, approval(P, B, T0 + 31, 7, 2))])],
    expect: { effective: ['1:4211', '2:9054', '4:1'], refusedContents: 1 } },
  // ---- la course du voleur de mot de passe : bornée à l'appareil qui l'a perdue
  { name: 'course-du-voleur-vue-de-A', description: 'N s’est d’abord confirmé avec P (voleur), puis avec A : chez A, N compte, P non ; l’approbation de parrainage de P par N est PROPOSÉE (d’où l’alerte « s’est d’abord confirmé avec n° 5 »)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2), appr(N, A, T0 + 520, 4, 3)]),
      msg(B, [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2)]), msg(C, [self(C, T0 + 15), sponsorship(A, C, T0 + 19, 2, 3)]),
      msg(N, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], proposed: 1 } },
  { name: 'course-du-voleur-vue-de-N', description: 'N a deux parrains, P puis A : il adopte les deux vues (P2 par P ; B et C par A). v4 : A n’admet pas P (son approbation par N est antérieure à l’admission de N), P est donc une ancre ÉTRANGÈRE de N — N le dit (« s’est d’abord confirmé avec n° 5 ») et n’admet personne', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), appr(N, P, T0 + 411, 3, 2), self(P2, T0 + 310)]),
      msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2), appr(N, A, T0 + 520, 4, 3), self(B, T0 + 5), self(C, T0 + 15)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1', '5:777', '9:909'], addedBy: { '1:4211': 'parrain', '5:777': 'parrain', '9:909': '5:777' }, foreignAnchors: ['5:777'] } },
  { name: 'sortie-de-course-par-le-retrait-de-P', description: '« Retirer n° 5 » sur A : la pierre tombale de A compte chez N (A est son parrain) ; P tombe, et P2 avec lui ; N garde la vue de A. v4 : P reste une ancre ÉTRANGÈRE morte — N n’admet personne et se réinitialise (une pierre tombale que P signerait encore compterait chez N)', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), appr(N, P, T0 + 411, 3, 2), self(P2, T0 + 310)]),
      msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2), appr(N, A, T0 + 520, 4, 3), self(B, T0 + 5), self(C, T0 + 15)], [tomb(P, A, T0 + 600, 5)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], sponsorsRevoked: ['5:777'], foreignAnchors: ['5:777!'] } },
  { name: 'pierres-tombales-preventives-du-voleur-bornees-a-N', description: 'P avait signé des pierres tombales de A et de B : chez N (qui a admis P), elles comptent ; avec celle de A sur P, N ne garde personne et doit se réinitialiser. Limite écrite au § 11', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), appr(N, P, T0 + 411, 3, 2), self(P2, T0 + 310)], [tomb(A, P, T0 + 330, 4), tomb(B, P, T0 + 331, 5)]),
      msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2), appr(N, A, T0 + 520, 4, 3), self(B, T0 + 5), self(C, T0 + 15)], [tomb(P, A, T0 + 600, 5)])],
    expect: { effective: ['4:1'], sponsorsRevoked: ['1:4211', '5:777'] } },
  { name: 'pierres-tombales-preventives-du-voleur-sans-effet-chez-A', description: 'les mêmes pierres tombales de P, relayées par N : P n’est admis nulle part chez A, elles ne comptent pas', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2), appr(N, A, T0 + 520, 4, 3)], [tomb(P, A, T0 + 600, 5)]),
      msg(N, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4), self(P, T0 + 300)], [tomb(A, P, T0 + 330, 4), tomb(B, P, T0 + 331, 5)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], proposed: 1, reserved: 3 } },
  { name: 'approbation-de-parrainage-hors-chaine-ne-blanchit-rien', description: 'vue de B : N a rejoint X (fromSeq = 1 + tête de X) ; chez B, hors de la chaîne de N, c’est une approbation ordinaire : l’approbation de Y faite par X avant son admission reste proposée', local: LOCAL(B),
    messages: [msg('self', [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2)]),
      msg(A, [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(X, A, T0 + 300, 3, 3)]),
      msg(X, [self(X, T0 + 100), appr(Y, X, T0 + 122, 2, 2), sponsorship(A, X, T0 + 299, 3, 3), appr(N, X, T0 + 401, 4, 2)]),
      msg(N, [self(N, T0 + 390), sponsorship(X, N, T0 + 400, 2, 4)]), msg(Y, [self(Y, T0 + 110), sponsorship(X, Y, T0 + 121, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054', '4:1', '7:4242'], proposed: 1, reserved: 2 } },
  { name: 'le-filleul-adopte-la-vue-de-son-parrain', description: 'vue de N (même scénario) : N a rejoint X, qui a rejoint A ; N adopte la vue de X, y compris l’approbation de Y faite par X avant son admission (P6 vaut hors de la chaîne)', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 390), sponsorship(X, N, T0 + 400, 2, 4)]),
      msg(X, [self(X, T0 + 100), appr(Y, X, T0 + 122, 2, 2), sponsorship(A, X, T0 + 299, 3, 3), appr(N, X, T0 + 401, 4, 2), self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(X, A, T0 + 300, 3, 3), self(Y, T0 + 110), self(B, T0 + 5)])],
    expect: { effective: ['1:4211', '2:9054', '4:1', '7:4242', '12:1212'] } },
  // ---- ce qui reste : une clé retirée garde la valeur de ses pierres tombales
  { name: 'pierre-tombale-d-un-auteur-retire-compte-encore', description: 'A a retiré X ; B, en retard, relaie une pierre tombale de C signée par X : X a été admis, elle compte (fail-safe), C tombe. Limite écrite au § 11 : une clé retirée puis volée peut encore retirer', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 11, 3, 2), appr(X, A, T0 + 12, 4, 2)], [tomb(X, A, T0 + 90, 5)]),
      msg(B, [self(B, T0 + 5), self(X, T0 + 6)], [tomb(C, X, T0 + 95, 2)])],
    expect: { effective: ['1:4211', '2:9054'] } },
  // ---- signatures : forme et vérification
  { name: 'signature-absente-refusee', description: 'une entrée sans sig : contenu refusé (forme)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), approval(C, B, T0 + 20, 2, 2)])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'signature-d-une-autre-cle-refusee', description: 'l’approbation de C « par B » est signée par la clé de C : refusée', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), forgedBy(C, approval(C, B, T0 + 20, 2, 2))])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'signature-d-un-autre-compte-refusee', description: 'B a signé les mêmes champs pour un autre compte (userId dans les octets signés) : refusée ici', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), signedBy(B.identityKey, OTHER_USER, approval(C, B, T0 + 20, 2, 2))])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'signature-sur-un-autre-domaine-refusee', description: 'B a signé les octets de l’approbation sous l’étiquette « |revocation » : refusée', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), signedBy(B.identityKey, USER, approval(C, B, T0 + 20, 2, 2), { label: LABEL_REVOCATION })])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'doublon-signe-deux-fois-une-seule-entree', description: 'la même approbation reçue sous deux signatures valides (XEdDSA est aléatoire) : une seule entrée, la signature aux plus petits octets', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), appr(C, B, T0 + 20, 2, 2)]),
      msg(B, [signedBy(B.identityKey, USER, approval(C, B, T0 + 20, 2, 2), { variant: 1 })])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'], storedApprovalsOf: { '3:15022': 1 } } },
  { name: 'cle-copiee-entree-a-mon-nom-valide', description: 'une entrée valablement signée par MA clé, que je n’ai pas écrite : ignorée, alerte « clé copiée »', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(B, A, T0 + 10, 2, 2)]), msg(B, [self(B, T0 + 5), appr(Q, A, T0 + 40, 3, 2)])],
    expect: { effective: ['1:4211', '2:9054'], cloneAlerts: 1 } },
);

// ---------------------------------------------------------------- cas v4 (contre-relecture v3 : V3-1 à V3-8, M1, JSON, forme)
// Les registres ci-dessous sont ceux que produit la machine à états v4 (§ 4.6) sous l'attaque de chaque constat ; les registres de la v3
// qui les rendaient possibles (signature différée, demande d'un membre à `others`…) ne peuvent plus être écrits par un appareil honnête.

export const M = dev('m', 14, 1414), O = dev('old-phone', 15, 1515), OO = dev('older-phone', 16, 1616), T = dev('tablet', 17, 1717), XC = dev('x-conflict', 41, 1);
export const ME_AT_41 = { deviceId: 41, registrationId: 1, identityKey: N.identityKey };
/** La « jumelle » d'une clé : bit 0x80 de l'octet 32 levé. libsignal l'accepte et y vérifie les mêmes signatures ; la forme du § 6.2 la refuse. */
export const twinOf = (g) => { const k = Buffer.from(g.identityKey, 'base64'); k[32] |= 0x80; return { ...g, identityKey: b64(k) }; };
/** Clés de victimes pour les inondations : 33 octets bien formés, sans clé privée (une pierre tombale vise une clé, pas un signataire). */
export const victimKey = (label) => { const k = Buffer.concat([Buffer.from([0x05]), sha256(utf8(`meeshy-sas-vector/${label}/victim`))]); k[32] &= 0x7f; return b64(k); };
export const victim = (label, deviceId, registrationId) => ({ deviceId, registrationId, identityKey: victimKey(label) });
export const junkAuthors = Array.from({ length: 17 }, (_, i) => dev(`junk-${i}`, 60 + i, 6000 + i));
export const junkVictims = Array.from({ length: 16 }, (_, i) => victim(`junk-victim-${i}`, 100 + i, 7000 + i));
/** Un clair BRUT, tel qu'il arrive : la plateforme l'analyse avec son analyseur JSON strict (§ 6.3). `mutate` réécrit le texte. */
export const raw = (from, approvals, revocations = [], mutate = (t) => t) => ({ raw: mutate(JSON.stringify({ from, approvals, revocations })) });
export const once = (text, from, to) => { assert.ok(text.includes(from), `motif absent : ${from}`); return text.replace(from, to); };

/** Signature malléable (R, s + L) : libsignal la vérifie encore (mesuré par la revue) ; la forme la refuse (s ≥ L). Le bit de signe est gardé. */
export const malleate = (e) => {
  const sig = Buffer.from(e.sig, 'base64');
  const sign = sig[63] & 0x80;
  const s = Buffer.from(sig.subarray(32)); s[31] &= 0x7f;
  const s2 = BigInt(`0x${Buffer.from(s).reverse().toString('hex')}`) + ED25519_L;
  const out = Buffer.from(s2.toString(16).padStart(64, '0'), 'hex').reverse();
  out[31] |= sign;
  const m = { ...e, sig: b64(Buffer.concat([sig.subarray(0, 32), out])) };
  assert.ok(verifySig(authorOf(e).identityKey, signedBytes(USER, e), m.sig), 'libsignal doit vérifier (R, s + L)');
  assert.equal(signatureOk(m.sig), false, 'la forme doit refuser s ≥ L');
  return m;
};

// Le groupe nominal : A racine ; B puis C l'ont rejoint (chaque côté signe à l'ouverture du ledger(verified) du pair, fromSeq = head + 1).
export const groupEntries = () => ({
  A: [self(A, T0), appr(B, A, T0 + 10, 2, 2), appr(C, A, T0 + 20, 3, 2)],
  B: [self(B, T0 + 5), sponsorship(A, B, T0 + 9, 2, 2)],
  C: [self(C, T0 + 15), sponsorship(A, C, T0 + 19, 2, 3)],
});
export const g = groupEntries();
// P (voleur) et P2 : P2 a rejoint P ; P a posé une pierre tombale « préventive » sur B.
export const thief = { P: [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), tomb(B, P, T0 + 330, 3)], P2: [self(P2, T0 + 310), sponsorship(P, P2, T0 + 319, 2, 2)] };

caseDefs.push(
  // ---- V3-1 : signature DIFFÉRÉE. P gagne la course sur N (neuf), RETIENT son ledger(verified) ; v4 : `confirmed-local` expire (10 min ou
  // « Annuler »), l'épingle tombe, la transaction est terminée ; N « Réessaie » vers A ; le ledger(verified) tardif de P est acquitté SANS EFFET.
  { name: 'S1-signature-differee-impossible-vue-de-A', description: 'V3-1 : P a gagné la course sur N et retenu son ledger(verified) ; en v4 la transaction de N expire sans rien signer, N rejoint A par une demande dirigée, et le ledger(verified) tardif de P est acquitté sans effet. Les entrées de P, relayées quand même, restent en réserve : P n’entre pas, B reste effectif', local: ROOT(A),
    messages: [msg('self', [...g.A, appr(N, A, T0 + 520, 4, 2)]), msg(B, g.B), msg(C, g.C),
      msg(N, [self(N, T0 + 400), sponsorship(A, N, T0 + 510, 2, 4)]), msg(N, [...thief.P, ...thief.P2])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], reserved: 5 } },
  { name: 'S1-signature-differee-impossible-vue-de-C', description: 'V3-1, vue de C (ancre A) : même registre ; P n’entre pas, B reste effectif', local: LOCAL(C),
    messages: [msg('self', g.C), msg(A, [...g.A, appr(N, A, T0 + 520, 4, 2)]), msg(B, g.B),
      msg(N, [self(N, T0 + 400), sponsorship(A, N, T0 + 510, 2, 4)]), msg(N, [...thief.P, ...thief.P2])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], addedBy: { '1:4211': 'parrain', '4:1': '1:4211' }, reserved: 5 } },
  // ---- V3-3 : les DESCENDANTS de l'appareil capturé. M rejoint N alors que N n'a que P pour ancre (rien ne le signale encore) : borne écrite.
  { name: 'S2-descendant-avant-la-sortie-vue-de-M', description: 'V3-3 : M a rejoint N (capturé, P seule ancre) AVANT que N ne rejoigne A : P est effectif chez M (borne écrite : l’appareil capturé et ceux qui le rejoignent) ; dès que N a rejoint A, P devient une ancre ÉTRANGÈRE de M — M le dit et n’admet personne', local: LOCAL(M),
    messages: [msg('self', [self(M, T0 + 450), sponsorship(N, M, T0 + 460, 2, 3)]),
      msg(N, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), appr(M, N, T0 + 461, 3, 2), sponsorship(A, N, T0 + 510, 4, 4)]),
      msg(N, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), appr(N, P, T0 + 411, 3, 2), ...thief.P2]),
      msg(A, [...g.A, appr(N, A, T0 + 520, 4, 4), ...g.B, ...g.C])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1', '5:777', '9:909', '14:1414'], addedBy: { '4:1': 'parrain', '5:777': 'parrain', '1:4211': 'parrain' }, foreignAnchors: ['5:777'] } },
  { name: 'S2-descendant-avant-la-sortie-vue-de-A', description: 'V3-3, vue de A : N compte (admis avec fromSeq 4) ; son parrainage de P et son approbation de M, antérieurs, restent PROPOSÉS : ni P ni M n’entrent chez A', local: ROOT(A),
    messages: [msg('self', [...g.A, appr(N, A, T0 + 520, 4, 4)]), msg(B, g.B), msg(C, g.C),
      msg(N, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), appr(M, N, T0 + 461, 3, 2), sponsorship(A, N, T0 + 510, 4, 4), self(M, T0 + 450), sponsorship(N, M, T0 + 460, 2, 3)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], proposed: 2, reserved: 2 } },
  { name: 'S2b-descendant-apres-le-retrait-vue-de-M', description: 'V3-3 : « Retirer n° 5 » sur A ; chez M, P tombe (A est son ancre par N), et P2 avec lui ; P reste une ancre étrangère MORTE : M se réinitialise avant d’admettre quiconque', local: LOCAL(M),
    messages: [msg('self', [self(M, T0 + 450), sponsorship(N, M, T0 + 460, 2, 3)]),
      msg(N, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), appr(M, N, T0 + 461, 3, 2), sponsorship(A, N, T0 + 510, 4, 4)]),
      msg(N, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), appr(N, P, T0 + 411, 3, 2), ...thief.P2]),
      msg(A, [...g.A, appr(N, A, T0 + 520, 4, 4), ...g.B, ...g.C], [tomb(P, A, T0 + 600, 5)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1', '14:1414'], foreignAnchors: ['5:777!'] } },
  // ---- S2c : la pierre tombale « préventive » de P survit au retrait chez N ; N n'admet donc personne, et M rejoint A : B intact chez M.
  { name: 'S2c-l-appareil-capture-n-admet-plus-vue-de-N', description: 'S2c : P avait retiré B ; après « Retirer n° 5 », B reste mort chez N (P y a été admis) : P est une ancre étrangère MORTE, N n’admet personne et se réinitialise', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 4), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [...thief.P, appr(N, P, T0 + 411, 4, 2)]),
      msg(A, [...g.A, appr(N, A, T0 + 520, 4, 3), ...g.B, ...g.C], [tomb(P, A, T0 + 600, 5)])],
    expect: { effective: ['1:4211', '3:15022', '4:1'], sponsorsRevoked: ['5:777'], foreignAnchors: ['5:777!'] } },
  { name: 'S2c-le-nouvel-appareil-rejoint-A-vue-de-M', description: 'S2c : N refusant d’admettre, M rejoint A ; le parrainage de P par N est antérieur à l’admission de N : P n’est admis nulle part chez M, sa pierre tombale de B ne compte pas', local: LOCAL(M),
    messages: [msg('self', [self(M, T0 + 700), sponsorship(A, M, T0 + 710, 2, 6)]),
      msg(A, [...g.A, appr(N, A, T0 + 520, 4, 3), ...g.B, ...g.C, appr(M, A, T0 + 711, 6, 2)], [tomb(P, A, T0 + 600, 5)]),
      msg(A, [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 4), sponsorship(A, N, T0 + 510, 3, 4), ...thief.P, appr(N, P, T0 + 411, 4, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1', '14:1414'], proposed: 1, reserved: 4 } },
  // ---- V3-5 : inondation. Des entrées d'auteurs jamais admis vont en RÉSERVE bornée ; la borne de 256 ne compte que les pierres tombales COMPTÉES.
  { name: 'S3-inondation-en-reserve-vue-de-A', description: 'V3-5 : N relaie 272 pierres tombales signées par 17 clés jetables (16 chacune) : en réserve, 16 auteurs gardés (le premier reçu évincé) ; rien ne compte, A peut encore ajouter des approbations (la v3 les rangeait toutes et refusait au-delà de 256)', local: ROOT(A),
    messages: [msg('self', [...g.A, appr(N, A, T0 + 520, 4, 2)]), msg(B, g.B), msg(C, g.C), msg(N, [self(N, T0 + 400), sponsorship(A, N, T0 + 510, 2, 4)]),
      ...Array.from({ length: 9 }, (_, part) => msg(N, [], junkAuthors.flatMap((j, a) => junkVictims.map((v, i) => ({ j, a, v, i }))).slice(part * 32, part * 32 + 32).map(({ j, a, v, i }) => tomb(v, j, T0 + 2000 + a * 16 + i, 1 + i))))],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], reserved: 256 } },
  { name: 'reserve-bornee-par-auteur', description: 'V3-5 : 40 pierres tombales d’un seul auteur jamais admis : 32 gardées en réserve (les premières reçues évincées)', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), msg(B, g.B),
      msg(B, [], junkVictims.slice(0, 16).map((v, i) => tomb(v, junkAuthors[0], T0 + 3000 + i, 100 + i)).concat(junkVictims.slice(0, 4).map((v, i) => tomb({ ...v, identityKey: victimKey(`extra-${i}`) }, junkAuthors[0], T0 + 3100 + i, 200 + i)))),
      msg(B, [], junkVictims.slice(0, 16).map((v, i) => tomb({ ...v, identityKey: victimKey(`extra-b-${i}`) }, junkAuthors[0], T0 + 3200 + i, 300 + i)).concat(junkVictims.slice(0, 4).map((v, i) => tomb({ ...v, identityKey: victimKey(`extra-c-${i}`) }, junkAuthors[0], T0 + 3300 + i, 400 + i))))],
    expect: { effective: ['1:4211', '2:9054'], reserved: 32 } },
  { name: 'au-dela-de-256-pierres-tombales-comptees', description: 'la borne locale ne compte que les pierres tombales COMPTÉES : 257 pierres tombales de A (moi) — au-delà de 256, A refuse d’ajouter une approbation', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)], Array.from({ length: 257 }, (_, i) => tomb(victim(`own-victim-${i}`, 1 + (i % 127), 8000 + i), A, T0 + 4000 + i, 3 + i))), msg(B, g.B)],
    expect: { effective: ['1:4211', '2:9054'], approvalsBlocked: true } },
  // ---- V3-4 : la pierre tombale posthume d'une clé ADMISE un jour (Q, approuvé par distraction sur A puis retiré aussitôt). En v4, un appareil
  // capturé ne la relaie plus (§ 6.4 : ledger(verified) de celui qui rejoint réduit à ses entrées ; quarantine d'un appareil à ancre étrangère).
  // Reste le relais d'un appareil EN RETARD qu'un serveur complice garde dans l'ignorance du retrait (Arb. 9 réécrit) : déni, jamais fuite.
  { name: 'S4-si-elles-arrivent-tout-le-groupe-vue-de-B', description: 'V3-4 (registre de la revue) : Q, approuvé par distraction sur A puis retiré, a signé ensuite des pierres tombales de A, B et C ; SI elles arrivent, elles comptent (Q a été admis) : tout le groupe est retiré. Le prix écrit de l’Arb. 9', local: LOCAL(B),
    messages: [msg('self', g.B), msg(A, [...g.A, appr(Q, A, T0 + 40, 4, 2)], [tomb(Q, A, T0 + 50, 5)]), msg(C, g.C),
      msg(C, [self(Q, T0 + 35), sponsorship(A, Q, T0 + 39, 2, 4)], [tomb(A, Q, T0 + 800, 3), tomb(B, Q, T0 + 801, 4), tomb(C, Q, T0 + 802, 5)])],
    expect: { effective: [], revokedSelf: true, sponsorsRevoked: ['1:4211'] } },
  { name: 'S4-par-un-serveur-complice-vue-de-A', description: 'V3-4, ce qui reste en v4 : un serveur complice remet la pierre tombale posthume de C signée par Q à B, qu’il a gardé dans l’ignorance du retrait de Q ; B la relaie à A : C tombe chez A (déni)', local: ROOT(A),
    messages: [msg('self', [...g.A, appr(Q, A, T0 + 40, 4, 2)], [tomb(Q, A, T0 + 50, 5)]), msg(B, g.B), msg(C, g.C),
      msg(B, [self(Q, T0 + 35), sponsorship(A, Q, T0 + 39, 2, 4)], [tomb(C, Q, T0 + 802, 3)])],
    expect: { effective: ['1:4211', '2:9054'] } },
  { name: 'S4-sans-relais-vue-de-A', description: 'V3-4, témoin : la même pierre tombale posthume n’atteint personne (aucun serveur complice ; l’appareil capturé ne la relaie pas) : C intact', local: ROOT(A),
    messages: [msg('self', [...g.A, appr(Q, A, T0 + 40, 4, 2)], [tomb(Q, A, T0 + 50, 5)]), msg(B, g.B), msg(C, g.C),
      msg(B, [self(Q, T0 + 35), sponsorship(A, Q, T0 + 39, 2, 4)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'] } },
  { name: 'course-du-voleur-qui-n-admet-pas-N-vue-de-N', description: 'N a rejoint P (course) puis A ; P n’a jamais approuvé N : chez N, aucune des deux ancres n’admet l’autre — A et P sont toutes deux ÉTRANGÈRES (l’écran dit « cet appareil a rejoint des appareils qui ne se connaissent pas ») ; N n’admet personne et ne relaie que ses entrées', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 3), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), self(P2, T0 + 310)]),
      msg(A, [...g.A, appr(N, A, T0 + 520, 4, 3), ...g.B, ...g.C])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1', '5:777', '9:909'], addedBy: { '1:4211': 'parrain', '5:777': 'parrain' }, foreignAnchors: ['1:4211', '5:777'] } },
  // ---- M1 : MA clé sous une autre place. Une COPIE n'est jamais effective et lève « clé copiée » ; elle compte dans les conflits ; « sauf MA CLÉ ».
  { name: 'M1-ma-cle-sous-une-autre-place-en-conflit-vue-de-N', description: 'M1 : P (ancre de N) approuve MA clé sous 41:1 et une autre clé sous 41:1 : conflit sur 41:1 (aucune des deux n’est effective), la copie lève « clé copiée », et je garde ma place (« sauf MA CLÉ » ; la v3 vidait l’état sans « retiré »)', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 2)]), msg(P, [self(P, T0 + 300), appr(ME_AT_41, P, T0 + 500, 2, 1), appr(XC, P, T0 + 501, 3, 1)])],
    expect: { effective: ['4:1', '5:777'], conflicts: ['41:1'], cloneGenerations: ['41:1'] } },
  { name: 'M1-ma-cle-sous-une-autre-place-seule-vue-de-N', description: 'M1 bis : MA clé sous 41:1, sans autre clé : jamais effective, « clé copiée »', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 2)]), msg(P, [self(P, T0 + 300), appr(ME_AT_41, P, T0 + 500, 2, 1)])],
    expect: { effective: ['4:1', '5:777'], cloneGenerations: ['41:1'] } },
  { name: 'M1-entree-signee-par-ma-cle-sous-une-autre-place', description: 'M1 ter : une approbation de Z dont l’auteur est « ma clé sous 41:1 », signée par ma clé : je ne l’ai pas écrite — ignorée, alerte « clé copiée »', local: LOCAL(N),
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 2)]), msg(P, [self(P, T0 + 300), appr(ME_AT_41, P, T0 + 500, 2, 1), appr(Z, ME_AT_41, T0 + 501, 2, 2)])],
    expect: { effective: ['4:1', '5:777'], cloneGenerations: ['41:1'], cloneAlerts: 1 } },
  { name: 'doublon-dans-mon-magasin-garde-la-plus-petite', description: 'la règle de doublon vaut pour MES entrées : une migration puis une comparaison m’ont fait écrire deux approbations de C (un appareil v4 n’écrit plus la seconde) ; la plus petite selon l’ordre total, la migrée, est gardée (F(C) = 0)', local: ROOT(A),
    messages: [msg('self', [self(A, T0), appr(C, A, T0 + 5, 2, undefined, 'migrated'), appr(C, A, T0 + 50, 3, 3)]), msg(C, [self(C, T0 + 1), appr(Y, C, T0 + 2, 2, 2)])],
    expect: { effective: ['1:4211', '3:15022', '12:1212'], storedApproval: { of: '3:15022', by: '1:4211', method: 'migrated', approvedAt: T0 + 5 } } },
  // ---- étoile : le retrait du parrain COMMUN. « Garder » déclenche sur l'appareil gardé une demande DIRIGÉE vers celui qui garde.
  { name: 'etoile-retrait-du-parrain-commun-vue-de-C', description: 'étoile : B et C ont rejoint A ; A est volé ; C le retire et garde B (reattested, même fromSeq)', local: LOCAL(C),
    messages: [msg('self', [...g.C, appr(B, C, T0 + 900, 4, 2, 'reattested')], [tomb(A, C, T0 + 899, 3)]), msg(A, g.A), msg(B, g.B)],
    expect: { effective: ['2:9054', '3:15022'], sponsorsRevoked: ['1:4211'] } },
  { name: 'etoile-avant-la-demande-dirigee-vue-de-B', description: 'étoile, vue de B : A est mort, B n’a plus d’ancre et C n’y compte pas — B est EN ATTENTE ; l’écran lui fait rejoindre C (demande dirigée)', local: LOCAL(B),
    messages: [msg('self', g.B), msg(C, [...g.C, appr(B, C, T0 + 900, 4, 2, 'reattested')], [tomb(A, C, T0 + 899, 3)]), msg(A, g.A)],
    expect: { effective: ['2:9054'], sponsorsRevoked: ['1:4211'] } },
  { name: 'etoile-apres-la-demande-dirigee-vue-de-B', description: 'étoile, vue de B : B a rejoint C (C l’approuvait déjà : il n’écrit rien de plus) ; B et C se comptent, A reste mort ; A n’est pas une ancre étrangère (C l’admet)', local: LOCAL(B),
    messages: [msg('self', [...g.B, sponsorship(C, B, T0 + 950, 3, 5)]), msg(C, [...g.C, appr(B, C, T0 + 900, 4, 2, 'reattested')], [tomb(A, C, T0 + 899, 3)]), msg(A, g.A)],
    expect: { effective: ['2:9054', '3:15022'], sponsorsRevoked: ['1:4211'], addedBy: { '3:15022': 'parrain' } } },
  // ---- le remplacement d'un téléphone : le texte littéral de la correction 3 (« il n'admet personne tant qu'un de ses parrains est retiré »)
  // interdirait d'admettre au téléphone NEUF ; l'ancre étrangère ne restreint que ce qu'une autre ancre vivante n'admet pas.
  { name: 'remplacement-de-telephone-vue-du-neuf', description: 'O (ancien téléphone, racine) avait retiré OO ; N2 et T ont rejoint O ; N2 retire O et garde T : O est un parrain RETIRÉ de N2, sans être une ancre étrangère — N2 admet', local: LOCAL(N2),
    messages: [msg('self', [self(N2, T0 + 500), sponsorship(O, N2, T0 + 510, 2, 3), appr(T, N2, T0 + 900, 4, 2, 'reattested')], [tomb(O, N2, T0 + 899, 3)]),
      msg(O, [self(O, T0 + 100), appr(N2, O, T0 + 511, 3, 2), appr(T, O, T0 + 611, 4, 2), self(T, T0 + 600), sponsorship(O, T, T0 + 610, 2, 4)], [tomb(OO, O, T0 + 200, 2)])],
    expect: { effective: ['10:1010', '17:1717'], sponsorsRevoked: ['15:1515'] } },
  { name: 'remplacement-de-telephone-vue-de-la-tablette', description: 'T (gardé par N2) a rejoint N2 par une demande dirigée : O, mort, est admis par N2 — ce n’est pas une ancre étrangère, T admet', local: LOCAL(T),
    messages: [msg('self', [self(T, T0 + 600), sponsorship(O, T, T0 + 610, 2, 4), sponsorship(N2, T, T0 + 950, 3, 5)]),
      msg(N2, [self(N2, T0 + 500), sponsorship(O, N2, T0 + 510, 2, 3), appr(T, N2, T0 + 900, 4, 2, 'reattested'), self(O, T0 + 100), appr(N2, O, T0 + 511, 3, 2), appr(T, O, T0 + 611, 4, 2)], [tomb(O, N2, T0 + 899, 3), tomb(OO, O, T0 + 200, 2)])],
    expect: { effective: ['10:1010', '17:1717'], sponsorsRevoked: ['15:1515'], addedBy: { '10:1010': 'parrain' } } },
  // ---- forme v4 : clé jumelle, scalaire s ≥ L (#19168)
  { name: 'cle-jumelle-refusee', description: 'une approbation de la JUMELLE de la clé de C (bit 0x80 de l’octet 32 levé), valablement signée par B : contenu refusé (forme) — une pierre tombale par clé laisserait vivre la jumelle d’une clé morte', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), msg(B, [...g.B, appr(twinOf(C), B, T0 + 20, 3, 2)])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'auteur-a-cle-jumelle-refuse', description: 'une approbation de C dont l’auteur est la JUMELLE de B, signée par la clé de B (libsignal la vérifie) : contenu refusé (forme)', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), msg(B, [...g.B, signedBy(B.identityKey, USER, approval(C, twinOf(B), T0 + 20, 3, 2))])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'signature-malleable-refusee', description: 'la même approbation de C par B, signature (R, s + L) : libsignal la vérifie, la forme la refuse (s ≥ L) — sans quoi une version plus stricte de libsignal accuserait un relais honnête', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), msg(B, [...g.B, malleate(appr(C, B, T0 + 20, 3, 2))])],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  // ---- JSON strict (correction 7) : `null`, clé en double, nombre non entier, signe ⇒ refus de forme du contenu entier
  { name: 'json-strict-accepte-le-contenu-sans-defaut', description: 'témoin : le clair brut de B, sans défaut, est accepté (C devient effectif)', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)])],
    expect: { effective: ['1:4211', '2:9054', '3:15022'] } },
  { name: 'json-null-refuse', description: '« "sponsor": null » ajouté par un relais (les octets signés n’en changent pas) : refus de forme ; un décodeur qui lit null comme absent l’aurait accepté', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [], (t) => once(t, '"method":"sas","seq":3', '"method":"sas","sponsor":null,"seq":3'))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-null-sur-fromSeq-d-une-migration-refuse', description: '« "fromSeq": null » sur une approbation migrated (où fromSeq est interdit) : refus de forme', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, undefined, 'migrated')], [], (t) => once(t, '"method":"migrated","seq":3', '"method":"migrated","seq":3,"fromSeq":null'))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-cle-en-double-refusee', description: '« "seq": 9 … "seq": 3 » dans la même entrée : refus de forme (un décodeur garde la dernière, un autre la première — qui accuserait B d’une signature fausse)', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [], (t) => once(t, '"method":"sas","seq":3', '"seq":9,"method":"sas","seq":3'))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-cle-en-double-au-niveau-du-contenu-refusee', description: 'deux clés « approvals » dans le même contenu : refus de forme', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [], (t) => once(t, '"approvals":[', '"approvals":[],"approvals":['))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-nombre-a-point-refuse', description: '« "approvedAt": 1790000000020.0 » : refus de forme (JSON.parse le lit entier, d’autres décodeurs non)', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [], (t) => once(t, `"approvedAt":${T0 + 20},`, `"approvedAt":${T0 + 20}.0,`))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-nombre-a-exposant-refuse', description: '« "seq": 3e0 » : refus de forme', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [], (t) => once(t, '"method":"sas","seq":3', '"method":"sas","seq":3e0'))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
  { name: 'json-nombre-signe-refuse', description: '« "revokedAt": -0 » (signé pour 0) : refus de forme — un nombre s’écrit 0 ou un chiffre non nul suivi de chiffres', local: ROOT(A),
    messages: [msg('self', [...g.A.slice(0, 2)]), raw(B, [...g.B, appr(C, B, T0 + 20, 3, 2)], [tomb(Z, B, 0, 4)], (t) => once(t, '"revokedAt":0,', '"revokedAt":-0,'))],
    expect: { effective: ['1:4211', '2:9054'], refusedContents: 1 } },
);
// ---------------------------------------------------------------- cas v5 (contre-relecture v4 : X1, X2, X4 ; vecteurs d'ÉMISSION, correction G)
// Chaque cas `emission` porte, en plus des attendus d'état, ce que l'appareil TRANSMET (§ 6.4 : `changed` ; et, si `joinerHead` est donné,
// le ledger(verified) qu'il enverrait en REJOIGNANT), s'il est CONFIRMÉ, s'il peut ADMETTRE (§ 4.8) et avec quelles générations il ne
// compare jamais (clé morte, correction D). Les registres sont ceux que la machine à états v5 produit (modèle de protocole, § 8).

export const R2 = OO, DD = T; // la racine qui a un enfant, et cet enfant (X2)
export const q5 = { self: self(Q, T0 + 35), sponsor: sponsorship(A, Q, T0 + 39, 2, 4), posthumousC: tomb(C, Q, T0 + 800, 3) };
export const x2 = {
  O: self(O, T0 + 50),
  R2: [self(R2, T0 + 100), appr(DD, R2, T0 + 150, 2, 2), sponsorship(O, R2, T0 + 300, 3, 2)],
  D: [self(DD, T0 + 140), sponsorship(R2, DD, T0 + 149, 2, 2)],
};
export const x1 = { N: [self(N, T0 + 400), sponsorship(A, N, T0 + 510, 2, 4)] };
export const x4 = {
  P: [self(P, T0 + 300), appr(P2, P, T0 + 320, 2, 2), tomb(A, P, T0 + 330, 3), tomb(B, P, T0 + 331, 4), tomb(C, P, T0 + 332, 5), appr(N, P, T0 + 411, 6, 2)],
  N: [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 6)],
};

caseDefs.push(
  // ---- quarantaine (Arb. 11) : ses entrées, et les pierres tombales d'auteurs VIVANTS ; ni l'approbation qu'un autre lui a remise, ni la
  // pierre tombale posthume d'une clé morte, ni la réserve.
  { name: 'emission-en-quarantaine-vue-de-N', description: 'G (émission) : N, capturé par P, a rejoint A ; P, que A n’admet pas, est une ancre étrangère : N ne transmet que ses entrées et les pierres tombales d’auteurs vivants chez lui (celle de B par P, celle de Q par A) — pas la pierre tombale posthume de C par Q (Q est mort chez N), ni les approbations de A ou de P, ni la réserve. Son ledger(verified) de celui qui rejoint (tête 2) ne portait que ses deux premières entrées', local: LOCAL(N),
    emission: { joinerHead: 2 },
    messages: [msg('self', [self(N, T0 + 400), sponsorship(P, N, T0 + 410, 2, 4), sponsorship(A, N, T0 + 510, 3, 4)]),
      msg(P, [...thief.P, appr(N, P, T0 + 411, 4, 2), ...thief.P2], [tomb(junkVictims[0], junkAuthors[0], T0 + 900, 1)]),
      msg(A, [...g.A, appr(Q, A, T0 + 40, 4, 2), appr(N, A, T0 + 520, 6, 3), ...g.B, ...g.C], [tomb(Q, A, T0 + 50, 5)]),
      msg(P, [q5.self, q5.sponsor], [q5.posthumousC])],
    expect: { effective: ['1:4211', '4:1', '5:777', '9:909'], addedBy: { '1:4211': 'parrain', '5:777': 'parrain', '9:909': '5:777' }, foreignAnchors: ['5:777'], reserved: 1,
      emission: { confirmed: true, mayAdmit: false, deadGenerations: ['2:9054', '3:15022', '6:801'],
        changed: ['A 4:1 par 4:1 #1', 'A 5:777 par 4:1 #2', 'A 1:4211 par 4:1 #3', 'T 6:801 par 1:4211 #5', 'T 2:9054 par 5:777 #3'],
        verifiedAsJoiner: ['A 4:1 par 4:1 #1', 'A 5:777 par 4:1 #2'] } } },
  // ---- celui qui REJOINT : son ledger(verified) ne porte que SES entrées à son geste (Arb. 11), son ledger(changed) tout ce qu'il retient.
  { name: 'emission-de-celui-qui-rejoint-vue-de-R2', description: 'G (émission) : R2, racine qui a un enfant D, rejoint O (« C’est le mien ») ; son ledger(verified) (tête 2) porte son inscription et son approbation de D, rien de ce qu’il tient de D ou de O ; hors quarantaine, son ledger(changed) porte tout ce qu’il retient. Tant que O ne l’a pas signé, R2 n’est pas CONFIRMÉ : il n’admet personne', local: ROOT(R2),
    emission: { joinerHead: 2 },
    messages: [msg('self', x2.R2), msg(DD, x2.D), msg(O, [x2.O])],
    expect: { effective: ['15:1515', '16:1616', '17:1717'], addedBy: { '15:1515': 'parrain', '17:1717': '16:1616' },
      emission: { confirmed: false, mayAdmit: false,
        changed: ['A 15:1515 par 15:1515 #1', 'A 16:1616 par 16:1616 #1', 'A 17:1717 par 17:1717 #1', 'A 16:1616 par 17:1717 #2', 'A 17:1717 par 16:1616 #2', 'A 15:1515 par 16:1616 #3'],
        verifiedAsJoiner: ['A 16:1616 par 16:1616 #1', 'A 17:1717 par 16:1616 #2'] } } },
  // ---- X1 : un membre qui vient de rejoindre A, que A n'a pas encore signé, n'est pas CONFIRMÉ et n'admet personne (correction B).
  { name: 'X1-membre-non-confirme-n-admet-pas-vue-de-N', description: 'X1 : N a rejoint A (parrainage signé) ; l’approbation de N par A n’est pas encore arrivée : N est membre, sans ancre étrangère, mais pas CONFIRMÉ — il n’admet personne (en v4 il admettait, et l’appareil suivant gardait N pour ancre étrangère)', local: LOCAL(N),
    emission: { joinerHead: 1 },
    messages: [msg('self', x1.N), msg(A, [...g.A, ...g.B, ...g.C])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], addedBy: { '1:4211': 'parrain' },
      emission: { confirmed: false, mayAdmit: false,
        changed: ['A 1:4211 par 1:4211 #1', 'A 2:9054 par 2:9054 #1', 'A 1:4211 par 2:9054 #2', 'A 2:9054 par 1:4211 #2', 'A 3:15022 par 3:15022 #1', 'A 1:4211 par 3:15022 #2', 'A 3:15022 par 1:4211 #3', 'A 4:1 par 4:1 #1', 'A 1:4211 par 4:1 #2'],
        verifiedAsJoiner: ['A 4:1 par 4:1 #1'] } } },
  { name: 'X1-membre-confirme-admet-vue-de-N', description: 'X1 : l’approbation de N signée par A est arrivée : N est CONFIRMÉ et admet ; celui qui le rejoindra recevra ce registre et n’y trouvera aucune ancre étrangère', local: LOCAL(N),
    emission: {},
    messages: [msg('self', x1.N), msg(A, [...g.A, appr(N, A, T0 + 520, 4, 2), ...g.B, ...g.C])],
    expect: { effective: ['1:4211', '2:9054', '3:15022', '4:1'], addedBy: { '1:4211': 'parrain' },
      emission: { confirmed: true, mayAdmit: true,
        changed: ['A 1:4211 par 1:4211 #1', 'A 2:9054 par 2:9054 #1', 'A 1:4211 par 2:9054 #2', 'A 2:9054 par 1:4211 #2', 'A 3:15022 par 3:15022 #1', 'A 1:4211 par 3:15022 #2', 'A 3:15022 par 1:4211 #3', 'A 4:1 par 4:1 #1', 'A 1:4211 par 4:1 #2', 'A 4:1 par 1:4211 #4'] } } },
  // ---- X2 : l'enfant D d'une racine R2 qui rejoint un appareil plus ancien O. Trois temps.
  { name: 'X2-l-enfant-d-une-racine-qui-rejoint-un-plus-ancien-vue-de-D', description: 'X2, avant que O signe R2 : chez D, R2 (sa racine) est une ancre ÉTRANGÈRE — O ne l’admet pas encore. D n’admet personne ; l’alerte attend un ledger-request resté 10 min sans la lever (correction C) ; en quarantaine, D ne transmet que ses entrées', local: LOCAL(DD),
    emission: {},
    messages: [msg('self', x2.D), msg(R2, [...x2.R2, x2.O])],
    expect: { effective: ['15:1515', '16:1616', '17:1717'], addedBy: { '15:1515': 'parrain', '16:1616': 'parrain' }, foreignAnchors: ['16:1616'],
      emission: { confirmed: false, mayAdmit: false, changed: ['A 17:1717 par 17:1717 #1', 'A 16:1616 par 17:1717 #2'] } } },
  { name: 'X2-l-approbation-de-la-racine-arrive-vue-de-D', description: 'X2 : l’approbation de R2 par O (fromSeq 3) est arrivée — par le R1 de R2 sur la fusion (correction A ; en v4, une fusion n’émettait rien et D restait en quarantaine). Plus d’ancre étrangère ; mais O n’admet pas D (son approbation par R2, de rang 2 < 3, est « à confirmer » chez O) : D n’est pas CONFIRMÉ, et l’écran le guide vers « Confirmer avec O »', local: LOCAL(DD),
    emission: {},
    messages: [msg('self', x2.D), msg(R2, [...x2.R2, x2.O, appr(R2, O, T0 + 400, 2, 3)])],
    expect: { effective: ['15:1515', '16:1616', '17:1717'], addedBy: { '15:1515': 'parrain', '16:1616': 'parrain' },
      emission: { confirmed: false, mayAdmit: false,
        changed: ['A 15:1515 par 15:1515 #1', 'A 16:1616 par 16:1616 #1', 'A 17:1717 par 17:1717 #1', 'A 16:1616 par 17:1717 #2', 'A 17:1717 par 16:1616 #2', 'A 15:1515 par 16:1616 #3', 'A 16:1616 par 15:1515 #2'] } } },
  { name: 'X2-l-enfant-confirme-avec-le-plus-ancien-vue-de-D', description: 'X2 : D a rejoint O (demande dirigée « Confirmer avec O ») ; O l’a signé : D est CONFIRMÉ et admet', local: LOCAL(DD),
    emission: {},
    messages: [msg('self', [...x2.D, sponsorship(O, DD, T0 + 500, 3, 3)]), msg(R2, [...x2.R2, x2.O, appr(R2, O, T0 + 400, 2, 3)]), msg(O, [appr(DD, O, T0 + 501, 3, 3)])],
    expect: { effective: ['15:1515', '16:1616', '17:1717'], addedBy: { '15:1515': 'parrain', '16:1616': 'parrain' },
      emission: { confirmed: true, mayAdmit: true,
        changed: ['A 15:1515 par 15:1515 #1', 'A 16:1616 par 16:1616 #1', 'A 17:1717 par 17:1717 #1', 'A 16:1616 par 17:1717 #2', 'A 17:1717 par 16:1616 #2', 'A 15:1515 par 16:1616 #3', 'A 16:1616 par 15:1515 #2', 'A 15:1515 par 17:1717 #3', 'A 17:1717 par 15:1515 #3'] } } },
  // ---- X4 : le voleur a tué d'avance A, B et C chez N : aucune comparaison avec eux (correction D).
  { name: 'X4-le-voleur-a-tue-mes-appareils-chez-N-vue-de-N', description: 'X4 : P (ancre de N) a posé des pierres tombales de A, B et C ; chez N, leurs clés sont mortes : N ne compare plus avec aucun d’eux (« Rejoindre » ne les propose pas, un accept sous leur clé est ignoré), et l’écran lui propose de se réinitialiser. N, capturé, reste confirmé par P et admet (la borne écrite de la course) — jamais une clé morte', local: LOCAL(N),
    emission: {},
    messages: [msg('self', x4.N), msg(P, [...x4.P, ...thief.P2])],
    expect: { effective: ['4:1', '5:777', '9:909'], addedBy: { '5:777': 'parrain', '9:909': '5:777' },
      emission: { confirmed: true, mayAdmit: true, deadGenerations: ['1:4211', '2:9054', '3:15022'],
        changed: ['A 5:777 par 5:777 #1', 'A 9:909 par 9:909 #1', 'A 5:777 par 9:909 #2', 'A 9:909 par 5:777 #2', 'A 4:1 par 4:1 #1', 'A 5:777 par 4:1 #2', 'A 4:1 par 5:777 #6', 'T 1:4211 par 5:777 #3', 'T 2:9054 par 5:777 #4', 'T 3:15022 par 5:777 #5'] } } },
);
