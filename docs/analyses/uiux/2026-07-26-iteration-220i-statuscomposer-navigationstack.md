# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
**Axes** : intégration plateforme native (HIG) — conteneur de navigation déprécié
· accessibilité — nom accessible d'un bouton pendant son action
**Base** : `main` HEAD `ffef1339e` · Branche `claude/quirky-curie-2pvzn1`

## Contexte

Le pointeur 219i listait en piste (d) : « `StatusComposerView`
`NavigationView`→`NavigationStack` **dès #2275 mergée/close**, puis réduire
l'attendu de `NavigationContainerMigrationTests` à l'ensemble vide ». #2275 est
mergée (elle est dans `main`), et `list_pull_requests` (open) renvoie
**0 PR ouverte** sur tout le dépôt → **0 collision d'essaim**, le verrou est levé.

## Défaut A — dernier `NavigationView` de l'application

`NavigationView` est **déprécié depuis iOS 16** et, surtout, son style par défaut
est `DoubleColumnNavigationViewStyle` : à largeur *regular*, un `NavigationView`
à enfant unique se rend comme une **vue divisée dont la colonne de détail est
vide**, et ses `ToolbarItem(placement: .navigationBar…)` atterrissent dans la
barre de la mauvaise colonne. Aucune parade `.navigationViewStyle(.stack)`
n'était posée ici.

Ce n'est pas théorique pour ce composeur : ses **trois** points de présentation
sont des `.sheet`

| Site | Présentation |
|---|---|
| `RootViewComponents.swift:742` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |
| `ConversationListView.swift:755` | `.sheet(item:)` (republication) + detents |
| `ConversationListView.swift:766` | `.sheet(isPresented:)` + detents |

— et sur iPad une `.sheet` est présentée en *form sheet*, donc **à largeur
regular**. Les deux affordances de la barre (« Fermer » en `navigationBarLeading`,
« Publier » en `navigationBarTrailing`) sont exactement le contenu que ce style
déplace ; « Publier » est l'**unique** chemin de publication de l'écran.

Le plancher de déploiement est **iOS 16.0** (`project.yml`) → `NavigationStack`
est disponible **inconditionnellement**, sans garde `@available` ni couche de
compatibilité. Le fichier ne contient **aucun** `NavigationLink`,
`navigationDestination` ni `navigationViewStyle` : la substitution est mécanique
et sans effet de bord (la `.sheet` du sélecteur d'audience est attachée à
`visibilityPicker`, à l'intérieur, et n'est pas concernée).

Après ce changement, le balayage des 3 cibles (`Meeshy`,
`MeeshyShareExtension`, `MeeshyNotificationExtension`) rend **l'ensemble vide** :
la migration ouverte en 214i est **terminée** côté application.

## Défaut B — le bouton « Publier » perd son nom accessible pendant qu'il publie

```swift
} label: {
    if isPublishing { ProgressView()… } else { Text("Publier")… }
}
```

Le libellé du bouton est **entièrement remplacé** par un `ProgressView` nu
pendant la publication. Un `ProgressView` sans libellé n'expose aucun nom
accessible : le bouton devient donc, pour VoiceOver, **un bouton anonyme au
moment précis où il est occupé** — l'utilisateur qui revient dessus n'apprend ni
ce qu'il fait, ni qu'il est en cours. Le spinner est par ailleurs une
information **purement visuelle** (WCAG 1.4.1 / 4.1.2 : état signalé par la seule
apparence).

Second écart sur le même contrôle : il est `.disabled(selectedEmoji == nil || …)`
et la **raison** du blocage — « aucun emoji choisi » — n'est portée que par le
dégradé grisé du texte, là encore une information visuelle seule.

### Correctif

Miroir **strict** de la doctrine déjà posée sur
`CreateTrackingLinkView.createButton` (nom épinglé à l'action, état transitoire
en valeur, raison du blocage en indication) :

```swift
.accessibilityLabel(String(localized: "status.composer.publish", …))     // stable
.accessibilityValue(isPublishing ? "Publication en cours" : "")
.accessibilityHint(selectedEmoji == nil ? "Choisissez un emoji…" : "")
```

- Le **libellé réutilise la clé du texte visible** (`status.composer.publish`)
  → parité voix/visuel, **0 clé neuve** pour le nom.
- La valeur et l'indication sont **vides** hors de leur état : rien n'est ajouté
  au parcours VoiceOver nominal.
- Le `Text` visible et le `ProgressView` restent inchangés : **0 changement
  visuel**.

