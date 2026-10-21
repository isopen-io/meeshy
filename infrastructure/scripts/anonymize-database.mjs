#!/usr/bin/env node
// Anonymise une base MongoDB de Meeshy, pour le staging (#9663).
//
// Toute copie production → staging passe par ce script AVANT d'être servie.
// Procédure complète (services arrêtés → sauvegarde vérifiée → --dry-run →
// exécution → reconstruction sur volume neuf → contrôle → médias, Redis,
// journaux) : infrastructure/scripts/README-anonymize-database.md.
//
// C'est une PSEUDONYMISATION, pas une anonymisation au sens strict : les
// identifiants Mongo, les horodatages, le graphe social, pays/fuseau/locale et
// les pseudos des comptes --keep-login restent (README, « Ce qui reste »).
//
// Règles :
//  - une valeur synthétique se dérive d'un hachage du SEL de l'exécution (32
//    octets aléatoires, jamais affichés ni conservés) et de l'`_id` du document,
//    JAMAIS de la valeur d'origine ; formats, unicités et relations sont gardés
//    (un contact rapproché d'un compte reçoit le numéro et l'e-mail synthétiques
//    de CE compte) ;
//  - e-mails sous `example.invalid`, numéros dans la plage fictive NANPA
//    555-0100..0199, IP dans les plages de documentation (RFC 5737), textes et
//    noms tirés de lexiques synthétiques — c'est ce qui rend le contrôle final
//    possible : une valeur qui n'a pas une forme synthétique est réputée réelle ;
//  - MONDE FERMÉ : avant toute écriture, `listCollections` ; une collection ni
//    inventoriée ni déclarée sans donnée personnelle (collections.mjs) arrête
//    tout. Chaque champ texte/JSON/binaire du schéma est classé (témoin) ;
//  - CIBLE : après connexion, `hello.setName`/`hello.hosts` doivent être ceux
//    du replica set de staging (guard.mjs), sinon refus ;
//  - mots de passe : haché bcrypt d'un mot de passe aléatoire non conservé ; un
//    compte sans mot de passe (lien magique) le reste. `--keep-login <pseudo>`
//    garde le PSEUDO d'un compte de recette et lui pose un mot de passe NEUF,
//    écrit dans le fichier `--credentials` (mode 600) — jamais le haché
//    d'origine, exploitable si le compte est un compte réel copié de la
//    production ; tout le reste de son profil est anonymisé ;
//  - secrets, jetons, clés et capacités : régénérés ou supprimés. Un témoin
//    balaie `schema.prisma` : tout champ dont le NOM évoque un secret doit être
//    traité ici ou exempté avec sa raison (SECRET_EXEMPTIONS) ;
//  - JSON libres : FERMÉS PAR DÉFAUT — toute chaîne est remplacée, à toute
//    profondeur, sauf forme technique (ObjectId, date, condensé…) ou énumération
//    sous une clé de la liste blanche (anonymize-database/scrub-json.mjs) ;
//  - relancer est sans danger ; avec le MÊME --manifest, la relance reprend
//    l'exécution interrompue (sel, empreintes des mots d'identité, relations) ;
//  - le contrôle final relit TOUT, refuse une base vide ou mal nommée, et
//    échoue tant que `local.oplog.rs` remonte avant l'exécution (les insertions
//    de la restauration y gardent les originaux) — sauf --oplog-rebuild-pending,
//    pour la passe qui précède la reconstruction sur volume neuf.
//
// INVENTAIRE — champ par champ, depuis packages/shared/prisma/schema.prisma
// (l'exécutable est anonymize-database/inventory.mjs ; un témoin tient les deux
// alignés). « synth. » = valeur synthétique déterministe ; « → fichier » =
// remplaçant `anonymized/placeholder.*` + ligne au manifeste des médias.
//
//   User                  username (sauf --keep-login), usernameHistory → [], firstName, lastName,
//                         displayName, bio, email, phoneNumber, phoneCountryCode, searchTokens
//                         (recalculés), password (bcrypt aléatoire ; NEUF pour --keep-login), avatar,
//                         banner (→ null + manifeste), birthDate, lockedReason, lastLoginIp, lastLoginLocation,
//                         lastLoginDevice, registrationIp, registrationLocation, registrationDevice,
//                         emailVerificationToken, emailVerificationCode, phoneVerificationCode,
//                         pendingEmail, pendingEmailVerificationToken, pendingPhoneNumber,
//                         pendingPhoneVerificationCode, claimedEmail, twoFactorSecret,
//                         twoFactorBackupCodes, twoFactorPendingSecret, twoFactorChallengeHash,
//                         twoFactorChallengeExpiresAt, twoFactorEnabledAt, signalIdentityKeyPublic,
//                         signalIdentityKeyPrivate (secrets → null)
//   UserContact           contactKey (régénéré), displayName, phoneNumbers, emails, usernames
//   Participant           displayName, nickname, avatar, sessionTokenHash (régénéré), anonymousSession
//                         (profil : prénom, nom, pseudo, e-mail, naissance ; session : condensé de
//                         jeton, empreinte, ancienne IP retirée)
//   Message               content, translations, metadata (lieux, liens), encryptedContent,
//                         encryptionMetadata (chiffré retiré), validatedMentions (pseudos remappés)
//   MessageAttachment     fileName, originalName, filePath, fileUrl, thumbnailPath, thumbnailUrl
//                         (→ fichier), thumbHash, imageVariants, title, alt, caption,
//                         captionTranslations, moderationReason, transcription, translations
//                         (transcriptions, pistes TTS → fichier), metadata, encryptionIv,
//                         encryptionAuthTag, encryptionHmac, thumbnailEncryptionIv,
//                         thumbnailEncryptionAuthTag, serverKeyId, originalFileHash, encryptedFileHash
//   PostMedia             fileName, originalName, filePath, fileUrl, thumbnailPath, thumbnailUrl,
//                         thumbHash, caption, alt, captionTranslations, altTranslations,
//                         transcription, translations
//   Post                  content, translations, metadata, geoPoint, storyEffects, audioUrl,
//                         reactions, storyViews
//   PostComment           content, translations, metadata
//   PostInteractiveResponse text, choice (réglage : énumération gardée, texte libre remplacé)
//   Hashtag               tag (dérivé de l'_id)
//   PostHashtag           display (suit le tag de son hashtag)
//   StickerPack           slug (dérivé de l'_id), name, description, author, reviewNote
//   StickerPackItem       title, filePath (→ fichier)
//   UserStickerPack       packSlug (suit le slug de son paquet)
//   AgentConfig           agentInstructions
//   AdminBroadcast        errorMessage (→ null)
//   Sound                 title, fileUrl, coverUrl, coverThumbHash, translations, contentHash
//   UserSticker           name, filePath, contentHash
//   Conversation          identifier (s'il n'est pas opaque, hors global/public), title (hors
//                         global), description, avatar, banner, serverEncryptionKeyId (clé purgée)
//   Community             identifier, name, description, avatar, banner
//   ConversationShare     title, description
//   ConversationShareLink linkId, identifier (capacités : régénérés), name, description, allowedIpRanges
//   UserConversationPreferences customName, tags
//   UserConversationCategory name
//   UserCommunityPreferences customName
//   FriendRequest         message
//   Notification          title, subtitle, content, actor, context, metadata, delivery
//   Report                reporterName, reason, moderatorNotes, actionTaken (réglage)
//   Ban                   reason, liftReason
//   AdminAuditLog         changes, metadata (→ null), ipAddress, userAgent
//   EmailInvitation       email
//   TrackingLink          name, originalUrl, token, shortUrl (jeton régénéré)
//   TrackingLinkClick     ipAddress, userAgent, deviceFingerprint, city, region, referrer,
//                         utmClickSource, utmClickMedium, utmClickCampaign, utmClickTerm, utmClickContent
//   AffiliateToken        name, token (jeton d'affiliation régénéré)
//   AffiliateVisitSession sessionKey (régénéré)
//   PostEngagement        sessionId (régénéré), actions, watchSamples
//   UserPreferences       privacy, audio, message, notification, video, document, application, social
//                         (réglages : énumérations gardées, texte libre et chemins remplacés)
//   UserPreference        value (réglage), description
//   ConversationPreference value (réglage), description
//   MeeshLedger           meta
//   GloryLedger           meta
//   CallSession           metadata
//   CallParticipant       analytics, feedback (candidats ICE : IP remplacées)
//   Transcription         text
//   TranslationCall       translatedText
//   SecurityEvent         description, metadata (acteur), ipAddress, userAgent, deviceFingerprint,
//                         geoLocation
//   UserSession           sessionToken (régénéré : toute session tombe), refreshToken, ipAddress,
//                         city, location, latitude, longitude, userAgent, deviceFingerprint,
//                         deviceName
//   UserVoiceModel        embedding, chatterboxConditionals, embeddingPath, referenceAudioUrl,
//                         trainingAudioSamples, voiceCharacteristics, fingerprint, signatureShort
//                         (tous supprimés)
//   AccountDeletionRequest confirmTokenHash, cancelTokenHash (régénérés)
//   AnonymousPostOpen     sessionKey (régénéré)
//   AgentLlmConfig        apiKeyEncrypted, fallbackApiKeyEncrypted (secrets vidés), baseUrl (→ null)
//   AgentGlobalProfile    personaSummary, tone, vocabularyLevel, typicalLength, emojiUsage,
//                         catchphrases, topicsOfExpertise, topicsAvoided, responsePatterns,
//                         commonEmojis, reactionPatterns
//   AgentUserRole         personaSummary, catchphrases, responseTriggers, silenceTriggers,
//                         topicsOfExpertise, topicsAvoided, commonEmojis, reactionPatterns,
//                         relationshipMap, et ses descripteurs (réglages) : tone, vocabularyLevel,
//                         typicalLength, emojiUsage, engagementLevel, dominantEmotions, overrideTone,
//                         overrideVocabularyLevel, overrideTypicalLength, overrideEmojiUsage,
//                         traitVerbosity, traitFormality, traitResponseSpeed, traitInitiativeRate,
//                         traitClarity, traitArgumentation, traitSocialStyle, traitAssertiveness,
//                         traitAgreeableness, traitHumor, traitEmotionality, traitOpenness,
//                         traitConfidence, traitCreativity, traitPatience, traitAdaptability,
//                         traitEmpathy, traitPoliteness, traitLeadership, traitConflictStyle,
//                         traitSupportiveness, traitDiplomacy, traitTrustLevel,
//                         traitEmotionalStability, traitPositivity, traitSensitivity, traitStressResponse
//   ConversationMessageStats participantStats
//   LeagueGroupWeek       snapshot
//   MessageStatusEntry    readDevice (constante)
//   AttachmentStatusEntry accessDevice (constante)
//   Supprimés en entier (jetons, secrets, clés privées, journaux dérivés du contenu) :
//   EngagementQuota       bucket (seaux visit:* seulement, empreintes de visiteurs)
//   PushToken             token, deviceName
//   PasswordResetToken    tokenHash, ipAddress, userAgent, deviceFingerprint, geoLocation, geoCoordinates
//   PhonePasswordResetToken codeHash, ipAddress, userAgent, geoLocation
//   MagicLinkToken        tokenHash, ipAddress, userAgent, deviceFingerprint, geoLocation, geoCoordinates
//   EmailVerificationWatch tokenHash
//   PasswordHistory       passwordHash, ipAddress, userAgent
//   SignalPreKeyBundle    identityKey, identityKeyPrivate, preKeyPublic, signedPreKeyPublic,
//                         signedPreKeySignature, signedPreKeyPrivate, kyberPreKeyPublic,
//                         kyberPreKeySignature, preKeyPool
//   ConversationPublicKey keyType, publicKey, signature
//   DMAEnrollment         identityKey, signedPreKey, signedPreKeySignature
//   PreKey                keyData
//   DMASession            rootKey, chainKeySend, chainKeyReceive, dhRatchetPublicKey,
//                         dhRatchetPrivateKey, dhRatchetRemoteKey, sessionType, sessionState
//   ServerEncryptionKey   encryptedKey, iv, authTag (la passerelle en régénère une à la demande)
//   AgentConversationSummary summary, currentTopics
//   AgentAnalysisSnapshot participantSnapshots, topTopics
//   AgentScanLog          nodeResults, configSnapshot
//   OrphanMediaCleanup    fileUrl
//   SharedTranslation     payload (traduction SCELLÉE d'un message réel, que sa clé ne rouvre plus une fois le message réécrit)
//
// Laissés tels quels, chacun avec sa raison écrite (schema-exemptions.mjs,
// collections.mjs, SECRET_EXEMPTIONS) : identifiants (`_id`, clés étrangères),
// pays ISO et fuseaux, langues, énumérations, compteurs, description grossière
// de l'appareil, contenus éditoriaux de l'équipe (AgentTopicCatalog, annonces
// AdminBroadcast, campagnes TrackingLink), pseudonymes de ligue (déjà des
// alias), `referralCode`.
// FIN DE L'INVENTAIRE

