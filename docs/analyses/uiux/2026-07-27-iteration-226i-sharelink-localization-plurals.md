# iOS UI/UX — Iteration 226i

**Date** : 2026-07-27
**Surfaces** : `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`
· `apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift` (cliquet)
**Axes** : Localisation (i18n) — traduction complète + **pluralisation**
**Base** : `main` HEAD `68a1a33f` (225i mergée, PR #2377)

## Pourquoi cette surface

Suite directe de 225i, qui a laissé une piste ordonnée par volume. Après resync,
la mesure confirme le classement inchangé :

| fichier | clés non traduites |
|---|---|
| **`Features/Main/Views/CreateShareLinkView.swift`** | **55** |
| `Features/Main/Views/NotificationSettingsView.swift` | 52 |
| `Features/Main/Components/MessageDetailSheet.swift` | 47 |
| `Features/Main/Components/ConversationInfoSheet.swift` | 43 |

L'écran de création de lien de partage est le plus gros trou restant. C'est aussi
la surface par laquelle un utilisateur **fait entrer d'autres personnes** dans
Meeshy : la voir en français quand on ne parle pas français est doublement
coûteux, puisque c'est le moment où l'on configure ce que des invités
potentiellement d'une autre langue vont rencontrer.

Contrairement à 225i, **ce fichier était bien écrit** : aucun `defaultValue`
anglais, aucun accent manquant, aucune faute de typographie. Le seul défaut était
l'absence des clés au catalogue — plus un défaut de pluralisation.

## Écarts constatés

### A. 55 clés absentes du catalogue
Les 6 locales non-sources rendaient le `defaultValue` français. Inclut 8 clés
`conversationType.*` partagées avec d'autres écrans, dont la traduction profite
donc au-delà de cette vue.

### B. Pluralisation codée en dur dans un `defaultValue` — intraduisible par construction
```swift
Text(String(localized: "share.link.create.max_uses",
            defaultValue: "\(maxUsesValue) utilisation\(maxUsesValue > 1 ? "s" : "") maximum", …))
```
La morphologie du pluriel est **écrite dans le code**, avec la règle
française/anglaise `> 1`. Aucune traduction ne peut la corriger : l'arabe a six
catégories CLDR (`zero/one/two/few/many/other`), le polonais quatre, le russe
trois. Un `%@ utilisations maximum` plat ne peut pas les exprimer.

### C. Le cliquet de localisation était aveugle aux clés pluralisées — 9 faux positifs permanents
Défaut de l'outil, découvert en préparant (B). `loadTranslations` ne lisait que le
`stringUnit` **plat** d'une locale. Or une entrée pluralisée n'en a pas : son texte
vit sous `variations.plural.<catégorie>`. Conséquence, mesurée avant correctif :

```
a11y.back.with_unread        : traduite dans NOTHING → comptée non traduite
a11y.message.audios          : traduite dans NOTHING → comptée non traduite
a11y.message.images          : …
a11y.message.videos          : …
accessibility.unread_count   : …
feed.post.stat.comments      : …
feed.post.stat.likes         : …
feed.post.stat.reposts       : …
stats.timeline.point.a11y    : …
```

Les **neuf** entrées pluralisées du catalogue étaient **intégralement traduites**
dans les 7 locales et pourtant comptées comme des trous — et, plus grave,
**impossibles à solder** : aucun écran contenant une clé pluralisée ne pouvait
jamais être épinglé comme complètement localisé. C'est exactement le mur que (B)
allait heurter.

## Correctifs (226i)

1. **A** → 54 entrées plates ajoutées, traduites dans les 6 locales
   (`ar/de/en/es/it/pt-BR`). Registre **vouvoiement**, celui de l'écran lui-même
   (« Créez… », « Contrôlez… ») — et non le tutoiement de 225i : le registre suit
   la surface, il ne s'uniformise pas au passage.
2. **B** → `share.link.create.max_uses` devient une **entrée à variations
   plurielles CLDR**, exactement sur le modèle de `feed.post.stat.comments` et
   `a11y.back.with_unread` : `one`/`other` pour fr/en/de/es/it/pt-BR, et les
   **six** catégories pour l'arabe. `"extractionState": "manual"` comme ses
   précédents, sans quoi l'extracteur Xcode écraserait les variations par une
   entrée plate dérivée du `defaultValue` interpolé.
3. **C** → `loadTranslations` reconnaît les variations : une locale compte comme
   traduite si son `stringUnit` plat est `translated` **ou** si **toutes** ses
   catégories plurielles le sont. `allSatisfy` et non `contains` : une seule
   catégorie périmée laisse la clé non traduite pour les comptes qui la
   sélectionnent.

**Aucun changement de code de production.** Les 55 `defaultValue` français étaient
déjà corrects, donc l'égalité code ≡ catalogue `fr` est acquise sans y toucher ;
et le site de `max_uses` garde son repli interpolé, comme
`feed.post.stat.comments` — c'est le catalogue qui rend, le `defaultValue` n'est
qu'un filet si la clé manque. 226i est donc **catalogue + cliquet uniquement**.

## Effet mesuré sur le plafond

Décomposition vérifiée, pas déduite :

| étape | backlog |
|---|---|
| `main` aujourd'hui | 1606 |
| + splice du catalogue seul | 1552 (**−54**) |
| + lecteur conscient des pluriels | **1545** (**−7**) |

Les 7 que le correctif (C) libère : `a11y.back.with_unread`,
`a11y.message.{audios,images,videos}`, `accessibility.unread_count`,
`stats.timeline.point.a11y`, et `share.link.create.max_uses` lui-même. Les 3
entrées plurielles restantes (`feed.post.stat.{comments,likes,reposts}`) ne
bougent pas parce qu'elles ne sont **pas vues du tout** par le scanner — cf.
le reliquat ci-dessous.

## Reliquat quantifié : 92 appels invisibles au cliquet

Le scanner cherche le littéral `String(localized:`. Un appel écrit sur plusieurs
lignes —
```swift
String(
    localized: "feed.post.stat.comments",
```
— ne matche pas. Mesure : **4292 appels vus, 4384 en autorisant l'espace, donc 92
appels invisibles répartis sur 46 fichiers** (`MyStoriesView` 5,
`AudioEditorController` 5, `ConversationListView+Rows` 4, `StoryPhotoSaveService`
4, `StoryTextEditTopBar` 4…).

**Délibérément non corrigé ici.** Élargir le marqueur ferait apparaître des clés
neuves et ferait donc **monter** le backlog — or le plafond ne doit que descendre.
Le corriger demande d'absorber dans la même itération ce qu'il révèle : c'est un
chantier à lui seul, à mener avec sa propre mesure. Vérifié en revanche que
`CreateShareLinkView` n'a **aucun** appel multi-lignes (64 vus / 64 réels), donc
l'épinglage de cet écran est bien complet.

## Reste à faire signalé, non corrigé

`share.link.create.uses_label` — le `Stepper` affiche `Text("\(maxUsesValue)")`
puis `Text("utilisations")` en deux vues distinctes (gros chiffre accentué + label
discret). À `maxUsesValue == 1`, borne basse de la plage `1...10000`, cela rend
**« 1 utilisations »**. Le corriger proprement demande soit une variation plurielle
dont les valeurs ne portent pas de spécificateur `%lld`, soit la fusion des deux
`Text` — la première est un construit `.xcstrings` que **je ne peux pas valider
sans toolchain Swift**, la seconde sacrifie la typographie à deux niveaux de
l'écran. Signalé plutôt que deviné : une CI iOS rouge bloque toutes les PR iOS
(précédent 221i).

## Vérification

Pas de toolchain Swift → gate = CI `iOS Tests`. Miroirs Python fidèles du scanner
Swift, exécutés contre `main` puis contre la branche.

| test | base | après |
|---|---|---|
| `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` (3 écrans) | 🔴 55 | 🟢 |
| `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` | 🔴 54 | 🟢 |
| `test_pluralizedKeysAreRecognizedAsTranslated` *(neuf)* | 🔴 9 invisibles | 🟢 |
| `test_untranslatedKeyBacklogDoesNotGrow` | 🔴 1606 > 1545 | 🟢 1545 |
| `check_localization.py` (directions 1 & 2) | ✓ | ✓ |

Catalogue **+2639 / −0** (`--diff-algorithm=histogram` ; le Myers par défaut
réaligne les blocs et affiche 5958/3319 pour le même contenu — net identique).
Contrôle par parse : **55 ajoutées, 0 retirée, 0 modifiée**. Toutes les
variations plurielles vérifiées catégorie par catégorie contre les règles CLDR de
chaque locale.

## Statut

Écarts A–C **résolus**. `CreateShareLinkView.swift` est épinglé.

**⚠️ NE PLUS re-flagger** : (a) les chaînes de `CreateShareLinkView` ;
(b) la pluralisation de `share.link.create.max_uses` ; (c) l'aveuglement du
cliquet aux entrées plurielles — corrigé et verrouillé par un test dédié.

## Reste à faire (227i+)

1. **Élargir le marqueur du scanner aux appels multi-lignes** (92 appels, 46
   fichiers) **et absorber les clés révélées dans la même itération** — sinon le
   plafond monte. Bon candidat immédiat : c'est un trou de couverture de l'outil,
   pas seulement de la traduction.
2. Poursuivre écran par écran en épinglant : `NotificationSettingsView` (52),
   `MessageDetailSheet` (47), `ConversationInfoSheet` (43), `SecurityView` (41).
3. `share.link.create.uses_label` — « 1 utilisations » (cf. ci-dessus), à traiter
   dans un environnement où le build est reproductible.
4. Traduction relue de `onboarding.step.recap.terms.body` (hérité 225i, hors
   piste UI/UX).
5. `MemberManagementSection.emptyState` → `EmptyStateView(compact:)`.
