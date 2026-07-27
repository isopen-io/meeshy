# Story — document de reprise (état au 2026-07-26 au soir)

Ce document sert à **reprendre le chantier Story sans relire tout l'historique**.
Il donne l'état réel, ce qui reste, comment le vérifier, et les pièges dans
lesquels je suis tombé pour qu'ils ne soient pas retombés.

Source des défauts : `tasks/story-e2e-validation-2026-07-26.md` (audit E2E,
16 auditeurs lecture-seule + réfutation adverse, 41 % de faux positifs sur la
première passe — d'où l'importance des verdicts de réfutation).

---

## 0. Session du 2026-07-27 — ce qui a bougé

Branche `fix/story-e2e-batch2`. Trois lots livrés, chacun validé par des
tests exécutés (SDK + app), aucun commit de `project.pbxproj`.

| | |
|---|---|
| 🔴 fermés | **1** (le chantier A, WS1 + Task 6) |
| 🟠 fermés | **3** (Task 2/3, D9, file hors-ligne des réactions) |
| Lignes du rapport requalifiées | **5** |

**Le rapport E2E se contredit sur D9** : ligne 265 le donne 🟠 « CONFIRMÉ
partiel », ligne 418 ⚪️ « faux positif de l'audit, statut réel : ok ». C'est
la ligne 418 qui a raison — `startTimer()` appelle `updateStoryDuration()`
(l. 709) avant d'armer le timer (l. 720), et `crossFadeStory` fait
`update()` puis `restartTimer()`. Le doc de reprise avait retenu le premier
verdict. **Systématiquement chercher la ligne de réfutation avant de
travailler une ligne du rapport.**

Quatre autres requalifications, chacune vérifiée dans le code :

| ligne du rapport | ce qu'elle dit | ce qui est vrai |
|---|---|---|
| Task 2/3 — `StoryPlaybackClock` | « à câbler » | Code MORT. Le Lot 2 (2026-06-11) a résolu le conflit autrement : le timer gated est l'unique pilote et c'est LUI qu'on asservit au média (`setPlaybackStalled`). Le câbler réintroduirait la seconde source de vérité supprimée. Retiré. |
| File hors-ligne des réactions | « demande un nouveau `OutboxKind` » | Non : le gateway sert la réaction de story sur `POST /posts/:id/like`, journalisé sous `toggleLikePost` — un kind qui EXISTE déjà, avec son dispatcher. Il manquait l'emoji dans le payload. |
| B1 — ratio de canvas | « le code n'existe pas » | `StoryEffects.canvasAspectRatio` est déjà persisté et Codable, `StoryCanvasAspect` existe (2 cas). Ce qui manque : le ratio CONTINU et la surface de réglage. |
| Chantier A | « activer l'ouverture SDK et retirer la version SwiftUI » | Exact, mais incomplet — voir ci-dessous. |

**Le chantier A cachait deux défauts que le rapport ne mentionnait pas**, et
que la correction « évidente » aurait introduits :

1. `applyOpening` pose ses animations en `fillMode = .forwards` avec
   `isRemovedOnCompletion = false`, et il n'existait **aucun**
   `removeAnimation` dans tout le SDK. Elles clampent la propriété présentée
   indéfiniment : activer l'ouverture aurait rendu la FERMETURE invisible
   pour `zoom`+`zoom`, `slide`+`slide` et `fade`+`fade` — l'appariement le
   plus naturel. `applyClosing` les détache en entrant dans sa fenêtre.
2. L'ouverture est une animation CoreAnimation : elle court en temps réel,
   pas au playhead. Jouée au premier layout, elle se consumait derrière le
   placeholder de chargement — donc invisible sur toute story à média
   distant, le cas courant en production. Elle attend désormais le signal de
   contenu prêt, le même que celui qui autorise le playhead.

Le second confirme la leçon de la section 5 : trois fois sur trois, la ligne
du rapport était le symptôme, pas la cause. Quatre fois sur quatre à présent.

### Échantillonnage des 🟡 — 5 lignes instrumentées

Méthode : lire les DEUX côtés, suivre la donnée jusqu'au réseau, exiger une
conséquence utilisateur observable avant de conclure.

