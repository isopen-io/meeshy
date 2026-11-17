// Les vecteurs du contrat du contenu chiffré (#18940) : `fixtures/e2ee-content/` et `fixtures/e2ee-signal/`.
//
// Les `canonicalJson` ci-dessous sont ÉCRITS À LA MAIN d'après ce que l'iPhone écrit
// (`E2EEContent.swift`, `E2EESignal.swift` : JSONEncoder `.sortedKeys` +
// `.withoutEscapingSlashes`) — un oracle indépendant de l'encodeur TS
// (`types/e2ee-content.ts`), que ce script n'importe pas. Il ne fait que les dériver
// mécaniquement (base64 standard, remplissage par espaces) et vérifie que chaque JSON
// écrit à la main décrit bien son objet. Le témoin `__tests__/e2ee-content.test.ts`
// refait ces dérivations de son côté.
//
// Usage : node packages/shared/scripts/generate-e2ee-content-vectors.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url));

const ALICE = '64f0c0ffee0000000000aaaa';
const BOB = '64f0c0ffee0000000000bbbb';
const CONV = '64f0c0ffee00000000000c01';
const OTHER_CONV = '64f0c0ffee00000000000c02';
const M1 = '64f0c0ffee00000000000f01';
const M2 = '64f0c0ffee00000000000f02';
const ATT = '64f0c0ffee00000000000a01';
const CID = 'cid_6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const T = 1790000000000;
const FROM_ALICE = { conversationId: CONV, senderUserId: ALICE, senderDeviceId: 3 };

const TIERS = [256, 1024, 4096, 16384];
const STEP = 16384;
const ceiling = (n) => Math.min(65536, Math.floor(524288 / Math.max(n, 1))) - 2048;
const paddedLength = (length, n) => {
  const c = ceiling(n);
  if (length > c) return length;
  const bucket = TIERS.find((t) => t >= length) ?? Math.ceil(length / STEP) * STEP;
  return Math.min(bucket, c);
};

const b64 = (buffer) => Buffer.from(buffer).toString('base64');
const utf8 = (text) => Buffer.from(text, 'utf8');
const pad = (bytes, n) => Buffer.concat([bytes, Buffer.alloc(paddedLength(bytes.length, n) - bytes.length, 0x20)]);

const AUTHOR = `"authorDeviceId":3,"authorUserId":"${ALICE}"`;

// --- remplissage : écrit à la main d'après E2EESignalTests.swift / E2eePaddingTest.kt, plus les bornes ---
const paddingLengths = [
  { length: 0, recipients: 1, padded: 256 },
  { length: 1, recipients: 1, padded: 256 },
  { length: 100, recipients: 0, padded: 256 },
  { length: 256, recipients: 1, padded: 256 },
  { length: 257, recipients: 1, padded: 1024 },
  { length: 1024, recipients: 3, padded: 1024 },
  { length: 3000, recipients: 1, padded: 4096 },
  { length: 5000, recipients: 1, padded: 16384 },
  { length: 16384, recipients: 1, padded: 16384 },
  { length: 16385, recipients: 1, padded: 32768 },
  { length: 16385, recipients: 2, padded: 32768 },
  { length: 20000, recipients: 2, padded: 32768 },
  { length: 33000, recipients: 2, padded: 49152 },
  { length: 49153, recipients: 1, padded: 63488 },
  { length: 50000, recipients: 2, padded: 63488 },
  { length: 60000, recipients: 2, padded: 63488 },
  { length: 63488, recipients: 2, padded: 63488 },
  { length: 63489, recipients: 2, padded: 63489 },
  { length: 70000, recipients: 2, padded: 70000 },
  { length: 4097, recipients: 9, padded: 16384 },
  { length: 16384, recipients: 9, padded: 16384 },
  { length: 5000, recipients: 32, padded: 14336 },
  { length: 14336, recipients: 32, padded: 14336 },
  { length: 14337, recipients: 32, padded: 14337 },
];
for (const row of paddingLengths) assert.equal(paddedLength(row.length, row.recipients), row.padded, JSON.stringify(row));
const ceilings = [
  { recipients: 1, ceiling: 63488 },
  { recipients: 2, ceiling: 63488 },
  { recipients: 8, ceiling: 63488 },
  { recipients: 9, ceiling: 56206 },
  { recipients: 32, ceiling: 14336 },
];
for (const row of ceilings) assert.equal(ceiling(row.recipients), row.ceiling, JSON.stringify(row));

