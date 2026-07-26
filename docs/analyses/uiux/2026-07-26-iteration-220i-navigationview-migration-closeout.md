# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axes** : Intégration native Apple (HIG) · Compatibilité iPad / multitasking · Dette technique (API dépréciée) · Maintenabilité
**Base** : `main` HEAD `ffef1339e`

## Sélection de la cible

État de l'essaim au démarrage : `list_pull_requests` (open) → **0 PR ouverte**.
C'est la première itération depuis longtemps sans aucune contention : les trois
pistes que 219i avait laissées bloquées (#2325, #2319, #2275) sont toutes
retombées.

Le pointeur 219i listait cinq pistes. La n° 4 est retenue :

| Piste 219i | Décision |
|---|---|
| 1. `StoryViewerView+Content.shareStory()` (code mort) | Différée — suppression de code sans effet utilisateur, valeur UX nulle. |
| 2. `TrackingLinkDetailView` | Différée — simple resserrage d'un ensemble de test. |
| 3. Balayage Dark Mode généralisé | Différée — chantier large, mérite son itération dédiée. |
| **4. `StatusComposerView` → `NavigationStack`** | **Retenue** — dernier verrou d'une migration entamée en 214i, corrige un défaut de rendu réel sur iPad. |
| 5. `MeeshyShareExtension` i18n | Différée — 3 chaînes, nécessite de câbler un `.xcstrings` à la cible. |

La piste 4 est la seule à **clore une migration** : elle transforme une dette
épinglée en invariant permanent, ce que les autres ne font pas.

## Le défaut — `NavigationView` dans une feuille, à largeur régulière

`StatusComposerView` était le **dernier** fichier des cibles livrées à déclarer
un conteneur `NavigationView` (l. 37) :

```swift
var body: some View {
    NavigationView {          // ← déprécié depuis iOS 16
        ZStack { … }
        .navigationTitle(…)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Fermer") { dismiss() }   // ← seule affordance de sortie
            }
            ToolbarItem(placement: .navigationBarTrailing) { publishToolbarButton }
        }
    }
}
```

`NavigationView` est déprécié depuis iOS 16 et — c'est le point critique — son
style **par défaut est double-colonne**. Dans un environnement de largeur
régulière (iPad, et la feuille de partage iPad), un `NavigationView` à enfant
unique se rend donc comme un split view dont la **colonne de détail est vide** :
le contenu propre de la feuille est masqué, et la barre d'outils — qui porte ici
l'**unique** affordance de fermeture (« Fermer ») ainsi que le bouton
« Publier » — est mal placée.

Le défaut est bien atteignable : **les trois points de présentation sont des
feuilles**.

| Point de présentation | Fichier | Présentation |
|---|---|---|
| Composeur d'humeur (root) | `RootViewComponents.swift:743` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |
| Republication d'un status | `ConversationListView.swift:756` | `.sheet(item:)` + `.presentationDetents([.medium])` |
| Composeur d'humeur (liste) | `ConversationListView.swift:767` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |

Le plancher de déploiement de l'app est **iOS 16.0** (`project.yml`) :
`NavigationStack` est donc disponible **inconditionnellement**, sans garde
`@available` ni shim de compatibilité.

## Le correctif

**Un seul token de production change** :

```diff
-        NavigationView {
+        NavigationStack {
```

La substitution est comportementalement neutre partout ailleurs, ce qui a été
vérifié avant de l'appliquer :

- **Aucun `NavigationLink`** ni `navigationDestination` dans le fichier — la vue
  n'utilise le conteneur que pour sa barre de titre et sa barre d'outils, jamais
  pour pousser une destination. C'est la condition qui rend le swap sûr : une
  `NavigationView` porteuse de `NavigationLink` de style détail exigerait une
  reprise du modèle de navigation, pas un renommage.
- **Aucun `.navigationViewStyle`** dans le fichier ni sur les trois sites
  d'appel (qui n'appliquent que `.presentationDetents` /
  `.presentationDragIndicator`) — donc pas de modificateur devenu inopérant.
- `navigationTitle`, `navigationBarTitleDisplayMode(.inline)` et les
  `ToolbarItem(placement: .navigationBarLeading/.navigationBarTrailing)` ont un
  comportement identique sous `NavigationStack`.
- La feuille interne `.sheet(item: $audiencePickerMode)` (l. 285) est présentée
  **modalement**, hors de la pile — insensible au type de conteneur.

## Clôture de la migration dans le test

`NavigationContainerMigrationTests` balayait déjà les trois cibles livrées
(`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) et **épinglait**
l'ensemble résiduel plutôt que de le tolérer. Cet ensemble valait
`["StatusComposerView.swift"]`, avec un commentaire disant explicitement que le
fichier était détenu par une PR en vol et que, lorsqu'elle atterrirait,
« l'attendu tombe à l'ensemble vide et le test échoue jusqu'à mise à jour — ce
qui est l'intention ».

C'est exactement ce qui est fait ici — le test épinglé a joué son rôle de
cliquet :

1. **Promotion** du dernier holdout au rang de fichier migré :
   `test_statusComposerView_usesNavigationStack()`, sous une section
   `// MARK: - Migrated in 220i`, via l'helper `assertMigrated` existant (qui
   vérifie les **deux** sens : absence de `NavigationView {` **et** présence de
   `NavigationStack {`).
