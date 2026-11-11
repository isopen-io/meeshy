# K08 — MeeshyField (le champ de saisie de feuille)

Fiche de contrat du lot K08 (#17625, chantier #17312). Le contrat de la planche
(`docs/product/kit/` et `planche.html`, vues A16, A17, A18, O9, O10, P5) fait foi
pour le dessin ; cette fiche fixe l'API et les choix iOS.

## Statut de livraison

- iOS : `packages/MeeshySDK/Sources/MeeshyUI/Kit/MeeshyField.swift` (vue),
  `MeeshyFieldRecipe.swift` (recette en valeurs et loi du plafond), catalogue
  `Kit/Catalog/MeeshyKitCatalog+K08.swift`, témoins `Tests/MeeshyUITests/Kit/MeeshyFieldTests.swift`.
- Android (`me.meeshy.ui.component.kit`) et web (`components/kit/meeshy-field.tsx`) : non livrés
  dans ce lot iOS ; le lot ne porte que la plateforme iOS.
- Instantanés (`MeeshyField/<id>.<variante>`) : non enregistrés (aucun simulateur ici) ; à
  produire par `sdk-tests.yml`.
- Jumeaux supprimés ou rebranchés : aucun dans ce lot (lots d'intégration I2 à I10).

## API iOS

`MeeshyField(label:text:onChange:input:prompt:caption:leading:limit:counter:isBusy:autoFocus:tone:haptic:onSubmit:onCommit:onFocusChange:onLimitReached:onStep:)`

- `MeeshyFieldInput { search, token, sentence, paragraph, numeric }` : table
  clavier, Retour, correction et lignes dans `MeeshyFieldRecipe`.
- `MeeshyFieldLeading { icon(systemImage:), glyph(_:) }`.
- `MeeshyFieldCounter(count:limit:tone:)` et `MeeshyFieldCounterPlacement { inline, hosted }`.
- `MeeshyFieldLimit.count(_:)`, `.truncate(_:to:)`, `.isNear(count:limit:)`.
- `MeeshyFieldHaptic { standard, none }`.
- `MeeshyFieldRecipe.resolve(input:hasCaption:tone:isEnabled:increasedContrast:)`.

## Décisions prises (mode autonome)

Chaque décision a une issue `décision-produit` quand elle engage un coût de changement.

1. Le champ de formulaire (`AuthTextField`, `MeeshyPasswordField`) reste hors kit.
2. Brouillon local ; `onChange` à chaque frappe ; `onCommit` à Retour, à la perte de focus
   et au démontage, uniquement si la valeur a changé depuis le dernier commit.
3. Cinq `input` fermés fixent le clavier, Retour, la correction et les lignes.
4. La croix n'existe que dans `search`, dès qu'il y a du texte, hors occupation.
5. Fond à 8 % de l'encre, sans bord ; le filet n'apparaît que sous « augmenter le contraste ».
6. Compteur en ligne (P5) ou remis à l'hôte (`hosted`, O9, S7) ; visible dès qu'il y a
   du texte ; alerte en couleur ET en gras à 80 %.
7. Plafond : compte en unités UTF-16 ; troncature sur frontière de graphème ; la valeur
   est celle de l'hôte (K08 n'en fixe aucune).
8. O10 : deux champs `numeric` éditables ; `onStep` exposé en action d'accessibilité.
9. Haptique : `light` à la croix, `warning` au franchissement du plafond, `none` possible.

## Écarts à traiter par issue

- Accessoires `trailing` typés `AnyView` : coût de performance à mesurer ; à remplacer par
  un générique si le profil le montre.
- Chaînes du compteur et de la croix via `String(localized:defaultValue:bundle:)` : les clés
  `kit.field.*` ne sont pas encore dans un `.xcstrings` ; à ajouter avec la parité Android.
- Les tests de comportement de la vue (focus, commit, troncature en direct) exigent un hôte
  SwiftUI ; la recette et la loi du plafond sont testées en valeurs.
