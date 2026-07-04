# Iteration 97 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `f4eaeea` (« chore(ios): bump build version to 1218 » — HEAD au démarrage, working tree
propre). Branche de travail `claude/brave-archimedes-gq4ib2` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

PR ouvertes au démarrage :
- **#1467** (gateway — `AuthHandler.ts` presence race, `apps`/socketio auth).
- **#1464** (shared — `mention-parser.ts` F61 Unicode boundary).
- **#1463** (iOS — calls STUN/TURN fallback).

Toutes disjointes du fichier ciblé ici (`services/gateway/src/services/notifications/NotificationService.ts`
+ son test). Cible retenue : **F59** (parké it.95→96, LOW) — divergence de gating de préférence
entre la notif de réaction-commentaire côté socket (`comment_reaction`) et côté REST
(`comment_like`), vérifiable en jest.

## Cible : F59 — `comment_reaction` (socket) contourne la préférence `commentLikeEnabled`

### Current state
Réagir à un commentaire avec un emoji est **un seul geste produit**, mais il emprunte deux
transports qui produisent deux notifications de types distincts :

1. **Socket** `comment:reaction-add` → `CommentReactionHandler._createCommentReactionNotification`
   → `NotificationService.createCommentReactionNotification` → type **`comment_reaction`**
   (body verbeux `reaction.commentVerbose`, conscient du `postType`, subtitle = extrait du
   commentaire).
2. **REST** `POST /posts/:postId/comments/:commentId/like` → `createCommentLikeNotification`
   → type **`comment_like`** (body `reaction.comment`, subtitle + vignette du post).

Les deux passent par `createNotification` → `shouldCreateNotification` → **`isTypeEnabled`**, qui
mappe chaque `NotificationType` vers son champ booléen de préférence utilisateur. Or :

- `comment_like` → `case 'comment_like': return prefs.commentLikeEnabled ?? true;` (gardé).
- `comment_reaction` → **absent du `switch`** → retombe sur `default: return true;`.

### Problems identified
- **Contournement de l'opt-out utilisateur** : un destinataire qui a coupé les notifications de
  like/réaction-commentaire (`commentLikeEnabled = false`) ne reçoit plus rien par le chemin REST,
  mais **continue de recevoir** la notif de réaction-commentaire par le chemin socket — le type
  `comment_reaction` ignore silencieusement la préférence.
- **Asymétrie de transport** : deux chemins pour le même geste social honorent des règles de
  gating différentes selon que le client a émis en socket ou en REST.

### Root cause
Quand le chemin socket verbeux (`comment_reaction`) a été introduit à côté du legacy REST
(`comment_like`), la nouvelle clé d'énumération n'a pas été ajoutée au `switch` de `isTypeEnabled`.
Le `default: return true` (destiné aux types système/toujours-actifs) a alors happé un type qui
DEVAIT être gouverné par une préférence utilisateur existante — pas de source unique
« quelle préférence gouverne une réaction sur un commentaire ».

### Business impact
La préférence de notification est un contrat de confiance direct : un utilisateur qui coupe un
canal s'attend à ne plus en être dérangé, quel que soit le chemin technique. Recevoir des
réactions-commentaire après les avoir désactivées est une fuite de notification perçue comme un
bug de respect des réglages — surface sensible (RGPD/consentement produit) et source de
désabonnement push.

### Technical impact
- **gateway** `NotificationService.isTypeEnabled` : `comment_reaction` rejoint `comment_like` sur
  `return prefs.commentLikeEnabled ?? true;`. Une seule ligne, aucun nouveau champ de préférence
  (le toggle « like de commentaire » gouverne désormais les deux transports du même geste).
