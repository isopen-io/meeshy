# Plan d'Implémentation DMA - Interopérabilité Messagerie Meeshy

## 🎯 Objectif

Implémenter l'interopérabilité DMA (Digital Markets Act) pour permettre à Meeshy de communiquer avec les gatekeepers (WhatsApp, Messenger, iMessage) tout en maintenant le chiffrement end-to-end et en exploitant l'avantage concurrentiel de la traduction automatique.

## 📋 Vue d'ensemble

**Version cible**: MVP Production (Phase 1)
**Durée estimée**: 4-6 semaines
**Complexité**: Élevée
**Priorité**: Stratégique

---

## 🏗️ Architecture Technique

### Stack technologique additionnelle

| Technologie | Usage | Justification |
|-------------|-------|---------------|
| **OpenMLS** | Implémentation MLS | Library Rust avec bindings Node.js, conforme RFC 9420 |
| **NAPI-RS** | Bridge Rust ↔ Node.js | Performance native, type-safe |
| **Redis Streams** | Queue messages chiffrés | Persistance, replay, scalabilité |
| **PostgreSQL** | Stockage clés MLS | ACID pour cohérence cryptographique |
| **libsignal-protocol** | Alternative MLS | Fallback si OpenMLS trop complexe |

### Nouveaux composants

```
meeshy/
├── packages/
│   ├── mls-core/                    # [NOUVEAU] Package MLS
│   │   ├── src/
│   │   │   ├── mls-client.ts        # Client MLS (chiffrement/déchiffrement)
│   │   │   ├── key-package.ts       # Gestion KeyPackages
│   │   │   │   ├── group-state.ts   # État des groupes MLS
│   │   │   └── crypto/
│   │   │       ├── credentials.ts   # Gestion credentials
│   │   │       └── signatures.ts    # Signatures des messages
│   │   ├── native/                  # Bindings Rust
│   │   └── package.json
│   │
│   └── dma-federation/              # [NOUVEAU] Fédération DMA
│       ├── src/
│       │   ├── federation-service.ts # Service fédération
│       │   ├── protocol-adapter/     # Adaptateurs protocoles
│       │   │   ├── whatsapp.ts
│       │   │   ├── messenger.ts
│       │   │   └── imessage.ts
│       │   └── translation-bridge.ts # Pont traduction inter-plateformes
│       └── package.json
│
├── gateway/
│   ├── src/
│   │   ├── services/
│   │   │   ├── MLSService.ts        # [NOUVEAU] Service MLS backend
│   │   │   ├── KeyManagementService.ts # [NOUVEAU] Gestion clés
│   │   │   └── MessagingService.ts  # [MODIFIÉ] Intégration MLS
│   │   └── routes/
│   │       ├── mls.ts               # [NOUVEAU] API MLS
│   │       └── federation.ts        # [NOUVEAU] API fédération
│
├── frontend/
│   ├── services/
│   │   ├── mls.service.ts           # [NOUVEAU] Service MLS client
│   │   └── meeshy-socketio.service.ts # [MODIFIÉ] Support messages chiffrés
│   └── hooks/
│       └── use-mls-messaging.ts     # [NOUVEAU] Hook messages MLS
│
└── shared/
    ├── schema.prisma                # [MODIFIÉ] Ajout tables MLS
    └── types/
        ├── mls-types.ts             # [NOUVEAU] Types MLS
        └── federation-types.ts      # [NOUVEAU] Types fédération
```

---

## 🎯 Phase 1: MVP Production (4-6 semaines)

### Objectifs Phase 1
- ✅ Chiffrement E2E pour conversations 1:1 (Meeshy ↔ Meeshy uniquement)
- ✅ Infrastructure MLS de base
- ✅ Migration transparente pour utilisateurs existants
- ✅ Aucune régression fonctionnelle
- 🚫 PAS de fédération externe (pas encore WhatsApp/Messenger)

---

## 📝 Tasks détaillées pour agents de codage

### TASK 1: Setup infrastructure MLS (Semaine 1)

#### TASK 1.1: Créer package `mls-core`

**Fichier**: `packages/mls-core/package.json`

```json
{
  "name": "@meeshy/mls-core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc && napi build --platform --release",
    "test": "jest"
  },
  "dependencies": {
    "@napi-rs/cli": "^2.16.0",
    "tweetnacl": "^1.0.3",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Actions agent**:
1. Créer dossier `packages/mls-core/`
2. Initialiser `package.json` avec config ci-dessus
3. Créer structure de dossiers:
   ```
   packages/mls-core/
   ├── src/
   │   ├── index.ts
   │   ├── mls-client.ts
   │   ├── key-package.ts
   │   └── crypto/
   ├── tests/
   └── tsconfig.json
   ```
4. Exécuter `npm install` dans `packages/mls-core/`

---

#### TASK 1.2: Implémenter MLSClient de base

**Fichier**: `packages/mls-core/src/mls-client.ts`

```typescript
import * as nacl from 'tweetnacl';
import { v4 as uuidv4 } from 'uuid';

/**
 * Client MLS simplifié pour Phase 1 (1:1 conversations)
 *
 * Phase 1: Utilise chiffrement symétrique par conversation
 * Phase 2+: Migration vers MLS complet (OpenMLS)
 */
export class MLSClient {
  private userId: string;
  private keyPairs: Map<string, nacl.BoxKeyPair>;
  private sharedSecrets: Map<string, Uint8Array>;

  constructor(userId: string) {
    this.userId = userId;
    this.keyPairs = new Map();
    this.sharedSecrets = new Map();
  }

