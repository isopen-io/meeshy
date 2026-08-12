# Iteration 100 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `cc2633b` (« refactor(android/outbox)… #1478 »), working tree propre. Branche de travail
`claude/brave-archimedes-7br1tb` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

PR ouvertes au démarrage : **#1479** (gateway — idempotence removal post/comment reactions),
**#1477** (shared/gateway/web — normalisation casse langue F63/F64), **#1476** (iOS calls —
CallTypeBadgeView), **#1475** (gateway — AttachmentReactionService race), **#1473** (iOS story text).
**Toutes disjointes** des fichiers de mentions ciblés ici — laissées à leurs sessions.

Le backlog F-series : F51→F58 soldés (it.90→97), F59 (PR #1468 mergée), F62 mergé (`560ef19`),
F63/F64 en cours (PR #1477). Cible retenue ce cycle : **F60** — pré-listé it.98 comme LOW
« unifier les extractMentions (casse + support `-` dans les handles) ». Confirmation live faite ce
cycle : **le bug tiret est product-wide et live-capable** (voir Root cause). Purement TS/testable
(vitest shared + jest gateway/agent/web), disjoint des PR ouvertes.

## Cible : F60 — les usernames à tiret (`@marie-claire`) sont cassés end-to-end dans le système de mentions

### Current state
La validation username autorise le tiret :
`packages/shared/utils/validation.ts` → `/^[a-zA-Z0-9_-]+$/` (register, change-username, common).
Un utilisateur peut donc légitimement s'appeler `marie-claire` ou `jean-marc`.

Mais **toutes** les extractions/rendus de mention utilisent `\w` (= `[A-Za-z0-9_]`, **sans tiret**) :

1. **`packages/shared/utils/mention-parser.ts`** — `parseMentions` (chemin de notification réel) :
   `NAME_CHAR = [\p{L}\p{N}_]` (frontières) + handle regex `@(\w{1,30})`.
2. **`packages/shared/types/mention.ts`** — `extractMentions` `@(\w{1,30})`, `mentionsToLinks`
   `@(\w+)`, `isValidMentionUsername` `/^\w{1,30}$/`, constante `MENTION_CONSTANTS.MENTION_REGEX`.
3. **`services/gateway/src/services/MentionService.ts`** — `MENTION_REGEX = /@(\w+)/g`,
   `USERNAME_VALIDATION_REGEX = /^[a-z0-9_]{1,30}$/` (rejette explicitement le tiret !), et une
   **2e** regex dans `resolveMentionedUsers` (`@(\w{1,30})`, chemin de rendu batch messages/posts/
   feed/stories/reels/status).
4. **`services/gateway/src/middleware/rate-limiter.ts`** — `validateMentionCount` `@(\w+)`.
5. **`apps/web`** — `mention-display.ts` `resolveDisplayContent` `@(\w{1,30})` (rendu),
   `useMentions.ts` autocomplete `@(\w{0,30})$`, et 2 `extractMentions` dupliqués
   (`mentions.service.ts`, `messages.service.ts`) `@(\w+)` **sans lowercase ni dédup**.
6. **`services/agent/src/reactive/interpellation-detector.ts`** — détection d'interpellation d'un
   bot `@(\w+)` + strip mentions `@\w+`.

### Problems identified
- **[LIVE, cœur produit] Notification jamais délivrée** : `@marie-claire` est capturé comme `marie`
  par `parseMentions` → aucun participant `marie` → **marie-claire n'est jamais notifiée**. Un
  utilisateur avec un tiret dans son handle est **inmentionnable**.
- **[LIVE] Rendu cassé** : `resolveMentionedUsers` (messages/posts/feed/stories/reels/status) et
  `resolveDisplayContent` (web) tronquent au tiret → `@marie-claire` reste du texte brut, jamais
  résolu en `MentionedUser`, jamais transformé en lien cliquable / displayName.
- **[LIVE] Validation contradictoire** : la validation username **accepte** le tiret, mais
  `MentionService.USERNAME_VALIDATION_REGEX` le **rejette** → même si la regex capturait le handle,
  il serait filtré comme « invalide ».
- **[LIVE, UX] Autocomplete bloqué** : `useMentions.ts` `@(\w{0,30})$` cesse de matcher dès la
  frappe d'un tiret → impossible d'autocompléter `@marie-cl…`.
- **[LIVE] Bot à tiret inmentionnable** : un agent `@my-bot` n'est jamais interpellé
  (`interpellation-detector` capture `my`).
- **Faux positif de frontière** : `NAME_CHAR` excluant le tiret, un participant `marie` matchait à
  tort dans `@marie-claire` (frontière droite satisfaite par `-`).
- **Drift 4-way + casse (famille F62)** : les 2 `extractMentions` web ne lowercasent pas et ne
  dédupent pas, contrairement au shared/gateway → `@Alice` renvoyait `Alice` (drift de casse).

### Root cause
Aucune source de vérité unique pour « quels caractères composent un handle @username ». Chaque
surface a réimplémenté `\w`, en ignorant que le charset username autorise le tiret. `\w` est le
choix ASCII par défaut réflexe, jamais réconcilié avec la regex de validation username.

### Business impact
Sur un produit dont les mentions déclenchent des notifications push (rétention, engagement), une
classe entière d'utilisateurs (handles à tiret — courant : `prénom-nom`, marques, bots
institutionnels `mairie-paris`) est **silencieusement inmentionnable**. Panne invisible, non
diagnosticable, sur une primitive sociale centrale.

### Technical impact
Le fix introduit une **SSOT** `MENTION_HANDLE_CHARS` (`\w-`) dans `mention-parser.ts`, réutilisée
partout où c'est possible (shared, gateway), + alignement explicite des regex locales
(web/agent/rate-limiter) avec un commentaire renvoyant à la SSOT. Le tiret devient un caractère de
nom (`NAME_CHAR`), ce qui corrige **aussi** le faux positif de frontière. Aucune migration : répare
le comportement pour les données déjà stockées.

### Risk assessment
Faible. Ajouter le tiret au charset est **strictement plus cohérent** avec le charset username et
displayName (`Ann-Marie` autorisé aux deux). Seul changement de comportement notable : `@user-mot`
où `user` seul est participant n'est plus résolu comme `user` (capture gloutonne `user-mot`) — c'est
**plus correct** (`@user-mot` n'est pas `@user`). Aucune signature/contrat public modifié (la
constante `MENTION_CONSTANTS.MENTION_REGEX` reste typée `RegExp`, zéro consommateur interne).

### Proposed improvements
1. `mention-parser.ts` : `export const MENTION_HANDLE_CHARS = '\\w-'` ; `NAME_CHAR` inclut `-` ;
   handle regex `@([\w-]{1,30})`.
2. `types/mention.ts` : `extractMentions`, `mentionsToLinks`, `isValidMentionUsername`,
   `MENTION_CONSTANTS.MENTION_REGEX` réutilisent `MENTION_HANDLE_CHARS`.
3. gateway `MentionService` : `MENTION_REGEX` + `resolveMentionedUsers` via `MENTION_HANDLE_CHARS` ;
   `USERNAME_VALIDATION_REGEX = /^[a-z0-9_-]{1,30}$/`.
4. gateway `rate-limiter.validateMentionCount` : `@([\w-]+)`.
5. web : `mention-display.ts` via `MENTION_HANDLE_CHARS` ; `useMentions.ts` autocomplete `[\w-]` ;
   les 2 `extractMentions` **délèguent** au shared `extractMentions` (SSOT + fix casse/dédup).
6. agent `interpellation-detector` : détection + strip via `[\w-]`.

### Expected benefits
- Les usernames à tiret sont mentionnables, notifiés, résolus et rendus partout (messages, posts,
  feed, stories, reels, status, web display, autocomplete, bots).
- Suppression du faux positif de frontière `@marie` dans `@marie-claire`.
- Parité casse/dédup entre les 4 `extractMentions` (les 2 web délèguent désormais à la SSOT).
- Une seule source de vérité `MENTION_HANDLE_CHARS` — zéro drift futur.

### Implementation complexity
Faible-moyenne (13 fichiers, changements localisés de regex + 2 délégations web). Aucune migration.

### Validation criteria
- [x] Tests RED d'abord : `parseMentions('@marie-claire', hyphenParticipants)` attendu `['h1']`,
      observé `['marie'→non résolu]` ; `extractMentions('@marie-claire')` attendu `['marie-claire']` ;
      `mentionsToLinks`/`isValidMentionUsername` tiret ; gateway `@john-doe`→`john-doe` ; agent bot
      `@marie-claire`→`bot-mc`.
- [x] GREEN : shared vitest **1282/1282** ; gateway MentionService 99, mention routes 152,
      MessageHandler/posts-feed/messages-routes 350, rate-limiter-pure 45, MessageProcessor/
      MessageHandler suites 504 ; agent interpellation 7 ; web mentions.service+useMentions+
      BubbleMessage 72.
- [x] `bun run build` shared (tsc) : 0 erreur ; `MENTION_HANDLE_CHARS` exporté dans dist.
- [x] La seule suite en échec (`MessagingService.test`) échoue à l'**import** de
      `SequenceService.ts` (`@prisma/client` stub non généré) — pré-existant, reproduit sur `main`,
      hors diff.

## Candidats écartés ce cycle (documentés)
- **iOS/Android mention parsing** : hors périmètre de validation (pas de toolchain Swift/Kotlin dans
  l'environnement) ; à traiter dans une itération iOS/Android dédiée si divergence confirmée (F60b).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW, neuf) : auditer/aligner le parsing de mention iOS (`MeeshySDK`) + Android sur le
  charset `MENTION_HANDLE_CHARS` (tiret), si drift confirmé — validation toolchain-native requise.
