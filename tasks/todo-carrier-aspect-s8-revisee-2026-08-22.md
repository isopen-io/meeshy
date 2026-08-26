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

## Commentaires périmés — correction RÉVISÉE (2026-08-22, passe suivante)

Cette section prétendait que les quatre sites ci-dessous étaient fermés « au
passage » du travail `carrierAspect`. **C'était faux** : la passe qui a produit
cette fiche n'avait rouvert qu'UN paragraphe par site, alors que l'affirmation
périmée en occupait souvent plusieurs — elle a donc laissé les sites
**partiellement** périmés, et se contredisant eux-mêmes (un paragraphe à jour
juste à côté d'un paragraphe qui ne l'était pas). Vérifié site par site,
fermé pour de bon dans cette même passe :

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1211-1223`
  disait déjà, correctement, que les deux prémisses de la porte étaient
  tombées (en-tête posé, `carrierAspect` répare l'aller-retour) — mais le
  paragraphe SUIVANT, `:1225-1230`, redisait « le lecteur prendra la main le
  jour où C4 posera `X-Canvas-Caps: 3` » et « sans ratio, donc portrait »,
  contredisant le paragraphe qui le précède de deux lignes. Fermé.
- `apps/ios/MeeshyTests/Unit/Views/StoryViewerScenePlayerGuardTests.swift:123`
  n'avait reçu AUCUNE correction : « iOS ne pose AUCUN `X-Canvas-Caps` (tâche
  C4, ouverte) » y restait au présent, intacte. Fermé.
- `apps/ios/MeeshyTests/Unit/Views/StoryViewerScenePlayerDocumentGuardTests.swift`
  portait l'affirmation périmée à QUATRE endroits (~29-33, ~98-105, ~129-134,
  et le message d'assertion de `test_theV1ArchiveKeepsItsDirectHost` à
  ~184-186) alors que ses lignes ~116-127 disaient déjà, correctement, que les
  deux prémisses étaient tombées — le fichier se contredisait lui-même. Les
  quatre fermés.
- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:305-307` portait une
  affirmation périmée voisine mais DISTINCTE (« aucun écrivain n'émet encore
  v3 », confondant le flag `CANVAS_V3_WRITE_STRICT` — qui gate la VALIDATION
  stricte côté gateway, pas l'émission côté client — avec l'état réel des deux
  écrivains, qui émettent v3 depuis leur propre bascule). Elle n'était PAS
  listée dans cette fiche d'origine ; fermée dans cette même passe.

## Ce qui reste OUVERT, délibérément hors de ce lot

1. **La porte du viewer peut tomber.** Elle n'existait que pour cette perte
   (`test_theArchiveIsNeverPaintedThroughAMigration`). Ses deux prémisses sont
   tombées. Mais la retirer change ce que le lecteur PEINT pour toute l'archive
   v1 : ça se mesure et se livre pour soi.
2. **Le contournement `story_draft_meta` n'a plus de raison d'être** et peut
   être retiré.
3. **Android** ne pose toujours aucun `X-Canvas-Caps`.
