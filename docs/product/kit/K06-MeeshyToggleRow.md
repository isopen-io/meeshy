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

## 10. Web (`apps/web/src/components/kit/meeshy-toggle-row.tsx`, lot #17617)

La fiche ne disait rien du web : elle est complétée ici, dans le même lot.

- **API** : `MeeshyToggleRow` (la ligne entière est un `<button>`, `onAction` part une fois au relâcher, `haptic` `light` | `none`, `disabled`) et `MeeshyToggleRowFace` (dessin seul, `isPressed` pour la capture). Mêmes entrées que iOS : `title`, `subtitle`, `accessory` (`none`, `toggle`, `check`, `checkbox`, `chevron`, `value`), `kind`, `showsDivider`, `tone` (type K01, sinon le ton de l'hôte `MeeshyGlassScope`), `tint`, `leading`, `titleAccessory`, `trailing` (ReactNode opaques : l'icône SF devient l'icône que l'appelant passe).
- **Recette** : `meeshy-toggle-row-recipe.ts`, pure, en encres CSS. Aucune couleur en dur : `var(--color-ios-ink)`, `var(--color-on-media)`, `var(--ios-on-media-3)`, `var(--ios-indigo-500)`, `var(--ios-error)`. Mesures : hauteur 46, case 24, désactivé 0,62, voile d'appui 0,15, de survol 0,08, filet à 8 %, sous-titre à 70 %.
- **Voile** : une opacité sur l'encre, pilotée par `:active` (appui instantané) et `:hover` sous `(hover: hover)` (fondu de 0,2 s au relâcher). `data-pressed` le force pour la capture. Seule l'opacité s'anime.
- **Bascule** : dessin inerte (`role="switch"`, `aria-checked`), pas de contrôle natif dans la ligne. Le navigateur lit « activé / désactivé » : aucune chaîne à localiser.
- **Accessibilité** : libellé « titre, sous-titre » (`aria-label`) ; une valeur textuelle est décrite par `aria-describedby` ; coche = `aria-pressed` ; case = `role="checkbox"`. Les emplacements décoratifs sont `aria-hidden`.
- **Clavier et pointeur** : bouton natif (Tab, Entrée, Espace), anneau de focus visible, cible pleine ligne, 46 px minimum.
- **Dynamic Type** : sur le web, la zone de texte passe sous l'accessoire par `flex-wrap` quand le texte s'élargit (pas de seuil de taille JavaScript).
- **RTL** : propriétés logiques ; le chevron se retourne sous `:dir(rtl)`, la bascule aussi.
- **Mode clair / sombre** : `:root.light` (classe posée par `scheme.ts`), défaut sombre.
- **Haptique** : `impact('light')` de `@/lib/view/haptics`, un par action active.

Écarts assumés (décisions prises en mode autonome, consignées dans l'issue `décision-produit` du lot) :
1. Le destructif du thème clair prend `--ios-error-dark` (#991b1b) : l'iOS `errorInk` (#C81E1E) n'est pas mappé par `generate-from-ios.mjs`. La correction est un ajout au générateur, pas une couleur en dur ici.
2. L'accent (mention) est `--ios-indigo-300` en sombre et `--ios-indigo-600` en clair, déclaré dans `kit-toggle-row.css` : `MeeshyColors.mentionColor` n'a pas de jeton.
3. Aucun jumeau rebranché (§ 7) : le lot est un kit, il ne change aucun écran.
