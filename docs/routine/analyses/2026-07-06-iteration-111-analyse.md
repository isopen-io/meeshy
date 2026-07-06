# Iteration 111 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `7caa5f10` (« Merge PR #1516 — F77 CircuitBreaker failureWindowMs »), working tree propre.
Branche de travail `claude/brave-archimedes-fru31a` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

Note numérotation : collision d'itérations sur `main` (une session parallèle a aussi numéroté « 108 »
pour F79 `detectBestInterfaceLanguage`) ; mon F77 a été renuméroté 110 lors de la réconciliation. Les
docs d'itération sur `main` vont jusqu'à **110** → ce cycle prend **111** (numéro libre).

### Revue d'ingénierie (constat de démarrage)
La couche des utilitaires **purs mono-fonction** (`packages/shared/utils/*`, `apps/web/utils/*`) est
désormais exhaustivement balayée (F57–F81) — « exceptionnellement propre ». Balayage ciblé (agent
d'exploration) d'une couche **plus fraîche** : logique de service/route gateway (agrégation, mapping,
résolution), hors zones déjà traitées. Trois candidats remontés :

1. **F82 — Classements admin (`rankUsers`) : agrégation par `Participant.id` sans repli vers `User`** —
   RETENU (impact réel sur la vue par défaut du dashboard admin, 8 critères touchés, une seule famille
   de bug, prouvé contre le schéma Prisma).
2. **F83 — `AffiliateTrackingService.getAffiliateStats` : la ventilation par statut ignore le filtre
   `tokenId` que le total respecte** → la ventilation peut dépasser le total filtré. Écarté ce cycle
   (sous-système distinct — mérite sa propre PR ciblée). Reporté (§ futur).
3. Divers chemins cursor/feed/stats vérifiés → corrects ou auto-réparants.

## Cible : F82 — Les classements utilisateurs agrègent par participant, jamais par utilisateur

### Current state
`services/gateway/src/routes/admin/system-rankings.ts` → `rankUsers()` alimente
`GET /api/v1/admin/ranking` (dashboard admin `app/admin/ranking/page.tsx` → `useRankingData` →
`adminService.getRankings()`). Vue par défaut : `entityType='users'`, `criterion='messages_sent'`.

**Fait de schéma** (`packages/shared/prisma/schema.prisma`) : `Message.senderId`,
`Reaction.participantId`, `Mention.mentionedParticipantId`, `CallParticipant.participantId` référencent
tous **`Participant.id`** — et un `User` possède **un `Participant` par conversation**. Un utilisateur
actif dans N conversations a donc N participant ids.

### Problems identified — deux familles, 8 critères
- **[LIVE] Famille A — « lignes en double » (mappé mais jamais sommé).** `messages_sent`/`messages`
  (vue **par défaut**), `reactions_given`/`reactions`, `mentions_received`, `files_shared`,
  `call_participations` : chaque critère `groupBy` sur une colonne participant-scope puis
  `topX.map(s => [participantToUser(s) || s, count])` **sans re-sommer par utilisateur**. Un
  utilisateur présent via 3 participants → **3 lignes distinctes** (100, 50, 30) au lieu d'une seule
  (180) → mal classé sous un utilisateur mono-conversation à 120.
- **[LIVE] Famille B — « Unknown » (jamais résolu).** `reactions_received`, `replies_received`,
  `mentions_sent` : construisent `senderCounts` **clé = participant id**, puis
  `fetchUserDetails(participantIds)` → `User.findMany({id:{in: participantIds}})` **ne trouve rien**
  (ce sont des participant ids, pas des user ids) → `buildUserRankings` retombe sur
  `username:'Unknown'`, avatar absent. **Toutes** les lignes de ces classements s'affichent
  « Unknown ».

### Root cause
Confusion `Participant.id` vs `User.id` dans l'étape d'agrégation. Les critères corrects du même
fichier (`conversations_joined` groupBy `userId`, `communities_created` clé `userId`,
`most_referrals_via_sharelinks` construit un `Map<userId, n>` sommé) prouvent que l'agrégation **par
utilisateur** est le contrat voulu — ces 8 l'ont simplement omise.

### Business impact
Le dashboard admin — outil de pilotage produit — affiche des classements **faux** : la 1ʳᵉ vue que
tout admin ouvre (`messages_sent`) duplique et sous-compte les utilisateurs multi-conversations ;
trois autres classements sont **entièrement** « Unknown » sans avatar. Décisions produit/modération
prises sur des données incorrectes.

### Technical impact
Helper unique `foldParticipantCountsToUsers(fastify, Map<participantId, count>) → Map<userId, count>` :
une requête `participant.findMany` batchée, repli des comptes par `userId` propriétaire (somme), et
**conservation d'un id participant orphelin** (sans user) sous sa propre clé pour ne pas perdre
silencieusement l'activité. Les 8 critères construisent d'abord un `Map<participantId, count>`, le
passent au helper, puis `sortAndLimit` + `fetchUserDetails` + `buildUserRankings`. Aucun changement de
signature de route ni de forme de réponse.

### Risk assessment
Faible-modéré (8 blocs touchés, 1 fichier). Le `groupBy` (avec `orderBy`/`take`) est **inchangé** —
seul le post-traitement change. Le repli `|| participantId` préserve la visibilité des orphelins et la
compatibilité des tests de repli existants. La forme `groupBy` conservée préserve les tests
d'inspection de `take`. Résiduel connu documenté : `take: limit` reste au niveau participant (top-N
participants avant repli), un utilisateur très fragmenté hors du top-N participant pourrait être
légèrement sous-représenté — nettement moindre que la duplication corrigée (§ futur, raffinement).

### Proposed improvements (implémenté ce cycle)
- Helper `foldParticipantCountsToUsers` (commenté : fait de schéma + raison du repli).
- Réécriture des 8 critères (Famille A : construire `Map` participant + fold + sortAndLimit ;
  Famille B : insérer le fold entre `senderCounts` et `sortAndLimit`).

### Validation criteria
- [x] `system-rankings.test.ts` **114/114** (109 existants préservés + 3 neufs : dedup `messages_sent`,
      résolution + fold `reactions_received` ; 1 réécrit : `files_shared` orphelin null-userId — l'ancien
      test asseyait l'exclusion incohérente, remplacé par le comportement orphelin correct).
- [x] Tests d'inspection `take` (clamping/défaut) préservés (forme `groupBy` inchangée).
- [x] Aucune référence morte aux anciennes variables ; helper utilisé par les 8 critères.

## Backlog reporté (§ futur)
- **F83** (MEDIUM, neuf) : `AffiliateTrackingService.getAffiliateStats` — le `groupBy` de ventilation
  par statut omet `whereClause` (filtres `tokenId`/`status`) que le `findMany` du total applique →
  ventilation incohérente/> total sur `GET /affiliate/stats?tokenId=…`. PR ciblée séparée.
- **F82b** (LOW, neuf) : raffiner `take: limit` au niveau participant → agréger pleinement avant limite
  (nécessite d'ajuster les tests d'inspection `take`).
- Antérieurs toujours reportés : F69, F74, F75, F78, F80, F81 (0 caller live / décision produit / faible
  valeur).
