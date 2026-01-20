# Erreurs de compilation restantes après refactoring JSON

## 📊 État actuel

✅ Package `@meeshy/shared` : **COMPILE AVEC SUCCÈS**
⚠️ Package `@meeshy/gateway` : **41 erreurs TypeScript restantes**

---

## 🔍 Services concernés

### 1. AttachmentTranslateService.ts

**Problème** : Utilise encore `messageAudioTranscription` et `messageTranslatedAudio`

**Lignes affectées** :
- Ligne 292 : `prisma.messageAudioTranscription.findUnique`
- Ligne 309 : `prisma.messageTranslatedAudio.findMany`
- Ligne 610 : `prisma.messageAudioTranscription.findMany`
- Ligne 615 : `prisma.messageAudioTranscription.create`
- Ligne 636 : `prisma.messageTranslatedAudio.findMany`
- Ligne 641 : `prisma.messageTranslatedAudio.create`

**Solution** : Remplacer par accès JSON dans `MessageAttachment.transcription` et `MessageAttachment.translations`

---

### 2. AudioTranslateService.ts

**Problème** : Utilise encore `messageAudioTranscription` et `messageTranslatedAudio`

**Lignes affectées** :
- Ligne 306 : `prisma.messageAudioTranscription.create`
- Ligne 446 : `prisma.messageTranslatedAudio.findUnique`
- Ligne 455 : `prisma.messageAudioTranscription.findFirst`
- Ligne 802 : `prisma.messageAudioTranscription.upsert`
- Ligne 849 : `prisma.messageAudioTranscription.create`
- Ligne 871 : `prisma.messageTranslatedAudio.upsert`
- Ligne 920 : `prisma.messageAudioTranscription.findMany`
- Ligne 924 : `prisma.messageTranslatedAudio.findMany`

**Solution** : Adapter pour utiliser JSON updates sur `MessageAttachment`

---

### 3. MessageTranslationService.ts

**Problèmes** :
1. Ligne 798 : Essaie d'ajouter champ `id` dans traduction (non existant dans nouveau type)
2. Ligne 964 : `prisma.messageAudioTranscription.findMany`
3. Lignes 1124-1127 : Accès à propriétés `model`, `segments`, `speakerCount`, `primarySpeakerId` qui n'existent pas dans le type minimal
4. Ligne 1170 : Accès à propriété `ttsModel` qui n'existe pas dans type minimal
5. Ligne 1621 : Include transcription comme relation
6. Lignes 1647-1648 : Accès à propriétés sur type Json

**Solution** :
- Adapter les types de données reçues du backend pour correspondre aux interfaces complètes
- Utiliser les types `AttachmentTranscription` et `AttachmentTranslation` corrects
- Supprimer includes, utiliser select sur champs JSON

---

## ✅ Services déjà corrigés

- ✅ AttachmentService.ts : Adapté pour JSON
- ✅ UploadProcessor.ts : Supprimé `serverCopyUrl` deprecated
- ✅ routes/messages.ts : Adapté select transcription

---

## 🎯 Plan d'action recommandé

### Option A : Refactoring complet (recommandé pour V2)

Puisque le user a dit "Ne faisons pas de rétrocompatibilité... soit prêt à tous refaire" :

1. **AttachmentTranslateService** et **AudioTranslateService** semblent être des services legacy
2. **MessageTranslationService** a déjà été refactorisé pour utiliser JSON
3. **Recommandation** : Migrer toutes les routes qui utilisent les anciens services vers MessageTranslationService

### Option B : Correction minimale (plus rapide)

Adapter uniquement les accès aux models pour utiliser JSON :

```typescript
// Ancien
await prisma.messageAudioTranscription.create({ ... })

// Nouveau
await prisma.messageAttachment.update({
  where: { id: attachmentId },
  data: {
    transcription: { ... } as any
  }
})
```

---

## 📝 Détails des erreurs par catégorie

### Catégorie 1 : Accès à models supprimés (28 erreurs)

- `prisma.messageAudioTranscription` n'existe plus
- `prisma.messageTranslatedAudio` n'existe plus

**Solution** : Utiliser `prisma.messageAttachment` avec champs JSON

### Catégorie 2 : Types incompatibles (8 erreurs)

- Accès à propriétés sur type `Json` (string | number | true | JsonObject | JsonArray)
- Types backend vs types JSON intégrés

**Solution** : Caster avec `as AttachmentTranscription` ou `as AttachmentTranslations`

### Catégorie 3 : Includes/Relations supprimés (5 erreurs)

- `include: { transcription: true }` n'est plus valide
- `translatedAudios` n'existe plus comme relation

**Solution** : Utiliser `select: { transcription: true, translations: true }`

---

## 🚀 Prochaine étape

**Question pour le user** : Voulez-vous que je :

1. ✅ **Refactorise complètement** les services AttachmentTranslateService et AudioTranslateService pour utiliser MessageTranslationService ? (Aligné avec philosophie V2)

2. ⚡ **Corrige rapidement** les 41 erreurs en adaptant les accès aux données ? (Plus rapide mais code moins clean)

3. 🗑️ **Supprime** les anciens services et migre toutes les routes vers MessageTranslationService ? (Le plus clean pour V2)

---

**Temps estimé** :
- Option 1 : ~2-3h de refactoring
- Option 2 : ~30min de corrections
- Option 3 : ~1-2h de migration + tests
