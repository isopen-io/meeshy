# Plan — Itération 278 : le repli de la clé de dedup strippe la région sur iOS

## Objectifs

Fermer le suivi de l'itération 277 (« Divergence de REPLI sur les codes
IRRÉDUCTIBLES tagués région ») : aligner le repli iOS du rapprochement de clés
du Prisme sur les miroirs TS/Kotlin (sous-tag primaire, région strippée), le
donner UN site public, et l'attester par le contrat de vecteurs partagé.

## Modules affectés

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` — nouveau
  `MeeshyUser.normalizeLanguageForDedup(_:)` (public).
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` — `canon`
  du résolveur d'aperçu route par le SSOT (LE correctif).
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
  (`StoryPrismeMatch.base`), `.../MeeshyUI/Story/StoryComposerViewModel+Elements.swift`
  (`normalisedWritingLanguage`), `.../MeeshyUI/Story/TextEditToolOptions.swift`
  (`normalisedCode`) — délégation au SSOT (jumelles unifiées).
- `packages/shared/fixtures/reading-modes/prism-preview.vectors.json` — +3
  vecteurs (30 → 33).
- Tests : `MeeshyUserPreferredContentLanguagesTests.swift` (+1 section, SDK),
  `PrismPreviewVectorTests.swift` (iOS, compteur 30→33),
  `PrismPreviewVectorParityTest.kt` (Android, compteur 22→33).

## Phases

1. **Instruction** — confirmer les trois replis (TS/Kotlin strip sous-tag,
   Swift chaîne entière) par lecture de source. ✅
2. **Contrat** — ajouter 3 vecteurs `yue-HK` (CLÉ / LECTEUR / ORIGINE) ; valider
   VERTS sur le SSOT TS. ✅ (33/33)
3. **Contre-épreuve** — rejouer le repli buggé en TS, prouver les 3 vecteurs
   ROUGES. ✅ (`buggy="Hello"` ≠ `"你哋好"` × 3)
4. **Correctif** — ajouter le SSOT Swift, router les 4 sites. ✅
5. **Tests SDK** — section `normalizeLanguageForDedup` + régression
   `resolvedLastMessagePreview` sur `yue-HK`. ✅
6. **Compteurs** — iOS 33, Android 33. ✅
7. **Validation** — suite `shared` complète verte ; CI iOS/Android autoritatives.

## Dépendances

- `language-normalize-mirror-parity.test.ts` (itération 266) garde déjà
  l'égalité des TABLES ; ce lot garde l'égalité de leur APPLICATION au repli.
- Croisement avec PR #3930 (bump Android 22→30) : ce plan porte Android
  directement à 33 (compteur correct après +3 vecteurs), superséant le 22→30
  partiel. En cas de conflit au merge, 33 est la cible correcte.

## Risques estimés

- **Régression sur code réaliste** → écarté : `normalizeLanguageForDedup` est
  idempotent avec l'ancien inline sur tout code catalogué/réductible/tagué-région
  catalogué ; seul `yue-HK` (irréductible tagué région) change — le défaut visé.
- **Compilation Swift non validable localement** → CI iOS autoritative ; edits
  mécaniques reproduisant un idiome déjà compilé (`StoryPrismeMatch.base`).

## Stratégie de rollback

Retirer les 3 vecteurs, restaurer les 4 inlines Swift et le compteur. Aucune
migration, aucun changement de contrat de fil.

## Critères de validation

- 33/33 vecteurs TS + suite `shared` verte (113 fichiers / 2702 tests). ✅
- Contre-épreuve ROUGE prouvée sur les 3 nouveaux vecteurs. ✅
- Tests SDK `normalizeLanguageForDedup` (yue-HK → yue) + régression preview.
- CI iOS + Android vertes sur les compteurs et rejeux.

## Statut de complétion

**LIVRÉ** (parties validables localement). Correctif Swift + tests SDK/iOS/Android
soumis à la CI de plateforme, autoritative.

## Suivi / améliorations futures

- Divergence `normalizeLanguageCode` sur sous-tag primaire VIDE (`"-US"`) —
  cas malformé, à instruire séparément (voir analyse § Suivi).
