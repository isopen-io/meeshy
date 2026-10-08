#!/usr/bin/env node
// Anonymise une base MongoDB de Meeshy, pour le staging (#9663).
//
// Toute copie production → staging passe par ce script AVANT d'être servie.
// Procédure complète (sauvegarde vérifiée → --dry-run → exécution → contrôle →
// médias) : infrastructure/scripts/README-anonymize-database.md.
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
//  - relancer le script est sans danger : il réanonymise ce qui l'est déjà.
//
// INVENTAIRE — champ par champ, depuis packages/shared/prisma/schema.prisma
// (l'exécutable est anonymize-database/inventory.mjs ; un témoin tient les deux
// alignés). « synth. » = valeur synthétique déterministe ; « → fichier » =
// remplaçant `anonymized/placeholder.*` + ligne au manifeste des médias.
//
//   User                  username (sauf --keep-login), usernameHistory → [], firstName, lastName,
//                         displayName, bio, email, phoneNumber, phoneCountryCode, searchTokens
//                         (recalculés), password (bcrypt aléatoire ; NEUF pour --keep-login), avatar,
//                         banner (→ null + manifeste), birthDate, lastLoginIp, lastLoginLocation,
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
//   PostInteractiveResponse text
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
//   Report                reporterName, reason, moderatorNotes
//   Ban                   reason, liftReason
//   AdminAuditLog         changes, metadata (→ null), ipAddress, userAgent
//   EmailInvitation       email
//   TrackingLink          name, originalUrl, token, shortUrl (jeton régénéré)
//   TrackingLinkClick     ipAddress, userAgent, deviceFingerprint, city, region, referrer
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
//   AgentLlmConfig        apiKeyEncrypted, fallbackApiKeyEncrypted (secrets vidés)
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
//
// Laissés tels quels, après examen : identifiants (`_id`, clés étrangères), pays
// ISO (registrationCountry, deviceCountry, joinCountry, country — granularité
// pays), fuseaux, langues, compteurs, préférences d'interface, contenus éditoriaux
// (StickerPack, AgentTopicCatalog, AdminBroadcast), pseudonymes de ligue (déjà des
// alias), empreintes HMAC à clé secrète, `Participant.sessionTokenHash` (condensé
// d'un jeton aléatoire), `referralCode` (code aléatoire), hachés de contenu.
// FIN DE L'INVENTAIRE

import { chmod, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertNotProduction, parseMongoTarget, redactUri, ProductionGuardError } from './anonymize-database/guard.mjs';
import { anonymizeDatabase, newContext, passwordHasher, passwordIssuer } from './anonymize-database/run.mjs';
import { verifyDatabase } from './anonymize-database/verify.mjs';
import { neutralizeMedia, readManifest } from './anonymize-database/media.mjs';
import { loadBcrypt, loadMongo } from './anonymize-database/deps.mjs';
import { newSalt } from './anonymize-database/synth.mjs';

const USAGE = `Usage :
  anonymize-database.mjs --uri <mongodb://…/base> [--dry-run | --i-know-this-is-not-production]
                         [--keep-login <pseudo>]… [--credentials <fichier>] [--allow-host <hôte>]… [--manifest <fichier.jsonl>]
                         [--sample-size 200] [--bcrypt-cost 10] [--salt <hex> : rejouer une exécution, jamais conservé]
  anonymize-database.mjs --uri <…> --verify-only [--keep-login <pseudo>]…
  anonymize-database.mjs media --manifest <fichier.jsonl> --uploads-root <dossier> [--all] [--apply]

  L'URI peut venir de ANONYMIZE_MONGODB_URI (évite le mot de passe dans la liste des processus).
  Codes de sortie : 0 succès, 1 refus ou usage, 2 contrôle d'échantillonnage en échec.`;

const REPEATABLE = new Set(['keep-login', 'allow-host']);
const VALUED = new Set(['uri', 'manifest', 'credentials', 'sample-size', 'bcrypt-cost', 'uploads-root', 'salt', ...REPEATABLE]);

