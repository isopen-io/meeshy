# Index - Documentation Système de Notifications

Bienvenue dans la documentation complète du système de notifications en temps réel de Meeshy. Ce document sert de point d'entrée pour naviguer dans l'ensemble de la documentation.

---

## Vue d'Ensemble

Le système de notifications en temps réel de Meeshy permet aux utilisateurs de recevoir des alertes contextuelles pour 11 types d'événements différents, avec un formatage intelligent, des préférences granulaires, et une expérience utilisateur riche.

**Version actuelle**: 2.0
**Statut**: ✅ Design approuvé, en cours d'implémentation
**Dernière mise à jour**: 2025-01-21

---

## Documents Disponibles

### 📋 [NOTIFICATION_SYSTEM_SUMMARY.md](./NOTIFICATION_SYSTEM_SUMMARY.md)
**Pour qui**: Product Owners, Managers, Décideurs techniques
**Durée de lecture**: 15 minutes

Résumé exécutif avec:
- Vue d'ensemble des 11 types de notifications
- Décisions d'architecture clés (ADRs)
- Métriques de performance et coûts
- Planning et ressources nécessaires
- OKRs et métriques de succès
- FAQ

**Commencer ici si**: Vous voulez une vue d'ensemble rapide du projet.

---

### 🏗️ [NOTIFICATION_SYSTEM_ARCHITECTURE.md](./NOTIFICATION_SYSTEM_ARCHITECTURE.md)
**Pour qui**: Architectes, Backend/Frontend Developers
**Durée de lecture**: 45-60 minutes

Architecture technique complète avec:
- Diagrammes de composants et de séquence (Mermaid)
- Modèle de données Prisma détaillé
- Services backend (NotificationService, ReactionService, etc.)
- API REST et WebSocket (endpoints, événements)
- Frontend Store Zustand et hooks React
- Composants UI (NotificationBell, NotificationList, NotificationItem)
- Sécurité et performance (rate limiting, caching, sanitization)
- Stratégie de test (unitaires, intégration, E2E)
- Feuille de route d'implémentation en 7 phases

**Commencer ici si**: Vous allez implémenter le système ou voulez comprendre l'architecture en profondeur.

---

### 📚 [NOTIFICATION_TYPES_REFERENCE.md](./NOTIFICATION_TYPES_REFERENCE.md)
**Pour qui**: Developers, Designers, QA Engineers
**Durée de lecture**: 20 minutes

Référence complète de chaque type de notification avec:
- Déclencheurs et cas d'usage
- Formatage exact (titre, contenu, contexte)
- Métadonnées et structure des payloads
- Actions utilisateur et navigation
- Priorités et conditions d'envoi
- Exemples visuels (mockups textuels)
- Matrice de compatibilité des préférences
- Codes couleur et icônes

**Commencer ici si**: Vous développez une fonctionnalité qui déclenche des notifications ou concevez l'UI.

---

### 🔄 [NOTIFICATION_MIGRATION_GUIDE.md](./NOTIFICATION_MIGRATION_GUIDE.md)
**Pour qui**: Backend Developers, DevOps, QA
**Durée de lecture**: 30 minutes

Guide étape par étape pour la migration avec:
- État actuel vs état cible
- Plan de migration en 7 phases détaillées
- Scripts de migration de données
- Gestion de compatibilité backwards
- Feature flags et déploiement progressif
- Checklist de migration complète
- Gestion des erreurs courantes
- Métriques de succès et monitoring
- Plan de rollback

**Commencer ici si**: Vous allez exécuter la migration de v1 à v2.

---

## Roadmap Visuelle

```
Phase 1: Préparation          Phase 2: Migration Prisma     Phase 3: Backend
[1-2 jours]                   [1-2 jours]                   [3-4 jours]
├─ Backup DB                  ├─ Schéma Prisma             ├─ NotificationService
├─ Créer branche              ├─ Migration DB               ├─ ReactionService
├─ Enums TypeScript           ├─ Script migration data      ├─ ConversationService
└─ Tests existants            └─ Vérification              ├─ FriendRequestService
                                                            └─ Routes REST + WS

        ↓                              ↓                            ↓

Phase 4: Frontend Store       Phase 5: Composants UI        Phase 6: Tests & QA
[2-3 jours]                   [2-3 jours]                   [3-4 jours]
├─ Zustand Store              ├─ NotificationBell          ├─ Tests unitaires
├─ useNotifications hook      ├─ NotificationList          ├─ Tests intégration
├─ Socket.IO integration      ├─ NotificationItem          ├─ Tests E2E
└─ Pagination infinie         ├─ Toasts + Sons             ├─ Tests de charge
                              └─ Feature flags             └─ Tests sécurité

        ↓                              ↓                            ↓

                        Phase 7: Déploiement & Monitoring
                               [1-2 semaines]
                        ├─ Canary release (10% → 50% → 100%)
                        ├─ Monitoring Datadog/Sentry
                        ├─ Collecte feedback
                        └─ Itérations & optimisations
```

