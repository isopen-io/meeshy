# Plan — Itération 251 : router les comparaisons de langue web par la SSOT

## Objectives

Clore le « lot jest web dédié » de l'audit langue (suivi nommé par les it. 249 et
250) : router par `normalizeLanguageForDedup` les cinq sites web qui comparaient
des codes verbatim, et retirer le code mort qui portait un sixième site inerte.

## Affected modules (apps/web)

| Fichier | Changement |
|---|---|
| `components/v2/CanvasV3Scene.tsx` | `sameLanguage` → SSOT ; export `resolveText`/`translationFor` (test) |
| `components/v2/TranslationToggle.tsx` | helper `sameLanguage` ; `startsWith` retiré (l.71) |
| `hooks/use-stream-translation.ts` | helper `sameLanguage` sur clé de fusion + détection pertinence |
| `hooks/use-message-display.ts` | helper `sameLanguage` sur `displayContent`/`replyToContent` (sorties consommées ; `missingLanguages` non consommé laissé intact) |
| `components/common/BubbleMessage.tsx` | suppression du `currentContent` mort |

Tests neufs : `__tests__/components/v2/CanvasV3Scene.resolveText.test.ts`,
`__tests__/components/v2/TranslationToggle.test.tsx`,
`__tests__/hooks/use-message-display.test.ts`,
`__tests__/hooks/use-stream-translation.test.ts`.

## Implementation phases

1. **Canvas V3** — export helpers, écrire test (RED : `fr_FR`/`fra`/`iw` + rang
   Prisme), router `sameLanguage`, GREEN. ✅
2. **use-message-display** (le vivant) — router `displayContent`/`replyToContent`
   (sorties consommées), test renderHook, RED/GREEN. ✅
3. **use-stream-translation** — router fusion + pertinence, test renderHook. ✅
4. **TranslationToggle** — router `startsWith`, test render (variante inline). ✅
5. **BubbleMessage** — retirer `currentContent` mort ; vérifier suites existantes. ✅

## Dependencies

`normalizeLanguageForDedup` (`@meeshy/shared/utils/language-normalize`) — déjà
consommé côté web (`use-message-translations.ts`, `theme.ts`, `flags.ts`). Les
suites web testent la SOURCE de `@meeshy/shared` (pas `dist/`) ; aucun build
préalable requis.

## Estimated risks

Faible — canonicalisation qui ne fait qu'élargir des correspondances légitimes ;
contre-épreuves de non-franchissement dans chaque suite. Retrait de code mort
sans lecteur.

## Rollback strategy

Chaque fichier est indépendant : révoquer un helper `sameLanguage` et restaurer
l'ancien prédicat suffit. Aucun état persistant, aucune migration.

## Validation criteria

- RED prouvé par restauration de l'ancien prédicat, site par site.
- 5 suites langue : 73/73 ; `__tests__/components/v2/` : 275/275 ; Prisme/canvas
  existants : 74/74. Échecs BubbleMessage pré-existants (module resolution).

## Completion status

**COMPLET** — 5 fichiers de prod modifiés, 4 suites de test neuves, RED/GREEN
prouvé partout. Analyse jointe : `docs/routine/analyses/2026-08-23-iteration-251-analyse.md`.

## Progress tracking

- [x] Canvas V3
- [x] use-message-display (vivant)
- [x] use-stream-translation
- [x] TranslationToggle
- [x] BubbleMessage (retrait code mort)
- [x] Analyse + plan
- [x] Validation suites voisines

## Future improvements

- `LanguageSelectionMessageView` — missing-languages vivant (comparaison verbatim
  vs `lang.code` canonique) ; lot séparé (surface + suite affectée par l'échec
  `jest.mock` pré-existant).
- Retrait de la sortie `missingLanguages` non consommée de `use-message-display`
  (passe de nettoyage).
- Backfill base des codes tagués (dernier suivi structurel de l'audit 247).
- Promotion éventuelle d'un `isSameLanguage` partagé dans `language-normalize.ts`
  (le helper est recopié dans 5 fichiers web + gateway).
