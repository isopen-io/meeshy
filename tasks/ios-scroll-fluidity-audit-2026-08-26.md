# Audit fluidité & sauts de défilement — vue conversation iOS (2026-08-26)

Symptômes rapportés (user) : « le défilement saute souvent vers le mauvais
emplacement dans la vue des conversations » et « le défilement n'est pas du
tout assez fluide, qu'importe le mode de vue — saccadé, lenteur ».

## Causes racines identifiées et corrigées

### 1. Saut « au mauvais emplacement » — la visée d'un saut n'était jamais vérifiée

`scrollToItem(at: .centeredVertically, animated: true)` calcule son offset
d'arrivée UNE fois, sur le layout du moment — c'est-à-dire sur des hauteurs
ESTIMÉES (`estimatedBubbleRowLayoutHeight` 80 / `estimatedFlatRowLayoutHeight`
150) pour toute cellule jamais réalisée entre la position courante et la
cible. Pendant l'animation, ces cellules se réalisent avec leurs hauteurs
réelles (bulle image ≈ 300 pt), le solveur self-sizing corrige `contentSize`,
et l'animation — qui vise toujours l'offset périmé — atterrit à côté. Le
`flashCell` partait en plus sur un DÉLAI aveugle, donc souvent sur une cellule
hors écran. Pire sur `scrollToMessageFast` : il arrive après un
`loadWindow(around:)` qui vient de remplacer TOUTE la fenêtre — aucune cellule
autour de la cible n'est réalisée, l'écart estimé/réel y est maximal
(recherche, citation hors fenêtre, retours Résumé/Rivière).

**Correctif** : `ScrollToMessageSettleLaw` (loi pure, patron
`MessageListOffsetCompensationLaw`) + intégration hôte. À chaque fin
d'animation (`scrollViewDidEndScrollingAnimation`, après le flush des
reconfigures différés), la loi compare l'offset atteint à l'offset qui
centrerait la cible — recalculé sur les attributs FRAIS — et re-vise tant que
l'écart dépasse la tolérance (12 pt), budget borné (3 passes ; la première
réalise les cellules, la seconde vise juste). Le flash part à la POSE
vérifiée. Filet pour le no-op (`scrollToItem` déjà à l'offset → aucun
`didEndScrollingAnimation`), annulation dès que le doigt reprend la main
(`scrollViewWillBeginDragging`), ou qu'un `scrollToBottom` / slow-scroll part.
Garde de matérialisation : jamais de `scrollToItem` sur un index que la
collection view n'a pas encore ingéré (apply en vol).

Sites : `ScrollToMessageSettleLaw.swift` (+ tests
`ScrollToMessageSettleLawTests`), `MessageListViewController.swift`
(`beginVerifiedScroll` / `verifyScrollSettleTarget` /
`scheduleScrollSettleFallback`), tests d'intégration dans
`MessageListViewControllerTests`. Le garde F12
(`FocalRealtimeMatrixTests.test_F12`) reste vert : les deux sauts partagent
toujours UN mécanisme — désormais `beginVerifiedScroll` (2 occurrences de
`scrollToItem(.centeredVertically)` : la visée initiale et la passe
corrective).

### 2. Saccades tous modes — la lecture de fenêtre GRDB tournait sur le MainActor, à chaque écriture

`MessageStore.refreshFromDB` matérialisait la fenêtre SQLite **sur le
MainActor**, à **chaque** notification `.messageStoreShouldRefresh` — une par
écriture GRDB : message entrant, accusé de livraison, accusé de lecture,
réaction, tick de retry. Or en `.latest` ancré la fenêtre est **sans platfond**
(elle grandit à chaque pagination) : après une remontée profonde du fil,
chaque écriture rematérialisait des milliers de lignes sur la boucle
principale. Boucle de rétroaction : défiler produit des lectures (suivi de
lecture exact) → accusés → écritures GRDB → refetch complet main-thread **en
plein geste**. La saccade était indépendante du mode de lecture — cohérent
avec le symptôme.

