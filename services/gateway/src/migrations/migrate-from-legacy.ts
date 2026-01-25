#!/usr/bin/env tsx
/**
 * =============================================================================
 * MEESHY - Script de Migration MongoDB Legacy → Prisma
 * =============================================================================
 *
 * Description: Migre les données MongoDB existantes vers le nouveau schema Prisma
 * Usage: tsx src/migrations/migrate-from-legacy.ts [--dry-run]
 *
 * ATTENTION:
 * - Les notifications (94,790 docs) sont DROPPÉES (seront régénérées)
 * - Migre ~29,000 documents dans l'ordre des dépendances
 * - Support du mode dry-run (aucune écriture)
 * - Batch de 100 documents pour performance
 *
 * =============================================================================
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Charger variables d'environnement
dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');

// Connexions
let legacyDb: Db;
let prisma: PrismaClient;

// =============================================================================
// STATISTIQUES
// =============================================================================

interface MigrationStats {
  collection: string;
  expected: number;
  migrated: number;
  skipped: number;
  errors: number;
  duration: number;
}

const stats: MigrationStats[] = [];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convertit ObjectId MongoDB en string pour Prisma
 */
function objectIdToString(id: any): string | undefined {
  if (!id) return undefined;
  if (typeof id === 'string') return id;
  if (id instanceof ObjectId) return id.toString();
  return id.toString();
}

/**
 * Log avec timestamp
 */
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = DRY_RUN ? '[DRY-RUN]' : '[MIGRATE]';
  const levelIcon = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`${timestamp} ${prefix} ${levelIcon} ${message}`);
}

/**
 * Progress bar simple
 */
function showProgress(current: number, total: number, collectionName: string) {
  const percent = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
  process.stdout.write(`\r${collectionName}: [${bar}] ${percent}% (${current}/${total})`);
  if (current === total) console.log(''); // Nouvelle ligne à la fin
}

// =============================================================================
// TRANSFORMATION USER
// =============================================================================

interface LegacyUser {
  _id: ObjectId;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role?: string;
  isActive?: boolean;
  systemLanguage?: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  phoneNumber?: string;
  isOnline?: boolean;
  lastActiveAt?: Date;
  lastSeen?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  // Anciens champs à ignorer
  autoTranslateEnabled?: boolean;
  translateToSystemLanguage?: boolean;
  translateToRegionalLanguage?: boolean;
  useCustomDestination?: boolean;
}

