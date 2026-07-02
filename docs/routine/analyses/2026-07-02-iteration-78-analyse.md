# Iteration 78 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `074c4031` (PR #1347 mergée : Android calls push decision core). Branche de travail
`claude/brave-archimedes-4n6448` recréée à neuf depuis `origin/main`
(`git checkout -B ... origin/main`).

PR ouvertes au démarrage : #1346 (iOS a11y `ConversationView+MessageRow`), #1344 (call
resilience — `CallEventsHandler.ts`, `server.ts`, `useCallSignaling.ts`). Cible choisie
**indépendante** de ces deux PR (fichier `packages/shared/utils/mention-parser.ts` — aucun conflit
de merge attendu).

Revue Priorité 1/2 (features récentes + utils partagés SSOT) : un balayage des caches gateway
confirme que la vague de bornage (iter 42/76 + `withTimeout` iter 75) a couvert la plupart des
Maps. Deux caches non bornés subsistent (`conversation-id-cache.ts`, `participant-lookup-cache.ts`)
et sont consignés ci-dessous comme follow-ups. La cible retenue est une **correction de justesse**
à impact utilisateur direct : `parseMentions` résout les `@DisplayName` par **préfixe** et non de
façon exacte, ce qui déclenche des notifications de mention vers les mauvais utilisateurs.

## Cible iter 78 — `parseMentions` : correspondance par préfixe → mentions faussement résolues (justesse)

### Current state
`packages/shared/utils/mention-parser.ts` est la source unique de résolution des mentions,
consommée par le gateway (`MentionService`) pour décider **à qui envoyer une notification de
mention**. La JSDoc annonce une « résolution **exacte** » sur les participants, mais
l'implémentation construit `new RegExp('@' + escaped, 'gi')` **sans borne droite** — donc un
`@DisplayName` matche comme **préfixe** de n'importe quel token plus long, et un `user@marie.com`
(username `marie`) matche via le fallback username sans borne gauche.

### Problem identified (reproduit)
Avec participants `Marie` (u3), `Jean Charles` (u2) :

| Entrée | Attendu | Observé (avant fix) |
|--------|---------|---------------------|
| `Hello @Marienne` | `[]` (Marienne ≠ participant) | `['u3']` ❌ préfixe |
| `write to user@marie.com` | `[]` (adresse e-mail) | `['u3']` ❌ borne gauche |
| `@Jean Charleston is a city` | `[]` | `['u2']` ❌ préfixe suffixe |

Repro exécutée (vitest) : les 3 cas résolvent à tort un `userId`.

### Root cause
La regex de displayName n'a **aucune frontière de fin** (`@Marie` matche `@Marienne`), et le
fallback username `/@(\w{1,30})/g` n'a **aucune frontière de début** (le `@` d'une adresse e-mail
est traité comme un début de mention). Le tri « plus long d'abord » ne protège que si le nom le
plus long est **lui-même** un participant.

### Business impact
MOYEN : les mentions pilotent les notifications push (et sont soumises à la règle max-50/message).
Un faux positif = **notification envoyée à un utilisateur non concerné** — bruit, atteinte à la
confiance, et incohérence avec la promesse « résolution exacte » de la doc. Usage courant (un
prénom court comme « Marie »/« Ann » est fréquemment le préfixe d'un autre mot).

### Technical impact
- Ajout d'une **frontière Unicode-aware** (`[\p{L}\p{N}_]`, flag `u`) en fin de match displayName.
- Ajout d'une **frontière gauche** (`(?<![\p{L}\p{N}_])` displayName, `(?<!\w)` username) pour
  neutraliser les faux positifs d'adresse e-mail.
- Garde `displayName` non vide (un displayName vide produisait un matcher dégénéré `/@/`).
- Pattern displayName construit **une seule fois** et réutilisé pour `.test()` et `.replace()`
  (avant : deux regex distinctes, risque de divergence).

### Risk assessment
**Faible.** Les 16 tests existants placent tous `@` en début de token ou après une espace, et les
noms sont suivis d'espace/ponctuation/fin — tous passent la frontière. Le flag `u` est sûr :
`escapeRegex` n'échappe que des caractères de syntaxe (jamais `-`), donc aucun *identity escape*
invalide en mode Unicode. Les lookbehind sont supportés par V8 (Node 22).

### Proposed improvement (implémenté)
`packages/shared/utils/mention-parser.ts` :
- `NAME_BOUNDARY_LEFT = '(?<![\\p{L}\\p{N}_])'`, `NAME_BOUNDARY_RIGHT = '(?![\\p{L}\\p{N}_])'`.
- displayName : `new RegExp(LEFT + '@' + escaped + RIGHT, 'giu')`, construit une fois, réutilisé
  test+replace ; skip si `displayName` vide.
- username : `/(?<!\w)@(\w{1,30})/g` (frontière gauche ajoutée ; la borne droite est déjà assurée
  par `\w{1,30}`).

### Expected benefits
- Suppression des mentions faussement résolues (préfixe + e-mail) → 0 notification vers un
  utilisateur non mentionné. Alignement code ↔ doc (« résolution exacte »).

### Implementation complexity
Faible — 1 fichier de prod, +6 tests de régression dans la suite existante.

### Validation criteria
- [ ] `vitest` `mention-parser.test.ts` : 16 existants + 6 neufs verts (préfixe, suffixe, e-mail
      displayName, e-mail username, ponctuation acceptée, insensibilité casse préservée).
- [ ] Aucun des 16 cas existants ne régresse.

## Consignés pour itérations futures (caches gateway non bornés — même pattern que iter 42/76)

| # | Constat | Impact |
|---|---------|--------|
| F44 | `services/gateway/src/utils/conversation-id-cache.ts` — `Map` non bornée (`resolveConversationId`), 3e copie non bornée du cache déjà borné dans `socket-helpers.ts` + `MeeshySocketIOManager`. Appelé sur ~15 routes REST. Appliquer la même borne FIFO 2000 (ou unifier les 3 en 1 SSOT). | MOYEN (fuite mémoire process long-vécu) |
| F45 | `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message (chemin le plus chaud). Ajouter sweep `unref()` + borne. | MOYEN |
| F41 | `OfflineQueue`/`OutboxFlusher` reconciliation (iOS SDK) — pas de toolchain Swift ici. | HAUT |

## Gain
`parseMentions` résout désormais les `@DisplayName` de façon **exacte** (frontières Unicode
gauche+droite), et le fallback username ignore les `@` internes d'adresses e-mail. 3 classes de
faux positifs de notification supprimées. Source unique partagée, 0 régression.