**Correctifs** (`MessageStore.swift`) :
- lecture de fenêtre en `Task.detached` (patron éprouvé de
  `loadOlder(before:)`), pour `refreshFromDB` ET `loadInitialSnapshot` ;
  `fetchMessageWindow` explicitement `nonisolated` (la cible compile sous
  `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) ;
- garde de génération (`refreshGeneration`) : les refreshes pouvant désormais
  s'entrelacer pendant l'await, seule la demande la plus récente publie —
  jamais une fenêtre périmée par-dessus une fraîche ; le merge protecteur
  existant couvre l'entrelacement avec `apply(records:)` comme avant ;
- coalescence des refreshes temps réel (`requestRealtimeRefresh`) : premier
  événement servi immédiatement, la rafale qui tombe pendant la lecture en
  vol fusionne en UNE lecture de queue — plus jamais une lecture de fenêtre
  complète + une repasse de snapshot O(n) PAR écriture.

Tests : coalescence (burst → fenêtre fraîche ; écriture pendant la lecture en
vol → ramassée par la queue) dans `MessageStoreTests` ; les contrats existants
(merge protecteur, replace strict en `.around`/`.search`) inchangés et
toujours couverts.

## Chauffe device sur simple manipulation (second signalement user, même journée)

### 3. Six animations d'ombre `repeatForever` INVISIBLES derrière la liste

`RootView.menuLadder` est monté en PERMANENCE sur l'écran d'accueil (opacité 0
via `menuAnimation`, `zIndex −1`, `allowsHitTesting(false)` quand le menu est
fermé — nécessaire pour que le ressort d'ouverture anime depuis un état
existant). Or chaque `ThemedActionButton` de l'échelle démarrait son « glow
respirant » à `onAppear`, inconditionnellement : six boutons invisibles
animaient chacun une **ombre** (`.shadow` radius + opacité, `repeatForever`
2 s) — et une ombre animée en SwiftUI se re-rasterise à CHAQUE frame. Six
rasterisations par frame, en continu, du lancement de l'app à sa fermeture,
derrière la liste de conversations. Même famille de défaut que le fond animé
de conversation désactivé le 2026-06-10 (`ConversationBackgroundConfig.
animationsEnabled = false`, « hottest app symbol »), une couche plus haut.

**Correctif** : `ThemedActionButton.isGlowEnabled` (défaut `true`) — glow ET
pulse de pastille gardés dessus ; `menuLadder` passe `showMenu`. Le démarrage/
arrêt passe par `adaptiveOnChange` (l'échelle ne se remonte pas à l'ouverture,
`onAppear` ne rejouerait pas). Garde de source :
`RootMenuLadderGlowGuardTests`.

### 4. Le balayage complet (second lot de correctifs, même journée)

| # | site | défaut | correctif |
|---|---|---|---|
| 1 | `NotificationBadge` (`FloatingButtons.swift`) | halo `repeatForever` dans le chrome FLOTTANT du root (zIndex 100, au-dessus de la liste ET de chaque fil), permanent dès ≥ 1 notification non lue — l'état NOMINAL | halo d'ANNONCE : `task(id: count)` respire `announcementPulseDuration` (6 s) à l'apparition et à chaque changement de compteur, puis détente animée vers le repos |
| 2 | `SyncPill.dotTimer` | `.onReceive` attaché à la RACINE (Group) : l'`autoconnect` 2 Hz réveillait le main thread en permanence, pill VIDE comprise (l'état nominal), pour un garde qui jetait le tick | abonnement déplacé DANS `pillContent` (n'existe que pill visible) ; publishers recréés à l'apparition (pas de pari sur la reconnexion d'un autoconnect annulé) |
| 3 | `ConversationScrollControlsView.typingDotTimer` | même forme : timer 2 Hz abonné tant que la pill « retour au bas » est montée (toute lecture d'historique), frappe ou pas | abonnement déplacé sur `typingDotsView`, montée seulement sous `hasTypingIndicator` |
| 4 | `ScrollMotionVisibility` (`.scrollMotionActive(offset:)`) | `.task(id: offset)` = une `Task` structurée créée + annulée PAR FRAME de scroll (~120/s) sur 4 écrans (liste, fil, feed, root), pour débouncer un booléen | debounce par `DispatchWorkItem` ré-armé en place (patron `focalFlattenWork`) — zéro continuation, zéro hop d'acteur |
| 5 | `MeeshyMoodBadge` | ressort `repeatForever` sans fin ; la bande de stories étant le premier enfant NON lazy du scroll de la liste, chaque mood respirait HORS ÉCRAN pendant toute la lecture | respiration bornée `breathingDuration` (8 s) puis détente vers le repos — même arbitrage que `SyncPillRotator.maxCycles` |
| 6 | `CachedPlayIcon` (`ConversationMediaViews.swift`) | code MORT (zéro site d'appel) dont la `.task` bouclait `FileManager.fileExists` toutes les 1,5 s sans terminaison | supprimé |
| 7 | `RelativeTimestampText` / `LentilleRowTimestamp` | une `TimelineView(.periodic 60 s)` par rangée réalisée, y compris pour des libellés (« 3 mois ») figés pour des semaines | tick minute réservé aux rangées < 1 h ; au-delà, texte statique rafraîchi au prochain passage de body |

Vérifiés SAINS au passage (gating correct, rien à faire) : fond animé de
conversation (désactivé), orbes du root (statiques, `drawingGroup`), anneau
story (statique depuis 2026-06-21), pastilles de présence (`pulse` seulement
online + ring story), badges mood en contextes liste (exclus depuis
2026-08-21), `TypingDots` (seulement pendant la frappe), `SyncPill` marquee
(30 Hz seulement pill visible), `MeeshyPullIndicator`, spinners de bulle
(saving/retry/live call conditionnels), `PresenceManager` (recalc 30 s + bump
débouncé 400 ms), tri/groupement de la liste (hors main actor, débouncé).

Suites identifiées NON corrigées ici (re-render amplification, profil requis
avant d'y toucher) : `Conversation.renderFingerprint` recalculé 4×/rangée/
passe (tri de clés alloué à chaque appel — le mettre en cache demande de
toucher tous les inits du modèle SDK) ; corps de `ConversationListView`
ré-évalué par chaque `@Published` du `ConversationListViewModel` (la frappe en
écrit DEUX par événement) avec ~99 ids re-alloués et la construction
swipe-actions/`LentilleMagnification` par rangée réalisée sous drapeau OFF ;
`GeometryReader` + `onChange(frame)` par rangée sur iOS < 26 (chemin
contextMenu legacy) ; un `Timer` réalloué par frappe dans
`ConversationSocketHandler.resetIdleTimer`.

## Candidats restants, identifiés mais PAS corrigés ici (à vérifier sur device)

1. **Estimations de hauteur figées (80/150)** — chaque écart estimé/réel émet
   une correction d'offset ; le budget anti-tempête
   (`maxPartialInvalidationsPerTransaction = 4`) en avale une partie au fling.
   `MessageRecord.cachedBubbleHeight` et `BubbleHeightCache` connaissent déjà
   les hauteurs réelles, mais `UICollectionViewCompositionalLayout` ne prend
   d'estimation que PAR SECTION — un retour par item demanderait un layout
   custom. Le plus gros levier structurel restant.
2. **`applyBottomInset` écrit `contentInset.top` sans compensation d'offset**
   (composeur qui grandit / clavier) — à mesurer sur device avant de toucher :
   UIKit ajuste parfois l'offset lui-même au changement d'inset, une
   compensation aveugle doublerait le déplacement.
3. **Cellule typing en tête (index 0)** — insertion/retrait de tête + snapshot
   complet à chaque `typing:start/stop` ; non compensé près du bas PAR CHOIX
   (poussée naturelle). Rien à faire tant que le produit veut la poussée.
4. **`onScrollingActiveChanged` → `withAnimation` sur un `@State` de
   `ConversationView`** — deux réévaluations du body (2 900 lignes) par geste.
   Borné par geste, pas par frame ; à scoper dans un ObservableObject fin si
   un profil le montre.