function transformUser(doc: LegacyUser) {
  return {
    id: objectIdToString(doc._id)!,
    username: doc.username,
    firstName: doc.firstName,
    lastName: doc.lastName,
    bio: doc.bio || '',
    email: doc.email,
    phoneNumber: doc.phoneNumber || null,
    phoneCountryCode: null,
    password: doc.password,
    displayName: doc.displayName || `${doc.firstName} ${doc.lastName}`,
    avatar: doc.avatar || null,
    banner: null,
    isOnline: doc.isOnline || false,
    lastActiveAt: doc.lastActiveAt || doc.createdAt || new Date(),
    timezone: null,
    blockedUserIds: [],
    systemLanguage: doc.systemLanguage || 'en',
    regionalLanguage: doc.regionalLanguage || null,
    customDestinationLanguage: doc.customDestinationLanguage || null,
    role: (doc.role?.toUpperCase() || 'USER') as any,
    isActive: doc.isActive !== false,
    deactivatedAt: doc.isActive === false ? new Date() : null,

    // Champs de sécurité (valeurs par défaut)
    emailVerifiedAt: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    phoneVerifiedAt: null,
    phoneVerificationCode: null,
    phoneVerificationExpiry: null,
    phoneTransferredFromUserId: null,
    phoneTransferredAt: null,
    twoFactorSecret: null,
    twoFactorBackupCodes: [],
    twoFactorPendingSecret: null,
    twoFactorEnabledAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedReason: null,
    lastPasswordChange: doc.createdAt || new Date(),
    passwordResetAttempts: 0,
    lastPasswordResetAttempt: null,
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    registrationIp: null,
    registrationLocation: null,
    registrationDevice: null,
    registrationCountry: null,

    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION COMMUNITY
// =============================================================================

interface LegacyCommunity {
  _id: ObjectId;
  name: string;
  identifier: string;
  description?: string;
  avatar?: string;
  banner?: string;
  isPublic?: boolean;
  isActive?: boolean;
  createdBy: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

function transformCommunity(doc: LegacyCommunity) {
  return {
    id: objectIdToString(doc._id)!,
    name: doc.name,
    identifier: doc.identifier,
    description: doc.description || null,
    avatar: doc.avatar || null,
    banner: doc.banner || null,
    isPublic: doc.isPublic !== false,
    isActive: doc.isActive !== false,
    createdBy: objectIdToString(doc.createdBy)!,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION COMMUNITY MEMBER
// =============================================================================

interface LegacyCommunityMember {
  _id: ObjectId;
  communityId: ObjectId;
  userId: ObjectId;
  role?: string;
  joinedAt?: Date;
}

function transformCommunityMember(doc: LegacyCommunityMember) {
  return {
    id: objectIdToString(doc._id)!,
    communityId: objectIdToString(doc.communityId)!,
    userId: objectIdToString(doc.userId)!,
    role: doc.role || 'member',
    joinedAt: doc.joinedAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION CONVERSATION
// =============================================================================

interface LegacyConversation {
  _id: ObjectId;
  identifier: string;
  type: string;
  title?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  communityId?: ObjectId;
  isActive?: boolean;
  memberCount?: number;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

function transformConversation(doc: LegacyConversation) {
  return {
    id: objectIdToString(doc._id)!,
    identifier: doc.identifier,
    type: doc.type,
    title: doc.title || null,
    description: doc.description || null,
    avatar: doc.avatar || null,
    banner: doc.banner || null,
    communityId: objectIdToString(doc.communityId) || null,
    isActive: doc.isActive !== false,
    memberCount: doc.memberCount || 0,
    lastMessageAt: doc.lastMessageAt || new Date(),
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION CONVERSATION MEMBER
// =============================================================================

interface LegacyConversationMember {
  _id: ObjectId;
  conversationId: ObjectId;
  userId: ObjectId;
  role?: string;
  nickname?: string;
  joinedAt?: Date;
  leftAt?: Date;
  isActive?: boolean;
}

function transformConversationMember(doc: LegacyConversationMember) {
  return {
    id: objectIdToString(doc._id)!,
    conversationId: objectIdToString(doc.conversationId)!,
    userId: objectIdToString(doc.userId)!,
    role: doc.role || 'member',
    nickname: doc.nickname || null,
    joinedAt: doc.joinedAt || new Date(),
    leftAt: doc.leftAt || null,
    isActive: doc.isActive !== false,
  };
}

// =============================================================================
// TRANSFORMATION MESSAGE
// =============================================================================

interface LegacyMessage {
  _id: ObjectId;
  conversationId: ObjectId;
  communityId?: ObjectId;
  senderId: ObjectId;
  content?: string;
  type?: string;
  status?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  replyToId?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

function transformMessage(doc: LegacyMessage) {
  return {
    id: objectIdToString(doc._id)!,
    conversationId: objectIdToString(doc.conversationId)!,
    communityId: objectIdToString(doc.communityId) || null,
    senderId: objectIdToString(doc.senderId)!,
    content: doc.content || '',
    type: doc.type || 'text',
    status: doc.status || 'sent',
    isDeleted: doc.isDeleted || false,
    isPinned: doc.isPinned || false,
    replyToId: objectIdToString(doc.replyToId) || null,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION MESSAGE ATTACHMENT
// =============================================================================

interface LegacyMessageAttachment {
  _id: ObjectId;
  messageId: ObjectId;
  type: string;
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  createdAt?: Date;
}

function transformMessageAttachment(doc: LegacyMessageAttachment) {
  return {
    id: objectIdToString(doc._id)!,
    messageId: objectIdToString(doc.messageId)!,
    type: doc.type,
    url: doc.url,
    filename: doc.filename || null,
    size: doc.size || null,
    mimeType: doc.mimeType || null,
    width: doc.width || null,
    height: doc.height || null,
    duration: doc.duration || null,
    createdAt: doc.createdAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION MESSAGE TRANSLATION
// =============================================================================

interface LegacyMessageTranslation {
  _id: ObjectId;
  messageId: ObjectId;
  sourceLanguage: string;
  targetLanguage: string;
  translatedContent: string;
  createdAt?: Date;
}

function transformMessageTranslation(doc: LegacyMessageTranslation) {
  return {
    id: objectIdToString(doc._id)!,
    messageId: objectIdToString(doc.messageId)!,
    sourceLanguage: doc.sourceLanguage,
    targetLanguage: doc.targetLanguage,
    translatedContent: doc.translatedContent,
    createdAt: doc.createdAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION REACTION
// =============================================================================

interface LegacyReaction {
  _id: ObjectId;
  messageId: ObjectId;
  userId: ObjectId;
  emoji: string;
  createdAt?: Date;
}

function transformReaction(doc: LegacyReaction) {
  return {
    id: objectIdToString(doc._id)!,
    messageId: objectIdToString(doc.messageId)!,
    userId: objectIdToString(doc.userId)!,
    emoji: doc.emoji,
    createdAt: doc.createdAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION MENTION
// =============================================================================

interface LegacyMention {
  _id: ObjectId;
  messageId: ObjectId;
  userId: ObjectId;
  createdAt?: Date;
}

function transformMention(doc: LegacyMention) {
  return {
    id: objectIdToString(doc._id)!,
    messageId: objectIdToString(doc.messageId)!,
    userId: objectIdToString(doc.userId)!,
    createdAt: doc.createdAt || new Date(),
  };
}

// =============================================================================
// TRANSFORMATION FRIEND REQUEST
// =============================================================================

interface LegacyFriendRequest {
  _id: ObjectId;
  senderId: ObjectId;
  receiverId: ObjectId;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function transformFriendRequest(doc: LegacyFriendRequest) {
  return {
    id: objectIdToString(doc._id)!,
    senderId: objectIdToString(doc.senderId)!,
    receiverId: objectIdToString(doc.receiverId)!,
    status: doc.status,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

// =============================================================================
// FONCTIONS DE MIGRATION
// =============================================================================

/**
 * Migre une collection en batches
 */
async function migrateCollection<T extends { _id: ObjectId }>(
  collectionName: string,
  transformFn: (doc: T) => any,
  prismaMo: any
): Promise<MigrationStats> {
  const startTime = Date.now();
  const stat: MigrationStats = {
    collection: collectionName,
    expected: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    duration: 0,
  };

  try {
    log(`🔄 Migration de ${collectionName}...`);

    // Compter documents
    const collection = legacyDb.collection(collectionName);
    const total = await collection.countDocuments();
    stat.expected = total;

    log(`   Total: ${total} documents`);

    if (total === 0) {
      log(`   ⏭️ Collection vide, skip`);
      stat.duration = Date.now() - startTime;
      return stat;
    }

    // Traiter par batches
    const cursor = collection.find();
    let batch: any[] = [];
    let processed = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) break;

      try {
        const transformed = transformFn(doc as T);
        batch.push(transformed);

        if (batch.length >= BATCH_SIZE) {
          // Écrire le batch
          if (!DRY_RUN) {
            await prisma.$transaction(
              batch.map(data => prismaMo.create({ data }))
            );
          }
          stat.migrated += batch.length;
          processed += batch.length;
          showProgress(processed, total, collectionName);
          batch = [];
        }
      } catch (error: any) {
        stat.errors++;
        log(`   ⚠️ Erreur sur document ${doc._id}: ${error.message}`, 'warn');
      }
    }

    // Dernier batch
    if (batch.length > 0) {
      if (!DRY_RUN) {
        await prisma.$transaction(
          batch.map(data => prismaMo.create({ data }))
        );
      }
      stat.migrated += batch.length;
      processed += batch.length;
      showProgress(processed, total, collectionName);
    }

    stat.duration = Date.now() - startTime;
    log(`   ✅ ${stat.migrated} documents migrés en ${(stat.duration / 1000).toFixed(1)}s`);

  } catch (error: any) {
    log(`   ❌ Erreur: ${error.message}`, 'error');
    throw error;
  }

  return stat;
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

async function migrate() {
  const startTime = Date.now();

  log('='.repeat(80));
  log('MEESHY - MIGRATION MONGODB → PRISMA');
  log('='.repeat(80));
  log('');

  if (DRY_RUN) {
    log('⚠️  MODE DRY-RUN - Aucune écriture ne sera effectuée');
    log('');
  }

  try {
    // =========================================================================
    // ÉTAPE 1: CONNEXION AUX BASES
    // =========================================================================

    log('📡 Connexion aux bases de données...');

    const mongoUrl = process.env.DATABASE_URL;
    if (!mongoUrl) {
      throw new Error('DATABASE_URL non définie');
    }

    const client = new MongoClient(mongoUrl);
    await client.connect();
    legacyDb = client.db();
    log('   ✅ MongoDB connecté');

    prisma = new PrismaClient();
    await prisma.$connect();
    log('   ✅ Prisma connecté');
    log('');

    // =========================================================================
    // ÉTAPE 2: VÉRIFICATION PRISMA DB VIDE
    // =========================================================================

    if (!DRY_RUN) {
      log('🔍 Vérification que Prisma DB est vide...');
      const userCount = await prisma.user.count();
      if (userCount > 0) {
        throw new Error(
          `Prisma DB n'est pas vide (${userCount} users). ` +
          `Veuillez vider la base ou utiliser --dry-run`
        );
      }
      log('   ✅ Prisma DB est vide');
      log('');
    }

    // =========================================================================
    // ÉTAPE 3: MIGRATION DANS L'ORDRE DES DÉPENDANCES
    // =========================================================================

    log('🚀 Début de la migration...');
    log('');

    // 1. User (pas de dépendances)
    stats.push(
      await migrateCollection('User', transformUser, prisma.user)
    );

    // 2. Community (dépend de User)
    stats.push(
      await migrateCollection('Community', transformCommunity, prisma.community)
    );

    // 3. CommunityMember (dépend de User, Community)
    stats.push(
      await migrateCollection(
        'CommunityMember',
        transformCommunityMember,
        prisma.communityMember
      )
    );

    // 4. Conversation (dépend de User, Community optionnel)
    stats.push(
      await migrateCollection(
        'Conversation',
        transformConversation,
        prisma.conversation
      )
    );

    // 5. ConversationMember (dépend de User, Conversation)
    stats.push(
      await migrateCollection(
        'ConversationMember',
        transformConversationMember,
        prisma.conversationMember
      )
    );

    // 6. Message (dépend de User, Conversation, Community optionnel)
    stats.push(
      await migrateCollection('Message', transformMessage, prisma.message)
    );

    // 7. MessageAttachment (dépend de Message)
    stats.push(
      await migrateCollection(
        'MessageAttachment',
        transformMessageAttachment,
        prisma.messageAttachment
      )
    );

    // 8. MessageTranslation (dépend de Message)
    stats.push(
      await migrateCollection(
        'MessageTranslation',
        transformMessageTranslation,
        prisma.messageTranslation
      )
    );

    // 9. Reaction (dépend de Message, User)
    stats.push(
      await migrateCollection('Reaction', transformReaction, prisma.reaction)
    );

    // 10. Mention (dépend de Message, User)
    stats.push(
      await migrateCollection('Mention', transformMention, prisma.mention)
    );

    // 11. FriendRequest (dépend de User)
    stats.push(
      await migrateCollection(
        'FriendRequest',
        transformFriendRequest,
        prisma.friendRequest
      )
    );

    // =========================================================================
    // ÉTAPE 4: RAPPORT FINAL
    // =========================================================================

    const totalDuration = Date.now() - startTime;

    log('');
    log('='.repeat(80));
    log('✅ MIGRATION TERMINÉE');
    log('='.repeat(80));
    log('');

    // Tableau récapitulatif
    console.log('📊 Résumé:');
    console.log('');
    console.log('Collection               | Attendu | Migré | Erreurs | Durée');
    console.log('-------------------------|---------|-------|---------|-------');

    let totalExpected = 0;
    let totalMigrated = 0;
    let totalErrors = 0;

    stats.forEach(stat => {
      const name = stat.collection.padEnd(24);
      const expected = stat.expected.toString().padStart(7);
      const migrated = stat.migrated.toString().padStart(5);
      const errors = stat.errors.toString().padStart(7);
      const duration = `${(stat.duration / 1000).toFixed(1)}s`.padStart(6);

      console.log(`${name} | ${expected} | ${migrated} | ${errors} | ${duration}`);

      totalExpected += stat.expected;
      totalMigrated += stat.migrated;
      totalErrors += stat.errors;
    });

    console.log('-------------------------|---------|-------|---------|-------');
    console.log(
      `${'TOTAL'.padEnd(24)} | ${totalExpected.toString().padStart(7)} | ${totalMigrated.toString().padStart(5)} | ${totalErrors.toString().padStart(7)} | ${(totalDuration / 1000).toFixed(1)}s`
    );

    log('');
    log(`⏱️  Durée totale: ${(totalDuration / 1000 / 60).toFixed(2)} minutes`);

    if (DRY_RUN) {
      log('');
      log('✅ Dry-run réussi - Prêt pour migration réelle');
      log('   Lancer sans --dry-run pour migrer effectivement');
    } else {
      log('');
      log('✅ Migration réelle terminée avec succès');
    }

  } catch (error: any) {
    log('❌ Erreur fatale lors de la migration', 'error');
    log(error.message, 'error');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Fermer connexions
    if (prisma) {
      await prisma.$disconnect();
    }
  }

  log('');
  log('='.repeat(80));
}

// =============================================================================
// EXÉCUTION
// =============================================================================

migrate()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erreur non gérée:', error);
    process.exit(1);
  });
