# Iteration 124 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `4bae94c6`, working tree propre. Branche `claude/brave-archimedes-oxbgmm` (re)créée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **122** ; la PR ouverte #1602 revendique `iter-123` →
ce cycle prend **124** pour éviter toute collision.

PR ouvertes au démarrage (cible retenue **strictement disjointe**) : calls (#1610, #1606, #1601, #1597),
realtime notification:new (#1596, #1588, #1585), sanitizer prototype-pollution (#1605, #1598),
NLLB/translator (#1602, #1593), gateway read-status (#1608), iOS modernization (#1609),
shared time-remaining (#1590), message:new re-broadcast (#1592), + bumps dependabot.

## Revue d'ingénierie (constat de démarrage)
Le socle gateway/shared TypeScript est extrêmement mature (122 itérations de polissage) : revue
adversariale ciblée des helpers purs (`relative-time`, `duration-format`, `presence-visibility`,
`participant-helpers`, `sender-identity`, `language-normalize`, `call-summary`, `notification-strings`,
`mention-parser`) — tous les edge cases classiques (rollover MM:SS/H:MM:SS, cutover décimal KB/MB/GB,
frontières Unicode de mention, réduction ISO 639-3, DST) sont déjà traités et commentés.

Le déséquilibre de maturité est côté **web** (`apps/web`) : la logique de résolution de langue y a été
partiellement dupliquée/désynchronisée par rapport aux utils canoniques. Deux écarts concrets, tous deux
dans **le même hook** `hooks/use-message-translations.ts`, tous deux sur la correction du **Prisme
Linguistique** — donc cohésifs et strictement disjoints des PR ouvertes.

## Cible : `use-message-translations.ts` — cache de traduction insensible à la langue préférée + duplicat divergent de `getUserLanguagePreferences`

### Current state
1. **Clé de cache sans la langue préférée.** `processMessageWithTranslations` calculait sa clé LRU :
   ```ts
   const cacheKey = `${message.id}:${(message.translations || []).length}:${message.updatedAt}`;
   ```
   La valeur mise en cache (`displayContent`, `isTranslated`, `translatedFrom`) est pourtant calculée à
   partir de `resolveUserPreferredLanguage()` — **absente de la clé**. Le `processedCacheRef` est un
   `useRef(new LRUCache(500))` : il **survit** à la recréation du callback quand `currentUser` change.

2. **Duplicat divergent de `getUserLanguagePreferences`.** Une copie locale (lignes 72-92) réécrivait la
   logique de l'util canonique `utils/user-language-preferences.ts` — mais **sans lowercase** et en
   ajoutant **inconditionnellement** `currentUser.systemLanguage` (potentiellement `undefined`/`''`).

### Problems / Root cause
1. Après un basculement de langue (changement de `systemLanguage`, ou switch de langue de message),
   la clé reste **identique** (même `message.id` / `translations.length` / `updatedAt`) → **cache hit**
   renvoyant le `displayContent` figé dans **l'ancienne langue**. La correction ne survient qu'au
   prochain `updatedAt` du message ou à un remount du composant. C'est une **violation directe** du
   Prisme Linguistique (« l'utilisateur consomme tout le contenu dans sa langue principale »).

2. `systemLanguage='EN'` (casse mixte d'un ancien client) → `getRequiredTranslations` appelle
   `shouldRequestTranslation(message, 'EN')` ; `message.originalLanguage ('en') === 'EN'` est `false`
   et `translations.find(t => t.language === 'EN')` **rate** l'entrée `'en'` déjà présente → **demande
   de traduction redondante** pour une langue déjà disponible. Avec un `systemLanguage` vide, la demande
   porte sur `undefined`.

### Business / Technical impact
1. **HIGH, user-visible, déterministe** : le contenu reste dans la mauvaise langue après un switch —
   pile le comportement que le hook est censé garantir. Surface : toute liste de messages web après
   changement de préférence de langue.
2. **MEDIUM** : appels de traduction inutiles (bande passante translator + latence) + piège de
   maintenance (un util corrigé existe déjà, la copie diverge silencieusement).

### Risk assessment
Très faible. (1) N'ajoute qu'une dimension à la clé : même utilisateur + même langue → même clé (aucune
régression de hit-rate intra-langue) ; seul un changement de langue force le recalcul, ce qui est
exactement le correctif. (2) L'util canonique renvoie des résultats **identiques** pour tous les codes
lowercase (couverts par la suite existante) ; il ne corrige que les cas casse-mixte / `undefined`.

### Proposed improvements (implémenté ce cycle)
1. Calculer `preferredLanguage` **avant** la clé et l'y intégrer :
   `` `${message.id}:${len}:${message.updatedAt}:${preferredLanguage}` `` (et réutiliser cette valeur
   plus bas, supprimant l'appel dupliqué).
2. Remplacer la copie locale par une délégation à `getUserLanguagePreferences(currentUser)` (SSOT).

### Validation criteria
- [x] `__tests__/hooks/use-message-translations.test.tsx` : **43/43** (5 nouveaux cas).
- [x] RED confirmé : sans la langue dans la clé, le test « re-resolve après switch » échoue
      (`Bonjour le monde` au lieu de `Hola mundo`) ; GREEN avec le correctif.
- [x] Nouveaux cas `getUserLanguagePreferences` : lowercase `EN/FR` → `['en','fr']` ; `systemLanguage`
      absent → pas d'entrée junk ; pas de demande redondante pour une langue casse-mixte déjà présente.
- [x] `tsc --noEmit` : aucune erreur sur le fichier modifié.
- ⚠️ `next lint` / `eslint` : crash de config pré-existant (circular structure `@eslint/eslintrc`) dans
      cet environnement, reproductible quel que soit le fichier — indépendant du correctif.

### Leçon (à retenir)
Un cache mémoïsé dont la **valeur** dépend d'un paramètre externe (ici la langue résolue de
`currentUser`) DOIT inclure ce paramètre dans sa **clé** — sinon un `useRef` qui survit aux changements
de props sert du contenu périmé sans jamais lever d'erreur. Corollaire SSOT : ne jamais réécrire
localement une résolution de langue déjà centralisée (`utils/user-language-preferences.ts`) ; le
duplicat dérive (casse, guards) et casse le Prisme en silence.

## Future improvements (backlog, non traité ce cycle)
- **F89 (HIGH, sécurité/autorisation)** : les participants **anonymes** contournent la garde
  d'appartenance à la conversation. `socketio/utils/participant-resolver.ts` (branche anonyme) et
  `handlers/LocationHandler._resolveParticipantId` renvoient le `participantId` de connexion **sans
  vérifier** qu'il appartient au `conversationId` de la requête (le chemin *registered* le fait via
  `prisma.participant.findFirst({ userId, conversationId, isActive })`). Un socket anonyme authentifié
  pour la conversation A peut alors émettre `location:*` / `typing:*` avec `conversationId=B` et injecter
  des événements dans une room dont il n'est pas membre. Fix : scoper la branche anonyme au
  `conversationId` normalisé. ⚠️ Zone à forte densité de PR realtime ouvertes — traiter en cycle dédié.
- **F90 (MEDIUM)** : `routes/conversations/messages.ts` recherche translation-body sur un préfixe fixe
  `take: 200` filtré en mémoire → peut **omettre** des matches plus anciens et **terminer la pagination
  trop tôt** (page vide → le client s'arrête). Fix : paginer le flux translation par keyset comme le
  flux content (ou pousser le filtre en DB).
- **F91 (LOW, UX)** : `StatusHandler.drainActiveTypingState` lit l'identité typing sous `user:${userId}`
  alors que `_resolveTypingIdentity` stocke les anonymes sous `anon:${participantId}` → pas de
  `typing:stop` au disconnect d'un anonyme (indicateur figé ~15 s côté pair). Fix : lookup des deux clés.
- **F87/F88** (iter 122) : traités/en cours via PR #1605 (sanitizeMongoQuery) ; F88 (truncateFilename
  off-by-one `maxLength<4`) reste un clamp purement défensif non atteint par les call sites.