- Zéro changement de schéma, de type public, de body, ou de client : le fix ne fait que **router
  le gating existant** vers le type socket. Rétro-compat parfaite (défaut `?? true` inchangé pour
  qui n'a jamais touché la préférence).

### Risk assessment
FAIBLE. Le changement **restreint** l'émission uniquement quand l'utilisateur a explicitement mis
`commentLikeEnabled = false` — comportement déjà attendu et déjà appliqué au sibling REST. Aucun
utilisateur au défaut (`?? true`) n'est affecté. Pas de migration, pas d'API retirée.

### Proposed improvements
1. Ajouter `case 'comment_reaction':` au `switch` d'`isTypeEnabled`, mutualisé avec `comment_like`
   sur `commentLikeEnabled`.
2. Tests gateway : `createCommentReactionNotification` respecte `commentLikeEnabled:false` (aucune
   notif) et émet quand la préférence est active.

### Expected benefits
- L'opt-out `commentLikeEnabled` gouverne les DEUX transports du geste « réaction sur commentaire ».
- Symétrie de gating socket/REST pour un même geste social.

### Implementation complexity
FAIBLE — 1 ligne gateway + 2 tests neufs (RED confirmé : sans le fix, la notif part malgré
`commentLikeEnabled:false`).

### Validation criteria
- [x] `createCommentReactionNotification` avec `commentLikeEnabled:false` → 0 notif émise,
      `prisma.notification.create` non appelé.
- [x] Idem avec `commentLikeEnabled:true` → notif `comment_reaction` émise (payload défini).
- [x] RED prouvé : sans le fix, le test `false` échoue (notif créée).
- [x] Suites `SocialNotificationPrecision` 19/19 + `NotificationService*` / `CommentReaction*` /
      `reactionNotify` → 516 verts, 0 régression.
- [x] `tsc --noEmit` gateway 0 erreur (après `packages/shared` build + `prisma generate`).

## Candidats écartés ce cycle (documentés)
- **Unifier `comment_reaction` et `comment_like` en un seul type de notif** : les deux bodies
  (verbeux typé vs terse) et surfaces de décodage client (iOS route/affiche selon le type)
  divergent ; fusionner forcerait un changement de contrat client à haut risque pour un gain
  marginal. Le geste partage désormais la **préférence** — la divergence de wording/type reste
  intentionnelle jusqu'à une spec produit explicite.
- **Autres types tombant sur `default:true`** (`message_edited`, `friend_new_story`,
  `friend_new_post`, `friend_new_mood`) : aucun champ de préférence évident ne leur correspond ;
  les gater exigerait une décision produit + un nouveau champ de schéma — hors périmètre de ce
  cycle. `comment_reaction` était le seul cas avec une préférence existante non câblée.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme
  `NotificationServiceExtensions`).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed` (non-heart) comme le chemin `post:liked/unliked`.
- **Gating des `friend_new_*` / `message_edited`** : décision produit + champ de préférence à
  créer si l'on veut les rendre opt-out.

## Backlog nettoyé
- **F59 (LOW)** : soldé ce cycle — `comment_reaction` gaté sur `commentLikeEnabled`.
`main` @ `3b06d9f5` (« feat(android/contacts): friends Room cache for cold-start paint (#1461) » —
HEAD au démarrage, working tree propre après `git reset --hard origin/main`). Branche de travail
`claude/brave-archimedes-spgzbe` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

> **Renumérotation 96 → 97** : ce cycle avait initialement pris le n° 96, mais une itération
> parallèle (PR #1465, F58) a mergé ses propres `docs/routine/{analyses,plans}/…-iteration-96-*`
> sur `main` pendant le rebase. Pour ne pas écraser leur travail, ce document est renuméroté **97**.
> Leçon transverse (déjà notée par #1465) : vérifier `origin/main` juste avant de statuer un numéro
> d'itération ou un item de backlog — un cycle parallèle peut l'avoir consommé.

PR ouvertes au démarrage : **#1462** (gateway — TOCTOU race sur l'édition de message ;
`services/gateway/src/socketio/handlers/MessageHandler.ts` + `routes/messages.ts`, session tierce
en cours, CI pending). **Disjointe** des fichiers `packages/shared` ciblés ici — laissée à sa
session, aucun fichier partagé.

Le backlog F-series (F51→F60) est épuisé (F51→F57 traités it.90→95 ; F58/F59/F60 parkés). Revue
d'ingénierie fraîche via agent d'exploration ciblé sur les zones récemment développées
(`mention-parser`, résolveurs de langue, cache social, compteurs). Cible retenue : **F61 (neuf,
MEDIUM)** — dérive de frontière ASCII↔Unicode **résiduelle** dans `parseMentions`, jumelle exacte de
F57 (traité it.95) mais sur le path `@username` au lieu de `hasMentions`.

## Cible : F61 — le fallback `@username` de `parseMentions` utilisait une frontière gauche **ASCII** (`\w`) là où le path `@DisplayName` utilise la frontière **Unicode** (`NAME_BOUNDARY_LEFT`)

### Current state
`packages/shared/utils/mention-parser.ts` déclare (lignes 7-11) une **source de vérité unique** pour
la frontière d'un nom de mention :

```ts
const NAME_CHAR = '[\\p{L}\\p{N}_]';
const NAME_BOUNDARY_LEFT = `(?<!${NAME_CHAR})`;   // Unicode-aware
const NAME_BOUNDARY_RIGHT = `(?!${NAME_CHAR})`;
```

Le path `@DisplayName` (ligne 40) honore cette source de vérité :
`${NAME_BOUNDARY_LEFT}@${escapeRegex(p.displayName)}${NAME_BOUNDARY_RIGHT}` avec le flag `u`.

Mais le fallback `@username` (ligne 49, **avant ce cycle**) réimplémentait la frontière gauche **à la
main en ASCII**, sans flag `u` :

```ts
const handleRegex = /(?<![\w])@(\w{1,30})/g;   // \w = [A-Za-z0-9_], ASCII
```

Le but déclaré de cette frontière gauche (JSDoc ligne 19-20, tests `contact@marie.com`) est de
**rejeter les `@` internes d'adresses e-mail**. La garde ASCII ne tient que si le caractère qui
précède le `@` est ASCII. Si c'est une **lettre Unicode** (`é`, `à`, `ø`, cyrillique…), le
lookbehind ASCII **échoue silencieusement** et le `@` interne d'un e-mail est capturé comme une
mention.

### Problems identified
- **Faux positif de mention → mauvais utilisateur notifié.** Avec un participant `{ username:
  'atabeth' }`, `parseMentions('écris à André@atabeth.com', participants)` retournait `['u1']` :
  l'adresse e-mail `André@atabeth.com` était résolue comme une mention de l'utilisateur `atabeth`,
  qui recevait une notification de mention parasite. `Andre@atabeth.com` (ASCII `e`) retournait
  correctement `[]`. **Même entrée, une lettre accentuée d'écart, résultat opposé.**
- **Dérive de frontière intra-module résiduelle.** Deux paths voisins du même module répondaient
  différemment à « ce `@` est-il collé à un caractère de nom ? » — exactement la classe de bug F57,
  mais F57 n'avait unifié que `hasMentions` + le path `@DisplayName`, laissant ce fallback derrière.
- **Réimplémentation locale de `NAME_BOUNDARY_LEFT`** au lieu de réutiliser la constante déclarée
  source de vérité unique (violation Single Source of Truth affichée en tête de fichier).

### Root cause
La frontière gauche du fallback `@username` encodait un **second jeu de caractères de nom** (`\w`
ASCII) au lieu de réutiliser `NAME_BOUNDARY_LEFT` (Unicode). L'itération 95 (F57) a unifié
`hasMentions` et les frontières `@DisplayName` sur `NAME_CHAR`, mais la ligne 49 n'a pas été
migrée — dette de cohérence résiduelle.

### Business impact
La mention est une affordance sociale centrale (feed, commentaires, messages). Notifier un
utilisateur parce que son **username apparaît par hasard dans une adresse e-mail écrite après un
prénom accentué** (`André@…`, `José@…`, `François@…` — population de noms la plus fréquente en
francophone-first) est un faux positif visible, potentiellement gênant (notification non sollicitée,
« pourquoi suis-je mentionné ? »). La finition du geste social compte comme différenciateur.

### Technical impact
- 1 fichier production (`packages/shared/utils/mention-parser.ts`), 1 ligne changée + JSDoc alignée.
- Le comportement **se restreint strictement** : rejette davantage de faux positifs e-mail, ne
  change aucun cas de mention légitime (préfixée par espace / début de string / ponctuation
  non-nom). Le flag `u` laisse `\w{1,30}` en ASCII (usernames ASCII par validation — intentionnel)
  et n'upgrade que la frontière gauche en Unicode.
- Consommateurs de `parseMentions` (gateway `MentionService`, web) inchangés côté contrat.

### Risk assessment
**Très faible.** Changement chirurgical d'une ligne réutilisant une constante existante déjà éprouvée
sur le path voisin. Comportement strictement plus restrictif. RED-GREEN prouvé. Suite `packages/
shared` complète verte (1258 tests), `tsc` 0 erreur.

### Proposed improvements (implémenté ce cycle)
Remplacer le littéral regex ASCII par une construction qui réutilise `NAME_BOUNDARY_LEFT` :

```ts
const handleRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@(\\w{1,30})`, 'gu');
```