// --- contenu : cas positifs (aller-retour) ---
const ESCAPES_TEXT = 'Il a dit "non" \\ puis / fin\nligne\ttab\u0001\u001f\b\f\u007f — 😀 你好 مرحبا é .';
const ESCAPES_JSON =
  String.raw`{"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","sentAt":1790000000000,"text":"Il a dit \"non\" \\ puis / fin\nligne\ttab\u0001\u001f\b\f` +
  '\u007f — 😀 你好 مرحبا é .' +
  '","v":1}';

const filler = (target) => {
  const head = `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"`;
  const tail = '","v":1}';
  const n = target - utf8(head).length - utf8(tail).length;
  return { text: 'a'.repeat(n), json: `${head}${'a'.repeat(n)}${tail}` };
};
const at256 = filler(256);
const at257 = filler(257);
const ACCENTS = 'é'.repeat(95);
const LONG = 'Meeshy chiffre de bout en bout. '.repeat(94);

const contentCases = [
  {
    name: 'ios-reference',
    description:
      "Le littéral des témoins E2EEContentTests.swift et E2eeContentTest.kt, signé de son auteur par le scelleur (E2EEMessageSealer.swift:81) : la forme exacte qu'écrit un iPhone.",
    object: { v: 1, text: 'Bonjour', language: 'fr', conversationId: 'c1', clientMessageId: 'cid_1', sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"clientMessageId":"cid_1","conversationId":"c1","language":"fr","sentAt":1790000000000,"text":"Bonjour","v":1}`,
    envelope: { conversationId: 'c1', senderUserId: ALICE, senderDeviceId: 3 },
    recipients: 1,
  },
  {
    name: 'reply-with-every-field',
    description: 'Les neuf clés de la version 1 : la citation (id serveur), la langue et l’identifiant client voyagent DANS le chiffré.',
    object: { v: 1, text: 'Oui, à 18 h !', language: 'fr', replyTo: M1, conversationId: CONV, clientMessageId: CID, sentAt: 1790000123456, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"clientMessageId":"${CID}","conversationId":"${CONV}","language":"fr","replyTo":"${M1}","sentAt":1790000123456,"text":"Oui, à 18 h !","v":1}`,
    envelope: FROM_ALICE,
    recipients: 2,
  },
  {
    name: 'text-escapes-and-unicode',
    description:
      'Échappements de JSONEncoder (.withoutEscapingSlashes) : \\" \\\\ \\n \\t \\b \\f, les autres contrôles en \\u00xx MINUSCULES ; la barre oblique, DEL, U+2028, l’emoji hors BMP, le chinois et l’arabe partent BRUTS en UTF-8.',
    object: { v: 1, text: ESCAPES_TEXT, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: ESCAPES_JSON,
    envelope: FROM_ALICE,
    recipients: 2,
  },
  {
    name: 'without-text',
    description: 'Aucun texte : la clé est OMISE (bulle vide chez iOS), jamais écrite à null.',
    object: { v: 1, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"v":1}`,
    envelope: FROM_ALICE,
    recipients: 1,
  },
  {
    name: 'empty-text-is-written',
    description: 'Un texte vide n’est pas un texte absent : la clé s’écrit.',
    object: { v: 1, text: '', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"","v":1}`,
    envelope: FROM_ALICE,
    recipients: 1,
  },
  {
    name: 'exactly-256-bytes',
    description: 'Un JSON canonique de 256 octets exactement tient dans le premier palier : aucun espace ajouté.',
    object: { v: 1, text: at256.text, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: at256.json,
    envelope: FROM_ALICE,
    recipients: 1,
  },
  {
    name: 'one-byte-past-256',
    description: '257 octets passent au palier suivant (1 024).',
    object: { v: 1, text: at257.text, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: at257.json,
    envelope: FROM_ALICE,
    recipients: 1,
  },
  {
    name: 'padding-counts-utf8-bytes',
    description: 'Le palier se choisit sur les OCTETS UTF-8, jamais sur les caractères : quatre-vingt-quinze « é » font cent quatre-vingt-dix octets, et ce JSON de 256 caractères en pèse 351.',
    object: { v: 1, text: ACCENTS, language: 'fr', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","language":"fr","sentAt":${T},"text":"${ACCENTS}","v":1}`,
    envelope: FROM_ALICE,
    recipients: 3,
  },
  {
    name: 'long-text-4096-tier',
    description: 'Un texte de quelque 3 000 octets se remplit au palier de 4 096.',
    object: { v: 1, text: LONG, language: 'fr', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","language":"fr","sentAt":${T},"text":"${LONG}","v":1}`,
    envelope: FROM_ALICE,
    recipients: 2,
  },
];

// --- contenu : verdicts (lecture seule) ---
const contentVerdicts = [
  {
    name: 'future-version-same-shape',
    description: 'Une version que cet appareil ne lit pas : verdict « version future », jamais « illisible » — le clair se garde pour être relu après la mise à jour (#9223).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x","v":2}`, recipients: 1 },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'future-version',
    version: 2,
  },
  {
    name: 'future-version-new-shape',
    description: 'La version se lit AVANT toute autre clé : une version future qui change la forme reste une version future.',
    plaintext: { text: `{"body":{"text":"x"},"conversationId":"${CONV}","v":3}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'future-version',
    version: 3,
  },
  {
    name: 'future-version-is-kept-before-binding',
    description: 'Une version future se garde telle quelle : sa conversation et son auteur se confrontent quand une version qui la lit l’ouvrira.',
    plaintext: { text: `{"conversationId":"${OTHER_CONV}","sentAt":${T},"v":2}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'future-version',
    version: 2,
  },
  {
    name: 'future-version-padding-then-newline',
    description: 'Le remplissage suivi d’un blanc JSON qui n’est pas une espace (ici `\\n`) : le JSON reste valide (JSONDecoder admet tout blanc JSON en fin), la version future se garde, et son JSON gardé est le clair privé de TOUS ses blancs de fin, par un parcours linéaire (WEBX-06 : l’expression `/ +$/` était quadratique sur ce cas, 0,8 s pour 48 Ko).',
    plaintext: { text: `{"conversationId":"${CONV}","sentAt":${T},"text":"x","v":2}`, recipients: 1, tail: '\n' },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'future-version',
    version: 2,
  },
  {
    name: 'padding-then-newline-still-reads',
    description: 'Un contenu v1 dont le remplissage est suivi d’un `\\n` se lit comme sur l’iPhone : un blanc JSON en fin ne rend rien illisible.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}`, recipients: 1, tail: '\r\n\t' },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 'lone-high-surrogate-escape',
    description: 'Une demi-paire de substitution échappée (`\\ud800` sans sa seconde moitié) ne forme aucun point de code : l’encodeur refuse de l’écrire, le lecteur la juge illisible — jamais un texte à demi-paire (WEBX-06).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"a\\ud800b","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'lone-low-surrogate-escape',
    description: 'Une seconde moitié seule (`\\udc00`) n’est pas davantage un point de code.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"\\udc00","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'reversed-surrogate-escapes',
    description: 'Deux moitiés dans le mauvais ordre (`\\ude00\\ud83d`) sont deux demi-paires isolées.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"\\ude00\\ud83d","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'lone-surrogate-in-an-ignored-key',
    description: 'Une demi-paire est refusée où qu’elle soit, même sous une clé que la version 1 ignore : le clair n’est pas un JSON qu’un appareil lit (voir README : l’iPhone sous iOS 17 et plus ne la verrait pas).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","note":"\\ud800","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'escaped-surrogate-pair-reads',
    description: 'Une paire ÉCHAPPÉE complète (`\\ud83d\\ude00`) est un point de code : elle se lit, comme l’emoji brut.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"\\ud83d\\ude00","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: '😀', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 'surrogate-encoded-in-utf8',
    description: 'Une demi-paire encodée en octets (`ED A0 80`) n’est pas de l’UTF-8 : illisible, sans caractère de remplacement.',
    plaintext: {
      bytes: Buffer.concat([utf8(`{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"`), Buffer.from([0xed, 0xa0, 0x80]), utf8('","v":1}')]),
    },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'missing-version',
    description: 'Un objet sans `v` n’est pas un contenu.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x"}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'version-zero',
    description: 'Aucune version ne précède la 1 : 0 est illisible, pas futur.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x","v":0}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'version-as-string',
    description: 'La version est un entier JSON ; "1" est illisible (JSONDecoder, Int).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x","v":"1"}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'version-fractional',
    description: '1.5 n’est pas une version.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"x","v":1.5}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'truncated-json',
    description: 'Un JSON tronqué est illisible, et la sonde le range parmi les messages (E2EEPayloadKind).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":17900` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'not-json',
    description: 'Un clair qui n’est pas du JSON est un message illisible.',
    plaintext: { text: 'not json' },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'json-array',
    description: 'Le contenu est un objet JSON, jamais un tableau.',
    plaintext: { text: '[{"v":1}]' },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'invalid-utf8',
    description: 'Un clair qui n’est pas de l’UTF-8 valide est illisible (JSONDecoder le refuse ; aucun caractère de remplacement).',
    plaintext: {
      bytes: Buffer.concat([utf8(`{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":"`), Buffer.from([0xc3, 0x28]), utf8('","v":1}')]),
    },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'sent-at-missing',
    description: '`sentAt` est requis (Int64).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'sent-at-as-string',
    description: 'Un nombre entre guillemets n’est pas un nombre.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":"1790000000000","text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'sent-at-fractional',
    description: '`sentAt` est un entier de millisecondes.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":1790000000000.5,"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'text-not-a-string',
    description: 'Une clé connue du mauvais type rend le contenu illisible (pas de coercition).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","sentAt":${T},"text":42,"v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'reply-to-object',
    description: '`replyTo` est l’identifiant serveur du message cité, une chaîne ; un objet est illisible.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","replyTo":{"id":"${M1}"},"sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'author-device-negative',
    description: '`authorDeviceId` est un UInt32 (0…4 294 967 295).',
    plaintext: { text: `{"authorDeviceId":-1,"authorUserId":"${ALICE}","conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'author-device-beyond-uint32',
    description: '4 294 967 296 dépasse un UInt32.',
    plaintext: { text: `{"authorDeviceId":4294967296,"authorUserId":"${ALICE}","conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'null-is-absent',
    description: 'Une clé facultative à null se lit absente (decodeIfPresent).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","language":null,"replyTo":null,"sentAt":${T},"text":"x","v":1}`, recipients: 1 },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 'unknown-keys-are-ignored',
    description: 'Une clé qu’une version 1 ne connaît pas (mentions, pièces d’un lot ultérieur) est ignorée, pas refusée.',
    plaintext: { text: `{"attachments":[{"id":"${ATT}"}],${AUTHOR},"conversationId":"${CONV}","mentions":["${BOB}"],"sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 'author-absent-legacy',
    description:
      'Ni authorUserId ni authorDeviceId : un client antérieur à #12976. iOS et Android l’admettent aujourd’hui (IOS-20) ; le verdict le distingue pour qu’on puisse le refuser à usage nul sans changer de forme.',
    plaintext: { text: `{"conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}`, recipients: 1 },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted-unauthored',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T },
  },
  {
    name: 'author-partial-user-only',
    description: 'Un auteur à moitié n’est l’auteur de personne.',
    plaintext: { text: `{"authorUserId":"${ALICE}","conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-author',
  },
  {
    name: 'author-partial-device-only',
    description: 'Un auteur à moitié n’est l’auteur de personne.',
    plaintext: { text: `{"authorDeviceId":3,"conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-author',
  },
  {
    name: 'author-other-device',
    description: 'Le serveur présente sous l’appareil 3 un contenu signé par l’appareil 4.',
    plaintext: { text: `{"authorDeviceId":4,"authorUserId":"${ALICE}","conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-author',
  },
  {
    name: 'author-other-user',
    description: 'Le serveur réétiquette sous Alice un contenu signé par Bob.',
    plaintext: { text: `{"authorDeviceId":3,"authorUserId":"${BOB}","conversationId":"${CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-author',
  },
  {
    name: 'conversation-foreign',
    description: 'Le serveur range dans une conversation un contenu écrit pour une autre.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${OTHER_CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-conversation',
  },
  {
    name: 'conversation-absent',
    description: 'Un contenu qui ne nomme pas sa conversation ne se range nulle part.',
    plaintext: { text: `{${AUTHOR},"sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-conversation',
  },
  {
    name: 'conversation-checked-before-author',
    description: 'L’ordre des refus : la conversation d’abord, l’auteur ensuite (E2EEEnvelopeOpener.swift:144-147).',
    plaintext: { text: `{"authorDeviceId":9,"authorUserId":"${BOB}","conversationId":"${OTHER_CONV}","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'misattributed-conversation',
  },
  {
    name: 's-not-an-integer-is-a-message',
    description: 'La sonde ne classe signal que si `s` est un ENTIER JSON (E2EESignal.swift:211-217) ; "1" laisse un message, dont la clé `s` est ignorée.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","s":"1","sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 's-null-is-a-message',
    description: '`s` à null n’est pas une version de signal.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","s":null,"sentAt":${T},"text":"x","v":1}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'admitted',
    expected: { v: 1, text: 'x', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
];

// --- signaux : cas positifs ---
const S = (fields) => fields; // lisibilité
const signalCases = [
  {
    name: 'reaction',
    object: S({ s: 1, kind: 'reaction', target: M1, emoji: '👍', removed: false, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","emoji":"👍","kind":"reaction","removed":false,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'reaction-removed',
    object: S({ s: 1, kind: 'reaction', target: M1, emoji: '❤️', removed: true, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","emoji":"❤️","kind":"reaction","removed":true,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'typing-on',
    object: S({ s: 1, kind: 'typing', active: true, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{"active":true,${AUTHOR},"conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}`,
  },
  {
    name: 'typing-off',
    object: S({ s: 1, kind: 'typing', active: false, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{"active":false,${AUTHOR},"conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}`,
  },
  {
    name: 'receipt-read',
    object: S({ s: 1, kind: 'receipt', receipt: 'read', targets: [M1, M2], conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"receipt","receipt":"read","s":1,"sentAt":${T},"targets":["${M1}","${M2}"]}`,
  },
  {
    name: 'receipt-delivered',
    object: S({ s: 1, kind: 'receipt', receipt: 'delivered', targets: [M1], conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"receipt","receipt":"delivered","s":1,"sentAt":${T},"targets":["${M1}"]}`,
  },
  {
    name: 'read-progress-of-an-attachment',
    object: S({ s: 1, kind: 'read-progress', target: M1, attachmentId: ATT, position: 12.5, completed: false, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{"attachmentId":"${ATT}",${AUTHOR},"completed":false,"conversationId":"${CONV}","kind":"read-progress","position":12.5,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'read-progress-integral-position',
    description: 'Une position entière s’écrit sans « .0 » (JSONEncoder ôte le suffixe d’un Double entier).',
    object: S({ s: 1, kind: 'read-progress', target: M1, position: 30, completed: true, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"completed":true,"conversationId":"${CONV}","kind":"read-progress","position":30,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'edit-with-language',
    object: S({ s: 1, kind: 'edit', target: M1, text: 'corrigé', language: 'fr', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"edit","language":"fr","s":1,"sentAt":${T},"target":"${M1}","text":"corrigé"}`,
  },
  {
    name: 'edit-without-language',
    object: S({ s: 1, kind: 'edit', target: M1, text: 'fixed / done', conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"edit","s":1,"sentAt":${T},"target":"${M1}","text":"fixed / done"}`,
  },
  {
    name: 'delete-for-everyone',
    object: S({ s: 1, kind: 'delete-for-everyone', target: M1, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"delete-for-everyone","s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'view-once-opened',
    object: S({ s: 1, kind: 'view-once-opened', target: M1, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"view-once-opened","s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'pin',
    object: S({ s: 1, kind: 'pin', target: M1, pinned: true, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"pin","pinned":true,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
  {
    name: 'unpin',
    object: S({ s: 1, kind: 'pin', target: M1, pinned: false, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 }),
    canonicalJson: `{${AUTHOR},"conversationId":"${CONV}","kind":"pin","pinned":false,"s":1,"sentAt":${T},"target":"${M1}"}`,
  },
].map((c, i) => ({ description: c.description ?? `Le signal « ${c.object.kind} », signé de son auteur.`, ...c, envelope: FROM_ALICE, recipients: [1, 2, 3][i % 3] }));

const TYPING = `"active":true,${AUTHOR},"conversationId":"${CONV}","kind":"typing"`;
const signalVerdicts = [
  {
    name: 'unknown-kind',
    description: 'Une action d’une version ultérieure : reconnue comme signal, rangée, jamais appliquée à moitié (E2EESignalAction.unknown).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","kind":"poll-vote","option":2,"s":1,"sentAt":${T}}`, recipients: 1 },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'admitted-unknown-kind',
    kind: 'poll-vote',
  },
  {
    name: 'unknown-kind-foreign-conversation',
    description: 'Une action inconnue reste confrontée à sa conversation et à son auteur.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${OTHER_CONV}","kind":"poll-vote","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'misattributed-conversation',
  },
  {
    name: 'future-version-same-shape',
    description: 'Un signal d’une version future : verdict « version future », gardé pour être relu après la mise à jour.',
    plaintext: { text: `{${TYPING},"s":2,"sentAt":${T}}`, recipients: 2 },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'future-version',
    version: 2,
  },
  {
    name: 'future-version-new-shape',
    description: 'La version `s` se lit avant toute autre clé.',
    plaintext: { text: '{"op":"x","s":3}' },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'future-version',
    version: 3,
  },
  {
    name: 'future-version-padding-then-newline',
    description: 'Un signal d’une version future dont le remplissage est suivi d’un `\\n` : gardé, son JSON privé de tous ses blancs de fin, en temps linéaire (WEBX-06).',
    plaintext: { text: `{${TYPING},"s":2,"sentAt":${T}}`, recipients: 2, tail: '\n' },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'future-version',
    version: 2,
  },
  {
    name: 'lone-surrogate-escape-is-an-unreadable-message',
    description: 'Une réaction dont l’emoji est une demi-paire échappée n’est pas un JSON qu’un appareil lit : comme tout JSON illisible, la sonde la range parmi les messages, illisible (voir README : sous iOS 17 et plus, l’iPhone la classe signal avant de la juger illisible).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","emoji":"\\ud83d","kind":"reaction","removed":false,"s":1,"sentAt":${T},"target":"${M1}"}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'version-zero',
    description: '`s` vaut 0 : un signal (entier), mais d’aucune version.',
    plaintext: { text: `{${TYPING},"s":0,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'version-fractional-is-a-message',
    description: '`s` vaut 1.5 : la sonde le range parmi les messages, et il n’a pas de `v` — illisible.',
    plaintext: { text: `{${TYPING},"s":1.5,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'author-absent',
    description: 'Un signal sans auteur n’est celui de personne (pas de version antérieure sans auteur).',
    plaintext: { text: `{"active":true,"conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'misattributed-author',
  },
  {
    name: 'author-partial',
    description: 'Un auteur à moitié n’est l’auteur de personne.',
    plaintext: { text: `{"active":true,"authorUserId":"${ALICE}","conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'misattributed-author',
  },
  {
    name: 'author-other-device',
    description: 'Le serveur présente sous l’appareil 3 un signal signé par l’appareil 4.',
    plaintext: { text: `{"active":true,"authorDeviceId":4,"authorUserId":"${ALICE}","conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'misattributed-author',
  },
  {
    name: 'conversation-foreign',
    description: 'Un signal écrit pour une autre conversation.',
    plaintext: { text: `{"active":true,${AUTHOR},"conversationId":"${OTHER_CONV}","kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'misattributed-conversation',
  },
  {
    name: 'conversation-missing',
    description: 'La conversation est REQUISE dans un signal (E2EESignal.swift:106) : sans elle, illisible.',
    plaintext: { text: `{"active":true,${AUTHOR},"kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'sent-at-missing',
    description: '`sentAt` est requis.',
    plaintext: { text: `{${TYPING},"s":1}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'kind-missing',
    description: '`kind` est requis.',
    plaintext: { text: `{"active":true,${AUTHOR},"conversationId":"${CONV}","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'reaction-missing-emoji',
    description: 'Une action connue à laquelle il manque une clé requise est illisible.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","kind":"reaction","removed":false,"s":1,"sentAt":${T},"target":"${M1}"}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'receipt-unknown-value',
    description: '`receipt` vaut "delivered" ou "read" (E2EEReceiptKind).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","kind":"receipt","receipt":"seen","s":1,"sentAt":${T},"targets":["${M1}"]}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'typing-active-not-a-boolean',
    description: 'Aucune coercition : "yes" n’est pas un booléen.',
    plaintext: { text: `{"active":"yes",${AUTHOR},"conversationId":"${CONV}","kind":"typing","s":1,"sentAt":${T}}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'read-progress-position-as-string',
    description: '`position` est un nombre JSON.',
    plaintext: { text: `{${AUTHOR},"completed":false,"conversationId":"${CONV}","kind":"read-progress","position":"12.5","s":1,"sentAt":${T},"target":"${M1}"}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'targets-not-strings',
    description: '`targets` est un tableau d’identifiants serveur (chaînes).',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","kind":"receipt","receipt":"read","s":1,"sentAt":${T},"targets":[1]}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'unreadable',
  },
  {
    name: 'truncated-json',
    description: 'Un signal tronqué : la sonde ne lit rien, le range parmi les messages, illisible.',
    plaintext: { text: `{"active":true,${AUTHOR},"conversationId":"${CONV}","kind":"typ` },
    envelope: FROM_ALICE,
    payload: 'message',
    verdict: 'unreadable',
  },
  {
    name: 'null-optional-is-absent',
    description: 'Une clé facultative à null se lit absente.',
    plaintext: { text: `{"attachmentId":null,${AUTHOR},"completed":true,"conversationId":"${CONV}","kind":"read-progress","position":3,"s":1,"sentAt":${T},"target":"${M1}"}`, recipients: 1 },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'admitted',
    expected: { s: 1, kind: 'read-progress', target: M1, position: 3, completed: true, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
  {
    name: 'unknown-keys-are-ignored',
    description: 'Une clé inconnue à côté d’une action connue est ignorée.',
    plaintext: { text: `{${AUTHOR},"conversationId":"${CONV}","emoji":"🙈","extra":true,"kind":"reaction","removed":false,"s":1,"sentAt":${T},"target":"${M1}"}` },
    envelope: FROM_ALICE,
    payload: 'signal',
    verdict: 'admitted',
    expected: { s: 1, kind: 'reaction', target: M1, emoji: '🙈', removed: false, conversationId: CONV, sentAt: T, authorUserId: ALICE, authorDeviceId: 3 },
  },
];

// --- dérivations mécaniques + vérifications ---
const derive = (c) => {
  assert.deepStrictEqual(JSON.parse(c.canonicalJson), c.object, `${c.name}: le JSON écrit à la main ne décrit pas l'objet`);
  const bytes = utf8(c.canonicalJson);
  const padded = pad(bytes, c.recipients);
  return {
    name: c.name,
    description: c.description,
    object: c.object,
    canonicalJson: c.canonicalJson,
    canonicalBase64: b64(bytes),
    canonicalLength: bytes.length,
    envelope: c.envelope,
    padded: { recipients: c.recipients, length: padded.length, base64: b64(padded) },
  };
};

const deriveVerdict = (c) => {
  const bytes = c.plaintext.bytes ?? utf8(c.plaintext.text);
  const padded = c.plaintext.recipients ? pad(bytes, c.plaintext.recipients) : bytes;
  const plaintext = c.plaintext.tail ? Buffer.concat([padded, utf8(c.plaintext.tail)]) : padded;
  const out = {
    name: c.name,
    description: c.description,
    plaintextBase64: b64(plaintext),
    ...(c.plaintext.text !== undefined ? { plaintextJson: c.plaintext.text } : {}),
    envelope: c.envelope,
    payload: c.payload,
    verdict: c.verdict,
  };
  if (c.version !== undefined) out.version = c.version;
  if (c.kind !== undefined) out.kind = c.kind;
  if (c.expected !== undefined) out.expected = c.expected;
  return out;
};

const contentDir = join(root, 'fixtures', 'e2ee-content');
const signalDir = join(root, 'fixtures', 'e2ee-signal');
mkdirSync(contentDir, { recursive: true });
mkdirSync(signalDir, { recursive: true });

const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

write(join(contentDir, 'padding.vectors.json'), {
  _doc: 'Le remplissage du clair AVANT libsignal (#13142, #18940) : espaces 0x20 après le JSON jusqu’au palier, sur les OCTETS UTF-8. Voir README.md.',
  contract: 'meeshy-e2ee-padding',
  tiers: TIERS,
  step: STEP,
  maxEnvelopeBytes: 65536,
  maxTotalBytes: 524288,
  cipherOverhead: 2048,
  byte: 32,
  ceilings,
  lengths: paddingLengths,
});

write(join(contentDir, 'content.vectors.json'), {
  _doc: 'Le contenu chiffré d’un message, E2EEContent v1 (#18940). Voir README.md : objet, octets canoniques, clair rempli, et verdicts de lecture.',
  contract: 'meeshy-e2ee-content',
  version: 1,
  cases: contentCases.map(derive),
  verdicts: contentVerdicts.map(deriveVerdict),
});

write(join(signalDir, 'signal.vectors.json'), {
  _doc: 'Le signal chiffré d’une conversation e2ee, E2EESignal v1 (#13142, #18940). Voir ../e2ee-content/README.md.',
  contract: 'meeshy-e2ee-signal',
  version: 1,
  cases: signalCases.map(derive),
  verdicts: signalVerdicts.map(deriveVerdict),
});

console.log(
  contentCases.map((c) => `${c.name}: ${utf8(c.canonicalJson).length} o -> ${paddedLength(utf8(c.canonicalJson).length, c.recipients)} (n=${c.recipients}, js length ${c.canonicalJson.length})`).join('\n'),
);
console.log(signalCases.map((c) => `${c.name}: ${utf8(c.canonicalJson).length} o (n=${c.recipients})`).join('\n'));
