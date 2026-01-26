# Migration MessageTranslation → Message.translations (JSON)

## ✅ Migrations effectuées en staging

1. **Schéma Prisma** : `MessageTranslation` supprimé, `Message.translations Json` ajouté
2. **Données MongoDB** : 979 messages migrés vers format JSON
3. **Collection** : `MessageTranslation` supprimée
4. **Index obsolète** : `MessageTranslation_cacheKey_key` supprimé

## 🔧 Modifications du code backend requises

### MessageTranslationService.ts

Le service utilise encore `prisma.messageTranslation.*()` qui n'existe plus.

**Méthode actuelle (à remplacer) :**
```typescript
const translation = await this.prisma.messageTranslation.upsert({
  where: { ... },
  update: { translatedContent, ... },
  create: { messageId, targetLanguage, translatedContent, ... }
});
```

**Nouvelle méthode (utiliser JSON) :**
```typescript
// 1. Lire le message
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: { id: true, translations: true }
});

// 2. Mettre à jour le champ translations (JSON)
const translations = message.translations || {};
translations[targetLanguage] = {
  text: translatedContent,
  translationModel: modelType,
  confidenceScore: confidenceScore,
  isEncrypted: isEncrypted || false,
  encryptionKeyId: encryptionKeyId || null,
  encryptionIv: encryptionIv || null,
  encryptionAuthTag: encryptionAuthTag || null,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 3. Sauvegarder
await this.prisma.message.update({
  where: { id: messageId },
  data: { translations: translations }
});
```

### Fichiers à modifier

1. **services/gateway/src/services/message-translation/MessageTranslationService.ts**
   - Ligne 456: `deleteMany` → Modifier pour supprimer du JSON
   - Ligne 2401-2413: `findMany` + `deleteMany` → Opérations sur JSON
   - Ligne 2422: `upsert` → **PRINCIPALE** opération à remplacer
   - Ligne 2503-2528: `findFirst` + `update`/`create` → Opérations sur JSON
   - Ligne 2567: `findFirst` → Lire depuis JSON

2. **services/gateway/src/socketio/MeeshySocketIOManager.ts**
   - Vérifier que les émissions SocketIO utilisent la nouvelle structure

### Structure du champ translations (JSON)

```typescript
{
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
  "es": { ... },
  "fr": { ... }
}
```

## 📝 Exemple complet de refactoring

### Avant (collection séparée)
```typescript
async saveTranslation(messageId: string, targetLanguage: string, translatedText: string) {
  return await this.prisma.messageTranslation.upsert({
    where: {
      messageId_targetLanguage: { messageId, targetLanguage }
    },
    update: {
      translatedContent: translatedText,
      updatedAt: new Date()
    },
    create: {
      messageId,
      targetLanguage,
      translatedContent: translatedText,
      translationModel: 'medium',
      createdAt: new Date()
    }
  });
}
```

### Après (champ JSON)
```typescript
async saveTranslation(messageId: string, targetLanguage: string, translatedText: string) {
  const message = await this.prisma.message.findUnique({
    where: { id: messageId },
    select: { translations: true }
  });

  const translations = (message?.translations as any) || {};
  const now = new Date();

  translations[targetLanguage] = {
    text: translatedText,
    translationModel: 'medium',
    confidenceScore: null,
    isEncrypted: false,
    encryptionKeyId: null,
    encryptionIv: null,
    encryptionAuthTag: null,
    createdAt: translations[targetLanguage]?.createdAt || now,
    updatedAt: now
  };

  return await this.prisma.message.update({
    where: { id: messageId },
    data: { translations }
  });
}
```

## 🚀 Prochaines étapes

1. Regénérer le client Prisma : `npm run prisma:generate`
2. Modifier MessageTranslationService.ts pour utiliser JSON
3. Tester en staging
4. Rebuild et redeploy gateway
5. Migrer production avec le même script

## ⚠️  Notes importantes

- Plus besoin de contraintes uniques (géré par structure JSON)
- Performance améliorée (pas de JOIN nécessaire)
- Cohérence avec MessageAttachment.translations
- Limite MongoDB : 16MB par document (suffisant pour traductions)
