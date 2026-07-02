# Itération 85 — Plan d'implémentation (2026-07-02)

## Objectif
Fermer F47 : appliquer atomiquement le cap `maxUses` des tokens d'affiliation dans
`AffiliateTrackingService.convertAffiliateVisit`, en remplaçant le pattern check-then-increment
(TOCTOU de dépassement de quota) par une réservation de slot conditionnelle (`updateMany where
currentUses < maxUses`).

## Modules affectés
- `services/gateway/src/services/AffiliateTrackingService.ts` (fonction `convertAffiliateVisit`)
- `services/gateway/src/__tests__/unit/services/AffiliateTrackingService.test.ts`

## Phases
1. **RED/design** — identifier le TOCTOU (leçon #55 grep), écarter les faux-positifs
   (PhonePasswordReset déjà atomique, ConversationStats en mémoire, PushNotif mutex in-process). ✅
2. **GREEN** — réservation atomique conditionnée par le cap, avant création de relation ;
   garde `>= maxUses` conservé en fast-path ; `count === 0` → erreur cap sans effet de bord. ✅
3. **Tests** — mock `updateMany` ; bascule des assertions `update`→`updateMany` ; +2 cas
   (réservation cap-guardée ; perte de course sans relation créée). ✅
4. **Validation** — suites affiliate service + routes, tsc. ✅

## Dépendances
Aucune (périmètre isolé, `prisma` typé `any` dans le service — pas de régénération Prisma requise).

## Risques estimés
- FAIBLE. Périmètre 1 fonction. Idiome conditional-update déjà éprouvé ailleurs dans le gateway
  (`routes/anonymous.ts`). Garde fast-path et idempotence préservés.

## Stratégie de rollback
Revert du commit unique (service + test). Aucun changement de schéma, aucune migration.

## Critères de validation
- `AffiliateTrackingService.test.ts` 34/34 ; `routes/affiliate.test.ts` 21/21 ; tsc 0 erreur.

## Statut
**COMPLÉTÉ.** F47 soldé.

## Progression / suites
- Continuité du thème concurrence (#50→#55). Faces perte (leçon #51) ET dépassement (F47) désormais
  couvertes pour l'affiliation.
- Résidus reportés : PushNotif cross-instance (FAIBLE), F2 SOCKET_LANG_FILTER (HAUT, non autonome),
  F31 truncateText dupliqué (FAIBLE-MOYEN).
