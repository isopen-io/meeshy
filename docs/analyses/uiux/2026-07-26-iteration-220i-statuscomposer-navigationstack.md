# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
**Axes** : Intégration native / HIG (conteneur de navigation, iPad) ·
Accessibilité VoiceOver (CTA principal) · i18n (3 clés, 7 locales)
**Base** : `main` HEAD `ffef133`

## Sélection de la cible

Le pointeur 219i laissait cinq pistes, dont trois étaient bloquées par des PR en
vol. Les trois bloqueurs ont atterri dans `main` depuis :

| Piste 219i | Bloqueur | Statut au moment de 220i |
|---|---|---|
| 4. `StatusComposerView` → `NavigationStack` | PR #2275 | **mergée** (`131f793`) → libre |
| 2. `TrackingLinkDetailView` (dette partage) | PR #2325 | **mergée** (`ffef133`) → dette déjà retombée |
| 5. `MeeshyShareExtension` i18n | PR #2319 | **mergée** (`26b8ef1`) → libre |
| 1. `StoryViewerView+Content.shareStory()` | surface story chaude | encore chaude |
| 3. Balayage Dark Mode généralisé | — | audit large, itération dédiée |

La piste **4** est retenue : c'est la seule dont le test de suivi
(`NavigationContainerMigrationTests`, écrit en 214i) **épingle nommément** le
fichier comme dernier récalcitrant, avec la consigne explicite « quand ça
atterrit, cet attendu tombe à l'ensemble vide ». C'est donc la dette la plus
mûre du lot, et la solder ramène à **zéro** le nombre de `NavigationView` de
l'application.

L'audit ligne à ligne du fichier a fait apparaître un second défaut réel sur la
même surface — le CTA principal — traité dans la même itération.

## Défaut A — Le dernier `NavigationView` de l'app (HIG / iPad)

`StatusComposerView.swift:37` ouvrait son corps sur `NavigationView { … }`.

`NavigationView` est déprécié depuis iOS 16 et — c'est le point qui casse
réellement — adopte par défaut le style **double colonne**. En largeur *regular*,
un `NavigationView` à enfant unique se rend en **split view dont la colonne de
détail est vide**.

Ce n'est pas théorique ici : les **trois** points de présentation sont des
feuilles.

