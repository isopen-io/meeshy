# iOS UI/UX — Iteration 215i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` (site de présentation)
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` (2 sites de présentation)

**Axe** : Clôture de la dette `NavigationView` (HIG / plateforme) + Dynamic Type
**Base** : `main` HEAD `ffef1339e`
**Essaim** : `list_pull_requests` (open) → **0 PR ouverte**. Aucune collision possible.

## Contexte

L'itération **214i** (PR #2319, mergée) a migré trois conteneurs `NavigationView`
et a **épinglé** le dernier récalcitrant, `StatusComposerView`, dans un test de
balayage — le fichier était alors détenu par la PR en vol #2275. Cette PR est
mergée (#2275 → `main`), le fichier est libre.

Le balayage de 214i était conçu pour **échouer** dès la migration du dernier
fichier, forçant la clôture explicite de la dette plutôt que son oubli. C'est ce
que fait cette itération.

## Défaut A — dernier conteneur déprécié

`apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift:37` était le
**seul** `NavigationView` restant des trois cibles app (contre 37 fichiers déjà
en `NavigationStack`).

Migration mécanique, vérifiée sûre : le fichier ne contient **aucun**
`NavigationLink`, `navigationDestination`, `navigationViewStyle` ni
`navigationBarItems` — c'est un conteneur mono-colonne pur, qui n'existe que
pour héberger `.navigationTitle` + les deux `ToolbarItem` (« Fermer » /
« Publier »). Plancher **iOS 16.0** (`project.yml`) → `NavigationStack` est
disponible inconditionnellement, sans garde `@available`.

## Défaut B — detent médian figé et contenu injoignable en Dynamic Type

Les trois sites présentent le composer en `.sheet`. Deux d'entre eux
(`ConversationListView`) n'offraient que `.presentationDetents([.medium])`, sans
indicateur de glissement ; le troisième (`RootViewComponents`) avait
l'indicateur mais le même detent unique.

Le corps du composer est un `VStack` **fixe, sans `ScrollView`** :

| Élément | Dimension |
|---|---|
| Question « Comment tu te sens ? » | `MeeshyFont.relative(16)` |
| Grille emoji `LazyVGrid` 5 colonnes × 2 rangées | boutons 56×56 pt |
| Rail de visibilité (capsules) | `MeeshyFont.relative(11/12)` |
| Champ de texte + compteur de caractères | `MeeshyFont.relative(15/10)` |

`MeeshyFont.relative` mappe vers un text style relatif
(`MeeshyUI/Theme/Accessibility.swift:152`) — **tout ce contenu grandit avec
Dynamic Type**. À des tailles d'accessibilité, la pile dépasse un detent médian
et, faute de `ScrollView`, le bas du formulaire (compteur de caractères, et sur
les appareils les plus courts le champ lui-même) devient **injoignable** :
aucun geste ne permet d'atteindre ce qui déborde.

Le correctif est d'ajouter `.large` **à côté** de `.medium` : SwiftUI ouvre
toujours sur le premier detent, donc **la présentation initiale est inchangée**
— c'est strictement une porte de sortie. `.presentationDragIndicator(.visible)`
la rend découvrable ; sans indicateur, un detent redimensionnable est une
affordance invisible.

C'est aussi la **convention dominante du dépôt** : 24 sites
`[.medium, .large]` contre 6 en `.medium` seul — dont `InviteFriendsSheet`,
présenté à quinze lignes de là dans `ConversationListView` avec exactement la
paire detents + indicateur.

## Correctifs (215i)

| Fichier | Changement |
|---|---|
| `StatusComposerView.swift` | `NavigationView {` → `NavigationStack {` (1 mot-clé) |
| `RootViewComponents.swift:744` | `[.medium]` → `[.medium, .large]` (indicateur déjà présent) |
| `ConversationListView.swift:768` | `[.medium]` → `[.medium, .large]` + `.presentationDragIndicator(.visible)` |
| `ConversationListView.swift:773` | idem |

0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 changement de layout / 0
changement de présentation initiale.

## Tests

**`NavigationContainerMigrationTests`** (mis à jour) : ajout de l'assertion
par-fichier pour `StatusComposerView`, et le balayage passe de
`{StatusComposerView.swift}` à l'**ensemble vide**. Le test cesse d'être un
épinglage de dette pour devenir une simple garde anti-régression : plus aucun
`NavigationView` ne peut réapparaître dans une cible app.

**`StatusComposerPresentationTests`** (neuf) : idiome d'introspection de source
établi dans le dépôt (les detents d'une `.sheet` ne sont pas observables depuis
un test unitaire, et il n'existe pas de harnais de snapshot pour les
modificateurs de présentation). Trois tests :
1. les **trois** sites de présentation sont bien découverts — garde les deux
   assertions suivantes contre un balayage silencieusement vide si une
   présentation déménage ;
2. chaque site offre `.large` ;
3. chaque site affiche l'indicateur de glissement.

## Vérification

Toolchain Swift indisponible sous Linux → assertions vérifiées
**déterministiquement** par réplication exacte de leur logique hors Xcode ; la
CI `iOS Tests` (Xcode 26.1.1 / Swift 6.2, simulateur iOS 18.2) sert de portail.

- Balayage des 3 cibles app → **ensemble vide** ✔
- Les 4 fichiers migrés (214i + 215i) : `NavigationView {` = 0, `NavigationStack {` = 1 ✔
- Aucune variante d'espacement `NavigationView{` dans l'arbre ✔
- `StatusComposerView` : 0 `NavigationLink` / `navigationDestination` /
  `navigationViewStyle` / `navigationBarItems` → migration sans effet de bord ✔
- 3 blocs de présentation découverts, tous avec `[.medium, .large]` +
  `.presentationDragIndicator(.visible)` ✔
- `MeeshyTests` est globbé récursivement dans `project.yml:191` → le fichier de
  test neuf est auto-inclus par `xcodegen generate` (pas d'édition pbxproj) ✔

## Reste à faire (216i+)

1. **`StatusComposerView` sans `ScrollView`** — `.large` est une porte de
   sortie, pas la guérison. Envelopper le `VStack` dans un `ScrollView` rendrait
   le formulaire correct à **toute** taille de texte et à tout detent. Cela
   change le comportement du `Spacer()` et le rendu au repos → itération dédiée
   avec vérification visuelle, pas un glissement de celle-ci.
2. **SDK** — `packages/MeeshySDK/Sources/MeeshyUI/` porte encore 5
   `NavigationView` (`UnifiedPostComposer`, `VoiceProfileWizardView`,
   `VoiceProfileManageView`, `CodeViewerView`, `DocumentViewerView`). **Hors
   périmètre de cette routine** (iOS app uniquement) — piste SDK.
3. **`MeeshyShareExtension` i18n** — la cible n'a aucun `Localizable.xcstrings`
   propre ; ses `String(localized:)` retombent toujours sur `defaultValue`, et
   trois chaînes sont crues (`"Cancel"`, `"Send"`, `"Share to Meeshy"`).
   Chantier à part entière.
4. **`VoiceProfileManageView.addSamplesSheet`** — rend son titre en `Text` dans
   le corps alors qu'il vit dans un `NavigationStack` sans `navigationTitle` :
   candidat `.navigationTitle` + `.navigationBarTitleDisplayMode(.inline)`
   (change le visuel → itération dédiée).
5. **Detents médians restants** — `LinksHubView:75`, `AffiliateView:29`,
   `EffectsPickerView:98` sont encore en `.medium` seul. À auditer surface par
   surface : contrairement au composer, certains hébergent un contenu déjà
   scrollable, auquel cas le detent unique est légitime.