**2 clés a11y neuves** (`a11y.status.publish.in-progress`,
`a11y.status.publish.disabled.hint`), ajoutées à `Localizable.xcstrings`
**traduites dans les 7 locales** du catalogue (`ar`, `de`, `en`, `es`, `fr`,
`it`, `pt-BR`) — doctrine 190i/195i : une chaîne d'accessibilité non traduite est
lue par VoiceOver dans la mauvaise langue. Insertion **purement additive**
(aucun réordonnancement du catalogue, formatage identique aux entrées voisines).

## Tests

1. **`NavigationContainerMigrationTests`** (existant) : ajout de
   `test_statusComposer_usesNavigationStack`, et
   `test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`
   avec attendu **`[]`**. Le test cesse d'être un *pin* de dette pour devenir un
   **invariant** : toute réintroduction du conteneur déprécié échoue.
2. **`StatusComposerAccessibilityTests`** (neuf, 4 tests) : nom accessible
   présent, état en cours exposé, indication de désactivation présente **et
   conditionnelle**, et — ce que l'introspection de source ne couvre pas — les
   2 clés neuves **présentes dans les 7 locales** du catalogue (lecture JSON
   réelle du `.xcstrings`).

Ancre du bloc de modificateurs : `.disabled(selectedEmoji == nil || isPublishing)`,
**unique dans le fichier** (vérifié) — l'assertion ne peut pas viser un autre
bouton.

## Vérification

Toolchain Swift indisponible (Linux) → les assertions sont vérifiées
**déterministiquement** hors Xcode par correspondance de chaînes et lecture JSON,
puis la CI `iOS Tests` sert de portail.

- Balayage des 3 cibles après migration → offenders = **∅** ✔
- `NavigationView {` = 0 / `NavigationStack {` = 1 dans le fichier ✔
- Aucun `NavigationLink` / `navigationDestination` / `navigationViewStyle` ✔
- Les 4 assertions de la suite a11y, rejouées à l'identique en Python : 4/4 ✔
  (la fenêtre d'ancre a été portée à 1 000 caractères — l'indication tombait à
  713, hors d'une fenêtre de 700)
- `Localizable.xcstrings` **JSON valide**, 1 367 → 1 369 clés, les 2 neuves à
  7 locales ✔
- Fichier de test neuf → capté par le globbing `sources: - path: MeeshyTests`
  de `project.yml` → **0 édition de `project.pbxproj`** ; nom de classe contenant
  « Status »/« Compose » → phase 2 de `meeshy.sh test`.

## Portée

**1 fichier de production : +11 lignes** (dont 4 de commentaire) et **1 mot-clé
substitué**. 1 fichier de test neuf, 1 test existant resserré, 2 clés i18n
neuves entièrement traduites. **0 logique / 0 réseau / 0 layout / 0 changement
visuel.**

## Clôture de l'analyse 214i

L'analyse `2026-07-26-iteration-214i-navigationview-deprecated.md` listait en
« Reste à faire » n° 1 : « `StatusComposerView.swift` — dernier `NavigationView`,
à migrer dès que #2275 est mergée ou close ; réduire l'attendu du balayage à
l'ensemble vide ». **Fait en 220i.** Son point n° 2 (SDK) est hors périmètre de
cette routine ; ses points n° 3 (i18n `MeeshyShareExtension`) et n° 4
(`navigationTitle` de `addSamplesSheet`) restent ouverts.

## Piste 221i+

1. **`MeeshyShareExtension` i18n** — la cible n'a **aucun** catalogue propre
   (3 chaînes crues : `"Cancel"`, `"Send"`, `"Share to Meeshy"`). #2319 est
   mergée → le verrou est levé.
2. **`VoiceProfileManageView.addSamplesSheet`** — rend son titre comme un `Text`
   dans le corps alors qu'il vit désormais dans un `NavigationStack` sans
   `navigationTitle` (change le visuel → itération dédiée).
3. **Arriéré de catalogue mesuré ici, à traiter comme un chantier propre** :
   **1 724 des 2 586 clés** `String(localized:)` du code sont **absentes** de
   `Localizable.xcstrings` (elles retombent donc sur leur `defaultValue`
   **français** dans toutes les locales). Têtes de liste :
   `OnboardingStepViews` (64), `CreateShareLinkView` (55),
   `NotificationSettingsView` (52), `MessageDetailSheet` (47),
   `ConversationInfoSheet` (43). Corriger 6 clés par surface au fil de l'eau
   serait cosmétique : cela demande une itération dédiée, par famille de clés.
4. **`sensoryFeedback` (iOS 17+)** — 0 usage contre 11 `UIImpactFeedbackGenerator`
   (piste 219i (d), toujours ouverte).
5. **Audit Dark Mode généralisé** (piste 219i (c), toujours ouverte, avec ses
   deux pièges documentés).
