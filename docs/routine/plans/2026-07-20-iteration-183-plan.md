# Plan Iteration 183 — Corriger le contrat mensonger de `attachmentTranslationsMapSchema`

## Objectifs
Rendre le contrat de `parseAttachmentTranslationsMap` **cohérent, honnête et
testé** : supprimer le docstring auto-contradictoire (`:187-196`) qui affirme une
validation cross-field clé↔contenu jamais implémentée, et verrouiller le
comportement réel par un test de caractérisation.

## Modules affectés
- `packages/shared/utils/attachment-validators.ts` (docstring `:187-196`, aucune
  logique).
- `packages/shared/__tests__/attachment-validators.test.ts` (+1 test).

## Phases d'implémentation
1. **RED/Characterization** — ajouter un test affirmant qu'une map dont la clé de
   langue ne correspond pas à la langue réelle du contenu est **acceptée**
   (`ok:true`), faute de marqueur de langue interne à recouper. Passe sur le code
   actuel.
2. **GREEN** — réécrire le docstring `:187-196` pour dire la vérité (clé
   autoritaire, non recoupée, impossible à recouper car pas de champ langue
   interne ; responsabilité de l'appelant), aligné sur `:253-258`.
3. **VALIDATE** — `vitest run __tests__/attachment-validators.test.ts` (37 verts).

## Dépendances
Aucune. `packages/shared` autonome, vitest déjà installé.

## Risques estimés
Très faible : fix documentaire + test caractérisant le comportement existant.
Aucune signature, aucun appelant, aucune forme persistée modifiée.

## Stratégie de rollback
`git revert` du commit unique (2 fichiers). Aucun impact runtime.

## Critères de validation
- 37/37 tests `attachment-validators` verts (36 + 1).
- `tsc --noEmit` shared inchangé.

## Statut de complétion
- [x] Phase 1 — test de caractérisation (RED/lock) — +1 test
- [x] Phase 2 — docstring corrigé (GREEN)
- [x] Phase 3 — validation vitest — **1365/1365 tests verts (46 suites), dont 37 `attachment-validators` (36 + 1)**

## Progress tracking
Démarré 2026-07-20 sur `claude/brave-archimedes-xx8xvp` @ base `b3ffa80`.

## Améliorations futures
Voir la section Backlog de l'analyse (normalizeLanguageCode ISO 639-3, sémantique
`limit=0`, case-sensitivity `CommonSchemas.language`, borne email 254/255).
