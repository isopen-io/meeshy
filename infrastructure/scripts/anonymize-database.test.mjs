// Témoins du script d'anonymisation (#9663), sur une base MongoDB JETABLE.
//
// Lancer depuis la racine du dépôt :
//   node --import tsx --test infrastructure/scripts/anonymize-database*.test.mjs
//
// La base : un replica set d'un membre (anonymize-database/test-mongo.mjs).
// Toutes les données sont SYNTHÉTIQUES (domaine `.test`, plages privées).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from './anonymize-database.mjs';
import { assertNotProduction, ProductionGuardError } from './anonymize-database/guard.mjs';
import { anonymizeDatabase, newContext, passwordHasher, passwordIssuer } from './anonymize-database/run.mjs';
import { verifyDatabase } from './anonymize-database/verify.mjs';
import { neutralizeMedia } from './anonymize-database/media.mjs';
import { INVENTORY, NESTED_COVERAGE, SECRET_EXEMPTIONS, UNCHECKED } from './anonymize-database/inventory.mjs';
import { FIELD_EXEMPTIONS } from './anonymize-database/schema-exemptions.mjs';
import { COLLECTION_EXEMPTIONS } from './anonymize-database/collections.mjs';
import { loadBcrypt, loadMongo } from './anonymize-database/deps.mjs';
import { startMongo, targetFlags, uriFor } from './anonymize-database/test-mongo.mjs';
import { KEPT_PASSWORD, USER_PASSWORD, seed as seedWith } from './anonymize-database/test-seed.mjs';
import * as s from './anonymize-database/synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const script = path.join(here, 'anonymize-database.mjs');
const TEST_ENV = { MEESHY_ENV: 'test' };

let mongo;
let client;
let bcrypt;
let ObjectId;
let Binary;

before(async () => {
  ({ ObjectId, Binary } = await loadMongo());
  bcrypt = await loadBcrypt();
  mongo = await startMongo();
  client = mongo.client;
});

after(async () => {
  await mongo?.stop();
});

