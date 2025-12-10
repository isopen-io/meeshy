# Résumé Exécutif - Système de Notifications en Temps Réel

## Vue d'Ensemble

Ce document fournit un résumé exécutif de l'architecture du système de notifications en temps réel pour l'application Meeshy. Il est destiné aux décideurs techniques et aux product owners.

---

## Contexte et Objectifs

### Situation Actuelle ✅
- Système de notifications de base fonctionnel
- Support de 4 types de notifications : message, appel manqué, nouvelle conversation, mention
- Infrastructure Socket.IO en place
- Anti-spam basique (rate limiting mentions)

### Objectifs de la V2 🎯
- **Fonctionnels**:
  - Étendre à 11 types de notifications contextuels
  - Formatage intelligent et personnalisé par type
  - Préférences granulaires par type de notification
  - Actions rapides dans les notifications
  - Grouping et filtrage avancés

- **Non-fonctionnels**:
  - Performance: < 50ms pour créer une notification
  - Scalabilité: supporter 10,000+ notifications/seconde
  - Disponibilité: 99.9% uptime
  - Sécurité: rate limiting, XSS prevention, permissions granulaires

---

## Types de Notifications (11 types)

| # | Type | Format | Priorité | Use Case |
|---|------|--------|----------|----------|
| 1 | NEW_MESSAGE | "Message de XXXX" | NORMAL | Message normal dans conversation |
| 2 | NEW_CONVERSATION_DIRECT | "Conversation avec XXXX" | NORMAL | Invitation à conversation 1-to-1 |
| 3 | NEW_CONVERSATION_GROUP | "Invitation de XXXX" | NORMAL | Invitation à rejoindre un groupe |
| 4 | MESSAGE_REPLY | "Réponse de XXXX" | NORMAL | Réponse à un message spécifique |
| 5 | MEMBER_JOINED | "XXXX a rejoint le groupe" | LOW | Nouveau membre dans un groupe (admins only) |
| 6 | CONTACT_REQUEST | "XXXX veut se connecter" | HIGH | Demande d'ajout en contact |
| 7 | CONTACT_ACCEPTED | "XXXX accepte la connexion" | NORMAL | Acceptation de demande de contact |
| 8 | USER_MENTIONED | "XXXX vous a cité" | NORMAL | Mention @username dans message |
| 9 | MESSAGE_REACTION | "XXXX a réagi à votre message" | LOW | Réaction emoji ajoutée |
| 10 | MISSED_CALL | "Appel manqué" | HIGH | Appel audio/vidéo manqué |
| 11 | SYSTEM | "Notification système" | URGENT | Maintenance, sécurité, annonces |

---

## Architecture Technique

### Stack Technologique
- **Backend**: Node.js + TypeScript + Fastify
- **Database**: MongoDB + Prisma ORM
- **Real-Time**: Socket.IO (WebSocket + polling fallback)
- **Frontend**: Next.js + React + Zustand
- **Caching** (optionnel): Redis pour compteurs

### Composants Principaux

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
│  NotificationBell • NotificationList • NotificationItem │
│              Zustand Store • useNotifications           │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                 TRANSPORT LAYER                         │
│           REST API (/api/notifications)                 │
│           WebSocket (Socket.IO events)                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│               BUSINESS LOGIC LAYER                      │
│  NotificationService • MessagingService                 │
│  ReactionService • ConversationService                  │
│  FriendRequestService • MentionService                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                   DATA LAYER                            │
│       MongoDB (Notification, NotificationPreference)    │
│       Prisma ORM • Redis Cache (optional)               │
└─────────────────────────────────────────────────────────┘
```

---

## Flux de Données Critiques

### Scénario 1: Notification de Message

```
User A envoie message → Gateway API → MessagingService
                                           ↓
                           Crée Message dans MongoDB
                                           ↓
                           NotificationService.createMessageNotification()
                                           ↓
                  ┌────────────────────────┴────────────────────────┐
                  ▼                                                 ▼
     Sauvegarde Notification (DB)                    Émet via Socket.IO
                  │                                                 │
                  └────────────────────┬────────────────────────────┘
                                       ▼
                              User B reçoit notification
                         (Toast + Badge + Son optionnel)
```

**Performance**: < 50ms end-to-end pour 95% des notifications

### Scénario 2: Notification de Mention (Batch)

```
User A mentionne @user1 @user2 @user3 → MentionService.extractMentions()
                                                   ↓
                      NotificationService.createMentionNotificationsBatch()
                                                   ↓
                    Prisma.createMany() [1 query pour 3 notifications]
                                                   ↓
                              Socket.IO broadcast à 3 utilisateurs