  /**
   * Génère une KeyPair pour l'utilisateur
   */
  async generateKeyPair(): Promise<{
    publicKey: string;
    keyPackageId: string;
  }> {
    const keyPair = nacl.box.keyPair();
    const keyPackageId = uuidv4();

    this.keyPairs.set(keyPackageId, keyPair);

    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      keyPackageId
    };
  }

  /**
   * Établit un secret partagé avec un autre utilisateur (1:1)
   */
  async establishSharedSecret(
    conversationId: string,
    myKeyPackageId: string,
    theirPublicKey: string
  ): Promise<void> {
    const myKeyPair = this.keyPairs.get(myKeyPackageId);
    if (!myKeyPair) {
      throw new Error('KeyPair not found');
    }

    const theirPubKey = Buffer.from(theirPublicKey, 'base64');

    // Compute shared secret via ECDH
    const sharedSecret = nacl.box.before(theirPubKey, myKeyPair.secretKey);

    this.sharedSecrets.set(conversationId, sharedSecret);
  }

  /**
   * Chiffre un message pour une conversation
   */
  async encryptMessage(
    conversationId: string,
    plaintext: string
  ): Promise<{
    ciphertext: string;
    nonce: string;
  }> {
    const sharedSecret = this.sharedSecrets.get(conversationId);
    if (!sharedSecret) {
      throw new Error('No shared secret for conversation');
    }

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = Buffer.from(plaintext, 'utf-8');

    const encrypted = nacl.box.after(messageBytes, nonce, sharedSecret);

    return {
      ciphertext: Buffer.from(encrypted).toString('base64'),
      nonce: Buffer.from(nonce).toString('base64')
    };
  }

  /**
   * Déchiffre un message reçu
   */
  async decryptMessage(
    conversationId: string,
    ciphertext: string,
    nonce: string
  ): Promise<string> {
    const sharedSecret = this.sharedSecrets.get(conversationId);
    if (!sharedSecret) {
      throw new Error('No shared secret for conversation');
    }

    const ciphertextBytes = Buffer.from(ciphertext, 'base64');
    const nonceBytes = Buffer.from(nonce, 'base64');

    const decrypted = nacl.box.open.after(
      ciphertextBytes,
      nonceBytes,
      sharedSecret
    );

    if (!decrypted) {
      throw new Error('Decryption failed');
    }

    return Buffer.from(decrypted).toString('utf-8');
  }

  /**
   * Export de la clé pour persistance (chiffré avec password-based key)
   */
  async exportKey(conversationId: string, password: string): Promise<string> {
    // TODO: Implémenter export sécurisé
    throw new Error('Not implemented');
  }

  /**
   * Import d'une clé depuis le storage
   */
  async importKey(keyData: string, password: string): Promise<void> {
    // TODO: Implémenter import sécurisé
    throw new Error('Not implemented');
  }
}
```

**Actions agent**:
1. Créer le fichier avec le code ci-dessus
2. Installer dépendances: `tweetnacl`, `uuid`, `@types/uuid`
3. Créer tests unitaires dans `packages/mls-core/tests/mls-client.test.ts`
4. Vérifier que les tests passent

**Tests à créer**:
```typescript
// packages/mls-core/tests/mls-client.test.ts
describe('MLSClient', () => {
  it('should generate key pair', async () => {
    const client = new MLSClient('user1');
    const { publicKey, keyPackageId } = await client.generateKeyPair();
    expect(publicKey).toBeDefined();
    expect(keyPackageId).toBeDefined();
  });

  it('should encrypt and decrypt 1:1 message', async () => {
    const alice = new MLSClient('alice');
    const bob = new MLSClient('bob');

    const aliceKeys = await alice.generateKeyPair();
    const bobKeys = await bob.generateKeyPair();

    const conversationId = 'conv_123';

    await alice.establishSharedSecret(conversationId, aliceKeys.keyPackageId, bobKeys.publicKey);
    await bob.establishSharedSecret(conversationId, bobKeys.keyPackageId, aliceKeys.publicKey);

    const plaintext = 'Hello Bob!';
    const encrypted = await alice.encryptMessage(conversationId, plaintext);
    const decrypted = await bob.decryptMessage(conversationId, encrypted.ciphertext, encrypted.nonce);

    expect(decrypted).toBe(plaintext);
  });
});
```

---

#### TASK 1.3: Créer modèles de données MLS dans Prisma

**Fichier**: `shared/schema.prisma`

**Actions agent**: Ajouter ces modèles à la fin du fichier existant

```prisma
/// KeyPackages MLS pour établir des conversations chiffrées
model MLSKeyPackage {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  userId          String    @db.ObjectId
  keyPackageId    String    @unique  // UUID du package
  publicKey       String              // Base64 encoded public key
  privateKeyEnc   String              // Private key chiffrée avec master key utilisateur
  cipherSuite     String    @default("MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519")
  isUsed          Boolean   @default(false)
  usedForConvId   String?   @db.ObjectId
  usedAt          DateTime?
  expiresAt       DateTime  // KeyPackages expirent après 30 jours
  createdAt       DateTime  @default(now())

  @@index([userId, isUsed])
  @@index([expiresAt])
}

/// État des groupes MLS (pour conversations)
model MLSGroupState {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId    String   @unique @db.ObjectId
  groupId           String   @unique  // MLS Group ID
  epoch             Int      @default(0)
  cipherSuite       String
  treeHash          String              // Hash de l'arbre ratchet
  confirmedTranscriptHash String        // Pour vérifier intégrité
  memberKeyPackages Json                // Array de {userId, keyPackageId}
  pendingCommits    Json     @default("[]")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}

/// Credentials MLS des utilisateurs
model MLSCredential {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  userId            String   @db.ObjectId
  credentialType    String   @default("basic")  // basic, x509, etc.
  identity          String              // Identité MLS (ex: user@meeshy.com)
  signaturePublicKey String            // Clé publique de signature
  signaturePrivateKeyEnc String        // Clé privée chiffrée
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId])
  @@index([identity])
}

/// Messages chiffrés (extension du modèle Message existant)
model EncryptedMessageData {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId       String   @unique @db.ObjectId
  ciphertext      String              // Message chiffré en base64
  nonce           String              // Nonce pour déchiffrement
  senderKeyHash   String              // Hash de la clé utilisée
  encryptionType  String   @default("mls_1to1")  // mls_1to1, mls_group, none
  createdAt       DateTime @default(now())

  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
}
```

**Modifications au modèle existant**:

```prisma
// Modifier le modèle Conversation existant
model Conversation {
  // ... champs existants ...

  // Ajouter relation MLS
  mlsGroupState         MLSGroupState?

  // ... relations existantes ...
}

// Modifier le modèle Message existant
model Message {
  // ... champs existants ...

  // Ajouter relation données chiffrées
  encryptedData         EncryptedMessageData?

  // ... relations existantes ...
}

// Modifier le modèle User existant
model User {
  // ... champs existants ...

  // Ajouter relation credential MLS
  mlsCredential         MLSCredential?

  // ... relations existantes ...
}
```

**Actions agent**:
1. Ouvrir `shared/schema.prisma`
2. Ajouter les nouveaux modèles à la fin
3. Modifier les modèles Conversation, Message, User pour ajouter les relations
4. Exécuter `npx prisma generate` dans le dossier `shared/`
5. Créer migration: `npx prisma migrate dev --name add-mls-models`

---

### TASK 2: Backend - Services MLS (Semaine 2)

#### TASK 2.1: Créer MLSService backend

**Fichier**: `gateway/src/services/MLSService.ts`

```typescript
import { PrismaClient } from '@meeshy/shared/client';
import { MLSClient } from '@meeshy/mls-core';
import { injectable } from 'tsyringe';

interface KeyPackageInfo {
  keyPackageId: string;
  publicKey: string;
  expiresAt: Date;
}

@injectable()
export class MLSService {
  private mlsClients: Map<string, MLSClient>;

  constructor(private prisma: PrismaClient) {
    this.mlsClients = new Map();
  }

  /**
   * Initialise le client MLS pour un utilisateur
   */
  private getOrCreateMLSClient(userId: string): MLSClient {
    if (!this.mlsClients.has(userId)) {
      this.mlsClients.set(userId, new MLSClient(userId));
    }
    return this.mlsClients.get(userId)!;
  }

  /**
   * Génère des KeyPackages pour un utilisateur
   * Chaque utilisateur doit avoir plusieurs KeyPackages disponibles
   */
  async generateKeyPackages(userId: string, count: number = 5): Promise<KeyPackageInfo[]> {
    const mlsClient = this.getOrCreateMLSClient(userId);
    const keyPackages: KeyPackageInfo[] = [];

    for (let i = 0; i < count; i++) {
      const { publicKey, keyPackageId } = await mlsClient.generateKeyPair();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Expire après 30 jours

      // Stocker en base
      await this.prisma.mLSKeyPackage.create({
        data: {
          userId,
          keyPackageId,
          publicKey,
          privateKeyEnc: '', // TODO: Chiffrer et stocker la clé privée
          expiresAt,
          isUsed: false
        }
      });

      keyPackages.push({
        keyPackageId,
        publicKey,
        expiresAt
      });
    }

    return keyPackages;
  }

