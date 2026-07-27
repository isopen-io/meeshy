# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Surface** : `apps/ios/MeeshyShareExtension/ShareViewController.swift`
(`ShareContentView` + `ContactRow`)
**Axes** : Accessibilité (VoiceOver, contraste, cible tactile) · HIG (contrôle
natif) · i18n
**Base** : `main` HEAD `ffef1339e` — 0 PR ouverte au moment de l'itération

## Contexte

Le tracking listait `MeeshyShareExtension/ShareViewController.swift` l.519-527
en piste depuis 208i (« sélection contact état couleur-seule, manque trait
`.isSelected` »), jamais traitée. La surface a été auditée intégralement plutôt
que sur ce seul point.

L'extension est déclarée dans `project.yml` (`app-extension`,
`deploymentTarget: 16.0`) et n'avait encore reçu aucune passe UI/UX. Cinq écarts
réels, tous dans la même vue.

> **⚠️ CORRECTION (portée réelle).** Cette analyse affirmait initialement que la
> surface était « atteignable par l'utilisateur (feuille de partage système →
> Meeshy) ». **C'est faux, et l'affirmation n'avait pas été vérifiée.**
> `MeeshyShareExtension` est **délibérément absent des `dependencies` de l'app**
> (`project.yml`, commentaire explicite) : l'embarquer fait échouer l'archive de
> distribution, le bundle id `me.meeshy.app.share-extension` n'étant pas
> enregistré pour la signature. Le target reste compilable isolément, **mais il
> n'est jamais livré**. L'itération 220i a par ailleurs relevé que le chemin
> d'envoi ne mène nulle part (`saveSharedContent` écrit `pending_shared_content`,
> que personne ne lit) et a **abandonné sur constat** la piste i18n de cette même
> extension.
>
> Ce lot est donc du **travail préparatoire sur du code non livré**, pas une
> amélioration de l'expérience utilisateur courante. Il reste correct, additif et
> sans risque — il vaudra le jour où le dossier de signature sera complété — mais
> il ne doit pas être compté comme un gain utilisateur, et la piste ne doit pas
> être poursuivie tant que l'extension n'est pas embarquée.

## Écarts constatés

### A. `ContactRow` — aucun contrat d'accessibilité (WCAG 1.1.1 / 1.4.1 / 4.1.2)
La rangée est un `HStack` de quatre fragments (avatar, nom, statut, checkmark).
Aucun `.accessibilityElement`, aucun label, aucun trait :
- VoiceOver s'arrête sur chaque fragment (« John Doe », « Online », « Checkmark
  Circle Fill ») sans jamais dire que la rangée est l'élément qu'on active ;
- l'état sélectionné n'est porté que par `Color.blue.opacity(0.1)` + le glyphe
  `checkmark.circle.fill` → **couleur/forme seules** ;
