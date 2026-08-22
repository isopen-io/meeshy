# `carrierAspect` — S8 révisée : le remap cesse d'être à sens unique

**Décision produit (2026-08-22).** « Il faut loger carrierAspect donc B. »
Option B retenue contre A (généraliser le contournement hors-document).

## Le défaut

`remapFreeAnchor` letterboxe les ancres libres d'un canvas v1 dans l'espace de
scène v3, FIXE en 9:16. La transformation est AFFINE — `y' = top + y·h`, avec
`h = 9/16 ÷ carrierAspect` et `top = (1−h)/2` — donc **inversible**. Mais
`carrierAspect` était JETÉ après usage (`storyEffectsV3.ts:208`) et
`SceneV3Schema` n'avait nulle part où le loger. La conversion devenait à sens
unique : sur un porteur 16:9, `y = 0,90` sortait à `0,6266` sans retour.

Coût réel : la décision « un v1 rouvert migre en v3 à l'enregistrement » faisait
de l'édition d'un ancien contenu une **perte de cadrage de masse**.

Le dépôt le savait déjà : `StoryDraftStore` repersistait le ratio hors document,
par diapositive (table `story_draft_meta`), pour les seuls brouillons — un
pansement local à un défaut global.

## Ce qui a été fait

| Fichier | Changement |
|---|---|
| `packages/shared/types/canvas-v3.ts` | `SceneV3Schema.carrierAspect` — optionnel, positif, fini |
| `services/gateway/.../storyEffectsV3.ts` | le convertisseur LOGE le ratio (hors `sceneCarriesSomething` : un ratio sans objet ne fait pas un contenu, O3) |
| `packages/MeeshySDK/.../CanvasV3.swift` | miroir Swift : champ, init, CodingKeys, decode, encode (Codable MANUEL — 5 sites) |
| `packages/MeeshySDK/.../CanvasV3Migration.swift` | `unmapFreeAnchor` (l'inverse exact) + branché dans `StoryEffects(rendering:)`, mêmes exclusions qu'à l'aller (`bg`, porteur média) |
| `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json` | golden PARTAGÉ : +1 ligne |

## Tests

RED d'abord (4 tests gateway), puis GREEN. **Trois sites gravaient l'ancienne
loi** et ont été réécrits pour énoncer la nouvelle — jamais supprimés :

- `storyEffectsV3.test.ts` — S8 dit désormais les DEUX moitiés : la clé v1
  `canvasAspectRatio` disparaît, sa VALEUR survit sous un nom v3. Sans ça le
  test serait passé par simple non-collision de noms.
- `CanvasV3MigrationTests` — les deux tests qui gravaient la perte. L'un
  d'eux **prédisait sa propre mort** et donnait la recette exacte (« champ de
  scène + jumeau gateway + golden partagé + remap inverse »).
- `StoryEffectsCanvasAspectCodableTests` — l'aller-retour d'encodage COMPLET,
  celui qu'emprunte chaque sauvegarde du composer. Scindé en deux : le fil
  letterboxe toujours (U20 intact), le RETOUR rend la forme et les positions.

Verdicts : gateway **829 suites / 19 187 tests / 0 échec**, web canvas v3
**16/16**, SDK — voir ci-dessous.

## Commentaires périmés fermés au passage

Quatre sites affirmaient encore « iOS ne pose aucun `X-Canvas-Caps` (tâche C4,
ouverte) » — faux depuis le matin même — et citaient un test renommé :
`StoryViewerView+Canvas.swift` (le site nommé en mémoire), les deux gardes
`StoryViewerScenePlayer*GuardTests`, et le message d'assertion de la seconde.

## Ce qui reste OUVERT, délibérément hors de ce lot

1. **La porte du viewer peut tomber.** Elle n'existait que pour cette perte
   (`test_theArchiveIsNeverPaintedThroughAMigration`). Ses deux prémisses sont
   tombées. Mais la retirer change ce que le lecteur PEINT pour toute l'archive
   v1 : ça se mesure et se livre pour soi.
2. **Le contournement `story_draft_meta` n'a plus de raison d'être** et peut
   être retiré.
3. **Android** ne pose toujours aucun `X-Canvas-Caps`.
