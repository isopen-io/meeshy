# Plan de couverture backend pour les 13 pages Admin

## Résumé exécutif

**Date**: 2025-11-15
**Objectif**: Analyser et planifier la couverture backend pour toutes les pages admin

### Vue d'ensemble

| # | Page | Frontend | Backend | Couverture | Priorité |
|---|------|----------|---------|------------|----------|
| 1 | Dashboard | ✅ Complet | ✅ Complet | 100% | - |
| 2 | Analytics | ✅ Complet | 🟡 Partiel | 60% | 🔴 Haute |
| 3 | Users | ✅ Complet | ✅ Complet | 100% | - |
| 4 | Anonymous | ✅ Complet | ✅ Complet | 100% | - |
| 5 | Messages | ✅ Complet | ✅ Complet | 95% | 🟡 Moyenne |
| 6 | ShareLinks | ✅ Complet | ✅ Complet | 100% | - |
| 7 | Communities | ✅ Complet | ✅ Complet | 100% | - |
| 8 | Translations | ✅ Complet | ✅ Complet | 100% | - |
| 9 | Reports | ✅ Complet | ✅ Complet | 100% | - |
| 10 | Invitations | ✅ Complet | 🟡 Partiel | 50% | 🔴 Haute |
| 11 | Languages | ✅ Complet | 🟡 Partiel | 70% | 🟡 Moyenne |
| 12 | Moderation | ✅ Complet | ❌ Manquant | 0% | 🔴 Haute |
| 13 | Settings | ✅ Complet | ❌ Manquant | 0% | 🔴 Haute |
| 14 | Audit Logs | ✅ Complet | ❌ Manquant | 0% | 🔴 Haute |

**Légende**:
- ✅ Complet : Fonctionnalité entièrement implémentée
- 🟡 Partiel : Fonctionnalité partiellement implémentée
- ❌ Manquant : Fonctionnalité à implémenter

---

## 1. Dashboard (`/admin/`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/dashboard`
**Fichier**: `gateway/src/routes/admin.ts:148-299`

### Données fournies:
- ✅ totalUsers, activeUsers, inactiveUsers
- ✅ totalAnonymousUsers, activeAnonymousUsers
- ✅ totalMessages, totalCommunities
- ✅ totalTranslations, totalReports, totalInvitations
- ✅ topLanguages (top 10)
- ✅ usersByRole, messagesByType
- ✅ recentActivity (7 derniers jours)
- ✅ userPermissions

### Actions requises: **AUCUNE** ✅

---

## 2. Analytics (`/admin/analytics`)

### Statut: 🟡 60% Couvert

**Endpoint principal**: `GET /api/admin/analytics`
**Fichier**: `gateway/src/routes/admin.ts:1184-1306`

### ✅ Données actuellement fournies:
- userActivity (groupBy createdAt)
- messageActivity (groupBy createdAt)
- conversationActivity (groupBy createdAt)
- usersByRole (groupBy role)
- topActiveUsers (top 10)
- Paramètre period: 24h, 7d, 30d, 90d

### ❌ Données manquantes (requises par le frontend):

1. **Métriques temps réel**:
   - Endpoint: `GET /api/admin/analytics/realtime`
   - Données: onlineUsers, messagesLastHour, activeConversations

2. **Activité horaire** (hourly breakdown):
   - Endpoint: `GET /api/admin/analytics/hourly-activity`
   - Données: Messages par heure sur 24h

3. **Distribution types de messages**:
   - Endpoint: `GET /api/admin/analytics/message-types`
   - Données: Count par messageType avec percentages

4. **Distribution utilisateurs** (par niveau activité):
   - Endpoint: `GET /api/admin/analytics/user-distribution`
   - Données: Très actifs, Actifs, Occasionnels, Inactifs

5. **Distribution langues**:
   - Endpoint: `GET /api/admin/analytics/language-distribution`
   - Données: Top 5 langues avec counts

6. **KPIs avancés**:
   - Taux d'engagement
   - Temps moyen par session
   - Heures de pic
   - Croissance (%) nouveaux users

### 🔧 Actions requises:

**Priorité HAUTE** 🔴

#### A. Améliorer endpoint existant `/api/admin/analytics`

