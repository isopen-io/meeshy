# Iteration-220i — `StatusComposerView`: dernier `NavigationView`, écran 100 % français, bouton Publier sans nom VoiceOver

**Date :** 2026-07-26 · **Piste :** iOS UI/UX (suffixe `i`) · **Base :** `main` HEAD `ffef133`
**Domaines :** HIG / adaptation iPad · Localisation (i18n) · Accessibilité (VoiceOver)
**Fichiers de production :** `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`,
`apps/ios/Meeshy/Localizable.xcstrings`
**Tests :** `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`,
`apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift`

## Contexte

`StatusComposerView` est la feuille de publication d'un **status / mood** (emoji
d'humeur + texte court ≤ 122 caractères + audience). Trois points d'entrée, tous
en `.sheet` avec `.presentationDetents([.medium])` :

- `RootViewComponents.swift:743` — composeur vierge
- `ConversationListView.swift:767` — composeur vierge
- `ConversationListView.swift:756` — republication (`repostOfId`, `viaUsername`)

L'écran a déjà été travaillé deux fois : **184i** (trait `.isSelected` sur la
grille d'emoji et les pastilles d'audience) et **213i** (`.accessibilityHidden`
sur les deux SF Symbols décoratifs). Les deux analyses le décrivaient comme
« par ailleurs poli », **184i affirmant explicitement** :

> « The file was already otherwise polished: every visible string via
> `String(localized:)` … so **no i18n** … were needed. »

Cette conclusion était fausse, et pour une raison qui dépasse largement ce
fichier (§ Constat B).

## Constat A — dernier `NavigationView` de l'app (HIG / iPad)

`body` ouvrait sur `NavigationView { … }` (l. 37). `NavigationView` est déprécié
depuis iOS 16 et — c'est le point critique — **prend par défaut le style
double-colonne** : en environnement `regular` (iPad), un `NavigationView` à
enfant unique se rend comme un split view dont la colonne de détail est vide.
La feuille perdait donc son contenu **et** ses deux seules affordances (Fermer à
gauche, Publier à droite, toutes deux en `toolbar`).

Le plancher de déploiement est **iOS 16.0** (`project.yml`) → `NavigationStack`
est disponible sans garde de disponibilité ni shim de compatibilité.

`NavigationContainerMigrationTests` (introduit en 214i) épinglait déjà ce fichier
comme **le dernier détenteur** de la dette, avec la consigne explicite en
commentaire : « When that lands, this expectation drops to the empty set ».
Le blocage cité (PR #2275 en vol) est levé — #2275 est mergée (`131f793`), et
`list_pull_requests` (open) retourne **0 PR** au moment de l'itération.

## Constat B — l'écran se rendait **intégralement en français** sur 6 des 7 locales

`Info.plist` déclare 7 `CFBundleLocalizations` : `fr` (source du catalogue),
`en`, `de`, `es`, `pt-BR`, `it`, `ar`.

Les 6 chaînes visibles de l'écran passent bien par `String(localized:)` — d'où
la conclusion de 184i — mais **aucune des 6 clés n'existait dans
`Localizable.xcstrings`** :

| Clé | Rendu réel en `en`/`de`/`es`/`it`/`pt-BR`/`ar` |
|---|---|
| `status.composer.title` | « Status » |
| `status.composer.title.repost` | « Republier un status » |
| `status.composer.repost.via` | « Status de @alice » |
| `status.composer.mood.question` | « Comment tu te sens ? » |
| `status.composer.placeholder` | « Comment tu vas ? » |
| `status.composer.publish` | « Publier » |

**Mécanisme.** `String(localized: "clé", defaultValue: "Publier", bundle: .main)`
résout `"clé"` dans la table de la locale de l'utilisateur ; absente du
catalogue, la clé n'existe dans **aucune** table compilée, la résolution échoue
et c'est le `defaultValue` — écrit en français, la langue source — qui est
rendu. Un `defaultValue` n'est **pas** une traduction : c'est le repli de la
langue source. `common.close`, seule clé du fichier réellement présente au
catalogue, était la seule chaîne traduite de l'écran.

### Pourquoi la suite de tests existante ne l'attrapait pas

`LocalizationConsistencyTests` couvre déjà l'axe voisin — une clé identifiant
sans entrée dans la langue de développement se rend **brute** à l'écran (bug
`splash.tagline`). Mais son filtre exclut délibérément les appels portant un
`defaultValue` (l. 54, `!call.hasDefaultValue`), **précisément parce qu'ils ne
peuvent pas se rendre bruts**. C'est exact — et c'est l'angle mort : ils se
rendent en **français**. Les deux axes sont complémentaires, pas redondants.