**Durée totale**: 15-20 jours ouvrés (3-4 semaines calendaires)

---

## Quick Links

### Diagrammes
- [Diagramme de Composants](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#diagramme-de-composants-c4---niveau-2) - Architecture système complète
- [Flux de Données](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#flux-de-données-pour-les-notifications) - Scénarios critiques
- [Diagramme de Séquence - Mention](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#diagramme-de-séquence---notification-de-mention) - Cas d'usage complexe

### Code et Implémentation
- [Schéma Prisma](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#schéma-prisma-existant-améliorations-recommandées) - Modèle de données
- [NotificationService](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#notificationservice-extension-du-service-existant) - Service principal
- [Zustand Store](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#zustand-store) - State management frontend
- [Composants React](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#composants-ui) - UI components

### Guides Pratiques
- [Comment ajouter un nouveau type de notification](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#services-backend)
- [Comment tester les notifications](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#stratégie-de-test)
- [Comment déployer en production](./NOTIFICATION_MIGRATION_GUIDE.md#phase-7-déploiement-progressif-canary-release)
- [Comment rollback en cas de problème](./NOTIFICATION_MIGRATION_GUIDE.md#plan-de-rollback)

### Référence API
- [Endpoints REST](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#endpoints-rest) - GET, POST, PATCH, DELETE /api/notifications
- [Événements Socket.IO](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#événements-socketio) - notification, notification:read, etc.
- [Payloads](./NOTIFICATION_TYPES_REFERENCE.md#structure-des-payloads-socketio) - Structure des données

---

## Checklist pour Développeurs

### Avant de Commencer
- [ ] J'ai lu le [NOTIFICATION_SYSTEM_SUMMARY.md](./NOTIFICATION_SYSTEM_SUMMARY.md)
- [ ] J'ai compris les 11 types de notifications dans [NOTIFICATION_TYPES_REFERENCE.md](./NOTIFICATION_TYPES_REFERENCE.md)
- [ ] J'ai accès au repo Git et à la branche `dev`
- [ ] J'ai un environnement de développement fonctionnel
- [ ] J'ai les credentials MongoDB et Redis (si applicable)

### Pendant le Développement
- [ ] Je suis le [NOTIFICATION_MIGRATION_GUIDE.md](./NOTIFICATION_MIGRATION_GUIDE.md) étape par étape
- [ ] J'écris des tests pour chaque fonctionnalité développée
- [ ] Je vérifie les [ADRs](./NOTIFICATION_SYSTEM_SUMMARY.md#décisions-darchitecture-clés) avant les décisions techniques
- [ ] Je documente les changements et les choix d'implémentation
- [ ] Je teste manuellement chaque type de notification

### Avant de Merge
- [ ] Tous les tests passent (unitaires, intégration, E2E)
- [ ] La couverture de code est > 80%
- [ ] Les performances respectent les benchmarks (voir [Performance](./NOTIFICATION_SYSTEM_ARCHITECTURE.md#performance))
- [ ] La sécurité est validée (rate limiting, XSS, permissions)
- [ ] La documentation est mise à jour si nécessaire
- [ ] Le code est review par au moins 1 autre développeur

---

## Patterns Communs

### 1. Créer une Notification de Base

```typescript
// Backend
import { NotificationService } from '@/services/NotificationService';
import { NotificationType, NotificationPriority } from '@/types/notification';

const notificationService = new NotificationService(prisma);

await notificationService.createNotification({
  userId: 'user123',
  type: NotificationType.NEW_MESSAGE,
  title: 'Nouveau message de Alice',
  content: 'Salut! Comment ça va?',
  priority: NotificationPriority.NORMAL,
  senderId: 'alice_id',
  senderUsername: 'Alice',
  conversationId: 'conv456',
  messageId: 'msg789'
});
```

### 2. Écouter les Notifications en Temps Réel

```typescript
// Frontend
import { useNotifications } from '@/hooks/use-notifications';

function MyComponent() {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  return (
    <div>
      <p>Vous avez {unreadCount} notifications non lues</p>
      {notifications.map(notif => (
        <div key={notif.id} onClick={() => markAsRead(notif.id)}>
          {notif.title}: {notif.content}
        </div>
      ))}
    </div>
  );
}
```

### 3. Vérifier les Préférences Utilisateur

```typescript
// Backend
const shouldSend = await notificationService.shouldSendNotification(
  userId,
  NotificationType.MESSAGE_REPLY
);

if (shouldSend) {
  await notificationService.createReplyNotification(data);
}
```

### 4. Émettre une Notification via Socket.IO

```typescript
// Backend (automatique via NotificationService)
// Pas besoin d'appeler manuellement, le service s'en charge

// Frontend (réception)
socket.on('notification', (notification) => {
  console.log('Nouvelle notification:', notification);
  // Afficher un toast, mettre à jour le badge, etc.
});
```

---

## Glossaire

| Terme | Définition |
|-------|------------|
| **ADR** | Architecture Decision Record - Document décrivant une décision d'architecture importante |
| **Batch Processing** | Traitement de plusieurs opérations en une seule requête DB pour optimiser la performance |
| **Canary Release** | Déploiement progressif d'une fonctionnalité à un petit pourcentage d'utilisateurs pour validation |
| **Rate Limiting** | Limitation du nombre de requêtes/actions par unité de temps pour éviter les abus |
| **Sanitization** | Nettoyage des données utilisateur pour éviter les injections (XSS, SQL, etc.) |
| **Socket.IO** | Bibliothèque JavaScript pour communication WebSocket bidirectionnelle en temps réel |
| **Zustand** | Bibliothèque de state management React, alternative légère à Redux |
| **P50/P95/P99** | Percentiles de performance (50%, 95%, 99% des requêtes ont une latence ≤ X) |
| **TTL** | Time To Live - Durée de vie d'une donnée avant expiration automatique |
| **CRUD** | Create, Read, Update, Delete - Opérations de base sur les données |

---

## Ressources Externes

### Documentation Officielle
- [Prisma ORM](https://www.prisma.io/docs/) - ORM utilisé pour la base de données
- [Socket.IO](https://socket.io/docs/v4/) - Documentation Socket.IO v4
- [Zustand](https://github.com/pmndrs/zustand) - State management React
- [Next.js](https://nextjs.org/docs) - Framework React full-stack
- [MongoDB](https://www.mongodb.com/docs/) - Base de données NoSQL

### Articles et Tutoriels
- [Real-Time Notifications with Socket.IO](https://socket.io/get-started/chat)
- [Rate Limiting Best Practices](https://github.com/animir/node-rate-limiter-flexible)
- [Prisma Performance Tips](https://www.prisma.io/docs/guides/performance-and-optimization)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)

### Outils
- [Mermaid Live Editor](https://mermaid.live/) - Éditeur en ligne pour diagrammes Mermaid
- [MongoDB Compass](https://www.mongodb.com/products/compass) - GUI pour MongoDB
- [Prisma Studio](https://www.prisma.io/studio) - GUI pour explorer la base de données
- [Postman](https://www.postman.com/) - Tester les endpoints REST
- [Socket.IO Client Tool](https://amritb.github.io/socketio-client-tool/) - Tester Socket.IO

---

## Support et Contribution

### Signaler un Bug
1. Vérifier que le bug n'est pas déjà signalé dans les Issues GitHub
2. Créer une nouvelle issue avec le template "Bug Report"
3. Fournir les logs, stack trace, et étapes de reproduction
4. Assigner les labels appropriés (backend, frontend, security, etc.)

### Proposer une Amélioration
1. Ouvrir une issue de type "Feature Request"
2. Décrire le problème que vous voulez résoudre
3. Proposer une solution et des alternatives
4. Discuter avec l'équipe avant de commencer l'implémentation

### Contribuer au Code
1. Fork le repo et créer une branche feature/fix
2. Suivre les guidelines de code (ESLint, Prettier)
3. Écrire des tests pour votre code
4. Créer une Pull Request avec une description claire
5. Passer la review de code et les CI checks

---

## Changelog

### Version 2.0 (2025-01-21) - En cours d'implémentation
- ✨ Ajout de 11 types de notifications typés
- ✨ Formatage contextuel intelligent
- ✨ Préférences granulaires par type
- ✨ Mute par conversation
- ✨ Batch processing pour mentions
- ✨ Store Zustand frontend
- ✨ Composants UI riches (NotificationBell, NotificationList)
- 🔒 Rate limiting anti-spam avancé
- 🔒 Sanitization XSS
- ⚡ Auto-cleanup notifications anciennes
- ⚡ Optimisations performance (index, caching)

### Version 1.0 (2024) - Production
- 🎉 Système de notifications de base
- 🎉 4 types de notifications (message, appel manqué, conversation, mention)
- 🎉 Socket.IO real-time
- 🎉 Routes REST CRUD
- 🎉 Préférences utilisateur basiques

---

## Contact

Pour toute question ou assistance :

- **Documentation**: Consultez d'abord les documents ci-dessus
- **Issues GitHub**: [github.com/meeshy/meeshy/issues](https://github.com)
- **Slack**: #notifications-dev (pour les discussions techniques)
- **Email**: architecture@meeshy.me

---

**Dernière mise à jour**: 2025-01-21
**Maintenu par**: Architecture Team
**Version de la documentation**: 2.0

---

## Navigation Rapide

- [⬅️ Retour au README principal](./README.md)
- [📋 Résumé Exécutif](./NOTIFICATION_SYSTEM_SUMMARY.md)
- [🏗️ Architecture Technique](./NOTIFICATION_SYSTEM_ARCHITECTURE.md)
- [📚 Référence des Types](./NOTIFICATION_TYPES_REFERENCE.md)
- [🔄 Guide de Migration](./NOTIFICATION_MIGRATION_GUIDE.md)
