# Analyse — Liste de conversations : régression scroll & lacunes (2026-07-03)

Périmètre : `ConversationListView` (+`+Rows`, `+Overlays`, `ConversationListHelpers`,
`SwipeableRow` SDK). Comparaison entre l'état **actuel** (`74711a36`, 03-07) et l'état
**d'il y a 5 jours** (`f4ff6b2c`, 28-06 23:37).

## 1. Cause racine de la capture du scroll par les lignes

### Le geste fautif

`ConversationListView+Rows.swift:109-137` (état actuel) :

```swift
.highPriorityGesture(
    DragGesture()          // minimumDistance par défaut = 10 pt, AUCUN filtre d'axe
        .onChanged { ... }
)
```

Un `DragGesture` en **`highPriorityGesture`** posé sur chaque ligne prend la priorité
sur le pan du `ScrollView` parent dès que le doigt parcourt 10 pt — y compris
**verticalement**. Comme chaque ligne couvre quasiment toute la surface de la liste,
tout scroll qui démarre sur une ligne est consommé par le geste de la ligne : la liste
« fige » sous le doigt. C'est exactement le symptôme rapporté.

### Chronologie de la régression

| Commit | Date | Effet sur le scroll |
|---|---|---|
| `f4ff6b2c` (référence 28-06) | 28-06 | ✅ Lignes sans `DragGesture` custom : `.contextMenu` natif + `.onDrag`. Le scroll appartient au ScrollView. |
| `8717546d` → `135af8f2` | 01-07 | ✅ Menu contextuel custom (icônes iOS 26) via long-press, `.onDrag` retiré (il capturait le long-press). Réordonnancement déplacé dans le menu (« Déplacer vers »). Scroll toujours sain. |
| `a98b93a7` | 03-07 06:34 | ⚠️ Ajout d'un `DragGesture` en `simultaneousGesture` (drag-to-reorder) — contention partielle. |
| `ff5d5649` | 03-07 08:47 | ❌ Le `DragGesture` passe en **`highPriorityGesture`** (« proper priority ») → capture du pan vertical, scroll figé. |

### Le pire des deux mondes : le geste bloque le scroll pour des features mortes

Le coût (scroll capturé) est payé pour des fonctionnalités qui **ne peuvent pas
fonctionner** dans l'implémentation actuelle :

1. **`gestureStartTime` n'est jamais posé au touch-down.** Il est posé dans
   `.onAppear` (`+Rows.swift:157-159`), c.-à-d. à l'apparition de la ligne à l'écran.
   La condition d'entrée en mode drag (`yDelta > 30 && Date.now - gestureStartTime < 0.4s`)
   n'est donc vraie que pendant les 0,4 s qui suivent l'apparition de la ligne —
   en pratique jamais. `dragStarted` reste `false`, `onDragStart` ne fire pas.

2. **Même si `onDragStart` firait, le drop est impossible.** Le réordonnancement
   repose sur `SectionDropDelegate` + `.onDrop(of: [.text], ...)`
   (`ConversationListView.swift:9-46, 232-236, 918-931`), qui exige une session de
   drag UIKit créée par `.onDrag` — retiré le 01-07 (`135af8f2`). `dropEntered` /
   `performDrop` ne peuvent jamais fire. Conséquence aggravante : si `onDragStart`
   fire un jour, `draggingConversation` n'est **jamais remis à nil** (seuls
   `performDrop`/`handleDrop` le réinitialisent) → la ligne reste bloquée en état
   « dragging » et `draggingConversationId` force la fermeture des menus des autres
   lignes indéfiniment.

3. **La branche « shrink preview pendant drag-up » est inatteignable.** Elle exige
   `dragStarted && isPressed` : `dragStarted` n'est possible que < 0,4 s après
   apparition, `isPressed` n'est vrai qu'après un long-press de 0,4 s. Les deux
   fenêtres sont mutuellement exclusives.

4. **États morts** : `dragOffset` (@State, écrit à chaque frame, jamais lu pour le
   rendu) ; `dragOffsetY` (binding écrit par la ligne, remis à zéro par l'overlay,
   **jamais lu par aucun `offset()`/rendu**). Chaque écriture de `dragOffsetY`
   mute un `@State` de `ConversationListView` → re-évaluation du body complet de la
   liste à chaque frame de drag.

## 2. Ce qui doit être préservé

### Acquis visuels actuels (03-07) — à conserver

