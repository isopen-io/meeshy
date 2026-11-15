## 2026-10-22: La plateforme `android` (application native) s'ajoute au contexte v2 de `POST /social/events` (lot analytics-contract-platform-android, #11721, directive #11570)

**Statut** : Accepté.

**Contexte** : la passerelle lit `platform: enumOrDrop(CLIENT_PLATFORMS)` dans `SocialEventsContextSchema` (`services/gateway/src/routes/social/eventsV2Schemas.ts`). Une valeur inconnue n'est pas refusée (aucun 400) : elle est RETIRÉE en silence. Sans ce lot, chaque mesure émise par l'application Android native perdrait son attribution de plateforme.

**Décision** :
- `CLIENT_PLATFORMS` (`packages/shared/types/social-events-v2.ts`) reçoit la valeur additive `android`, en fin de liste. `ios`, `web`, `android_shell` et `pwa` restent acceptées ; une valeur inconnue (ex. `symbian`) reste retirée sans 400 (`enumOrDrop` inchangé).
- Aucune migration Prisma, `SOCIAL_EVENTS_SCHEMA_VERSION` reste 2.
- Rétrocompatibilité : une passerelle antérieure encore en production ne connaît pas `android` ; elle retire la clé `platform` et accepte le lot. iOS et web ne sont pas touchés.
- Le miroir Kotlin arrive avec le lot `analytics-v2-context-sampling`.

**Deux énumérations jumelles, NON unifiées dans ce lot** :
1. `CLIENT_PLATFORMS` de `packages/shared/types/social-events-v2.ts` : `ios`, `web`, `android_shell` (underscore), `pwa`, et désormais `android`. C'est la seule qui reçoit `android` ici.
2. `CLIENT_PLATFORMS` de `packages/shared/utils/client-session.ts` : `ios`, `web`, `pwa`, `android-shell` (tiret), lue depuis l'en-tête `X-Meeshy-Platform` (sessions). Elle ne change pas : l'Android natif n'envoie pas encore cet en-tête.

Les deux listes ont des orthographes et des rôles différents (contexte d'événement vs en-tête de session) ; les unifier est INTERDIT dans ce lot et relève d'une décision séparée, qui devra gérer les valeurs déjà persistées.

**Alternatives rejetées** : réutiliser `android_shell` pour le natif (fausse l'attribution) ; relever `SOCIAL_EVENTS_SCHEMA_VERSION` (inutile, changement additif).
