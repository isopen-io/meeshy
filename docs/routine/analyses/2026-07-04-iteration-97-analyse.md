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