| ligne 🟡 | verdict | fait établi |
|---|---|---|
| Handler de publication — deux écrivains | 🔴 **livré** | Pire que décrit : le handler du bootstrap ne publiait RIEN. Il ré-enfilait l'item sous un nouveau `tempStoryId` et renvoyait « succès » → la file supprimait l'original **et ses médias locaux**, l'app affichait « Story enfin publiée », le doublon échouait ensuite en `missingLocalMedia` sur les fichiers effacés. **Story perdue après avoir été annoncée publiée.** |
| Chaîne de repost | 🔴 **ouvert** | `repostOfId: nil` est littéralement écrit en dur (`StoryViewModel.swift:1375`). SDK, gateway et Prisma savent tous le traiter — le client ne l'envoie jamais. Le badge d'attribution ne s'affiche donc jamais sur une story republiée. Fix : propager `viewModel.repostOfId` le long de `onPublishAllInBackground` → `publishStoryInBackground` → `StoryUploadState` → `createStory`. |
| Transcription — affichage reader | ✅ | Déjà corrigé par `55e90ad2c` (2026-07-26), présent sur cette branche. |
| Transcription — persistance composer | ✅ | Idem — même commit, les deux bouts de la même chaîne. |
| Export MP4 — zoom/slide d'ouverture | 🔴 **livré** | `applyStaticOpening` faisait `case .zoom, .slide: break`. Troisième surface du chantier A. |

**Le rapport contient des lignes périmées** : deux des cinq décrivaient un
état antérieur à un commit du 2026-07-26 déjà sur la branche. Vérifier
`git log` du fichier visé avant d'instruire une ligne.

---

## 1. Où on en est

| | |
|---|---|
| Défauts confirmés fermés le 2026-07-26 | **17** |
| Commits livrés | 15, tous sur `origin/main` |
| 🔴 restants | ~~8~~ → **7** |
| 🟠 restants | ~~14~~ → **11** |
| 🟡 « non arbitrés » | 103 |

**Aucun des 8 🔴 restants n'est un simple correctif.** Ce sont deux
fonctionnalités à spécifier, une session parallèle à laisser finir, et un
chantier technique qui demande une validation visuelle.

### Ce qui a été fermé (pour ne pas le refaire)

Lecteur — pause effacée par le ré-armement du timer · groupe expiré fermant le
viewer · bouton Son inactionnable au VoiceOver · contenu jamais énoncé ·
marquage « vue » pendant l'interlude · dégradé parsé sur le mauvais séparateur ·
stories vides publiables et rendues en noir · bouton « Répondre » perdu en
mono-auteur · commentaire perdu hors-ligne · geste vertical par-dessus une
bascule ouverte.

Composition — durée de slide non restaurée par undo/redo · deux signaux sans
lecteur (durée recalculée, story mise en file) · inspecteur du clip sticker
inatteignable · compteur « +N pistes » faux · steppers ±0,1 s avalés par
l'aimant · instant d'un keyframe non modifiable · taille des stickers
divergente · miniature de story filtrée fausse sur 4 axes · zoom d'ouverture
inversé.

Publication — audience du repost ignorée sur 4 couches · médias hors-ligne
laissant des références fantômes · préchargement du repost rangé sous des clés
mortes.

Gateway — traduction à la demande aveugle aux textes de canvas · post vide
publiable.

Produit — **plafonds de durée audio supprimés** (story, message, post, réel).

---

## 2. Recette de vérification

À lancer AVANT de conclure quoi que ce soit. Les trois gates sont
indépendants et aucun ne couvre les autres.

### SDK (le plus rapide, ~6 min)

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=<UDID iOS 18.2>' \
  -derivedDataPath /tmp/dd-sdk \
  -resultBundlePath /tmp/sdk.xcresult \
  -test-timeouts-enabled YES -maximum-test-execution-time-allowance 180 -quiet