### Portée systémique (mesurée)

Le même balayage appliqué à l'app entière, avec les règles du scanner existant
(clés identifiant, bundle app, hors `.module`) : **1 675 clés sur 2 574** —
soit **65 %** des chaînes localisées de l'app — n'ont de traduction pour
**aucune** des 6 locales non-sources. Concentrations : `OnboardingStepViews`
(64), `CreateShareLinkView` (55), `NotificationSettingsView` (52),
`MessageDetailSheet` (47), `ConversationInfoSheet` (43), `SecurityView` (41).

Cette dette a été **créée par la doctrine de la piste elle-même** : plusieurs
itérations antérieures revendiquent en toutes lettres « N clés i18n neuves
inline `defaultValue` (**0 `.xcstrings`**) » comme un point de qualité. C'était
l'inverse. Aucune itération passée n'est remise en cause ici — mais la doctrine
l'est, et le ratchet du § Fix la rend désormais non-régressive.

## Constat C — le bouton Publier perdait son nom accessible en cours d'action

`publishToolbarButton` ne portait **aucun** modificateur d'accessibilité. Son
`label` est un `if isPublishing { ProgressView() } else { Text("Publier") }` :
pendant la publication, la vue n'a plus aucun texte, donc plus de nom accessible
dérivé — VoiceOver annonçait « en cours, bouton estompé », **sans dire de quel
bouton il s'agit** (WCAG 4.1.2). Désactivé (aucune émotion choisie), il
n'annonçait pas non plus la raison de l'indisponibilité.

Le frère exact existe déjà : le bouton Publier du composeur de fil
(`FeedView.swift:1266-1274`) porte label + hint + value, avec la valeur qui porte
l'état (`…uploading` / `…disabled`). Doctrine reprise à l'identique.

## Fix

**A. `NavigationView` → `NavigationStack`** (1 ligne + commentaire justifiant le
choix). Aucun changement de rendu sur iPhone (`compact` : `NavigationView` s'y
comportait déjà en pile) ; sur iPad la feuille cesse de se réduire à un panneau
de détail vide. `NavigationContainerMigrationTests` gagne son assertion de
fichier migré et son ensemble épinglé **tombe à ∅** — la migration est finie,
la classe de bug est fermée.

**B. 8 clés ajoutées à `Localizable.xcstrings`**, **toutes traduites dans les
7 locales** (56 unités, `state: "translated"`, `extractionState: "manual"`) :
les 6 clés de l'écran + les 2 nouvelles clés du constat C. Terminologie alignée
sur le catalogue existant (`content.kind.mood`, `content.type.status`,
`a11y.feed.compose.publish`) : « mood » → *Stimmung* / *estado de ánimo* /
*stato d'animo* / *humor* / *حالة مزاجية*. `status.composer.repost.via` porte un
`%@` unique (argument unique → pas de spécificateur positionnel nécessaire ;
sûr en RTL). Diff **purement additif** : +376 lignes, 0 suppression, 0
réordonnancement.

