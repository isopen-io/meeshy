# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axes** : Intégration native / HIG (conteneur de navigation) · Accessibilité (VoiceOver) · Adaptation iPad
**Base** : `main` HEAD `ffef133`

## Sélection de la cible

Le pointeur 219i laissait cinq pistes. Elles ont été re-vérifiées **une par une contre
`main` courant** — le dépôt a beaucoup bougé (les PR #2275, #2319, #2325, #2326, #2330,
#2332 ont toutes mergé depuis la rédaction du pointeur) :

| Piste héritée | État réel sur `main` `ffef133` | Décision |
|---|---|---|
| (4) `StatusComposerView` → `NavigationStack` | **Toujours ouverte.** #2275 a mergé sans faire la migration (elle portait le 213i « glyphes décoratifs » du même fichier). `NavigationView {` subsiste l.37. | **Retenue** |
| (2) `TrackingLinkDetailView` | **Soldée** : #2325 a convergé le fichier, plus aucun `UIActivityViewController` dedans. | Close |
| (1) `StoryViewerView+Content.shareStory()` | Toujours là (l.965), toujours **0 appelant**. Surface story = **26 des 30 derniers commits iOS** → la plus chaude du dépôt. | Différée |
| (5) `MeeshyShareExtension` i18n | Le gap est réel (3 chaînes crues + **aucun** `Localizable.xcstrings` câblé au target ⇒ tous les `String(localized:)` de l'extension retombent sur leur `defaultValue`, donc anglais/français figé pour tout le monde). **MAIS** : `project.yml:151` documente que ce target est *défini et compilé, pas embarqué* — il est retiré des `dependencies` de `Meeshy` faute de profil de signature (`me.meeshy.app.share-extension` non enregistré côté Apple Developer). **L'extension n'est livrée à personne.** | Différée — valeur utilisateur nulle tant que le recâblage de signature n'est pas fait ; à traiter **avec** lui, pas avant |
| (3) Balayage Dark Mode généralisé | Piste de fond valable, mais le pointeur 219i note lui-même deux pièges (beaucoup d'`indigoNNN` sont posés sur des fonds déjà thématisés). Demande un audit dédié, pas un passage opportuniste. | Reportée |

La piste (4) est en outre la seule qui **a déjà son test qui attend** : `NavigationContainerMigrationTests`
épingle explicitement `StatusComposerView.swift` comme dernier débiteur et documente que
l'attendu doit tomber à l'ensemble vide quand la migration atterrit.

## Défaut A — Dernier `NavigationView` de l'app (HIG / iPad)

```swift
var body: some View {
    NavigationView {          // l.37
        ZStack { … }
```

`NavigationView` est déprécié depuis iOS 16 et — c'est le point qui fait mal —
**son style par défaut est le double-colonne**. En environnement de largeur *regular*
(iPad, et la feuille de partage iPad), un `NavigationView` à enfant unique se rend
comme un **split view dont la colonne de détail est vide** : le contenu de la feuille
est relégué dans la colonne maître étroite, et la barre de navigation qui porte
**l'unique affordance de sortie** (le bouton « Fermer », `ToolbarItem(.navigationBarLeading)`)
se retrouve mal placée.

Le fichier ne pose **aucun** `.navigationViewStyle(.stack)` — le correctif de contournement
que d'autres écrans avaient appliqué à la main. Le défaut est donc entier.

Le plancher de déploiement est **iOS 16.0** (`project.yml`) : `NavigationStack` est
disponible **inconditionnellement**, sans `@available`, sans shim de compatibilité.
La substitution est stricte — `.navigationTitle`, `.navigationBarTitleDisplayMode(.inline)`
et le `.toolbar` se comportent à l'identique dans les deux conteneurs, et sur iPhone
(largeur *compacte*) `NavigationView` se rendait **déjà** comme une pile : **0 changement
visuel iPhone**, la correction ne se voit qu'en largeur regular, là où c'était cassé.

Le composeur est atteint depuis **3 sites d'appel** (`RootViewComponents:743`,
`ConversationListView:756` et `:767`), tous en `.sheet` — c'est-à-dire précisément le
mode de présentation où le split-view fantôme se manifeste sur iPad.

Après ce correctif, `NavigationView` **disparaît des trois cibles iOS compilées**
(`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) : dette à zéro.

## Défaut B — Le bouton d'action primaire est anonyme pendant qu'il travaille

```swift
} label: {
    if isPublishing {
        ProgressView()            // ← aucun texte
            .tint(MeeshyColors.indigo500)
            .scaleEffect(0.8)
    } else {
        Text(String(localized: "status.composer.publish", …))
    }
}
.disabled(selectedEmoji == nil || isPublishing)
```

Le bouton **Publier** est l'action primaire de l'écran, et il portait **zéro modificateur
d'accessibilité**. Deux conséquences distinctes :

1. **Pendant la publication**, son label se réduit à un `ProgressView()` — une vue qui
   ne contribue **aucun nom accessible**. VoiceOver annonçait alors un bouton **sans
   nom**, atténué (WCAG 4.1.2 *Name, Role, Value*). L'utilisateur voyant perçoit un
   spinner, l'utilisateur VoiceOver n'a strictement rien.
2. **Avant qu'une humeur soit choisie**, le bouton est `.disabled`. VoiceOver dit
   « atténué » mais **jamais pourquoi** — la précondition manquante (« choisissez une
   humeur ») n'est portée que par l'absence de surbrillance sur la grille d'emojis,
   c'est-à-dire **par la seule couleur** (WCAG 1.4.1).

### Ce n'est pas une invention : le jumeau était déjà réparé

`FeedView.swift:1252-1274` porte **exactement le même bouton** (publier, `ProgressView`
pendant l'envoi, `disabled` sans contenu) et il porte, lui, `.accessibilityLabel` +
`.accessibilityHint` + `.accessibilityValue` ternaire couvrant les deux états. Le
composeur d'humeur est le seul des deux à ne pas avoir reçu le traitement. Le correctif
**reprend le patron du fichier voisin** plutôt que d'en inventer un.

### Correctif B

```swift
.accessibilityLabel(String(localized: "status.composer.publish", …))
.accessibilityValue(
    isPublishing
        ? String(localized: "status.composer.publish.a11y.publishing", defaultValue: "Envoi en cours", …)
        : (selectedEmoji == nil
            ? String(localized: "status.composer.publish.a11y.disabled", defaultValue: "Indisponible, choisissez une humeur", …)
            : "")
)
```

Trois décisions :

**Le label réutilise la clé du titre visible** (`status.composer.publish`) — **0 clé neuve
pour le nom**, et surtout nom parlé et nom rendu **ne peuvent plus diverger**.

**Pas de `.accessibilityHint`.** Le jumeau du fil en pose un (« Publie votre message dans
le fil »), mais la HIG réserve le hint aux actions **dont le résultat n'est pas évident
d'après le label**. « Publier », dans la barre d'un composeur, l'est. On ne recopie pas
le voisin par mimétisme.

**Les 2 clés d'état sont inline, namespacées `status.composer.*`.** Le dépôt n'a
délibérément **pas** de SSOT pour « Envoi en cours » : `bubble.delivery.sending`,
`forward.sending`, `share.sending`, `message-detail.a11y.report.sending` et
`a11y.feed.compose.publish.uploading` coexistent avec le **même texte** sous cinq
namespaces distincts. Emprunter la clé du *fil* dans le composeur d'*humeur* aurait
rompu cette convention pour économiser une entrée. Les clés sont posées en
`String(localized:defaultValue:)` inline — **0 édition de `Localizable.xcstrings`**,
extraction au build, exactement comme les 8 autres clés `status.composer.*` du même
fichier (dont aucune n'a d'entrée catalogue).

**État nominal = valeur vide.** Humeur choisie et rien en vol : le bouton annonce son
nom seul, sans commentaire d'état résiduel.

## Hors périmètre (examiné, écarté)

- **`MeeshyFont.relative(36)` dans un cadre `56×56` fixe** (grille d'emojis) — aux
  tailles Dynamic Type d'accessibilité l'emoji déborde son cadre. C'est un vrai gap,
  mais il relève de la **doctrine gelée en 211i** (glyphe dans cadre rigide, intentionnel)
  et sa correction est un changement de layout sur une grille : il demande un arbitrage
  visuel, pas un passage opportuniste.
- **Limite de 122 caractères dupliquée** (`newValue.count > 122` et `limit: 122`) —
  duplication réelle mais purement interne, aucun effet utilisateur, et l'extraire en
  constante ne rentre pas dans le budget de risque d'une itération dont le cœur est un
  changement de conteneur de navigation.
- **`ToolbarItem(placement: .navigationBarLeading/.navigationBarTrailing)`** — remplacés
  par `.topBarLeading`/`.topBarTrailing` en iOS 17, mais le plancher est iOS 16 :
  migrer imposerait une garde `@available` pour un gain nul. Laissés tels quels.

## Test

**Deux suites, aucune nouvelle infrastructure.**

`NavigationContainerMigrationTests` (existante) :
- `test_statusComposerView_usesNavigationStack` (neuf) rejoint les 3 assertions de
  migration de 214i ;
- `test_noUnexpectedNavigationViewRemains` devient `test_noNavigationViewRemains` :
  l'attendu passe de `["StatusComposerView.swift"]` à **l'ensemble vide**. Le test
  cesse d'être un cliquet à dette épinglée pour devenir une **garde de régression
  simple** — tout `NavigationView` réintroduit dans les trois cibles compilées échoue ici.

`StatusComposerAccessibilityTests` (neuf, 4 tests / 6 assertions), idiome
source-introspection du dépôt (pas de toolchain Swift sous Linux). Les 6 assertions
sont ancrées dans une fenêtre après `.disabled(selectedEmoji == nil || isPublishing)`
— ancre **vérifiée unique** dans le fichier. Conformément aux leçons de vérification
216i, la fenêtre est **mesurée et non devinée** : l'assertion la plus lointaine tombe
à **731** caractères, la fenêtre est fixée à **900**.

## Vérification

Pas de toolchain Xcode (Linux) → chaque assertion a été évaluée mécaniquement, des deux
côtés du diff, en rejouant le prédicat exact du test :

- **6/6 assertions RED contre `main` `ffef133`** (aucun des 6 fragments n'existe dans
  la fenêtre d'ancrage sur `main`) et **6/6 GREEN** sur la branche.
- Balayage du prédicat de `filesUsingDeprecatedContainer()` sur les 3 cibles scannées
  (`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) → **0 fichier**
  contenant `NavigationView {` ⇒ l'attendu vide tient. Sur `main` : 1 (`StatusComposerView.swift`).
- `NavigationStack {` présent 1 fois dans `StatusComposerView` ⇒ l'assertion positive
  d'`assertMigrated` tient.
- Le littéral `NavigationView {` que portent les deux suites de test ne pollue pas le
  balayage : `MeeshyTests` n'est pas dans `scannedTargets`.
- Équilibre accolades / parenthèses / crochets des 3 fichiers au tokenizer (chaînes
  retirées **avant** les commentaires) : **0 / 0 / 0**.
- Typage de `.accessibilityValue(…)` : les trois branches du ternaire rendent `String`
  (`String(localized:)` et `""`), donc la surcharge `where S: StringProtocol` — la même
  que `FeedView` utilise déjà ligne 1269.
- Fichier de test **neuf** → enregistré par le globbing récursif de `xcodegen generate`,
  **0 édition de `project.pbxproj`**. Nom de classe portant `Status` **et** `Compose`
  → phase 2 de `meeshy.sh test` (`FINAL_PHASE_CLASS_PATTERN`).
- Collision essaim : les outils GitHub (MCP / `gh`) sont **indisponibles dans cette
  session**, la liste des PR ouvertes n'a donc pas pu être interrogée. Le contrôle a été
  fait sur l'état réel de `main` : les 6 PR iOS que le pointeur 219i citait comme en vol
  ont toutes mergé, et `StatusComposerView.swift` n'a **pas** été touché par elles (son
  `NavigationView` survit). Le risque résiduel est un jumeau parti sur la même piste —
  la piste étant nommément désignée par le test lui-même. Signalé au mainteneur.

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production : +9 / −1 lignes.** Le **dernier** `NavigationView` de l'app
migré vers `NavigationStack` (dette du conteneur déprécié à **zéro**, split-view fantôme
iPad supprimé sur les 3 sites de présentation du composeur), 1 bouton d'action primaire
qui cesse d'être anonyme pendant son propre travail, 1 précondition d'activation qui
cesse d'être portée par la seule couleur. **0 édition de `Localizable.xcstrings`, 0 clé
pour le nom (réutilisation du titre visible), 0 logique métier, 0 réseau, 0 layout,
0 changement visuel iPhone.**

