# User Preferences Migration Guide

Migration des routes de préférences utilisateur vers une architecture RESTful unifiée sous `/me/preferences/*`.

## Vue d'ensemble

### Objectifs

1. **Consistance**: Structure RESTful cohérente pour tous les types de préférences
2. **Découplage**: Séparation claire entre routes et logique métier
3. **Maintenabilité**: Code modulaire et testable
4. **Documentation**: OpenAPI schemas complets pour chaque endpoint
5. **Compatibilité**: Migration progressive sans breaking changes

## Mapping des routes

### Notifications

| Ancienne route | Nouvelle route | Méthode | Notes |
|----------------|----------------|---------|-------|
| `GET /user-preferences/notifications` | `GET /me/preferences/notifications` | GET | ✅ Compatible |
| `PUT /user-preferences/notifications` | `PUT /me/preferences/notifications` | PUT | ✅ Compatible |
| `DELETE /user-preferences/notifications` | `DELETE /me/preferences/notifications` | DELETE | ✅ Compatible |
| N/A | `PATCH /me/preferences/notifications` | PATCH | ✨ Nouveau |

**Changements**:
- Ajout de `PATCH` pour updates partiels sémantiques
- Schémas de validation plus stricts
- Réponses normalisées avec `{ success, data }`

### Encryption

| Ancienne route | Nouvelle route | Méthode | Notes |
|----------------|----------------|---------|-------|
| `GET /users/me/encryption-preferences` | `GET /me/preferences/encryption` | GET | ⚠️ Path changé |
| `PUT /users/me/encryption-preferences` | `PUT /me/preferences/encryption` | PUT | ⚠️ Path changé |

**Changements**:
- Path raccourci de `/users/me/` à `/me/`
- Suppression du suffixe redondant `-preferences`
- Structure de réponse unifiée

### Privacy

| Ancienne route | Nouvelle route | Méthode | Notes |
|----------------|----------------|---------|-------|
| `GET /privacy-preferences` | `GET /me/preferences/privacy` | GET | ⚠️ Path changé |
| `PUT /privacy-preferences` | `PUT /me/preferences/privacy` | PUT | ⚠️ Path changé |
| N/A | `PATCH /me/preferences/privacy` | PATCH | ✨ Nouveau |
| N/A | `DELETE /me/preferences/privacy` | DELETE | ✨ Nouveau |

**Changements**:
- Ajout du scope `/me/` pour cohérence
- Ajout de PATCH et DELETE
- Mapping camelCase ↔ kebab-case automatique

### Theme (Nouveau)

| Ancienne route | Nouvelle route | Méthode | Notes |
|----------------|----------------|---------|-------|
| `GET /user-preferences` (partiel) | `GET /me/preferences/theme` | GET | ✨ Extraction |
| `PUT /user-preferences` (partiel) | `PUT /me/preferences/theme` | PUT | ✨ Extraction |
| N/A | `PATCH /me/preferences/theme` | PATCH | ✨ Nouveau |
| N/A | `DELETE /me/preferences/theme` | DELETE | ✨ Nouveau |

**Changements**:
- Extraction des préférences de thème depuis `/user-preferences`
- Endpoint dédié pour thème/apparence
- Support complet CRUD

### Languages (Nouveau)

| Ancienne route | Nouvelle route | Méthode | Notes |
|----------------|----------------|---------|-------|
| Directement sur User model | `GET /me/preferences/languages` | GET | ✨ Nouveau |
| Directement sur User model | `PUT /me/preferences/languages` | PUT | ✨ Nouveau |
| N/A | `PATCH /me/preferences/languages` | PATCH | ✨ Nouveau |

**Changements**:
- Abstraction des champs langue du User model
- API dédiée pour langues système/régionale/traduction
- Gestion `autoTranslate` intégrée

## Stratégie de migration

### Phase 1: Implémentation (✅ Complète)

