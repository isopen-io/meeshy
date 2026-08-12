# Plan — iOS UI/UX Iteration 217i

**Objet** : refonder les deux décisions de layout de `StatusBubbleOverlay`
(largeur de la bulle, bascule au-dessus / en-dessous de l'ancre) sur le
**conteneur** qui la clippe, au lieu de l'écran physique.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-217i-statusbubbleoverlay-container-metrics.md`
**Base** : `main` HEAD `1f6ef69` · **Branche** : `claude/quirky-curie-6kr79r`
**Numérotation** : 217i, strictement > 216i (mergée #2324, et #2325 en vol)

## Sélection de la cible

Les trois pistes héritées de 216i étaient toutes bloquées :

| Piste | Blocage |
|---|---|
| `StoryViewerView+Content.shareStory()` | **0 site d'appel** — code mort, pas un défaut UX. Surface story brûlante (3 commits le 2026-07-26). |
| `MeeshyShareExtension` i18n | `ShareViewController.swift` détenu par #2319 |
| `StatusComposerView` | Détenu par #2275 |

Balayage neuf sur l'axe voisin de l'arc 215i/216i — interroger le matériel au
lieu de son conteneur. `UIScreen.main` : 20 usages / 15 fichiers, doctrine déjà
tranchée à 3 endroits du dépôt mais jamais généralisée. Un seul site est
indéfendable : `StatusBubbleOverlay`, qui a `parentGeo.size` en portée et ne
s'en sert pas.

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (son commit portait 216i, mergée #2324)
- [x] Collision essaim : 12 PR ouvertes, 3 iOS — aucune sur `StatusBubbleOverlay.swift`
- [x] Qualifier le défaut : `.withStatusBubble()` sur 15 surfaces dont 8 feuilles
- [x] Calculer les seuils de rupture (conteneur < 298 pt ; bande d'ancres 190–380 pt)
- [x] Extraire `bubbleWidth(containerWidth:)` et `flipsAbove(anchorY:containerHeight:)` en `nonisolated static`
- [x] Brancher dans le `body`, supprimer les 3 propriétés dérivées de l'écran
- [x] Test neuf `StatusBubbleOverlayLayoutTests` (6 tests / 17 assertions)
- [x] 17 assertions recalculées indépendamment hors Xcode (17/17)
- [x] Équilibre accolades/parenthèses/crochets au tokenizer (0/0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Extraire en fonctions pures plutôt que corriger deux expressions inline.**
Deux lignes auraient suffi. Mais un `GeometryReader` n'est pas testable hors
Xcode, et ces deux décisions sont exactement le genre de règle qui se re-casse
silencieusement. Le dépôt a déjà tranché cette question avec
`StoryViewerView+Content.reactionRollbackTarget` (`nonisolated static`, extrait
« so the guard is directly unit-testable without constructing a live view ») —
217i applique le même geste, pas un nouveau.

**Ne toucher à aucune constante visuelle.** 250, 48, 0.45, l'offset 52 restent
identiques. L'itération corrige la *grandeur mesurée*, pas le réglage. C'est ce
qui rend le test de parité plein écran vert sur 6 ancres.

**Ajouter le plancher `max(0, …)`.** Appliquer l'ancienne formule au conteneur
introduit un cas que l'écran ne produisait jamais : un `GeometryReader` rapporte
`.zero` au premier passage, et `0 - 48` est une largeur de `frame` négative
(« Invalid frame dimension » en console). Le plancher rend ce passage
transitoire invisible plutôt que bruyant.

**Ne pas généraliser à `UIScreen.main` d'un coup.** Sur les 20 usages, la
plupart sont soit délibérés et documentés (`RecentMediaStrip` : chemin iPhone
compact où l'écran *est* le conteneur), soit sans enjeu (`UIScreen.main.scale`,
constante par appareil), soit couplés deux à deux (`MessageListView` ↔
`MessageOverlayMenu`, qui doivent bouger ensemble). Un balayage mécanique aurait
cassé des choix assumés.

## Non fait (et pourquoi)

- `shareStory()` : code mort sans caller — sa suppression est un nettoyage, pas
  une amélioration d'expérience, et la surface story est brûlante.
- Les 12 autres fichiers portant `UIScreen.main` : voir « Piste 218i+ » de
  l'analyse, avec le tri déjà fait entre défauts réels, choix délibérés et
  non-défauts.

## Suite (218i+)

1. Couple `MessageListView.MessageMenuPreviewContainer.maxHeight` ↔
   `MessageOverlayMenu.maxPreviewHeight` — même défaut, mais les deux plafonds
   sont explicitement alignés l'un sur l'autre : ils doivent bouger ensemble.
2. `StatusComposerView` (`NavigationView` → `NavigationStack`) dès que #2275 est
   mergée ou close, puis réduire l'attendu de
   `NavigationContainerMigrationTests` à l'ensemble vide.
3. `MeeshyShareExtension` : câbler un `Localizable.xcstrings` à la cible
   (3 chaînes crues) dès que #2319 est résolue.
