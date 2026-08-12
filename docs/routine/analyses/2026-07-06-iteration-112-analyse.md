# Iteration 112 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `e16cf8c0` (« Merge pull request #1523 … »), working tree propre. Branche de travail
`claude/brave-archimedes-howg57` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver. `git config user.email/name` positionné (`noreply@anthropic.com` / `Claude`).

**6 PR ouvertes au démarrage**, toutes issues de sessions parallèles et **disjointes** de la cible retenue :
- **#1528** gateway `admin/system-rankings.ts` — fold participant→user (F82 dans leur numérotation),
- **#1527 / #1525 / #1524** iOS — design tokens, Dynamic Type, LiveActivity, dates modernes,
- **#1526** Android — sync offline des préférences de notification.

La cible retenue ici (`AffiliateTrackingService.getAffiliateStats`) est **strictement disjointe** de tous
ces fichiers. Elle correspond au **F83** explicitement différé dans le corps de la PR #1528
(« the per-status breakdown groupBy omits the tokenId/status filters the total's findMany applies »).

## Cible : F83 — `getAffiliateStats` : la ventilation par statut ignore les filtres → décompte incohérent

### Current state
`services/gateway/src/services/AffiliateTrackingService.ts` → `getAffiliateStats(prisma, userId, filters)`
(exposé par `GET /api/v1/affiliate/stats` — `routes/affiliate.ts:396`, filtres `tokenId` et `status`
passés depuis la query). La méthode lance **trois** requêtes en parallèle :

1. `affiliateRelation.findMany({ where: whereClause, … })` — `whereClause` **applique** les filtres
   (`affiliateTokenId`, `status`, plage `createdAt`) → alimente `totalReferrals = referrals.length`.
2. `affiliateRelation.groupBy({ by: ['status'], where: { affiliateUserId: userId }, … })` — **ignore**
   `whereClause`, ne filtre que par utilisateur → alimente `completedReferrals` / `pendingReferrals` /
   `expiredReferrals`.
3. `affiliateToken.findMany(...)` — tokens créés par l'utilisateur (hors sujet).

### Problems identified
- **[LIVE] Incohérence `totalReferrals` vs ventilation.** Dès qu'un filtre réduit la liste, la ventilation
  reste calculée sur **toutes** les affiliations de l'utilisateur. Exemple concret (`?status=completed`,
  utilisateur avec 3 completed / 1 pending / 2 expired) :
  - `totalReferrals = 3` (filtré) ;
  - `completedReferrals = 3`, `pendingReferrals = 1`, `expiredReferrals = 2` (non filtrés) ;
  - somme de la ventilation = **6 > 3** → le tableau de bord affiche une ventilation qui **excède** le total.
- **[LIVE] Mauvaise attribution par token.** `?tokenId=tok_X` filtre `totalReferrals` sur les affiliations
  de ce token, mais la ventilation completed/pending/expired reste celle de **tous** les tokens confondus →
  chiffres par statut sans rapport avec le token sélectionné.
- **[LIVE] Filtre de dates ignoré par la ventilation** (même racine, via `dateFrom`/`dateTo` — non exposé
  par la route actuelle mais supporté par la signature).

### Root cause
La requête `groupBy` a été écrite avec un `where` littéral (`{ affiliateUserId: userId }`) au lieu de
réutiliser le `whereClause` déjà construit et partagé avec `findMany`. Deux sources de vérité divergentes
pour « quelles affiliations comptent » dans une même réponse. Les fonctions voisines correctes du fichier
(`referrals` filtrée) prouvent que le filtrage est le contrat attendu.

### Business impact
Le tableau de bord d'affiliation (parrainage — levier de croissance) affiche des statistiques
**contradictoires** dès qu'un utilisateur filtre par token ou par statut : ventilation dépassant le total,
compteurs par statut sans lien avec le token choisi. Perte de confiance directe dans un écran chiffré.

### Technical impact
Correction **d'une seule ligne** (`where: { affiliateUserId: userId }` → `where: whereClause`), sans
changement de signature ni de forme de réponse. Tous les appelants héritent automatiquement de la cohérence.

### Risk assessment
Très faible. `whereClause` contient déjà `affiliateUserId: userId` (construit ligne 220-222) plus les
filtres optionnels ; le comportement **sans filtre** est strictement identique (mêmes clés). Seul le
comportement **avec filtre** change — et il devient correct. Aucune requête supplémentaire, aucune
régression de perfs (même nombre de round-trips).

### Proposed improvements (implémenté ce cycle)
- `AffiliateTrackingService.ts` : `groupBy.where` = `whereClause` + commentaire expliquant le *pourquoi*
  (cohérence de la ventilation avec `totalReferrals`).

### Expected benefits
- Ventilation completed/pending/expired **cohérente** avec `totalReferrals` sous filtre.
- Compteurs par statut correctement **restreints au token** sélectionné.
- Aucun coût : même nombre de requêtes, même forme de réponse.

### Implementation complexity
Très faible (1 ligne de source + commentaire ; 2 tests neufs, dont 1 test comportemental
RED→GREEN avec double prisma filtre-conscient, et 1 test de contrat de filtre sur le `groupBy`).

### Validation criteria
- [x] RED prouvé : sous `?status=completed`, ancien code → somme ventilation (6) ≠ `totalReferrals` (3).
- [x] GREEN : ventilation restreinte au filtre, somme == `totalReferrals`.
- [ ] Test de contrat : `groupBy.where.affiliateTokenId === filtre`.
- [ ] Suite `AffiliateTrackingService.test.ts` verte (existants préservés).
- [ ] Suite gateway complète verte après install bun + CI.

## Candidats écartés / différés ce cycle
- Zones des 6 PR ouvertes (admin rankings, iOS, Android) — évitées par construction (disjonction stricte).

## Améliorations futures (report)
- **F82b** (LOW, PR #1528) : `take: limit` borne le `groupBy` participant-level avant le fold.
- **F83b** (LOW, neuf) : `getAffiliateStats` — les `tokens` retournés (`affiliateToken.findMany`) ne sont
  pas filtrés par `tokenId` ; volontaire (liste complète des tokens du user), mais à documenter si l'UI
  attend un sous-ensemble sous filtre.
- Reports antérieurs : F51b, F56b, F60b, F67b, F68b, F69, F70, F74, F75, F83 (notifications bucket dimanche).
</content>
