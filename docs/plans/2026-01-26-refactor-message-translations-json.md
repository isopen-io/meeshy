# Plan de Refactorisation: MessageTranslation → Message.translations (JSON)

> **Date:** 2026-01-26
> **Objectif:** Migrer le système de traductions d'une collection séparée vers un champ JSON intégré, avec rétrocompatibilité frontend

## ✅ État actuel

### Migrations complétées
1. **Schema Prisma:** `MessageTranslation` model supprimé, `Message.translations Json` ajouté
2. **Données staging:** 979 messages migrés vers format JSON
3. **Collection MongoDB:** `MessageTranslation` supprimée
4. **Index:** `MessageTranslation_cacheKey_key` supprimé

### Travail restant
1. ❌ **MessageTranslationService.ts** - utilise encore `prisma.messageTranslation.*`
2. ❌ **Types TypeScript** - définitions obsolètes de `MessageTranslation`
3. ❌ **API transformation** - pas de conversion JSON → array pour frontend
4. ❌ **Client Prisma** - pas régénéré
5. ❌ **Gateway** - rebuild nécessaire

## 🎯 Objectifs de refactorisation

### Contraintes critiques
1. **Rétrocompatibilité frontend:** L'API doit continuer à retourner `MessageTranslation[]`
2. **Validation Zod:** Respecter les schémas existants
3. **Pas de breaking change:** Le frontend ne doit pas être modifié

### Structure des données

#### Nouveau format (MongoDB/Prisma)
```typescript
Message.translations: {
  "en": {
    text: string,
    translationModel: "basic" | "medium" | "premium",
    confidenceScore?: number,
    isEncrypted?: boolean,
    encryptionKeyId?: string,
    encryptionIv?: string,
    encryptionAuthTag?: string,
    createdAt: Date,
    updatedAt?: Date
  },
  "es": { ... }
}
```

#### Format API (rétrocompatibilité)
```typescript
Message.translations: MessageTranslation[] = [
  {
    id: string,              // Généré: `${messageId}-${lang}`
    messageId: string,
    targetLanguage: string,
    translatedContent: string,
    translationModel: TranslationModel,
    confidenceScore?: number,
    isEncrypted?: boolean,
    encryptionKeyId?: string,
    encryptionIv?: string,
    encryptionAuthTag?: string,
    createdAt: Date,
    updatedAt?: Date
  }
]
```

## 📝 Tâches détaillées

### Tâche 1: Créer le helper de transformation

**Fichier:** `services/gateway/src/utils/translation-transformer.ts` (nouveau)

**Code:**
```typescript
import type { MessageTranslation } from '@meeshy/shared/types';

/**
 * Structure interne du champ Message.translations (JSON)
 */
export interface MessageTranslationJSON {
  text: string;
  translationModel: 'basic' | 'medium' | 'premium';
  confidenceScore?: number;
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptionIv?: string;
  encryptionAuthTag?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Transforme Message.translations (JSON) vers format API (array)
 * Pour rétrocompatibilité avec le frontend
 */
export function transformTranslationsToArray(
  messageId: string,
  translationsJson: Record<string, MessageTranslationJSON> | null | undefined
): MessageTranslation[] {
  if (!translationsJson) return [];

  return Object.entries(translationsJson).map(([lang, data]) => ({
    id: `${messageId}-${lang}`, // ID synthétique pour compatibilité
    messageId,
    targetLanguage: lang,
    translatedContent: data.text,
    translationModel: data.translationModel,
    confidenceScore: data.confidenceScore,
    isEncrypted: data.isEncrypted || false,
    encryptionKeyId: data.encryptionKeyId,
    encryptionIv: data.encryptionIv,
    encryptionAuthTag: data.encryptionAuthTag,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  }));
}

/**
 * Transforme une traduction unique vers l'objet JSON
 */
export function createTranslationJSON(params: {
  text: string;
  translationModel: 'basic' | 'medium' | 'premium';
  confidenceScore?: number;
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptionIv?: string;
  encryptionAuthTag?: string;
  preserveCreatedAt?: Date;
}): MessageTranslationJSON {
  const now = new Date();
  return {
    text: params.text,
    translationModel: params.translationModel,
    confidenceScore: params.confidenceScore,
    isEncrypted: params.isEncrypted || false,
    encryptionKeyId: params.encryptionKeyId || null,
    encryptionIv: params.encryptionIv || null,
    encryptionAuthTag: params.encryptionAuthTag || null,
    createdAt: params.preserveCreatedAt || now,
    updatedAt: now
  };
}
```

