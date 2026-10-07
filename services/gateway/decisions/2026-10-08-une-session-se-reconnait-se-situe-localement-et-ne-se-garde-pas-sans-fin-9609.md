## 2026-10-08 : Une session dit sa version et son moyen de connexion, se situe par une base LOCALE, ne se garde pas sans fin, et l'administration qui la ferme le dit au membre (#9609, #9610, #9613, #9614, #9642, #9643)

Milestone « Chaque session ouverte se reconnaît et se ferme à distance ». Décision porteur du 2026-10-08 : TOUT est affiché dans l'administration ; dans Sécurité > Sessions, l'utilisateur voit toutes les informations disponibles. Règles de conformité tirées de l'analyse `conformite-juridique` du même jour — **une analyse sourcée, pas un avis juridique signé** ; la politique de confidentialité complète reste #9644 (juriste).

### 1. Le contrat de ce qu'un client déclare (#9610)

Site unique : `packages/shared/utils/client-session.ts`.

| en-tête HTTP | champ (`ClientSessionInfo`, et clé de `handshake.auth.client`) | règle |
|---|---|---|
| `X-Meeshy-Version` | `appVersion` | forme de version, ≤ 32 |
| `X-Meeshy-Build` | `appBuild` | idem |
| `X-Meeshy-Platform` | `platform` | `ios` · `web` · `pwa` · `android-shell`, sinon ignorée |
| `X-Meeshy-Device` | `deviceModel` | ≤ 64 |
| `X-Meeshy-OS` | `osVersion` | forme de version |
| `X-Meeshy-Timezone` | `timezone` | forme IANA |
| `X-Device-Locale` | `deviceLocale` | BCP 47 |
| `X-Meeshy-Device-Name` (nouveau) | `deviceName` | nom lisible DÉRIVÉ DU MODÈLE par le client, ≤ 64 |

- **Tous facultatifs.** Caractères de contrôle retirés, valeurs hors forme ignorées. Un client qui n'envoie rien garde ce que le serveur déduit (agent, adresse attestée).
- **La socket** ne peut pas porter ces en-têtes (liste CORS de Socket.IO fermée) : elle remet le même relevé, sous les mêmes noms, dans `handshake.auth.client`.
- **Le moyen de connexion** (`loginMethod`) est posé par le SERVEUR, jamais déclaré : `password`, `two_factor`, `magic_link`, `registration`, `email_verification` ; `oauth` et `anonymous` sont nommés sans producteur (une session anonyme vit sur `Participant`).
- **Relevé à l'ouverture** (`createSession`), puis **tenu à jour** au rafraîchissement (`POST /auth/refresh`) et à la connexion de la socket, sur la session que le `sid` nomme, bornée au compte et vivante, en n'écrivant que ce qui a CHANGÉ et sans jamais effacer ce qu'un ancien client ne déclare pas (`services/auth/session-client-info.ts`).
- `User.lastLoginAt` est posé partout où `lastLoginIp` l'est : c'est l'horloge de sa conservation.
- Aucun index : aucun de ces champs n'est cherché. Seul `UserSession.invalidatedAt` en reçoit un (conservation) — par migration idempotente, jamais `prisma db push`.

### 2. Le lieu se lit dans une base LOCALE (#9609)

