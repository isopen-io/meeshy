# Itération 220i — `StatusComposerView` : le dernier `NavigationView` de l'app

**Date** : 2026-07-26
**Périmètre** : iOS uniquement
**Base** : `main` HEAD `ffef133` (PR #2325 mergée)
**Branche de travail** : `claude/quirky-curie-52be0w`

## Contexte

L'itération 214i a migré trois conteneurs `NavigationView` vers `NavigationStack`
et a posé un test de balayage (`NavigationContainerMigrationTests`) qui **épingle**
l'ensemble exact des fichiers encore fautifs. Cet ensemble contenait un seul
élément :

```swift
let expected: Set<String> = ["StatusComposerView.swift"]
```

Le commentaire du test explicitait pourquoi : le fichier était alors retenu par la
PR en vol #2275. **#2275 est mergée** (`131f793` dans `main`), tout comme les
quatre autres PR iOS listées comme freins par 219i (#2319, #2325, #2326, #2330).
La piste n° 4 de 219i est donc débloquée.

## Le défaut

`apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift:37`

```swift
var body: some View {
    NavigationView {
        ZStack { … }
        .navigationTitle(…)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) { /* Fermer */ }
            ToolbarItem(placement: .navigationBarTrailing) { publishToolbarButton }
        }
    }
}
```

`NavigationView` est déprécié depuis iOS 16 et, sans
`.navigationViewStyle(.stack)` (absent du fichier — vérifié), adopte son style
**double colonne** par défaut. Les trois sites de présentation du composer sont
tous des **feuilles** :

| Site | Présentation |
|---|---|
| `RootViewComponents.swift:743` | `.sheet(isPresented: $showStatusComposer)` + `.presentationDetents([.medium])` |
| `ConversationListView.swift:756` | `.sheet(item: $republishStatusEntry)` (republication) |
| `ConversationListView.swift:767` | `.sheet(isPresented: $showStatusComposer)` |

En environnement de largeur **regular** (iPad, et iPad en multitâche), une feuille
est présentée dans un conteneur regular : le `NavigationView` mono-enfant s'y
résout en split view dont la **colonne de détail est vide**. Conséquences
observables :

1. La grille d'emojis, le sélecteur de visibilité et le champ de texte —
   c'est-à-dire **tout le contenu du composer** — sont relégués dans la colonne
   principale, voire masqués derrière le comportement de collapse.
2. La barre d'outils, qui porte la **seule affordance de fermeture** (« Fermer »,
   `dismiss()`) et l'action primaire (« Publier »), est rattachée à la mauvaise
   colonne.

Le plancher de déploiement de l'app est **iOS 16.0** (`project.yml`) :
`NavigationStack` est disponible **inconditionnellement**, sans garde
`@available` ni shim de compatibilité.

## Le défaut secondaire (même surface)

`publishToolbarButton` (l. 205-242) échange son label selon l'état :

```swift
} label: {
    if isPublishing {
        ProgressView().tint(…).scaleEffect(0.8)   // ← aucun nom accessible
    } else {
        Text(String(localized: "status.composer.publish", …))
    }
}
```

Un `ProgressView` sans label ne fournit **aucun nom accessible**. Pendant la
publication, l'item de barre d'outils — qui est aussi `.disabled` — est donc
annoncé par VoiceOver comme un « bouton estompé » **anonyme** : l'utilisateur
perd de vue quelle action est en cours au moment précis où le retour est le plus
utile. WCAG 4.1.2 (Nom, rôle, valeur).

## Les correctifs

### 1. `NavigationView` → `NavigationStack`

Substitution du conteneur, plus un commentaire qui **grave la raison** (feuille +
largeur regular) afin que la régression ne se réintroduise pas par mimétisme.
Aucun `NavigationLink`, aucune sélection, aucun `navigationViewStyle` dans le
fichier → la migration est un remplacement pur : `.navigationTitle`,
`.navigationBarTitleDisplayMode(.inline)` et `.toolbar` ont exactement la même
sémantique sous `NavigationStack`.

### 2. Nom accessible stable pour l'action primaire

```swift
.accessibilityLabel(String(localized: "status.composer.publish", defaultValue: "Publier", bundle: .main))
```

posé sur le `Button` lui-même : le nom devient **invariant** entre l'état repos et
l'état publication. **0 clé i18n neuve** — réutilisation de la clé qui rend déjà
le libellé visible, donc parité stricte visuel/vocal. La valeur passée est un
`String` runtime → surcharge `StringProtocol`, aucune localisation parasite.

## Le test : de « dette épinglée » à « dette nulle »

`apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

- Ajout de `test_statusComposer_usesNavigationStack()` — assertion **positive**
  via l'helper `assertMigrated` existant (absence de `NavigationView {`
  **et** présence de `NavigationStack {`), au même rang que les trois fichiers de
  214i.
- `test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains` :
  l'attendu tombe à `Set<String>()`. Le balayage couvre les trois cibles livrées
  (`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) ; il vaut
  désormais **interdiction générale** : tout `NavigationView` réintroduit
  n'importe où échoue le test en nommant le fichier.
- En-tête de la suite mise à jour (« épingle l'ensemble » → « assertion de
  l'ensemble vide »).

Vérification : `grep -rn "NavigationView {"` sur les trois cibles → **0 occurrence**.
Le commentaire ajouté dans `StatusComposerView` mentionne « NavigationView's
default double-column style » sans jamais former la sous-chaîne `NavigationView {`
— il ne peut donc pas s'auto-déclencher (piège de faux positif vérifié).

## Ce qui n'a pas bougé

0 logique métier, 0 réseau, 0 clé i18n neuve, 0 changement de palette, 0
changement de layout en largeur compacte (iPhone : `NavigationView` mono-enfant y
rendait déjà en pile — le rendu iPhone est **identique** avant/après), 0 édition
de `project.pbxproj` (aucun fichier neuf).

## Validation

- **Gate réel = CI `iOS Tests`** (compile Xcode 26.1.1 / run simu iOS 18.2).
  L'environnement de cette itération est Linux : aucun toolchain Apple, donc
  aucune compilation locale possible — conforme au mode opératoire des
  itérations précédentes.
- Vérification statique effectuée : sous-chaîne `NavigationView {` absente des
  trois cibles scannées ; `NavigationStack {` présent l. 41 de
  `StatusComposerView.swift`.
- Collision essaim : balayage des 12 branches distantes les plus récentes →
  **aucune** ne touche `StatusComposerView.swift` ni
  `NavigationContainerMigrationTests.swift`.

## Bilan

**2 fichiers.** Le dernier conteneur de navigation déprécié de l'application
disparaît, ce qui répare une feuille cassée en largeur regular (iPad) sur ses
trois points d'entrée ; un nom accessible manquant est comblé sur l'action
primaire du même écran ; et le test de non-régression passe du statut « tolère un
fichier » à celui d'**interdiction générale**, applicable à tout code futur.

## Piste 221i+

1. **`StatusComposerView` et le Dynamic Type** : le corps est un `VStack` sans
   `ScrollView`, dans une feuille `.presentationDetents([.medium])`. Aux tailles
   d'accessibilité, la grille 5 colonnes de tuiles 56 pt + le sélecteur de
   visibilité + le champ de texte débordent probablement du détent. À mesurer
   avant de corriger (le remède — `ScrollView` + détent `.large` en secours —
   change le rendu nominal, donc il exige une preuve).
2. **Incohérence de présentation entre les trois sites du composer** :
   `RootViewComponents:743` pose `.presentationDragIndicator(.visible)`,
   `ConversationListView:756/767` non. Unifier (un seul modificateur, appliqué à
   la vue et non au site d'appel).
3. **`StoryViewerView+Content.shareStory()`** — code mort (0 caller), reporté par
   219i en attendant que la surface story refroidisse.
4. **`MeeshyShareExtension`** : câbler un `Localizable.xcstrings` à la cible
   (3 chaînes crues) — #2319 est désormais mergée, le frein est levé.
5. **Balayage Dark Mode généralisé** (piste 3 de 219i, inchangée) : couleur de
   marque claire posée sans lecture du `colorScheme`. Deux pièges déjà
   documentés : beaucoup de `MeeshyColors.indigoNNN` sont posés sur des fonds
   eux-mêmes thématisés et sont corrects ; toute surface descendant de
   `StoryViewerView` doit se brancher sur `colorScheme`, jamais sur
   `ThemeManager.mode`.