Ajouter au retour:
```typescript
{
  // ... existant
  realtime: {
    onlineUsers: number,
    messagesLastHour: number,
    activeConversations: number
  },
  hourlyActivity: Array<{ hour: string, activity: number }>,
  messageTypeDistribution: Array<{ type: string, count: number, percentage: number }>,
  userDistribution: Array<{ segment: string, count: number }>,
  languageDistribution: Array<{ language: string, count: number }>,
  kpis: {
    engagementRate: number,
    avgSessionTime: string,
    peakHours: string,
    growthRate: number
  }
}
```

#### B. Ou créer endpoints spécialisés:

```
GET /api/admin/analytics/realtime
GET /api/admin/analytics/hourly-activity?date=YYYY-MM-DD
GET /api/admin/analytics/message-types?period=7d
GET /api/admin/analytics/user-distribution
GET /api/admin/analytics/language-distribution?limit=5
GET /api/admin/analytics/kpis?period=30d
```

---

## 3. Users (`/admin/users`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/users`
**Fichier**: `gateway/src/routes/admin.ts:302-412`

### ✅ Fonctionnalités complètes:
- Liste avec pagination (page, limit)
- Filtres: search, role, status
- Détails utilisateur: `GET /api/admin/users/:id`
- Modification rôle: `PATCH /api/admin/users/:id/role`
- Modification statut: `PATCH /api/admin/users/:id/status`
- Compteurs: sentMessages, conversations, communities, etc.

### Actions requises: **AUCUNE** ✅

---

## 4. Anonymous Users (`/admin/anonymous-users`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/anonymous-users`
**Fichier**: `gateway/src/routes/admin.ts:415-523`

### ✅ Fonctionnalités complètes:
- Liste avec pagination
- Filtres: search, status
- Données: shareLink, conversation, sentMessages
- IP, country, language tracking

### Actions requises: **AUCUNE** ✅

---

## 5. Messages (`/admin/messages`)

### Statut: ✅ 95% Couvert

**Endpoint**: `GET /api/admin/messages`
**Fichier**: `gateway/src/routes/admin.ts:744-863`

### ✅ Fonctionnalités existantes:
- Liste avec pagination
- Filtres: search, type, period
- Données: sender, conversation, translations count

### 🟡 Amélioration mineure nécessaire:

Ajouter endpoint pour statistiques messages:
```
GET /api/admin/messages/stats
```
Retour:
```typescript
{
  totalMessages: number,
  messagesByType: Record<string, number>,
  messagesByPeriod: Array<{ date: string, count: number }>,
  averageLength: number,
  translatedPercentage: number
}
```

**Priorité**: 🟡 Moyenne

---

## 6. ShareLinks (`/admin/share-links`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/share-links`
**Fichier**: `gateway/src/routes/admin.ts:1078-1181`

### ✅ Fonctionnalités complètes:
- Liste avec pagination
- Filtres: search, isActive
- Données complètes: creator, conversation, anonymousParticipants
- Permissions: allowAnonymousMessages, Files, Images

### Actions requises: **AUCUNE** ✅

---

## 7. Communities (`/admin/communities`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/communities`
**Fichier**: `gateway/src/routes/admin.ts:866-954`

### ✅ Fonctionnalités complètes:
- Liste avec pagination
- Filtres: search, isPrivate
- Données: creator, members count, conversations count

### Actions requises: **AUCUNE** ✅

---

## 8. Translations (`/admin/translations`)

### Statut: ✅ 100% Couvert

**Endpoint**: `GET /api/admin/translations`
**Fichier**: `gateway/src/routes/admin.ts:957-1075`

### ✅ Fonctionnalités complètes:
- Liste avec pagination
- Filtres: sourceLanguage, targetLanguage, period
- Données: message, sender, conversation, confidenceScore

### Actions requises: **AUCUNE** ✅

---

## 9. Reports (`/admin/reports`)

### Statut: ✅ 100% Couvert

**Endpoints**: Multiple endpoints complets
**Fichier**: `gateway/src/routes/admin/reports.ts`

### ✅ Fonctionnalités complètes:
- `GET /api/admin/reports` - Liste avec filtres
- `GET /api/admin/reports/stats` - Statistiques
- `GET /api/admin/reports/recent` - Récents
- `GET /api/admin/reports/:id` - Détails
- `PATCH /api/admin/reports/:id` - Mise à jour
- `POST /api/admin/reports/:id/assign` - Assigner modérateur
- `GET /api/admin/reports/moderator/mine` - Mes signalements

### Actions requises: **AUCUNE** ✅

---

## 10. Invitations (`/admin/invitations`)