| Site | Présentation |
|---|---|
| `RootViewComponents.swift:743` | `.sheet(isPresented:)` + `.presentationDetents([.medium])` |
| `ConversationListView.swift:756` | `.sheet(item:)` (republication d'un status) |
| `ConversationListView.swift:767` | `.sheet(isPresented:)` |

Sur iPad, une `.sheet` se présente en *form sheet*, donc en largeur **regular**.
Le composer d'humeur se repliait dans la colonne latérale, l'utilisateur faisait
face à un panneau de détail vide, et les **deux seules affordances de barre** de
l'écran — « Fermer » et « Publier » — se retrouvaient mal placées. Le seul CTA
de la feuille était donc atteignable de travers sur toute une classe d'appareils.

Le plancher de déploiement est **iOS 16.0** (`project.yml`) → `NavigationStack`
est disponible **inconditionnellement**, sans `@available`, sans shim de
compatibilité.

### Correctif A

`NavigationView {` → `NavigationStack {`. Titre, `navigationBarTitleDisplayMode`,
`toolbar`, `onAppear`, gradient de fond et détentes : strictement inchangés.

## Défaut B — Le CTA principal perd son nom pendant la publication

`publishToolbarButton` (l. 207-244 avant correctif) ne portait **aucun**
modificateur d'accessibilité :

```swift
} label: {
    if isPublishing {
        ProgressView().tint(…).scaleEffect(0.8)   // ← aucun texte
    } else {
        Text(String(localized: "status.composer.publish", …))
    }
}
.disabled(selectedEmoji == nil || isPublishing)
```

Deux conséquences distinctes, toutes deux sur le **seul** CTA de l'écran :

1. **Pendant la publication**, le label du bouton est un `ProgressView` nu. Sans
   `.accessibilityLabel`, le contrôle **perd son nom accessible** au moment
   précis où l'utilisateur veut savoir ce qui se passe : VoiceOver n'a plus de
   quoi l'annoncer, et rien ne dit que l'action est en cours.
2. **À l'état désactivé** — aucune humeur sélectionnée, c'est-à-dire l'état
   d'**ouverture par défaut** de la feuille — la seule différence perceptible est
   la **couleur** du texte (`MeeshyColors.brandGradient` → `theme.textMuted`).
   C'est un état signalé par la couleur seule (**WCAG 1.4.1**), et ni le texte
   visible ni VoiceOver ne disent *pourquoi* l'action est indisponible.

### Sibling prouvé

`FeedView.swift:1240-1273` — le bouton « Publier » du composer de fil — a une
forme **strictement identique** (`ProgressView` si `isUploading`, `Text` sinon,
`.disabled(!hasContent || isUploading)`) et porte déjà
`.accessibilityLabel` + `.accessibilityHint` + `.accessibilityValue`
conditionnelle, avec la famille de clés `a11y.feed.compose.publish*`. 220i aligne
le composer d'humeur sur ce patron existant plutôt que d'en inventer un.

### Correctif B

```swift
.accessibilityLabel(String(localized: "status.composer.publish", …))
.accessibilityHint(String(localized: "status.composer.a11y.publish.hint", …))
.accessibilityValue(
    isPublishing
        ? String(localized: "status.composer.a11y.publish.publishing", …)
        : (selectedEmoji == nil
            ? String(localized: "status.composer.a11y.publish.disabled", …)
            : "")
)
```

Trois décisions :

- **Le nom accessible réutilise la clé du texte visible** (`status.composer.publish`).
  Le nom accessible contient donc le libellé affiché — **WCAG 2.5.3 *Label in
  Name***, ce qui compte pour le contrôle vocal — et il **survit** au passage en
  `ProgressView`. **0 clé neuve pour le label.**
- **Les états transitoires passent par la valeur, pas par le label.** Le label
  reste stable (« Publier ») et la valeur porte « Publication en cours » /
  « Indisponible, choisissez une humeur » / `""`. C'est exactement la répartition
  du sibling `FeedView`.
- **La condition d'indisponibilité est littéralement celle de `.disabled`**
  (`selectedEmoji == nil`). Un test le verrouille : sans cela, VoiceOver pourrait
  annoncer « indisponible » sur un bouton opérable, ou l'inverse.

`""` et les `String(localized:)` sont des `String` **runtime** → surcharge
`StringProtocol` de `.accessibilityValue`, aucune localisation parasite
(doctrine 195i).

### Les 3 clés neuves sont réellement traduites

Namespace `status.composer.a11y.publish.*` (celui du fichier). Déclarées
**inline** avec `defaultValue` *et* ajoutées à `Localizable.xcstrings`
**traduites dans les 7 locales du catalogue** (ar, de, en, es, fr, it, pt-BR),
`extractionState: "manual"` — shape identique aux clés 195i.

| Clé | fr | en |
|---|---|---|
| `…publish.hint` | Publie votre humeur | Publishes your mood |
| `…publish.publishing` | Publication en cours | Publishing |
| `…publish.disabled` | Indisponible, choisissez une humeur | Unavailable, pick a mood |

Insertion **additive** juste après le bloc `status.online`, **0 réordonnancement**
(vérifié clé à clé, cf. Vérification).

> **Réutilisation écartée, à dessein.** Les clés `a11y.feed.compose.publish*`
> sont déjà traduites et auraient coûté 0 clé neuve. Elles ont été rejetées sur
> le fond : `.uploading` vaut « Envoi en cours » / « Uploading » — un *envoi*, pas
> une publication d'humeur — et `a11y.feed.compose.publish` vaut **« Post »** en
> anglais alors que le bouton **affiche** le texte de `status.composer.publish`.
> VoiceOver aurait prononcé un mot absent de l'écran : violation de 2.5.3, c'est-à-dire
> exactement le critère que ce correctif vient satisfaire. La justesse du libellé
> prime sur l'économie de clés.

## Hors périmètre

- **Les 6 clés `status.composer.*` existantes ne sont pas au catalogue** — donc
  non traduites. Ce n'est **pas** un défaut propre à cette surface :
  **1724 des 2586** clés `String(localized:)` de l'app sont dans ce cas
  (mesuré). C'est le patron accepté du dépôt (déclaration inline, extraction au
  build — doctrine 208i/209i). Un rattrapage de traduction est une campagne à
  part entière, pas un effet de bord de 220i. Les 3 clés **neuves** sont, elles,
  livrées traduites.
- **`StoryViewerView+Content.shareStory()`** (code mort, 0 caller), **balayage
  Dark Mode généralisé**, **i18n de `MeeshyShareExtension`** : reportés au
  pointeur 221i+.

## Tests

### `NavigationContainerMigrationTests.swift` (mis à jour)

1. `test_statusComposer_usesNavigationStack()` — nouveau, via l'helper
   `assertMigrated` déjà en place (absence de `NavigationView {`, présence de
   `NavigationStack {`).
2. `test_noUnexpectedNavigationViewRemains` → renommé
   **`test_noNavigationViewRemains`**, attendu ramené de
   `["StatusComposerView.swift"]` à **`[]`**. Le commentaire « dernier
   récalcitrant, tenu par une PR en vol » est remplacé par la doctrine de
   non-régression. C'est le déclenchement prévu par l'auteur de 214i, honoré ici.

### `StatusComposerPublishAccessibilityTests.swift` (neuf)