**Commit:** `feat(utils): ajouter transformateurs translations JSON ↔ array`

---

### Tâche 2: Refactoriser MessageTranslationService - Opération upsert (ligne 2422)

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts:2422`

**Avant:**
```typescript
const translation = await this.prisma.messageTranslation.upsert({
  where: {
    messageId_targetLanguage: {
      messageId: result.messageId,
      targetLanguage: result.targetLanguage
    }
  },
  update: {
    translatedContent: contentToStore,
    translationModel: modelInfo,
    confidenceScore: confidenceScore,
    isEncrypted: encryptionData.isEncrypted,
    encryptionKeyId: encryptionData.encryptionKeyId,
    encryptionIv: encryptionData.encryptionIv,
    encryptionAuthTag: encryptionData.encryptionAuthTag
  },
  create: { ... }
});
```

**Après:**
```typescript
// Import en haut du fichier
import { createTranslationJSON, type MessageTranslationJSON } from '../../utils/translation-transformer';

// Dans la fonction (ligne 2422):
// 1. Lire le message actuel
const message = await this.prisma.message.findUnique({
  where: { id: result.messageId },
  select: { translations: true }
});

// 2. Parser et mettre à jour les translations
const translations = (message?.translations as Record<string, MessageTranslationJSON>) || {};

// Préserver createdAt existant si présent
const existingCreatedAt = translations[result.targetLanguage]?.createdAt;

translations[result.targetLanguage] = createTranslationJSON({
  text: contentToStore,
  translationModel: modelInfo,
  confidenceScore: confidenceScore,
  isEncrypted: encryptionData.isEncrypted,
  encryptionKeyId: encryptionData.encryptionKeyId,
  encryptionIv: encryptionData.encryptionIv,
  encryptionAuthTag: encryptionData.encryptionAuthTag,
  preserveCreatedAt: existingCreatedAt
});

// 3. Sauvegarder
await this.prisma.message.update({
  where: { id: result.messageId },
  data: { translations }
});

// Note: Pas besoin de retourner translation.id car utilisé uniquement pour logging
```

**Commit:** `refactor(translations): migrer upsert vers JSON (ligne 2422)`

---

### Tâche 3: Refactoriser deleteMany (ligne 456)

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts:456`

**Avant:**
```typescript
const deleteResult = await this.prisma.messageTranslation.deleteMany({
  where: {
    messageId: messageId,
    targetLanguage: {
      in: filteredTargetLanguages
    }
  }
});
```

**Après:**
```typescript
// Lire le message
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: { translations: true }
});

if (message?.translations) {
  const translations = message.translations as Record<string, MessageTranslationJSON>;

  // Supprimer les langues cibles du JSON
  filteredTargetLanguages.forEach(lang => {
    delete translations[lang];
  });

  // Sauvegarder
  await this.prisma.message.update({
    where: { id: messageId },
    data: { translations }
  });
}
```

**Commit:** `refactor(translations): migrer deleteMany vers JSON (ligne 456)`

---

### Tâche 4: Refactoriser nettoyage doublons (lignes 2401-2418)

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts:2401-2418`

**Note:** Cette section devient obsolète avec le format JSON (pas de doublons possibles)

**Avant:**
```typescript
const duplicates = await this.prisma.messageTranslation.findMany({
  where: {
    messageId: result.messageId,
    targetLanguage: result.targetLanguage
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true }
});

if (duplicates.length > 1) {
  const idsToDelete = duplicates.slice(1).map(d => d.id);
  await this.prisma.messageTranslation.deleteMany({
    where: {
      id: { in: idsToDelete }
    }
  });
}
```

**Après:**
```typescript
// SUPPRIMÉ: Plus de doublons possibles avec JSON
// La clé de langue garantit l'unicité
```

**Commit:** `refactor(translations): supprimer nettoyage doublons obsolète (2401-2418)`

---

### Tâche 5: Refactoriser findFirst + update/create (lignes 2503-2543)

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts:2503-2543`

