# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### 🎉 Refonte Majeure - Système de Notifications

#### Changed

- **Structure groupée** : Réorganisation complète de l'architecture des notifications en groupes logiques (CORE, ACTOR, CONTEXT, METADATA, STATE, DELIVERY)
- **Suppression du champ `title`** : Le title est maintenant construit dynamiquement côté frontend via i18n pour un meilleur support multilingue
- **`data` → `metadata`** : Remplacement du champ Json non typé par un système de discriminated unions TypeScript fortement typé
- **Champs dénormalisés déplacés** : `senderId`, `senderUsername`, etc. regroupés dans `actor`
- **État groupé** : `isRead`, `readAt`, `createdAt` déplacés dans le groupe `state`
- **Context enrichi** : Informations de contexte (conversation, message, appel) regroupées dans `context`

#### Added

- **Nouveau groupe `actor`** : Informations sur l'utilisateur qui a déclenché la notification (id, username, displayName, avatar)
- **Nouveau groupe `context`** : Informations contextuelles (conversationId, conversationTitle, conversationType, messageId, callSessionId, etc.)
- **Nouveau groupe `metadata`** : Données type-spécifiques avec typage fort via discriminated unions
- **Nouveau groupe `state`** : État de lecture et timestamps (isRead, readAt, createdAt, expiresAt)
- **Nouveau groupe `delivery`** : Suivi multi-canal (emailSent, pushSent)
- **Champ `priority`** : Niveaux de priorité (low, normal, high, urgent)
- **Helper `buildNotificationTitle()`** : Construction dynamique des titles avec support i18n
- **Type guards** : Fonctions pour typer correctement le metadata selon le type de notification
- **NotificationService refactorisé** : API simplifiée avec méthodes spécifiques par type (`createMessageNotification`, `createMentionNotification`, etc.)
- **NotificationFormatter** : Formatage cohérent DB → API
- **Socket.IO mis à jour** : Émission d'événements `notification:new` avec structure groupée
- **Documentation complète** :
  - `docs/notifications/STRUCTURE.md` : Architecture détaillée avec exemples
  - `docs/notifications/MIGRATION_GUIDE.md` : Guide de migration complet

#### Removed

- **Champ `title`** : ❌ Plus stocké en DB, construit dynamiquement
- **Champs dénormalisés à la racine** : ❌ `senderId`, `senderUsername`, `senderAvatar`, `senderDisplayName`
- **Références directes** : ❌ `conversationId`, `messageId`, `callSessionId` à la racine
- **Champ `data` non typé** : ❌ Remplacé par `metadata` structuré
- **Champs d'état à la racine** : ❌ `isRead`, `readAt` déplacés dans `state`

#### Breaking Changes

⚠️ **Migration complète requise** - La nouvelle structure n'est pas compatible avec l'ancienne.

**Champs renommés/déplacés:**
- `notification.sender` → `notification.actor`
- `notification.conversationId` → `notification.context.conversationId`
- `notification.messageId` → `notification.context.messageId`
- `notification.isRead` → `notification.state.isRead`
- `notification.createdAt` → `notification.state.createdAt`
- `notification.data` → `notification.metadata` (typé)
- Plus de `notification.title` → utiliser `buildNotificationTitle(notification, t)`

**Fichiers modifiés:**

*Backend:*
- `packages/shared/types/notification.ts` - Types partagés refactorisés (673 lignes)
- `packages/shared/types/api-schemas.ts` - Schemas OpenAPI mis à jour
- `packages/shared/prisma/schema.prisma` - Schema DB nettoyé
- `services/gateway/src/services/notifications/NotificationService.ts` - Service refactorisé (660 lignes)
- `services/gateway/src/services/notifications/NotificationFormatter.ts` - Nouveau formatteur (85 lignes)
- `services/gateway/src/routes/notifications.ts` - Routes API modernisées (350 lignes)
- `scripts/migrations/drop-notifications.ts` - Script de migration

*Frontend:*
- `apps/web/types/notification.ts` - Types frontend mis à jour (359 lignes)
- `apps/web/services/notification.service.ts` - Service simplifié (280 lignes, -47%)
- `apps/web/utils/notification-helpers.ts` - Helpers avec i18n
- `apps/web/components/notifications/notifications-v2/NotificationItem.tsx` - Composant mis à jour
- `apps/web/components/notifications/NotificationCenter.tsx` - Centre mis à jour
- `apps/web/app/notifications/page.tsx` - Page notifications mise à jour
- `apps/web/services/notification-socketio.singleton.ts` - Socket.IO client mis à jour

**Migration:**

Pour développement (recommandé):
```bash
cd scripts/migrations
node drop-notifications.ts --confirm
```

Pour production avec conservation des données:
Voir `docs/notifications/MIGRATION_GUIDE.md` pour le script de migration personnalisé.

#### Technical Improvements

- **Réduction de code**: Service frontend notification réduit de 531 → 280 lignes (-47%)
- **Type safety**: Discriminated unions pour metadata par type de notification
- **Performance**: Indexes MongoDB optimisés pour la nouvelle structure
- **Maintenabilité**: Code mieux organisé et documenté
- **i18n**: Support natif multilingue pour les titles
- **Évolutivité**: Architecture préparée pour fonctionnalités futures (groupement, actions rapides, préférences avancées)

#### Documentation

- 📚 [Structure des Notifications](docs/notifications/STRUCTURE.md)
- 📚 [Guide de Migration](docs/notifications/MIGRATION_GUIDE.md)

---

## [0.1.0] - 2025-01-XX

### Added
- Initial release