  /**
   * Récupère un KeyPackage disponible pour un utilisateur
   */
  async fetchKeyPackage(userId: string): Promise<KeyPackageInfo | null> {
    const keyPackage = await this.prisma.mLSKeyPackage.findFirst({
      where: {
        userId,
        isUsed: false,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (!keyPackage) {
      return null;
    }

    return {
      keyPackageId: keyPackage.keyPackageId,
      publicKey: keyPackage.publicKey,
      expiresAt: keyPackage.expiresAt
    };
  }

  /**
   * Marque un KeyPackage comme utilisé
   */
  async markKeyPackageAsUsed(
    keyPackageId: string,
    conversationId: string
  ): Promise<void> {
    await this.prisma.mLSKeyPackage.update({
      where: { keyPackageId },
      data: {
        isUsed: true,
        usedForConvId: conversationId,
        usedAt: new Date()
      }
    });
  }

  /**
   * Initialise une conversation 1:1 avec chiffrement MLS
   */
  async initializeOneToOneConversation(
    conversationId: string,
    initiatorUserId: string,
    recipientUserId: string
  ): Promise<{
    groupId: string;
    initiatorKeyPackageId: string;
    recipientKeyPackageId: string;
  }> {
    // Récupérer les KeyPackages des deux utilisateurs
    const initiatorKP = await this.fetchKeyPackage(initiatorUserId);
    const recipientKP = await this.fetchKeyPackage(recipientUserId);

    if (!initiatorKP || !recipientKP) {
      throw new Error('Missing KeyPackages for one or both users');
    }

    // Générer un Group ID unique
    const groupId = `mls_group_${conversationId}`;

    // Créer l'état MLS du groupe
    await this.prisma.mLSGroupState.create({
      data: {
        conversationId,
        groupId,
        epoch: 0,
        cipherSuite: 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519',
        treeHash: '', // TODO: Calculer le tree hash
        confirmedTranscriptHash: '',
        memberKeyPackages: [
          { userId: initiatorUserId, keyPackageId: initiatorKP.keyPackageId },
          { userId: recipientUserId, keyPackageId: recipientKP.keyPackageId }
        ]
      }
    });

    // Marquer les KeyPackages comme utilisés
    await this.markKeyPackageAsUsed(initiatorKP.keyPackageId, conversationId);
    await this.markKeyPackageAsUsed(recipientKP.keyPackageId, conversationId);

    return {
      groupId,
      initiatorKeyPackageId: initiatorKP.keyPackageId,
      recipientKeyPackageId: recipientKP.keyPackageId
    };
  }

  /**
   * Chiffre un message pour une conversation
   */
  async encryptMessage(
    userId: string,
    conversationId: string,
    plaintext: string
  ): Promise<{
    ciphertext: string;
    nonce: string;
    encryptionType: string;
  }> {
    const mlsClient = this.getOrCreateMLSClient(userId);

    // Vérifier si la conversation a un état MLS
    const groupState = await this.prisma.mLSGroupState.findUnique({
      where: { conversationId }
    });

    if (!groupState) {
      // Pas de chiffrement pour cette conversation
      return {
        ciphertext: plaintext,
        nonce: '',
        encryptionType: 'none'
      };
    }

    // Chiffrer avec MLS
    const { ciphertext, nonce } = await mlsClient.encryptMessage(
      conversationId,
      plaintext
    );

    return {
      ciphertext,
      nonce,
      encryptionType: 'mls_1to1'
    };
  }

  /**
   * Déchiffre un message reçu
   */
  async decryptMessage(
    userId: string,
    conversationId: string,
    ciphertext: string,
    nonce: string
  ): Promise<string> {
    const mlsClient = this.getOrCreateMLSClient(userId);

    return await mlsClient.decryptMessage(conversationId, ciphertext, nonce);
  }

  /**
   * Vérifie si un utilisateur a des KeyPackages disponibles
   * et en génère si nécessaire
   */
  async ensureKeyPackages(userId: string, minCount: number = 3): Promise<void> {
    const availableCount = await this.prisma.mLSKeyPackage.count({
      where: {
        userId,
        isUsed: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (availableCount < minCount) {
      await this.generateKeyPackages(userId, 5);
    }
  }

  /**
   * Nettoie les KeyPackages expirés
   */
  async cleanupExpiredKeyPackages(): Promise<number> {
    const result = await this.prisma.mLSKeyPackage.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    return result.count;
  }
}
```

**Actions agent**:
1. Créer le fichier `gateway/src/services/MLSService.ts`
2. Copier le code ci-dessus
3. Installer `tsyringe` si pas déjà installé
4. Créer tests: `gateway/tests/services/MLSService.test.ts`
5. Tester que le service compile sans erreur

---

#### TASK 2.2: Intégrer MLS dans MessagingService

**Fichier**: `gateway/src/services/MessagingService.ts`

**Actions agent**: Modifier le service existant pour intégrer MLS

```typescript
// Ajouter en haut du fichier
import { MLSService } from './MLSService';

export class MessagingService {
  // Ajouter au constructor
  constructor(
    // ... params existants ...
    private mlsService: MLSService
  ) {
    // ... code existant ...
  }

  /**
   * MODIFIER la méthode handleMessage existante
   */
  async handleMessage(
    socket: Socket,
    data: {
      conversationId: string;
      content: string;
      type?: string;
      metadata?: any;
    }
  ): Promise<void> {
    const userId = socket.data.userId;

    // Validation existante...
    if (!data.conversationId || !data.content) {
      throw new Error('Missing required fields');
    }

    // Vérifier si la conversation nécessite le chiffrement MLS
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
      include: { mlsGroupState: true }
    });

    let encryptedData: {
      ciphertext: string;
      nonce: string;
      encryptionType: string;
    } | null = null;

    // NOUVEAU: Chiffrer le message si MLS activé
    if (conversation?.mlsGroupState) {
      encryptedData = await this.mlsService.encryptMessage(
        userId,
        data.conversationId,
        data.content
      );
    }

    // Créer le message en base
    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: userId,
        content: encryptedData ? encryptedData.ciphertext : data.content,
        type: data.type || 'text',
        metadata: data.metadata,
        // Créer les données chiffrées si nécessaire
        ...(encryptedData && {
          encryptedData: {
            create: {
              ciphertext: encryptedData.ciphertext,
              nonce: encryptedData.nonce,
              senderKeyHash: '', // TODO: Calculer hash
              encryptionType: encryptedData.encryptionType
            }
          }
        })
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        encryptedData: true
      }
    });

    // Broadcast le message (chiffré si nécessaire)
    this.socketManager.broadcastToConversation(
      data.conversationId,
      'message:new',
      {
        ...message,
        // Inclure les infos de chiffrement pour que les clients puissent déchiffrer
        isEncrypted: !!encryptedData,
        encryptionInfo: encryptedData ? {
          nonce: encryptedData.nonce,
          encryptionType: encryptedData.encryptionType
        } : null
      }
    );

    // Le reste du code existant (traduction, etc.)
    // ...
  }

  /**
   * NOUVELLE méthode pour initialiser une conversation avec MLS
   */
  async createEncryptedConversation(
    initiatorUserId: string,
    recipientUserId: string,
    conversationData: {
      identifier: string;
      type: string;
      title?: string;
    }
  ): Promise<any> {
    // Créer la conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        identifier: conversationData.identifier,
        type: conversationData.type,
        title: conversationData.title,
        members: {
          create: [
            { userId: initiatorUserId, role: 'member' },
            { userId: recipientUserId, role: 'member' }
          ]
        }
      }
    });

    // Initialiser MLS pour cette conversation
    const mlsInfo = await this.mlsService.initializeOneToOneConversation(
      conversation.id,
      initiatorUserId,
      recipientUserId
    );

    return {
      conversation,
      mlsInfo
    };
  }
}
```

**Actions agent**:
1. Ouvrir `gateway/src/services/MessagingService.ts`
2. Ajouter l'injection du `MLSService`
3. Modifier la méthode `handleMessage` comme indiqué
4. Ajouter la méthode `createEncryptedConversation`
5. Tester que le code compile

---

#### TASK 2.3: Créer routes API MLS

**Fichier**: `gateway/src/routes/mls.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MLSService } from '../services/MLSService';
import { authenticateRequest } from '../middleware/auth';

