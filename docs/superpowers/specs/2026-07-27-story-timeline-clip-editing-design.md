# Spec — Édition des lignes de la timeline story : gestes, fiche d'édition, timing

Date : 2026-07-27 · Décisions produit prises par l'utilisateur en séance.

## Problème

Quatre défauts confirmés par lecture du code, tous dans la même famille : **un contrôle
visible qui ne fait pas ce qu'il annonce.**

### 1. Le réglage manuel de durée de slide ne survit à aucune édition

`setSlideDuration()` (poignée losange `DurationHandle`) et `extendSlideDuration()`
(bouton « +10 s ») écrivent `project.slideDuration` sans marquer que la valeur vient
de l'auteur. `recomputeSlideDuration()` — appelée par *nudge, trim, move, add, delete,
undo, redo* (17 sites) — la remplace par la durée dérivée du contenu.

Le réglage est donc perdu à la première édition suivante. Le comportement est
**verrouillé par un test** (`TimelineViewModelSlideDurationTests`, ligne 190 : pin à
20 s → ajout d'un clip → retour forcé à 10 s, asserté comme attendu).

### 2. Un simple tap ouvre la fiche ; le double tap fait un split

`onTap` → `selectClip(id:)`, et la sheet est pilotée par un binding sur
`selection.selectedClipId` (`TimelineInspectorSheetModifier`) : **sélectionner, c'est
présenter**. Impossible de surligner une piste sans que la fiche recouvre la timeline.

`onDoubleTap` sur `VideoClipBar` appelle `splitSelectedAtPlayhead()` — un découpage
destructif sur un geste que l'utilisateur attend comme « ouvrir les réglages ».

### 3. Le glissement direct d'un clip est avalé

Dans `VideoClipBar.body` :

```swift
.onTapGesture(count: 2) { onDoubleTap() }
.onTapGesture { onTap() }
.onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
.gesture(DragGesture(minimumDistance: 4) ...)
```

Deux causes cumulées :
- le long-press s'engage à 0,4 s de doigt immobile — un glissement lent (poser, hésiter,
  glisser) le déclenche et le drag ne démarre jamais ;
- `.gesture()` est de basse priorité : face au `ScrollView` horizontal de
  `TimelineScrubArea`, c'est la piste qui défile, pas le clip qui bouge.

### 4. Trois affordances du même réglage, trois jeux de bornes

| Affordance | Début | Fin / Durée |
|---|---|---|
| Barre tactile `ClipTimingBar` | clampé `[0, slide − durée]` | clampé `≤ slideDuration` |
| Steppers ±0,1 s (panneau ⓘ) | `≥ 0` seulement | `≥ 0,05` seulement |
| Poignées `ClipTrimHandles` | `≥ 0` seulement | `≥ 0,05` seulement |

Conséquence non triviale : le clamp `fin ≤ slideDuration` de la barre tactile rend
**impossible d'allonger un clip qui finit à la fin de la slide** — donc impossible
d'allonger la slide au doigt, puisque la slide dérive du contenu.

S'y ajoutent :
- « Fin » et « Durée » du panneau ⓘ appellent la même méthode (`trimClipEnd`) ;
- `ClipInspector.resolveLinkedTiming` lie correctement les trois valeurs, est couverte
  par 4 tests, et **n'est appelée par aucune vue** ;
- aucune saisie directe : poser un début à 3,5 s demande 35 taps sur ±0,1 s ;
- la fiche cache l'essentiel derrière deux replis (ⓘ et « Animation »).

## Décisions produit (utilisateur, en séance)

1. **La durée de slide est dérivée du contenu, toujours.** Les affordances qui
   promettent un réglage manuel sont supprimées plutôt que réparées.
2. **Trois champs liés Début / Fin / Durée, avec saisie directe** et bornes identiques
   sur les trois affordances.
3. **Un clip de FOND ne gagne pas d'affordance de timing** — inchangé.
4. **Simple tap = surlignage seul. Double tap = fiche d'édition. Tout est déplié dans
   la fiche. Le glissement au doigt déplace le clip.**

## Design

### Bloc 1 — La durée de slide devient purement dérivée

Supprimer les surfaces qui prétendent la piloter :