xcrun xcresulttool get test-results summary --path /tmp/sdk.xcresult
```

Référence au 2026-07-26 : **5692 tests, 0 rouge, 33 skips**.

> **iOS 18.2 obligatoire.** Les runtimes plus récents crashent
> (`swift_task_deinitOnExecutorMainActorBackDeploy` → double-free) et les
> baselines snapshot Timeline ont été enregistrées sur 18.2. Voir
> `.github/workflows/sdk-tests.yml`.

### App iOS

```bash
cd apps/ios && xcodegen generate        # OBLIGATOIRE — voir piège n°2
cd - && ./apps/ios/meeshy.sh build      # cible app SEULE
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=<UDID>' -derivedDataPath apps/ios/Build -quiet
```

### Gateway

```bash
cd services/gateway
npx tsc --noEmit                        # les tests ne remplacent PAS tsc
npx jest --config=jest.config.json --silent
```

Référence : **542 suites, 14 657 tests, 0 rouge**.

---

## 3. Les 8 défauts 🔴 restants

### A. ~~Fusionner les deux renderers de transition~~ — FAIT le 2026-07-27

> Livré. Ce qui suit reste pour mémoire du raisonnement ; l'état actuel est
> décrit en section 0.
>
> Ce qui a été fait : le canvas arme son ouverture à la naissance et la joue
> quand il peut la MONTRER — une géométrie (sinon `.slide` ne déplace rien et
> `.reveal` masque tout) et un contenu prêt (sinon elle brûle derrière le
> placeholder). `replayOpening()` + le jeton `openingGeneration` couvrent
> l'interlude inter-groupes, qui masquait la story pendant sa propre
> ouverture. Côté lecteur, `StoryOpeningEntrance`, `RevealCircleShape` et les
> quatre pilotes d'animation ont disparu ; il ne garde que le cross-fade.
>
> **Ce qui reste ouvert sur ce périmètre :**
> - `StoryAVCompositor.applyStaticOpening` fait `case .zoom, .slide: break` —
>   l'export ne rend NI l'un NI l'autre. La parité annoncée entre les trois
>   surfaces est donc encore fausse côté export.
> - `applyOpening(.reveal)` fige `mask.frame` à l'installation ; `layoutSubviews`
>   ne le redimensionne pas. Une rotation en cours de slide laisserait le
>   contenu clippé à un cercle périmé. Impact réel non mesuré.
> - La validation GIF sur simulateur (4 effets × 3 surfaces) n'a pas été faite.
>   Les tests couvrent le déclenchement, les bounds, l'unicité et la remise de
>   main à la fermeture — pas le rendu perçu.

### A-bis. Le chantier tel qu'il était décrit

> `WS1` · `Task 5` (D5) · `Task 6` (D2/D3) — trois lignes du rapport, un seul
> problème.

**Le fait, prouvé le 2026-07-26 :** un même effet déclaré sur une story est
rendu de **trois** façons selon la surface.

- Aperçu du composer → `StoryRenderer.applyOpening` (chemin SDK)
- Export MP4 → `StoryAVCompositor`, qui reflète le SDK
- **Lecteur → une ré-implémentation SwiftUI** dans `StoryViewerView+Content`

**Mécanisme :** `applyOpening` n'est appelée que sur une transition
`edit → play` (`StoryCanvasUIView+Core.swift`, garde `newMode == .play &&
!wasPlay`). Or le canvas du lecteur naît **directement** en `.play`, et en
Swift `self.mode = mode` dans l'`init` **ne déclenche pas** les observateurs de
propriété. L'ouverture du SDK ne s'exécute donc JAMAIS dans le lecteur.

**Déjà fait (commit « le zoom d'ouverture du lecteur tournait à l'envers ») :**
les constantes sont alignées. Le lecteur lit `StoryRenderer.zoomTransitionScale`,
`.slideTransitionTravelFraction`, `.slideTransitionDuration` au lieu de
littéraux qui contredisaient le SDK (`.zoom` partait à 0,88 — il zoomait au
lieu de dézoomer ; `.slide` glissait verticalement de 30 pt au lieu de 8 % de
la largeur ; trois durées au lieu d'une).

**Ce qui reste :** un seul renderer. C'est un changement **atomique** —
activer l'ouverture SDK dans le lecteur ET retirer la version SwiftUI en un
seul geste. Les deux ne peuvent pas coexister : elles se composeraient en
double zoom.

**Fichiers :**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Core.swift` — la garde `!wasPlay`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` — l'`init` qui court-circuite le `didSet`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` — `applyOpening` / `applyClosing` / `resetClosing`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` — la ré-implémentation (ancre : `let incomingEffect`)
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` — `.offset` / `.scaleEffect` / `RevealCircleShape`

**Piste :** faire jouer l'ouverture depuis `layoutSubviews` ou un `didMoveToWindow`
quand le canvas naît en `.play`, plutôt que d'élargir la garde `!wasPlay` — un
canvas peut être reconfiguré plusieurs fois et l'ouverture ne doit jouer qu'une
fois par slide.