### Statut: 🟡 50% Couvert

**Problème**: Pas d'endpoint dédié. Actuellement utilise `friendRequest` comme proxy.

### ❌ Endpoints manquants:

```
GET /api/admin/invitations
GET /api/admin/invitations/stats
GET /api/admin/invitations/:id
PATCH /api/admin/invitations/:id (approve/reject)
```

### 🔧 Actions requises:

**Priorité HAUTE** 🔴

#### A. Créer `gateway/src/routes/admin/invitations.ts`

Endpoints à implémenter:
1. `GET /api/admin/invitations` - Liste avec pagination
   - Filtres: status (pending/accepted/rejected), communityId, inviterId
   - Retour: invitations avec inviter, invitee, community

2. `GET /api/admin/invitations/stats`
   - Retour: total, pending, accepted, rejected, byType

3. `GET /api/admin/invitations/:id` - Détails

4. `PATCH /api/admin/invitations/:id`
   - Body: { status: 'accepted' | 'rejected' }

#### B. Mise à jour base de données

Si table `Invitation` n'existe pas, utiliser:
- Table `FriendRequest` pour invitations d'amis
- Table `CommunityMember` avec status pending pour invitations communautés

---

## 11. Languages (`/admin/languages`)

### Statut: 🟡 70% Couvert

**Endpoint partiel**: Via `/api/admin/dashboard` (topLanguages)

### ✅ Données existantes:
- topLanguages (top 10 via dashboard)

### ❌ Données manquantes:

1. Statistiques détaillées par langue
2. Évolution temporelle par langue
3. Utilisateurs par langue préférée
4. Précision traductions par paire de langues

### 🔧 Actions requises:

**Priorité MOYENNE** 🟡

#### Créer endpoint `/api/admin/languages/stats`

```
GET /api/admin/languages/stats?period=30d
```

Retour:
```typescript
{
  topLanguages: Array<{
    language: string,
    messageCount: number,
    userCount: number,
    percentage: number
  }>,
  languagePairs: Array<{
    from: string,
    to: string,
    translationCount: number,
    avgConfidence: number
  }>,
  usersByLanguage: Record<string, number>,
  growth: Record<string, number> // % growth by language
}
```

---

## 12. Moderation (`/admin/moderation`)

### Statut: ❌ 0% Couvert

**Problème**: Page créée mais aucun backend dédié

### ❌ Endpoints manquants:

```
GET /api/admin/moderation/stats
GET /api/admin/moderation/actions
POST /api/admin/moderation/actions (create new action)
GET /api/admin/moderation/actions/:id
```

### 🔧 Actions requises:

**Priorité HAUTE** 🔴

#### A. Créer `gateway/src/routes/admin/moderation.ts`

Endpoints à implémenter:

1. **`GET /api/admin/moderation/stats`**
   ```typescript
   {
     pendingReports: number,
     totalActions: number,
     actionsThisWeek: number,
     activeUsers: number,
     trends: {
       actions: number, // % change
       reports: number
     }
   }
   ```

2. **`GET /api/admin/moderation/actions`**
   - Pagination + filtres (type, severity, search)
   - Retour: liste actions modération
   ```typescript
   {
     id: string,
     type: 'warning' | 'mute' | 'suspend' | 'ban' | 'report_resolved' | 'report_dismissed',
     targetUserId: string,
     moderatorId: string,
     reason: string,
     severity: 'low' | 'medium' | 'high' | 'critical',
     expiresAt?: Date,
     createdAt: Date
   }
   ```

3. **`POST /api/admin/moderation/actions`**
   - Créer nouvelle action
   - Body: type, targetUserId, reason, severity, duration

4. **`GET /api/admin/moderation/actions/weekly`**
   - Graphique des actions sur 7 derniers jours

#### B. Créer service `ModerationService`

Fichier: `gateway/src/services/admin/moderation.service.ts`

Méthodes:
- `createAction(data: ModerationActionDTO)`
- `getActions(filters, pagination)`
- `getStats()`
- `getWeeklyChart()`

#### C. Créer table base de données

Si table `ModerationAction` n'existe pas:

```prisma
model ModerationAction {
  id            String   @id @default(cuid())
  type          String   // warning, mute, suspend, ban, report_resolved, report_dismissed
  targetUserId  String
  targetUser    User     @relation("ModerationTarget", fields: [targetUserId])
  moderatorId   String
  moderator     User     @relation("ModeratorActions", fields: [moderatorId])
  reason        String
  description   String?
  severity      String   // low, medium, high, critical
  expiresAt     DateTime?
  relatedReportId String?
  relatedReport   Report?  @relation(fields: [relatedReportId])
  createdAt     DateTime @default(now())
}
```