| Élément | Action |
|---|---|
| `DurationHandle.swift` (vue + `DurationHandleTests`) | supprimé |
| `TimelineScrubArea.onSlideDurationChanged` | paramètre retiré |
| Bouton « +10 s » de `TimelineOperationsBar` (+ `extendStepSeconds`, `onExtendDuration`) | supprimé |
| `TimelineViewModel.setSlideDuration` / `extendSlideDuration` | supprimés |
| `DurationHandleTests` (3 tests) | fichier supprimé |
| `TimelineViewModelSlideDurationTests` (20 tests) | 3 tests de pin supprimés ; le test du toast, qui appelle `setSlideDuration(20)` pour fabriquer un écart, est réécrit avec un écart obtenu par édition de contenu |
| `TimelineOperationsBarTests` (5 tests) | 2 tests d'extension supprimés, les 3 autres perdent l'argument `onExtendDuration:` |

Le plafond de 600 s que portait `setSlideDuration` ne disparaît pas : il migre dans
`ClipWindowResolver` (bloc 4), seul endroit qui borne encore la timeline une fois la
durée devenue dérivée — `recomputeSlideDuration()` n'a aucun plafond propre.

`recomputeSlideDuration()` devient l'unique écrivain de `project.slideDuration` — ce
qu'elle était déjà de fait. L'invariant « le playhead ne reste jamais hors fenêtre »
qu'assurait `setSlideDuration` est déjà tenu par `recomputeSlideDuration`.

