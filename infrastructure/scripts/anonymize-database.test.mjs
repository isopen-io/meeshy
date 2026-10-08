// Témoins du script d'anonymisation (#9663), sur une base MongoDB JETABLE.
//
// Lancer depuis la racine du dépôt :
//   node --import tsx --test infrastructure/scripts/anonymize-database.test.mjs
//
// La base : `MEESHY_TEST_MONGO_URI` si fournie, sinon un `mongod` lancé par le
// témoin (binaire `MEESHY_TEST_MONGOD`, ou celui du cache de mongodb-memory-server
// `~/.cache/mongodb-binaries/mongod-*`), sinon un conteneur jetable `mongo:8`.
// Toutes les données sont SYNTHÉTIQUES (domaine `.test`, plages privées).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from './anonymize-database.mjs';
import { assertNotProduction, ProductionGuardError } from './anonymize-database/guard.mjs';
import { anonymizeDatabase, newContext, passwordHasher, passwordIssuer } from './anonymize-database/run.mjs';
import { verifyDatabase } from './anonymize-database/verify.mjs';
import { neutralizeMedia } from './anonymize-database/media.mjs';
import { INVENTORY, NESTED_COVERAGE, SECRET_EXEMPTIONS } from './anonymize-database/inventory.mjs';
import { loadBcrypt, loadMongo } from './anonymize-database/deps.mjs';
import * as s from './anonymize-database/synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const script = path.join(here, 'anonymize-database.mjs');
const TEST_ENV = { MEESHY_ENV: 'test' };

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

function cachedMongod() {
  if (process.env.MEESHY_TEST_MONGOD) return process.env.MEESHY_TEST_MONGOD;
  const dir = path.join(homedir(), '.cache', 'mongodb-binaries');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((f) => /^mongod-[a-z0-9_-]+-\d+\.\d+\.\d+$/.test(f)).sort().pop();
  return found ? path.join(dir, found) : null;
}