- le décor (dégradé d'avatar, checkmark) est lu comme du contenu.

### B. `ContactRow` — sélection par `.onTapGesture` sur un conteneur nu
`ContactRow(...).onTapGesture { selectedContactId = contact.id }` : pas de trait
`.isButton`, pas de retour visuel au press, pas de focus Full Keyboard Access,
pas d'interaction pointeur iPad. C'est la réimplémentation d'un `Button`.

### C. Boutons « Cancel » / « Send » — cible tactile réduite au glyphe
`Button("Cancel") { … }.frame(maxWidth: .infinity).padding().background(…)` :
`.frame` et `.padding` appliqués **à l'extérieur** du `Button` dessinent bien la
pilule pleine largeur, mais la zone interactive d'un `Button` est définie par la
content shape de son **label**. Seul le texte était donc tappable — le reste de
la pilule (l'essentiel de sa surface) était inerte. Violation HIG « 44×44 pt ».

### D. « Send » désactivé — libellé illisible (WCAG 1.4.3)
`.background(selectedContactId != nil ? Color.blue : Color.secondary.opacity(0.2))`
combiné à `.foregroundColor(.white)` **inconditionnel** : tant qu'aucun contact
n'est choisi, le libellé est blanc sur un gris très clair (≈ 1.2:1 en clair). Le
bouton principal de l'écran apparaît vide jusqu'à la sélection.

### E. i18n — trois chaînes brutes hors convention
`Button("Cancel")`, `Button("Send")` et `.navigationTitle("Share to Meeshy")`
étaient des littéraux, alors que le fichier utilise déjà `String(localized:
defaultValue:)` (5 occurrences, namespace `share.*`).

## Correctifs (221i)

1. **A** → sur `ContactRow` : `.contentShape(Rectangle())`,
   `.accessibilityElement(children: .ignore)` (4 fragments → 1 arrêt, décor
   écarté), `.accessibilityLabel(contact.name)`,
   `.accessibilityValue(contact.status ?? "")` (le statut reste annoncé comme
   valeur, pas perdu), `.accessibilityAddTraits(isSelected ? [.isButton,
   .isSelected] : [.isButton])`. L'état sélectionné est désormais **localisé par
   iOS → 0 clé i18n neuve** (doctrine 144i/149i/155i/163i/176i/194i).
2. **B** → le call-site enveloppe la rangée dans un vrai `Button` +
   `.buttonStyle(.plain)` (préserve strictement les couleurs de la rangée). Le
   `.onTapGesture` disparaît du fichier.
3. **C** → `.frame(maxWidth: .infinity)` et `.padding()` déplacés **dans** le
   `label:` des deux boutons. Géométrie de rendu identique (frame puis padding,
   même résolution de mise en page) ; la pilule entière devient tappable.
4. **D** → `.foregroundColor(selectedContactId != nil ? .white : .secondary)`.
5. **E** → `share.cancel`, `share.send`, `share.title` en
   `String(localized:defaultValue:)`, alignés sur le namespace `share.*` du
   fichier. L'extension n'a pas de `Localizable.xcstrings` : les clés retombent
   sur leur `defaultValue` comme les 5 existantes, mais deviennent extractibles
   le jour où un catalogue sera ajouté à la cible. **0 régression visuelle.**

Aucun changement de logique métier, de réseau, ni de layout rendu.

## Vérification

- `apps/ios/MeeshyTests/Unit/Views/ShareExtensionAccessibilityTests.swift`
  (6 tests). `MeeshyShareExtension` étant une cible `app-extension` séparée, ses
  types ne sont pas linkables depuis `MeeshyTests` → tests par introspection de
  source, idiome déjà établi par `ConversationInfoSheetAccessibilityTests` /
  `CallViewAccessibilityTests` (résolution du chemin via `#filePath` remonté de
  4 niveaux jusqu'à `apps/ios/`).
- Les 6 assertions ont été évaluées déterministiquement hors Xcode (comparaison
  de chaînes sur le fichier réel) avant commit — parade au piège test/prod qui
  avait fait échouer #2263.
- Compile non reproductible localement (pas de toolchain Swift dans
  l'environnement) → gate = CI `iOS Tests`. API utilisées toutes ≥ iOS 13/15,
  cible à 16.0 : surcharges `StringProtocol` de `navigationTitle` /
  `accessibilityLabel` / `accessibilityValue`, `String(localized:defaultValue:)`
  (clé `StaticString`, forme déjà employée 5× dans le fichier),
  `AccessibilityTraits.isSelected`, `.buttonStyle(.plain)`.

## Statut

Écarts A–E **résolus**. Ne plus re-flagger `ContactRow` (contrat VoiceOver +
trait `.isSelected` soldés) ni les boutons d'action de `ShareContentView`
(cible tactile, contraste désactivé, i18n soldés).

## Reste à faire sur cette surface (222i+)

- ~~`SharedItemPreview` (l.420-470)~~ — **traité en 222i**
  (`2026-07-26-iteration-222i-shareextension-itempreview.md`) : tuiles repliées en
  un élément nommé, tuile `.image` enfin nommée, en-tête « Send to » passé en
  `.isHeader`.
- Le champ de recherche de contacts n'a pas de `.accessibilityLabel` (le
  placeholder tient lieu de nom — acceptable, à confirmer à l'Inspector).
- Ajouter un `Localizable.xcstrings` à la cible `MeeshyShareExtension` : sans
  catalogue, les 8 clés `share.*` ne se traduisent dans aucune locale. Chantier
  distinct (touche `project.yml` + ressources), à isoler dans sa propre
  itération.
