# Iteration 153 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `06694a69` (dernier merge : PR #1754 — Android media quoted-reply preview).
Branche `claude/brave-archimedes-rua93b` recréée sur `origin/main` (0/0). Ce cycle prend
**153**.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src` (delivery queue,
post/story views, présence, reactions, call-transcription, stats, mentions), (b) `apps/web`
+ `packages/shared` (mentions, présence, prisme, typing, reactions, story). Consigne : **un**
défaut de logique quasi-pure, haute confiance, **actuellement en production**, non couvert
par les tests. Priorité 1 = features récemment développées (les mentions ont été
massivement retravaillées : usernames à tiret iter 145/151, frontière e-mail iter 132,
SSOT `mention-parser.ts`).

Convergence des deux agents sur le **thème frontière de mention** : plusieurs siblings du
parseur de mention ont dérivé de la SSOT `NAME_BOUNDARY_LEFT`. Cible retenue = la plus
grave (corruption de donnée / fausses notifications côté serveur), pas UX-only.

---

## Cible retenue : F119 — `resolveMentionedUsers` extrait un `@handle` à l'intérieur d'une adresse e-mail car sa regex omet la frontière gauche que tous ses siblings appliquent

### Current state
`services/gateway/src/services/MentionService.ts`. Deux fonctions sœurs extraient les
handles `@username` d'un texte libre, mais avec des regex **divergentes** :

- **`MentionService.MENTION_REGEX`** (ligne 42, méthode d'instance) applique la frontière
  gauche Unicode et le flag `u` :
  ```ts
  private readonly MENTION_REGEX =
    new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]+)`, 'gu');
  ```
- **`resolveMentionedUsers`** (ligne 1050, export module) **omettait** la frontière (et le
  flag `u`) :
  ```ts
  const mentionRegex = new RegExp(`@([${MENTION_HANDLE_CHARS}]{1,30})`, 'g');
  ```

La SSOT `packages/shared/utils/mention-parser.ts` documente explicitement (lignes 18-24) que
`NAME_BOUNDARY_LEFT` s'applique à **TOUS les chemins de mention** : un `@` collé après un
caractère de nom appartient à une adresse e-mail (`john@example.com`) et **n'est pas** une
mention. `parseMentions`, `hasMentions`, `extractMentions` et l'instance `MENTION_REGEX`
honorent tous cette règle ; `resolveMentionedUsers` était le seul chemin à la trahir.

### Problems identified
- Tout contenu comportant `mot@handle` (e-mail `john@example.com`, URL `cdn@2x`, handle
  collé) fait résoudre `handle` comme un utilisateur mentionné.
- Un tiers réellement nommé `example` est **faussement tagué/notifié** dès qu'un utilisateur
  écrit une adresse e-mail se terminant par `@example.com` dans un post, commentaire, story
  ou message.

### Root cause
Drift de charset/frontière entre siblings : `resolveMentionedUsers` a été ajouté après la
SSOT sans réutiliser `NAME_BOUNDARY_LEFT`. Le flag `u` manquait aussi (les classes
`\p{L}\p{N}` de la frontière l'exigent).

### Business impact
Fausses notifications de mention → bruit, atteinte à la confiance, spam potentiel. Un
utilisateur reçoit « X vous a mentionné » alors qu'il n'a été que cité par coïncidence dans
une adresse e-mail.

### Technical impact
`resolveMentionedUsers` est le résolveur de mention de **toute la surface sociale** :
`routes/posts/feed.ts` (8 sites : feed, stories, reels, statuses, discover, user posts,
community, bookmarks), `routes/posts/core.ts`, `routes/posts/comments.ts`,
`routes/conversations/messages.ts`, `socketio/handlers/MessageHandler.ts`. Le défaut se
propageait donc partout.

### Risk assessment
Très faible. Changement d'une seule regex, aligné mot pour mot sur la SSOT `parseMentions`
(même frontière, même flag). Aucune API ni signature modifiée.

### Proposed improvements
Préfixer la regex de `resolveMentionedUsers` par `NAME_BOUNDARY_LEFT` et ajouter le flag
`u`, exactement comme `parseMentions` et l'instance `MENTION_REGEX`.

### Expected benefits
- Zéro fausse mention issue d'une adresse e-mail / handle collé.
- Convergence complète des chemins de mention sur la frontière SSOT (zéro drift restant).

### Implementation complexity
Triviale (1 ligne prod + 4 tests de régression).

### Validation criteria
- RED : `resolveMentionedUsers(prisma, ['Contact me at john@example.com'])` résout `example`.
- GREEN : retourne `[]` et n'appelle jamais `findMany` ; les mentions légitimes (après
  espace, en début de contenu) restent résolues.
- Suite `MentionService.test.ts` : 109/109.

---

## Candidats non retenus (backlog priorisé)

- **F120 (prochaine itér.)** — `apps/web/components/common/bubble-message/EditMessageView.tsx:128`
  utilise la garde `/^\w{0,30}$/` (sans tiret) : **exactement** le bug que l'iter 151 a
  corrigé dans le composer (`useMentions.ts:205` → `/^[\w-]{0,30}$/`), toujours vivant dans
  le sibling *edit*. Les usernames à tiret (`@marie-claire`) ne peuvent pas être
  autocomplétés en édition de message. Fix identique 1 caractère. Haute confiance, non
  couvert (le test mocke `EditMessageView` entièrement). **Cible recommandée iter 154.**
- **F121** — `MediaVideoCard.tsx:403` matche `languageCode === defaultLanguage` en
  case-sensitive alors que ses siblings `MediaAudioCard`/`MediaImageCard` utilisent
  `.toLowerCase()`. Confiance moyenne (dépend d'une casse divergente réelle dans les données).
- **F122** — `detectMentionAtCursor` (`packages/shared/types/mention.ts`) et
  `useMentions.ts` MENTION_REGEX n'appliquent pas `NAME_BOUNDARY_LEFT` au curseur : l'auto-
  complete s'ouvre sur `bob@alice` même si le serveur ne résoudra jamais ce `@`. UX-only,
  confiance moyenne.
