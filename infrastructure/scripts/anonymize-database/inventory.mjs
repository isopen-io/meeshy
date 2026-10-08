// L'inventaire EXÉCUTABLE : pour chaque modèle de `packages/shared/prisma/schema.prisma`
// qui porte une donnée personnelle, ce qu'on en fait et comment on le contrôle.
// La version lisible est l'en-tête de `../anonymize-database.mjs` ; un témoin
// vérifie que les deux nomment les mêmes champs, et que chaque champ existe au
// schéma.
//
// Trois actions :
//  - `transform` : réécriture document par document (valeurs dérivées du sel et
//    de l'`_id`) ;
//  - `constant`  : une même valeur pour tous les documents concernés (côté serveur) ;
//  - `purge`     : suppression (jetons, secrets, clés privées, journaux dérivés).
// `checks` nomme le prédicat de chaque champ pour le contrôle d'échantillonnage.

import * as s from './synth.mjs';
import { normalizePhone } from './scrub-json.mjs';
import { ok } from './patch.mjs';

const OPAQUE_IDENTIFIER = /^mshy_[A-Za-z0-9]{8,16}$/;
const LEGACY_IDENTIFIER = /^mshy_[0-9a-f]{24}\.\d{10}_[0-9a-z]{8}$/;
const PUBLIC_CONVERSATION_TYPES = new Set(['global', 'public']);
const isOpaqueIdentifier = (v) => OPAQUE_IDENTIFIER.test(v) || LEGACY_IDENTIFIER.test(v);

function identifier(p, ctx) {
  const { doc, id } = p;
  if (typeof doc.identifier !== 'string' || isOpaqueIdentifier(doc.identifier)) return;
  if (PUBLIC_CONVERSATION_TYPES.has(doc.type)) return;
  p.set('identifier', `mshy_${s.hex(ctx.salt, 16, id, 'identifier')}`);
}

const identifierCheck = (v, doc) => PUBLIC_CONVERSATION_TYPES.has(doc.type) || isOpaqueIdentifier(v) || /^mshy_[0-9a-f]{16}$/.test(v);