---

## 13. Settings (`/admin/settings`)

### Statut: ❌ 0% Couvert

**Problème**: Page UI créée mais aucun backend pour sauvegarder/charger configs

### ❌ Endpoints manquants:

```
GET /api/admin/settings
PATCH /api/admin/settings
POST /api/admin/settings/reset
GET /api/admin/settings/env-vars
```

### 🔧 Actions requises:

**Priorité HAUTE** 🔴

#### A. Créer `gateway/src/routes/admin/settings.ts`

Endpoints à implémenter:

1. **`GET /api/admin/settings`**
   - Retour: toutes les configurations actuelles
   ```typescript
   {
     general: { NODE_ENV, DOMAIN, FRONTEND_URL, ... },
     database: { DATABASE_URL (masked), ... },
     security: { JWT_SECRET (masked), CORS_ORIGINS, ... },
     rateLimiting: { ENABLE_RATE_LIMITING, RATE_LIMIT_MAX, ... },
     messages: { MAX_MESSAGE_LENGTH, ... },
     uploads: { UPLOAD_PATH, MAX_FILE_SIZE, ... },
     server: { PORT, ZMQ_TRANSLATOR_PORT, ... },
     features: { ENABLE_COMMUNITIES, ENABLE_ANONYMOUS, ... }
   }
   ```

2. **`PATCH /api/admin/settings`**
   - Body: { section: string, settings: Record<string, any> }
   - Validation stricte des valeurs
   - Sauvegarde dans base de données OU fichier .env
   - Retour: nouvelles valeurs

3. **`POST /api/admin/settings/reset`**
   - Réinitialiser aux valeurs par défaut
   - Paramètre optionnel: section (reset une section seulement)

4. **`GET /api/admin/settings/env-vars`**
   - Liste toutes les variables d'env avec valeurs actuelles (sensibles masquées)

#### B. Stratégie de stockage

**Option 1 - Base de données** (Recommandé):
```prisma
model SystemSetting {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String
  type        String   // string, number, boolean, json
  category    String   // general, database, security, etc.
  description String?
  isSecret    Boolean  @default(false)
  updatedAt   DateTime @updatedAt
  updatedBy   String?
  updatedByUser User?  @relation(fields: [updatedBy])
}
```

**Option 2 - Fichier .env.local**:
- Écrire dans `.env.local`
- Nécessite restart serveur pour prendre effet
- Plus simple mais moins flexible

#### C. Créer service `SettingsService`

Fichier: `gateway/src/services/admin/settings.service.ts`

Méthodes:
- `getAllSettings()`
- `updateSettings(section, settings, userId)`
- `resetSettings(section?)`
- `getEnvVars()`
- `validateSetting(key, value)` - Validation stricte

---

## 14. Audit Logs (`/admin/audit-logs`)

### Statut: ❌ 0% Couvert

**Problème**: Page UI créée mais aucun système de logging d'audit

### ❌ Endpoints manquants:

```
GET /api/admin/audit-logs
GET /api/admin/audit-logs/stats
GET /api/admin/audit-logs/:id
POST /api/admin/audit-logs (création automatique)
```

### 🔧 Actions requises:

**Priorité HAUTE** 🔴

