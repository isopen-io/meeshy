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

## 10. Android (lot K06 Android, #17617)
Relevé le 2026-11-12 : la fiche d'origine ne décrivait que iOS. Le lot Android la complète ici, sans rien changer aux sections précédentes.

- **Cible** : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/MeeshyToggleRow.kt` (composables : `MeeshyToggleRowFace`, `MeeshyToggleRow`) et `MeeshyToggleRowRecipe.kt` (recette pure, en valeurs : `resolve`, `accessibilityLabel`, `valueFor`, `isChosen`, `veilOpacity`). Miroir des noms iOS, en `camelCase` Kotlin.
- **API** : `MeeshyToggleRow(content, onClick, …)` ; `MeeshyToggleRow(title, onClick, subtitle, accessory, kind, showsDivider, tone, tint, enabled, haptic, icon)` ; `MeeshyToggleRowFace(content, enabled, leading, titleAccessory, trailing)`. Accessoire : `MeeshyToggleRowAccessory` (`None`, `Toggle`, `Check`, `Checkbox`, `Chevron`, `Value`). Variante : `MeeshyToggleRowKind` (`Normal`, `Destructive`, `Accent`). Haptique : `MeeshyToggleRowHaptic` (`Light`, `None`).
- **Icône** : une `ImageVector` (`MeeshyIcons`, équivalents Material des symboles SF) ; l'emplacement `leading` accepte toute composable (l'hôte reste maître du dessin de tête, comme sur iOS).
- **Ton** : `MeeshyGlassTone` de K01 (`Theme` pour l'encre du thème) ; à défaut, `LocalMeeshyGlassTone` (défaut `Deep`, comme `meeshyGlassTone` sur iOS).
- **Gestes** : toute la ligne est la cible (`clickable`, sans indication Material) ; l'appui déclenche une fois au relâcher ; le voile d'appui (encre 15 %, survol 8 %, rayon `MeeshyRadius.sm`, débord `MeeshySpacing.sm`) fond en 200 ms au relâcher et s'applique instantanément à l'appui, sans fondu avec « Réduire les animations ».
- **Haptique** : `rememberMeeshyHaptics().light()` par action, si `haptic == Light` et la ligne est active.
- **Accessibilité** : un seul nœud fusionné ; libellé « titre, sous-titre » ; état lu par `stateDescription` (`a11y_kit_toggle_on` / `_off`, les chaînes déjà générées pour le kit) ; `selected` pour coche et case cochée ; texte pour `Value`. Accessoires et emplacements masqués du lecteur d'écran.
- **Grande police** : à partir de `MeeshyToggleRowRecipe.ACCESSIBILITY_FONT_SCALE` (1,3), l'accessoire passe sous le titre.

**Choix retenus (Android, sans décision produit) :**
1. **Cible 48 dp, visuel 46 dp.** La ligne a une hauteur minimale de 46 dp (`rowMinimumHeight`), mais la zone tactile est portée à 48 dp (plancher Material, `MeeshyControlSize.minTouchTarget`). Le plancher de la plateforme l'emporte sur le 46 pt iOS, qui reste le visuel.
2. **Seuil de grande police à 1,3.** Android n'a pas d'équivalent exact de `isAccessibilitySize` ; le seuil retenu est celui que les réglages système atteignent à la première taille « grande ».
3. **Bascule Material3 inerte** (`onCheckedChange = null`, sémantique effacée) : la piste est teintée `tint ?: Indigo500`. Son animation de pouce est celle du système et ne se coupe pas avec « Réduire les animations » (écart mineur, consigné).
4. **Échantillon « tuile pressée » ignoré**, comme sur iOS (`contentK06` ignore `isPressed`) : le catalogue Android ne fige pas l'appui.

**Jumeaux Android (relevés, aucun rebranché dans K06, comme sur iOS) :**
- `:sdk-ui` `settings/SettingsRow.kt` et `SettingsSwitchRow.kt` (ligne à interrupteur, teinte `Indigo500`, `toggleable`).
- Privés à rebrancher par les lots d'intégration : `AlignToggle`, `PermanentSwitch`, `LoopSwitch` (écrans du composer et de la capture), `AudienceRow`, `PersonRow` (`people/DirectoryPersonRow.kt`).

**Témoins Android :**
- Comportement et recette : `apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/kit/MeeshyToggleRowTest.kt` (recette, hauteur, voile, encres, libellé, valeur ; cible tactile, état lu, sélection, désactivé, un seul déclenchement).
- Instantanés : `KitCatalogSnapshotTest` (feature/kit), images `MeeshyToggleRow/<état>.<variante>.png` sous `apps/android/feature/kit/src/test/snapshots/`, enregistrées par le job `kit-snapshots-record` de `android.yml` (jamais sur un poste).
- Catalogue : `apps/android/feature/kit/src/main/kotlin/me/meeshy/feature/kit/KitCatalogK06.kt` (`entryK06`, seize états, dont dix touchables, miroir de `MeeshyKitCatalog+K06`).

**Relecture du lot Android (2026-11-14), corrections apportées :**
- **L'icône de tête garde sa taille** : le retrait vers le titre (`MeeshySpacing.md`) se pose AUTOUR de l'icône de `MeeshyIconSize.xxl`, et non dedans (l'icône ne tombait qu'à 10 dp).
- **Désactivé, la raison garde son encre** (choix 11, iOS) : tête, titre et accessoire baissent à 62 %, le sous-titre non, et le filet non plus. La ligne entière ne baissait plus d'un bloc.
- **Tête et pastille du titre muettes pour le lecteur d'écran**, comme sur iOS (`accessibilityHidden`) : le titre les nomme.
- **`selected` ne vit que sur la coche et la case** (§ 5) : une bascule dit son état par `stateDescription`, jamais par une sélection en plus ; une coche non retenue est lue « non sélectionnée ». Le composant iOS pose encore `isSelected` sur une bascule ouverte (`isChosen`), à l'inverse de sa propre fiche : écart iOS, hors de ce lot.
- **La coche paraît et s'efface en fondu de 200 ms** (`AnimatedVisibility`, opacité seule, rien sous « Réduire les animations »), le miroir de l'animation d'accessoire d'iOS.

Écarts imposés par la plateforme ou laissés : la tête de ligne en `dp` ne suit pas la taille du texte (iOS : `MeeshyFont.relative`) ; la ligne mesure 48 dp au lieu de 46 dès qu'elle se touche (choix 1) ; l'instantané « pressé » est celui du repos (choix 4).

**Non vérifié localement** : aucun SDK Android dans le conteneur. Compilation, témoins et instantanés ne se prouvent que par `android.yml` sur la PR.