const seed = (db) => seedWith(db, { ObjectId, Binary, bcrypt });

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

  it('les champs relevés par l’audit sont traités, secrets compris', async () => {
    const { db, ids } = await freshDb();
    await anonymizeDatabase(db, ctxFor());
    const one = (c, q = {}) => db.collection(c).findOne(q);
    const jeanne = await one('User', { _id: ids.jeanne });
    for (const field of ['signalIdentityKeyPrivate', 'signalIdentityKeyPublic', 'emailVerificationToken', 'emailVerificationCode', 'phoneVerificationCode', 'pendingEmailVerificationToken', 'pendingPhoneNumber', 'pendingPhoneVerificationCode', 'twoFactorPendingSecret', 'twoFactorChallengeHash', 'claimedEmail']) {
      assert.equal(jeanne[field], null, `User.${field} survit`);
    }
    assert.ok(s.isSyntheticText(jeanne.lockedReason), 'User.lockedReason');

    const llm = await one('AgentLlmConfig');
    assert.equal(llm.apiKeyEncrypted, '', 'clé d’API de l’agent');
    assert.equal(llm.fallbackApiKeyEncrypted, null, 'clé d’API de secours');
    assert.equal(llm.baseUrl, null, 'adresse du fournisseur (peut porter une clé)');
    assert.equal(llm.model, 'gpt-4o-mini');
    assert.equal(await db.collection('PhonePasswordResetToken').countDocuments(), 0, 'PhonePasswordResetToken purgé');

    const report = await one('Report');
    for (const field of ['reason', 'moderatorNotes', 'actionTaken']) assert.ok(s.isSyntheticText(report[field]), `Report.${field}`);
    assert.ok(s.isSyntheticName(report.reporterName));

    const hashtag = await one('Hashtag', { _id: ids.hashtag });
    assert.ok(s.isSyntheticHashtag(hashtag.tag), 'Hashtag.tag');
    assert.equal((await one('PostHashtag')).display, `#${hashtag.tag}`, 'PostHashtag.display suit son hashtag');

    const pack = await one('StickerPack', { _id: ids.pack });
    for (const field of ['name', 'description', 'reviewNote']) assert.ok(s.isSyntheticText(pack[field]), `StickerPack.${field}`);
    assert.ok(s.isSyntheticName(pack.author), 'StickerPack.author');
    assert.notEqual(pack.slug, 'famille-essai', 'StickerPack.slug');
    assert.equal((await one('UserStickerPack')).packSlug, pack.slug, 'UserStickerPack.packSlug suit son paquet');
    const item = await one('StickerPackItem');
    assert.ok(s.isSyntheticText(item.title), 'StickerPackItem.title');
    assert.equal(item.filePath, 'anonymized/placeholder.png', 'StickerPackItem.filePath');
    assert.equal(item.emoji, '🏖️');

    assert.ok(s.isSyntheticText((await one('AgentConfig')).agentInstructions), 'AgentConfig.agentInstructions');
    assert.equal((await one('AdminBroadcast')).errorMessage, null, 'AdminBroadcast.errorMessage');
    const response = await one('PostInteractiveResponse');
    assert.ok(s.isSyntheticText(response.choice), 'PostInteractiveResponse.choice (texte libre)');
    assert.equal(response.objectId, 'poll-1');
    const click = await one('TrackingLinkClick');
    for (const field of ['utmClickSource', 'utmClickMedium', 'utmClickCampaign', 'utmClickTerm', 'utmClickContent']) assert.equal(click[field], null, `TrackingLinkClick.${field}`);

    const message = await one('Message', { _id: ids.msg });
    assert.notEqual(message.metadata.extra.source, 'jeanne', 'un mot d’identité sous une clé autorisée est remplacé');
    const prefs = await one('user_preferences');
    for (const field of ['voiceProfile', 'homeCity', 'wifi']) assert.ok(s.isSyntheticText(prefs.application[field]), `réglage ${field} gardé`);
    assert.deepEqual((await verifyDatabase(db, ctxFor())).violations, []);
  });

  it('le contrôle final rougit sur chaque champ relevé par l’audit resté réel', async () => {
    const { db, ids } = await freshDb();
    await anonymizeDatabase(db, ctxFor());
    await db.collection('User').updateOne({ _id: ids.jeanne }, { $set: { signalIdentityKeyPrivate: 'cHJpdg==', emailVerificationCode: '482913', lockedReason: 'Bloqué : Jeanne' } });
    await db.collection('AgentLlmConfig').updateOne({}, { $set: { apiKeyEncrypted: 'sk-reel', baseUrl: 'https://llm.real.test' } });
    await db.collection('PhonePasswordResetToken').insertOne({ userId: ids.jeanne, codeHash: 'c'.repeat(64) });
    await db.collection('Report').updateOne({}, { $set: { reason: 'Il harcèle Léa', moderatorNotes: 'Appel à Jeanne', actionTaken: 'Paul suspendu' } });
    await db.collection('Hashtag').updateOne({}, { $set: { tag: 'jeanneessai' } });
    await db.collection('StickerPack').updateOne({}, { $set: { name: 'Famille Essai', author: 'Jeanne Essai', reviewNote: 'Visage de Léa' } });
    await db.collection('AgentConfig').updateOne({}, { $set: { agentInstructions: 'Jeanne est enceinte' } });
    await db.collection('TrackingLinkClick').updateOne({}, { $set: { utmClickTerm: 'jeanne' } });
    const { violations } = await verifyDatabase(db, ctxFor());
    const fields = new Set(violations.map((v) => `${v.collection}.${v.field}`));
    for (const expected of ['User.signalIdentityKeyPrivate', 'User.emailVerificationCode', 'User.lockedReason', 'AgentLlmConfig.apiKeyEncrypted', 'AgentLlmConfig.baseUrl', 'PhonePasswordResetToken.*', 'Report.reason', 'Report.moderatorNotes', 'Report.actionTaken', 'Hashtag.tag', 'StickerPack.name', 'StickerPack.author', 'StickerPack.reviewNote', 'AgentConfig.agentInstructions', 'TrackingLinkClick.utmClickTerm']) {
      assert.ok(fields.has(expected), `${expected} non signalé par le contrôle`);
    }
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
    const { violations } = await verifyDatabase(db, ctxFor());
    const fields = violations.filter((v) => v.collection === 'Message').map((v) => v.field);
    for (const leaked of ['metadata.extra.notes2', 'metadata.extra.contactInfo', 'metadata.extra.list', 'metadata.extra.deep[0].who', 'metadata.callerName']) {
      assert.ok(fields.some((f) => f === leaked || f.startsWith(`${leaked}[`)), `${leaked} non signalé par le contrôle`);
    }
    assert.ok(!fields.includes('metadata.kind'), 'une énumération technique n’est pas une fuite');
  });

  it('le contrôle final échoue sur une valeur réelle restée en base', async () => {
    const { db } = await freshDb();
    await anonymizeDatabase(db, ctxFor());
    await db.collection('User').insertOne({ username: 'oublie', firstName: 'Réel', lastName: 'Oubli', email: 'oubli@real-mail.test', phoneNumber: '+33611111111', bio: '' });
    await db.collection('Notification').updateOne({}, { $set: { 'context.extra': 'écrire à oubli@real-mail.test' } });
    const { violations } = await verifyDatabase(db, ctxFor());
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
    const uri = uriFor(mongo, db.databaseName);
    const target = targetFlags(mongo);
    assert.equal(await main(['--uri', uri, '--dry-run', ...target], { env: TEST_ENV, log: (l) => lines.push(l) }), 0);
    assert.ok(!existsSync(manifest));
    const credentials = path.join(dir, 'recette.credentials');
    const code = await main(['--uri', uri, '--i-know-this-is-not-production', '--oplog-rebuild-pending', '--keep-login', 'recette.ios', '--manifest', manifest, '--credentials', credentials, '--bcrypt-cost', '4', ...target], { env: TEST_ENV, log: (l) => lines.push(l) });
    assert.equal(code, 0);
    assert.equal(statSync(credentials).mode & 0o777, 0o600, 'le fichier des mots de passe neufs n’est lisible que par son propriétaire');
    const [username, fresh] = readFileSync(credentials, 'utf8').trim().split('\t');
    assert.equal(username, 'recette.ios');
    assert.equal(await bcrypt.compare(fresh, (await db.collection('User').findOne({ username })).password), true);
    assert.ok(lines.every((l) => !l.includes(fresh)), 'le mot de passe neuf n’est jamais affiché');
    assert.ok(readFileSync(manifest, 'utf8').includes('voix.m4a'));
    assert.equal(statSync(manifest).mode & 0o777, 0o600, 'le manifeste n’est lisible que par son propriétaire');
    assert.ok(lines.some((l) => l.includes('Contrôle : aucune forme réelle trouvée.')));
    assert.ok(lines.some((l) => l.includes(' media --manifest ')));
    assert.equal(await main(['--uri', uri, '--verify-only', '--oplog-rebuild-pending', '--manifest', manifest, '--keep-login', 'recette.ios', ...target], { env: TEST_ENV, log: () => {} }), 0);
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

  const blocks = [...schema.matchAll(/^(model|type) (\w+) \{([\s\S]*?)^\}/gm)];
  const textFields = blocks.flatMap(([, kind, name, body]) =>
    body.split('\n').flatMap((line) => {
      const field = /^\s+(\w+)\s+(String|Json|Bytes)(\[\])?\??(?:\s|$)/.exec(line);
      return field && !line.includes('@db.ObjectId') && !line.includes('@id') ? [{ kind, model: name, field: field[1] }] : [];
    }),
  );

  it('BALAYAGE FERMÉ : chaque champ texte, JSON ou binaire du schéma est traité ou exempté avec sa raison', () => {
    const handled = new Set(INVENTORY.flatMap((spec) => spec.fields.map((f) => `${spec.model}.${f}`)));
    const purgedWhole = new Set(INVENTORY.filter((spec) => spec.action === 'purge' && !spec.filter).map((spec) => spec.model));
    const classified = (key, model) => handled.has(key) || purgedWhole.has(model) || key in NESTED_COVERAGE || key in SECRET_EXEMPTIONS || key in FIELD_EXEMPTIONS;
    const unclassified = textFields.map(({ kind, model, field }) => [`${model}.${field}`, model, kind]).filter(([key, model]) => !classified(key, model)).map(([key, , kind]) => `${kind} ${key}`);
    assert.deepEqual(unclassified, [], 'champs du schéma ni traités ni exemptés');
    const known = new Set(textFields.map(({ model, field }) => `${model}.${field}`));
    const stale = Object.keys(FIELD_EXEMPTIONS).filter((key) => !known.has(key) || handled.has(key));
    assert.deepEqual(stale, [], 'exemptions qui ne désignent plus un champ texte non traité du schéma');
    Object.entries(FIELD_EXEMPTIONS).forEach(([field, reason]) => assert.ok(reason.length > 20, `${field} : raison absente`));
  });

  it('chaque modèle du schéma a sa collection inventoriée ou déclarée sans donnée personnelle', () => {
    const inventoried = new Set(INVENTORY.map((spec) => spec.collection));
    const collections = [...models.values()].map((m) => m.collection);
    assert.deepEqual(collections.filter((c) => !inventoried.has(c) && !(c in COLLECTION_EXEMPTIONS)), []);
    assert.deepEqual(Object.keys(COLLECTION_EXEMPTIONS).filter((c) => !collections.includes(c) || inventoried.has(c)), [], 'déclarations périmées');
    Object.entries(COLLECTION_EXEMPTIONS).forEach(([c, reason]) => assert.ok(reason.length > 20, `${c} : raison absente`));
    const declaredModels = [...models.entries()].filter(([, m]) => m.collection in COLLECTION_EXEMPTIONS).map(([name]) => name);
    const personal = textFields.filter(({ model, field }) => declaredModels.includes(model) && !(`${model}.${field}` in FIELD_EXEMPTIONS) && !(`${model}.${field}` in SECRET_EXEMPTIONS));
    assert.deepEqual(personal, [], 'une collection déclarée sans donnée personnelle porte un champ texte non exempté');
  });

  it('chaque champ réécrit a son prédicat au contrôle final, ou une raison écrite de ne pas en avoir', () => {
    const missing = INVENTORY.filter((spec) => spec.action !== 'purge').flatMap((spec) =>
      spec.fields.filter((f) => !(f in (spec.checks ?? {})) && !(`${spec.model}.${f}` in UNCHECKED)).map((f) => `${spec.model}.${f}`),
    );
    assert.deepEqual(missing, []);
    Object.entries(UNCHECKED).forEach(([field, reason]) => assert.ok(reason.length > 20, `${field} : raison absente`));
  });

  it('les jetons de recherche suivent la règle de la passerelle', async () => {
    const gateway = await import(path.join(repoRoot, 'services/gateway/src/utils/search-tokens.ts'));
    const account = { username: 'anon_0a1b2c3d4e5f', displayName: 'Zélie Aubépine', firstName: 'Zélie', lastName: 'Aubépine' };
    assert.deepEqual(s.searchTokensFor(account), gateway.searchTokensFor(account));
  });
});
