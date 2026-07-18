# Plan d'implémentation — Iteration 179

## Objectifs
Normaliser les codes de langue émis par `getUserLanguageChoices` via la SSOT
`normalizeLanguageCode`, pour que chaque choix de langue soit sélectionnable
(match `SUPPORTED_LANGUAGES`) et cohérent avec `resolveUserPreferredLanguage`.

## Modules affectés
- `apps/web/utils/user-language-preferences.ts` (implémentation)
- `apps/web/__tests__/utils/user-language-preferences.test.ts` (tests)

## Phases
1. **RED** — Ajouter le bloc `region-subtag normalization` (5 tests) couvrant
   système/régional/custom subtaggés, l'égalité SSOT avec
   `resolveUserPreferredLanguage`, et la déduplication par sous-tag. ✅
2. **GREEN** — Importer `normalizeLanguageCode`, remplacer les `?.toLowerCase()`
   par des appels normalisés ; préserver le fallback 🇫🇷 (meta-lookup sur la
   valeur normalisée éventuellement `undefined`). ✅
3. **REFACTOR** — Aucun (le helper `findLanguageMeta` reste pertinent et
   inchangé ; composition immuable conservée). ✅

## Dépendances
- `@meeshy/shared/utils/language-normalize` (SSOT existante, déjà buildée dans
  `packages/shared/dist`).

## Risques estimés
Très faible : signature inchangée, comportements documentés couverts par les 41
tests existants (tous verts après changement).

## Stratégie de rollback
Revert du commit unique — un seul fichier de prod + son test.

## Critères de validation
- 46/46 sur le suite ciblé, 18/18 sur `ConversationLayout`, 706 verts sur le
  sweep `language`. ✅
- Aucune nouvelle erreur tsc sur le fichier touché. ✅

## Statut de complétion
**Terminé.** RED → GREEN validés, docs analyse+plan écrits, prêt à commit/push.

## Progress tracking
- [x] Analyse (Finding 3 iter-178)
- [x] Tests RED
- [x] Implémentation GREEN
- [x] Validation (jest ciblé + consommateur + sweep + tsc)
- [x] Docs routine
- [ ] Commit + push sur `claude/brave-archimedes-5sz7mr`

## Améliorations futures
- Finding 2 (iter-178) : durcir `displayName` chaîne-vide dans
  `routes/conversations/messages.ts` via un resolver blank-aware partagé.
- F69 : `sanitizeFileName` overlong sans extension.