**Avant:**
```typescript
const existing = await this.prisma.messageTranslation.findFirst({
  where: {
    messageId: result.messageId,
    targetLanguage: result.targetLanguage
  }
});

if (existing) {
  const updated = await this.prisma.messageTranslation.update({
    where: { id: existing.id },
    data: { ... }
  });
  return updated.id;
} else {
  const created = await this.prisma.messageTranslation.create({
    data: { ... }
  });
  return created.id;
}
```

**Après:**
```typescript
// 1. Lire le message
const message = await this.prisma.message.findUnique({
  where: { id: result.messageId },
  select: { translations: true }
});

// 2. Mettre à jour translations
const translations = (message?.translations as Record<string, MessageTranslationJSON>) || {};
const existingCreatedAt = translations[result.targetLanguage]?.createdAt;

translations[result.targetLanguage] = createTranslationJSON({
  text: contentToStore,
  translationModel: modelInfo,
  confidenceScore: confidenceScore,
  isEncrypted: encryptionData.isEncrypted,
  encryptionKeyId: encryptionData.encryptionKeyId,
  encryptionIv: encryptionData.encryptionIv,
  encryptionAuthTag: encryptionData.encryptionAuthTag,
  preserveCreatedAt: existingCreatedAt
});

// 3. Sauvegarder
await this.prisma.message.update({
  where: { id: result.messageId },
  data: { translations }
});

// Retourner ID synthétique pour compatibilité
return `${result.messageId}-${result.targetLanguage}`;
```

**Commit:** `refactor(translations): migrer findFirst/update/create vers JSON (2503-2543)`

---

### Tâche 6: Refactoriser findFirst récupération (ligne 2567)

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts:2567`

**Avant:**
```typescript
const dbTranslation = await this.prisma.messageTranslation.findFirst({
  where: {
    messageId: messageId,
    targetLanguage: targetLanguage
  },
  include: {
    message: {
      select: { originalLanguage: true }
    }
  }
});

if (dbTranslation) {
  // Utiliser dbTranslation
}
```

**Après:**
```typescript
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: {
    originalLanguage: true,
    translations: true
  }
});

if (message?.translations) {
  const translations = message.translations as Record<string, MessageTranslationJSON>;
  const translation = translations[targetLanguage];

  if (translation) {
    // Construire objet compatible
    const dbTranslation = {
      id: `${messageId}-${targetLanguage}`,
      messageId,
      targetLanguage,
      translatedContent: translation.text,
      translationModel: translation.translationModel,
      confidenceScore: translation.confidenceScore,
      isEncrypted: translation.isEncrypted || false,
      encryptionKeyId: translation.encryptionKeyId,
      encryptionIv: translation.encryptionIv,
      encryptionAuthTag: translation.encryptionAuthTag,
      createdAt: translation.createdAt,
      updatedAt: translation.updatedAt,
      message: {
        originalLanguage: message.originalLanguage
      }
    };

    // Utiliser dbTranslation
  }
}
```

**Commit:** `refactor(translations): migrer findFirst récupération vers JSON (2567)`

---

### Tâche 7: Mettre à jour routes API avec transformation

**Fichier:** `services/gateway/src/routes/conversations/messages.ts:689`

**Avant:**
```typescript
if (includeTranslations && message.translations) {
  mappedMessage.translations = message.translations;
}
```

**Après:**
```typescript
// Import en haut
import { transformTranslationsToArray } from '../../utils/translation-transformer';

// Dans le mapping:
if (includeTranslations && message.translations) {
  // Transformer JSON vers array pour rétrocompatibilité frontend
  mappedMessage.translations = transformTranslationsToArray(
    message.id,
    message.translations as Record<string, any>
  );
}
```

**Vérifier aussi:**
- `services/gateway/src/routes/conversations/messages-advanced.ts`
- `services/gateway/src/routes/messages.ts`
- `services/gateway/src/routes/admin/messages.ts`
- `services/gateway/src/routes/admin/content.ts`

**Commit:** `feat(api): transformer translations JSON vers array pour rétrocompatibilité`

---

### Tâche 8: Vérifier SocketIO emissions

**Fichier:** `services/gateway/src/socketio/MeeshySocketIOManager.ts:1409`

**Action:** Lire la section complète et vérifier qu'elle n'accède pas à `translation.segments` obsolète

**Si problème trouvé:** Appliquer le même pattern de transformation

**Commit:** `fix(socketio): corriger accès translations après migration JSON`

---

### Tâche 9: Mettre à jour les tests unitaires

**Fichiers:**
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.test.ts`
- `services/gateway/src/__tests__/integration/translation-service.integration.test.ts`

