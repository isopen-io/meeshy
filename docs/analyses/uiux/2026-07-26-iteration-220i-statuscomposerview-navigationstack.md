# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axe** : Intégration plateforme native / HIG — conteneur de navigation déprécié
**Base** : `main` HEAD `ffef1339e`
**Statut** : clôture de la dette ouverte en 214i

## Contexte

Le suivi 219i (« Piste 220i+ », point 4) fixait la cible : « `StatusComposerView`
(`NavigationView` → `NavigationStack`) dès #2275 résolue, puis réduire l'attendu
de `NavigationContainerMigrationTests` à l'ensemble vide. »

Les deux verrous sont levés :

- **#2275 est mergée** (`131f7939e` dans `main`), donc le fichier n'est plus
  détenu par une PR en vol.
- **Aucune PR n'est ouverte** (`list_pull_requests` open → `[]`) : collision
  d'essaim nulle sur les deux fichiers touchés.

214i avait migré 3 des 4 fichiers fautifs et **laissé `StatusComposerView` de
côté à dessein**, en épinglant la dette restante dans un test de balayage conçu
pour **échouer** dès que le dernier fichier serait migré. 220i migre ce dernier
fichier et referme l'épingle.

## Défaut

`NavigationView` est déprécié depuis iOS 16, et son style par défaut est
`DoubleColumnNavigationViewStyle`. À largeur *regular* (iPad), un
`NavigationView` à enfant unique se rend comme une **vue divisée dont la colonne
de détail est vide** : le contenu réel part dans la colonne maître et les
`ToolbarItem(placement: .navigationBarLeading/.navigationBarTrailing)`
atterrissent dans la barre de la mauvaise colonne.

`StatusComposerView.swift:37` déclarait `NavigationView {` sans
`.navigationViewStyle(.stack)` — la parade historique est absente, comme sur les
3 sites de 214i.

**Le compositeur de status est exposé sur les trois de ses entrées.** Les trois
call-sites le présentent en `.sheet`, or une `.sheet` iPad est une *form sheet*
à largeur regular :

| Call-site | Présentation |
|---|---|
| `RootViewComponents.swift:742` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |
| `ConversationListView.swift:755` | `.sheet(item:)` (republication) + `.presentationDetents([.medium])` |
| `ConversationListView.swift:766` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |

Les affordances concernées ne sont pas cosmétiques : la barre porte **« Fermer »**
en `navigationBarLeading` (`:81`, seul chemin de sortie explicite hors *drag
indicator*) et le **bouton de publication** en `navigationBarTrailing` (`:87`,
l'action primaire de l'écran). Un placement dans la mauvaise colonne dégrade donc
à la fois la sortie et l'action primaire.

Le plancher de déploiement est **iOS 16.0** (`project.yml:5`) :
`NavigationStack` est disponible **inconditionnellement**, sans garde
`@available` ni couche de compatibilité.

## Correctif (220i)

**Un mot-clé** : `NavigationView {` → `NavigationStack {` (`:37`).

Migration mécanique et sûre — vérifié sur le fichier qu'il n'y a **aucun**
`NavigationLink`, `navigationDestination`, `navigationViewStyle` ni
`navigationBarItems` : c'est un conteneur mono-colonne pur. Accolades, corps,
`navigationTitle`, `toolbar`, `onAppear` inchangés. Sur iPhone (largeur compacte)
le rendu est **identique** ; le gain porte sur iPad et sur la sortie de
dépréciation.

### Non-changement délibéré

`.navigationBarLeading` / `.navigationBarTrailing` ne sont **pas** remplacés par
`.topBarLeading` / `.topBarTrailing`. Ces derniers sont iOS 17+ ; au plancher
iOS 16 ils exigeraient une garde `@available` et une branche dupliquée pour un
rendu identique. Les placements historiques ne sont pas dépréciés — hors sujet
ici, à rouvrir seulement si le plancher monte à 17.

## Tests

`NavigationContainerMigrationTests.swift` — la dette est **close**, pas
simplement tolérée :

1. **Test neuf** `test_statusComposer_usesNavigationStack()` : réutilise le
   helper `assertMigrated` (absence de `NavigationView {` **et** présence de
   `NavigationStack {`), portant à 4 le nombre de fichiers verrouillés
   individuellement.
