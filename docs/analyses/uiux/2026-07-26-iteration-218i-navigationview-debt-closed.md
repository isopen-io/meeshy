# iOS UI/UX — Iteration 218i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axe** : Intégration plateforme native / HIG — **clôture** de la migration du
conteneur de navigation déprécié
**Base** : `main` HEAD `ffef133` (217i mergée #2326, + #2325/#2319/#2275 mergées)

## Contexte : trois pistes, deux périmées

Le pointeur 217i laissait trois pistes. L'essaim s'est vidé entre-temps
(`list_pull_requests` → **0 PR ouverte**), donc les trois étaient débloquées —
mais deux ne tenaient plus :

| Piste 217i | État réel |
|---|---|
| (a) Couple `MessageListView.maxHeight` ↔ `MessageOverlayMenu.maxPreviewHeight`, tous deux `UIScreen.main.bounds.height * 0.62` | **Périmée**. `MessageOverlayMenu.maxPreviewHeight` est désormais une constante `320` — le couplage n'existe plus. Et `MessageListView` lit maintenant `DeviceLayout.windowSize.height * 0.62` : un autre agent a introduit un helper SSOT `DeviceLayout.windowSize` (scènes au premier plan, `UIScreen` en dernier recours) et migré le site. |
| (b) `StatusComposerView` `NavigationView` → `NavigationStack` | **Prenable** — #2275 mergée. |
| (c) i18n `MeeshyShareExtension` | Prenable, mais c'est un chantier (câbler un catalogue de chaînes à une cible qui n'en a aucun), pas une itération. |

Note de convergence : la doc de `DeviceLayout.windowSize` écrit exactement la
doctrine que 217i a appliquée — *« Prefer a `GeometryReader`'s own `size`
wherever one is already in scope »*. Les deux pistes ont convergé
indépendamment sur la même règle.

**218i prend (b)** : c'est le **dernier** `NavigationView` de l'application, et
214i avait délibérément laissé un dispositif pour le signaler.

## Le défaut

`NavigationView` est déprécié depuis iOS 16 et — c'est le vrai problème — son
style par défaut est `DoubleColumnNavigationViewStyle` : à largeur *regular*, un
`NavigationView` à enfant unique se rend comme une **vue divisée dont la colonne
de détail est vide**, et les `ToolbarItem` atterrissent dans la barre de la
mauvaise colonne.

`StatusComposerView` est le cas le plus exposé de la série :

- **Ses trois sites d'appel le présentent en `.sheet`**
  (`RootViewComponents.swift:742`, `ConversationListView.swift:755` et `:766`).
  Sur iPad, une sheet est une **form sheet** — largeur *regular*, précisément la
  condition qui déclenche l'effondrement.
- **Ses deux seuls contrôles sont des `ToolbarItem`** : « Fermer »
  (`.navigationBarLeading`, l.80) et le bouton de publication
  (`.navigationBarTrailing`, l.86). L'effondrement peut donc déplacer d'un coup
  **l'unique affordance de sortie et l'action principale de l'écran**.
- Aucun `.navigationViewStyle(.stack)` n'était posé — la parade historique.

Migration prouvée sans effet de bord : le fichier ne contient **aucun**
`NavigationLink`, `navigationDestination`, `navigationViewStyle` ni
`navigationBarItems` (vérifié par `grep` : la seule occurrence de
« Navigation… » était le conteneur lui-même). C'est un conteneur mono-colonne
pur. Plancher de déploiement **iOS 16.0** → `NavigationStack` disponible
**inconditionnellement**, sans garde `@available`.

Sur iPhone (largeur compacte) le rendu est identique.

## Correctif (218i)

`NavigationView {` → `NavigationStack {`. **Un mot-clé, une ligne.**

## Ce qui donne sa valeur à l'itération : la clôture de la dette

214i avait construit un dispositif explicite, et écrit son intention dans le
test :

> *StatusComposerView is the last holdout … When that lands, this expectation
> drops to the empty set and the test fails until it is updated — which is the
> intent.*

