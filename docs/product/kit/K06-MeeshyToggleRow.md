# K06 — MeeshyToggleRow (la ligne de liste et sa bascule)

Relevé sur `origin/dev` `7fa7e6239a` le 2026-11-11. Chantier #17312, milestone 258. Issue du lot : #17617. Dépend de K00 et, pour le seul type du ton, de K01. Loi 8 ; lois 3, 12 et 13 pour ce qu'une ligne montre ou tait. Planche : `lrow()` (R11, A14, A15, A17, A18), `.lrow` écrit à la main (O10, R7, R9, A4, A16).

## 1. Rôle
Une ligne de liste qui se touche tout entière : tête optionnelle, titre, sous-titre optionnel, accessoire de fin (bascule, coche, case, chevron, valeur), variante destructive et accentuée, filet entre deux lignes, hauteur de 46 pt au moins.

Elle ne fait pas : la feuille, le titre de feuille, le défilement, les marges (K15) ; la pilule (K11) ; le champ (K08), les puces (K04), la glissière (K05) ; le verre (K01) ; l'état (`isOn`, la sélection viennent de l'hôte) ; le choix d'afficher la ligne (loi 13), la confirmation d'un geste destructif, la navigation, les libellés traduits ; le (i) des réglages, qui se compose autour de `MeeshyToggleRowFace`.

## 2. API (iOS, `MeeshyUI/Kit/MeeshyToggleRow.swift` et `MeeshyToggleRowRecipe.swift`)
- Ligne : `MeeshyToggleRow(_ title:subtitle:accessory:kind:showsDivider:tone:tint:haptic:action:)`, et `MeeshyToggleRow(_ title:systemImage:…)` ; forme générique `MeeshyToggleRow(content:haptic:action:leading:titleAccessory:trailing:)`.
- Dessin seul : `MeeshyToggleRowFace` (libellé d'un `NavigationLink` ou d'un `Menu`, ligne à second contrôle).
- Accessoire : `MeeshyToggleRowAccessory { none, toggle(isOn:), check(isSelected:), checkbox(isChecked:), chevron, value(String) }`.
- Variante : `MeeshyToggleRowKind { normal, destructive, accent }`.
- Haptique : `MeeshyToggleRowHaptic { light, none }`.
- Recette en valeurs : `MeeshyToggleRowRecipe.resolve(accessory:kind:tone:isDark:isEnabled:isPressed:isHovered:tint:)`.

Écart d'API : `resolve` ne prend pas `hasSubtitle` (la fiche le listait). La hauteur est constante à 46 pt avec ou sans sous-titre ; le paramètre n'aurait rien décidé.

Les emplacements `leading`, `titleAccessory` et `trailing` sont génériques ; les deux surcharges sans emplacement (`MeeshyToggleRowNoSlot`) et à icône SF (`MeeshyToggleRowSymbol`) couvrent les cas nominaux.

## 3. États
Un par ligne, avec sa vue dans `MeeshyToggleRowSample` (catalogue) : action, sous-titre, sans-icône, bascule ouverte et fermée, coche, case, chevron, valeur, destructif, accent, désactivé, emplacements, groupe avec filets, ton `theme`, teinte.

Loi 13 : pas de place réservée sans icône ; pas de ligne de sous-titre vide ; pas de coche sur un choix non retenu ; pas de voile ni d'haptique sur une ligne désactivée.

## 4. Gestes et retours
- Toucher n'importe où sur la ligne : `action` part une fois au relâcher dans la cible ; le glissé laisse la liste défiler (c'est le `Button` de SwiftUI qui tranche).
- Voile d'appui : encre × 15 % tant que le doigt est posé, 8 % au survol ; il déborde de `MeeshySpacing.sm` sans changer l'encombrement, rayon `MeeshyRadius.sm`, fondu de 0,2 s au relâcher, instantané à l'appui.
- Bascule : `Toggle` système inerte (`allowsHitTesting(false)`), teinte `tint ?? brandPrimary`, transition sans animation sous « Réduire les animations ».
- Haptique : un `HapticFeedback.light()` par action si `haptic == .light` et la ligne est active.

## 5. Accessibilité
- Un élément par ligne ; libellé « titre, sous-titre » (`MeeshyToggleRowRecipe.accessibilityLabel`, sans virgule orpheline).
- Valeur : « Activé / Désactivé » pour la bascule (clés `kit.glass_button.toggle.on` et `.off`, déjà au catalogue xcstrings, réutilisées telles quelles) ; le texte pour `value` ; `isSelected` pour coche et case cochée.
- Dynamic Type : au-delà de `accessibility1` (`isAccessibilitySize`), l'accessoire passe sous le titre.

## 6. Jetons et mesures
Hauteur 46 (`MeeshyToggleRowRecipe.rowMinimumHeight`), case 24 (`checkboxSide`), désactivé à 62 % (`disabledOpacity`), voiles `MeeshyOpacity.light` et `subtle`, filet `MeeshyBorder.regular` en encre × `subtle`, sous-titre à `onMediaMuted` (70 %), icônes `MeeshyIconSize.xxl / xl / lg`, textes `MeeshyFont.bodySize / smallSize / labelSize`, espacements `MeeshySpacing.md / xxs / xs / sm / lg`. Aucune couleur en dur ; aucun `glassEffect`, `adaptiveGlass`, ni `backdrop-filter`.

## 7. Jumeaux
K06 ne rebranche et ne supprime aucun jumeau. Les lots d'intégration I1, I2, I3, I5 et I10 le feront.

## 8. Témoins
- Comportement : `packages/MeeshySDK/Tests/MeeshyUITests/Kit/MeeshyToggleRowTests.swift` (recette, hauteur, voile, encres, libellé et valeur lus).
- Instantanés : `MeeshyToggleRowSnapshotTests.swift`, images enregistrées par la CI (`sdk-tests.yml`, entrée `record_snapshots`) dans `__Snapshots__/MeeshyToggleRow/`.
- Catalogue : `MeeshyKitCatalog+K06.swift`.

## 9. Écarts connus et choix retenus
Choix retenus (mode autonome) :
1. Piste ouverte à la couleur de marque ; `tint` pour l'accent de la conversation.
2. Bascule système inerte sur iOS (`Toggle`), sans rebranchement de dessin.
3. La ligne est un seul bouton ; l'interrupteur est un dessin inerte.
4. `action` sans valeur ; l'hôte tient l'état.
5. Une hauteur minimale de 46 pt.
6. Filet posé par `showsDivider`, pleine largeur du contenu, 1 pt à 8 %.
7. Icône nue à l'encre de la ligne ; la tuile teintée des réglages passe par `leading` à I10.
8. Le ton vient de K01, dont K06 ne prend que le type.
9. Le (i) des réglages reste hors de la ligne (`MeeshyToggleRowFace`, à I10).
10. `checkbox` entre dans K06 pour R7.
11. Désactivé : tête, titre et accessoire à 62 % ; la raison garde son encre.
12. Sous-titre à 70 %, comme la planche.
13. Aucun jumeau rebranché dans K06.
14. Exécution en sonnet, non en haiku.

Non vérifié localement : aucun compilateur Swift dans le conteneur. La compilation, les témoins et les instantanés ne se prouvent que par la CI.
