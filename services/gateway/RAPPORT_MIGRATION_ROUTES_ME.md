# Rapport de Migration des Routes vers /api/v1/me

## 📋 Objectif
S'assurer que toutes les opérations concernant l'utilisateur connecté sont sous le préfixe `/api/v1/me` pour une meilleure cohérence et organisation de l'API.

## ✅ Routes déjà sous /api/v1/me

### `/api/v1/me` (routes/me/index.ts)
- ✅ `GET /api/v1/me` - Informations de l'utilisateur connecté

### `/api/v1/me/preferences` (routes/me/preferences/)
- ✅ `GET /api/v1/me/preferences/:preferenceType` - Récupérer une préférence
- ✅ `PUT /api/v1/me/preferences/:preferenceType` - Mettre à jour une préférence
- ✅ `DELETE /api/v1/me/preferences/:preferenceType` - Supprimer une préférence

## 🔄 Routes à migrer

### 1. Authentification à deux facteurs (2FA)
**Actuel :** `/api/v1/auth/2fa/*` (routes/two-factor.ts)
**Proposé :** `/api/v1/me/security/two-factor/*` ou `/api/v1/me/two-factor/*`

**Routes concernées :**
- `GET /api/v1/auth/2fa/status` → `GET /api/v1/me/two-factor/status`
- `POST /api/v1/auth/2fa/setup` → `POST /api/v1/me/two-factor/setup`
- `POST /api/v1/auth/2fa/enable` → `POST /api/v1/me/two-factor/enable`
- `POST /api/v1/auth/2fa/disable` → `POST /api/v1/me/two-factor/disable`
- `POST /api/v1/auth/2fa/verify` → `POST /api/v1/me/two-factor/verify`
- `POST /api/v1/auth/2fa/backup-codes` → `POST /api/v1/me/two-factor/backup-codes`
- `POST /api/v1/auth/2fa/cancel` → `POST /api/v1/me/two-factor/cancel`

**Justification :** Ces routes gèrent les paramètres de sécurité de l'utilisateur connecté, pas l'authentification initiale.

---

### 2. Préférences de chiffrement
**Actuel :** `/api/v1/users/encryption-preferences/*` (routes/user-encryption-preferences.ts)
**Proposé :** `/api/v1/me/encryption/preferences/*` ou `/api/v1/me/preferences/encryption/*`

**Routes concernées :**
- Routes de gestion des préférences de chiffrement utilisateur
- Génération et gestion des clés Signal Protocol

**Justification :** Ces préférences sont spécifiques à l'utilisateur connecté et devraient être sous /me.

---

### 3. Tokens de notification push
**Actuel :** `/api/v1/users/register-device-token` et `/api/v1/users/me/devices/*` (routes/push-tokens.ts)
**Proposé :** `/api/v1/me/devices/*`

**Routes concernées :**
- `POST /api/v1/users/register-device-token` → `POST /api/v1/me/devices/tokens`
- `DELETE /api/v1/users/register-device-token` → `DELETE /api/v1/me/devices/tokens`
- `GET /api/v1/users/me/devices` → `GET /api/v1/me/devices`
- `DELETE /api/v1/users/me/devices/:deviceId` → `DELETE /api/v1/me/devices/:deviceId`

**Justification :** Gestion des appareils de l'utilisateur connecté.

---

### 4. Notifications
**Actuel :** `/api/v1/notifications/*` (routes/notifications.ts, routes/notifications-secured.ts)
**Proposé :** `/api/v1/me/notifications/*`

**Routes concernées :**
- `GET /api/v1/notifications` → `GET /api/v1/me/notifications`
- `PATCH /api/v1/notifications/:id/read` → `PATCH /api/v1/me/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all` → `PATCH /api/v1/me/notifications/read-all`
- `DELETE /api/v1/notifications/:id` → `DELETE /api/v1/me/notifications/:id`
- `DELETE /api/v1/notifications/read` → `DELETE /api/v1/me/notifications/read`
- `POST /api/v1/notifications/test` → `POST /api/v1/me/notifications/test`
- `GET /api/v1/notifications/stats` → `GET /api/v1/me/notifications/stats`

**Justification :** Toutes les notifications sont spécifiques à l'utilisateur connecté.

---