**Validation :** pixels insuffisants ici — c'est de l'animation. Il faut
enregistrer un GIF sur simulateur (`ios-simulator` skill, `gif_creator`) et
comparer aperçu composer / lecteur / export sur les 4 effets
(`zoom`, `slide`, `reveal`, `fade`).

**Garde-fou existant :** `apps/ios/MeeshyTests/Features/Stories/StoryOpeningParityTests.swift`
verrouille l'alignement des valeurs. Il est ancré sur `let incomingEffect`, pas
sur une signature figée — un renommage de variable ne doit pas le casser.

---

### B. Deux fonctionnalités à spécifier

Le code **n'existe pas**. Il faut une spec avant la moindre ligne.

**B1 — Ratio de canvas piloté par le fond.** Ratio CONTINU clampé
`[9/21, 21/9]` (directive 2026-07-14). Aujourd'hui le canvas est figé en 9:16.
Points d'entrée : `StoryModels.swift` (`StoryEffects`),
`StoryComposerViewModel+Elements.swift`, `CanvasGeometry`.
Attention : `CanvasGeometry` projette déjà sur la LARGEUR (`scaleFactor =
width / 1080`) et fait suivre la hauteur design — la mécanique est prête, c'est
la surface de réglage et la persistance qui manquent.

**B2 — Choix manuel du format** 9:16 / 1:1 / 4:5. Dépend de B1.
`CanvasReprojectorTests` couvre déjà la reprojection des éléments lors d'un
changement de ratio (utilisée par le repost) — c'est la brique réutilisable.

---

### C. Trois items de la session parallèle

À NE PAS toucher sans se coordonner — une seconde session y travaillait toute
la journée du 2026-07-26.

- Picker de langue de l'export MP4
- Annulation d'un export en cours
- `banner` de l'auteur consommé dans l'interlude (leur Task 9)

---

## 4. Les 14 🟠

Par ordre d'impact utilisateur décroissant, tel que je le lis :

| item | note |
|---|---|
| Aperçu « a répondu » / « a reposté » dans la feuille des vues | gateway + iOS ; fonctionnalité |
| File hors-ligne des **réactions** story | le commentaire est livré ; la réaction demande un nouveau `OutboxKind` |
| Arbitrage playhead vs wall-clock (`StoryPlaybackClock.resolve`) + `Task 2` / `Task 3` | 0 appelant ; lié au chantier A — à traiter AVEC lui, pas avant |
| D9 — timer armé avec la durée de la bonne slide | partiel |
| `Task 10` — primitive `MeeshySheetStyle` | `AdaptivePresentationStyle` déclaré, 0 call-site |
| Raccourci clavier « K » (poser un keyframe) | chemin de repli fonctionnel via l'inspecteur |
| `WS4` / `Task 12` — checklist E2E simulateur | jamais produite |
| Parité placeholder thumbHash ↔ 6 filtres sans noyau | **déjà corrigé** le 2026-07-26 — ligne à requalifier |
| `Task 7` — parsing du dégradé | **déjà corrigé** (lot 1) — ligne à requalifier |

**Deux items 🟠 requalifiés après enquête — ce ne sont PAS des défauts :**

- `TimelineViewModel.handlePublishTap` n'a aucun appelant parce que **la
  timeline n'a pas de bouton Publier**, seulement Exporter. Le code est sain :
  il forwarde vers la file unifiée `StoryPublishQueue` via l'adaptateur
  `StoryOfflineQueue`. Soit on décide que la timeline publie (décision
  produit), soit c'est de l'infrastructure spéculative à retirer.
- `StoryPublishQueue.recoverLastStuckItem` n'a aucun appelant non plus. La
  reprise d'un item bloqué comme brouillon demande une UX (seuil, invite, que
  faire au refus) : fonctionnalité, pas correctif.

---

## 5. Les 103 « non arbitrés » — le vrai gisement

C'est le plus gros reste, et le plus mal nommé. Ce ne sont **pas** des défauts
prouvés : ce sont des trous de COUVERTURE — du code qui existe et que personne
n'a confronté à l'exécution. L'audit s'est arrêté à la lecture.

**Pourquoi ça vaut le coup d'y aller :** sur les trois derniers défauts traités
le 2026-07-26, le périmètre réel dépassait **chaque fois** la description du
rapport :