## Piste 221i+

1. **`StoryViewerView+Content.shareStory()`** — suppression de code mort (0 appelant,
   établi en 217i, re-vérifié ici). Seul frein : la surface story concentre 26 des 30
   derniers commits iOS. À prendre dès qu'elle refroidit ; réduira l'ensemble de dette
   du test n° 8 de 219i.
2. **`MeeshyShareExtension`** — le gap i18n est réel mais l'extension **n'est embarquée
   dans aucun build livré** (signature en attente, `project.yml:151`). Ne pas la localiser
   isolément : la traiter **dans le même lot** que le recâblage de signature, sinon
   c'est du travail invisible.
3. **Balayage Dark Mode généralisé** (hérité de 219i) : couleur de marque claire posée
   sans lecture du `colorScheme`. Mérite un audit dédié, avec les deux pièges déjà
   documentés en 219i.
4. **Grille d'emojis du composeur d'humeur en Dynamic Type d'accessibilité** —
   `MeeshyFont.relative(36)` dans un cadre `56×56` fixe. Nécessite un arbitrage visuel
   (cadre adaptatif vs doctrine « cadre rigide » gelée en 211i), donc une itération à
   part entière avec sa décision assumée.
5. **`sensoryFeedback` (iOS 17+)** — 0 usage contre 11 `UIImpactFeedbackGenerator`
   (hérité de 216i, garde de disponibilité requise au plancher iOS 16).