async function startMongo() {
  if (process.env.MEESHY_TEST_MONGO_URI) return { uri: process.env.MEESHY_TEST_MONGO_URI, stop: async () => {} };
  const port = await freePort();
  const binary = cachedMongod();
  if (binary) {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'anon-mongo-'));
    const child = spawn(binary, ['--dbpath', dbpath, '--port', String(port), '--bind_ip', '127.0.0.1', '--wiredTigerCacheSizeGB', '0.25', '--quiet'], { stdio: 'ignore' });
    child.once('error', (error) => { throw error; });
    return { uri: `mongodb://127.0.0.1:${port}`, stop: async () => { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); rmSync(dbpath, { recursive: true, force: true }); } };
  }
  const run = spawnSync('docker', ['run', '-d', '--rm', '-p', `127.0.0.1:${port}:27017`, 'mongo:8'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error('Aucune base de test : ni MEESHY_TEST_MONGO_URI, ni binaire mongod en cache, ni docker.');
  const id = run.stdout.trim();
  return { uri: `mongodb://127.0.0.1:${port}`, stop: async () => { spawnSync('docker', ['rm', '-f', id]); } };
}

let mongo;
let client;
let bcrypt;
let ObjectId;
let Binary;

before(async () => {
  const driver = await loadMongo();
  ({ ObjectId, Binary } = driver);
  bcrypt = await loadBcrypt();
  mongo = await startMongo();
  client = new driver.MongoClient(mongo.uri, { serverSelectionTimeoutMS: 2_000 });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.connect();
      break;
    } catch (error) {
      if (attempt > 40) throw error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
});

after(async () => {
  await client?.close();
  await mongo?.stop();
});

const KEPT_PASSWORD = 'Recette#2026';
const USER_PASSWORD = 'MotDePasse!1';

async function seed(db) {
  const ids = Object.fromEntries(['jeanne', 'recette', 'lien', 'link', 'group', 'global', 'pA', 'pAnon', 'msg', 'msgE2ee', 'att', 'post', 'contact'].map((k) => [k, new ObjectId()]));
  await Promise.all([
    db.collection('User').createIndex({ username: 1 }, { unique: true }),
    db.collection('User').createIndex({ email: 1 }, { unique: true }),
    db.collection('UserContact').createIndex({ ownerId: 1, contactKey: 1 }, { unique: true }),
    db.collection('UserSession').createIndex({ sessionToken: 1 }, { unique: true }),
    db.collection('Conversation').createIndex({ identifier: 1 }, { unique: true }),
    db.collection('AnonymousPostOpen').createIndex({ postId: 1, sessionKey: 1 }, { unique: true }),
    db.collection('account_deletion_requests').createIndex({ confirmTokenHash: 1 }, { unique: true }),
  ]);
  const base = { isActive: true, systemLanguage: 'fr', role: 'USER', createdAt: new Date('2026-01-02T08:00:00Z') };
  await db.collection('User').insertMany([
    {
      _id: ids.jeanne, ...base, username: 'jeanne.essai', firstName: 'Jeanne', lastName: 'Essai', displayName: 'Jeanne E.',
      bio: 'Je vis à Lyon et j’adore le vélo', email: 'jeanne.essai@real-mail.test', phoneNumber: '+33612345678', phoneCountryCode: 'FR',
      birthDate: new Date('1990-05-04T00:00:00Z'), avatar: 'https://cdn.real.test/jeanne.jpg', banner: 'attachments/2026/01/banner.jpg',
      lastLoginIp: '10.20.30.40', lastLoginLocation: 'Lyon, France', lastLoginDevice: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
      registrationIp: '10.20.30.41', registrationLocation: 'Lyon, France', registrationDevice: 'Mozilla/5.0 (Macintosh)',
      twoFactorSecret: 'JBSWY3DPEHPK3PXP', twoFactorBackupCodes: ['h1', 'h2'], pendingEmail: 'nouvelle@real-mail.test',
      usernameHistory: [{ newUsername: 'jeanne', ipAddress: '10.0.0.9' }], searchTokens: ['je', 'jea'],
      password: await bcrypt.hash(USER_PASSWORD, 4),
    },
    {
      _id: ids.recette, ...base, username: 'recette.ios', firstName: 'Paul', lastName: 'Recette', displayName: null,
      bio: '', email: 'recette@real-mail.test', phoneNumber: '+33698765432', twoFactorEnabledAt: new Date(), twoFactorSecret: 'KRSXG5CTMVRXEZLU',
      password: await bcrypt.hash(KEPT_PASSWORD, 4),
    },
    { _id: ids.lien, ...base, username: 'lien.magique', firstName: 'Lou', lastName: 'Lien', bio: '', email: 'lien@real-mail.test', password: null },
  ]);
  await db.collection('UserContact').insertOne({
    _id: ids.contact, ownerId: ids.jeanne, contactKey: 'f'.repeat(64), displayName: 'Paul du bureau',
    phoneNumbers: ['+33698765432', '+33700000001'], emails: ['recette@real-mail.test', 'ami@real-mail.test'],
    usernames: ['recette.ios', 'inconnu'], matchedUserId: ids.recette, matchedBy: 'phone',
  });
  await db.collection('Conversation').insertMany([
    { _id: ids.group, identifier: 'mshy_famille-essai', type: 'group', title: 'Famille Essai', description: 'Le groupe de la famille', avatar: 'attachments/g.jpg', serverEncryptionKeyId: 'key-1' },
    { _id: ids.global, identifier: 'meeshy', type: 'global', title: 'Meeshy' },
  ]);
  await db.collection('Participant').insertMany([
    { _id: ids.pA, conversationId: ids.group, userId: ids.jeanne, type: 'user', displayName: 'Jeanne E.', nickname: 'Maman', avatar: 'https://cdn.real.test/jeanne.jpg', role: 'member' },
    {
      _id: ids.pAnon, conversationId: ids.group, type: 'anonymous', displayName: 'Invité Marc', role: 'member', sessionTokenHash: 'a'.repeat(64),
      anonymousSession: {
        shareLinkId: new ObjectId(),
        session: { sessionTokenHash: 'a'.repeat(64), country: 'FR', deviceFingerprint: 'fp-real-123', ipAddress: '10.9.9.9', connectedAt: new Date() },
        profile: { firstName: 'Marc', lastName: 'Invité', username: 'marc.invite', email: 'marc@real-mail.test', birthday: new Date('1985-02-03T00:00:00Z') },
      },
    },
  ]);
  await db.collection('Message').insertMany([
    {
      _id: ids.msg, conversationId: ids.group, senderId: ids.pA, content: 'Rendez-vous chez moi à 18h, appelle le +33612345678',
      originalLanguage: 'fr', messageType: 'text', validatedMentions: ['recette.ios', 'disparu'],
      translations: { en: { text: 'Meet at my place at 6pm', translationModel: 'nllb' } },
      metadata: {
        kind: 'note', location: { latitude: 45.76, longitude: 4.83, address: '10 rue des Essais, Lyon' }, link: { url: 'https://perso.real.test/album' },
        extra: { notes2: 'Appelle Jeanne au bureau demain', contactInfo: 'jeanne.essai@real-mail.test', list: ['Jeanne Essai', 'Paul'], deep: [{ who: 'jeanne.essai', count: 3, seen: true }] },
      },
    },
    { _id: ids.msgE2ee, conversationId: ids.group, senderId: ids.pA, content: '[chiffré]', originalLanguage: 'fr', messageType: 'text', isEncrypted: true, encryptedContent: 'Q2lwaGVydGV4dA==', encryptionMetadata: { iv: 'abc' } },
    { _id: new ObjectId(), conversationId: ids.global, senderId: ids.pA, content: 'Appel terminé avec Jeanne', messageType: 'system', messageSource: 'system', metadata: { kind: 'call-summary', callerName: 'Jeanne' } },
  ]);
  await db.collection('MessageAttachment').insertOne({
    _id: ids.att, messageId: ids.msg, fileName: 'voix-jeanne.m4a', originalName: 'Mémo vocal Jeanne.m4a', mimeType: 'audio/mp4', fileSize: 1200,
    filePath: `attachments/2026/01/${ids.jeanne}/voix.m4a`, fileUrl: `attachments/2026/01/${ids.jeanne}/voix.m4a`, thumbHash: 'abc', uploadedBy: ids.jeanne,
    transcription: { text: 'Bonjour c’est Jeanne', language: 'fr', segments: [{ text: 'Bonjour', start: 0, end: 1 }] },
    translations: { en: { type: 'audio', transcription: 'Hello it is Jeanne', url: '/api/v1/attachments/file/translated/x_en.mp3', path: 'translated/x_en.mp3', format: 'mp3' } },
    caption: 'Pour toi maman', encryptionIv: 'aXY=', encryptionAuthTag: 'dGFn', serverKeyId: 'key-1', originalFileHash: 'f'.repeat(64),
  });
  await db.collection('Notification').insertOne({
    userId: ids.recette, type: 'new_message', title: 'Jeanne Essai', content: 'Jeanne : Rendez-vous chez moi',
    actor: { id: ids.jeanne.toHexString(), username: 'jeanne.essai', displayName: 'Jeanne E.', avatar: 'https://cdn.real.test/jeanne.jpg' },
    context: { conversationTitle: 'Famille Essai', messagePreview: 'Rendez-vous chez moi', senderEmail: 'jeanne.essai@real-mail.test' },
  });
  await db.collection('UserSession').insertOne({
    userId: ids.jeanne, sessionToken: 'b'.repeat(64), refreshToken: 'r'.repeat(40), ipAddress: '10.20.30.40', city: 'Lyon', location: 'Lyon, France',
    latitude: 45.76, longitude: 4.83, userAgent: 'Mozilla/5.0 (iPhone)', deviceFingerprint: 'fp-sess', deviceName: 'iPhone de Jeanne', expiresAt: new Date(),
  });
  await db.collection('SecurityEvent').insertOne({
    userId: ids.jeanne, eventType: 'LOGIN_FAILED', severity: 'LOW', status: 'FAILED', description: 'Échec de connexion pour jeanne.essai@real-mail.test',
    metadata: { email: 'jeanne.essai@real-mail.test', note: 'tentative depuis 10.1.1.1' }, ipAddress: '10.1.1.1', userAgent: 'curl/8', deviceFingerprint: 'fp-sec', geoLocation: 'Lyon, France',
  });
  await db.collection('TrackingLinkClick').insertOne({ trackingLinkId: new ObjectId(), ipAddress: '10.3.3.3', city: 'Lyon', region: 'ARA', userAgent: 'Mozilla/5.0', referrer: 'https://perso.real.test', deviceFingerprint: 'fp-click' });
  await db.collection('PushToken').insertOne({ userId: ids.jeanne, token: 'apns-token-real', type: 'apns', platform: 'ios' });
  await db.collection('UserVoiceModel').insertOne({
    userId: ids.jeanne, embedding: new Binary(Buffer.from([1, 2, 3])), chatterboxConditionals: new Binary(Buffer.from([4])), embeddingPath: 'voices/jeanne.npy',
    referenceAudioUrl: 'voices/jeanne.wav', fingerprint: { hash: 'x' }, signatureShort: 'sig', audioCount: 2, totalDurationMs: 9000, qualityScore: 0.8,
  });
  await db.collection('Post').insertOne({
    _id: ids.post, authorId: ids.jeanne, type: 'STORY', content: 'Joyeux anniversaire Jeanne !', audioUrl: 'attachments/2026/01/song.mp3',
    storyEffects: { elements: [{ kind: 'text', payload: { text: 'Bon anniversaire maman' } }] }, geoPoint: { type: 'Point', coordinates: [4.83, 45.76] },
    reactions: [{ userId: ids.jeanne, displayName: 'Jeanne E.', emoji: '❤️' }],
  });
  await db.collection('PostComment').insertOne({ postId: ids.post, authorId: ids.recette, content: 'Bravo Jeanne' });
  await db.collection('CallParticipant').insertOne({ callSessionId: new ObjectId(), participantId: ids.pA, analytics: { candidates: ['candidate:1 1 udp 2122260223 10.0.0.5 54321 typ host'] } });
  await db.collection('PasswordHistory').insertOne({ userId: ids.jeanne, passwordHash: '$2b$12$ancien', changedVia: 'RESET', ipAddress: '10.4.4.4' });
  await db.collection('MagicLinkToken').insertOne({ userId: ids.lien, tokenHash: 'c'.repeat(64), ipAddress: '10.5.5.5' });
  await db.collection('SignalPreKeyBundle').insertOne({ userId: ids.jeanne, identityKey: 'pub', identityKeyPrivate: 'priv' });
  await db.collection('AnonymousPostOpen').insertOne({ postId: ids.post, sessionKey: 'session-token-real' });
  await db.collection('account_deletion_requests').insertOne({ userId: ids.lien, status: 'PENDING_EMAIL_CONFIRMATION', confirmTokenHash: 'd'.repeat(64), cancelTokenHash: 'e'.repeat(64) });
  await db.collection('EmailInvitation').insertOne({ senderId: ids.jeanne, email: 'cousin@real-mail.test', affiliateTokenId: new ObjectId() });
  await db.collection('user_preferences').insertOne({
    userId: ids.jeanne,
    application: { theme: 'dark', accentColor: 'blue', interfaceLanguage: 'fr', downloadPath: '/Users/jeanne.essai/Downloads', signature: 'Jeanne, maman de Léo' },
    notification: { dndStartTime: '22:00', dndEnabled: true },
  });
  await db.collection('ConversationShareLink').insertOne({ _id: ids.link, linkId: 'mshy_Ab12Cd34', identifier: 'mshy_Ab12Cd34', conversationId: ids.group, createdBy: ids.jeanne, name: 'Lien famille' });
  await db.collection('AffiliateToken').insertOne({ token: 'aff_Zx98Yw76', name: 'Parrainage Jeanne', createdBy: ids.jeanne });
  await db.collection('TrackingLink').insertOne({ token: 'Qw12Er34', shortUrl: 'https://example.test/l/Qw12Er34', originalUrl: 'https://perso.real.test', createdBy: ids.jeanne });
  await db.collection('ConversationPublicKey').insertOne({ conversationId: ids.group, userId: ids.jeanne, keyType: 'x25519', publicKey: 'cHVi' });
  await db.collection('DMAEnrollment').insertOne({ userId: ids.jeanne, platform: 'x', identityKey: 'id', signedPreKey: 'spk', signedPreKeySignature: 'sig', status: 'active' });
  await db.collection('AffiliateVisitSession').insertOne({ sessionKey: 'affiliate_session_real', affiliateTokenId: new ObjectId(), affiliateUserId: ids.jeanne, expiresAt: new Date() });
  await db.collection('PostEngagement').insertOne({ postId: ids.post, userId: ids.recette, sessionId: 'client-session-real', contentType: 'story', surface: 'feed', actions: [{ type: 'view', note: 'vu par Paul' }], watchSamples: [] });
  await db.collection('EngagementQuota').insertMany([{ bucket: 'visit:lien:empreinte', count: 1 }, { bucket: 'day:2026-09-30', count: 2 }]);
  return ids;
}

let dbCounter = 0;
async function freshDb() {
  const db = client.db(`anon_test_${process.pid}_${dbCounter++}`);
  await db.dropDatabase();
  return { db, ids: await seed(db) };
}

const ctxFor = ({ salt = s.newSalt(), keepLogins = [], dryRun = false } = {}) =>
  newContext({ salt, keepLogins, hashRandomPassword: passwordHasher({ bcrypt, cost: 4, dryRun }), issuePassword: passwordIssuer({ bcrypt, cost: 4, dryRun }) });

async function snapshot(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const entries = await Promise.all(names.map(async (n) => [n, await db.collection(n).find().sort({ _id: 1 }).toArray()]));
  return Object.fromEntries(entries);
}

describe('garde anti-production', () => {
  const staging = 'mongodb://database-staging:27017/meeshy?replicaSet=rs0';

  it('refuse une base que l’environnement désigne comme production, même avec le drapeau', () => {
    assert.throws(() => assertNotProduction({ uri: staging, env: { MEESHY_ENV: 'production' }, confirmed: true }), ProductionGuardError);
  });

  it('refuse l’hôte de production, même avec le drapeau', () => {
    assert.throws(() => assertNotProduction({ uri: 'mongodb://database:27017/meeshy', env: {}, confirmed: true }), /non reconnu/);
    assert.throws(() => assertNotProduction({ uri: 'mongodb://meeshy-database:27017/meeshy', env: {}, confirmed: true }), /non reconnu/);
  });

  it('refuse un nom de base ou d’hôte qui évoque la production', () => {
    assert.throws(() => assertNotProduction({ uri: 'mongodb://database-staging:27017/meeshy_prod', env: {}, confirmed: true }), /nom de base/);
    assert.throws(() => assertNotProduction({ uri: 'mongodb://staging-prod-db:27017/meeshy', env: {}, confirmed: true }), /évoque la production/);
  });

  it('refuse d’écrire sans --i-know-this-is-not-production, mais laisse passer --dry-run', () => {
    assert.throws(() => assertNotProduction({ uri: staging, env: {}, confirmed: false, write: true }), /--i-know-this-is-not-production/);
    assert.doesNotThrow(() => assertNotProduction({ uri: staging, env: {}, confirmed: false, write: false }));
    assert.doesNotThrow(() => assertNotProduction({ uri: staging, env: {}, confirmed: true, write: true }));
  });

  it('n’accepte une boucle locale (tunnel) que si MEESHY_ENV nomme un environnement hors production', () => {
    const local = 'mongodb://127.0.0.1:27018/meeshy';
    assert.throws(() => assertNotProduction({ uri: local, env: {}, confirmed: true }), /non reconnu/);
    assert.doesNotThrow(() => assertNotProduction({ uri: local, env: { MEESHY_ENV: 'staging' }, confirmed: true }));
  });

  it('le script refuse AVANT toute connexion (code 1), sans afficher le mot de passe de l’URI', () => {
    const run = spawnSync(process.execPath, [script, '--uri', 'mongodb://admin:s3cret@meeshy-database:27017/meeshy', '--i-know-this-is-not-production'], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15_000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /REFUS/);
    assert.doesNotMatch(run.stdout + run.stderr, /s3cret/);
  });
});

describe('anonymisation d’une base', () => {
  it('--dry-run compte sans rien écrire', async () => {
    const { db } = await freshDb();
    const before = await snapshot(db);
    const outcome = await anonymizeDatabase(db, ctxFor({ dryRun: true }), { dryRun: true });
    assert.deepEqual(await snapshot(db), before);
    const users = outcome.report.find((r) => r.collection === 'User');
    assert.equal(users.matched, 3);
    assert.equal(outcome.report.find((r) => r.collection === 'PushToken').matched, 1);
  });

  it('change chaque champ personnel et garde les relations', async () => {
    const { db, ids } = await freshDb();
    const outcome = await anonymizeDatabase(db, ctxFor());
    const one = (c, q = {}) => db.collection(c).findOne(q);
    const jeanne = await one('User', { _id: ids.jeanne });
    const recette = await one('User', { _id: ids.recette });

    for (const [field, before] of Object.entries({ username: 'jeanne.essai', firstName: 'Jeanne', lastName: 'Essai', displayName: 'Jeanne E.', email: 'jeanne.essai@real-mail.test', phoneNumber: '+33612345678', lastLoginIp: '10.20.30.40', registrationIp: '10.20.30.41', lastLoginDevice: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })) {
      assert.notEqual(jeanne[field], before, `User.${field} inchangé`);
    }
    assert.ok(s.isSyntheticEmail(jeanne.email) && s.isSyntheticPhone(jeanne.phoneNumber) && s.isSyntheticUsername(jeanne.username));
    assert.ok(s.isSyntheticDate(jeanne.birthDate));
    assert.notEqual(jeanne.bio, 'Je vis à Lyon et j’adore le vélo');
    assert.equal(jeanne.avatar, null);
    assert.equal(jeanne.banner, null);
    assert.equal(jeanne.lastLoginLocation, null);
    assert.equal(jeanne.twoFactorSecret, null);
    assert.equal(jeanne.pendingEmail, null);
    assert.deepEqual(jeanne.usernameHistory, []);
    assert.deepEqual(jeanne.twoFactorBackupCodes, []);
    assert.ok(jeanne.searchTokens.includes(jeanne.firstName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 2)));
    assert.equal(await bcrypt.compare(USER_PASSWORD, jeanne.password), false);
    assert.match(jeanne.password, /^\$2[aby]\$/);
    assert.equal((await one('User', { _id: ids.lien })).password, null, 'un compte sans mot de passe le reste');

    const contact = await one('UserContact', { _id: ids.contact });
    assert.equal(contact.matchedUserId.toHexString(), ids.recette.toHexString());
    assert.equal(contact.phoneNumbers[0], recette.phoneNumber, 'le numéro du contact rapproché suit son compte');
    assert.equal(contact.emails[0], recette.email);
    assert.equal(contact.usernames[0], recette.username);
    assert.ok(contact.phoneNumbers.every(s.isSyntheticPhone) && contact.emails.every(s.isSyntheticEmail));
    assert.notEqual(contact.contactKey, 'f'.repeat(64));
    assert.notEqual(contact.displayName, 'Paul du bureau');

    const participant = await one('Participant', { _id: ids.pA });
    assert.equal(participant.userId.toHexString(), ids.jeanne.toHexString());
    assert.equal(participant.displayName, jeanne.displayName, 'le participant porte le nom synthétique de son compte');
    const anon = await one('Participant', { _id: ids.pAnon });
    assert.ok(s.isSyntheticEmail(anon.anonymousSession.profile.email));
    assert.equal(anon.anonymousSession.session.ipAddress, undefined);
    assert.notEqual(anon.anonymousSession.profile.firstName, 'Marc');

    const message = await one('Message', { _id: ids.msg });
    assert.equal(message.senderId.toHexString(), ids.pA.toHexString());
    assert.ok(s.isSyntheticText(message.content));
    assert.ok(s.isSyntheticText(message.translations.en.text));
    assert.equal(message.translations.en.translationModel, 'nllb');
    assert.ok(s.isSyntheticCoordinate(message.metadata.location.latitude));
    assert.equal(message.metadata.location.address, null);
    assert.deepEqual(message.validatedMentions, [recette.username]);
    assert.equal((await one('Message', { _id: ids.msgE2ee })).encryptedContent, null);
    assert.equal((await one('Message', { messageType: 'system' })).metadata.kind, 'call-summary');
    assert.equal(message.metadata.kind, 'note', 'une énumération technique reste');
    assert.ok(s.isSyntheticText(message.metadata.extra.notes2), 'une clé INCONNUE porteuse de texte est remplacée');
    assert.ok(s.isSyntheticEmail(message.metadata.extra.contactInfo), 'une clé inconnue porteuse d’un e-mail reçoit un e-mail synthétique');
    assert.ok(message.metadata.extra.list.every(s.isSyntheticText), 'un tableau de chaînes sous une clé inconnue est remplacé');
    assert.ok(s.isSyntheticText(message.metadata.extra.deep[0].who), 'une valeur imbriquée dans un tableau d’objets est remplacée');
    assert.equal(message.metadata.extra.deep[0].count, 3);
    assert.equal(message.metadata.extra.deep[0].seen, true);

    const prefs = await one('user_preferences');
    assert.equal(prefs.application.theme, 'dark');
    assert.equal(prefs.application.accentColor, 'blue');
    assert.equal(prefs.application.interfaceLanguage, 'fr');
    assert.equal(prefs.notification.dndStartTime, '22:00');
    assert.equal(prefs.notification.dndEnabled, true);
    assert.ok(s.isSyntheticText(prefs.application.downloadPath), 'un chemin personnel dans un réglage est remplacé');
    assert.ok(s.isSyntheticText(prefs.application.signature), 'un texte libre dans un réglage est remplacé');

    const link = await one('ConversationShareLink', { _id: ids.link });
    assert.notEqual(link.linkId, 'mshy_Ab12Cd34', 'un lien de partage de production n’ouvre rien depuis le staging');
    assert.notEqual(link.identifier, 'mshy_Ab12Cd34');
    assert.notEqual((await one('AffiliateToken')).token, 'aff_Zx98Yw76');
    const tracking = await one('TrackingLink');
    assert.notEqual(tracking.token, 'Qw12Er34');
    assert.ok(tracking.shortUrl.endsWith(`/l/${tracking.token}`));
    assert.notEqual((await one('AffiliateVisitSession')).sessionKey, 'affiliate_session_real');
    const engagement = await one('PostEngagement');
    assert.notEqual(engagement.sessionId, 'client-session-real');
    assert.ok(s.isSyntheticText(engagement.actions[0].note));
    assert.equal(engagement.actions[0].type, 'view');
    assert.equal(anon.sessionTokenHash, anon.anonymousSession.session.sessionTokenHash, 'les deux copies du condensé de session restent égales');
    assert.notEqual(anon.sessionTokenHash, 'a'.repeat(64));
    assert.equal((await one('Conversation', { _id: ids.group })).serverEncryptionKeyId, null);

    const attachment = await one('MessageAttachment', { _id: ids.att });
    assert.equal(attachment.filePath, 'anonymized/placeholder.wav');
    assert.ok(s.isSyntheticFileName(attachment.originalName) && attachment.originalName.endsWith('.m4a'));
    assert.ok(s.isSyntheticText(attachment.transcription.text) && s.isSyntheticText(attachment.transcription.segments[0].text));
    assert.ok(s.isSyntheticText(attachment.translations.en.transcription));
    assert.ok(s.isPlaceholderPath(attachment.translations.en.url));
    assert.equal(attachment.thumbHash, null);
    for (const field of ['encryptionIv', 'encryptionAuthTag', 'serverKeyId', 'originalFileHash']) assert.equal(attachment[field], null, `MessageAttachment.${field}`);
    assert.ok(outcome.manifest.some((e) => e.original === `attachments/2026/01/${ids.jeanne}/voix.m4a`));
    assert.ok(outcome.manifest.some((e) => e.original === 'translated/x_en.mp3'));

    const notification = await one('Notification');
    assert.equal(notification.actor.username, jeanne.username, 'l’acteur est remappé sur le compte');
    assert.equal(notification.actor.displayName, jeanne.displayName);
    assert.ok(s.isSyntheticEmail(notification.context.senderEmail));

    const session = await one('UserSession');
    assert.ok(s.isSyntheticToken(session.sessionToken) && s.isSyntheticIp(session.ipAddress));
    assert.equal(session.latitude, null);
    assert.equal(session.refreshToken, null);
    assert.equal(session.deviceName, s.SYNTHETIC_DEVICE);

    const call = await one('CallParticipant');
    assert.doesNotMatch(call.analytics.candidates[0], /10\.0\.0\.5/);
    const post = await one('Post');
    assert.ok(s.isSyntheticText(post.storyEffects.elements[0].payload.text));
    assert.ok(post.geoPoint.coordinates.every(s.isSyntheticCoordinate));
    assert.equal(post.reactions[0].displayName, jeanne.displayName, 'un ObjectId d’auteur remappe aussi le nom');
    assert.equal(post.reactions[0].emoji, '❤️');
    const voice = await one('UserVoiceModel');
    assert.equal(voice.embedding, null);
    assert.equal(voice.chatterboxConditionals, null);

    for (const purged of ['PushToken', 'PasswordHistory', 'MagicLinkToken', 'SignalPreKeyBundle', 'ConversationPublicKey', 'DMAEnrollment']) {
      assert.equal(await db.collection(purged).countDocuments(), 0, `${purged} purgé`);
    }
    assert.equal(await db.collection('EngagementQuota').countDocuments(), 1, 'seuls les seaux visit:* partent');
    assert.equal((await one('Conversation', { _id: ids.global })).title, 'Meeshy');
    assert.match((await one('Conversation', { _id: ids.group })).identifier, /^mshy_[0-9a-f]{16}$/);

    const verification = await verifyDatabase(db, ctxFor());
    assert.deepEqual(verification.violations, []);
  });

  it('tient les index uniques et reste sûr à relancer (deux passes)', async () => {
    const { db } = await freshDb();
    const salt = s.newSalt();
    await anonymizeDatabase(db, ctxFor({ salt }));
    const first = await snapshot(db);
    await anonymizeDatabase(db, ctxFor({ salt }));
    const second = await snapshot(db);
    const withoutPasswordsAndRuns = (snap) => ({ ...snap, _anonymizationRuns: null, User: snap.User.map(({ password, ...rest }) => rest) });
    assert.deepEqual(withoutPasswordsAndRuns(second), withoutPasswordsAndRuns(first), 'même sel ⇒ même résultat');

    await anonymizeDatabase(db, ctxFor());
    const users = await db.collection('User').find().toArray();
    assert.equal(new Set(users.map((u) => u.username)).size, users.length);
    assert.equal(new Set(users.map((u) => u.email)).size, users.length);
    assert.deepEqual((await verifyDatabase(db, ctxFor())).violations, []);
  });

  it('les comptes --keep-login gardent leur pseudo et reçoivent un mot de passe NEUF — jamais le haché d’origine', async () => {
    const { db, ids } = await freshDb();
    const ctx = ctxFor({ keepLogins: ['recette.ios', 'absent.du.jeu'] });
    const outcome = await anonymizeDatabase(db, ctx);
    const recette = await db.collection('User').findOne({ _id: ids.recette });
    assert.equal(recette.username, 'recette.ios');
    assert.equal(await bcrypt.compare(KEPT_PASSWORD, recette.password), false, 'le mot de passe de production ne vaut plus rien sur le staging');
    assert.deepEqual(outcome.keptCredentials.map((c) => c.username), ['recette.ios']);
    const [{ password: fresh }] = outcome.keptCredentials;
    assert.ok(fresh.length >= 20 && fresh !== KEPT_PASSWORD);
    assert.equal(await bcrypt.compare(fresh, recette.password), true, 'le compte de recette se connecte avec son mot de passe neuf');
    assert.notEqual(recette.email, 'recette@real-mail.test');
    assert.notEqual(recette.phoneNumber, '+33698765432');
    assert.notEqual(recette.lastName, 'Recette');
    assert.equal(recette.twoFactorEnabledAt, null, 'sans secret TOTP, la double authentification est retirée');
    assert.deepEqual(outcome.missingKeepLogins, ['absent.du.jeu']);
    assert.deepEqual((await verifyDatabase(db, ctx)).violations, []);
  });

  it('le contrôle échoue si le nettoyage d’un JSON libre est désactivé', async () => {
    const { db } = await freshDb();
    const crippled = INVENTORY.map((spec) =>
      spec.model === 'Message' ? { ...spec, transform: (p) => p.text('content').json('translations').nullify('encryptedContent', 'encryptionMetadata') } : spec,
    );
    await anonymizeDatabase(db, ctxFor(), { inventory: crippled });
    const { violations } = await verifyDatabase(db, ctxFor(), { sampleSize: 1000 });
    const fields = violations.filter((v) => v.collection === 'Message').map((v) => v.field);
    for (const leaked of ['metadata.extra.notes2', 'metadata.extra.contactInfo', 'metadata.extra.list', 'metadata.extra.deep[0].who', 'metadata.callerName']) {
      assert.ok(fields.some((f) => f === leaked || f.startsWith(`${leaked}[`)), `${leaked} non signalé par le contrôle`);
    }
    assert.ok(!fields.includes('metadata.kind'), 'une énumération technique n’est pas une fuite');
  });

  it('le contrôle d’échantillonnage échoue sur une valeur réelle restée en base', async () => {
    const { db } = await freshDb();
    await anonymizeDatabase(db, ctxFor());
    await db.collection('User').insertOne({ username: 'oublie', firstName: 'Réel', lastName: 'Oubli', email: 'oubli@real-mail.test', phoneNumber: '+33611111111', bio: '' });
    await db.collection('Notification').updateOne({}, { $set: { 'context.extra': 'écrire à oubli@real-mail.test' } });
    const { violations } = await verifyDatabase(db, ctxFor(), { sampleSize: 1000 });
    const fields = violations.map((v) => `${v.collection}.${v.field}`);
    assert.ok(fields.includes('User.email') && fields.includes('User.phoneNumber') && fields.includes('User.username'));
    assert.ok(violations.some((v) => v.collection === 'Notification' && v.rule.includes('e-mail')));
    assert.ok(violations.every((v) => !JSON.stringify(v).includes('real-mail')), 'le rapport ne recopie jamais la valeur');
  });

  it('la ligne de commande écrit, rapporte, contrôle et propose l’étape médias', async () => {
    const { db } = await freshDb();
    const dir = mkdtempSync(path.join(tmpdir(), 'anon-cli-'));
    const manifest = path.join(dir, 'm.jsonl');
    const lines = [];
    const uri = `${mongo.uri}/${db.databaseName}`;
    assert.equal(await main(['--uri', uri, '--dry-run'], { env: TEST_ENV, log: (l) => lines.push(l) }), 0);
    assert.ok(!existsSync(manifest));
    const credentials = path.join(dir, 'recette.credentials');
    const code = await main(['--uri', uri, '--i-know-this-is-not-production', '--keep-login', 'recette.ios', '--manifest', manifest, '--credentials', credentials, '--bcrypt-cost', '4'], { env: TEST_ENV, log: (l) => lines.push(l) });
    assert.equal(code, 0);
    assert.equal(statSync(credentials).mode & 0o777, 0o600, 'le fichier des mots de passe neufs n’est lisible que par son propriétaire');
    const [username, fresh] = readFileSync(credentials, 'utf8').trim().split('\t');
    assert.equal(username, 'recette.ios');
    assert.equal(await bcrypt.compare(fresh, (await db.collection('User').findOne({ username })).password), true);
    assert.ok(lines.every((l) => !l.includes(fresh)), 'le mot de passe neuf n’est jamais affiché');
    assert.ok(readFileSync(manifest, 'utf8').includes('voix.m4a'));
    assert.ok(lines.some((l) => l.includes('Contrôle : aucune forme réelle trouvée.')));
    assert.ok(lines.some((l) => l.includes(' media --manifest ')));
    assert.equal(await main(['--uri', uri, '--verify-only', '--keep-login', 'recette.ios'], { env: TEST_ENV, log: () => {} }), 0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('médias sur disque', () => {
  it('à blanc ne touche à rien ; --apply neutralise les fichiers et pose les remplaçants', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'anon-media-'));
    await mkdir(path.join(root, 'attachments/2026/01'), { recursive: true });
    await writeFile(path.join(root, 'attachments/2026/01/photo.jpg'), 'photo-reelle');
    await writeFile(path.join(root, 'attachments/2026/01/voix.m4a'), 'voix-reelle');
    await writeFile(path.join(root, 'orphelin.pdf'), 'document-reel');
    const manifest = [
      { original: 'attachments/2026/01/photo.jpg' },
      { original: 'https://gate.example.test/api/v1/attachments/file/attachments%2F2026%2F01%2Fvoix.m4a' },
      { original: '../../etc/passwd' },
    ];
    const plan = await neutralizeMedia({ manifest, uploadsRoot: root });
    assert.equal(plan.wouldNeutralize, 2);
    assert.equal(await readFile(path.join(root, 'attachments/2026/01/photo.jpg'), 'utf8'), 'photo-reelle');

    await neutralizeMedia({ manifest, uploadsRoot: root, apply: true });
    assert.notEqual(await readFile(path.join(root, 'attachments/2026/01/photo.jpg'), 'utf8'), 'photo-reelle');
    assert.equal((await readFile(path.join(root, 'attachments/2026/01/voix.m4a'))).subarray(0, 4).toString(), 'RIFF');
    assert.ok(existsSync(path.join(root, 'anonymized/placeholder.png')));
    assert.equal(await readFile(path.join(root, 'orphelin.pdf'), 'utf8'), 'document-reel', 'hors manifeste, intact sans --all');

    await neutralizeMedia({ manifest: [], uploadsRoot: root, apply: true, all: true });
    assert.notEqual(await readFile(path.join(root, 'orphelin.pdf'), 'utf8'), 'document-reel');
    rmSync(root, { recursive: true, force: true });
  });
});

describe('inventaire', () => {
  const schema = readFileSync(path.join(repoRoot, 'packages/shared/prisma/schema.prisma'), 'utf8');
  const models = new Map(
    [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
      const fields = new Set([...body.matchAll(/^\s+(\w+)\s+\S/gm)].map((m) => m[1]));
      const mapped = /@@map\("([^"]+)"\)/.exec(body);
      return [name, { fields, collection: mapped ? mapped[1] : name }];
    }),
  );

  it('chaque champ traité existe au schéma, sous sa collection', () => {
    for (const spec of INVENTORY) {
      const model = models.get(spec.model);
      assert.ok(model, `modèle inconnu : ${spec.model}`);
      assert.equal(spec.collection, model.collection, `collection de ${spec.model}`);
      spec.fields.forEach((f) => assert.ok(model.fields.has(f), `${spec.model}.${f} absent du schéma`));
      Object.keys(spec.checks ?? {}).forEach((f) => assert.ok(spec.fields.includes(f.split('.')[0]), `${spec.model}.${f} contrôlé sans être inventorié`));
    }
  });

  it('l’en-tête du script nomme chaque champ de l’inventaire exécutable', () => {
    const source = readFileSync(script, 'utf8');
    const header = source.slice(source.indexOf('// INVENTAIRE'), source.indexOf('// FIN DE L\'INVENTAIRE'));
    const entries = new Map();
    let current = null;
    for (const line of header.split('\n')) {
      const opening = /^\/\/ {3}([A-Z]\w+) /.exec(line);
      if (opening) current = opening[1];
      if (current) entries.set(current, `${entries.get(current) ?? ''} ${line}`);
    }
    for (const spec of INVENTORY) {
      const block = entries.get(spec.model);
      assert.ok(block, `${spec.model} absent de l'en-tête`);
      spec.fields.forEach((f) => assert.ok(new RegExp(`\\b${f}\\b`).test(block), `${spec.model}.${f} absent de l'en-tête`));
    }
  });

  it('chaque champ du schéma dont le NOM évoque un secret, un jeton ou une clé est traité ou exempté avec sa raison', () => {
    const SECRET_NAME = /token|secret|password|passwd|hash|salt|apikey|key|code|otp|signature|credential|private|refresh|session|fingerprint|nonce|hmac|authtag|^iv$|Iv$|cipher|encrypted|webhook|oauth|backup|linkId|identifier|shortUrl/i;
    const handled = new Set(INVENTORY.flatMap((spec) => spec.fields.map((f) => `${spec.model}.${f}`)));
    const declared = new Set([...handled, ...Object.keys(NESTED_COVERAGE), ...Object.keys(SECRET_EXEMPTIONS)]);
    const untreated = [];
    for (const [, kind, name, body] of schema.matchAll(/^(model|type) (\w+) \{([\s\S]*?)^\}/gm)) {
      for (const line of body.split('\n')) {
        const field = /^\s+(\w+)\s+(String|Json|Bytes)\b/.exec(line);
        if (!field || line.includes('@db.ObjectId') || !SECRET_NAME.test(field[1])) continue;
        if (!declared.has(`${name}.${field[1]}`)) untreated.push(`${kind} ${name}.${field[1]}`);
      }
    }
    assert.deepEqual(untreated, []);
    Object.entries(SECRET_EXEMPTIONS).forEach(([field, reason]) => assert.ok(reason.length > 20, `${field} : raison absente`));
    Object.values(NESTED_COVERAGE).forEach((owner) => assert.ok(handled.has(owner), `${owner} ne couvre rien`));
  });

  it('les jetons de recherche suivent la règle de la passerelle', async () => {
    const gateway = await import(path.join(repoRoot, 'services/gateway/src/utils/search-tokens.ts'));
    const account = { username: 'anon_0a1b2c3d4e5f', displayName: 'Zélie Aubépine', firstName: 'Zélie', lastName: 'Aubépine' };
    assert.deepEqual(s.searchTokensFor(account), gateway.searchTokensFor(account));
  });
});
