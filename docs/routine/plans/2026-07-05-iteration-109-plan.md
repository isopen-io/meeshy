# Iteration 109 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger **F82** : `sanitizeText` (web + gateway) supprime U+200C (ZWNJ) et U+200D (ZWJ), corrompant les
séquences emoji ZWJ, l'orthographe persane/farsi et les conjoints des scripts indiens. Réduire le range
de strip zéro-largeur à U+200B (ZWSP) + U+FEFF (BOM) uniquement, dans les deux SSOT.

## Modules affectés
- `apps/web/utils/xss-protection.ts` (`sanitizeText`).
- `services/gateway/src/utils/sanitize.ts` (`SecuritySanitizer.sanitizeText`).
- Tests : `apps/web/utils/__tests__/xss-protection.test.ts`,
  `services/gateway/src/__tests__/unit/utils/sanitize.test.ts`.
- Appelants (héritage automatique, non modifiés) : `useMessageActions.ts:67`, `socket-validator.ts:142`,
  `routes/anonymous.ts`, `routes/communities/core.ts`, `routes/links/*`, `tracking-links/creation.ts`,
  `friends.ts`.

## Phases d'implémentation
1. **RED** — repro Node autonome (impls copiées verbatim) : prouver corruption emoji + ZWNJ persan. ✅
2. **GREEN source** — range `[​-‍﻿]` → `[​﻿]` dans les 2 fichiers + commentaire
   expliquant pourquoi ZWNJ/ZWJ sont conservés. ✅
3. **Tests** — réécrire le test gateway « remove zero-width » (qui encodait le bug : `‌`/`‍`
   supprimés) en « remove zero-width space and BOM » ; ajouter dans les 2 suites : BOM strip, préservation
   séquence ZWJ (famille emoji), préservation ZWNJ persan. ✅
4. **Validation** — install bun (parité CI), jest web + gateway sur les 2 suites, suites complètes.
5. **Commit + push + PR**.

## Dépendances
- `bun install` requis (node_modules absent au démarrage) pour exécuter jest.
- Prisma generate + build `packages/shared` pour la suite gateway complète (parité CI).

## Risques estimés
Très faibles. Fonctions pures, changement d'une classe de caractères. Posture XSS inchangée (défense
primaire = strip HTML DOMPurify). Aucun contenu accepté nouvellement rejeté.

## Stratégie de rollback
Restaurer le range `[​-‍﻿]` dans les 2 fichiers (trivialement réversible).

## Critères de validation
- [x] RED prouvé (repro Node).
- [x] GREEN source (2 fichiers).
- [ ] jest web `xss-protection.test.ts` vert (existants + 3 neufs).
- [ ] jest gateway `sanitize.test.ts` vert (1 réécrit + 2 neufs).
- [ ] `tsc`/build sans nouvelle erreur sur les fichiers touchés.
- [ ] CI verte après push.

## Statut de complétion
- Source : **fait**. Tests : **fait**. Validation locale : **en cours** (install bun).

## Progress tracking
- [x] Analyse écrite (`docs/routine/analyses/2026-07-05-iteration-109-analyse.md`).
- [x] Plan écrit (ce fichier).
- [x] Fix source + tests.
- [ ] Validation locale + push + PR.

## Améliorations futures
- **F83** : `groupNotificationsByDate` bucket « cette semaine » inatteignable le dimanche (cosmétique).
- Consolidation possible : `xss-protection.ts` (web) et `sanitize.ts` (gateway) dupliquent la logique de
  strip zéro-largeur/contrôle — candidat à une SSOT partagée dans `packages/shared` (hors périmètre ici,
  changerait 2 services d'un coup ; à faire avec une décision d'architecture dédiée).
</content>