**C. Bouton Publier** : `.accessibilityLabel(status.composer.publish)` — nom
stable quelles que soient les bascules du label — plus `.accessibilityValue`
portant l'état (`a11y.status.composer.publish.publishing` en cours,
`a11y.status.composer.publish.disabled` quand aucune émotion n'est armée, chaîne
vide sinon). Le trait `.isButton` natif est préservé (aucun `.combine`, aucun
`children:`), conformément à la doctrine 177i.

**D. Ratchet i18n** — 2 tests ajoutés **dans `LocalizationConsistencyTests`**,
pas dans un nouveau fichier : la suite possède déjà le scanner de sources
tolérant aux littéraux imbriqués (`localizedCalls`, balayage de parenthèses
tenant compte des chaînes), la lecture de catalogue et la notion de clé
identifiant. Un second scanner parallèle aurait été de la duplication.

- `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` — liste
  **additive** d'écrans soldés (aujourd'hui : `StatusComposerView`) dont chaque
  clé doit être traduite dans toutes les locales expédiées. Une itération qui
  finit de localiser un écran y ajoute une ligne ; l'écran ne peut plus
  régresser.
- `test_untranslatedKeyBacklogDoesNotGrow` — plafond épinglé à **1 669**. Ce
  nombre ne peut que descendre : un échec signifie qu'une clé neuve a été
  introduite avec un `defaultValue` seul et partira en français sur 6 locales.
  Le message d'échec dit d'ajouter les traductions, **pas** de relever le
  plafond.

Les locales requises ne sont pas codées en dur : elles sont lues dans
`CFBundleLocalizations` (`Info.plist`) moins le `sourceLanguage` du catalogue —
ajouter une locale à l'app resserre automatiquement les deux tests.

## Vérification

Pas de toolchain Swift sur cet environnement (Linux) → chaque assertion a été
recalculée hors Xcode par un **portage fidèle** du scanner Swift
(`localizedCalls`, `isIdentifier`, mêmes racines de sources, même exclusion
`.module`, même critère `state == "translated"`).

| Contrôle | `origin/main` (`ffef133`) | Cette branche |
|---|---|---|
| `filesUsingDeprecatedContainer()` | `{StatusComposerView.swift}` | `∅` ✅ |
| Clés non traduites de `StatusComposerView` | **6** ❌ | **0** ✅ |
| Backlog i18n global (plafond 1 669) | **1 675** ❌ | **1 669** ✅ |
| Clés orphelines au catalogue (test existant) | 0 | **0** ✅ (les 8 clés sont référencées) |
| Clés identifiant sans entrée `en` (test existant) | 0 | **0** ✅ (les 8 ont `en`) |

Les deux tests neufs sont donc **RED contre `ffef133`** et GREEN ici — la
divergence avant/après est prouvée par la mesure, pas par le diff.