import { chmod, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertExpectedTarget, assertNotProduction, parseMongoTarget, redactUri, ProductionGuardError, STAGING_TARGET } from './anonymize-database/guard.mjs';
import { anonymizeDatabase, newContext, passwordHasher, passwordIssuer } from './anonymize-database/run.mjs';
import { lastRunStart, oplogLeftovers, verifyDatabase } from './anonymize-database/verify.mjs';
import { neutralizeMedia, readManifest } from './anonymize-database/media.mjs';
import { auditCollections } from './anonymize-database/collections.mjs';
import { applyState, manifestJournal, readManifestState } from './anonymize-database/state.mjs';
import { INVENTORY } from './anonymize-database/inventory.mjs';
import { loadBcrypt, loadMongo } from './anonymize-database/deps.mjs';
import { newSalt } from './anonymize-database/synth.mjs';

const USAGE = `Usage :
  anonymize-database.mjs --uri <mongodb://…/base> --manifest <fichier.jsonl> [--dry-run | --i-know-this-is-not-production]
                         [--keep-login <pseudo>]… [--credentials <fichier>] [--drop-collection <nom>]…
                         [--oplog-rebuild-pending] [--allow-host <hôte>]… [--bcrypt-cost 10]
                         [--expect-replica-set <nom> --expect-host <hôte:port>… : base jetable de test seulement]
  anonymize-database.mjs --uri <…> --verify-only --manifest <fichier.jsonl> [--keep-login <pseudo>]… [--oplog-rebuild-pending]
  anonymize-database.mjs media --manifest <fichier.jsonl> --uploads-root <dossier> [--all] [--apply]

  L'URI peut venir de ANONYMIZE_MONGODB_URI (évite le mot de passe dans la liste des processus).
  Le manifeste porte le sel et l'état de l'exécution : une relance avec le même manifeste REPREND
  l'exécution interrompue. Il est en mode 600, et se détruit après le contrôle final et l'étape médias.
  Codes de sortie : 0 succès, 1 refus ou usage, 2 contrôle final en échec.`;

