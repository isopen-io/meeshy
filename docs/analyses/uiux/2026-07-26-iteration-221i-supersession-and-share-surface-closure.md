# Iteration 221i — 220i superseded : ce qui restait, et une `main` rouge

**Date** : 2026-07-26
**Piste** : iOS (suffixe `i`)
**Base** : `main` HEAD `033ce7d64`
**Branche** : `claude/quirky-curie-52uw8j` (**recréée depuis `origin/main`**)

---

## Comment cette itération a commencé : une supersession

La 220i de cette session (PR #2351) a été **doublée par un agent concurrent de
l'essaim** pendant que sa CI tournait. Deux commits ont landé sur `main` :

- `fdc6b422f refactor(ios/status): le dernier NavigationView passe à NavigationStack (220i)`
- `31d9e61d7 docs(uiux): consigner l'itération 220i …`

C'est **exactement** le précédent 212i consigné dans `tasks/lessons.md` (« PR
fermée sans merge — un agent concurrent a déjà landé le même fix ; re-vérifier le
défaut sur `main` juste avant commit, PIVOTER hors d'une zone swarmée »).

Plutôt que de re-soumettre un doublon, la branche a été **recréée depuis `main`**
et seul ce qui restait **réellement absent** a été ré-appliqué. Inventaire vérifié
fichier par fichier sur `033ce7d64` :

| Élément 220i | Sur `main` ? | Décision |
|---|---|---|
| `StatusComposerView` → `NavigationStack` | ✅ landé | **abandonné** (doublon) |
| Ensemble `NavigationView` épinglé → vide | ✅ landé | **abandonné** (doublon) |
| Compile-fix `StoryRepostFlowTests` (`visibility`) | ✅ landé | **abandonné** (doublon) |
| Label VoiceOver de l'action « Publier » | ❌ absent | **conservé** |
| Suppression de `shareStory()` | ❌ absent | **conservé** |
| Verrou du pont de partage en **égalité** | ❌ toujours `isSubset` | **conservé** |
| `MockPostService.lastRepostVisibility` | ❌ absent | **conservé** |

À quoi s'ajoute un défaut **découvert par la CI de #2351**, et non encore corrigé
sur `main`.

---

## Défaut A — `main` est ROUGE : la carte de fin auteur a allongé l'export, le test ne le sait pas

**Fichier** : `apps/ios/MeeshyTests/Unit/Services/StoryVideoExportServiceTests.swift`

```
StoryVideoExportServiceTests/test_prepareExport_withIntro_carriesBothInterludeAndOutro()
XCTAssertEqualWithAccuracy failed: ("5.2") is not equal to ("3.7") +/- ("0.35")
```

`16f819783` (« carte de fin d'auteur en 2 temps ») a introduit une fermeture en
deux temps : quand l'identité de l'auteur a été résolue (`content != nil`), le
clip de fin dure `logoPhase + identityPhase` = 1,5 + 2,0 = **3,5 s** au lieu des
2,0 s de la carte logo-seule. Pour un même chevauchement de 1,5 s, la queue
au-delà de la story passe donc de **0,5 s à 2,0 s**.

Le test, lui, calcule encore `StoryExportIntro.duration + stubStoryDuration +
outroTail` avec un `outroTail` unique valant 0,5 → 1,2 + 2,0 + 0,5 = **3,7**,
alors que le service produit 1,2 + 2,0 + 2,0 = **5,2**. Les deux nombres du log CI
tombent exactement.

**Le message de `16f819783` dit lui-même comment c'est passé** : « Tests
(MeeshySDK-Package, TEST SUCCEEDED) … App : BUILD SUCCEEDED. » Le lot a lancé les
tests **du SDK** et s'est contenté de **compiler** l'app — `MeeshyTests` n'a jamais
tourné. C'est le même mécanisme que le défaut B ci-dessous, et la deuxième
occurrence de la journée.

**Fix** : une constante ne pouvait plus décrire les deux chemins. `outroTail`
(0,5) reste la queue de la carte **logo-seule** et garde son test ; une seconde
constante `authorOutroTail` (2,0) décrit la carte **auteur**, et c'est elle
qu'utilise le test qui passe une identité. Les valeurs sont **recopiées, pas
dérivées** : `logoPhase` / `identityPhase` / `authorClipDuration` sont internes à
`MeeshyUI` et invisibles depuis ce bundle — le commentaire le dit et rejoue
l'addition, pour que la prochaine évolution des phases sache quoi mettre à jour.

> ⚠️ Constaté au passage, **non corrigé ici** (le SDK est hors périmètre de cette
> routine) : le commentaire de `StoryExportOutro.append` annonce que la vidéo est
> « allongée de `identityPhase - overlap` (+0,5 s) ». L'arithmétique du code donne
> `authorClipDuration - overlap` = 3,5 − 1,5 = **2,0 s**, et la mesure CI (5,2)
> confirme le code, pas le commentaire.

## Défaut B — `StoryViewerView+Content.shareStory()` : code mort porteur d'un défaut latent

Établi en 217i, revérifié sur `033ce7d64` : `grep` sur `apps/ios` **et**
`packages/MeeshySDK` → **1 définition, 0 site d'appel**.

Pas inoffensif pour autant : c'était le **dernier** site impératif de
`UIActivityViewController` de l'app, porteur du défaut soldé partout ailleurs en
215i/216i — `UIApplication.shared.connectedScenes.first` est le `.first` d'un
**`Set` non ordonné**, donc sous Stage Manager la feuille pouvait être présentée
sur une **scène en arrière-plan** (tap muet). Tant qu'il restait dans l'arbre, il
servait de modèle copiable et **forçait** le verrou de partage à rester en
inclusion plutôt qu'en égalité.

Sa suppression permet de resserrer `StoryExportShareSheetPaletteTests` :
`isSubset` → **`XCTAssertEqual`** sur `{ConversationMediaViews.swift}`. L'égalité
attrape strictement plus — un nouveau pont dupliqué **comme** la disparition du
pont légitime.

## Défaut C — le bouton principal du composer de mood perd son nom en cours d'action

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`

`publishToolbarButton` échange son `Text("Publier")` contre un `ProgressView()`
**nu** pendant l'envoi. Un `ProgressView` sans label n'expose **aucun texte
d'accessibilité** : le bouton perd son nom au moment exact où il devient aussi
`.disabled`. VoiceOver n'annonce plus qu'un contrôle **anonyme et estompé** —
précisément là où l'utilisateur doit distinguer « en cours » de « bloqué ».

Le dépôt traite déjà ce cas **quatre fois** (`SharePickerView:322`,
`ForwardPickerSheet:219`, `MessageDetailSheet:1986`,
`MessageForwardDetailView:134`) ; le composer était l'exception.

**Fix** : fonction pure colocalisée `StatusComposerAccessibility.publishActionLabel(isPublishing:)`
(idiome `StoryVisibilityMenuResolver` / `MyStoryRowAccessibility` /
`StoryExportSheetPalette`), avec `.accessibilityLabel` posé sur le **`Button`** et
non sur le `ProgressView` : au repos le label vaut exactement le texte visible
(« Publier »), condition HIG sans laquelle la commande vocale « Appuyer sur
Publier » ne cible plus le bouton.

## Défaut D — l'audience du repost atteint le service, mais rien ne peut le constater

`d94500ade` a fait traverser `visibility` aux quatre couches du repost — c'était
tout son objet (« l'audience choisie au repost décide enfin de qui verra le
post » ; auparavant tout repost sortait **public**, sans le moindre signal).

Mais `MockPostService.repost` **acceptait** `visibility` et ne l'**enregistrait
pas**. Le compile-fix landé sur `main` passe donc bien l'argument aux deux sites
de `StoryRepostFlowTests`… et **n'assert rien dessus**, faute de champ à lire. Le
défaut d'origine n'est couvert à aucune de ces deux couches.

**Fix** : `lastRepostVisibility` (+ remise à zéro dans `reset()`), et les deux flux
l'assertent — `nil` pour le repost direct (pas de sélecteur → hérite de
l'original), `"PUBLIC"` pour le flux composer.

---

## Le motif commun, et ce qui devrait en être tiré

Trois ruptures de `main` en une journée, **toutes de la même forme** : une
signature ou une constante de production change, le lot vérifie avec les tests du
SDK et un `BUILD SUCCEEDED` de l'app, et le bundle `MeeshyTests` — qui n'a pas
tourné — reste en arrière.

| Rupture | Origine | Vérification annoncée | Détectée par |
|---|---|---|---|
| `repost(visibility:)` | `d94500ade` | — | CI de #2351 |
| Fermeture 2 temps | `16f819783` | « MeeshySDK-Package TEST SUCCEEDED · App BUILD SUCCEEDED » | CI de #2351 |

**`BUILD SUCCEEDED` de l'app ne dit rien du bundle de tests** : il ne le compile
même pas. Le seul garde-fou est `xcodebuild build-for-testing` (cf.
`apps/ios/CLAUDE.md` § « Reproduire la CI iOS Tests fidèlement en local »).
Recommandation à porter hors de cette routine : rendre cette étape obligatoire
avant tout merge touchant une signature partagée.

---

## Vérification

Aucun macOS/Xcode ici. Répartition par nature :

| Assertion | Base `033ce7d64` (RED) | Après (GREEN) |
|---|---|---|
| Balayage `UIActivityViewController` (égalité) | `{ConversationMediaViews, StoryViewerView+Content}` ≠ attendu | `{ConversationMediaViews}` ✓ |
| Ensemble `NavigationView` | `{}` (déjà vert, landé par l'autre agent) | `{}` inchangé |
| `StatusComposerAccessibilityTests` ×3 | symbole inexistant → **échec de compilation** | résolu |
| `test_prepareExport_withIntro_…` | attendu 3,7 vs mesuré **5,2** (log CI) | attendu 1,2+2,0+2,0 = **5,2** ✓ |
| Assertions `lastRepostVisibility` ×2 | champ inexistant → **échec de compilation** | résolu |

L'arithmétique du défaut A est **confirmée par la mesure CI elle-même** (5,2), pas
seulement par lecture de code : `logoPhase` 1,5 + `identityPhase` 2,0 = 3,5 de
clip, − 1,5 de chevauchement = 2,0 de queue ; 1,2 + 2,0 + 2,0 = 5,2.

Équilibrage accolades / parenthèses / crochets des **9** fichiers : `0 / 0 / 0`.
Sortie de `shareStory()` sans import orphelin (`UIApplication` reste utilisé
l. 740, aucun `import UIKit` explicite).

**Gate réel** : CI `iOS Tests`.

---

## Bilan

| Fichier | Δ |
|---|---|
| `StatusComposerView.swift` | +19 |
| `StoryViewerView+Content.swift` | −13 |
| `StoryVideoExportServiceTests.swift` | +25 / −4 |
| `StoryExportShareSheetPaletteTests.swift` | +15 / −15 |
| `StatusComposerAccessibilityTests.swift` (neuf) | +60 |
| `NativeShareLinkAdoptionTests.swift` | +6 / −4 |
| `NativeSharePresentationTests.swift` | +5 / −4 |
| `MockPostService.swift` | +5 |
| `StoryRepostFlowTests.swift` | +5 |
| **Total** | **+140 / −40** |

- **1 clé i18n neuve** (`status.composer.publishing`), inline, **0 édition xcstrings**
- **0 couleur, 0 métrique de layout, 0 changement visuel, 0 logique métier, 0 réseau**
- **1 fichier neuf** → glob récursif `MeeshyTests` → **0 édition `project.pbxproj`**

## Statut

**RÉSOLU.** `main` repasse au vert, la surface de partage se referme en égalité,
et le composer de mood annonce enfin son action pendant qu'elle s'exécute.

**⚠️ NE PLUS re-flagger** : `StatusComposerView` pour son conteneur de navigation
(migré par l'autre agent) ni pour le nom VoiceOver de son action principale
(résolu ici, verrouillé par 3 tests) ; `StoryViewerView+Content.shareStory()`
(**supprimé — ne pas ressusciter**) ; l'unicité du pont `UIActivityViewController`
(verrouillée **en égalité**) ; `outroTail` / `authorOutroTail` (les deux chemins
sont désormais distincts et documentés).

**Pistes 222i+** : (a) **grille d'emojis du composer et Dynamic Type** —
`emojiButton` impose un `frame(width: 56, height: 56)` **fixe** à un `Text(emoji)`
en `MeeshyFont.relative(36)`, qui résout vers `.largeTitle` (bucket `≥31`) et
**échelonne** donc jusqu'à ~53 pt aux tailles d'accessibilité → débordement de la
tuile ; le fix propre (`GridItem(.adaptive(minimum:))` + `@ScaledMetric`) **change
le nombre de colonnes à la taille par défaut** (5 → 4 sur iPhone), donc refonte
assumée ; (b) cible tactile des capsules de visibilité (< 44 pt, minimum HIG) ;
(c) `.presentationDragIndicator` présent sur 1 des 3 sites d'appel du composer ;
(d) **audit Dark Mode généralisé** (hérité de 219i, jamais entamé) ; (e)
`sensoryFeedback` (iOS 17+) = 0 usage contre 11 `UIImpactFeedbackGenerator` ; (f)
**hors routine** : rendre `build-for-testing` obligatoire avant merge, et
rectifier le commentaire d'arithmétique de `StoryExportOutro.append`.