Autres contrôles : catalogue rechargé et validé en JSON après écriture (1 375
clés, +8, 0 modification d'entrée existante) ; les 8 clés vérifiées avec
exactement `{ar, de, en, es, fr, it, pt-BR}` toutes en `state: "translated"` ;
équilibrage accolades/parenthèses/crochets sur les 3 fichiers Swift touchés
(0/0/0 d'écart) ; aucune édition de `project.pbxproj` (XcodeGen, globbing
récursif, aucun fichier créé).

**Portées non touchées :** 0 logique, 0 réseau, 0 layout, 0 changement visuel,
0 modification du SDK, 0 fichier Android / Web / backend.

## Suite — resynchronisation sur `main` (2026-07-26, après ouverture de #2352)

Trois faits sont apparus après l'ouverture de la PR.

**1. La CI `iOS Tests` a échoué pour une cause étrangère à cette itération.**
`StoryRepostFlowTests.swift` (jamais touché ici) ne compilait pas :
`missing argument for parameter 'visibility'` ×2 et une fermeture
`onPublishRepost` à 2 arguments là où le type en attend 3. Cause : le commit
`d94500a` a ajouté `visibility: String?` à l'API `repost` **et est déjà contenu
dans `ffef133`**, la base de cette branche, sans mettre à jour ce fichier de
test — autrement dit **la base était rouge**, le bundle de tests iOS ne
compilait pas sur `ffef133`. `main` l'a corrigé depuis (`f8e45ea`). Le
correctif est donc une **resynchronisation**, pas un patch : `main` est
fusionnée dans la branche.

**2. Collision d'essaim — la migration `NavigationStack` a été livrée par
ailleurs.** Entre 15:57 et 16:08, ~12 PR ont été ouvertes, dont au moins 9
portant la même migration (le pointeur partagé la désignait nommément, et le
test épinglé portait l'instruction en commentaire). `fdc6b42` a été mergée dans
`main` pendant ce temps. Les deux conflits sont résolus **en faveur de `main`** :
`NavigationContainerMigrationTests` prend sa version telle quelle (identique en
substance à la nôtre, jusqu'au nom `test_noNavigationViewRemains`), et
`StatusComposerView` garde sa migration ainsi que sa suppression de l'`isDark`
mort. Ne subsiste ici de la partie (A) que **rien** : elle est livrée. Les
parties (B), (C) et (D) restent propres à cette PR.

**3. Le ratchet a attrapé sa première régression — sur la première occasion.**
Après fusion de `main`, le balayage passait de 1 669 à **1 673** : l'écran
`StoryLanguageDetailView`, mergé entre-temps, arrive avec 4 clés
(`story.language.detail.{title,translate,retranslate,original}`) posées en
`defaultValue` français seul — donc affichées en français sur les 6 autres
locales. **Le plafond n'a pas été relevé** : c'est exactement ce que le message
d'échec du test interdit. Les 4 clés ont été traduites dans les 7 locales, en
réutilisant les valeurs déjà présentes au catalogue pour « Traduire »
(`action.translate`). Le balayage revient à **1 669**.

Ce point vaut d'être noté : la régression n'était pas hypothétique, elle est
arrivée dans l'heure, depuis une PR sœur, sur un écran neuf. C'est la
justification empirique du ratchet.

## Reste à faire (piste 221i+)

1. **Résorber le backlog i18n de 1 669 clés**, écran par écran, en descendant le
   plafond à chaque itération et en ajoutant l'écran soldé à
   `fullyLocalizedScreens`. Ordre par densité : `OnboardingStepViews` (64),
   `CreateShareLinkView` (55), `NotificationSettingsView` (52),
   `MessageDetailSheet` (47), `ConversationInfoSheet` (43), `SecurityView` (41).
   C'est le plus gros gisement UX restant de l'app iOS.
2. **6 clés présentes au catalogue mais incomplètes** (une locale manquante) —
   elles sont comptées dans le plafond ; les compléter est le gain le moins cher.
3. `StatusComposerView` : la grille d'emoji fixe `MeeshyFont.relative(36)` dans
   un cadre `56×56` — à très grande taille dynamique le glyphe déborde. Vérifier
   avant de toucher (changement visuel, contrairement à tout ce qui précède).
4. Supprimer `StoryViewerView+Content.shareStory()` (code mort, 0 appelant —
   établi 217i) dès que la surface story refroidit.
5. Audit Dark Mode généralisé — famille de défaut ouverte par 219i (couleur de
   marque *claire* posée sans lecture du `colorScheme`).
6. Câbler un `Localizable.xcstrings` à `MeeshyShareExtension` (3 chaînes crues).

## ⚠️ Ne plus re-flagger

- `StatusComposerView` pour son conteneur de navigation (migré `NavigationStack`,
  verrouillé par 2 tests), pour la localisation de ses 6 chaînes (soldée,
  verrouillée par `fullyLocalizedScreens`), pour le nom VoiceOver de son bouton
  Publier (soldé), pour l'état sélectionné de ses pickers (184i) et pour ses
  glyphes décoratifs (213i).
- La migration `NavigationView` → `NavigationStack` **dans son ensemble** :
  l'ensemble épinglé est vide, le test échoue à la moindre réintroduction.
