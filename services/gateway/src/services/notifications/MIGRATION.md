# Guide de Migration - NotificationService

## Vue d'ensemble

Ce guide explique comment migrer du monolithe `NotificationService.ts` (2,033 lignes) vers l'architecture modulaire.

## Changements d'Architecture

### Avant (Monolithe)
```
src/services/NotificationService.ts (2,033 lignes)
└── Tout dans un seul fichier
```

### Après (Modulaire)
```
src/services/notifications/
├── NotificationService.ts              (649 lignes) - Orchestrateur
├── FirebaseNotificationService.ts      (223 lignes) - Push
├── SocketNotificationService.ts        (83 lignes)  - WebSocket
├── NotificationFormatter.ts            (188 lignes) - Formatage
├── NotificationServiceExtensions.ts    (378 lignes) - Extensions
├── types.ts                            (86 lignes)  - Types
└── index.ts                            (18 lignes)  - Exports
```

## Étapes de Migration

### 1. Mettre à jour les Imports

#### Dans les fichiers utilisant NotificationService

**Avant:**
```typescript
import { NotificationService } from '../services/NotificationService';
import type { CreateNotificationData, NotificationEventData } from '../services/NotificationService';
```

**Après:**
```typescript
import { NotificationService } from '../services/notifications';
import type { CreateNotificationData, NotificationEventData } from '../services/notifications';
```

**Recherche/Remplacement:**
```bash
# Trouver tous les imports
grep -r "from.*NotificationService" src/

# Remplacer automatiquement (macOS/Linux)
find src/ -type f -name "*.ts" -exec sed -i '' \
  's|from '\''.*NotificationService'\''|from '\''./services/notifications'\''|g' {} +

# Windows (Git Bash)
find src/ -type f -name "*.ts" -exec sed -i \
  's|from ".*NotificationService"|from "./services/notifications"|g' {} +
```

### 2. Fichiers à Modifier

Fichiers typiquement impactés:
```
src/
├── routes/
│   ├── messages.ts           ✓ Import NotificationService
│   ├── conversations.ts      ✓ Import NotificationService
│   └── notifications.ts      ✓ Import NotificationService
├── services/
│   └── MessageService.ts     ✓ Import NotificationService
├── websocket/
│   └── handlers.ts           ✓ Import NotificationService
└── index.ts                  ✓ Initialisation
```

### 3. Vérifier la Compatibilité

**API Publique Inchangée:**
```typescript
// Ces méthodes fonctionnent exactement pareil
notificationService.createNotification(data)
notificationService.createMessageNotification(data)
notificationService.createMissedCallNotification(data)
notificationService.createMentionNotificationsBatch(userIds, data, memberIds)
notificationService.markAsRead(notificationId, userId)
notificationService.markAllAsRead(userId)
notificationService.getUnreadCount(userId)
```

**Nouvelles Méthodes Disponibles:**
```typescript
// Nouvelles capacités
notificationService.getMetrics()
notificationService.getNotificationStats(userId)
```

### 4. Utiliser les Extensions (Optionnel)

Si vous utilisez les méthodes spécialisées:

**Avant (dans NotificationService monolithe):**
```typescript
await notificationService.createReplyNotification(data);
await notificationService.createReactionNotification(data);
await notificationService.createContactRequestNotification(data);
// etc.
```

**Option 1: Garder le même code (compatible)**
```typescript
// Continue de fonctionner via NotificationService
await notificationService.createReplyNotification(data);
```

**Option 2: Utiliser les Extensions (recommandé)**
```typescript
import { NotificationServiceExtensions } from '../services/notifications/NotificationServiceExtensions';

const extensions = new NotificationServiceExtensions(notificationService, prisma);
await extensions.createReplyNotification(data);
await extensions.createReactionNotification(data);
```

### 5. Tester les Changements

#### Tests Unitaires
```typescript
import { NotificationService } from '../services/notifications';
import type { CreateNotificationData } from '../services/notifications';

describe('NotificationService', () => {
  it('should create notification', async () => {
    const service = new NotificationService(prismaMock);
    const result = await service.createNotification({
      userId: 'user-1',
      type: 'new_message',
      title: 'Test',
      content: 'Content'
    });
    expect(result).toBeDefined();
  });
});
```

#### Tests d'Intégration
```bash
# Vérifier que tous les imports sont corrects
npm run type-check

# Lancer les tests
npm test

# Vérifier que l'application démarre
npm run dev
```