**Conséquence assumée** : on ne peut plus laisser de vide en fin de slide. Pour
allonger une slide, on allonge un clip (le bloc 4 rend ce geste possible, ce qu'il
n'était pas). Le plancher `defaultStaticDuration` (6 s) demeure.

**Effet sur les données existantes** : une story portant déjà un pin
`effects.timelineDuration` conserve sa durée tant qu'on ne l'édite pas
(`computedTotalDuration()` lit le pin en priorité, inchangé). Rouvrir sa timeline et
l'éditer aligne `slideDuration` sur le contenu, et `TimelineProject.apply` retire alors
le pin (`nil` quand `slideDuration == contentDerivedDuration`). Aucune migration :
la logique de `apply` reste telle quelle.

**Hors périmètre, laissé intact** : `StoryComposerViewModel.currentSlideDuration` pose
encore un pin. Ce setter n'a aucun call site UI aujourd'hui (seulement la déclaration
de protocole `StoryComposerProviding`) — le supprimer déborderait sur le composer.

### Bloc 2 — Gestes des pistes

**Découpler la sélection de la présentation.** `ClipSelectionState` gagne un second
champ :

- `selectedClipId` — le surlignage (halo). Posé par le simple tap.
- `inspectedClipId` — la fiche présentée. Posé par le double tap, effacé à la fermeture.

**Invariant retenu : `inspectedClipId != nil ⟹ inspectedClipId == selectedClipId`.**
`inspect(_:)` pose les deux ; `select(_:)` pose le surlignage et remet
`inspectedClipId` à `nil`. Ce choix évite d'avoir à paramétrer les trois
`resolve*Snapshot(viewModel:)` par un id : ils continuent de lire `selectedClipId` et
restent exacts, puisque les deux coïncident dès qu'une fiche est ouverte. Seule
`presentedSelection(viewModel:)` gagne une garde `inspectedClipId != nil` — un unique
point de bascule, et les ~25 tests des resolvers (`TimelineInspectorHost_ClipKindTests`,
`TimelineInspectorHostRoutingTests`) restent valides tels quels.

`TimelineInspectorSheetModifier` conserve son binding sur `presentedSelection` ; la
fermeture appelle un `endInspection()` qui efface `inspectedClipId` **sans** désélectionner,
pour que le clip reste surligné après consultation.

**Recomposer les gestes des trois barres** — `VideoClipBar`, `AudioClipBar`,
`TextClipBar` (le sticker réutilise `TextClipBar`) — en un ordre qui laisse passer le
drag :

```swift
.highPriorityGesture(
    DragGesture(minimumDistance: 4)
        .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
        .onEnded   { _ in if !isLocked { onMoveEnded() } }
)
.onTapGesture(count: 2) { onOpenInspector() }
.onTapGesture { onSelect() }
```

- `highPriorityGesture` gagne l'arbitrage contre le `ScrollView` parent ;
- `minimumDistance: 4` laisse les taps passer (un tap ne translate pas) ;
- **le long-press est supprimé** : il faisait doublon avec le tap (les deux
  sélectionnaient) et bloquait le glissement lent. Il n'était de toute façon pas
  déclenchable au simulateur (cf. `reference_idb_longpress_cannot_trigger_native_contextmenu`).

**Le split quitte le double tap** et devient une action de la fiche d'édition
(« Diviser au playhead »), aux côtés de Supprimer — cohérent avec « tout est dans la
fiche ». Aucun geste ne découpe plus un clip par accident. Il n'était câblé que sur
`VideoClipBar` ; `AudioClipBar` et `TextClipBar` se contentaient de sélectionner au
double tap, ce qui rendait le geste incohérent d'une piste à l'autre. Le bouton agit sur
`splitSelectedAtPlayhead()`, correct sans changement puisque le double tap pose aussi
`selectedClipId`.

Les poignées de trim (`ClipTrimHandles`, `minimumDistance: 2`) restent des enfants du
ZStack : plus spécifiques, elles gagnent naturellement sur le drag du parent.

**Keyframes et transitions gardent l'ouverture au tap simple.** Ils transitent par le
même bus (`LaneKeyframeOverlays.onSelect` → `selectClip`, idem `TransitionBadge`), mais
ce sont des marqueurs de 12–16 pt, pas des pistes à surligner : exiger un double tap sur
une cible aussi petite serait une régression. La règle est donc « une piste se surligne
au tap et s'ouvre au double tap ; un marqueur s'ouvre au tap » — leurs call sites posent
`inspectedClipId` en plus de `selectedClipId`.

### Bloc 3 — La fiche montre tout

`ClipInspector.visibleSections` ne prend plus `isDetailsExpanded` ni
`isAnimationExpanded`. L'enum `Section` passe de sept cases à **six** — `details` est
absorbée par `timing` (bloc 4 : la barre tactile et les trois champs saisissables
forment un seul ensemble, là où ⓘ dupliquait les mêmes valeurs) :

```
header · timing · volume · animation · toggles · actions
```

Les deux `@State` de repli, le bouton ⓘ et le bouton « Animation » disparaissent ;
`animation` (fondus + « Animer au playhead » + sa légende) est rendue systématiquement.

Les règles de pertinence par nature de clip demeurent intactes : `timing` masqué pour un
fond, `volume` réservé à vidéo/audio (`hasAudioAffordances`), `toggles` affiché
seulement si boucle ou fond agit, `Supprimer` masqué pour un sticker. Le hint « le fond
couvre toute la slide » vivait dans `details` : il migre à la place laissée vacante par
`timing` pour un clip de fond, sinon il disparaîtrait avec la section qui l'hébergeait.

La sheet passe en `presentationDetents([.large])` — le contenu déplié ne tient pas en
`.medium`.

### Bloc 4 — Début / Fin / Durée : une seule règle, trois affordances

**Un résolveur pur unique**, `ClipWindowResolver`, remplace les trois logiques de
clamp dispersées. Placé dans `MeeshyUI/Story/Timeline/Logic/` — rule engine stateless,
sans singleton ni décision produit, conforme à la règle de pureté SDK.

```swift
enum ClipWindowResolver {
    struct Window: Equatable { let start: Float; let duration: Float }
    enum Edit {
        case move(to: Float)          // durée constante
        case setStart(Float)          // fin constante → durée change
        case setEnd(Float)            // début constant → durée change
        case setDuration(Float)       // début constant → fin change
    }
    static let minimumDuration: Float = 0.05
    static let maximumEnd: Float = 600

    static func resolve(_ edit: Edit, from window: Window) -> Window
}
```

Bornes, identiques partout : `start ≥ 0`, `duration ≥ 0,05 s`, `start + duration ≤ 600 s`.
**Pas de borne `fin ≤ slideDuration`** — c'est elle qui empêchait d'allonger la slide.
La slide suit le contenu via `recomputeSlideDuration()`.

Le plafond global de 600 s ne disparaît pas avec `setSlideDuration` (bloc 1) : il
**migre** ici, en `maximumEnd`. C'est désormais le seul rempart, `recomputeSlideDuration()`
n'en ayant aucun.

Consommateurs :
- `ClipTimingBar.previewWindow` délègue. **Son échelle doit gagner une marge** :
  `displayTotal` vaut aujourd'hui `max(slideDuration, start + duration)`, calculé sur
  les valeurs d'avant le geste — la poignée droite d'un clip finissant en fin de slide
  est donc déjà collée au bord droit de la piste et n'a physiquement nulle part où
  aller. Retirer le clamp ne suffit pas : l'échelle devient
  `max(slideDuration, start + duration) + marge`, marge = 20 % de cette valeur, au
  minimum 1 s. La piste garde ainsi une réserve visible dans laquelle tirer ;
- `TimelineViewModel.nudgeClipStart` / `trimClipStart` / `trimClipEnd` délèguent ;
- trois méthodes **absolues** nouvelles pour la saisie directe :
  `setClipStart(id:to:)`, `setClipEnd(id:to:)`, `setClipDuration(id:to:)`, chacune
  poussant une commande undoable unique.

`ClipInspector.resolveLinkedTiming` est supprimée (ses 4 tests migrent sur
`ClipWindowResolver`) : la même règle, mais branchée.

**Les trois champs deviennent éditables au clavier.** Chaque champ garde ses boutons
±0,1 s et gagne un `TextField` numérique (`keyboardType: .decimalPad`), commité à la
validation ou à la perte de focus, via la méthode absolue correspondante. Format de
saisie : secondes décimales (`3,5`), respectant la locale.

Un seul jeu de trois champs : la barre tactile et les champs partagent la même ligne
de lecture, plus de duplication ⓘ/barre.

## Testing

TDD, un incrément par bloc, suite verte à chaque étape.

- **Bloc 1** : suppression des tests de pin ; un test neuf vérifie qu'après édition la
  durée vaut exactement `contentDerivedDuration`. Garde de source : aucun appel
  résiduel à `setSlideDuration`.
- **Bloc 2** : `ClipSelectionState` — le tap pose `selectedClipId` sans toucher
  `inspectedClipId` ; le double tap pose les deux ; fermer la fiche efface
  `inspectedClipId` en gardant le surlignage. Garde de source sur `VideoClipBar` :
  présence de `highPriorityGesture`, absence de `onLongPressGesture`, le double tap ne
  référence pas `split`. Ces gardes ancrent le comportement, pas le glyphe
  (cf. `reference_source_guards_anchor_on_behaviour`).
- **Bloc 3** : `visibleSections` retourne les 6 sections pour un clip vidéo foreground,
  et respecte les exclusions par nature (fond, texte, sticker, image) ; le hint « fond »
  apparaît bien à la place de `timing` pour un clip de fond.
- **Bloc 4** : table de cas sur `ClipWindowResolver` (chaque `Edit` × chaque borne) ;
  équivalence `ClipTimingBar.previewWindow` ↔ résolveur ; les trois méthodes absolues
  poussent une commande et une seule ; un clip finissant à la fin de la slide peut
  être allongé (le cas impossible avant).

Vérification simulateur obligatoire sur les gestes (bloc 2) : le drag ne peut pas être
prouvé en test unitaire. Le long-press n'étant pas déclenchable via idb, son retrait
est couvert par garde de source.

## Risques

- **Perte de capacité assumée (bloc 1)** : plus aucun moyen d'ajouter du silence en fin
  de slide. Décision explicite de l'utilisateur.
- **Arbitrage de gestes (bloc 2)** : `highPriorityGesture` peut, s'il est trop
  agressif, empêcher le scroll horizontal de la timeline quand le doigt part d'un clip.
  `minimumDistance: 4` et la vérification simulateur sont les garde-fous ; si le scroll
  devient inatteignable, replier sur un `simultaneousGesture` avec discrimination
  d'axe (|dx| > |dy| n'aide pas ici, les deux sont horizontaux — le repli serait alors
  un drag n'engageant qu'après sélection préalable).
- **Sheet en `.large` (bloc 3)** : la fiche dépliée recouvre davantage la timeline. Le
  découplage du bloc 2 compense — on n'y entre plus par accident.
- **Snapshots** : les baselines de `StoryTimelineView` et de l'inspecteur changent
  (retrait du losange, du bouton +10 s, des replis) et devront être ré-enregistrées.

## Défaut signalé, hors périmètre

`trimClipEnd(id:deltaTimeSeconds:mediaDurationLimit:)` accepte un plafond de durée
native, **qu'aucun call site de production ne passe** (seul un test l'exerce). Un clip
vidéo de 3 s peut donc être étiré à 30 s : 27 s de dernière frame figée à la lecture et
à l'export. Corriger demande de remonter la durée de l'`AVAsset` jusqu'à la timeline —
elle n'y est pas disponible aujourd'hui (`VideoFilmstrip` n'extrait que des vignettes).
Chantier distinct, à brainstormer séparément.
