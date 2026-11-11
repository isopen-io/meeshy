# K09 — MeeshyProgressRing (l'anneau de progression)

Relevé sur `origin/dev` `f4f2b928ac` le 2026-11-11. Chantier #17312, milestone 258 ; issue du lot #17626. Dépend de K00 ; lit le ton de K01 (`\.meeshyGlassTone`). Lois 11 et 16 de `docs/product/composer-vue-finale.md`, et la loi 13 (états). Planche : `ring(pct,s,txt)` (ligne 269), l'anneau de `thumb(…:up)` (204) et celui de `recBody()` (222), montrés par P1 (352 : `ring(62,44)` dans Publier), A7 (306 : `snow:up`, 60 %) et A9 (309 : arc rouge du déclencheur).

## 1. Rôle
Un seul anneau dit où en est une opération en vol (publier, envoyer, enregistrer, télécharger, filmer) : une piste, un arc qui avance depuis midi, et au centre un chiffre ou ce que l'hôte y pose.

Il ne fait pas :
- le calcul de la progression, ses phases ni son plafond (`downloadShare`, `ringFraction`, `ringProgress` restent à l'app) ;
- le libellé voisin (« Publication… » : K13), la vignette, son attente et son échec (K20), la capsule Réessayer (K14) ;
- le déclencheur : anneau blanc au repos, geste, cadenas, pulsation (I4) ;
- l'annulation au toucher : l'hôte pose son bouton, l'anneau ne se touche pas ;
- le retour haptique et l'annonce de fin ; la disparition à 100 % (l'hôte le retire) ;
- aucun verre, aucune barre linéaire, aucun indicateur de chargement d'écran, aucune jauge d'une mesure fixe.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyProgressRing.swift` | Web `components/kit/meeshy-progress-ring.tsx` |
|---|---|---|
| Anneau | `MeeshyProgressRing(progress:label:valueText:diameter:tint:showsPercent:sweeps:scrim:tone:center:)` | `<MeeshyProgressRing progress label valueText diameter tint showsPercent sweeps scrim tone>{center}</MeeshyProgressRing>` |
| Teinte | `MeeshyProgressRingTint { ink, solid(Color), gradient([Color]) }` | `'ink' \| { solid: string } \| { gradient: readonly string[] }` |
| Recette en valeurs | `MeeshyProgressRingRecipe.resolve(progress:diameter:sweeps:showsPercent:hasCenter:tone:reduceMotion:increasedContrast:)` (`MeeshyProgressRingRecipe.swift`) | `meeshyProgressRingRecipe(...)` (`meeshy-progress-ring-recipe.ts`) |
| Valeur dite | `MeeshyProgressRingWords.spokenValue(percent:valueText:bundle:locale:)`, clé `kit.progress_ring.busy` (« En cours ») | idem |

Android : non livré ici (lot Android séparé, `me.meeshy.ui.component.kit`).

Paramètres opaques, mêmes défauts : `progress` (fraction 0…1, absente = indéterminé, hors bornes ramenée, non-nombre = 0) ; `label` (obligatoire, `nil` = décoratif, sort de l'arbre) ; `valueText` ; `diameter = 44` (bord extérieur, borné de 10 à 120) ; `tint = ink` ; `showsPercent = true` ; `sweeps = false` ; `scrim = false` ; `tone` (celui de l'hôte par défaut).

Un emplacement : `center`, qui remplace le chiffre. Masqué aux lecteurs d'écran, borné au cercle intérieur.

## 3. États
- Déterminé avec pourcentage : P1 (40, « 62 % »).
- Déterminé petit, chiffre seul, disque d'ombre : A7 (22, « 60 »).
- Déterminé grand, teinté, centre posé par l'hôte : A9 (102, arc rouge, carré d'arrêt).
- Indéterminé : `indetermine` (balayage de 18 %, sans chiffre).
- Arc figé avec balayage (`sweeps`) : `fige`.
- Ligne sans chiffre sous 22 pt, sans valeur dite : `ligne`.
- Ton `theme` : `theme`.
- Décoratif (`label: nil`) : dans K13, K20 ou un bouton d'annulation.

Loi 13 : pas d'anneau sans opération ; pas de chiffre en indéterminé, sous 22, ni quand `center` est rempli ; pas de signe % sous 40 ; pas de balayage sur un arc qui avance ; pas de libellé, de coche de fin, d'erreur ni d'attente dans K09.

## 4. Gestes et retours
- Aucun geste : `allowsHitTesting(false)`.
- L'arc rejoint chaque nouvelle valeur en 200 ms, linéaire ; aucun ressort.
- Indéterminé ou balayé : un arc de 18 % tourne en 1,1 s, linéaire, sans fin.
- « Réduire les animations » : l'arc saute à sa valeur, le balayage reste à midi.
- Haptique : aucun dans K09.

## 5. Accessibilité
- Nom : `label`. Valeur : `valueText`, sinon le pourcentage (« 62 % »), sinon « En cours ».
- Rôle : un `ProgressView` représenté (`accessibilityRepresentation`), trait `.updatesFrequently`.
- Dynamic Type : diamètre figé ; le chiffre se réduit jusqu'à 60 %.
- RTL : l'arc part de midi, sens horaire, sans reflet.
- Contraste : l'encre contre le fond de marque 4,5:1 ; « Augmenter le contraste » : piste à 60 %.

## 5 bis. Performance
- Le chiffre ne change qu'au pourcentage entier.
- iOS : la rotation est une `rotationEffect` répétée, sans `TimelineView` ni minuteur.
- Aucun `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni code de couleur hors jetons.

