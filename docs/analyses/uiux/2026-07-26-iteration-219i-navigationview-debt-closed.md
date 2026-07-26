# iOS UI/UX — Iteration 219i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axe** : Intégration plateforme native / HIG — **clôture** de la dette du
conteneur de navigation déprécié
**Base** : `main` HEAD `ffef1339e`

## Sélection de la cible

218i (mergée, #2330) laissait quatre pistes. L'essaim s'est **entièrement vidé**
entre-temps — `list_pull_requests` (open) = **0 PR** — ce qui débloque d'un coup
les cibles qui étaient « détenues par une PR en vol ».

| Piste 218i | Statut à l'ouverture de 219i |
|---|---|
| (b) `StatusComposerView` → `NavigationStack` | **Débloquée** : #2275 mergée, le fichier est libre. **Retenue.** |
| (c) `MeeshyShareExtension` i18n | Débloquée (#2319 mergée) mais c'est un **chantier de cible** (câbler un catalogue de chaînes), pas une itération UI/UX |
| (a) convergence des 5 résolutions de key window | Toujours valable, mais `StoryViewerView` reste chaud |
| (d) `sensoryFeedback` | Adoption large, à évaluer séparément |

(b) est retenue parce qu'elle **solde une dette entière** plutôt que d'en grignoter
une : c'est le dernier `NavigationView` des cibles app, et 214i avait laissé un
test conçu pour **échouer** le jour où il serait migré.

## Le défaut

`NavigationView` est **déprécié depuis iOS 16**. Le vrai problème n'est pas la
dépréciation mais son style par défaut, `DoubleColumnNavigationViewStyle` : à
largeur **regular**, un `NavigationView` à enfant unique se rend comme une **vue
divisée dont la colonne de détail est vide**, et ses `ToolbarItem` atterrissent
dans la barre de la mauvaise colonne. `StatusComposerView` ne pose pas
`.navigationViewStyle(.stack)`, la parade historique.

Ce qui rend ce dernier cas le **pire** des quatre migrés par 214i :

```swift
.navigationTitle(…)
.toolbar {
    ToolbarItem(placement: .navigationBarLeading)  { /* Annuler  */ }
    ToolbarItem(placement: .navigationBarTrailing) { /* Publier  */ }
}
```

**Les deux seules actions de l'écran vivent dans cette barre** — annuler et
publier. Il n'existe aucune autre affordance de sortie ni de validation dans le
corps de la vue.

Et les trois sites d'appel le présentent en **`.sheet`** :

| Site | Présentation |
|---|---|
| `RootViewComponents.swift:743` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |
| `ConversationListView.swift:756` | `.sheet(item:)` (republication) + `.presentationDetents([.medium])` |
| `ConversationListView.swift:767` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |

Sur iPad, une `.sheet` est une **form sheet** — largeur **regular**, exactement
l'environnement où le style double-colonne se déclenche. Le composer de status
était donc la surface la plus exposée de la famille.

## Correctif (219i)

Substitution du conteneur : `NavigationView {` → `NavigationStack {`. **Un
mot-clé, une ligne**, corps et accolades inchangés.

Migration prouvée sans effet de bord — vérifié sur le fichier : **0**
`NavigationLink`, **0** `navigationDestination`, **0** `navigationViewStyle`,
**0** `navigationBarItems`. C'est un conteneur mono-colonne pur. Le
`navigationTitle` et les deux `ToolbarItem` sont portés à l'identique par
`NavigationStack`.

Plancher de déploiement **iOS 16.0** (`project.yml:5`) → `NavigationStack` est
disponible **inconditionnellement** : aucune garde `@available`, aucune couche de
compatibilité. Sur iPhone (largeur compacte) le rendu est **identique** — le gain
porte sur iPad et sur la sortie de dépréciation.

## Ce que devient le test

214i avait écrit, dans `test_noUnexpectedNavigationViewRemains` :

> `StatusComposerView` is the last holdout. […] When that lands, this expectation
> drops to the empty set and the test fails until it is updated — **which is the
> intent**.

C'est exactement ce qui se produit. Le test :

1. gagne une assertion par fichier pour le dernier migré
   (`test_statusComposer_usesNavigationStack`) ;
2. voit son ensemble attendu passer de `{StatusComposerView.swift}` à **`[]`** ;
3. **change de rôle** : il cesse de suivre un arriéré qui rétrécit et devient un
   simple **cliquet** contre la réintroduction du conteneur déprécié où que ce
   soit dans les cibles app. Renommé en conséquence
   (`test_noNavigationViewRemains`).

La dette est **close**, pas seulement réduite — et le balayage empêche sa
réouverture silencieuse.

## Hors périmètre (assumé)

- **`packages/MeeshySDK/Sources/MeeshyUI/`** porte **5** `NavigationView`
  (`UnifiedPostComposer`, `VoiceProfileWizardView`, `VoiceProfileManageView`,
  `CodeViewerView`, `DocumentViewerView`). **Hors périmètre de cette routine**
  (iOS app uniquement) et hors du balayage du test, qui ne scanne que
  `Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`. À traiter par
  la piste SDK.
- **`.navigationTitle` de `VoiceProfileManageView.addSamplesSheet`** — noté par
  214i : la feuille rend son titre en `Text` dans le corps alors qu'elle vit
  désormais dans un `NavigationStack` sans `navigationTitle`. **Change le
  visuel** → itération dédiée, pas un glissement de celle-ci.

## Test

`NavigationContainerMigrationTests` **étendu**, pas dupliqué — la règle est une,
son verrou doit l'être aussi (même doctrine que l'extension de
`NativeSharePresentationTests` en 216i).

**RED prouvé contre `main` `ffef1339e`** : **3/3** assertions neuves échouent —
les 2 de `assertMigrated` (le fichier porte `NavigationView {` et pas
`NavigationStack {`) et celle du balayage (l'ensemble y vaut
`{StatusComposerView.swift}`, pas `[]`). **GREEN** : 3/3 après correctif.

## Vérification

- Pas de toolchain Swift (Linux) → balayage des 3 cibles app **rejoué
  indépendamment** hors Xcode, sur l'arbre courant (**0 fichier fautif**) et sur
  `origin/main` (**exactement `{StatusComposerView.swift}`**). Équilibre
  accolades / parenthèses des 2 fichiers au tokenizer : **0 / 0**.
- Absence de `NavigationLink` / `navigationDestination` / `navigationViewStyle` /
  `navigationBarItems` dans `StatusComposerView` confirmée par grep → substitution
  sans effet de bord.
- Plancher iOS 16.0 confirmé (`project.yml`) → aucune garde de disponibilité.
- Collision essaim : `list_pull_requests` (open) = **0 PR**. Aucun risque.
- **Aucun fichier neuf** → 0 édition de `project.pbxproj`.
- Nom de classe contenant « Navigation » → phase 2 de `meeshy.sh test`
  (`FINAL_PHASE_CLASS_PATTERN`).

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production, 1 ligne** (un mot-clé). 1 fichier de test étendu.
Dette `NavigationView` des cibles app : **close**. 0 clé i18n, 0 couleur,
0 métrique de layout, 0 logique, 0 réseau, 0 changement visuel sur iPhone.

## Piste 220i+

1. **Convergence des 5 résolutions de key window** sur `DeviceLayout.windowSize`
   (SSOT posé en 218i) : `StoryViewerView` ×2, `ConversationView:338`,
   `RootView` ×2, `ComposerModels:190`, `IslandEmergingBanner:62`. Commencer par
   les non-story si la surface story est encore chaude.
2. **`sensoryFeedback` (iOS 17+)** : **0 usage** contre 11
   `UIImpactFeedbackGenerator` — adoption native sous garde de disponibilité
   (plancher iOS 16).
3. **`MeeshyShareExtension` i18n** : la cible n'a **aucun** `Localizable.xcstrings`
   propre, ses `String(localized:)` retombent toujours sur `defaultValue`, et
   3 chaînes sont crues (`"Cancel"`, `"Send"`, `"Share to Meeshy"`). Câbler un
   catalogue à la cible est un chantier à part entière.
4. **`VoiceProfileManageView.addSamplesSheet`** : titre rendu en `Text` dans le
   corps sous un `NavigationStack` sans `navigationTitle` (change le visuel).
5. **⚠️ Aléa CI connu** : le bundle `MeeshyTests` héberge une population de tests
   sensibles au timing (courses sur des singletons process-globaux) qui tombent
   un par un sur des PR sans rapport — cf. le pointeur de suivi. Ne pas les
   prendre pour des régressions.
