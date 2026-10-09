// La base de témoin (#9663) : des données SYNTHÉTIQUES qui ont la FORME des
// données réelles (domaine `.test`, plages privées, noms inventés), une par
// famille de champ que le script doit traiter.

export const KEPT_PASSWORD = 'Recette#2026';
export const USER_PASSWORD = 'MotDePasse!1';

export async function seed(db, { ObjectId, Binary, bcrypt }) {
  const ids = Object.fromEntries(['jeanne', 'recette', 'lien', 'link', 'group', 'global', 'pA', 'pAnon', 'msg', 'msgE2ee', 'att', 'post', 'contact', 'hashtag', 'pack'].map((k) => [k, new ObjectId()]));
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
      signalIdentityKeyPublic: 'cHVibGljLXJlZWxsZQ==', signalIdentityKeyPrivate: 'cHJpdmVlLXJlZWxsZQ==',
      emailVerificationToken: 'jeton-verif-reel', emailVerificationCode: '482913', phoneVerificationCode: '913482',
      pendingEmailVerificationToken: 'jeton-pending-reel', pendingPhoneNumber: '+33700000002', pendingPhoneVerificationCode: '112233',
      twoFactorPendingSecret: 'NBSWY3DPO5XXE3DE', twoFactorChallengeHash: 'h'.repeat(64), claimedEmail: 'ancienne@real-mail.test',
      lockedReason: 'Trop de tentatives depuis 10.20.30.40 pour jeanne.essai',
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
        extra: { source: 'jeanne', notes2: 'Appelle Jeanne au bureau demain', contactInfo: 'jeanne.essai@real-mail.test', list: ['Jeanne Essai', 'Paul'], deep: [{ who: 'jeanne.essai', count: 3, seen: true }] },
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
  await db.collection('TrackingLinkClick').insertOne({
    trackingLinkId: new ObjectId(), ipAddress: '10.3.3.3', city: 'Lyon', region: 'ARA', userAgent: 'Mozilla/5.0', referrer: 'https://perso.real.test', deviceFingerprint: 'fp-click',
    utmClickSource: 'mail-jeanne', utmClickMedium: 'email', utmClickCampaign: 'anniversaire-jeanne', utmClickTerm: 'jeanne essai', utmClickContent: 'lien-de-jeanne.essai@real-mail.test',
  });
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
    application: { theme: 'dark', accentColor: 'blue', interfaceLanguage: 'fr', downloadPath: '/Users/jeanne.essai/Downloads', signature: 'Jeanne, maman de Léo', voiceProfile: 'jeanne', homeCity: 'Villeurbanne', wifi: 'Livebox-7F3A' },
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
  await db.collection('AgentLlmConfig').insertOne({ provider: 'openai', model: 'gpt-4o-mini', apiKeyEncrypted: 'sk-cle-reelle-chiffree', fallbackApiKeyEncrypted: 'sk-cle-secours-reelle', baseUrl: 'https://llm.perso.real.test/v1?key=cle-reelle', configuredBy: ids.jeanne });
  await db.collection('PhonePasswordResetToken').insertOne({ userId: ids.jeanne, codeHash: 'c'.repeat(64), verificationStep: 'CODE_SENT', ipAddress: '10.6.6.6', userAgent: 'curl/8', geoLocation: 'Lyon' });
  await db.collection('Report').insertOne({
    reporterId: ids.jeanne, reportedType: 'user', reportedEntityId: ids.recette.toHexString(), reportType: 'harassment', status: 'resolved',
    reporterName: 'Jeanne E.', reason: 'Il harcèle ma fille Léa depuis lundi', moderatorNotes: 'Vu avec Jeanne au téléphone, +33612345678',
    actionTaken: 'Compte de Paul suspendu après appel de Jeanne',
  });
  await db.collection('Hashtag').insertOne({ _id: ids.hashtag, tag: 'jeanneessai40ans', usageCount: 1 });
  await db.collection('PostHashtag').insertOne({ postId: ids.post, hashtagId: ids.hashtag, display: '#JeanneEssai40Ans' });
  await db.collection('StickerPack').insertOne({ _id: ids.pack, slug: 'famille-essai', name: 'Famille Essai', description: 'Les photos de Jeanne Essai et de Léa', author: 'Jeanne Essai', submitterId: ids.jeanne, status: 'rejected', reviewNote: 'Refusé : visage de Léa reconnaissable' });
  await db.collection('StickerPackItem').insertOne({ packId: ids.pack, key: 'k1', title: 'Léa à la plage', emoji: '🏖️', kind: 'image', mimeType: 'image/png', filePath: 'stickers/famille-essai/lea.png' });
  await db.collection('UserStickerPack').insertOne({ userId: ids.recette, packSlug: 'famille-essai' });
  await db.collection('AgentConfig').insertOne({ conversationId: ids.group, agentType: 'personal', agentInstructions: 'Jeanne Essai est enceinte, ne pas en parler devant Paul' });
  await db.collection('AdminBroadcast').insertOne({ name: 'Annonce', subject: 'Nouveautés', body: 'La version 2 est là.', targeting: { activityStatus: 'all' }, status: 'FAILED', errorMessage: 'Échec SMTP pour jeanne.essai@real-mail.test', createdById: ids.recette });
  await db.collection('PostInteractiveResponse').insertOne({ postId: ids.post, objectId: 'poll-1', userId: ids.recette, choice: 'Jeanne a raison, appelle-la au 06 12 34 56 78', text: 'Bravo Jeanne' });
  return ids;
}