- **DB-IP Lite « IP to City »**, format MMDB, **CC-BY 4.0**, lu par `mmdb-lib` (MIT, sans dépendance) derrière l'interface existante `lookupGeoIp`. **ip-api.com est retiré** : aucune adresse ne part chez un tiers, et plus aucun quota (45 requêtes/min, HTTP clair) ne s'épuise de l'extérieur par `/directory/availability` ou le login — ce qui éteignait le critère « pays » de l'alerte de nouvelle connexion.
- **Volume, jamais l'image** : `${GEOIP_HOST_DIR:-/opt/meeshy/geoip}` monté en lecture seule sur `/app/geoip` (production et staging) ; chemin lu : `GEOIP_DATABASE_PATH`, défaut `/app/geoip/dbip-city-lite.mmdb`.
- **Mise à jour mensuelle** : `infrastructure/scripts/geoip-update-dbip.sh` (mois courant, repli sur le précédent ; gzip, taille, marqueur MMDB vérifiés ; remplacement atomique). La passerelle relit la date du fichier au plus une fois par heure et reprend la nouvelle base sans redémarrage ; une base renouvelée mais illisible laisse servir la précédente.
- **Absente, elle ne se dégrade pas en silence** : pays et ville inconnus, aucun appel sortant, une ERREUR au démarrage, et `/health` sert `services.geoip.status` (`loaded` · `missing` · `unreadable` · `unchecked`).
- Adresses privées (IPv4 et IPv6) : `Local`, sans lecture. `::ffff:a.b.c.d` est cherchée sur son IPv4. Adresse mal formée : lieu inconnu.
- **Attribution** « IP Geolocation by DB-IP » (lien https://db-ip.com) servie avec chaque liste de sessions : `data.geolocation` (utilisateur), `meta.geolocation` (administration) — `GEOLOCATION_ATTRIBUTION`, avec `approximate: true` : **la ville se dit approximative**.
- **Plus de latitude ni de longitude** : ni écrites (sessions, jetons de lien magique et de réinitialisation), ni servies, ni passées à la carte tierce de l'e-mail « nouvelle connexion » (qui ne s'affiche donc plus). L'existant s'efface par `packages/shared/prisma/migrations/2026-10-08-session-coordinates-erase.mongodb.js` — **écrite, testée, exécutée nulle part** : en production, feu vert du porteur et sauvegarde vérifiée d'abord.
- Mémoire : la base « ville » pèse de l'ordre de 130 Mo, tenus en mémoire par processus. La base « pays » (≈ 8 Mo) se monte au même chemin si la mémoire l'exige ; la ville sera alors inconnue.

### 3. La conservation (#9614, #9642)

Une passe quotidienne (`jobs/retention-sweep.ts`, ordonnancée par `BackgroundJobsManager`) :

| donnée | durée |
|---|---|
| session close | 90 jours après `invalidatedAt` (à défaut : après sa dernière activité) |
| `SecurityEvent` | 12 mois ; d'un compte purgé, 90 jours après la purge (`AccountDeletionRequest.gracePeriodEndsAt`, statut `GRACE_PERIOD_EXPIRED`/`COMPLETED`) — la plus courte l'emporte |
| `AdminAuditLog` | 12 mois |
| `registrationIp`, `registrationLocation` | `null` 12 mois après l'inscription |
| `lastLoginIp`, `lastLoginLocation` | `null` 12 mois après `lastLoginAt` ; compte antérieur au champ : quand aucune session ne s'est ouverte depuis 12 mois |

**L'interrupteur** : la passe n'écrit que si `RETENTION_PURGE_ENABLED` vaut exactement `true` — posé en staging, `false` par défaut en production. Désarmée, elle COMPTE ce qu'elle effacerait et le journalise (« would purge »). **En production, la première passe armée supprime l'arriéré : feu vert du porteur et sauvegarde vérifiée des collections `UserSession`, `SecurityEvent`, `AdminAuditLog`, `User` avant de poser la variable.**

Non couvert, dit pour qu'on ne le croie pas fermé : `registrationDevice` / `lastLoginDevice` (agents) ne sont pas effacés ; `registrationCountry` est gardé (pays seul, sert l'aiguillage des pays d'arrivée).

### 4. L'export RGPD (#9614)

`GET /me/export` remet chaque session avec : `id`, dates (création, dernière activité, échéance, clôture), motif de clôture en code ET en clair dans la langue de la personne (`sessionClosureReasonText`), appareil, nom d'appareil, système, navigateur, version, build, plateforme, moyen de connexion, adresse, pays, ville, lieu, fuseau, agent. **Jamais** `isCurrentSession` (vraie pour toutes), jeton, empreinte ni coordonnées. Nouvelle section `securityEvents` (sans `metadata` ni empreinte). Le profil porte l'adresse et le lieu d'inscription et de dernière connexion, et `lastLoginAt`.