2. **Rétrécissement de l'attendu à l'ensemble vide**, et renommage du test de
   `test_noUnexpectedNavigationViewRemains` →
   `test_noNavigationViewRemains` : il n'y a plus d'occurrence « attendue » à
   excepter, la propriété devient absolue.
3. Docstring de la suite et commentaires mis à jour : la suite ne documente plus
   une migration partielle mais un **invariant de non-régression**.

L'attendu est déclaré `let expected: Set<String> = []` plutôt que passé en
littéral `[]` inline : le type est ainsi explicite au lieu de dépendre de
l'inférence générique de `XCTAssertEqual` — précaution utile puisque
l'environnement de développement (Linux) n'a pas de toolchain Swift pour lever
une ambiguïté à la compilation.

## Vérification

- **Balayage exhaustif des 3 cibles livrées** : `grep -rn "NavigationView {"`
  sur `Meeshy/`, `MeeshyShareExtension/`, `MeeshyNotificationExtension/` →
  **0 occurrence**. L'ensemble attendu par le test est bien vide *sur l'arbre
  réel*, et non par construction.
- **Pas d'auto-déclenchement du balayage** : le fichier de test contient le
  littéral `"NavigationView {"`, mais il vit sous `apps/ios/MeeshyTests/`, qui
  n'appartient pas à `scannedTargets` (`Meeshy`, `MeeshyShareExtension`,
  `MeeshyNotificationExtension`). Le test ne peut donc pas se compter lui-même
  comme contrevenant — vérifié en relisant `iosRoot` + `scannedTargets`.
- `NavigationStack {` bien présent en l. 37 de `StatusComposerView.swift` (les
  deux assertions de `assertMigrated` sont donc vraies).
- Équilibre accolades / parenthèses / crochets des 2 fichiers au tokenizer
  (chaînes retirées **avant** les commentaires) : **0 / 0 / 0**.
- **0 clé i18n neuve**, **0 édition `.xcstrings`** — aucune chaîne touchée.
- **0 logique métier / 0 réseau / 0 layout / 0 changement visuel en largeur
  compacte** (iPhone : `NavigationView` à enfant unique s'y rend déjà en pile).
  Le changement visuel est **strictement** la réparation du rendu à largeur
  régulière.
- Aucun fichier neuf → **0 édition de `project.pbxproj`** (le test modifié est
  déjà enregistré ; le globbing récursif de `xcodegen` est inchangé).
- Nom de classe `NavigationContainerMigrationTests` : ne matche aucun token
  produit de `FINAL_PHASE_CLASS_PATTERN` → reste en **phase 1** de
  `meeshy.sh test`, comme avant.
- Collision essaim : **0 PR ouverte** sur le dépôt au moment du travail.

Gate réel = CI `iOS Tests` (l'environnement de développement est Linux, sans
toolchain Xcode — `which swift swiftc xcodebuild` → aucun).

## Bilan

**1 fichier de production : +1 / −1 ligne** (un seul token). Une API dépréciée
depuis iOS 16 est **entièrement éradiquée** des cibles livrées, et le défaut de
rendu iPad qu'elle causait sur les trois points d'entrée du composeur d'humeur
est réparé. La suite de tests passe de « dette épinglée » à « invariant à zéro » :
toute réintroduction future de `NavigationView` échoue désormais en CI en nommant
le fichier fautif. **0 clé i18n neuve, 0 logique, 0 réseau, 0 layout.**

Migration `NavigationView` → `NavigationStack` : **entamée 214i, close 220i.**

## Piste 221i+

1. **Balayage Dark Mode généralisé** (hérité 219i, toujours la piste la plus
   riche) : la famille « couleur de marque claire posée sans lecture du
   `colorScheme` ». Deux pièges déjà identifiés en 219i à respecter : (a)
   beaucoup de `MeeshyColors.indigoNNN` sont posés sur des fonds eux-mêmes
   thématisés et sont **corrects** ; (b) toute surface descendant de
   `StoryViewerView` doit se brancher sur `colorScheme`, **jamais** sur
   `ThemeManager.mode`.
2. **`MeeshyShareExtension` i18n** (hérité 219i, désormais débloqué — #2319
   retombée) : câbler un `Localizable.xcstrings` à la cible, 3 chaînes crues.
   Ce sont les **seules** chaînes crues restantes de toute l'app iOS d'après
   l'audit 219i — donc une clôture d'axe, comme celle-ci.
3. **`StoryViewerView+Content.shareStory()`** (hérité 219i) : suppression de code
   mort (0 caller), la surface story a refroidi.
4. **`TrackingLinkDetailView`** (hérité 219i) : vérifier que la dette est
   retombée et resserrer l'ensemble de test correspondant.
5. **Autres conteneurs dépréciés** : maintenant que `NavigationView` est à zéro,
   le même cliquet « balayage + attendu épinglé » est transposable à d'autres API
   dépréciées (ex. `onChange(of:perform:)` à un argument, `NavigationLink(isActive:)`,
   `.alert(isPresented:)` à contenu impératif). Un balayage de recensement dirait
   laquelle porte le plus de valeur.