**Actions:**
1. Remplacer mocks `prisma.messageTranslation.*` par `prisma.message.*`
2. Utiliser le nouveau format JSON dans les données de test
3. Vérifier que les assertions testent le format JSON

**Commit:** `test(translations): mettre à jour tests après migration JSON`

---

### Tâche 10: Regénérer client Prisma et rebuild

**Commandes:**
```bash
# 1. Regénérer client Prisma
cd /Users/smpceo/Documents/v2_meeshy/packages/shared
npm run prisma:generate

# 2. Rebuild gateway localement
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run build

# 3. Vérifier TypeScript
npm run typecheck

# 4. Lancer tests
npm test

# 5. Si tout passe, rebuild image Docker
docker build -t isopen/meeshy-gateway:latest .

# 6. Push vers registry
docker push isopen/meeshy-gateway:latest

# 7. Redeploy staging
ssh root@meeshy.me "cd /opt/meeshy/staging && \
  docker compose pull gateway-staging && \
  docker compose up -d gateway-staging"
```

**Commit:** `build: regénérer Prisma client après migration translations`

---

## 🧪 Tests de validation

### Test 1: API retourne format array
```bash
# Récupérer messages avec traductions
curl -H "Authorization: Bearer $TOKEN" \
  "https://gate.staging.meeshy.me/api/v1/conversations/:id/messages?include_translations=true"

# Vérifier structure:
# translations: [
#   { id, messageId, targetLanguage, translatedContent, ... }
# ]
```

### Test 2: Nouvelle traduction créée correctement
```bash
# Déclencher traduction via API/SocketIO
# Vérifier dans MongoDB:
db.Message.findOne({ _id: ObjectId("...") }).translations
# Doit être: { "en": { text, translationModel, ... } }
```

### Test 3: Suppression de traduction
```bash
# Déclencher retraduction (supprime anciennes traductions)
# Vérifier que les langues sont bien supprimées du JSON
```

### Test 4: Frontend non impacté
1. Ouvrir frontend staging
2. Afficher une conversation avec traductions
3. Vérifier que les traductions s'affichent correctement
4. Déclencher nouvelle traduction
5. Vérifier que la nouvelle traduction apparaît

---

## 🚨 Rollback (si problème)

### Étape 1: Restaurer ancienne image gateway
```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && \
  docker compose pull gateway-staging:previous && \
  docker compose up -d gateway-staging"
```

### Étape 2: Restaurer données MongoDB (backup)
```bash
# Backup créé avant migration: /opt/meeshy/backups/backup-pre-staging-TIMESTAMP
mongorestore --db=meeshy /path/to/backup
```

### Étape 3: Revert commits
```bash
git revert HEAD~N  # N = nombre de commits de la refactorisation
```

---

## 📊 Métriques de succès

- ✅ Aucune erreur `prisma.messageTranslation is not defined`
- ✅ API retourne `MessageTranslation[]` au frontend (rétrocompatibilité)
- ✅ MongoDB stocke `translations: Record<string, {...}>` (format JSON)
- ✅ Nouvelles traductions créées correctement
- ✅ Suppressions de traductions fonctionnent
- ✅ Frontend affiche traductions sans modification
- ✅ Tests passent
- ✅ Aucune régression fonctionnelle

---

## ⏱️ Estimation

**Total:** ~2-3 heures

- Tâche 1: 20 min (helper transformation)
- Tâches 2-6: 60 min (refactorisation service)
- Tâche 7: 30 min (routes API)
- Tâche 8: 15 min (SocketIO)
- Tâche 9: 30 min (tests)
- Tâche 10: 30 min (build/deploy)

---

## 🎯 Ordre d'exécution recommandé

1. **Tâche 1** → Créer infrastructure (helper)
2. **Tâche 2** → Opération principale (upsert)
3. **Tâches 3-6** → Autres opérations du service
4. **Tâche 7** → Routes API (transformation)
5. **Tâche 8** → SocketIO (si nécessaire)
6. **Tâche 9** → Tests
7. **Tâche 10** → Build/Deploy

**Test après chaque tâche:** Commit + vérification TypeScript + tests unitaires