Idiome source-introspection du dépôt, **5 tests / 14 assertions**. Point clé :
les assertions portent sur la **tranche de source ancrée** qui va de
`private var publishToolbarButton: some View {` au `// MARK:` suivant — **pas**
sur le fichier entier. C'est délibéré : `StatusComposerView` porte déjà des
modificateurs d'accessibilité ailleurs (`.accessibilityAddTraits` sur la grille
d'emojis et les capsules de visibilité en 184i, `.accessibilityHidden` sur les
glyphes décoratifs en 213i). Un `contains` global serait passé au vert **grâce à
eux**, sans rien prouver sur le bouton de publication.

1. Le bouton porte un `.accessibilityLabel`, **et** c'est la clé du texte visible.
2. La valeur existe et l'état in-flight est piloté par `isPublishing`.
3. L'indisponibilité est énoncée **et** conditionnée par `selectedEmoji == nil` ;
   le hint est présent et vient du namespace du fichier.
4. **Non-régression visuelle** : la branche `ProgressView()` et
   `.disabled(selectedEmoji == nil || isPublishing)` sont intactes — 220i ajoute
   des annonces, pas du comportement.
5. Les 3 clés neuves existent au catalogue, dans les **7** locales, toutes en
   `state == "translated"` et à valeur non vide.

## Vérification

Pas de toolchain Swift sous Linux → chaque assertion a été rejouée
déterministement hors Xcode, contre l'arbre de travail **et** contre
`origin/main`.

- **GREEN (arbre de travail)** : **14/14**.
- **RED (`origin/main` `ffef133`)** : **11/14 échouent**. Les 3 qui passent sont
  précisément les assertions de **non-régression** (branche `ProgressView`, règle
  `.disabled`) — elles doivent passer des deux côtés, c'est leur rôle.
- Balayage `NavigationView {` sur les 3 cibles livrées
  (`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) : **ensemble
  vide**, ce qui est exactement le nouvel attendu du test.
- **Catalogue** : JSON revalidé après insertion (1367 → 1370 clés) ; comparaison
  **clé à clé** avant/après → aucune clé préexistante modifiée ni déplacée,
  `sourceLanguage` et `version` inchangés. L'insertion textuelle évite tout
  re-formatage global du fichier.
- Équilibre accolades / parenthèses / crochets des 3 fichiers Swift touchés, au
  tokenizer (chaînes retirées **avant** les commentaires) : **0 / 0 / 0**.
- Fichier de test neuf → enregistré par `xcodegen generate` (la cible
  `MeeshyTests` globbe `MeeshyTests/`), **0 édition de `project.pbxproj`**. Nom de
  classe contenant « Status » et « Compose » → phase 2 de `meeshy.sh test`
  (`FINAL_PHASE_CLASS_PATTERN`).
- Collision essaim : aucun commit ne touche `StatusComposerView.swift` depuis le
  merge de 213i (`d8f6fc6`, PR #2275) ; les trois pistes concurrentes du pointeur
  219i sont toutes mergées.

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production Swift : +22 / −1 lignes** ; catalogue : **+141 lignes
purement additives**.

- Le **dernier** conteneur de navigation déprécié de l'application est éliminé —
  l'ensemble suivi passe à **vide**, et le test bascule de « dette épinglée » à
  « non-régression ».
- Le composer d'humeur cesse de se replier en split view vide sur iPad.
- Le CTA principal **garde son nom VoiceOver** pendant son état d'attente, et
  explique enfin son indisponibilité autrement que par la couleur.
- 3 clés i18n neuves, livrées **traduites dans les 7 locales**.

**0 logique métier, 0 réseau, 0 layout, 0 couleur, 0 édition de `project.pbxproj`.**

## Piste 221i+

1. **`StoryViewerView+Content.shareStory()`** — code mort (0 caller, établi en
   217i) portant le dernier parcours de fenêtres de l'app. Sa suppression
   resserre l'ensemble de dette du test n° 8 de 219i. Frein : température de la
   surface story.
2. **`MeeshyShareExtension`** — débloqué (#2319 mergée) : câbler un
   `Localizable.xcstrings` propre à la cible, 3 chaînes crues.
3. **Balayage Dark Mode généralisé** — couleur de marque claire posée sans
   lecture du `colorScheme` (famille de défaut de 219i). Deux pièges déjà
   documentés : beaucoup de `MeeshyColors.indigoNNN` sont posés sur des fonds
   eux-mêmes thématisés et sont corrects ; toute surface descendant de
   `StoryViewerView` doit se brancher sur `colorScheme`, **jamais** sur
   `ThemeManager.mode`.
4. **`sensoryFeedback` (iOS 17+)** — 0 usage contre 11
   `UIImpactFeedbackGenerator` ; migration derrière garde de disponibilité
   (piste ouverte en 217i, toujours vierge).
5. **CTA principaux in-flight restants** — appliquer la doctrine label-stable /
   valeur-transitoire de 220i aux autres boutons qui échangent leur `Text` contre
   un `ProgressView` (candidats : `ChangePasswordView`, `EditProfileView`).