- **Animation d'appui** : `scaleEffect(isPressed ? 0.90 : 1.0)` avec spring
  `(response: 0.65, dampingFraction: 0.99)`, reset piloté par
  `activelyPressedConversationId` (adaptiveOnChange).
- **Menu contextuel custom** (`+Overlays.swift:253-397`) : backdrop
  `.ultraThinMaterial` + noir 12 %, carte d'aperçu 340 pt (bannière, avatar, story
  ring, mood, présence, actions appel/recherche/info/profil), zoom + rebond
  `(0.44, 0.6)` à l'ouverture, menu qui remonte de 70 pt, zoom-out 0,26 s annulable
  à la fermeture (`contextMenuDismissWork`). Icônes garanties sur iOS 26 (le
  `.contextMenu` natif ne les affiche pas).
- **Action « Renommer »** (alert + TextField), **BlockActionCoordinator** pour
  block/unblock, entrée « Déplacer vers » (réordonnancement via le menu).

### Acquis du 28-06 — à restaurer

- **Scroll libre** : aucune ligne ne possédait de `DragGesture` custom. Le seul drag
  au niveau ligne était celui de `SwipeableRow` (SDK), qui est un bon citoyen du
  scroll : `minimumDistance: 22`, `simultaneousGesture`, garde d'axe
  (`guard abs(h) > v`) dans `updating` **et** dans `onEnded`. À ne pas toucher.
- Le long-press systeme (via `.contextMenu`) n'interférait pas avec le scroll ; le
  long-press SwiftUI actuel (`LongPressGesture(minimumDuration: 0.4)`, distance max
  par défaut 10 pt) ne pose pas non plus de problème : il s'annule dès que le doigt
  bouge (le scroll reprend la main).

## 3. Correctif recommandé (préserve les deux états)

**Supprimer intégralement le bloc `.highPriorityGesture(DragGesture...)`** de
`ConversationRowItem`, et avec lui `dragStarted`, `dragOffset`, `gestureStartTime`,
ainsi que les bindings `previewScale`/`dragOffsetY` côté ligne.

- Le long-press existant en `.simultaneousGesture(LongPressGesture(0.4))` suffit à
  ouvrir le menu custom : visuel du 03-07 intégralement conservé.
- Le scroll retrouve le comportement du 28-06 : plus aucun geste prioritaire sur le
  pan vertical.
- Le réordonnancement reste accessible via « Déplacer vers » dans le menu — c'est
  déjà le fallback documenté depuis `135af8f2` (le commentaire du fichier le dit
  explicitement).

Si le drag-to-reorder au doigt doit revenir un jour, le faire **sans geste global sur
la ligne** :
- soit un **mode édition** explicite (poignée de drag dédiée, seule la poignée porte
  le `DragGesture`) ;