### 5. Profil vocal et analyse vocale
**Actuel :** `/api/v1/voice/profile/*` et `/api/v1/voice/analysis` (routes/voice-profile.ts, routes/voice-analysis.ts)
**Proposé :** `/api/v1/me/voice/*`

**Routes concernées :**
- `POST /api/v1/voice/analysis` → `POST /api/v1/me/voice/analysis`
- `GET /api/v1/voice/analysis` → `GET /api/v1/me/voice/analysis`
- Routes de profil vocal sous `/api/v1/voice/profile` → `/api/v1/me/voice/profile`

**Justification :** Le profil vocal et l'analyse sont propres à chaque utilisateur.

---

### 6. Mentions de l'utilisateur
**Actuel :** `/api/v1/mentions/user` (routes/mentions.ts)
**Proposé :** `/api/v1/me/mentions`

**Routes concernées :**
- Route pour récupérer les mentions de l'utilisateur connecté

**Justification :** Les mentions d'un utilisateur sont spécifiques à lui.

**Note :** Les routes `/api/v1/mentions/suggestions` et `/api/v1/messages/:messageId/mentions` peuvent rester car elles sont liées à des conversations/messages spécifiques.

---

### 7. Statut de lecture des messages
**Actuel :** `/api/v1/messages/:messageId/read-status` (routes/message-read-status.ts)
**Proposé :** Vérifier si cela concerne l'utilisateur connecté

**À examiner :** Si ces routes concernent uniquement le statut de lecture de l'utilisateur connecté, les migrer vers `/api/v1/me/read-status`.

---

## 📊 Résumé

| Catégorie | Routes actuelles | Routes proposées | Priorité |
|-----------|-----------------|------------------|----------|
| 2FA | `/api/v1/auth/2fa/*` | `/api/v1/me/two-factor/*` | ⚠️ Haute |
| Chiffrement | `/api/v1/users/encryption-preferences/*` | `/api/v1/me/encryption/preferences/*` | ⚠️ Haute |
| Appareils | `/api/v1/users/register-device-token`, `/api/v1/users/me/devices/*` | `/api/v1/me/devices/*` | ⚠️ Haute |
| Notifications | `/api/v1/notifications/*` | `/api/v1/me/notifications/*` | ⚠️ Haute |
| Voix | `/api/v1/voice/*` | `/api/v1/me/voice/*` | 🔵 Moyenne |
| Mentions | `/api/v1/mentions/user` | `/api/v1/me/mentions` | 🔵 Moyenne |

## 🎯 Plan de migration recommandé

### Phase 1 : Préparation
1. ✅ Auditer toutes les routes existantes
2. ⬜ Créer les nouveaux fichiers de routes sous `/routes/me/`
3. ⬜ Implémenter les nouvelles routes en conservant la logique métier

### Phase 2 : Migration progressive
1. ⬜ Migrer les routes 2FA vers `/me/two-factor`
2. ⬜ Migrer les appareils vers `/me/devices`
3. ⬜ Migrer les notifications vers `/me/notifications`
4. ⬜ Migrer le chiffrement vers `/me/encryption/preferences`
5. ⬜ Migrer la voix vers `/me/voice`

### Phase 3 : Dépréciation
1. ⬜ Marquer les anciennes routes comme dépréciées (headers)
2. ⬜ Ajouter des warnings dans les logs
3. ⬜ Documenter la migration dans l'API

### Phase 4 : Suppression (optionnel)
1. ⬜ Après une période de transition, supprimer les anciennes routes

## 💡 Recommandations

1. **Rétrocompatibilité :** Garder les anciennes routes pendant une période de transition avec des redirections ou des warnings
2. **Documentation :** Mettre à jour la documentation Swagger/OpenAPI
3. **Tests :** Créer des tests pour les nouvelles routes
4. **Frontend :** Mettre à jour le frontend pour utiliser les nouvelles routes
5. **Versioning :** Considérer une version v2 de l'API si les changements sont trop nombreux

## 📝 Notes

- Toutes les routes sous `/api/v1/me` doivent **toujours** nécessiter une authentification
- Les routes `/api/v1/me` opèrent **toujours** sur les données de l'utilisateur connecté (authContext.userId)
- Éviter les routes comme `/api/v1/me/users/:userId` qui contredisent le principe de "me"
- Utiliser des sous-routes logiques : `/me/security`, `/me/devices`, `/me/voice`, `/me/preferences`
