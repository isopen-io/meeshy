# Iteration 173 — Plan : durcir `parseMessageLinks` contre les chevauchements

## Objectifs
1. Éliminer les parts chevauchantes/dupliquées quand une URL contient un
   segment `m+<token>` (violation de l'invariant de reconstruction F91).
2. Exprimer la priorité réelle (URL ⊃ mshy interne) par une résolution
   d'intervalles, pas par une égalité d'index fragile.
3. Résoudre l'erreur TS pré-existante du même fichier sans élargir le périmètre.

## Modules affectés
- `apps/web/lib/utils/link-parser.ts` (implémentation).
- `apps/web/__tests__/lib/link-parser.test.ts` (couverture régression).

## Phases
- [x] **P1 — RED** : 5 tests de chevauchement (chemin + query + reconstruction
      + intervalles disjoints + m+ autonome hors URL). Confirmés rouges sur le
      code d'origine, 14 existants verts.
- [x] **P2 — GREEN** : collecte unifiée des candidats + tri (début ↑, span ↓,
      priorité) + balayage glouton `start >= coveredEnd`. Suppression du
      dédoublonnage exact-index et du `sort` redondant.
- [x] **P3 — Tech-debt** : `createTrackingLink` → `trackingLink?: { token: string }`.
- [x] **P4 — Validation** : jest lib (34 suites), preprocessContent (8),
      `tsc --noEmit` (0 erreur link-parser).

## Dépendances
Aucune (fonction pure, aucun changement de contrat public : signature et types
de `ParsedLink` inchangés).

## Risques & rollback
- Risque : régression sur un cas non-chevauchant. Mitigé par les 14 tests
  existants + 826 tests de `__tests__/lib/` restés verts.
- Rollback : `git revert` du commit (fichier + test isolés).

## Critères de validation
- [x] 5 nouveaux tests rouges avant / verts après.
- [x] Zéro régression sur les suites lib + consommateur.
- [x] Aucune nouvelle erreur `tsc`.
- [x] Invariant F91 (concat des `content` == message ; intervalles disjoints
      croissants) vérifié par assertion pour le cas chevauchant.

## Statut : COMPLET

## Améliorations futures
- Envisager d'exposer la résolution gloutonne d'intervalles comme util partagé
  si d'autres parseurs (mentions, hashtags) apparaissent.
- Candidats tech-debt tracés hors périmètre : `getTranslationFromJSON`
  (casse-insensible, iter-130), `sanitizeFileName` overlong (F69).
