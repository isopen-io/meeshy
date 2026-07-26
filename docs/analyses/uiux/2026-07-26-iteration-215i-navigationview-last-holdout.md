# iOS UI/UX — Iteration 215i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
**Axe** : Intégration plateforme native / HIG — conteneur de navigation déprécié (clôture)
**Base** : `main` HEAD `ffef1339e`

## Contexte

Suite directe et **clôture** de 214i (PR #2319, mergée). 214i avait migré 3 des
4 `NavigationView` des cibles app iOS et **épinglé** le dernier dans un test de
balayage :

```swift
let expected: Set<String> = ["StatusComposerView.swift"]
```

`StatusComposerView` avait été délibérément écarté : le fichier était détenu par
la PR ouverte #2275 (213i, a11y des glyphes décoratifs). Cette PR est désormais
**mergée** (`131f7939e`), le fichier est libre, et l'essaim est vide
(`list_pull_requests` → 0 PR ouverte). La collision qui justifiait le report
n'existe plus.

## Défaut

Identique à 214i, mais c'est ici le **cas le plus exposé des quatre**.

`NavigationView` est déprécié depuis iOS 16 et son style par défaut est
`DoubleColumnNavigationViewStyle` : à largeur *regular* (iPad), un conteneur à
enfant unique se rend en vue divisée dont la colonne de détail est vide, et les
`ToolbarItem` atterrissent dans la barre de la mauvaise colonne.

`StatusComposerView` est le seul des quatre à porter **deux** items de barre, et
ce sont les deux seules commandes de l'écran :

| Item | Placement | Rôle |
|---|---|---|
| « Fermer » | `.navigationBarLeading` | **unique** sortie du composer |
| `publishToolbarButton` | `.navigationBarTrailing` | **unique** action de publication |

Le composer n'offre aucun bouton de secours dans son corps (grille d'emojis,
picker de visibilité, champ texte). Un mauvais placement de barre sur iPad rend
donc l'écran à la fois insortable et inutilisable pour sa seule tâche.

## Correctif (215i)

`NavigationView {` → `NavigationStack {` (l.37). Un mot-clé, accolades et corps
inchangés.

Migration vérifiée mécanique : le fichier ne contient **aucun** `NavigationLink`,
`navigationDestination`, `navigationViewStyle` ni `navigationBarItems` — c'est
un conteneur mono-colonne pur. `navigationTitle` (l.77) et
`navigationBarTitleDisplayMode(.inline)` (l.78) sont des modificateurs communs
aux deux conteneurs, inchangés. Plancher **iOS 16.0** → `NavigationStack`
disponible inconditionnellement. Rendu iPhone identique.

Les deux `.accessibilityHidden(true)` posés par 213i (l.51, l.266) ne sont pas
touchés.

## Test

`NavigationContainerMigrationTests` (créé en 214i) est **fermé** :

1. `test_statusComposer_usesNavigationStack` — nouvelle assertion par fichier,
   même helper `assertMigrated` que les trois autres.
2. `test_noUnexpectedNavigationViewRemains` → renommé
   `test_noNavigationViewRemains`, attendu réduit à **l'ensemble vide**.

C'est exactement le comportement conçu en 214i : l'épinglage devait **échouer**
une fois le dernier fichier migré, forçant la mise à jour explicite plutôt que
l'oubli silencieux. Le balayage reste en place comme garde permanente — toute
réintroduction d'un `NavigationView` dans une cible app échoue désormais
nommément.

Le balayage ne scanne que `Meeshy`, `MeeshyShareExtension` et
`MeeshyNotificationExtension` : le fichier de test lui-même vit sous
`MeeshyTests/` (répertoire frère, jamais énuméré), donc ses 3 occurrences
littérales de `NavigationView {` dans des chaînes ne s'auto-signalent pas.

## Portée

- **1 fichier de prod**, 1 ligne. **1 fichier de test** (+1 test, attendu réduit).
- 0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 layout / 0 changement visuel
  sur iPhone.

## Vérification

Toolchain Swift indisponible (Linux) → assertions vérifiées déterministiquement
par correspondance de chaînes ; CI `iOS Tests` = portail.

- Balayage des 3 cibles app → **0 fichier fautif** ✔
- Les 4 fichiers migrés : `NavigationView {` = 0, `NavigationStack {` = 1 ✔
- `StatusComposerView` sans `NavigationLink` / `navigationDestination` /
  `navigationViewStyle` / `navigationBarItems` ✔
- Fichier absent de toute PR ouverte (0 PR ouverte au moment de l'itération) ✔

## Bilan de la série 214i–215i

Les cibles **app** iOS sont désormais intégralement sur `NavigationStack` :
4 fichiers migrés, 0 restant, garde de non-régression en place.

## Reste à faire (216i+)

1. **SDK** — `packages/MeeshySDK/Sources/MeeshyUI/` porte encore **5**
   `NavigationView` (`UnifiedPostComposer`, `VoiceProfileWizardView`,
   `VoiceProfileManageView`, `CodeViewerView`, `DocumentViewerView`).
   **Hors périmètre de cette routine** (iOS app uniquement) — piste SDK. Le
   balayage de `NavigationContainerMigrationTests` pourrait y être étendu le jour
   où cette piste est ouverte.
2. **`MeeshyShareExtension` i18n** — la cible n'a **aucun**
   `Localizable.xcstrings` propre ; ses `String(localized:)` retombent toujours
   sur `defaultValue`, et trois chaînes sont crues (`"Cancel"`, `"Send"`,
   `"Share to Meeshy"`). Câbler un catalogue à la cible est un chantier à part.
3. **`VoiceProfileManageView.addSamplesSheet`** — rend son titre comme un `Text`
   dans le corps alors qu'il vit dans un `NavigationStack` sans
   `navigationTitle` → candidat `.navigationTitle` +
   `.navigationBarTitleDisplayMode(.inline)` (change le visuel → itération
   dédiée).
4. **Tests d'introspection de source à ancre exacte** — l'incident
   `dismissGroupIntro` (garde tombée en « introuvable » après l'ajout d'un
   paramètre par défaut, réparée dans #2319) suggère un audit des autres gardes
   ancrées sur une signature complète plutôt que sur un nom.
