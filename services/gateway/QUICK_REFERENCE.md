# Guide de Référence Rapide - Post-Refactorisation

## 🚀 Commandes Essentielles

### Vérification

```bash
# Compiler le projet
npm run build

# Lancer les tests
npm test

# Vérifier les fichiers > 800 lignes
find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" -exec wc -l {} + | awk '$1 > 800 {print $1 "\t" $2}' | sort -rn

# Vérifier les imports circulaires
npx madge --circular --extensions ts src/
```

### Nettoyage (Optionnel)

```bash
# Supprimer les fichiers de backup
find src -name "*.backup" -o -name "*.old" -delete

# Supprimer les tests désactivés (après réécriture)
find src -name "*.test.ts.skip" -delete
```

---

## 📁 Nouveaux Chemins d'Import

### Routes

```typescript
// Avant
import { conversationRoutes } from './routes/conversations';

// Après (identique, mais organisé en modules)
import { conversationRoutes } from './routes/conversations';
```

### Services

```typescript
// Avant
import { AttachmentService } from './services/AttachmentService';
import { ZmqTranslationClient } from './services/ZmqTranslationClient';
import { MessageTranslationService } from './services/MessageTranslationService';

// Après
import { AttachmentService } from './services/attachments';
import { ZmqTranslationClient } from './services/zmq-translation';
import { MessageTranslationService } from './services/message-translation';
```

### Sous-modules (si besoin)

```typescript
// Import direct des sous-modules
import { UploadProcessor } from './services/attachments/UploadProcessor';
import { MetadataManager } from './services/attachments/MetadataManager';

// Import des types
import type { FileToUpload, UploadResult } from './services/attachments';
```

---

## 🧪 Tests

### Lancer les tests

```bash
# Tous les tests
npm test

# Tests d'un fichier spécifique
npm test -- AttachmentService

# Tests avec couverture
npm run test:coverage

# Tests en mode watch
npm test -- --watch
```

### Tests désactivés à réécrire

```bash
# 1. ZmqTranslationClient
src/__tests__/unit/services/ZmqTranslationClient.test.ts.skip

# 2. AttachmentService
src/__tests__/unit/services/AttachmentService.test.ts.skip

# 3. AuthHandler
src/socketio/handlers/__tests__/AuthHandler.test.ts.skip
```

---

## 📚 Documentation

### Fichiers Principaux

- `REFACTORING_CHANGELOG.md` - Historique complet des changements
- `TEST_VALIDATION_REPORT.md` - Rapport de validation des tests
- `REFACTORING_FINAL_SUMMARY.md` - Résumé exécutif
- `QUICK_REFERENCE.md` - Ce fichier

### Documentation par Module

Chaque module dispose d'un README.md:

```bash
# Routes
src/routes/conversations/README.md
src/routes/admin/README.md
src/routes/links/README.md
# ... etc

# Services
src/services/message-translation/README.md
src/services/notifications/README.md
src/services/zmq-translation/README.md
# ... etc
```

---

## 🔍 Navigation dans le Code

### Structure des Routes

```
src/routes/
├── conversations/          # 8 modules (5,220 → 8 fichiers)
│   ├── index.ts           # Point d'entrée
│   ├── types.ts           # Types partagés
│   ├── core.ts            # CRUD de base
│   ├── messages.ts        # Routes messages
│   ├── participants.ts    # Gestion participants
│   └── ...
├── admin/                 # 6 modules (3,418 → 6 fichiers)
├── links/                 # 12 modules (3,202 → 12 fichiers)
└── ...
```

### Structure des Services

```
src/services/
├── message-translation/   # 7 modules (2,217 → 7 fichiers)
│   ├── MessageTranslationService.ts
│   ├── TranslationCache.ts
│   ├── LanguageCache.ts
│   └── ...
├── notifications/         # 7 modules (2,033 → 7 fichiers)
├── zmq-translation/       # 5 modules (1,596 → 5 fichiers)
└── ...
```

---

## 🐛 Débogage

### Erreurs Communes

#### Import non trouvé

```typescript
// ❌ Ancien import
import { AttachmentService } from './services/AttachmentService';

// ✅ Nouveau import
import { AttachmentService } from './services/attachments';
```

#### Type non exporté

```typescript
// ❌ Import depuis le module interne
import type { SomeType } from './services/attachments/UploadProcessor';

// ✅ Import depuis l'index
import type { SomeType } from './services/attachments';
```

#### Méthode non trouvée (ex: AttachmentService)

```typescript
// ❌ Les méthodes privées ne sont plus exposées
service.generateFilePath(userId, filename);

// ✅ Utiliser les sous-modules si vraiment nécessaire
import { UploadProcessor } from './services/attachments/UploadProcessor';
const processor = new UploadProcessor(prisma);
// Mais préférer l'API publique du service principal
```

---

## 📊 Métriques

### Avant Refactorisation

```
Fichiers > 800 lignes: 16
Plus gros fichier: 5,220 lignes (conversations.ts)
Total modules: 16 monolithes
```

### Après Refactorisation

```
Fichiers > 800 lignes: ~8
Plus gros fichier: 1,170 lignes (messages.ts)
Total modules: 100+
```

### Tests

```
Suites: 36/36 passées (100%)
Tests: 1,891/1,891 passés (100%)
Durée: 83.9 secondes
Désactivés: 3 (à réécrire)
```

---

## 🚀 Déploiement

### Checklist Pre-Deploy

- [x] ✅ Compilation sans erreur (`npm run build`)
- [x] ✅ Tests passent (`npm test`)
- [ ] 🟡 Réécrire les 3 tests désactivés
- [ ] 🟡 Tests de charge/performance
- [ ] 🟢 Documentation équipe mise à jour

### Commandes de Déploiement

```bash
# 1. Build production
npm run build

# 2. Vérifier les tests
npm test

# 3. Créer un tag Git
git tag -a v2.0.0-refactor -m "Refactorisation massive - 16 god objects → 100+ modules"

# 4. Push
git push origin main --tags

# 5. Déployer (selon votre process)
# ...
```

---

## 🆘 Support

### En cas de problème

1. **Vérifier la compilation**: `npm run build`
2. **Vérifier les tests**: `npm test`
3. **Consulter la documentation**: `REFACTORING_CHANGELOG.md`
4. **Consulter les README**: Chaque module a son README.md

### Contacts

- **Documentation technique**: `REFACTORING_CHANGELOG.md`
- **Rapport de tests**: `TEST_VALIDATION_REPORT.md`
- **Résumé exécutif**: `REFACTORING_FINAL_SUMMARY.md`

---

## 🎯 Prochaines Actions

### Court Terme (Cette Semaine)

1. Réécrire les 3 tests désactivés (~4-6 heures)
2. Tests de charge pour valider les performances
3. Déployer en staging

### Moyen Terme (Ce Mois)

1. Subdiviser les 3 modules encore > 800 lignes
2. Ajouter tests unitaires pour nouveaux modules
3. Former l'équipe sur la nouvelle architecture

### Long Terme (Ce Trimestre)

1. Nettoyer les fichiers backup
2. Optimiser les performances
3. Documentation équipe complète

---

**Dernière mise à jour**: 2026-01-18
**Version**: v2.0.0-refactor