- le préchargement du repost n'était pas seulement perdu — il polluait la file
  hors-ligne avec de faux fonds de slide ;
- les médias hors-ligne ne manquaient pas d'un `do/catch` — ils produisaient
  des références vers des fichiers absents, qui faisaient perdre la story bien
  plus tard ;
- les filtres ne divergeaient pas sur 6 cas mais sur 4 axes, dont un que le
  correctif « évident » aurait **aggravé**.

**Méthode qui a marché :** re-caractériser le défaut avant de le corriger.
Lire les DEUX côtés (producteur et consommateur), vérifier qui appelle quoi
(`grep -rn "<symbole>("`), et n'écrire le test qu'une fois la cause racine
établie. Trois fois sur trois, la ligne du rapport était le symptôme, pas la
cause.

**Suggestion d'attaque :** prendre les ~20 🟡 qui touchent la publication et la
lecture (les chemins les plus utilisés), les instrumenter un par un, et
requalifier chaque ligne en ✅ / 🔴 avec sa preuve.

---

## 6. Pièges rencontrés — à ne pas retomber dedans

**1. Le wrapper de build iOS renvoie 0 même quand le build échoue.**
`./apps/ios/meeshy.sh build` sort en 0 et écrit « Build FAILED » dans le log.
Toujours `grep -E "Build succeeded|Build FAILED|error:"` sur le log, jamais se
fier au code de sortie. Même famille : un pipeline terminé par `| tail` ou
`| grep` masque le code de sortie de `xcodebuild`.

**2. `project.pbxproj` est un artefact GÉNÉRÉ, non maintenu.**
La copie commitée est périmée en permanence (des fichiers ajoutés y manquent, y
compris ceux d'autres sessions). `xcodegen generate` avant tout build local est
la convention ; la CI le fait elle-même. **Ne jamais commiter la pbxproj** — et
ne pas croire, comme je l'ai fait, qu'un fichier manquant est une régression à
patcher.

**3. Un build d'app vert ne dit RIEN du bundle de tests.**
`meeshy.sh build` compile la cible app seule. Pour tout changement de
**signature publique** (protocole, init, fermeture stockée), les conformances
et fermetures typées des cibles de test cassent sans un seul rouge local.
`xcodebuild build-for-testing` est obligatoire. J'ai laissé `main` rouge une
heure pour cette raison.

**4. Un rouge sous charge n'est pas un rouge.**
Deux tests de timeout de `ZmqTranslationClient` sont tombés pendant qu'un
`xcodebuild` saturait la machine ; 154/154 en isolé, deux fois. Ne jamais
conclure d'un A/B à un run par côté — l'état du simulateur (outbox `OfflineQueue`)
persiste entre les exécutions et peut inverser un verdict.

**5. Les gardes de source doivent être ancrés sur le COMPORTEMENT.**
Un garde ancré sur un littéral de signature (`"private func dismissGroupIntro() {"`)
tombe au premier paramètre ajouté, alors que le comportement est intact.
Ancrer sur un nom + une ouverture de parenthèse, ou sur une expression stable.

**6. Pixels ≠ points.**
`UIGraphicsImageRenderer` rend à l'échelle de l'écran (×3). Compter les lignes
d'un bitmap donne une valeur trois fois trop grande. Diviser par
`cgImage.width / logicalWidth`.

**7. Deux sessions sur le même dépôt.**
Travailler dans un worktree isolé (`git worktree add`), rebaser sur
`origin/main` avant chaque push, et **re-grep le CONTENU** après rebase — par
NOMBRE d'occurrences, pas seulement présence de fichier. Ne jamais commiter les
fichiers en cours d'édition de l'autre session.

---

## 7. Ordre recommandé

1. **Fusionner les deux renderers de transition** (chantier A). Seul défaut
   technique franc restant, chemin clair, forte visibilité utilisateur.
   Traiter `Task 2` / `Task 3` (playhead vs wall-clock) dans le même geste —
   c'est la même boucle de lecture.
2. **Échantillonner les 🟡** — les ~20 qui touchent publication et lecture.
   C'est là que se trouvent probablement les prochains vrais défauts.
3. **Spécifier B1/B2** (ratio de canvas et format) avant d'écrire du code.
4. Laisser la session parallèle finir l'export, puis reprendre ses 3 items.
