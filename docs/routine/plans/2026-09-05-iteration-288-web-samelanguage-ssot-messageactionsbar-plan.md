# Plan — Itération 288 : SSOT `isSameLanguage` + correctif `MessageActionsBar`

Issue #5167. Analyse :
`docs/routine/analyses/2026-09-05-iteration-288-web-samelanguage-ssot-messageactionsbar-analyse.md`

## Objectifs

1. Corriger le drapeau original/traduit et la coche du menu de langue de
   `MessageActionsBar`, qui comparent les codes au `===` brut.
2. Éliminer les 5 copies locales de `sameLanguage` d'`apps/web` au profit d'une
   SSOT partagée.

## Modules affectés

- `packages/shared/utils/language-normalize.ts` (ajout `isSameLanguage`)
- `packages/shared/__tests__/language-normalize.test.ts` (témoins)
- `apps/web/components/common/bubble-message/MessageActionsBar.tsx` (correctif)
- `apps/web/hooks/use-message-display.ts` (import SSOT)
- `apps/web/components/common/messages-display.tsx` (import SSOT)
- `apps/web/components/v2/TranslationToggle.tsx` (import SSOT)
- `apps/web/hooks/use-stream-translation.ts` (import SSOT)
- `apps/web/components/v2/CanvasV3Scene.tsx` (import SSOT)

## Phases

1. **RED** — Ajouter les témoins `isSameLanguage` (`'en'`/`'en-US'` → true, etc.)
   dans `language-normalize.test.ts`. La suite échoue (import indéfini).
2. **GREEN** — Exporter `isSameLanguage` de `language-normalize.ts`. Rebuild
   shared (dist). Suite verte.
3. **Fix** — Router les 7 comparaisons de `MessageActionsBar` par `isSameLanguage`.
4. **Consolidation** — Remplacer les 5 copies locales par l'import de la SSOT.
5. **Validation** — vitest shared, jest web frères, `tsc --noEmit` web.

## Dépendances

`normalizeLanguageForDedup` (déjà en shared). `@meeshy/shared/dist` doit être
reconstruit après l'ajout pour que le `moduleNameMapper` jest web voie l'export.

## Risques estimés

Très faible. Sémantique identique aux copies remplacées ; consolidation
convergente. Risque résiduel : conflit de merge si une session parallèle édite
`components/v2/*` — atténué en gardant le diff mécanique et minimal.

## Stratégie de rollback

Revert du commit unique. Chaque site remplacé conserve sa sémantique ; aucun
état persistant, aucun schéma touché.

## Critères de validation

- Suite `language-normalize` verte incluant les nouveaux témoins.
- `grep -rn "const sameLanguage" apps/web` ne renvoie plus rien.
- `MessageActionsBar` n'a plus de comparaison de langue au `===` brut.
- `tsc --noEmit` du web : EXIT=0.

## Statut d'achèvement

- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 Fix
- [x] Phase 4 Consolidation
- [x] Phase 5 Validation

## Améliorations futures

- Miroir potentiel côté iOS/Android : `isSameLanguage` n'a pas d'équivalent
  centralisé sur les clients natifs (à évaluer si une jumelle divergente
  apparaît). Hors périmètre de ce lot.