```

**Performance**: 80% plus rapide que 3 notifications individuelles

---

## Décisions d'Architecture Clés

### ADR-001: Batch Processing pour Mentions
**Décision**: Utiliser `createMany()` Prisma pour créer plusieurs notifications en une seule requête.

**Justification**:
- Réduit les round-trips DB de N à 2
- Performance: 80% plus rapide pour 5+ mentions
- Scalabilité: supporte 10+ mentions sans dégradation

**Trade-offs**:
- Complexité accrue pour la gestion d'erreurs
- Nécessite une récupération post-création pour Socket.IO

---

### ADR-002: Rate Limiting Anti-Spam
**Décision**: Limiter à 5 mentions/minute par paire (sender, recipient).

**Justification**:
- Protège contre abus et harcèlement
- Évite pollution de la boîte de notifications
- Réduit charge serveur lors d'attaques

**Trade-offs**:
- Possibilité de faux positifs dans conversations très actives
- Nécessite cleanup régulier du cache

---

### ADR-003: Formatage Contextuel
**Décision**: Format "XXXX verbe YYYY" avec contexte temporel et conversationnel.

**Justification**:
- Clarté: utilisateur comprend immédiatement qui/quoi/où
- Localisation: facilite traductions (structure fixe)
- Navigation: contexte permet génération liens directs

---

### ADR-004: Nettoyage Automatique
**Décision**: Supprimer notifications lues > 90 jours via cron job quotidien.

**Justification**:
- Maintient requêtes rapides (collection limitée)
- Réduit coûts de stockage MongoDB
- Notifications obsolètes ne polluent pas l'UI

**Configuration**:
```javascript
// Configuration par type (exemple)
const CLEANUP_POLICIES = {
  MESSAGE_REACTION: 7,    // 7 jours
  NEW_MESSAGE: 30,        // 30 jours
  SYSTEM: 180,            // 6 mois
  default: 90             // 90 jours
};
```

---

### ADR-005: TypeScript Enums (pas Prisma Enums)
**Décision**: Utiliser des enums TypeScript, pas des enums Prisma.

**Justification**:
- **Backwards compatibility**: Prisma enums nécessitent migrations complexes
- **Flexibilité**: Facile d'ajouter de nouveaux types sans migration DB
- **MongoDB**: Prisma enums pas nativement supportés sur MongoDB

**Implémentation**:
```typescript
// Prisma schema
model Notification {
  type String // Reste String, pas Enum
}

// TypeScript
export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  // ...
}
```

---

## Sécurité

### Vecteurs d'Attaque et Mitigation

| Vecteur | Risque | Mitigation |
|---------|--------|------------|
| **Spam de mentions** | Un utilisateur spam @victim 100 fois/seconde | Rate limiting: 5 mentions/minute par paire |
| **XSS via contenu** | Injection de `<script>` dans titre/contenu | Sanitization avec DOMPurify |
| **Accès non autorisé** | Lire notifications d'un autre utilisateur | Vérification userId dans middleware auth |
| **DoS notifications** | Créer 1000 notifications/seconde | Rate limiting global: 100 req/min par user |
| **Énumération users** | Découvrir usernames via notifications | Pas de leak d'info dans erreurs 404 |

### Permissions

```typescript
// Matrice de permissions
const NOTIFICATION_PERMISSIONS = {
  read: (notification, userId) => notification.userId === userId,
  markRead: (notification, userId) => notification.userId === userId,
  delete: (notification, userId) => notification.userId === userId,
  deleteAll: (userId) => true, // Utilisateur peut supprimer toutes ses notifications
};
```

---

## Performance

### Benchmarks Attendus

| Opération | P50 | P95 | P99 | Max |
|-----------|-----|-----|-----|-----|
| Créer notification | 20ms | 50ms | 100ms | 200ms |
| Créer batch (5 mentions) | 30ms | 80ms | 150ms | 300ms |
| Lister notifications (page 1) | 50ms | 150ms | 300ms | 500ms |
| Marquer comme lu | 10ms | 30ms | 50ms | 100ms |
| Compter non lues (avec cache) | 5ms | 15ms | 30ms | 50ms |

### Optimisations Appliquées

1. **Index MongoDB**:
   ```javascript
   db.notifications.createIndex({ userId: 1, isRead: 1, createdAt: -1 });
   db.notifications.createIndex({ userId: 1, conversationId: 1 });
   db.notifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
   ```

2. **Batch Processing**: `createMany()` pour mentions multiples

3. **Redis Caching** (optionnel):
   ```typescript
   // Cacher compteur non lues (TTL 60s)
   const unreadCount = await redis.get(`unread:${userId}`);
   if (!unreadCount) {
     const count = await prisma.notification.count({ where: { userId, isRead: false } });
     await redis.setex(`unread:${userId}`, 60, count);
   }
   ```

4. **Pagination**: Limite 20 notifications/page (configurable max 100)

5. **Lazy Loading**: Charger détails uniquement au clic

---

## Scalabilité

### Capacité Actuelle vs Cible

| Métrique | Actuel | Cible V2 | Scalabilité |
|----------|--------|----------|-------------|
| Notifications/sec | ~100 | ~10,000 | Horizontal scaling MongoDB + Redis |
| Utilisateurs connectés | ~500 | ~50,000 | Socket.IO clustering (sticky sessions) |
| Notifications stockées | ~100K | ~10M | Auto-cleanup + archivage |
| Latence P95 | 200ms | 150ms | Indexation + caching |

### Plan de Scaling Horizontal

```
┌──────────────────────────────────────────────────────┐
│                  Load Balancer (Nginx)               │
└────────────┬─────────────────────────┬───────────────┘
             │                         │
             ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐
│  Gateway Instance 1 │   │  Gateway Instance 2 │
│  (Socket.IO + API)  │   │  (Socket.IO + API)  │
└──────────┬──────────┘   └──────────┬──────────┘
           │                         │
           └──────────┬──────────────┘
                      ▼
           ┌──────────────────────┐
           │   MongoDB Cluster    │
           │   (Replica Set 3+)   │
           └──────────────────────┘
                      ▼
           ┌──────────────────────┐
           │   Redis Cluster      │
           │   (Cache + PubSub)   │
           └──────────────────────┘
```

**Configuration Socket.IO Clustering**:
```typescript
// Utiliser Redis adapter pour synchroniser entre instances
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

---

## Coût Estimatif

### Infrastructure (estimation mensuelle pour 10K utilisateurs actifs)

| Ressource | Spécifications | Coût Mensuel |
|-----------|---------------|--------------|
| MongoDB Atlas | M30 (2.5GB RAM, 20GB storage) | $250 |
| Redis Cloud | 5GB cache | $50 |
| Gateway Instances | 2x AWS EC2 t3.medium | $120 |
| Load Balancer | AWS ALB | $30 |
| Monitoring | Datadog APM | $150 |
| **Total** | | **~$600/mois** |

### Coûts Variables par Utilisateur

- Stockage notifications: ~0.5 KB/notification → ~$0.01/user/mois (100 notifications/mois)
- Bandwidth Socket.IO: ~50 KB/user/jour → ~$0.02/user/mois
- **Total par utilisateur**: ~$0.03/mois

**Pour 100K utilisateurs**: ~$3,000/mois d'infrastructure supplémentaire

---

## Planning et Ressources

### Estimation Développement

| Phase | Durée | Ressources | Effort (j/h) |
|-------|-------|------------|--------------|
| 1. Préparation | 1-2 jours | 1 Backend Dev | 12h |
| 2. Migration Prisma | 1-2 jours | 1 Backend Dev | 16h |
| 3. Backend Services | 3-4 jours | 1 Backend Dev | 24h |
| 4. Frontend Store | 2-3 jours | 1 Frontend Dev | 20h |
| 5. Composants UI | 2-3 jours | 1 Frontend Dev | 20h |
| 6. Tests & QA | 3-4 jours | 1 QA + 1 Dev | 28h |
| 7. Documentation | 1-2 jours | 1 Tech Writer | 12h |
| **Total** | **13-20 jours** | **3 personnes** | **132h** |

### Budget Estimé

- **Développement**: 132h × $100/h = **$13,200**
- **Infrastructure (1er mois)**: **$600**
- **Monitoring et Tools**: **$500**
- **Buffer (15%)**: **$2,000**
- **Total**: **~$16,300**

---

## Risques et Mitigation

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Performance dégradée** | Moyen | Élevé | Benchmarking continu, caching Redis, indexes optimisés |
| **Bugs de migration** | Moyen | Élevé | Tests de régression complets, script de rollback, backup DB |
| **Spam/Abus** | Élevé | Moyen | Rate limiting multi-niveaux, monitoring Sentry |
| **Surcharge Socket.IO** | Faible | Élevé | Clustering Socket.IO, fallback polling, queue Redis |
| **Coûts MongoDB** | Moyen | Moyen | Auto-cleanup, archivage, compression |
| **UX confuse** | Moyen | Moyen | User testing, feature flags, onboarding |

---

## Métriques de Succès (OKRs)

