# K05 — MeeshyLabeledSlider (le curseur d'un réglage continu)

Relevé sur `origin/dev` `371d02c4a8` le 2026-11-11. Chantier #17312, milestone 258. Issue du lot : #17598. Dépend de K00 (#17335). Lois 9 et 10 de `docs/product/composer-vue-finale.md`. Planche : `slider(label,pct,val)` (ligne 229), `.sl`, `.sl .hd`, `.sl .tr` (lignes 71 à 75), employés par A2, A3, A13, O5 et, par `soundRows()`, A15.

## 1. Rôle
Régler UNE valeur continue entre deux bornes : le nom à gauche, la valeur lue à droite, une piste fine et un pouce dessous.

Il ne fait pas : le texte de la valeur, les bornes, le pas ni le neutre (l'app les calcule et les passe) ; le pas d'annulation, l'aperçu en direct, « Réinitialiser » tout (O5), « comparer », Muet (l'hôte) ; son conteneur ni aucun verre (K05 n'appelle pas K01) ; un choix à deux à quatre crans nommés (K03) ; deux poignées (K21) ; une position de lecture ; une poignée de partage d'écran.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyLabeledSlider.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-labeled-slider.tsx` |
|---|---|---|---|
| Curseur | `MeeshyLabeledSlider(_:value:in:step:valueText:…)` | `MeeshyLabeledSlider(label, value, onValueChange, valueText, modifier, …)` | `<MeeshyLabeledSlider label value min max valueText onChange … />` |
| Piste seule | `MeeshySliderTrack` | idem | `<MeeshySliderTrack>` |
| Loi pure | `MeeshyLabeledSliderRule` : `snap`, `fraction`, `value(atFraction:)`, `adjusted(_:up:coarse:)`, `detentCrossed`, `shouldEmit` | idem | `meeshyLabeledSliderRule` |
| Recette | `MeeshyLabeledSliderRecipe.resolve(tone:isEnabled:isPressed:isOffNeutral:tint:reduceMotion:)` | idem | `meeshyLabeledSliderRecipe(...)` |

Paramètres opaques, mêmes défauts partout : `label` (obligatoire, non vide), `valueText` (obligatoire, annoncé), `range`, `step: Double? = nil` (TAILLE du pas, `nil` = continu), `showsValue = true`, `neutral: Double? = nil`, `resetLabel: String? = nil` (exposée seulement si `neutral` existe), `tint: Color? = nil`, `haptic: MeeshyLabeledSliderHaptic { light, none } = light`, `onEditingChanged: ((Bool) -> Void)? = nil`. Le ton vient de `\.meeshyGlassTone`, jamais d'un paramètre.

## 3. États
Repos avec valeur (A2, A3, A13, A15), repos sans valeur (O5), borne basse (O5), pouce tenu (agrandi, halo), écarté du neutre (encre pleine), désactivé (contenu à 40 %, ni geste ni haptique), teinté, ton `theme`, focus clavier, piste seule.

Loi 13 : pas de valeur ⇒ aucune place gardée ; pas de crans, bulle, glyphes − / +, bouton de remise propre ; rien d'actif sur un curseur désactivé. Un réglage que le média n'offre pas n'est pas monté par l'hôte.

## 4. Gestes et retours
- Glisser horizontal : le pouce suit le doigt ; valeur bornée puis calée sur le pas ; un changement au plus par image, seulement si la valeur calée change.
- Toucher bref sur la piste : le pouce y va. Un glissé vertical reste à l'hôte.
- `onEditingChanged(true)` au début du geste ; `(false)` au lever, à l'annulation, à la disparition doigt posé, et après chaque ajustement au clavier ou au lecteur d'écran.
- Avec `neutral` : deux touchers sur la valeur la remettent au neutre.
- Haptique `light` quand la valeur franchit le neutre ou une borne, et à la remise ; jamais par pas.
- Pouce tenu : échelle 1,2, halo 32 %, ressort rapide ; « Réduire les animations » : pas d'échelle, le halo reste.
- Valeur changée par l'hôte : le pouce glisse en 200 ms ; jamais d'animation pendant le glissé.

## 5. Accessibilité
- Un seul élément : nom = `label`, rôle réglable, valeur = `valueText`. Les deux textes visibles sont masqués.
- Balayage VoiceOver / TalkBack : 5 % de l'étendue, arrondi au pas, un pas au moins. Flèches : le pas (1 % si continu). Début / Fin : les bornes.
- Remise au neutre : action nommée `resetLabel`.
- Cible : 44 pt, 48 dp, 44 px sur toute la largeur, centrée sur la piste.
- Dynamic Type `fontScale` 2,0 : le nom passe à deux lignes, la valeur garde sa ligne.
- RTL : nom au bord de début, valeur au bord de fin, remplissage depuis le bord de début.
- Contraste : nom 16,8:1 sur panneau opaque, 6,1:1 sur verre dense ; valeur 12,4:1 et 5,0:1 ; pouce et remplissage au moins 5:1.

## 5 bis. Performance
- Ne se re-rend pas : `Equatable` sur les valeurs, fermetures hors comparaison (iOS).
- S'anime : translation et échelle du pouce, opacité du halo. Jamais la mise en page, ni un flou (hors ombre fixe du pouce).
- Aucune image perdue en glissant ; rien de retenu une fois l'écran quitté.

## 6. Jetons et mesures
Mesures de la planche : écart 7 entre l'en-tête et la piste ; nom 12,5 semi-gras ; valeur 12 à 70 % ; piste haute de 4, rayon 2 ; pouce 20, blanc, ombre y 2, flou 6, noir 35 % ; O5 : deux colonnes de 162, écarts 12 et 18.
Jetons : `MeeshyColors.onMedia`, `onMediaSecondary` (85 %), `mediaHairline` (20 %) ; `MeeshyFont.subheadSize` et `smallSize` ; `MeeshySpacing.xsPlus` et `sm` ; `MeeshyControlSize.tapTarget` ; `MeeshyAnimation.springFast` ; `MeeshyMotion.shouldReduce`.
Les valeurs propres (piste 4, pouce 20, halo 32 %, échelle 1,2, désactivé 40 %, ombre) vivent dans `MeeshyLabeledSliderRecipe`, nulle part ailleurs. Aucune couleur en dur, aucun verre.

## 7. Jumeaux
K05 ne rebranche et ne supprime aucun jumeau : le rebranchement change l'écran et revient aux lots d'intégration (I3 à I10, K21). Jumeaux de référence : `MediaVolumeSlider` (`MeeshyUI/Media/MediaTrimStrip.swift`) pour la grammaire (nom, valeur lue, neutre, remise à deux touchers, action nommée), et la piste de `ComposerFlashIntensitySlider` pour le dessin.

## 8. Témoins exigés
- Comportements : `MeeshyLabeledSliderTests` (iOS) — loi (bornage, calage, fraction, RTL, ajustement, franchissement) et recette (repos, tenu, désactivé, écarté, réduire les animations).
- Parité : `docs/product/kit/K05-MeeshyLabeledSlider.vectors.json`, lu par les trois suites.
- Instantanés : `MeeshyLabeledSlider/<id>.<variante>` (`valeur`, `sans-valeur`, `borne-basse`, `neutre`, `teinte`, `theme`, `desactive`, `piste-seule`, `grille`) en clair et sombre, planches `grande-police` et `rtl` ; enregistrés par la CI.
- Catalogue : entrée K05 (`MeeshyKitCatalog+K05.swift`).

## 9. Écarts connus et choix retenus (mode autonome)
1. Piste et pouce dessinés à la géométrie de la planche, sur le composant SwiftUI, avec `accessibilityElement` ; pas de curseur système.
2. Le pouce est un disque blanc plein sur toutes les versions d'iOS : un verre ne se pose pas sur un verre.
3. Nom et valeur au-dessus de la piste partout ; les icônes de bout de piste disparaissent.
4. K05 sait taire la valeur et l'annonce toujours.
5. Remise au neutre par deux touchers sur la valeur ; action nommée conservée.
6. Valeur à `onMediaSecondary` (85 %) : 5,0:1 sur verre dense.
7. Remplissage blanc par défaut, `tint` pour l'accent d'une conversation.
8. Le pouce reste dans la piste : son centre va de 10 à largeur − 10.
9. Toucher la piste y porte le pouce ; seul le glissé horizontal règle.
10. Un tic au neutre, aux bornes et à la remise, aucun par pas.
11. Horizontal seulement ; le curseur vertical du flash reste dans l'app (I4 statue).
12. La piste seule est un type public, `MeeshySliderTrack`.
13. Pas d'ajustement de 5 % de l'étendue (coarse), 1 % si continu.
14. Les curseurs des appels partent à I10 ; K05 n'est pas une dépendance d'I1.
15. Exécution : composant iOS livré dans ce lot ; Android et web suivent leurs lots.