- [x] Créer structure `/routes/me/preferences/*`
- [x] Implémenter `PreferencesService` avec logique métier
- [x] Créer routes modulaires pour chaque type
- [x] Ajouter schémas de validation OpenAPI
- [x] Tests unitaires et intégration

### Phase 2: Déploiement (En cours)

1. **Déployer les nouvelles routes en parallèle**
   - Les anciennes routes restent fonctionnelles
   - Nouvelles routes disponibles immédiatement
   - Aucune interruption de service

2. **Ajouter warnings de dépréciation**
   ```typescript
   // Dans les anciennes routes
   reply.header('Deprecation', 'true');
   reply.header('Sunset', '2024-06-01');
   reply.header('Link', '</me/preferences/notifications>; rel="alternate"');
   ```

3. **Logger les appels aux anciennes routes**
   ```typescript
   fastify.log.warn({
     deprecatedRoute: '/user-preferences/notifications',
     newRoute: '/me/preferences/notifications',
     userId: authContext.userId
   }, 'Deprecated route accessed');
   ```

### Phase 3: Migration des clients

1. **Applications web**
   - Mettre à jour les appels API vers `/me/preferences/*`
   - Tester en staging
   - Déployer progressivement

2. **Applications mobiles**
   - Mettre à jour SDK/clients API
   - Publier nouvelle version
   - Période de transition (anciennes versions supportées)

3. **Applications tierces**
   - Notifier partenaires
   - Documentation mise à jour
   - Support parallèle 6 mois minimum

### Phase 4: Sunset (Prévu: 2024-06-01)

1. **J-30**: Derniers rappels de migration
2. **J-7**: Dernière chance avant shutdown
3. **J-Day**:
   - Redirection automatique vers nouvelles routes (HTTP 308)
   - Ou retour 410 Gone avec lien vers migration guide

## Compatibilité des payloads

### Notifications - 100% compatible

**Ancien format**:
```json
{
  "pushEnabled": true,
  "emailEnabled": false,
  "dndEnabled": true,
  "dndStartTime": "22:00",
  "dndEndTime": "08:00"
}
```

**Nouveau format**: ✅ Identique

### Encryption - 100% compatible

**Ancien format**:
```json
{
  "encryptionPreference": "optional"
}
```

**Nouveau format**: ✅ Identique

### Privacy - Mapping camelCase

**Ancien format** (si kebab-case):
```json
{
  "show-online-status": true,
  "show-last-seen": false
}
```

**Nouveau format** (camelCase):
```json
{
  "showOnlineStatus": true,
  "showLastSeen": false
}
```

Le service gère automatiquement la conversion bidirectionnelle via `PRIVACY_KEY_MAPPING`.

## Changements breaking potentiels

### 1. Structure de réponse normalisée

**Avant**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Après**: ✅ Identique (pas de breaking change)

### 2. Codes de statut HTTP

Les codes restent identiques:
- 200: Succès
- 400: Validation error
- 401: Non authentifié
- 403: Forbidden (anonymous users)
- 500: Erreur serveur

### 3. Validation plus stricte

**Nouveau**: Les schémas JSON Schema sont plus stricts
- Pattern matching pour DND times: `^([01]\d|2[0-3]):([0-5]\d)$`
- Enums validés côté serveur
- Types forcés (string, boolean, number)

**Impact**: Requêtes malformées rejetées plus tôt (400 au lieu de 500)

## Rollback plan

En cas de problème critique:

1. **Réactivation immédiate des anciennes routes**
   ```typescript
   // Feature flag
   if (config.USE_LEGACY_PREFERENCES_ROUTES) {
     await fastify.register(legacyNotificationRoutes);
     await fastify.register(legacyEncryptionRoutes);
   }
   ```

2. **Redirection vers anciennes routes**
   ```typescript
   fastify.addHook('onRequest', async (request, reply) => {
     if (request.url.startsWith('/me/preferences/')) {
       const legacyPath = migratePath(request.url);
       reply.redirect(308, legacyPath);
     }
   });
   ```