### Expected benefits
- Zéro faux positif de mention sur adresse e-mail précédée d'une lettre Unicode.
- Parité de frontière totale entre les 3 détections du module (`hasMentions`, `@DisplayName`,
  `@username`) — un seul jeu de caractères, zéro drift résiduel.

### Implementation complexity
Triviale (1 ligne + JSDoc). Aucun changement de signature, d'import, ou de contrat public.

### Validation criteria
- [x] Test RED d'abord : `parseMentions('écris à André@atabeth.com', participants)` attendu `[]`,
      observé `['u1']` avant le fix (+ variante cyrillique `Влад@jcharlesnm`).
- [x] GREEN après fix : `__tests__/mention-parser.test.ts` 26/26 verts.
- [x] Non-régression : suite `packages/shared` complète 1258/1258 verte.
- [x] `bun run build` shared (tsc) : 0 erreur.
- [x] Tests web `hasMentions` (`mentions.service`, `messages.service`) : path non touché (prédicat,
      pas la résolution de handle) — aucun assert du comportement ancien.

## Candidats écartés ce cycle (documentés)
- **F58** (comment-reaction `postType` STATUS/REEL collapse) : **soldé en parallèle par PR #1465**
  (mergé sur `main` pendant ce cycle, Leçon 63-F58). Retiré du backlog.
- **F59** (divergence REST comment-like / socket comment-reaction) : réel mais dans
  `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` + `NotificationService.ts` ;
  sévérité LOW. Reporté — itération gateway dédiée.
- **F62** (LOW, neuf, à confirmer) : `resolveUserLanguage` retourne les prefs in-app **brutes**
  (`'EN'`) là où `resolveUserLanguagesOrdered` les lowercase (`'en'`) ; `getRequiredLanguages`
  s'appuie sur le premier. Latent SI les prefs sont garanties lowercase à l'écriture — à confirmer
  par lecture de `normalize.ts` / points d'écriture avant fix. Reporté.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed`.
- ~~**F58**~~ : soldé par PR #1465 (mergé sur `main` ce cycle).
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
- **F60** (LOW) : unifier les 4 `extractMentions` (casse + support `-` dans les handles).
- **F62** (LOW, neuf) : case drift `resolveUserLanguage` vs `resolveUserLanguagesOrdered` — à
  confirmer que c'est live et non latent avant d'agir.