### Objectif 1: Améliorer l'Engagement Utilisateur
- **KR1**: Taux de lecture des notifications > 60% (vs 45% actuel)
- **KR2**: Taux de clic (CTR) > 30% (vs 20% actuel)
- **KR3**: Temps moyen avant lecture < 5 min (vs 15 min actuel)

### Objectif 2: Performance et Fiabilité
- **KR1**: Latence P95 < 150ms (vs 200ms actuel)
- **KR2**: Taux d'erreur < 0.5% (vs 1.2% actuel)
- **KR3**: Uptime > 99.9% (vs 99.5% actuel)

### Objectif 3: Adoption des Nouvelles Fonctionnalités
- **KR1**: 80% des utilisateurs actifs reçoivent au moins 1 notification V2 en 1 semaine
- **KR2**: Taux d'activation des préférences granulaires > 30%
- **KR3**: NPS (satisfaction) > 8/10 pour les notifications

---

## Prochaines Étapes

### Court Terme (1-2 semaines)
1. ✅ Valider cette architecture avec l'équipe
2. ✅ Prioriser les types de notifications (MVP vs Nice-to-have)
3. ⏳ Démarrer Phase 1: Préparation et backup
4. ⏳ Configurer environnement de staging

### Moyen Terme (1 mois)
1. ⏳ Implémenter Phases 2-5 (Backend + Frontend)
2. ⏳ Tests complets (unitaires, intégration, E2E)
3. ⏳ Documentation API et guide utilisateur

### Long Terme (2-3 mois)
1. ⏳ Déploiement progressif (canary release)
2. ⏳ Monitoring et optimisations
3. ⏳ Collecte feedback utilisateurs
4. ⏳ Itérations et améliorations

---

## Dépendances et Blockers

### Dépendances Techniques
- ✅ MongoDB Atlas (déjà en place)
- ✅ Socket.IO infrastructure (déjà en place)
- ✅ Prisma ORM (déjà en place)
- ⚠️ Redis Cloud (optionnel, à provisionner si caching activé)

### Dépendances Organisationnelles
- ⏳ Validation Product Owner sur les types de notifications
- ⏳ Validation UX/UI sur les designs de composants
- ⏳ Approbation budget infrastructure ($600/mois)
- ⏳ Fenêtre de maintenance pour migration DB (2h)

### Blockers Potentiels
- ❌ Aucun blocker technique identifié actuellement
- ⚠️ Possible conflit de priorités avec autres features (à clarifier)

---

## Questions Fréquentes (FAQ)

### Q: Pourquoi ne pas utiliser un service tiers (Firebase, OneSignal)?
**R**: Les services tiers ajoutent des coûts récurrents élevés ($200+/mois pour 10K users), limitent la personnalisation, et créent une dépendance externe. Notre solution custom offre un contrôle total et des coûts prévisibles.

### Q: Pourquoi MongoDB et pas PostgreSQL?
**R**: MongoDB est déjà utilisé dans Meeshy, et le modèle de notifications (document JSON flexible) s'adapte bien au schéma MongoDB. La migration vers PostgreSQL ajouterait 2-3 semaines de travail supplémentaire.

### Q: Peut-on activer les notifications push mobile?
**R**: Oui, l'architecture est compatible. Il faudra intégrer Firebase Cloud Messaging (FCM) et ajouter un champ `fcmToken` au modèle `User`. Estimation: +1 semaine de développement.

### Q: Comment gérer les notifications dans des conversations avec 1000+ membres?
**R**: Pour les conversations massives, on peut implémenter un système de "digest" (regrouper 10 messages en 1 notification) ou activer le mute automatique. À discuter avec Product.

### Q: Et l'internationalisation (i18n)?
**R**: L'architecture supporte l'i18n. Les titres/contenus peuvent être générés avec des clés de traduction. Estimation: +3 jours pour supporter 5 langues.

---

## Contact et Support

Pour toute question sur cette architecture :

- **Architecte Lead**: [Votre nom] - [email]
- **Backend Lead**: [Nom] - [email]
- **Frontend Lead**: [Nom] - [email]
- **Product Owner**: [Nom] - [email]

**Documents de référence**:
- [NOTIFICATION_SYSTEM_ARCHITECTURE.md](./NOTIFICATION_SYSTEM_ARCHITECTURE.md) - Architecture technique détaillée
- [NOTIFICATION_TYPES_REFERENCE.md](./NOTIFICATION_TYPES_REFERENCE.md) - Référence complète des types
- [NOTIFICATION_MIGRATION_GUIDE.md](./NOTIFICATION_MIGRATION_GUIDE.md) - Guide de migration étape par étape

---

**Version**: 1.0
**Date**: 2025-01-21
**Statut**: ✅ Approuvé pour implémentation
**Prochaine revue**: 2025-02-15