export function parseArgs(argv) {
  const args = { _: [], 'keep-login': [], 'allow-host': [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split(/=(.*)/s);
    if (!VALUED.has(name)) {
      args[name] = true;
      continue;
    }
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
    const done = dryRun ? matched : action === 'purge' ? deleted : modified;
    log(`  ${collection.padEnd(30)} ${action.padEnd(9)} ${String(done).padStart(8)}`);
  });
  log(`Références de fichiers remplacées : ${manifest.length}`);
  if (missingKeepLogins.length > 0) log(`ATTENTION — comptes de recette introuvables : ${missingKeepLogins.join(', ')}`);
}

function printVerification(log, { checked, violations }) {
  const sampled = checked.reduce((n, c) => n + c.sampled, 0);
  log(`Contrôle d'échantillonnage : ${sampled} document(s) relus dans ${checked.length} collection(s).`);
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

export async function main(argv, { env = process.env, log = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    log(USAGE);
    return 0;
  }
  if (args._[0] === 'media') return mediaCommand(args, log);

  const uri = args.uri ?? env.ANONYMIZE_MONGODB_URI;
  if (!uri) throw new ProductionGuardError(`--uri requis\n${USAGE}`);
  const dryRun = Boolean(args['dry-run']);
  const verifyOnly = Boolean(args['verify-only']);
  assertNotProduction({
    uri,
    env,
    confirmed: Boolean(args['i-know-this-is-not-production']),
    write: !dryRun && !verifyOnly,
    allowHosts: args['allow-host'],
  });
  const { database } = parseMongoTarget(uri);
  log(`Cible : ${redactUri(uri)} (base « ${database} »)${dryRun ? ' — à blanc' : verifyOnly ? ' — contrôle seul' : ''}`);

  const { MongoClient } = await loadMongo();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const db = client.db(database);
    const sampleSize = Number(args['sample-size'] ?? 200);
    if (verifyOnly) {
      const ctx = newContext({ salt: newSalt(), keepLogins: args['keep-login'] });
      args['keep-login'].forEach((u) => ctx.keptUsernames.add(u));
      const verification = await verifyDatabase(db, ctx, { sampleSize });
      printVerification(log, verification);
      return verification.violations.length === 0 ? 0 : 2;
    }

    const bcrypt = dryRun ? null : await loadBcrypt();
    const ctx = newContext({
      salt: args.salt ?? newSalt(),
      keepLogins: args['keep-login'],
      hashRandomPassword: passwordHasher({ bcrypt, cost: Number(args['bcrypt-cost'] ?? 10), dryRun }),
      issuePassword: passwordIssuer({ bcrypt, cost: Number(args['bcrypt-cost'] ?? 10), dryRun }),
    });
    const outcome = await anonymizeDatabase(db, ctx, { dryRun });
    printReport(log, outcome, dryRun);
    if (dryRun) return 0;

    if (outcome.keptCredentials.length > 0) {
      const credentialsPath = args.credentials ?? `anonymize-recette-${new Date().toISOString().replace(/[:.]/g, '-')}.credentials`;
      await writeFile(credentialsPath, '', { mode: 0o600 });
      await chmod(credentialsPath, 0o600);
      await writeFile(credentialsPath, outcome.keptCredentials.map((c) => `${c.username}\t${c.password}`).join('\n') + '\n');
      log(`Mots de passe NEUFS des comptes de recette : ${credentialsPath} (mode 600 — à ranger dans le gestionnaire de secrets, puis supprimer).`);
    }

    const manifestPath = args.manifest ?? `anonymize-media-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    await writeFile(manifestPath, outcome.manifest.map((e) => JSON.stringify(e)).join('\n') + (outcome.manifest.length ? '\n' : ''), { mode: 0o600 });
    log(`Manifeste des médias : ${manifestPath} (chemins d'origine — à supprimer après l'étape médias).`);
    log(`Étape médias, à lancer séparément (à blanc d'abord) :\n  node infrastructure/scripts/anonymize-database.mjs media --manifest ${manifestPath} --uploads-root <dossier des téléversements> --all`);

    const verification = await verifyDatabase(db, ctx, { sampleSize });
    printVerification(log, verification);
    return verification.violations.length === 0 ? 0 : 2;
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
