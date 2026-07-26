# Plan — iOS UI/UX Iteration 220i

**Objet** : solder la dette `NavigationView` des cibles app iOS en migrant le
**dernier** site (`StatusComposerView`) vers `NavigationStack`, et réduire
l'attendu du test de balayage à l'ensemble vide.

**Base** : `main` HEAD `ffef133` · **Branche** : `claude/quirky-curie-e9arc0`

## Sélection de la cible

1. **Resync** : `HEAD` de la branche de travail était **ancêtre de
   `origin/main`** (PR précédente mergée) → branche **recréée** depuis
   `origin/main` HEAD `ffef133`, conformément au workflow « PR mergée = travail
   neuf ».
2. **Numérotation** : plus haute itération observée (analyses + plans) = **219i**
   → **220i** choisi strictement supérieur.
3. **Collision essaim** : `list_pull_requests` (open) → **0 PR** (iOS ou autre).
   Aucun risque de collision sur quelque fichier que ce soit.
4. **Cible désignée par l'historique** : 214i, 215i, 218i et 219i pointent toutes
   `StatusComposerView` comme la suite. Le blocage (#2275) est **mergé**
   (`131f7939e`), tout comme #2319 et #2325.
5. **Piège 214i à désarmer** : `test_noUnexpectedNavigationViewRemains` fige
   l'attendu à `{StatusComposerView.swift}` — il **doit** devenir vide dans la
   même itération que la migration, sinon la CI casse.

## Étapes

| # | Action | Statut |
|---|---|---|
| 1 | Resync : branche recréée depuis `origin/main` HEAD `ffef133` (ancien HEAD = ancêtre de main) | ✅ |
| 2 | Vérifier que #2275 est bien dans `main` et qu'aucune PR n'est ouverte | ✅ |
| 3 | Balayage `NavigationView` : 1 seul site app restant, 5 dans le SDK (hors périmètre) | ✅ |
| 4 | Qualifier le défaut : relire les **3** call-sites et leurs détentes (`[.medium]` partout) | ✅ |
| 5 | Vérifier plancher iOS 16.0 → pas de garde `@available` | ✅ |
| 6 | Vérifier absence de `NavigationLink` / `navigationDestination` / `navigationViewStyle` / `navigationBarItems` / `navigationBarHidden` / `NavigationSplitView` dans le fichier | ✅ |
| 7 | `StatusComposerView.swift` : `NavigationView {` → `NavigationStack {` | ✅ |
| 8 | Test : ajouter `test_statusComposer_usesNavigationStack` (4ᵉ `assertMigrated`) | ✅ |
| 9 | Test : attendu du balayage → `Set<String>()`, renommage `test_noNavigationViewRemains`, message d'échec réorienté « régression » | ✅ |
| 10 | Test : doc-comment de classe → garde-fou de régression à attendu vide | ✅ |
| 11 | Vérification déterministe hors Xcode (prédicat rejoué arbre courant **et** `origin/main` ⇒ rouge avant / vert après) | ✅ |
| 12 | Analyse + plan + tracking | ✅ |
| 13 | Commit + push + PR | ⏳ |

## Contraintes respectées

- **Aucun redesign** : substitution de conteneur, corps de vue intact
  (toolbar, `onAppear`, publication, récupération de brouillon inchangés).
- **Aucun changement visuel sur iPhone** (largeur compacte : rendu identique).
- **0 clé i18n**, 0 couleur, 0 constante visuelle, 0 layout, 0 logique, 0 réseau.
- **Compatibilité** : `NavigationStack` disponible dès iOS 16 = plancher exact —
  aucune régression sur les versions supportées, aucune duplication de logique,
  aucune garde `@available`.
- **Aucun fichier neuf** → 0 édition de `project.pbxproj`, rien à régénérer.
- **Réutilisation** : le test étend une suite existante au lieu d'en créer une.

## Non fait (et pourquoi)

- **`packages/MeeshySDK/**` (5 `NavigationView`)** : hors périmètre de la routine
  iOS app. Documenté en piste 221i+ pour la piste SDK.
- **`navigationBarHidden` (47 occurrences, 11 fichiers)** : également déprécié,
  mais 10 occurrences sont dans `RootView` (racine, navigation imbriquée) et
  l'équivalence avec `.toolbar(.hidden, for: .navigationBar)` n'est pas stricte
  dans tous les cas d'imbrication → itération dédiée, jamais en bloc.
- **`.navigationBarLeading` / `.navigationBarTrailing`** : renommés en iOS 17,
  donc non migrables sans garde au plancher iOS 16 → chantier design-system.
- **Détentes des call-sites** (`[.medium]` seul, sans `.large`) : le clavier ne
  fait pas grandir une feuille à détente unique. Piste réelle, mais elle touche
  **deux fichiers appelants** et **change le comportement de présentation** — donc
  hors de cette itération, qui doit rester une substitution à effet nul sur
  iPhone. À qualifier sur simulateur avant d'être proposée.
- **`.navigationTitle` sur `addSamplesSheet`** (héritée de 214i) : changement
  visuel → itération dédiée.

## Suite (221i)

Voir § « Piste 221i+ » de l'analyse. Priorité au **`MeeshyShareExtension` i18n**
(#2319 résolue, piste libre depuis trois itérations) ou à
`navigationBarHidden` **sur une feuille isolée** (`LinksHubView:64`), jamais sur
`RootView` d'entrée.