/** Les mots d'identité RÉELS d'un compte, gardés en mémoire seulement : un réglage qui les contient est remplacé. */
function identityWords(row) {
  const local = typeof row.email === 'string' ? row.email.split('@')[0] : '';
  return [row.username, row.firstName, row.lastName, row.displayName, local]
    .filter((v) => typeof v === 'string')
    .flatMap((v) => v.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter((w) => w.length >= 3);
}

/** Pré-passe User : les cartes « valeur réelle → valeur synthétique » qui tiennent les relations. */
async function prepareUsers(db, ctx) {
  const rows = await db
    .collection('User')
    .find({}, { projection: { username: 1, email: 1, phoneNumber: 1, displayName: 1, firstName: 1, lastName: 1 } })
    .toArray();
  const ranked = rows
    .map((row) => ({ row, rank: s.hex(ctx.salt, 16, row._id.toHexString(), 'phone-rank') }))
    .sort((a, b) => a.rank.localeCompare(b.rank));
  ranked.forEach(({ row }, index) => {
    const id = row._id.toHexString();
    const kept = ctx.keepLogins.has(row.username);
    const first = s.firstName(ctx.salt, id);
    const last = s.lastName(ctx.salt, id);
    const synthetic = {
      username: kept ? row.username : s.username(ctx.salt, id),
      firstName: first,
      lastName: last,
      displayName: row.displayName == null ? null : `${first} ${last}`,
      email: s.email(ctx.salt, id),
      phone: s.phoneAt(index),
    };
    ctx.users.set(id, synthetic);
    if (kept) ctx.keptUsernames.add(row.username);
    if (typeof row.username === 'string') ctx.byUsername.set(row.username.toLowerCase(), synthetic.username);
    if (typeof row.email === 'string') ctx.byEmail.set(row.email.toLowerCase(), synthetic.email);
    if (typeof row.phoneNumber === 'string' && row.phoneNumber) ctx.byPhone.set(normalizePhone(row.phoneNumber), synthetic.phone);
    identityWords(row).forEach((w) => ctx.identityWords.add(w));
  });
  ctx.missingKeepLogins = [...ctx.keepLogins].filter((u) => !ctx.keptUsernames.has(u));
}

async function transformUser(p, ctx) {
  const { doc, id } = p;
  const u = ctx.users.get(id);
  const kept = ctx.keptUsernames.has(doc.username);
  p.set('username', u.username)
    .set('firstName', u.firstName)
    .set('lastName', u.lastName)
    .set('email', u.email)
    .set('usernameHistory', [])
    .set('searchTokens', s.searchTokensFor(u));
  if (doc.displayName != null) p.set('displayName', u.displayName);
  p.replace('bio', () => s.sentence(ctx.salt, id, 'bio'));
  p.replace('phoneNumber', () => u.phone).replace('phoneCountryCode', () => s.SYNTHETIC_PHONE_COUNTRY);
  p.replace('birthDate', () => s.date(ctx.salt, 1970, 30, id, 'birth'));
  p.dropFile('avatar').dropFile('banner');
  p.ip('lastLoginIp', 'registrationIp').userAgent('lastLoginDevice', 'registrationDevice');
  p.nullify('lastLoginLocation', 'registrationLocation');
  p.nullify(
    'emailVerificationToken', 'emailVerificationCode', 'phoneVerificationCode',
    'pendingEmail', 'pendingEmailVerificationToken', 'pendingPhoneNumber', 'pendingPhoneVerificationCode',
    'claimedEmail', 'twoFactorSecret', 'twoFactorPendingSecret', 'twoFactorChallengeHash',
    'twoFactorChallengeExpiresAt', 'twoFactorEnabledAt', 'signalIdentityKeyPublic', 'signalIdentityKeyPrivate',
  );
  p.emptyArrays('twoFactorBackupCodes');
  if (kept) {
    const issued = await ctx.issuePassword();
    if (issued) {
      p.set('password', issued.hash);
      ctx.keptCredentials.push({ username: doc.username, password: issued.password });
    }
  } else if (typeof doc.password === 'string' && doc.password) {
    p.set('password', await ctx.hashRandomPassword());
  }
}

function transformContact(p, ctx) {
  const { doc, id } = p;
  p.token('contactKey');
  p.replace('displayName', () => s.fullName(ctx.salt, id, 'contact'));
  if (Array.isArray(doc.phoneNumbers)) p.set('phoneNumbers', doc.phoneNumbers.map((v, i) => ctx.byPhone.get(normalizePhone(v)) ?? s.phone(ctx.salt, id, 'p', i)));
  if (Array.isArray(doc.emails)) p.set('emails', doc.emails.map((v, i) => ctx.byEmail.get(String(v).toLowerCase()) ?? s.email(ctx.salt, id, 'e', i)));
  if (Array.isArray(doc.usernames)) p.set('usernames', doc.usernames.map((v, i) => ctx.byUsername.get(String(v).toLowerCase()) ?? s.username(ctx.salt, id, 'u', i)));
}

function transformParticipant(p, ctx) {
  const { doc, id } = p;
  const owner = doc.userId ? ctx.users.get(String(doc.userId)) : null;
  const first = owner?.firstName ?? s.firstName(ctx.salt, id);
  const last = owner?.lastName ?? s.lastName(ctx.salt, id);
  p.replace('displayName', () => owner?.displayName ?? `${first} ${last}`);
  p.replace('nickname', () => first).dropFile('avatar');
  const sessionHash = s.token(ctx.salt, id, 'session');
  p.replace('sessionTokenHash', () => sessionHash);
  const anon = doc.anonymousSession;
  if (!anon) return;
  if (anon.session?.sessionTokenHash) p.set('anonymousSession.session.sessionTokenHash', sessionHash);
  if (anon.profile) {
    p.set('anonymousSession.profile.firstName', first).set('anonymousSession.profile.lastName', last);
    p.set('anonymousSession.profile.username', s.username(ctx.salt, id, 'anon'));
    if (anon.profile.email) p.set('anonymousSession.profile.email', s.email(ctx.salt, id, 'anon'));
    if (anon.profile.birthday) p.set('anonymousSession.profile.birthday', s.date(ctx.salt, 1970, 30, id, 'anon'));
  }
  if (anon.session?.deviceFingerprint) p.set('anonymousSession.session.deviceFingerprint', s.fingerprint(ctx.salt, id, 'anon'));
  if (anon.session && 'ipAddress' in anon.session) p.unset('anonymousSession.session.ipAddress');
}

function transformMessage(p, ctx) {
  const { doc } = p;
  p.text('content').json('translations', 'metadata').nullify('encryptedContent', 'encryptionMetadata');
  if (Array.isArray(doc.validatedMentions) && doc.validatedMentions.length > 0) {
    p.set('validatedMentions', doc.validatedMentions.map((v) => ctx.byUsername.get(String(v).toLowerCase())).filter(Boolean));
  }
}

function transformMedia(p, ctx) {
  const { doc, id } = p;
  p.replace('fileName', (v) => s.fileName(ctx.salt, v, id, 'name'));
  p.replace('originalName', (v) => s.fileName(ctx.salt, v, id, 'original'));
  p.file('filePath').file('fileUrl').file('thumbnailPath', { mimeType: 'image/png' }).file('thumbnailUrl', { mimeType: 'image/png' });
  p.nullify('thumbHash').json('imageVariants');
  if (doc.imageVariants != null) p.set('imageVariants', null);
  p.text('title', 'alt', 'caption', 'moderationReason');
  p.nullify(...ATTACHMENT_CRYPTO);
  p.json('captionTranslations', 'altTranslations', 'transcription', 'translations', 'metadata');
}

const t = (fields) => fields;

const ATTACHMENT_CRYPTO = ['encryptionIv', 'encryptionAuthTag', 'encryptionHmac', 'thumbnailEncryptionIv', 'thumbnailEncryptionAuthTag', 'serverKeyId', 'originalFileHash', 'encryptedFileHash'];

const AGENT_DESCRIPTORS = ['tone', 'vocabularyLevel', 'typicalLength', 'emojiUsage'];
const AGENT_ROLE_DESCRIPTORS = [
  ...AGENT_DESCRIPTORS, 'engagementLevel', 'dominantEmotions', 'overrideTone', 'overrideVocabularyLevel', 'overrideTypicalLength', 'overrideEmojiUsage',
  'traitVerbosity', 'traitFormality', 'traitResponseSpeed', 'traitInitiativeRate', 'traitClarity', 'traitArgumentation', 'traitSocialStyle',
  'traitAssertiveness', 'traitAgreeableness', 'traitHumor', 'traitEmotionality', 'traitOpenness', 'traitConfidence', 'traitCreativity',
  'traitPatience', 'traitAdaptability', 'traitEmpathy', 'traitPoliteness', 'traitLeadership', 'traitConflictStyle', 'traitSupportiveness',
  'traitDiplomacy', 'traitTrustLevel', 'traitEmotionalStability', 'traitPositivity', 'traitSensitivity', 'traitStressResponse',
];
const PREFERENCE_BLOBS = ['privacy', 'audio', 'message', 'notification', 'video', 'document', 'application', 'social'];
const settingChecks = (fields) => Object.fromEntries(fields.map((f) => [f, ok.setting]));

/** Préfixe de famille gardé (`aff_`, `mshy_`), tirage remplacé : la valeur d'origine est une CAPACITÉ. */
function capability(p, ctx, key, fallbackPrefix) {
  const value = p.doc[key];
  if (typeof value !== 'string' || value === '') return null;
  const prefix = value.includes('_') ? value.split('_')[0] : fallbackPrefix;
  const fresh = `${prefix}_${s.hex(ctx.salt, 16, p.id, key)}`;
  p.set(key, fresh);
  return fresh;
}
const isCapability = (v) => v == null || /_[0-9a-f]{16}$/.test(v);

/**
 * Les champs dont le NOM évoque un secret, une clé ou un jeton et qu'on laisse
 * en place, chacun avec sa raison. Un témoin balaie `schema.prisma` : un tel
 * champ qui n'est ni traité par l'inventaire ni nommé ici le fait échouer.
 */
export const SECRET_EXEMPTIONS = Object.freeze({
  'AnonymousSession.shareLinkId': 'identifiant Mongo du lien de partage (pas le lien lui-même, dont linkId et identifier sont régénérés)',
  'User.referralCode': 'code de parrainage public, partagé par son titulaire ; il attribue une inscription et n’ouvre aucune session',
  'Conversation.lastReactionTargetKey': 'clé composée d’identifiants de la dernière cible de réaction, ni secret ni donnée personnelle',
  'MessageAttachment.codec': 'nom de codec audio (opus, aac), donnée de format',
  'MessageAttachment.videoCodec': 'nom de codec vidéo (h264, vp9), donnée de format',
  'PostMedia.codec': 'nom de codec du média, donnée de format',
  'UserPreference.key': 'nom d’un réglage (sa valeur est nettoyée), donnée de structure',
  'ConversationPreference.key': 'nom d’un réglage (sa valeur est nettoyée), donnée de structure',
  'AgentTopicCatalog.keywordPatterns': 'catalogue éditorial de sujets de l’agent, sans donnée d’utilisateur',
  'EngagementCounter.axisKey': 'nom d’un axe d’engagement, clé technique du barème',
  'EngagementMilestone.milestoneKey': 'nom d’un palier d’engagement, clé technique du barème',
  'EngagementConversationCredit.axisKey': 'nom d’un axe d’engagement, clé technique du barème',
  'EngagementSignatureCredit.axisKey': 'nom d’un axe d’engagement, clé technique du barème',
  'EngagementSignatureCredit.signature': 'sha256 d’identifiants Mongo triés (dédoublonnage), aucune donnée personnelle ni secret',
  'EngagementQuota.operationKey': 'nom d’une opération créditée, clé technique (les seaux visit:* sont purgés)',
  'EngagementScaleConfig.key': 'nom d’une configuration de barème, donnée éditoriale',
  'DailyMission.dayKey': 'jour civil AAAA-MM-JJ, clé technique du jeu',
  'DailyMission.templateKey': 'nom d’un gabarit de mission, donnée éditoriale',
  'GameDay.dayKey': 'jour civil AAAA-MM-JJ, clé technique du jeu',
  'LeaguePseudonym.pseudonymKey': 'clé d’unicité d’un pseudonyme GÉNÉRÉ par le jeu (déjà un alias)',
  'LeagueGroupWeek.weekKey': 'semaine ISO, clé technique de la ligue',
  'LeagueMembership.weekKey': 'semaine ISO, clé technique de la ligue',
  'GameWeekPoints.weekKey': 'semaine ISO, clé technique du jeu',
  'GameWeekPoints.dayKey': 'jour civil, clé technique du jeu',
  'GameDuo.weekKey': 'semaine ISO, clé technique du jeu',
  'GameDuo.templateKey': 'nom d’un gabarit de duo, donnée éditoriale',
  'GameDuoSlot.weekKey': 'semaine ISO, clé technique du jeu',
  'GameTrophy.key': 'nom d’un trophée, donnée éditoriale',
  'AchievementRarityStat.milestoneKey': 'nom d’un palier, statistique agrégée sans individu',
  'StickerPackItem.key': 'clé d’un sticker éditorial, sans donnée d’utilisateur',
});

/** Champs de types COMPOSITES (Prisma `type`) couverts par le modèle qui les embarque. */
export const NESTED_COVERAGE = Object.freeze({
  'AnonymousSessionDetails.sessionTokenHash': 'Participant.anonymousSession',
  'AnonymousSessionDetails.deviceFingerprint': 'Participant.anonymousSession',
});

export const INVENTORY = Object.freeze([
  {
    model: 'User', collection: 'User', action: 'transform', prepare: prepareUsers, transform: transformUser,
    fields: t(['username', 'usernameHistory', 'firstName', 'lastName', 'displayName', 'bio', 'email', 'phoneNumber', 'phoneCountryCode', 'searchTokens', 'password', 'avatar', 'banner', 'birthDate', 'lastLoginIp', 'lastLoginLocation', 'lastLoginDevice', 'registrationIp', 'registrationLocation', 'registrationDevice', 'emailVerificationToken', 'emailVerificationCode', 'phoneVerificationCode', 'pendingEmail', 'pendingEmailVerificationToken', 'pendingPhoneNumber', 'pendingPhoneVerificationCode', 'claimedEmail', 'twoFactorSecret', 'twoFactorBackupCodes', 'twoFactorPendingSecret', 'twoFactorChallengeHash', 'twoFactorChallengeExpiresAt', 'twoFactorEnabledAt', 'signalIdentityKeyPublic', 'signalIdentityKeyPrivate']),
    checks: { username: ok.username, firstName: ok.name, lastName: ok.name, displayName: ok.name, bio: ok.text, email: ok.email, phoneNumber: ok.phone, avatar: ok.absent, banner: ok.absent, birthDate: ok.date, lastLoginIp: ok.ip, registrationIp: ok.ip, lastLoginDevice: ok.userAgent, registrationDevice: ok.userAgent, lastLoginLocation: ok.absent, registrationLocation: ok.absent, pendingEmail: ok.absent, pendingPhoneNumber: ok.absent, claimedEmail: ok.absent, twoFactorSecret: ok.absent, twoFactorPendingSecret: ok.absent, signalIdentityKeyPrivate: ok.absent, usernameHistory: ok.empty, twoFactorBackupCodes: ok.empty },
  },
  {
    model: 'UserContact', collection: 'UserContact', action: 'transform', transform: transformContact,
    fields: t(['contactKey', 'displayName', 'phoneNumbers', 'emails', 'usernames']),
    checks: { contactKey: ok.token, displayName: ok.name, phoneNumbers: ok.phones, emails: ok.emails, usernames: ok.usernames },
  },
  {
    model: 'Participant', collection: 'Participant', action: 'transform', transform: transformParticipant,
    fields: t(['displayName', 'nickname', 'avatar', 'sessionTokenHash', 'anonymousSession']),
    checks: { displayName: ok.name, nickname: ok.name, avatar: ok.absent, sessionTokenHash: ok.token, anonymousSession: ok.json },
  },
  {
    model: 'Message', collection: 'Message', action: 'transform', transform: transformMessage,
    fields: t(['content', 'translations', 'metadata', 'encryptedContent', 'encryptionMetadata', 'validatedMentions']),
    checks: { content: ok.text, translations: ok.json, metadata: ok.json, encryptedContent: ok.absent, validatedMentions: ok.usernames },
  },
  {
    model: 'MessageAttachment', collection: 'MessageAttachment', action: 'transform', transform: transformMedia,
    fields: t(['fileName', 'originalName', 'filePath', 'fileUrl', 'thumbnailPath', 'thumbnailUrl', 'thumbHash', 'imageVariants', 'title', 'alt', 'caption', 'captionTranslations', 'moderationReason', 'transcription', 'translations', 'metadata', ...ATTACHMENT_CRYPTO]),
    checks: { ...Object.fromEntries(ATTACHMENT_CRYPTO.map((f) => [f, ok.absent])), fileName: ok.fileName, originalName: ok.fileName, filePath: ok.placeholder, fileUrl: ok.placeholder, thumbnailPath: ok.placeholder, thumbnailUrl: ok.placeholder, thumbHash: ok.absent, imageVariants: ok.absent, title: ok.text, alt: ok.text, caption: ok.text, captionTranslations: ok.json, transcription: ok.json, translations: ok.json, metadata: ok.json },
  },
  {
    model: 'PostMedia', collection: 'PostMedia', action: 'transform', transform: transformMedia,
    fields: t(['fileName', 'originalName', 'filePath', 'fileUrl', 'thumbnailPath', 'thumbnailUrl', 'thumbHash', 'caption', 'alt', 'captionTranslations', 'altTranslations', 'transcription', 'translations']),
    checks: { fileName: ok.fileName, originalName: ok.fileName, filePath: ok.placeholder, fileUrl: ok.placeholder, thumbnailPath: ok.placeholder, thumbnailUrl: ok.placeholder, thumbHash: ok.absent, caption: ok.text, alt: ok.text, captionTranslations: ok.json, altTranslations: ok.json, transcription: ok.json, translations: ok.json },
  },
  {
    model: 'Post', collection: 'Post', action: 'transform',
    transform: (p) => p.text('content').json('translations', 'metadata', 'geoPoint', 'storyEffects', 'reactions', 'storyViews').file('audioUrl', { mimeType: 'audio/mpeg' }),
    fields: t(['content', 'translations', 'metadata', 'geoPoint', 'storyEffects', 'audioUrl', 'reactions', 'storyViews']),
    checks: { content: ok.text, translations: ok.json, metadata: ok.json, geoPoint: ok.json, storyEffects: ok.json, audioUrl: ok.placeholder, reactions: ok.json, storyViews: ok.json },
  },
  {
    model: 'PostComment', collection: 'PostComment', action: 'transform',
    transform: (p) => p.text('content').json('translations', 'metadata'),
    fields: t(['content', 'translations', 'metadata']),
    checks: { content: ok.text, translations: ok.json, metadata: ok.json },
  },
  {
    model: 'PostInteractiveResponse', collection: 'PostInteractiveResponse', action: 'transform',
    transform: (p) => p.text('text'), fields: t(['text']), checks: { text: ok.text },
  },
  {
    model: 'Sound', collection: 'StoryBackgroundAudio', action: 'transform',
    transform: (p) => p.label('title').file('fileUrl', { mimeType: 'audio/mpeg' }).file('coverUrl', { mimeType: 'image/png' }).nullify('coverThumbHash').json('translations').token('contentHash'),
    fields: t(['title', 'fileUrl', 'coverUrl', 'coverThumbHash', 'translations', 'contentHash']),
    checks: { contentHash: ok.token, title: ok.text, fileUrl: ok.placeholder, coverUrl: ok.placeholder, coverThumbHash: ok.absent, translations: ok.json },
  },
  {
    model: 'UserSticker', collection: 'UserSticker', action: 'transform',
    transform: (p) => p.label('name').file('filePath', { mimeType: 'image/png' }).token('contentHash'),
    fields: t(['name', 'filePath', 'contentHash']), checks: { name: ok.text, filePath: ok.placeholder, contentHash: ok.token },
  },
  {
    model: 'Conversation', collection: 'Conversation', action: 'transform',
    transform: (p, ctx) => {
      if (p.doc.type !== 'global') p.label('title');
      p.text('description').dropFile('avatar').dropFile('banner').nullify('serverEncryptionKeyId');
      identifier(p, ctx);
    },
    fields: t(['identifier', 'title', 'description', 'avatar', 'banner', 'serverEncryptionKeyId']),
    checks: { serverEncryptionKeyId: ok.absent, identifier: identifierCheck, title: (v, doc) => doc.type === 'global' || ok.text(v), description: ok.text, avatar: ok.absent, banner: ok.absent },
  },
  {
    model: 'Community', collection: 'Community', action: 'transform',
    transform: (p, ctx) => {
      p.label('name').text('description').dropFile('avatar').dropFile('banner');
      identifier(p, ctx);
    },
    fields: t(['identifier', 'name', 'description', 'avatar', 'banner']),
    checks: { identifier: identifierCheck, name: ok.text, description: ok.text, avatar: ok.absent, banner: ok.absent },
  },
  {
    model: 'ConversationShare', collection: 'ConversationShare', action: 'transform',
    transform: (p) => p.label('title').text('description'),
    fields: t(['title', 'description']), checks: { title: ok.text, description: ok.text },
  },
  {
    model: 'ConversationShareLink', collection: 'ConversationShareLink', action: 'transform',
    transform: (p, ctx) => {
      p.label('name').text('description');
      if (Array.isArray(p.doc.allowedIpRanges) && p.doc.allowedIpRanges.length > 0) p.set('allowedIpRanges', ['192.0.2.0/24']);
      const linkId = capability(p, ctx, 'linkId', 'mshy');
      if (p.doc.identifier === p.doc.linkId && linkId) p.set('identifier', linkId);
      else capability(p, ctx, 'identifier', 'mshy');
    },
    fields: t(['linkId', 'identifier', 'name', 'description', 'allowedIpRanges']),
    checks: { linkId: isCapability, identifier: isCapability, name: ok.text, description: ok.text, allowedIpRanges: (v) => ok.empty(v) || (v.length === 1 && v[0] === '192.0.2.0/24') },
  },
  {
    model: 'UserConversationPreferences', collection: 'UserConversationPreferences', action: 'transform',
    transform: (p, ctx) => {
      p.label('customName');
      if (Array.isArray(p.doc.tags) && p.doc.tags.length > 0) p.set('tags', p.doc.tags.map((_, i) => s.label(ctx.salt, p.id, 'tag', i)));
    },
    fields: t(['customName', 'tags']), checks: { customName: ok.text, tags: ok.texts },
  },
  { model: 'UserConversationCategory', collection: 'UserConversationCategory', action: 'transform', transform: (p) => p.label('name'), fields: t(['name']), checks: { name: ok.text } },
  { model: 'UserCommunityPreferences', collection: 'UserCommunityPreferences', action: 'transform', transform: (p) => p.label('customName'), fields: t(['customName']), checks: { customName: ok.text } },
  { model: 'FriendRequest', collection: 'FriendRequest', action: 'transform', transform: (p) => p.text('message'), fields: t(['message']), checks: { message: ok.text } },
  {
    model: 'Notification', collection: 'Notification', action: 'transform',
    transform: (p) => p.label('title', 'subtitle').text('content').json('actor', 'context', 'metadata', 'delivery'),
    fields: t(['title', 'subtitle', 'content', 'actor', 'context', 'metadata', 'delivery']),
    checks: { delivery: ok.json, title: ok.text, subtitle: ok.text, content: ok.text, actor: ok.json, context: ok.json, metadata: ok.json },
  },
  {
    model: 'Report', collection: 'Report', action: 'transform',
    transform: (p, ctx) => p.replace('reporterName', () => s.fullName(ctx.salt, p.id, 'reporter')).text('reason', 'moderatorNotes'),
    fields: t(['reporterName', 'reason', 'moderatorNotes']), checks: { reporterName: ok.name, reason: ok.text, moderatorNotes: ok.text },
  },
  { model: 'Ban', collection: 'Ban', action: 'transform', transform: (p) => p.text('reason', 'liftReason'), fields: t(['reason', 'liftReason']), checks: { reason: ok.text, liftReason: ok.text } },
  {
    model: 'AdminAuditLog', collection: 'AdminAuditLog', action: 'transform',
    transform: (p) => p.nullify('changes', 'metadata').ip('ipAddress').userAgent('userAgent'),
    fields: t(['changes', 'metadata', 'ipAddress', 'userAgent']),
    checks: { changes: ok.absent, metadata: ok.absent, ipAddress: ok.ip, userAgent: ok.userAgent },
  },
  {
    model: 'EmailInvitation', collection: 'EmailInvitation', action: 'transform',
    transform: (p, ctx) => p.replace('email', (v) => ctx.byEmail.get(v.toLowerCase()) ?? s.email(ctx.salt, p.id, 'invite')),
    fields: t(['email']), checks: { email: ok.email },
  },
  {
    model: 'TrackingLink', collection: 'TrackingLink', action: 'transform',
    transform: (p, ctx) => {
      p.label('name').replace('originalUrl', () => `https://${s.EMAIL_DOMAIN}/${s.hex(ctx.salt, 16, p.id, 'url')}`);
      const old = p.doc.token;
      const fresh = s.hex(ctx.salt, 12, p.id, 'token');
      if (typeof old === 'string' && old) p.set('token', fresh);
      if (typeof p.doc.shortUrl === 'string' && p.doc.shortUrl) {
        const base = p.doc.shortUrl.slice(0, p.doc.shortUrl.lastIndexOf('/') + 1);
        p.set('shortUrl', `${base}${fresh}`);
      }
    },
    fields: t(['name', 'originalUrl', 'token', 'shortUrl']),
    checks: { token: (v) => v == null || /^[0-9a-f]{12}$/.test(v), shortUrl: (v, doc) => v == null || v.endsWith(`/${doc.token}`), name: ok.text, originalUrl: (v) => typeof v === 'string' && v.startsWith(`https://${s.EMAIL_DOMAIN}/`) },
  },
  {
    model: 'TrackingLinkClick', collection: 'TrackingLinkClick', action: 'transform',
    transform: (p) => p.ip('ipAddress').userAgent('userAgent').fingerprint('deviceFingerprint').nullify('city', 'region', 'referrer'),
    fields: t(['ipAddress', 'userAgent', 'deviceFingerprint', 'city', 'region', 'referrer']),
    checks: { ipAddress: ok.ip, userAgent: ok.userAgent, deviceFingerprint: ok.token, city: ok.absent, region: ok.absent, referrer: ok.absent },
  },
  {
    model: 'AffiliateToken', collection: 'AffiliateToken', action: 'transform',
    transform: (p, ctx) => {
      p.label('name');
      capability(p, ctx, 'token', 'aff');
    },
    fields: t(['name', 'token']), checks: { name: ok.text, token: isCapability },
  },
  { model: 'AffiliateVisitSession', collection: 'AffiliateVisitSession', action: 'transform', transform: (p) => p.token('sessionKey'), fields: t(['sessionKey']), checks: { sessionKey: ok.token } },
  {
    model: 'PostEngagement', collection: 'PostEngagement', action: 'transform',
    transform: (p) => p.token('sessionId').json('actions', 'watchSamples'),
    fields: t(['sessionId', 'actions', 'watchSamples']), checks: { sessionId: ok.token, actions: ok.json, watchSamples: ok.json },
  },
  {
    model: 'UserPreferences', collection: 'user_preferences', action: 'transform',
    transform: (p) => p.settingsJson(...PREFERENCE_BLOBS),
    fields: t(PREFERENCE_BLOBS), checks: Object.fromEntries(PREFERENCE_BLOBS.map((f) => [f, ok.settingsJson])),
  },
  {
    model: 'UserPreference', collection: 'user_preference', action: 'transform',
    transform: (p) => p.settings('value').label('description'), fields: t(['value', 'description']), checks: { value: ok.setting, description: ok.text },
  },
  {
    model: 'ConversationPreference', collection: 'ConversationPreference', action: 'transform',
    transform: (p) => p.settings('value').label('description'), fields: t(['value', 'description']), checks: { value: ok.setting, description: ok.text },
  },
  { model: 'MeeshLedger', collection: 'MeeshLedger', action: 'transform', transform: (p) => p.json('meta'), fields: t(['meta']), checks: { meta: ok.json } },
  { model: 'GloryLedger', collection: 'GloryLedger', action: 'transform', transform: (p) => p.json('meta'), fields: t(['meta']), checks: { meta: ok.json } },
  { model: 'CallSession', collection: 'CallSession', action: 'transform', transform: (p) => p.json('metadata'), fields: t(['metadata']), checks: { metadata: ok.json } },
  { model: 'CallParticipant', collection: 'CallParticipant', action: 'transform', transform: (p) => p.json('analytics', 'feedback'), fields: t(['analytics', 'feedback']), checks: { analytics: ok.json, feedback: ok.json } },
  { model: 'Transcription', collection: 'Transcription', action: 'transform', transform: (p) => p.text('text'), fields: t(['text']), checks: { text: ok.text } },
  { model: 'TranslationCall', collection: 'TranslationCall', action: 'transform', transform: (p) => p.text('translatedText'), fields: t(['translatedText']), checks: { translatedText: ok.text } },
  {
    model: 'SecurityEvent', collection: 'SecurityEvent', action: 'transform',
    transform: (p) => p.label('description').json('metadata').ip('ipAddress').userAgent('userAgent').fingerprint('deviceFingerprint').nullify('geoLocation'),
    fields: t(['description', 'metadata', 'ipAddress', 'userAgent', 'deviceFingerprint', 'geoLocation']),
    checks: { description: ok.text, metadata: ok.json, ipAddress: ok.ip, userAgent: ok.userAgent, deviceFingerprint: ok.token, geoLocation: ok.absent },
  },
  {
    model: 'UserSession', collection: 'UserSession', action: 'transform',
    transform: (p) =>
      p.token('sessionToken').nullify('refreshToken', 'city', 'location', 'latitude', 'longitude')
        .ip('ipAddress').userAgent('userAgent').fingerprint('deviceFingerprint')
        .replace('deviceName', () => s.SYNTHETIC_DEVICE),
    fields: t(['sessionToken', 'refreshToken', 'ipAddress', 'city', 'location', 'latitude', 'longitude', 'userAgent', 'deviceFingerprint', 'deviceName']),
    checks: { sessionToken: ok.token, refreshToken: ok.absent, ipAddress: ok.ip, city: ok.absent, location: ok.absent, latitude: ok.absent, longitude: ok.absent, userAgent: ok.userAgent, deviceFingerprint: ok.token, deviceName: (v) => v == null || v === s.SYNTHETIC_DEVICE },
  },
  {
    model: 'UserVoiceModel', collection: 'UserVoiceModel', action: 'transform',
    transform: (p) => p.nullify('embedding', 'chatterboxConditionals', 'trainingAudioSamples', 'voiceCharacteristics', 'fingerprint', 'signatureShort').dropFile('embeddingPath').dropFile('referenceAudioUrl'),
    fields: t(['embedding', 'chatterboxConditionals', 'embeddingPath', 'referenceAudioUrl', 'trainingAudioSamples', 'voiceCharacteristics', 'fingerprint', 'signatureShort']),
    checks: { embedding: ok.absent, chatterboxConditionals: ok.absent, embeddingPath: ok.absent, referenceAudioUrl: ok.absent, trainingAudioSamples: ok.absent, voiceCharacteristics: ok.absent, fingerprint: ok.absent, signatureShort: ok.absent },
  },
  {
    model: 'AccountDeletionRequest', collection: 'account_deletion_requests', action: 'transform',
    transform: (p) => p.token('confirmTokenHash', 'cancelTokenHash'),
    fields: t(['confirmTokenHash', 'cancelTokenHash']), checks: { confirmTokenHash: ok.token, cancelTokenHash: ok.token },
  },
  { model: 'AnonymousPostOpen', collection: 'AnonymousPostOpen', action: 'transform', transform: (p) => p.token('sessionKey'), fields: t(['sessionKey']), checks: { sessionKey: ok.token } },
  {
    model: 'AgentLlmConfig', collection: 'AgentLlmConfig', action: 'transform',
    transform: (p) => p.replace('apiKeyEncrypted', () => '').nullify('fallbackApiKeyEncrypted'),
    fields: t(['apiKeyEncrypted', 'fallbackApiKeyEncrypted']), checks: { apiKeyEncrypted: (v) => v === '' || v == null, fallbackApiKeyEncrypted: ok.absent },
  },
  {
    model: 'AgentGlobalProfile', collection: 'AgentGlobalProfile', action: 'transform',
    transform: (p) => p.text('personaSummary').settings(...AGENT_DESCRIPTORS).emptyArrays('catchphrases', 'topicsOfExpertise', 'topicsAvoided', 'responsePatterns', 'commonEmojis', 'reactionPatterns'),
    fields: t(['personaSummary', ...AGENT_DESCRIPTORS, 'catchphrases', 'topicsOfExpertise', 'topicsAvoided', 'responsePatterns', 'commonEmojis', 'reactionPatterns']),
    checks: { ...settingChecks(AGENT_DESCRIPTORS), personaSummary: ok.text, catchphrases: ok.empty, responsePatterns: ok.empty },
  },
  {
    model: 'AgentUserRole', collection: 'AgentUserRole', action: 'transform',
    transform: (p) => {
      p.text('personaSummary').settings(...AGENT_ROLE_DESCRIPTORS).emptyArrays('catchphrases', 'responseTriggers', 'silenceTriggers', 'topicsOfExpertise', 'topicsAvoided', 'commonEmojis', 'reactionPatterns');
      if (p.doc.relationshipMap != null) p.set('relationshipMap', {});
    },
    fields: t(['personaSummary', ...AGENT_ROLE_DESCRIPTORS, 'catchphrases', 'responseTriggers', 'silenceTriggers', 'topicsOfExpertise', 'topicsAvoided', 'commonEmojis', 'reactionPatterns', 'relationshipMap']),
    checks: { ...settingChecks(AGENT_ROLE_DESCRIPTORS), personaSummary: ok.text, catchphrases: ok.empty, responseTriggers: ok.empty, silenceTriggers: ok.empty },
  },
  { model: 'ConversationMessageStats', collection: 'ConversationMessageStats', action: 'transform', transform: (p) => p.json('participantStats'), fields: t(['participantStats']), checks: { participantStats: ok.json } },
  { model: 'LeagueGroupWeek', collection: 'LeagueGroupWeek', action: 'transform', transform: (p) => p.json('snapshot'), fields: t(['snapshot']), checks: { snapshot: ok.json } },
  { model: 'MessageStatusEntry', collection: 'MessageStatusEntry', action: 'constant', fields: t(['readDevice']), filter: { readDevice: { $nin: [null, s.SYNTHETIC_DEVICE] } }, update: { $set: { readDevice: s.SYNTHETIC_DEVICE } }, checks: { readDevice: (v) => v == null || v === s.SYNTHETIC_DEVICE } },
  { model: 'AttachmentStatusEntry', collection: 'AttachmentStatusEntry', action: 'constant', fields: t(['accessDevice']), filter: { accessDevice: { $nin: [null, s.SYNTHETIC_DEVICE] } }, update: { $set: { accessDevice: s.SYNTHETIC_DEVICE } }, checks: { accessDevice: (v) => v == null || v === s.SYNTHETIC_DEVICE } },
  { model: 'EngagementQuota', collection: 'EngagementQuota', action: 'purge', fields: t(['bucket']), filter: { bucket: { $regex: '^visit:' } } },
  { model: 'PushToken', collection: 'PushToken', action: 'purge', fields: t(['token', 'deviceName']) },
  { model: 'PasswordResetToken', collection: 'PasswordResetToken', action: 'purge', fields: t(['tokenHash', 'ipAddress', 'userAgent', 'deviceFingerprint', 'geoLocation', 'geoCoordinates']) },
  { model: 'PhonePasswordResetToken', collection: 'PhonePasswordResetToken', action: 'purge', fields: t(['codeHash', 'ipAddress', 'userAgent', 'geoLocation']) },
  { model: 'MagicLinkToken', collection: 'MagicLinkToken', action: 'purge', fields: t(['tokenHash', 'ipAddress', 'userAgent', 'deviceFingerprint', 'geoLocation', 'geoCoordinates']) },
  { model: 'EmailVerificationWatch', collection: 'EmailVerificationWatch', action: 'purge', fields: t(['tokenHash']) },
  { model: 'PasswordHistory', collection: 'PasswordHistory', action: 'purge', fields: t(['passwordHash', 'ipAddress', 'userAgent']) },
  { model: 'SignalPreKeyBundle', collection: 'SignalPreKeyBundle', action: 'purge', fields: t(['identityKey', 'identityKeyPrivate', 'preKeyPublic', 'signedPreKeyPublic', 'signedPreKeySignature', 'signedPreKeyPrivate', 'kyberPreKeyPublic', 'kyberPreKeySignature', 'preKeyPool']) },
  { model: 'ConversationPublicKey', collection: 'ConversationPublicKey', action: 'purge', fields: t(['keyType', 'publicKey', 'signature']) },
  { model: 'DMAEnrollment', collection: 'DMAEnrollment', action: 'purge', fields: t(['identityKey', 'signedPreKey', 'signedPreKeySignature']) },
  { model: 'PreKey', collection: 'PreKey', action: 'purge', fields: t(['keyData']) },
  { model: 'DMASession', collection: 'DMASession', action: 'purge', fields: t(['rootKey', 'chainKeySend', 'chainKeyReceive', 'dhRatchetPublicKey', 'dhRatchetPrivateKey', 'dhRatchetRemoteKey', 'sessionType', 'sessionState']) },
  { model: 'ServerEncryptionKey', collection: 'ServerEncryptionKey', action: 'purge', fields: t(['encryptedKey', 'iv', 'authTag']) },
  { model: 'AgentConversationSummary', collection: 'AgentConversationSummary', action: 'purge', fields: t(['summary', 'currentTopics']) },
  { model: 'AgentAnalysisSnapshot', collection: 'AgentAnalysisSnapshot', action: 'purge', fields: t(['participantSnapshots', 'topTopics']) },
  { model: 'AgentScanLog', collection: 'AgentScanLog', action: 'purge', fields: t(['nodeResults', 'configSnapshot']) },
  { model: 'OrphanMediaCleanup', collection: 'OrphanMediaCleanup', action: 'purge', fields: t(['fileUrl']) },
]);