## 6. Jetons et mesures
Géométrie, dans `MeeshyProgressRingRecipe` et nulle part ailleurs :
- trait : 1,5 sous 22 ; sinon `round(diamètre / 11)` borné de 3 à 6 ;
- rayon de l'arc : (diamètre − trait) / 2 ; arc dessiné : `max(progress, 0,001)` ;
- chiffre : `MeeshyFont.microSize` de 22 à 39, `MeeshyFont.smallSize` à partir de 40 ; signe % à partir de 40 ;
- balayage 18 %, 1 100 ms ; transition 200 ms ; piste 30 %, 60 % en contraste accru.

Jetons : encre `MeeshyColors.onMedia` (ton `theme` : l'encre du thème) ; disque d'ombre `MeeshyColors.scrim` ; rouge de A9 passé par l'hôte (`MeeshyColors.error`).

Parité : `docs/product/kit/K09-MeeshyProgressRing.vectors.json` (trait, rayon, pourcentage, centre, plancher de l'arc, balayage, opacités, encre, valeurs dites en fr, en et ar), lu par les suites.

## 7. Jumeaux
K09 ne rebranche et ne supprime aucun jumeau dans ce lot : le brancher changerait l'écran (taille, trait, chiffre). Il promeut la grammaire et les témoins du plus complet ; les lots d'intégration suppriment.
- iOS. DEVIENT : `StorySaveProgressRing` (balayage à phase monotone, `StorySaveProgressRingTests`), enrichi de la piste et du centre de `ComposerShutterRing` et de l'indéterminé de `ComposerSceneIntakeGhost`.
- iOS, supprimés par les lots d'intégration : `ComposerSceneIntakeGhost.ring` (I3), la piste et l'arc de `ComposerShutterRing` (I4, le type reste l'hôte), `DownloadBadgeView.downloadingBadge`, `UploadProgressGlyph`, `StoryTrayView` (envoi), `MeeshyVideoPlayer` (`downloadProgressRing`, renderers) et le dessin de `StorySaveProgressRing` (I10).
- Hors K09 : `ProfileCompletionRing`, `LevelRingView`, `AchievementBadge`, anneaux de statistiques, `BloodRitualView`, `AudioPlayerPlayButtonLabel`, `ComposerTriggerOutlineStyle.gauge`, barres linéaires, indicateurs de chargement d'écran. `ComposerCaptureProgressDisplay` est une loi pure : elle reste la source de l'hôte.

## 8. Témoins exigés
Comportements (`MeeshyProgressRingTests`, `MeeshyProgressRingTest`, `meeshy-progress-ring.test.tsx`) : vecteurs de trait, rayon, pourcentage et centre pour 14, 22, 40, 44 et 102 ; fraction bornée, non-nombre sans exception ; progression absente sans chiffre ; `center` rempli sans chiffre ; nom, rôle et valeur ; `valueText` prioritaire ; `label: nil` retire l'élément ; sous « réduire les animations », aucune transition ni rotation ; RTL ; contraste calculé depuis la recette ; garde de source (ni verre ni code de couleur).

Instantanés (`MeeshyProgressRing/<id>.<variante>`) : `publication`, `vignette`, `declencheur`, `indetermine`, `fige`, `ligne`, `theme` en `clair` et `sombre`, planches `grande-police` et `rtl`. Les images sont enregistrées par la CI (`sdk-tests.yml`), jamais posées à la main.

Catalogue : entrée K09 (`MeeshyKitCatalog+K09.swift`). Vues : `publication` P1 sur `dark`, `vignette` A7 et `declencheur` A9 sur `media`, `indetermine` et `fige` sur `dark`, `ligne` et `theme` sur `light`.

## 9. Écarts connus et choix retenus
Écarts relevés :
- La planche dessine le même anneau trois fois, avec trois jeux de valeurs ; le contrat borne les tailles de 22 à 48 alors que A9 mesure 102 et que le code descend à 10.
- Planche : le nom porte la valeur (« Publication 62 % ») ; l'anneau de vignette n'a pas de rôle.
- iOS : aucun anneau sur Publier ; le déclencheur fait 76 au trait de 5 et se tait pour VoiceOver.
- Arrondi : troncature (`ProfileCompletionRing`, `DownloadBadgeView`) ou plus proche (`StorySaveProgressRing`, web) ; K09 arrondit au plus proche.

Choix retenus (mode autonome) :
1. Diamètre libre de 10 à 120, mesuré au bord extérieur, passé par jeton ; P1 passe 40.
2. Une loi de trait dans la recette.
3. Fraction 0…1 optionnelle, absente = indéterminé, arrondi au plus proche.
4. Chiffre affiché par défaut, signe % à partir de 40, remplacé par `center`.
5. A9 : K09 dessine la piste et l'arc ; le déclencheur reste l'hôte.
6. Indéterminé aux valeurs de la fiche, 18 % en 1,1 s, dessiné par le kit.
7. Sous « réduire les animations », balayage immobile, sans fondu.
8. Encre du ton, piste à 30 % de la même encre ; le rouge est passé par l'hôte.
9. Disque d'ombre optionnel, jamais de verre.
10. Nom et valeur séparés ; `label: nil` pour un hôte qui parle ; jamais interactif.
11. Sens horaire, non reflété en RTL.
12. Un point à midi dès 0 %.
13. Aucun jumeau rebranché dans K09 : les lots d'intégration suppriment (cohérent avec K07).
14. Jauges d'une mesure fixe et barres restent hors de K09.
15. Aucun haptique dans K09.
16. Chaîne `kit.progress_ring.busy` ajoutée au catalogue de MeeshyUI (sept langues) ; non reprise par Android à ce stade (comme `kit.color_dots.position`).