218i honore ce contrat. `test_noUnexpectedNavigationViewRemains` (liste de dette
tolérée à une entrée) devient `test_noNavigationViewRemains` : **un invariant
absolu** — aucune source des cibles applicatives ne peut déclarer le conteneur
déprécié.

L'assertion reste une **comparaison d'ensembles** et non un `isEmpty` : en cas
d'échec, le diff **nomme le fichier fautif** au lieu de se contenter d'affirmer
qu'il en existe un.

Un test par fichier est également ajouté pour `StatusComposerView`, à parité
avec les trois surfaces migrées en 214i.

## Portée

**1 ligne de production.** 0 logique / 0 réseau / 0 clé i18n / 0 couleur /
0 layout / 0 changement visuel sur iPhone.

## Vérification

- Pas de toolchain Swift (Linux) → vérifications déterministes hors Xcode :
  - Balayage des 3 cibles applicatives (`Meeshy`, `MeeshyShareExtension`,
    `MeeshyNotificationExtension`) : `NavigationView {` → **0 occurrence**.
    Variante sans espace `NavigationView{` → **0**. La dette est bien à zéro,
    ce que le test neuf exige désormais.
  - `StatusComposerView` : `NavigationStack {` présent l.37.
  - Équilibre accolades / parenthèses / crochets des 2 fichiers au tokenizer
    (chaînes retirées avant les commentaires) : **0 / 0 / 0**.
- **RED contre `main` `ffef133`** : `test_noNavigationViewRemains` échoue
  (l'ensemble vaut `{StatusComposerView.swift}`, pas `[]`) **et**
  `test_statusComposer_usesNavigationStack` échoue sur ses deux assertions.
  3 assertions rouges, 3 vertes après correctif.
- Le fichier de test **existe déjà** (214i) → aucun fichier neuf, donc
  **0 édition de `project.pbxproj`**.
- Collision essaim : **0 PR ouverte** au moment du choix.

Gate réel = CI `iOS Tests`.

## Bilan

Le dernier `NavigationView` de l'application disparaît. Le balayage passe de
« dette épinglée » à **invariant** : toute réintroduction du conteneur déprécié
échoue désormais en CI, en nommant le fichier.

## Piste 219i+

1. **`packages/MeeshySDK/Sources/MeeshyUI/`** porte encore **5**
   `NavigationView` (`UnifiedPostComposer`, `VoiceProfileWizardView`,
   `VoiceProfileManageView`, `CodeViewerView`, `DocumentViewerView`). **Hors
   périmètre de cette routine** (iOS app uniquement) — piste SDK. Le balayage de
   218i ne les couvre volontairement pas.
2. **`VoiceProfileManageView.addSamplesSheet`** rend son titre en `Text` dans le
   corps alors qu'il vit dans un `NavigationStack` sans `navigationTitle` →
   candidat `.navigationTitle` + `.navigationBarTitleDisplayMode(.inline)`
   (**change le visuel** → itération dédiée, hérité de 214i).
3. **`UIScreen.main`** : la convergence sur `DeviceLayout.windowSize` est
   commencée mais partielle. Défauts réels restants (dimensionnement de layout
   sur l'écran physique) : `AudioFullscreenView:163`, `ReelFeedCard:157`,
   `ConversationListView:437-438`. **Ne PAS toucher** : `UIScreen.main.scale`
   (`ImageDownsamplingConfig`, `BubbleStandardLayout+Media`) — identique sur
   toutes les fenêtres d'un appareil ; `RecentMediaStrip.compactCell` —
   délibéré et documenté ; `DeviceLayout:51` et `StoryViewerView:338` — c'est le
   dernier recours correct du helper lui-même.
4. **i18n `MeeshyShareExtension`** : la cible n'a aucun `Localizable.xcstrings`
   propre (ses `String(localized:)` retombent toujours sur `defaultValue`,
   + 3 chaînes crues). Chantier, pas itération.