- soit réintroduire `.onDrag`/`.onDrop` natifs mais déclenchés depuis le menu
  (l'utilisateur choisit « Déplacer », la liste passe en mode drop) ;
- jamais un `highPriorityGesture(DragGesture)` plein-ligne dans un ScrollView.

Nettoyage associé si le correctif est appliqué :
- retirer `previewScale`/`dragOffsetY` de l'init de `ConversationRowItem` et de
  `ConversationListView` (l'overlay peut posséder localement son `previewScale`) ;
- retirer la logique `else if dragStarted && isPressed` (morte) ;
- retirer `draggingConversationId` du gate Equatable si le drag plein-ligne disparaît.

## 4. Autres lacunes relevées dans la vue

### 4.1 Gate `.equatable()` sur une vue à `@State` (contradiction documentée)

`ConversationRowItem` est enveloppé dans `.equatable()`
(`ConversationListView.swift:366`) et porte désormais 4 `@State` (`isPressed`,
`dragStarted`, `dragOffset`, `gestureStartTime`). Le commentaire du gate
(`+Rows.swift:189-201`) affirme encore « carries NO @State … none of the iOS 18+
EquatableView-vs-@State footgun » — devenu **faux** depuis `ae2b9577`. Soit on
retire les `@State` (le correctif §3 en supprime 3 sur 4 ; `isPressed` peut être
dérivé de `activelyPressedConversationId == conversation.id`), soit on met à jour le
commentaire et on assume le footgun. La première option est cohérente avec la règle
« Zero Unnecessary Re-render ».

### 4.2 Re-évaluation de toutes les lignes à chaque ouverture/fermeture de menu

Le gate Equatable compare `activelyPressedConversationId` et `draggingConversationId`
(valeurs **globales** à la liste). Chaque transition nil→id→nil invalide **toutes**
les lignes visibles, pas seulement les deux concernées. Conforme à la lettre du gate
mais contraire à la règle « pass primitive values » : passer plutôt
`isActivelyPressed: Bool` et `isAnotherRowDragging: Bool` calculés par ligne — seules
les lignes dont le booléen change se ré-évaluent.

### 4.3 `previewScale`/`dragOffsetY` en `@State` du parent liste

Tout état transitoire de geste stocké sur `ConversationListView` re-déclenche le body
de la liste entière à chaque frame. S'ils survivent au correctif §3, ces états
doivent vivre dans la vue overlay (feuille locale), pas dans le parent.

### 4.4 Tap sur une ligne dont les swipe-actions sont ouvertes

`SwipeableRow` pose `onTapGesture { if openOffset != 0 { close() } }` sur le
`content` (SDK, `SwipeableRow.swift:118-120`), mais `ConversationRowItem` pose son
propre `.onTapGesture` **plus profond** (sur `ThemedConversationRow`). En SwiftUI le
geste de l'enfant gagne : taper le contenu d'une ligne aux actions révélées ouvre la
conversation au lieu de refermer les actions (le comportement documenté du composant
— « Tap sur le contenu quand ouvert → fermeture » — est court-circuité). Piste :
exposer `swipeProgress` (déjà en Environment) dans la ligne et faire du tap un
no-op/close quand `swipeProgress > 0`. (Présent aussi le 28-06 — pas une régression.)

### 4.5 Accessibilité du menu contextuel custom

Le `.contextMenu` natif (28-06) était automatiquement exposé à VoiceOver. Le
remplacement par `LongPressGesture` + overlay ne l'est pas : un utilisateur VoiceOver
ne peut plus atteindre épingler/sourdine/archiver/verrouiller depuis la ligne (les
swipe-actions restent accessibles via les custom actions du rotor, mais pas le menu
complet). Ajouter sur la ligne des `.accessibilityAction(named:)` pour les entrées
principales du menu, ou une action « Ouvrir le menu » qui présente l'overlay.

### 4.6 Haptique doublée

`HapticFeedback.medium()` est déclenché à la fois dans le `onEnded` du long-press
(ligne) et potentiellement dans `onDragStart` (parent) ; après correctif §3 il n'en
restera qu'un. À vérifier aussi : `onTapGesture` déclenche `HapticFeedback.light()`
sur chaque ouverture de conversation — voulu, mais s'assurer qu'il ne double pas avec
un haptique de navigation.

### 4.7 `UIScreen.main.bounds` pour le calcul de largeur de ligne

`sectionView` calcule `rowWidth` depuis `UIScreen.main.bounds.width`
(`ConversationListView.swift:258-261`). `UIScreen.main` est déprécié (iOS 16+) et
faux en Split View / Stage Manager iPad (la fenêtre ≠ l'écran). Remplacer par
`GeometryReader` au niveau liste ou `containerRelativeFrame` (iOS 17+ avec shim).

### 4.8 Animation redondante

La ligne combine `withAnimation(...)` autour de `isPressed = true` **et**
`.animation(.spring(...), value: isPressed)` — le second suffit. Sans gravité, mais
deux sources d'animation pour la même valeur compliquent les réglages fins.

## 5. Synthèse

| Sujet | État | Action |
|---|---|---|
| Scroll figé par les lignes | Régression du 03-07 (`ff5d5649`, amorcée par `a98b93a7`) | Supprimer le `highPriorityGesture(DragGesture)` ; le long-press seul suffit |
| Drag-to-reorder au doigt | Code mort (timer `onAppear` + drop impossible sans `.onDrag`) | Retirer ; conserver « Déplacer vers » ; réintroduire plus tard via poignée/mode édition |
| Visuel 03-07 (scale 0.90, overlay menu, rename) | Sain | Préserver tel quel |
| SwipeableRow | Sain (minimumDistance 22 + garde d'axe) | Ne pas toucher |
| `.equatable()` + `@State` | Contradiction avec la doc du fichier | Supprimer les @State de geste / dériver `isPressed` |
| Invalidation globale des lignes (ids globaux dans `==`) | Sous-optimal | Passer des booléens par ligne |
| Tap vs swipe-actions ouvertes | Bug UX latent (pré-existant) | Gater le tap sur `swipeProgress > 0` |
| VoiceOver sur le menu custom | Régression a11y depuis le 01-07 | `.accessibilityAction(named:)` sur la ligne |
| `UIScreen.main.bounds` | Dette (iPad multitâche) | GeometryReader / containerRelativeFrame |