const BOOLEAN = new Set(['help', 'h', 'dry-run', 'i-know-this-is-not-production', 'verify-only', 'all', 'apply', 'oplog-rebuild-pending']);
const REPEATABLE = new Set(['keep-login', 'allow-host', 'expect-host', 'drop-collection']);
const VALUED = new Set(['uri', 'manifest', 'credentials', 'bcrypt-cost', 'uploads-root', 'salt', 'expect-replica-set', ...REPEATABLE]);

/** Lit la ligne de commande. Un drapeau inconnu (`--dryrun`, `--sample-size`…) est REFUSÉ : jamais ignoré. */
export function parseArgs(argv) {
  const args = { _: [], 'keep-login': [], 'allow-host': [], 'expect-host': [], 'drop-collection': [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split(/=(.*)/s);
    if (BOOLEAN.has(name)) {
      if (inline !== undefined) throw new ProductionGuardError(`--${name} ne prend pas de valeur`);
      args[name] = true;
      continue;
    }
    if (!VALUED.has(name)) throw new ProductionGuardError(`REFUS — drapeau inconnu : --${name}\n${USAGE}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new ProductionGuardError(`--${name} attend une valeur`);
    if (REPEATABLE.has(name)) args[name].push(...value.split(',').map((v) => v.trim()).filter(Boolean));
    else args[name] = value;
  }
  return args;
}

function printReport(log, { report, manifest, missingKeepLogins }, dryRun) {
  log(dryRun ? 'À BLANC — rien n\'a été écrit. Documents qui seraient modifiés :' : 'Documents modifiés :');
  report.forEach(({ collection, action, matched, modified, deleted }) => {
    const done = dryRun ? matched : action === 'purge' || action === 'drop' ? deleted : modified;
    log(`  ${collection.padEnd(30)} ${action.padEnd(9)} ${String(done).padStart(8)}`);
  });
  log(`Références de fichiers remplacées : ${manifest.length}`);
  if (missingKeepLogins.length > 0) log(`ATTENTION — comptes de recette introuvables : ${missingKeepLogins.join(', ')}`);
}

const OPLOG_ADVICE =
  'Les originaux restent lisibles dans local.oplog.rs. La base n\'est PAS servable : mongodump de la base anonymisée → ' +
  'restauration dans un mongod NEUF sur un volume neuf → --verify-only sur ce nouveau serveur → destruction de l\'ancien volume ' +
  '(README, étape « Reconstruction »).';

async function oplogVerdict(client, since, pending, log) {
  if (!since) {
    log('Oplog : aucune exécution terminée dans _anonymizationRuns — impossible de dater l\'oplog.');
    return false;
  }
  const { present, older } = await oplogLeftovers(client, since);
  if (!present || older === 0) {
    log(present ? 'Oplog : aucune entrée antérieure à l\'exécution.' : 'Oplog : aucun (serveur hors replica set).');
    return true;
  }
  log(`Oplog : ${older} entrée(s) antérieure(s) au début de l'exécution. ${OPLOG_ADVICE}`);
  if (pending) log('--oplog-rebuild-pending : échec de l\'oplog ACCEPTÉ pour cette passe seulement. La base n\'est PAS servable avant la reconstruction.');
  return pending;
}

function printVerification(log, { checked, violations, reread }) {
  log(`Contrôle final : ${reread} document(s) relus dans ${checked.length} collection(s), sans échantillonnage.`);
  violations.slice(0, 50).forEach((v) => log(`  ÉCHEC ${v.collection} ${v.id} ${v.field} — ${v.rule}`));
  if (violations.length > 50) log(`  … et ${violations.length - 50} autre(s).`);
  log(violations.length === 0 ? 'Contrôle : aucune forme réelle trouvée.' : `Contrôle : ${violations.length} violation(s).`);
}

async function mediaCommand(args, log) {
  if (!args.manifest && !args.all) throw new ProductionGuardError('media : --manifest <fichier> ou --all requis');
  if (!args['uploads-root']) throw new ProductionGuardError('media : --uploads-root <dossier> requis');
  const manifest = args.manifest ? await readManifest(args.manifest) : [];
  const outcome = await neutralizeMedia({ manifest, uploadsRoot: args['uploads-root'], apply: Boolean(args.apply), all: Boolean(args.all) });
  log(`${args.apply ? 'Neutralisés' : 'À neutraliser (à blanc)'} : ${outcome.wouldNeutralize} fichier(s) sous ${outcome.root} — ${outcome.missing} référence(s) absente(s) du disque.`);
  outcome.sample.forEach((f) => log(`  ${f}`));
  if (!args.apply) log('Relancer avec --apply pour écrire.');
  return 0;
}

function expectedTarget(args) {
  if (!args['expect-replica-set'] && args['expect-host'].length === 0) return STAGING_TARGET;
  if (!args['expect-replica-set'] || args['expect-host'].length === 0) throw new ProductionGuardError('--expect-replica-set et --expect-host vont ensemble');
  return { setName: args['expect-replica-set'], hosts: args['expect-host'] };
}

/** Le relevé des collections, AVANT toute écriture : une collection inconnue arrête tout. */
async function closedWorld(db, args, log) {
  const audit = await auditCollections(db, { inventory: INVENTORY, drop: args['drop-collection'] });
  if (audit.forbiddenDrops.length > 0) throw new ProductionGuardError(`REFUS — --drop-collection ne retire jamais une collection inventoriée : ${audit.forbiddenDrops.join(', ')}`);
  if (audit.unknown.length > 0) {
    throw new ProductionGuardError(
      `REFUS — collections ni inventoriées ni déclarées sans donnée personnelle : ${audit.unknown.join(', ')}. Rien n'a été écrit. ` +
        'Les examiner, puis les ajouter à l\'inventaire (anonymize-database/inventory.mjs ou collections.mjs) ou les retirer avec --drop-collection <nom>.',
    );
  }
  audit.toDrop.forEach((name) => log(`Collection retirée sur demande : ${name}`));
  return audit;
}

async function prepareContext(args, { dryRun, bcrypt, manifestPath }) {
  const previous = manifestPath ? await readManifestState(manifestPath) : null;
  if (previous?.salt && args.salt && previous.salt !== args.salt) throw new ProductionGuardError('REFUS — --salt contredit le sel du manifeste (reprise d\'une autre exécution ?)');
  const cost = Number(args['bcrypt-cost'] ?? 10);
  const ctx = newContext({
    salt: previous?.salt ?? args.salt ?? newSalt(),
    keepLogins: args['keep-login'],
    hashRandomPassword: passwordHasher({ bcrypt, cost, dryRun }),
    issuePassword: passwordIssuer({ bcrypt, cost, dryRun }),
  });
  if (previous) applyState(ctx, previous.lines);
  return { ctx, resume: Boolean(previous?.salt) };
}

async function writeCredentials(path, credentials, log) {
  await writeFile(path, '', { mode: 0o600 });
  await chmod(path, 0o600);
  await writeFile(path, credentials.map((c) => `${c.username}\t${c.password}`).join('\n') + '\n');
  log(`Mots de passe NEUFS des comptes de recette : ${path} (mode 600 — à ranger dans le gestionnaire de secrets, puis supprimer).`);
}

async function verifyOnly(client, db, args, log) {
  if (!args.manifest) throw new ProductionGuardError('--verify-only exige --manifest : il porte les empreintes des mots d\'identité');
  const previous = await readManifestState(args.manifest);
  if (!previous?.salt) throw new ProductionGuardError(`REFUS — manifeste illisible ou sans état : ${args.manifest}`);
  const ctx = applyState(newContext({ salt: previous.salt, keepLogins: args['keep-login'] }), previous.lines);
  args['keep-login'].forEach((u) => ctx.keptUsernames.add(u));
  const verification = await verifyDatabase(db, ctx);
  printVerification(log, verification);
  const oplogOk = await oplogVerdict(client, await lastRunStart(db), Boolean(args['oplog-rebuild-pending']), log);
  return verification.violations.length === 0 && oplogOk ? 0 : 2;
}

async function anonymize(client, db, args, log, dryRun) {
  const bcrypt = dryRun ? null : await loadBcrypt();
  const manifestPath = args.manifest ?? (dryRun ? null : `anonymize-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const { ctx, resume } = await prepareContext(args, { dryRun, bcrypt, manifestPath });
  const audit = await closedWorld(db, args, log);
  const journal = dryRun ? null : manifestJournal(manifestPath);
  if (journal) {
    await journal.open(ctx.salt, { resume });
    log(`${resume ? 'REPRISE' : 'Manifeste'} : ${manifestPath} (mode 600 — sel, empreintes et chemins d'origine : à détruire après le contrôle final et l'étape médias).`);
  }
  const outcome = await anonymizeDatabase(db, ctx, { dryRun, journal, drop: audit.toDrop });
  printReport(log, outcome, dryRun);
  if (dryRun) return 0;

  if (outcome.keptCredentials.length > 0) {
    await writeCredentials(args.credentials ?? `anonymize-recette-${new Date().toISOString().replace(/[:.]/g, '-')}.credentials`, outcome.keptCredentials, log);
  }
  log(`Étape médias, à lancer séparément (à blanc d'abord) :\n  node infrastructure/scripts/anonymize-database.mjs media --manifest ${manifestPath} --uploads-root <dossier des téléversements> --all`);

  const verification = await verifyDatabase(db, ctx);
  printVerification(log, verification);
  const oplogOk = await oplogVerdict(client, ctx.startedAt, Boolean(args['oplog-rebuild-pending']), log);
  return verification.violations.length === 0 && oplogOk ? 0 : 2;
}

export async function main(argv, { env = process.env, log = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    log(USAGE);
    return 0;
  }
  if (args._[0] === 'media') return mediaCommand(args, log);
  if (args._.length > 0) throw new ProductionGuardError(`REFUS — argument inattendu : ${args._.join(' ')}\n${USAGE}`);

  const uri = args.uri ?? env.ANONYMIZE_MONGODB_URI;
  if (!uri) throw new ProductionGuardError(`--uri requis\n${USAGE}`);
  const dryRun = Boolean(args['dry-run']);
  const verify = Boolean(args['verify-only']);
  if (dryRun && verify) throw new ProductionGuardError('--dry-run et --verify-only s\'excluent');
  assertNotProduction({ uri, env, confirmed: Boolean(args['i-know-this-is-not-production']), write: !dryRun && !verify, allowHosts: args['allow-host'] });
  const expected = expectedTarget(args);
  const { database } = parseMongoTarget(uri);
  log(`Cible : ${redactUri(uri)} (base « ${database} »)${dryRun ? ' — à blanc' : verify ? ' — contrôle seul' : ''}`);

  const { MongoClient } = await loadMongo();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    assertExpectedTarget(await client.db('admin').command({ hello: 1 }), expected);
    const db = client.db(database);
    return verify ? await verifyOnly(client, db, args, log) : await anonymize(client, db, args, log, dryRun);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof ProductionGuardError ? error.message : `ERREUR — ${error.message}`);
      process.exit(1);
    },
  );
}