### 6. Supprimer l'Ancien Fichier

**IMPORTANT: Faire cette étape EN DERNIER après validation complète**

```bash
# Sauvegarder l'ancien fichier (au cas où)
cp src/services/NotificationService.ts src/services/NotificationService.ts.backup

# Supprimer l'ancien fichier
rm src/services/NotificationService.ts

# Vérifier que tout compile
npm run build
```

## Checklist de Migration

### Phase 1: Préparation
- [ ] Lire ce guide de migration
- [ ] Comprendre la nouvelle architecture (voir README.md)
- [ ] Identifier tous les fichiers important NotificationService
- [ ] Créer une branche Git pour la migration

### Phase 2: Migration du Code
- [ ] Mettre à jour tous les imports (recherche/remplacement)
- [ ] Vérifier les types TypeScript
- [ ] Adapter les tests existants
- [ ] Ajouter les nouveaux tests pour modules isolés

### Phase 3: Validation
- [ ] Compilation TypeScript sans erreur (`npm run type-check`)
- [ ] Tests unitaires passent (`npm test`)
- [ ] Tests d'intégration passent
- [ ] Application démarre sans erreur (`npm run dev`)
- [ ] Tester manuellement les notifications (Socket.IO + Firebase)

### Phase 4: Déploiement
- [ ] Code review
- [ ] Merge dans dev
- [ ] Tests en environnement de staging
- [ ] Déploiement en production
- [ ] Monitoring des métriques (Firebase, WebSocket)

### Phase 5: Nettoyage
- [ ] Supprimer l'ancien fichier NotificationService.ts
- [ ] Mettre à jour la documentation
- [ ] Communiquer les changements à l'équipe

## Problèmes Courants et Solutions

### Problème: Import non trouvé

**Erreur:**
```
Cannot find module '../services/NotificationService'
```

**Solution:**
```typescript
// Remplacer
import { NotificationService } from '../services/NotificationService';

// Par
import { NotificationService } from '../services/notifications';
```

### Problème: Type non trouvé

**Erreur:**
```
Cannot find name 'CreateNotificationData'
```

**Solution:**
```typescript
// Ajouter l'import du type
import type { CreateNotificationData } from '../services/notifications';
```

### Problème: Méthode privée utilisée

**Erreur:**
```
Property 'fetchSenderInfo' is private and only accessible within class
```

**Solution:**
Si vous utilisiez des méthodes privées, deux options:

1. **Utiliser l'API publique** (recommandé)
2. **Exposer via Extensions** si vraiment nécessaire

### Problème: Firebase ne fonctionne plus

**Symptôme:** Logs indiquent "Firebase not available"

**Solution:**
```bash
# Vérifier que la variable d'environnement existe
echo $FIREBASE_ADMIN_CREDENTIALS_PATH

# Vérifier que le fichier existe
ls -la $FIREBASE_ADMIN_CREDENTIALS_PATH

# Vérifier les logs au démarrage
# Doit afficher: "Firebase Admin SDK initialized successfully"
```

## Rollback en Cas de Problème

Si vous rencontrez des problèmes critiques:

```bash
# Restaurer l'ancien fichier
cp src/services/NotificationService.ts.backup src/services/NotificationService.ts

# Supprimer le nouveau dossier
rm -rf src/services/notifications/

# Restaurer les imports
git checkout -- src/

# Redémarrer l'application
npm run dev
```

## Support

En cas de questions ou problèmes:

1. **Vérifier la documentation**: README.md dans le dossier notifications
2. **Lire les types TypeScript**: types.ts pour l'API complète
3. **Examiner les exemples**: Voir les tests unitaires
4. **Logs détaillés**: Activer DEBUG=* pour voir tous les logs

## Avantages de la Nouvelle Architecture

✅ **Maintenabilité**: Modules < 800 lignes, faciles à comprendre
✅ **Testabilité**: Chaque module testable indépendamment
✅ **Scalabilité**: Ajout facile de nouveaux canaux (Email, SMS)
✅ **Performance**: Optimisations ciblées par module
✅ **Sécurité**: Sanitisation centralisée et validée
✅ **Type Safety**: Types stricts exportés

## Prochaines Étapes

Après migration réussie:

1. **Ajouter des tests** pour les nouveaux modules
2. **Monitorer les métriques** Firebase et WebSocket
3. **Optimiser** selon les besoins réels
4. **Documenter** les cas d'usage spécifiques de votre application
5. **Former l'équipe** sur la nouvelle architecture