### 5. L'administration (#9613, #9643)

- `GET /admin/users/:userId/sessions` sert tout ce qui est retenu (version, build, plateforme, nom d'appareil, moyen de connexion, agent, fuseau, adresse, pays, ville) ; les trois routes exigent `canViewSensitiveData` — **BIGBOSS et ADMIN seuls** voient l'adresse et la ville.
- **Chaque lecture** des sessions et des événements de sécurité d'un membre écrit `AdminAuditLog` (`VIEW_USER`, `metadata.surface` = `sessions` / `security-events`, plus la page et les filtres) — patron de `user-profile-reads.ts`.
- **`DELETE /admin/users/:userId/sessions`** ferme tout en un geste : toutes les sessions en base (`admin_revoke`), toutes les sockets, `REVOKE_SESSION` journalisé avec `scope: 'all'`.
- **Le membre est toujours informé, l'administrateur jamais nommé** (`services/auth/team-session-closure.ts`) : le motif socket `admin_revoke` (message « closed by the Meeshy team ») ; un `SecurityEvent` `SESSION_CLOSED_BY_TEAM` / `SESSIONS_CLOSED_BY_TEAM` (« … par l'équipe Meeshy »), sans identifiant, adresse ni agent de l'administrateur ; un e-mail (gabarit d'alerte existant, `sessions_closed_by_team`, six langues, langue de CADRAGE du membre) quand plus aucune session ne vit.
- **Le motif d'une socket coupée est celui du geste** : `disconnectSession` exige désormais `reason` — `user_revoke` (le membre ferme un de ses appareils), `logout`, `password_changed`, `admin_revoke`. Il envoyait `admin_revoke` à tous : un membre qui fermait lui-même un appareil lisait qu'un administrateur l'avait déconnecté. Les clients ne décodent pas `reason` en énumération stricte (vérifié iOS et web) : l'ajout est rétrocompatible.

Constaté, non changé : désactiver un compte coupe ses sockets (`deactivatedUserSessionRevoker`) sans invalider ses sessions en base ; la socket refuse déjà un compte inactif (`AuthHandler`), mais une réactivation rend ces sessions de nouveau valides. À trancher dans une issue à part.

### Ce qu'il faut poser sur les serveurs

1. `install -m 0755 infrastructure/scripts/geoip-update-dbip.sh /usr/local/bin/meeshy-geoip-update`, puis `mkdir -p /opt/meeshy/geoip && /usr/local/bin/meeshy-geoip-update`, puis la ligne cron mensuelle donnée en tête du script.
2. Reporter dans `/opt/meeshy/production/docker-compose.yml` (qui DIVERGE du dépôt) le volume `/opt/meeshy/geoip:/app/geoip:ro` et `RETENTION_PURGE_ENABLED=false` ; recréer la passerelle ; vérifier `curl -s https://gate.meeshy.me/health | jq .services.geoip`.
3. Staging : rejouer `packages/shared/prisma/migrations/2026-10-08-session-retention-indexes.mongodb.js` (à blanc puis pour de vrai).
4. Production, sur feu vert du porteur et après sauvegarde vérifiée : la même migration d'index ; `RETENTION_PURGE_ENABLED=true` ; la migration d'effacement des coordonnées.

Témoins : `__tests__/unit/services/geoip-local-database.test.ts`, `…/services/session-client-info.test.ts`, `socketio/handlers/__tests__/AuthHandler.client-info.test.ts`, `…/routes/auth/magic-link-refresh-legacy-token.test.ts` (rafraîchissement et liste servie), `…/jobs/retention-sweep.test.ts`, `…/routes/me/export-security.test.ts`, `…/routes/admin/user-sessions-team-closure.test.ts`, `socketio/__tests__/disconnectSession.test.ts`, `…/migrations/session-coordinates-erase-migration.test.ts`, `packages/shared/__tests__/client-session.test.ts`.