#### A. Créer table base de données

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  userId      String?
  user        User?    @relation(fields: [userId])
  action      String   // user_login, user_created, settings_changed, etc.
  resource    String   // user, message, community, system_config, etc.
  resourceId  String?
  method      String   // GET, POST, PUT, PATCH, DELETE
  status      String   // success, failure, warning
  ipAddress   String?
  userAgent   String?
  changes     Json?    // { field, oldValue, newValue }[]
  metadata    Json?    // Additional context
  severity    String   // low, medium, high, critical
}
```

#### B. Créer `gateway/src/routes/admin/audit-logs.ts`

Endpoints:

1. **`GET /api/admin/audit-logs`**
   - Pagination + filtres (action, status, severity, userId, dateRange)
   - Retour: liste logs d'audit

2. **`GET /api/admin/audit-logs/stats`**
   ```typescript
   {
     totalLogs: number,
     logins: number,
     securityAlerts: number,
     configChanges: number,
     adminActions: number,
     dataExports: number
   }
   ```

3. **`GET /api/admin/audit-logs/:id`**
   - Détails log avec toutes métadonnées

#### C. Créer middleware d'audit

Fichier: `gateway/src/middleware/audit-logger.ts`

Middleware Fastify qui log automatiquement:
- Toutes les requêtes admin (POST/PATCH/DELETE)
- Login/Logout
- Changements de permissions
- Exports de données
- Erreurs de sécurité

```typescript
fastify.addHook('onResponse', async (request, reply) => {
  // Si route admin et méthode modifiante
  if (request.url.startsWith('/api/admin') &&
      ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    await auditService.log({
      userId: request.user?.id,
      action: determineAction(request),
      resource: determineResource(request),
      method: request.method,
      status: reply.statusCode < 400 ? 'success' : 'failure',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      // ...
    });
  }
});
```

#### D. Créer service `AuditService`

Fichier: `gateway/src/services/admin/audit.service.ts`

Méthodes:
- `log(logData: AuditLogDTO)` - Créer log
- `getLogs(filters, pagination)`
- `getStats()`
- `getLogById(id)`
- `cleanOldLogs(retentionDays)` - Nettoyage automatique

---

## Plan d'implémentation par priorité

### 🔴 Priorité HAUTE (À faire en premier)

1. **Moderation backend** (Page déjà créée, backend manquant)
   - Créer routes `/api/admin/moderation/*`
   - Créer service `ModerationService`
   - Créer table `ModerationAction` si nécessaire
   - Estimation: 4-6 heures

2. **Settings backend** (Page déjà créée, backend manquant)
   - Créer routes `/api/admin/settings/*`
   - Créer service `SettingsService`
   - Créer table `SystemSetting`
   - Estimation: 6-8 heures

3. **Audit Logs backend** (Page déjà créée, backend manquant)
   - Créer table `AuditLog`
   - Créer routes `/api/admin/audit-logs/*`
   - Créer middleware audit-logger
   - Créer service `AuditService`
   - Estimation: 8-10 heures

4. **Invitations backend** (Partiellement couvert)
   - Créer routes `/api/admin/invitations/*`
   - Utiliser tables existantes (FriendRequest, CommunityMember)
   - Estimation: 3-4 heures

5. **Analytics amélioration** (Fonctionnalité partielle)
   - Améliorer endpoint `/api/admin/analytics`
   - Ajouter realtime, hourly, distributions, KPIs
   - Estimation: 4-5 heures

### 🟡 Priorité MOYENNE (À faire ensuite)

6. **Languages stats** (Amélioration)
   - Créer endpoint `/api/admin/languages/stats`
   - Estimation: 2-3 heures

7. **Messages stats** (Amélioration mineure)
   - Créer endpoint `/api/admin/messages/stats`
   - Estimation: 1-2 heures

---

## Temps total estimé

- **Priorité HAUTE**: 25-33 heures
- **Priorité MOYENNE**: 3-5 heures
- **TOTAL**: 28-38 heures de développement backend

---

## Recommandations

### Ordre d'implémentation conseillé:

1. **Settings** - Permet de configurer le système (essentiel)
2. **Audit Logs** - Traçabilité des actions (sécurité)
3. **Moderation** - Fonctionnalité opérationnelle importante
4. **Analytics** - Améliore les dashboards existants
5. **Invitations** - Complète la gestion utilisateurs
6. **Languages** - Stats avancées
7. **Messages** - Stats complémentaires

### Tests requis:

Pour chaque nouveau endpoint:
- Tests unitaires (services)
- Tests d'intégration (routes)
- Tests de permissions (RBAC)
- Tests de validation (schémas Zod)

### Documentation:

- Documenter chaque endpoint dans Swagger/OpenAPI
- Mettre à jour le README backend
- Créer exemples d'utilisation pour chaque route

---

## Conclusion

**Pages avec backend complet (8/14)**:
✅ Dashboard, Users, Anonymous, ShareLinks, Communities, Translations, Reports, Messages

**Pages nécessitant backend (6/14)**:
- 🔴 Haute priorité (4): Moderation, Settings, Audit Logs, Invitations
- 🟡 Moyenne priorité (2): Analytics (amélioration), Languages (amélioration)

**Couverture globale actuelle**: ~65%
**Couverture cible**: 100%

Avec ~30 heures de développement backend, toutes les pages admin auront un backend complet et fonctionnel.