2. **`test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`** :
   l'attendu passe de `{StatusComposerView.swift}` à l'**ensemble vide**, écrit
   `Set<String>()` explicitement (pas `[]`, qui reposerait sur l'inférence à
   travers l'`@autoclosure` de `XCTAssertEqual`). Le test devient un garde-fou
   de régression pur : tout nouveau `NavigationView` le fait échouer.
3. **Balayage élargi** : `scannedTargets` gagne **`MeeshyWidgets`**. C'est une
   cible `app-extension` livrée (`project.yml:117`, plancher iOS 17.0) et
   c'était le seul arbre de sources app-side que le garde ne couvrait pas —
   un `NavigationView` y aurait passé inaperçu. Elle est propre aujourd'hui ;
   l'ajout empêche qu'elle devienne le prochain angle mort.
   `MeeshyContextMenu/` est présent sur disque mais **n'est pas une cible** de
   `project.yml` (jamais compilé) → délibérément hors balayage.

**Vérification** (pas de toolchain Xcode sur ce conteneur Linux ; gate réel =
CI `iOS Tests`). La logique exacte des 5 assertions a été rejouée statiquement :

- balayage `NavigationView {` sur les 4 cibles → **0 fichier** (l'attendu vide
  tient) ;
- les 4 fichiers verrouillés : `NavigationView`=0, `NavigationStack`≥1 chacun.

Fichier de test **déjà enregistré** au projet (modifié, non créé) → aucune
régénération `xcodegen` ni édition de `project.pbxproj` requise. Le nom de
classe ne matche aucun token de `FINAL_PHASE_CLASS_PATTERN` → reste en phase 1
de `meeshy.sh test`.

## Portée

- **1 fichier de prod, 1 ligne** (1 mot-clé).
- **1 fichier de test** : +1 test, attendu réduit à l'ensemble vide, 1 cible
  ajoutée au balayage.
- 0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 layout / 0 changement
  visuel sur iPhone.

## Bilan

La migration `NavigationView` → `NavigationStack` ouverte en 214i est
**terminée** : **0 `NavigationView` dans l'intégralité des 4 cibles iOS
livrées**, contre 4 fichiers fautifs au début de 214i. La dette n'est plus
épinglée — elle est soldée, et le balayage qui la surveillait couvre désormais
une cible de plus qu'à sa création.

## ⚠️ Ne plus re-flagger

- **`StatusComposerView`** conteneur de navigation : soldé 220i.
- **`NavigationView` en général** : plus aucune occurrence app-side. Le sujet
  est clos ; `test_noNavigationViewRemains` monte la garde. Ne pas rouvrir
  d'itération « migration NavigationView » — il n'y a plus rien à migrer.
- **`.navigationBarLeading` / `.navigationBarTrailing`** : conservés à dessein
  au plancher iOS 16 (cf. « Non-changement délibéré »). Ne pas flagger comme
  dette avant une montée de plancher à iOS 17.

## Piste 221i+

Reprise des points non consommés de la piste 219i, réordonnés :

1. **Balayage Dark Mode généralisé** — la famille de défaut de 219i (couleur de
   marque claire posée sans lecture du `colorScheme`) mérite un audit dédié.
   Deux pièges déjà identifiés : (a) beaucoup de `MeeshyColors.indigoNNN` sont
   posés sur des fonds eux-mêmes thématisés et sont **corrects** ; (b) toute
   surface descendant de `StoryViewerView` doit se brancher sur `colorScheme`,
   **jamais** sur `ThemeManager.mode`. C'est le candidat le plus riche.
2. **`MeeshyShareExtension`** : câbler un `Localizable.xcstrings` à la cible
   (3 chaînes crues). #2319 est mergée → débloqué. Attention : touche
   `project.yml` (ressource de cible), donc `xcodegen` — itération moins
   mécanique que sa taille ne le suggère.
3. **`StoryViewerView+Content.shareStory()`** — suppression de code mort (0
   caller). Le seul frein est la température de la surface story, encore très
   active dans `git log`. À faire dès qu'elle refroidit.
4. **`TrackingLinkDetailView`** : #2325 est mergée (elle **est** le HEAD de base
   de cette itération) → vérifier que la dette `UIActivityViewController` est
   bien retombée et resserrer l'ensemble.
5. **`MessageListView.MessageMenuPreviewContainer.maxHeight`** +
   `MessageOverlayMenu.maxPreviewHeight` (`UIScreen.main`, piste 218i) — les
   deux doivent bouger ensemble ; c'est ce couplage qui rend l'itération non
   triviale.
</content>
</invoke>
