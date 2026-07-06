# Iteration 114 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `2c1e37223` (post-merge PR #1528 — F82 admin rankings), working tree propre. Branche de
travail `claude/brave-archimedes-fru31a` recréée depuis `origin/main`.

Note numérotation : les docs d'itération sur `main` vont jusqu'à **113** (sessions parallèles) → ce
cycle prend **114**.

### Revue d'ingénierie (constat de démarrage)
Le candidat reporté **F83** (`AffiliateTrackingService.getAffiliateStats` — filtre `tokenId` ignoré par
le `groupBy` de ventilation) a été **vérifié déjà corrigé sur `main`** (le `groupBy` utilise désormais
`where: whereClause`, commentaire décrivant exactement le mode de défaillance). Aucun doublon produit.

Balayage ciblé (agent d'exploration) d'une couche **peu explorée** : hooks/stores web, service
translator Python, services posts/feed gateway. Trois candidats remontés :

1. **F84 — Pagination « load more » cassée pour les chats anonymes (lien partagé)** — RETENU
   (déterministe, classe d'utilisateurs entière, cœur produit « shared-link chat »).
2. **F85 — `Synthesizer._segment_text` (translator) perd une phrase courte** en tête/milieu quand elle
   précède une phrase > ~949 car. — écarté ce cycle (sous-système Python distinct ; PR ciblée séparée).
   Reporté (§ futur).
3. **F86 — `use-message-translations.ts` : dedup peut remplacer une traduction plus récente par une
   « premium » plus ancienne** — écarté : heuristique, déclencheur atypique (premium plus ancien que
   basic), intention produit à confirmer. Reporté (§ futur).

## Cible : F84 — Le « load more » anonyme recharge la page 1 en boucle (doublons + historique inaccessible)

### Current state
`apps/web/hooks/queries/use-conversation-messages-rq.ts` — `useConversationMessagesRQ` alimente la liste
de messages via `useInfiniteQuery`. Deux stratégies de pagination cohabitent sur **un seul** canal
`pageParam` :
- **authentifié** (pas de `linkId`) : cursor-based — `conversationsService.getMessages(…, cursor)` et
  `nextCursor` renvoyé ; fallback = ID du dernier message (chaîne acceptée comme paramètre `before`) ;
- **anonyme** (`linkId` présent) : offset-based — `AnonymousChatService.loadMessages(limit, offset)`,
  `offset = (page - 1) * limit`, **aucun `nextCursor` renvoyé**.

`getNextPageParam` (avant correctif) :
```ts
getNextPageParam: (lastPage) => {
  if (!lastPage.hasMore) return undefined;
  if (lastPage.nextCursor) return lastPage.nextCursor;       // jamais défini en anonyme
  const lastMessage = lastPage.messages[lastPage.messages.length - 1];
  if (lastMessage?.id) return lastMessage.id;                // ← renvoie une STRING (ObjectId)
  return undefined;
},
```
`fetchMessagesFromService` (branche anonyme) : `const page = typeof pageParam === 'number' ? pageParam : 1;`

### Problems identified
- **[LIVE] Boucle sur la page 1 pour tout participant anonyme.** Trace (`limit=20`, 45 messages) :
  1. Page 1 : `pageParam=1` → `offset=0` → messages 1–20, `hasMore=true`, **pas de `nextCursor`**.
  2. `getNextPageParam` : pas de `nextCursor` → renvoie `lastMessage.id` (**string ObjectId**).
  3. `loadMore()` → `fetchNextPage()` avec `pageParam="6712…"`.
  4. Branche anonyme : `typeof "6712…" === 'number' ? … : 1` → **`page=1`** → `offset=0` → **re-charge
     1–20**.
  5. `messages` = `data.pages.flatMap(...)` **sans dédup** → 1–20 en **double**, 21–45 **jamais
     atteignables**.
- Chaque « load more » répète l'étape 4. Le chemin authentifié est intact (il renvoie `nextCursor`, et
  son fallback string est consommé comme cursor).

### Root cause
Le fallback `lastMessage.id` (chaîne) n'est valide que pour la pagination **cursor** (authentifié). La
branche **offset** (anonyme) le retransforme silencieusement en page 1. Un seul `getNextPageParam`
servait deux stratégies incompatibles sans distinguer le mode, alors que `fetchMessagesFromService`, lui,
branche déjà sur `linkId`.

### Business impact
Le **chat par lien partagé** (fonctionnalité cœur pour les invités anonymes, sans compte) est cassé au
défilement : impossible de remonter l'historique au-delà des 20 derniers messages, et doublons visibles
dès le 1er « load more ». Régression d'expérience directe sur une surface d'acquisition (invités).

### Technical impact
Correctif purement local : brancher `getNextPageParam` sur `linkId` (miroir de
`fetchMessagesFromService`). En mode anonyme, avancer par **index de page** via le 2ᵉ argument
`allPages` : `return allPages.length + 1` → `fetchMessagesFromService` calcule `offset = page * limit`.
Les pages deviennent disjointes (plus de doublons, historique complet accessible). Aucun changement de
signature ni d'API.

### Risk assessment
Très faible. Le chemin authentifié est **inchangé** (branche `linkId` prise en premier, sans effet sur
le cas non-anonyme). Le mode anonyme passe d'une boucle cassée à un offset croissant correct — strict
progrès. Couvert par un test neuf ; les 18 tests existants restent verts.

### Proposed improvements (implémenté ce cycle)
- `getNextPageParam: (lastPage, allPages) => { … if (linkId) return allPages.length + 1; … }` +
  commentaire du *pourquoi* (offset vs cursor, boucle page 1).

### Validation criteria
- [x] `use-conversation-messages-rq.test.tsx` **19/19** (18 existants + 1 neuf : « anonymous loadMore
      advances the offset » — 1ᵉʳ appel `(20,0)`, 2ᵉ appel `(20,20)` et pas `(20,0)` ; 3 messages
      distincts, sans doublon). RED implicite : avant correctif le 2ᵉ appel serait `(20,0)`.

## Backlog reporté (§ futur)
- **F85** (MEDIUM, translator) : `Synthesizer._segment_text` (`services/translator/src/services/tts/
  synthesizer.py`) — une phrase < `MIN_SEGMENT_CHARS` (50) suivie d'une phrase > ~949 car. est écrasée
  (`current_segment = sentence`) sans être sauvegardée → mots absents de l'audio TTS. Non couvert.
  PR ciblée séparée (Python + test dédié sur `_segment_text`).
- **F86** (LOW) : `use-message-translations.ts` `processMessageWithTranslations` — la branche
  `translationModel === 'premium' && confidence < 0.95` ignore le timestamp → une premium plus ancienne
  peut écraser une basic plus récente. Heuristique, intention produit à confirmer.
- Antérieurs : F69, F74, F75, F78, F80, F81, F82b toujours reportés.
