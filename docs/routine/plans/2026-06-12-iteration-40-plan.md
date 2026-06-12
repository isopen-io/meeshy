# Iteration 40 — Plan d'implémentation (2026-06-12)

## Objectif
Lot « Pureté schéma & agrégation côté base » : supprimer la paire redondante
`isDeleted`+`deletedAt` (Post, PostComment — règle critique CLAUDE.md), pousser les
trois agrégations en mémoire de `routes/admin/languages.ts` dans MongoDB
(`aggregateRaw`), éliminer les abonnements store-entier du Header/DashboardLayout,
nettoyer les `console.log` de production, paralléliser les lectures indépendantes des
notifications sociales.

## Étapes (TDD : RED → GREEN)

### Phase A — Suppression `isDeleted` (Post, PostComment)
- [x] Schéma : retirer `isDeleted Boolean @default(false)` de Post (l.2825) et
      PostComment (l.2982) ; `prisma generate` ; aucun index à toucher (vérifié).
- [x] RED : adapter les tests existants (PostService, PostCommentService,
      PostFeedService, PostReactionService, CommentReactionService, MentionService,
      postIncludes) pour attendre des filtres `deletedAt: null` /
      `deletedAt: { not: null }` et des écritures `deletedAt` seul — ils échouent
      tant que le code émet encore `isDeleted`.
- [x] GREEN : migrer tous les usages gateway (filtres, data, select) :
      PostService, PostFeedService, PostCommentService, PostReactionService,
      CommentReactionService, MentionService, ExpiredStoriesCleanupService,
      NotificationService, posts/postIncludes, posts/PostAudioService,
      routes/admin/posts.ts. Conservés sciemment : param de requête externe
      `isDeleted` de l'API admin (contrat, traduit en filtre `deletedAt`) et
      lecture du champ legacy dans migrate-from-legacy.ts (compat entrée).
- [x] Types shared : `types/post.ts` expose `deletedAt` au lieu d'`isDeleted` ;
      `migration-utils.ts:207` garde la lecture legacy `raw.isDeleted` (compat
      entrée) mais le type de sortie n'expose plus le booléen.
- [x] Données : aucun backfill requis — tous les writes posaient les deux champs
      ensemble (vérifié iter 40) ; champs résiduels MongoDB ignorés par Prisma.

### Phase B — Agrégations MongoDB (admin languages)
- [x] RED : tests unitaires routes `/stats` et `/timeline` — mocks
      `prisma.message.aggregateRaw` ; vérifient (1) qu'AUCUN `findMany` massif n'est
      émis, (2) la forme des réponses (topLanguages.userCount, topPairs, timeline)
      identique au contrat actuel.
- [x] GREEN `/stats` — utilisateurs distincts par langue : pipeline
      `$match` (fenêtre, deletedAt null, langues top) → `$lookup` Participant
      (senderId → _id) → `$group` {lang, userId} → `$group` {lang, userCount}.
- [x] GREEN `/stats` — paires de traduction : pipeline `$match`
      (translations non null) → `$project` `$objectToArray: "$translations"` →
      `$unwind` → `$group` {from, to, count, totalScore, scoreCount} →
      `$sort` + `$limit 10`.
- [x] GREEN `/timeline` : pipeline `$match` (fenêtre) → `$group`
      {`$dateToString` "%Y-%m-%d", langue} → reconstruction des jours vides en JS
      (inchangée, O(jours)).
- [x] Dates en Extended JSON (+ `/translation-accuracy` migré sur le même pipeline partagé, découvert non borné pendant l'implémentation) (`{ $date: iso }`) dans les pipelines `aggregateRaw`.

### Phase C — Web : re-render & logs
- [x] `Header.tsx:61` et `DashboardLayout.tsx:66` : remplacer
      `const { theme, setTheme } = useAppStore()` par `useTheme()` +
      `useAppActions()` (sélecteurs existants, `useShallow` déjà en place).
- [x] `use-ranking-data.ts` : `console.log/error` → `logger.debug/error`
      (`@/utils/logger`) ; suites web existantes vertes.

### Phase D — Notifications : lectures parallèles
- [x] `createMentionNotification` (l.1019-1029) : `Promise.all([user, conversation])`.
- [x] Appliquer le même motif (message, missed-call, member-joined, reply — 5 méthodes au total, reaction l'avait déjà) aux autres méthodes sociales à paires séquentielles
      indépendantes vérifiées (reaction, post comment) — uniquement où les deux
      lectures ne dépendent pas l'une de l'autre.
- [x] Suites notifications existantes vertes (comportement public inchangé).

### Phase E — Vérification & livraison
- [x] Suites gateway/web/shared touchées vertes ; échecs restants identiques à la baseline main (préexistants, hors périmètre) ; shared 549/549.
- [ ] Commit + push `claude/inspiring-euler-0im8ps`, PR vers `main`, CI verte, merge.

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F10 : scalaire `conversationId` sur Notification (dual-write + backfill)
- F17 : pagination/sélection de champs `getAllUsers` (contrat API)
- F18 : helpers de formatage dupliqués → shared
- F19 : spinner dashboard vs cache React Query

## Continuité
Iter 41+ : F17 (contrat API users — gateway + web d'un bloc) est le meilleur candidat
autonome ; F19 en audit écran par écran ; F2/F10 dès qu'une fenêtre staging existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — schéma pur (isDeleted supprimé)
- [x] Phase B — agrégations côté MongoDB
- [x] Phase C — sélecteurs theme + logger
- [x] Phase D — lectures notifications parallèles
- [ ] Phase E — CI verte, mergé dans main