export async function mlsRoutes(fastify: FastifyInstance) {
  const mlsService = fastify.diContainer.resolve<MLSService>('MLSService');

  /**
   * GET /api/mls/key-packages/me
   * Récupère les KeyPackages de l'utilisateur connecté
   */
  fastify.get(
    '/key-packages/me',
    {
      preHandler: [authenticateRequest]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const keyPackages = await fastify.prisma.mLSKeyPackage.findMany({
        where: {
          userId,
          isUsed: false,
          expiresAt: {
            gt: new Date()
          }
        },
        select: {
          keyPackageId: true,
          publicKey: true,
          expiresAt: true,
          createdAt: true
        }
      });

      return reply.send({
        success: true,
        data: keyPackages
      });
    }
  );

  /**
   * POST /api/mls/key-packages/generate
   * Génère de nouveaux KeyPackages pour l'utilisateur
   */
  fastify.post(
    '/key-packages/generate',
    {
      preHandler: [authenticateRequest],
      schema: {
        body: {
          type: 'object',
          properties: {
            count: { type: 'number', minimum: 1, maximum: 10 }
          }
        }
      }
    },
    async (request: FastifyRequest<{
      Body: { count?: number }
    }>, reply: FastifyReply) => {
      const userId = request.user!.id;
      const count = request.body.count || 5;

      const keyPackages = await mlsService.generateKeyPackages(userId, count);

      return reply.send({
        success: true,
        data: keyPackages
      });
    }
  );

  /**
   * GET /api/mls/key-packages/:userId
   * Récupère un KeyPackage disponible pour un utilisateur spécifique
   * (utilisé lors de l'établissement d'une conversation)
   */
  fastify.get(
    '/key-packages/:userId',
    {
      preHandler: [authenticateRequest],
      schema: {
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{
      Params: { userId: string }
    }>, reply: FastifyReply) => {
      const { userId } = request.params;

      const keyPackage = await mlsService.fetchKeyPackage(userId);

      if (!keyPackage) {
        return reply.status(404).send({
          success: false,
          error: 'No available KeyPackage for this user'
        });
      }

      return reply.send({
        success: true,
        data: keyPackage
      });
    }
  );

  /**
   * POST /api/mls/conversations/init
   * Initialise une conversation avec MLS
   */
  fastify.post(
    '/conversations/init',
    {
      preHandler: [authenticateRequest],
      schema: {
        body: {
          type: 'object',
          required: ['recipientUserId'],
          properties: {
            recipientUserId: { type: 'string' },
            conversationId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{
      Body: {
        recipientUserId: string;
        conversationId?: string;
      }
    }>, reply: FastifyReply) => {
      const initiatorUserId = request.user!.id;
      const { recipientUserId, conversationId } = request.body;

      let convId = conversationId;

      // Si pas de conversationId, créer une nouvelle conversation
      if (!convId) {
        const conversation = await fastify.prisma.conversation.create({
          data: {
            identifier: `dm_${initiatorUserId}_${recipientUserId}`,
            type: 'direct',
            members: {
              create: [
                { userId: initiatorUserId, role: 'member' },
                { userId: recipientUserId, role: 'member' }
              ]
            }
          }
        });
        convId = conversation.id;
      }

      // Initialiser MLS
      const mlsInfo = await mlsService.initializeOneToOneConversation(
        convId,
        initiatorUserId,
        recipientUserId
      );

      return reply.send({
        success: true,
        data: {
          conversationId: convId,
          ...mlsInfo
        }
      });
    }
  );

  /**
   * GET /api/mls/conversations/:conversationId/group-state
   * Récupère l'état MLS d'une conversation
   */
  fastify.get(
    '/conversations/:conversationId/group-state',
    {
      preHandler: [authenticateRequest],
      schema: {
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{
      Params: { conversationId: string }
    }>, reply: FastifyReply) => {
      const { conversationId } = request.params;

      const groupState = await fastify.prisma.mLSGroupState.findUnique({
        where: { conversationId },
        select: {
          groupId: true,
          epoch: true,
          cipherSuite: true,
          memberKeyPackages: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!groupState) {
        return reply.status(404).send({
          success: false,
          error: 'No MLS group state for this conversation'
        });
      }

      return reply.send({
        success: true,
        data: groupState
      });
    }
  );
}
```

**Actions agent**:
1. Créer `gateway/src/routes/mls.ts`
2. Copier le code ci-dessus
3. Enregistrer les routes dans `gateway/src/server.ts`:
   ```typescript
   import { mlsRoutes } from './routes/mls';

   // Dans la fonction de setup
   await server.register(mlsRoutes, { prefix: '/api/mls' });
   ```
4. Tester les routes avec curl ou Postman

---

### TASK 3: Frontend - Client MLS (Semaine 3)

#### TASK 3.1: Créer service MLS frontend

**Fichier**: `frontend/services/mls.service.ts`

```typescript
import { MLSClient } from '@meeshy/mls-core';
import { api } from './api.service';

interface KeyPackage {
  keyPackageId: string;
  publicKey: string;
  expiresAt: Date;
}

interface ConversationMLSInfo {
  conversationId: string;
  groupId: string;
  initiatorKeyPackageId: string;
  recipientKeyPackageId: string;
}

/**
 * Service MLS côté client
 * Gère le chiffrement/déchiffrement des messages dans le navigateur
 */
class MLSFrontendService {
  private mlsClient: MLSClient | null = null;
  private userId: string | null = null;
  private conversationSecrets: Map<string, {
    myKeyPackageId: string;
    theirPublicKey: string;
    established: boolean;
  }> = new Map();

  /**
   * Initialise le service MLS pour l'utilisateur connecté
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    this.mlsClient = new MLSClient(userId);

    // Vérifier si l'utilisateur a des KeyPackages
    await this.ensureKeyPackages();
  }

  /**
   * Vérifie que l'utilisateur a des KeyPackages disponibles
   */
  private async ensureKeyPackages(): Promise<void> {
    const response = await api.get('/api/mls/key-packages/me');

    if (!response.data || response.data.length < 3) {
      // Générer de nouveaux KeyPackages
      await api.post('/api/mls/key-packages/generate', { count: 5 });
    }
  }

  /**
   * Initialise une conversation chiffrée avec un utilisateur
   */
  async initializeConversation(
    recipientUserId: string,
    conversationId?: string
  ): Promise<ConversationMLSInfo> {
    if (!this.mlsClient || !this.userId) {
      throw new Error('MLS client not initialized');
    }

    // Appeler l'API backend pour initialiser la conversation MLS
    const response = await api.post('/api/mls/conversations/init', {
      recipientUserId,
      conversationId
    });

    const mlsInfo = response.data as ConversationMLSInfo;

    // Récupérer le KeyPackage du destinataire depuis le backend
    const recipientKP = await this.fetchUserKeyPackage(recipientUserId);

    // Établir le secret partagé localement
    const myKeyPackageId = mlsInfo.initiatorKeyPackageId;

    await this.mlsClient.establishSharedSecret(
      mlsInfo.conversationId,
      myKeyPackageId,
      recipientKP.publicKey
    );

    // Stocker les infos
    this.conversationSecrets.set(mlsInfo.conversationId, {
      myKeyPackageId,
      theirPublicKey: recipientKP.publicKey,
      established: true
    });

    return mlsInfo;
  }

  /**
   * Récupère un KeyPackage pour un utilisateur
   */
  private async fetchUserKeyPackage(userId: string): Promise<KeyPackage> {
    const response = await api.get(`/api/mls/key-packages/${userId}`);
    return response.data as KeyPackage;
  }

  /**
   * Chiffre un message avant de l'envoyer
   */
  async encryptMessage(
    conversationId: string,
    plaintext: string
  ): Promise<{
    ciphertext: string;
    nonce: string;
  } | null> {
    if (!this.mlsClient) {
      throw new Error('MLS client not initialized');
    }

    const secretInfo = this.conversationSecrets.get(conversationId);
    if (!secretInfo || !secretInfo.established) {
      // Conversation non chiffrée
      return null;
    }

    return await this.mlsClient.encryptMessage(conversationId, plaintext);
  }

  /**
   * Déchiffre un message reçu
   */
  async decryptMessage(
    conversationId: string,
    ciphertext: string,
    nonce: string
  ): Promise<string> {
    if (!this.mlsClient) {
      throw new Error('MLS client not initialized');
    }

    const secretInfo = this.conversationSecrets.get(conversationId);
    if (!secretInfo || !secretInfo.established) {
      // Message non chiffré, retourner tel quel
      return ciphertext;
    }

    return await this.mlsClient.decryptMessage(conversationId, ciphertext, nonce);
  }

  /**
   * Charge l'état MLS d'une conversation depuis le backend
   */
  async loadConversationState(conversationId: string): Promise<void> {
    if (!this.mlsClient || !this.userId) {
      throw new Error('MLS client not initialized');
    }

    // Récupérer l'état du groupe depuis le backend
    const response = await api.get(`/api/mls/conversations/${conversationId}/group-state`);

    if (!response.data) {
      // Pas de MLS pour cette conversation
      return;
    }

    const groupState = response.data;
    const members = groupState.memberKeyPackages as Array<{
      userId: string;
      keyPackageId: string;
    }>;

    // Trouver mon KeyPackage et celui de l'autre utilisateur
    const myMember = members.find(m => m.userId === this.userId);
    const otherMember = members.find(m => m.userId !== this.userId);

    if (!myMember || !otherMember) {
      throw new Error('Invalid group state');
    }

    // Récupérer la clé publique de l'autre utilisateur
    const otherKP = await this.fetchUserKeyPackage(otherMember.userId);

    // Établir le secret partagé
    await this.mlsClient.establishSharedSecret(
      conversationId,
      myMember.keyPackageId,
      otherKP.publicKey
    );

    this.conversationSecrets.set(conversationId, {
      myKeyPackageId: myMember.keyPackageId,
      theirPublicKey: otherKP.publicKey,
      established: true
    });
  }

  /**
   * Vérifie si une conversation est chiffrée
   */
  isConversationEncrypted(conversationId: string): boolean {
    const secretInfo = this.conversationSecrets.get(conversationId);
    return secretInfo?.established || false;
  }

  /**
   * Nettoie les ressources
   */
  cleanup(): void {
    this.mlsClient = null;
    this.userId = null;
    this.conversationSecrets.clear();
  }
}

export const mlsService = new MLSFrontendService();
```

**Actions agent**:
1. Créer `frontend/services/mls.service.ts`
2. Copier le code ci-dessus
3. S'assurer que le package `@meeshy/mls-core` est accessible depuis le frontend
4. Ajouter le build du package dans le pipeline de build frontend

---

#### TASK 3.2: Modifier le service Socket.IO pour supporter le chiffrement

**Fichier**: `frontend/services/meeshy-socketio.service.ts`

**Actions agent**: Modifier le service existant

```typescript
// Ajouter en haut
import { mlsService } from './mls.service';

export class MeeshySocketIOService {
  // ... code existant ...

  /**
   * MODIFIER la méthode sendMessage existante
   */
  async sendMessage(data: {
    conversationId: string;
    content: string;
    type?: string;
    metadata?: any;
  }): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    // NOUVEAU: Essayer de chiffrer le message
    let messageContent = data.content;
    let encryptionInfo: {
      nonce: string;
      isEncrypted: boolean;
    } | undefined;

    try {
      const encrypted = await mlsService.encryptMessage(
        data.conversationId,
        data.content
      );

      if (encrypted) {
        messageContent = encrypted.ciphertext;
        encryptionInfo = {
          nonce: encrypted.nonce,
          isEncrypted: true
        };
      }
    } catch (error) {
      console.warn('Failed to encrypt message, sending in clear:', error);
    }

    // Envoyer le message (chiffré ou non)
    this.socket.emit('message:send', {
      ...data,
      content: messageContent,
      encryptionInfo
    });
  }

  /**
   * MODIFIER le handler de réception de messages
   */
  private setupMessageHandlers(): void {
    if (!this.socket) return;

    this.socket.on('message:new', async (message: any) => {
      // NOUVEAU: Déchiffrer le message si nécessaire
      if (message.isEncrypted && message.encryptionInfo) {
        try {
          const decrypted = await mlsService.decryptMessage(
            message.conversationId,
            message.content,
            message.encryptionInfo.nonce
          );

          message.content = decrypted;
          message.decrypted = true;
        } catch (error) {
          console.error('Failed to decrypt message:', error);
          message.content = '[Message chiffré - échec du déchiffrement]';
          message.decryptionFailed = true;
        }
      }

      // Traitement existant du message
      this.handleIncomingMessage(message);
    });

    // ... autres handlers existants ...
  }

  /**
   * NOUVELLE méthode pour initialiser une conversation chiffrée
   */
  async initializeEncryptedConversation(
    recipientUserId: string,
    conversationId?: string
  ): Promise<{
    conversationId: string;
    groupId: string;
  }> {
    const mlsInfo = await mlsService.initializeConversation(
      recipientUserId,
      conversationId
    );

    return {
      conversationId: mlsInfo.conversationId,
      groupId: mlsInfo.groupId
    };
  }
}
```

**Actions agent**:
1. Ouvrir `frontend/services/meeshy-socketio.service.ts`
2. Importer `mlsService`
3. Modifier `sendMessage` pour chiffrer
4. Modifier le handler `message:new` pour déchiffrer
5. Ajouter `initializeEncryptedConversation`
6. Tester que le code compile

---

#### TASK 3.3: Créer hook React pour messaging MLS

**Fichier**: `frontend/hooks/use-mls-messaging.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { mlsService } from '../services/mls.service';
import { useAuth } from './use-auth';

interface UseMLSMessagingReturn {
  isMLSReady: boolean;
  isConversationEncrypted: (conversationId: string) => boolean;
  initializeEncryptedConversation: (
    recipientUserId: string,
    conversationId?: string
  ) => Promise<void>;
  encryptionStatus: 'initializing' | 'ready' | 'error' | 'not-initialized';
  error: Error | null;
}

/**
 * Hook pour gérer le chiffrement MLS dans les composants React
 */
export function useMLSMessaging(): UseMLSMessagingReturn {
  const { user } = useAuth();
  const [isMLSReady, setIsMLSReady] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<
    'initializing' | 'ready' | 'error' | 'not-initialized'
  >('not-initialized');
  const [error, setError] = useState<Error | null>(null);

  // Initialiser MLS au chargement si utilisateur connecté
  useEffect(() => {
    if (user?.id) {
      initializeMLS();
    }

    return () => {
      mlsService.cleanup();
    };
  }, [user?.id]);

  const initializeMLS = async () => {
    if (!user?.id) return;

    try {
      setEncryptionStatus('initializing');
      await mlsService.initialize(user.id);
      setIsMLSReady(true);
      setEncryptionStatus('ready');
    } catch (err) {
      console.error('Failed to initialize MLS:', err);
      setError(err as Error);
      setEncryptionStatus('error');
    }
  };

  const isConversationEncrypted = useCallback((conversationId: string) => {
    return mlsService.isConversationEncrypted(conversationId);
  }, []);

  const initializeEncryptedConversation = useCallback(
    async (recipientUserId: string, conversationId?: string) => {
      try {
        await mlsService.initializeConversation(recipientUserId, conversationId);
      } catch (err) {
        console.error('Failed to initialize encrypted conversation:', err);
        throw err;
      }
    },
    []
  );

  return {
    isMLSReady,
    isConversationEncrypted,
    initializeEncryptedConversation,
    encryptionStatus,
    error
  };
}
```

**Actions agent**:
1. Créer `frontend/hooks/use-mls-messaging.ts`
2. Copier le code ci-dessus
3. Tester l'import dans un composant existant

---

#### TASK 3.4: Ajouter indicateur de chiffrement dans l'UI

**Fichier**: `frontend/components/common/BubbleMessage.tsx`

**Actions agent**: Modifier le composant existant pour afficher un indicateur de chiffrement

```typescript
// Ajouter dans les props du composant
interface BubbleMessageProps {
  // ... props existantes ...
  isEncrypted?: boolean;
  decryptionFailed?: boolean;
}

// Dans le rendu du composant
export function BubbleMessage({
  message,
  isEncrypted,
  decryptionFailed,
  // ... autres props
}: BubbleMessageProps) {
  return (
    <div className="bubble-message">
      {/* Indicateur de chiffrement */}
      {isEncrypted && !decryptionFailed && (
        <div className="encryption-badge" title="Message chiffré end-to-end">
          🔒
        </div>
      )}

      {decryptionFailed && (
        <div className="encryption-error" title="Échec du déchiffrement">
          ⚠️ Message chiffré
        </div>
      )}

      {/* Contenu existant du message */}
      <div className="message-content">
        {message.content}
      </div>

      {/* ... reste du composant ... */}
    </div>
  );
}
```

**Styles à ajouter** (`frontend/styles/components/bubble-message.css`):

```css
.encryption-badge {
  display: inline-block;
  font-size: 12px;
  margin-right: 4px;
  opacity: 0.6;
}

.encryption-error {
  color: #f44336;
  font-size: 11px;
  margin-bottom: 4px;
}
```

**Actions agent**:
1. Ouvrir `frontend/components/common/BubbleMessage.tsx`
2. Ajouter les props `isEncrypted` et `decryptionFailed`
3. Ajouter l'indicateur visuel de chiffrement
4. Ajouter les styles CSS

---

### TASK 4: Migration et rétrocompatibilité (Semaine 4)

#### TASK 4.1: Créer script de migration

**Fichier**: `scripts/migrate-to-mls.ts`

```typescript
#!/usr/bin/env ts-node

import { PrismaClient } from '@meeshy/shared/client';
import { MLSService } from '../gateway/src/services/MLSService';

const prisma = new PrismaClient();
const mlsService = new MLSService(prisma);

/**
 * Script de migration pour activer progressivement MLS
 *
 * Phase 1: Génère des KeyPackages pour tous les utilisateurs
 * Phase 2: Active MLS pour nouvelles conversations uniquement
 * Phase 3: Migration progressive des conversations existantes (opt-in)
 */
async function migrateToMLS() {
  console.log('🔐 Starting MLS migration...\n');

  // Étape 1: Compter les utilisateurs actifs
  const userCount = await prisma.user.count({
    where: { isActive: true }
  });

  console.log(`📊 Found ${userCount} active users\n`);

  // Étape 2: Générer des KeyPackages pour tous les utilisateurs
  console.log('🔑 Generating KeyPackages for all users...');

  let processed = 0;
  const batchSize = 50;

  while (processed < userCount) {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      skip: processed,
      take: batchSize,
      select: { id: true, username: true }
    });

    for (const user of users) {
      try {
        // Vérifier si l'utilisateur a déjà des KeyPackages
        const existingKP = await prisma.mLSKeyPackage.count({
          where: {
            userId: user.id,
            isUsed: false,
            expiresAt: { gt: new Date() }
          }
        });

        if (existingKP < 3) {
          await mlsService.generateKeyPackages(user.id, 5);
          console.log(`  ✅ Generated KeyPackages for ${user.username}`);
        } else {
          console.log(`  ⏭️  ${user.username} already has KeyPackages`);
        }
      } catch (error) {
        console.error(`  ❌ Failed for ${user.username}:`, error);
      }
    }

    processed += users.length;
    console.log(`  Progress: ${processed}/${userCount}\n`);
  }

  // Étape 3: Statistiques finales
  const stats = await gatherStats();

  console.log('\n📊 Migration Statistics:');
  console.log(`  Total users: ${stats.totalUsers}`);
  console.log(`  Users with KeyPackages: ${stats.usersWithKeyPackages}`);
  console.log(`  Total KeyPackages generated: ${stats.totalKeyPackages}`);
  console.log(`  Encrypted conversations: ${stats.encryptedConversations}`);

  console.log('\n✅ MLS migration completed!\n');
}

async function gatherStats() {
  const totalUsers = await prisma.user.count({ where: { isActive: true } });

  const usersWithKeyPackages = await prisma.mLSKeyPackage.groupBy({
    by: ['userId'],
    where: {
      isUsed: false,
      expiresAt: { gt: new Date() }
    }
  });

  const totalKeyPackages = await prisma.mLSKeyPackage.count({
    where: {
      isUsed: false,
      expiresAt: { gt: new Date() }
    }
  });

  const encryptedConversations = await prisma.mLSGroupState.count();

  return {
    totalUsers,
    usersWithKeyPackages: usersWithKeyPackages.length,
    totalKeyPackages,
    encryptedConversations
  };
}

// Exécuter la migration
migrateToMLS()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Actions agent**:
1. Créer `scripts/migrate-to-mls.ts`
2. Copier le code ci-dessus
3. Rendre le script exécutable: `chmod +x scripts/migrate-to-mls.ts`
4. Ajouter script dans `package.json`:
   ```json
   "scripts": {
     "migrate:mls": "ts-node scripts/migrate-to-mls.ts"
   }
   ```

---

#### TASK 4.2: Créer feature flag pour activation progressive

**Fichier**: `shared/feature-flags.ts`

```typescript
export interface FeatureFlags {
  mlsEncryptionEnabled: boolean;
  mlsEncryptionForNewConversations: boolean;
  mlsEncryptionOptional: boolean;
  mlsFederationEnabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // Phase 1: Activé pour nouveaux utilisateurs/conversations
  mlsEncryptionEnabled: true,
  mlsEncryptionForNewConversations: true,

  // Phase 1: Utilisateurs peuvent choisir de désactiver
  mlsEncryptionOptional: true,

  // Phase 2+: Fédération avec gatekeepers (pas encore)
  mlsFederationEnabled: false
};

/**
 * Récupère les feature flags depuis la config ou env
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    mlsEncryptionEnabled: process.env.MLS_ENCRYPTION_ENABLED === 'true' ||
                          DEFAULT_FEATURE_FLAGS.mlsEncryptionEnabled,
    mlsEncryptionForNewConversations: process.env.MLS_NEW_CONV_ENABLED === 'true' ||
                                      DEFAULT_FEATURE_FLAGS.mlsEncryptionForNewConversations,
    mlsEncryptionOptional: process.env.MLS_OPTIONAL === 'true' ||
                           DEFAULT_FEATURE_FLAGS.mlsEncryptionOptional,
    mlsFederationEnabled: process.env.MLS_FEDERATION_ENABLED === 'true' ||
                          DEFAULT_FEATURE_FLAGS.mlsFederationEnabled
  };
}
```

**Actions agent**:
1. Créer `shared/feature-flags.ts`
2. Utiliser les flags dans `MessagingService`:

```typescript
import { getFeatureFlags } from '@meeshy/shared/feature-flags';

export class MessagingService {
  private featureFlags = getFeatureFlags();

  async createConversation(data: any) {
    // Vérifier si MLS doit être activé
    const shouldEnableMLS =
      this.featureFlags.mlsEncryptionEnabled &&
      this.featureFlags.mlsEncryptionForNewConversations &&
      data.type === 'direct';  // Phase 1: seulement 1:1

    if (shouldEnableMLS) {
      // Créer avec MLS
    } else {
      // Créer sans MLS (ancien comportement)
    }
  }
}
```

---

#### TASK 4.3: Tests de non-régression

**Fichier**: `gateway/tests/integration/mls-backwards-compat.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/client';
import { MessagingService } from '../../src/services/MessagingService';
import { MLSService } from '../../src/services/MLSService';

const prisma = new PrismaClient();
const mlsService = new MLSService(prisma);
const messagingService = new MessagingService(/* ... */ mlsService);

describe('MLS Backwards Compatibility', () => {
  let user1Id: string;
  let user2Id: string;
  let oldConversationId: string;

  beforeAll(async () => {
    // Créer des utilisateurs de test
    const user1 = await prisma.user.create({
      data: {
        username: 'test_user_1',
        email: 'test1@example.com',
        password: 'hashed_password',
        firstName: 'Test',
        lastName: 'User1'
      }
    });

    const user2 = await prisma.user.create({
      data: {
        username: 'test_user_2',
        email: 'test2@example.com',
        password: 'hashed_password',
        firstName: 'Test',
        lastName: 'User2'
      }
    });

    user1Id = user1.id;
    user2Id = user2.id;

    // Créer une conversation SANS MLS (comme avant)
    const oldConv = await prisma.conversation.create({
      data: {
        identifier: 'test_old_conv',
        type: 'direct',
        members: {
          create: [
            { userId: user1Id, role: 'member' },
            { userId: user2Id, role: 'member' }
          ]
        }
      }
    });

    oldConversationId = oldConv.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.message.deleteMany({
      where: { conversationId: oldConversationId }
    });
    await prisma.conversationMember.deleteMany({
      where: { conversationId: oldConversationId }
    });
    await prisma.conversation.delete({
      where: { id: oldConversationId }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } }
    });
    await prisma.$disconnect();
  });

  it('should handle messages in non-MLS conversations', async () => {
    // Envoyer un message dans une conversation non-MLS
    const message = await messagingService.sendMessage(user1Id, {
      conversationId: oldConversationId,
      content: 'Test message in old conversation',
      type: 'text'
    });

    expect(message).toBeDefined();
    expect(message.content).toBe('Test message in old conversation');

    // Vérifier qu'il n'y a pas de données chiffrées
    const encryptedData = await prisma.encryptedMessageData.findFirst({
      where: { messageId: message.id }
    });

    expect(encryptedData).toBeNull();
  });

  it('should create new conversations with MLS when feature flag enabled', async () => {
    // Générer des KeyPackages pour les utilisateurs
    await mlsService.generateKeyPackages(user1Id, 5);
    await mlsService.generateKeyPackages(user2Id, 5);

    // Créer une NOUVELLE conversation (doit avoir MLS)
    const newConv = await messagingService.createEncryptedConversation(
      user1Id,
      user2Id,
      {
        identifier: 'test_new_conv',
        type: 'direct'
      }
    );

    expect(newConv.conversation).toBeDefined();
    expect(newConv.mlsInfo).toBeDefined();

    // Vérifier qu'un état MLS a été créé
    const groupState = await prisma.mLSGroupState.findUnique({
      where: { conversationId: newConv.conversation.id }
    });

    expect(groupState).toBeDefined();
    expect(groupState?.groupId).toContain('mls_group_');

    // Cleanup
    await prisma.mLSGroupState.delete({
      where: { conversationId: newConv.conversation.id }
    });
    await prisma.conversationMember.deleteMany({
      where: { conversationId: newConv.conversation.id }
    });
    await prisma.conversation.delete({
      where: { id: newConv.conversation.id }
    });
  });

  it('should allow reading old messages after MLS activation', async () => {
    // Envoyer un message AVANT activation MLS
    const oldMessage = await messagingService.sendMessage(user1Id, {
      conversationId: oldConversationId,
      content: 'Message before MLS',
      type: 'text'
    });

    // Activer MLS pour la conversation (simulation)
    // Note: en prod, ceci serait une migration opt-in

    // Envoyer un nouveau message APRÈS activation MLS
    const newMessage = await messagingService.sendMessage(user1Id, {
      conversationId: oldConversationId,
      content: 'Message after MLS',
      type: 'text'
    });

    // Les deux messages doivent être lisibles
    const messages = await prisma.message.findMany({
      where: { conversationId: oldConversationId },
      orderBy: { createdAt: 'asc' }
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('before MLS');
    expect(messages[1].content).toBeDefined();
  });
});
```

**Actions agent**:
1. Créer le fichier de test
2. Exécuter les tests: `npm test mls-backwards-compat`
3. S'assurer que tous les tests passent

---

### TASK 5: Documentation et monitoring (Semaine 4)

#### TASK 5.1: Créer documentation utilisateur

**Fichier**: `docs/dma-interoperability/USER_GUIDE_MLS.md`

```markdown
# Guide Utilisateur - Chiffrement End-to-End Meeshy

## 🔐 Qu'est-ce que le chiffrement end-to-end ?

Le chiffrement end-to-end (E2EE) signifie que vos messages sont chiffrés sur votre appareil et ne peuvent être déchiffrés que par le destinataire. Même Meeshy ne peut pas lire vos messages chiffrés.

## ✨ Fonctionnalités Phase 1

### Conversations 1:1 chiffrées

- ✅ Toutes les nouvelles conversations directes sont automatiquement chiffrées
- ✅ Les messages sont chiffrés localement dans votre navigateur
- ✅ Seuls vous et votre destinataire pouvez lire les messages
- ✅ Indicateur 🔒 visible sur les messages chiffrés

### Rétrocompatibilité

- ✅ Vos anciennes conversations continuent de fonctionner normalement
- ✅ Vous pouvez choisir d'activer le chiffrement pour les conversations existantes
- ✅ Aucune interruption de service

## 🚀 Comment utiliser

### Démarrer une conversation chiffrée

1. Cliquez sur "Nouvelle conversation"
2. Sélectionnez un contact
3. La conversation est automatiquement chiffrée (icône 🔒)
4. Envoyez vos messages normalement !

### Vérifier qu'une conversation est chiffrée

- Regardez l'en-tête de la conversation
- Si vous voyez 🔒 "Chiffré end-to-end", c'est bon !
- Chaque message chiffré affiche aussi l'icône 🔒

### Activer le chiffrement pour une conversation existante

*Fonctionnalité disponible en Phase 2*

## ⚠️ Limitations Phase 1

- ❌ Pas encore de chiffrement pour les groupes (bientôt)
- ❌ Pas encore d'interopérabilité avec WhatsApp/Messenger
- ⚠️ Le chiffrement nécessite que les deux utilisateurs soient sur Meeshy

## 🔧 Dépannage

### "Échec du déchiffrement"

Si vous voyez ce message :
1. Rafraîchissez la page
2. Demandez à votre contact de renvoyer le message
3. Contactez le support si le problème persiste

### Messages non chiffrés dans une conversation chiffrée

Cela peut arriver si :
- Le message a été envoyé avant l'activation du chiffrement
- Il y a eu un problème technique temporaire

## 🛡️ Sécurité

### Ce qui est chiffré

✅ Contenu des messages
✅ Fichiers joints (Phase 2)
✅ Métadonnées des messages

### Ce qui n'est PAS chiffré

❌ Qui parle à qui (métadonnées de connexion)
❌ Horodatage des messages
❌ Noms d'utilisateur et avatars

## 📞 Support

Questions ? Contactez-nous à support@meeshy.com
```

---

#### TASK 5.2: Créer dashboard de monitoring MLS

**Fichier**: `gateway/src/routes/admin/mls-stats.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateAdmin } from '../../middleware/auth';

export async function mlsStatsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/mls/stats
   * Statistiques MLS pour monitoring
   */
  fastify.get(
    '/stats',
    {
      preHandler: [authenticateAdmin]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Statistiques générales
      const totalUsers = await fastify.prisma.user.count({
        where: { isActive: true }
      });

      const usersWithKeyPackages = await fastify.prisma.mLSKeyPackage.groupBy({
        by: ['userId'],
        where: {
          isUsed: false,
          expiresAt: { gt: new Date() }
        }
      });

      const totalKeyPackages = await fastify.prisma.mLSKeyPackage.count();

      const availableKeyPackages = await fastify.prisma.mLSKeyPackage.count({
        where: {
          isUsed: false,
          expiresAt: { gt: new Date() }
        }
      });

      const expiredKeyPackages = await fastify.prisma.mLSKeyPackage.count({
        where: {
          expiresAt: { lt: new Date() }
        }
      });

      const encryptedConversations = await fastify.prisma.mLSGroupState.count();

      const totalConversations = await fastify.prisma.conversation.count({
        where: { type: 'direct' }
      });

      const encryptedMessages = await fastify.prisma.encryptedMessageData.count();

      const totalMessages = await fastify.prisma.message.count();

      // Adoption rate
      const adoptionRate = totalConversations > 0
        ? ((encryptedConversations / totalConversations) * 100).toFixed(2)
        : '0.00';

      const encryptionRate = totalMessages > 0
        ? ((encryptedMessages / totalMessages) * 100).toFixed(2)
        : '0.00';

      return reply.send({
        success: true,
        data: {
          users: {
            total: totalUsers,
            withKeyPackages: usersWithKeyPackages.length,
            percentage: ((usersWithKeyPackages.length / totalUsers) * 100).toFixed(2)
          },
          keyPackages: {
            total: totalKeyPackages,
            available: availableKeyPackages,
            expired: expiredKeyPackages,
            used: totalKeyPackages - availableKeyPackages - expiredKeyPackages
          },
          conversations: {
            total: totalConversations,
            encrypted: encryptedConversations,
            adoptionRate: `${adoptionRate}%`
          },
          messages: {
            total: totalMessages,
            encrypted: encryptedMessages,
            encryptionRate: `${encryptionRate}%`
          },
          timestamp: new Date().toISOString()
        }
      });
    }
  );

  /**
   * GET /api/admin/mls/health
   * Health check MLS
   */
  fastify.get(
    '/health',
    {
      preHandler: [authenticateAdmin]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Vérifier qu'il y a suffisamment de KeyPackages disponibles
      const lowKeyPackageUsers = await fastify.prisma.$queryRaw`
        SELECT userId, COUNT(*) as count
        FROM MLSKeyPackage
        WHERE isUsed = false AND expiresAt > NOW()
        GROUP BY userId
        HAVING count < 3
      `;

      // Vérifier les KeyPackages qui expirent bientôt
      const expiringKeyComing = new Date();
      expiringKeyComing.setDate(expiringKeyComing.getDate() + 7);

      const expiringKeyPackages = await fastify.prisma.mLSKeyPackage.count({
        where: {
          isUsed: false,
          expiresAt: {
            gt: new Date(),
            lt: expiringKeyComing
          }
        }
      });

      const issues = [];

      if (Array.isArray(lowKeyPackageUsers) && lowKeyPackageUsers.length > 0) {
        issues.push({
          severity: 'warning',
          type: 'low_key_packages',
          message: `${lowKeyPackageUsers.length} users have less than 3 available KeyPackages`,
          affectedUsers: lowKeyPackageUsers.length
        });
      }

      if (expiringKeyPackages > 0) {
        issues.push({
          severity: 'info',
          type: 'expiring_key_packages',
          message: `${expiringKeyPackages} KeyPackages expiring within 7 days`,
          count: expiringKeyPackages
        });
      }

      const healthStatus = issues.length === 0 ? 'healthy' :
                          issues.some(i => i.severity === 'error') ? 'error' : 'warning';

      return reply.send({
        success: true,
        data: {
          status: healthStatus,
          issues,
          timestamp: new Date().toISOString()
        }
      });
    }
  );
}
```

**Actions agent**:
1. Créer `gateway/src/routes/admin/mls-stats.ts`
2. Enregistrer les routes dans le serveur
3. Créer un dashboard frontend simple pour visualiser ces stats

---

#### TASK 5.3: Créer job de maintenance MLS

**Fichier**: `gateway/src/jobs/mls-maintenance.ts`

```typescript
import { PrismaClient } from '@meeshy/shared/client';
import { MLSService } from '../services/MLSService';

const prisma = new PrismaClient();
const mlsService = new MLSService(prisma);

/**
 * Job de maintenance MLS
 * À exécuter quotidiennement via cron
 */
export async function mlsMaintenanceJob() {
  console.log('[MLS Maintenance] Starting...');

  try {
    // 1. Nettoyer les KeyPackages expirés
    const deletedCount = await mlsService.cleanupExpiredKeyPackages();
    console.log(`[MLS Maintenance] Deleted ${deletedCount} expired KeyPackages`);

    // 2. S'assurer que tous les utilisateurs actifs ont des KeyPackages
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    let ensuredCount = 0;
    for (const user of activeUsers) {
      await mlsService.ensureKeyPackages(user.id, 3);
      ensuredCount++;
    }

    console.log(`[MLS Maintenance] Ensured KeyPackages for ${ensuredCount} users`);

    // 3. Statistiques
    const stats = {
      activeUsers: activeUsers.length,
      availableKeyPackages: await prisma.mLSKeyPackage.count({
        where: {
          isUsed: false,
          expiresAt: { gt: new Date() }
        }
      }),
      encryptedConversations: await prisma.mLSGroupState.count()
    };

    console.log('[MLS Maintenance] Stats:', stats);
    console.log('[MLS Maintenance] Completed successfully');

    return stats;
  } catch (error) {
    console.error('[MLS Maintenance] Error:', error);
    throw error;
  }
}

// Si exécuté directement
if (require.main === module) {
  mlsMaintenanceJob()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

**Fichier cron**: `crontab.txt`

```bash
# MLS Maintenance - Tous les jours à 3h du matin
0 3 * * * cd /path/to/meeshy/gateway && npm run mls:maintenance
```

**Actions agent**:
1. Créer `gateway/src/jobs/mls-maintenance.ts`
2. Ajouter script dans `package.json`:
   ```json
   "scripts": {
     "mls:maintenance": "ts-node src/jobs/mls-maintenance.ts"
   }
   ```
3. Documenter comment configurer le cron job

---

## 📊 Checklist de déploiement Phase 1

### Pré-déploiement

- [ ] Tous les tests passent (unitaires + intégration)
- [ ] Code review complété
- [ ] Documentation utilisateur prête
- [ ] Feature flags configurés
- [ ] Backup de la base de données

### Migration

- [ ] Exécuter `npm run prisma:migrate` pour créer les tables MLS
- [ ] Exécuter `npm run migrate:mls` pour générer les KeyPackages
- [ ] Vérifier que tous les utilisateurs ont des KeyPackages

### Déploiement

- [ ] Déployer backend avec nouveau code MLS
- [ ] Déployer frontend avec UI de chiffrement
- [ ] Activer feature flag `mlsEncryptionEnabled`
- [ ] Monitorer les logs pour erreurs
- [ ] Vérifier le dashboard de stats MLS

### Post-déploiement

- [ ] Tester une conversation chiffrée en production
- [ ] Vérifier que les anciennes conversations fonctionnent
- [ ] Configurer le cron job de maintenance
- [ ] Communiquer aux utilisateurs (email, blog post)

### Rollback plan

Si problème critique :
1. Désactiver feature flag `mlsEncryptionEnabled`
2. Les nouvelles conversations redeviendront non-chiffrées
3. Les conversations chiffrées existantes continuent de fonctionner
4. Investiguer et corriger le bug
5. Réactiver quand corrigé

---

## 🎯 Métriques de succès Phase 1

### Objectifs quantitatifs

- **Adoption**: 50% des nouvelles conversations chiffrées dans le 1er mois
- **Performance**: Latence supplémentaire < 50ms pour chiffrement
- **Fiabilité**: 99.9% des messages déchiffrés correctement
- **Disponibilité**: 100% des utilisateurs avec KeyPackages valides

### Objectifs qualitatifs

- Aucune régression sur fonctionnalités existantes
- Feedback utilisateur positif
- Aucun incident de sécurité
- Documentation claire et complète

---

## 🚀 Prochaines étapes (Phase 2+)

### Phase 2: Chiffrement de groupe (8-10 semaines)

- Support MLS pour conversations de groupe
- Migration vers OpenMLS (Rust) pour performance
- Chiffrement des fichiers joints
- Vérification de sécurité avancée

### Phase 3: Fédération DMA (12-16 semaines)

- Implémentation du protocole de fédération DMA
- Adaptateurs WhatsApp, Messenger, iMessage
- Translation automatique inter-plateformes
- Conformité réglementaire DMA

### Phase 4: Fonctionnalités avancées

- Vérification d'identité (safety numbers)
- Appels chiffrés E2E
- Backup chiffré des conversations
- Support multi-device

---

## 📞 Support et contact

**Pour les agents de codage :**
- Questions techniques : consultez `docs/dma-interoperability/MESSAGING_ARCHITECTURE_DMA.md`
- Bugs : créer une issue avec tag `[MLS]`
- Code review : tag `@security-team`

**Ressources :**
- RFC 9420 (MLS Protocol): https://datatracker.ietf.org/doc/rfc9420/
- DMA Regulation: https://digital-markets-act.ec.europa.eu/
- OpenMLS: https://github.com/openmls/openmls

---

**Version**: 1.0.0
**Dernière mise à jour**: 2025-11-16
**Status**: Ready for implementation