3. **Communication immédiate**
   - Status page: "Migration temporairement annulée"
   - Clients informés via email/Slack
   - Incident post-mortem

## Monitoring et métriques

### Métriques à surveiller

1. **Taux d'adoption**
   ```sql
   SELECT
     DATE(timestamp) as date,
     COUNT(CASE WHEN route LIKE '/me/preferences/%' THEN 1 END) as new_routes,
     COUNT(CASE WHEN route LIKE '/user-preferences/%' OR route LIKE '/privacy-preferences%' THEN 1 END) as old_routes
   FROM api_logs
   GROUP BY DATE(timestamp);
   ```

2. **Erreurs par endpoint**
   ```sql
   SELECT route, status_code, COUNT(*) as error_count
   FROM api_logs
   WHERE status_code >= 400
   GROUP BY route, status_code
   ORDER BY error_count DESC;
   ```

3. **Performance**
   - Latence moyenne par endpoint
   - P95/P99 response times
   - Taux d'erreur (%)

### Alertes

- ❗ Taux d'erreur >5% sur nouveaux endpoints
- ⚠️ Latence >500ms sur P95
- 📊 >10% des requêtes encore sur anciennes routes après J+60

## Checklist de migration (Client)

Pour les équipes frontend/mobile:

- [ ] Identifier tous les appels aux anciennes routes
- [ ] Mettre à jour vers `/me/preferences/*`
- [ ] Tester en environnement de dev
- [ ] Tester en staging
- [ ] Valider les schémas de réponse
- [ ] Gérer les nouveaux codes d'erreur
- [ ] Tester le comportement des defaults
- [ ] Tester les validations (DND, enums)
- [ ] Déployer en production
- [ ] Monitorer les erreurs 24h
- [ ] Confirmer migration complète

## Support

### Documentation

- API Docs: `https://api.meeshy.com/documentation`
- README: `/services/gateway/src/routes/me/preferences/README.md`
- Ce guide: `/services/gateway/MIGRATION_PREFERENCES.md`

### Contact

- Slack: `#api-migration`
- Email: `backend-team@meeshy.com`
- Issues: GitHub repository

## Timeline

| Date | Milestone | Status |
|------|-----------|--------|
| 2024-01-15 | Implémentation complète | ✅ Done |
| 2024-01-20 | Déploiement production | 🔄 En cours |
| 2024-02-01 | Début migration clients | ⏳ Planifié |
| 2024-04-01 | 80% des clients migrés | ⏳ Planifié |
| 2024-06-01 | Sunset anciennes routes | ⏳ Planifié |

## FAQ

### Q: Les anciennes routes vont-elles cesser de fonctionner immédiatement?

**R**: Non. Les anciennes routes resteront fonctionnelles pendant au moins 6 mois. Nous ajouterons des headers de dépréciation et des warnings dans les logs.

### Q: Dois-je migrer tous mes endpoints en même temps?

**R**: Non. Vous pouvez migrer progressivement, endpoint par endpoint. Les nouvelles et anciennes routes coexistent.

### Q: Y a-t-il des breaking changes dans les payloads?

**R**: Non. Les structures de requête/réponse sont 100% compatibles. Seuls les paths changent.

### Q: Que se passe-t-il si j'utilise encore les anciennes routes après la sunset?

**R**: Les anciennes routes retourneront une redirection 308 vers les nouvelles, ou un 410 Gone avec documentation de migration.

### Q: Les performances sont-elles différentes?

**R**: Non, les performances sont identiques voire meilleures grâce à l'optimisation du service layer.

### Q: Comment tester les nouvelles routes?

**R**: Utilisez l'environnement de staging avec les mêmes tokens d'authentification. Toutes les routes sont documentées dans Swagger UI.
