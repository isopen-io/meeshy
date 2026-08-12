# Story Timeline UI Polish — Design

## Context

Suite au round WYSIWYG parity (`2026-07-18-story-timeline-wysiwyg-parity-design.md`),
une passe de finition sur l'éditeur Timeline du composer story (sous-modes
Quick/Simple et Pro). Six demandes utilisateur, dont **cinq** sont des
raffinements UI contenus et cohérents entre eux, traités ici ; la sixième
(effets d'apparition/disparition riches par clip) est un chantier de rendu
nettement plus large et fait l'objet d'une **spec séparée** rédigée juste
après celle-ci.

Toutes les vues concernées vivent dans
`packages/MeeshySDK/Sources/MeeshyUI/Story/` (target `MeeshyUI`). Aucune
nouvelle architecture : on suit les patterns déjà établis dans cet arbre
(fonctions `static` pures + vues fines qui les consomment, wrappers
`Compatibility/AdaptiveGlass`, `EditCommand` pour les mutations).

Chaque constat ci-dessous a été validé factuellement en lisant le code et,
pour le point A, reproduit en direct sur simulateur (iOS 26, capture pixel).

## Portée

**Dans ce round (5 points UI) :**
- A — Parité du rayon d'angle du sheet entre Simple et Pro (bug de rendu)
- B — Le contenu de la timeline (ruler + pistes) occupe toute la largeur
  disponible du sheet, dans les deux modes
- C — Tout le chrome de navigation/contrôle passe en vrai Liquid Glass iOS 26+
- D — Colonne d'étiquette de piste enrichie : icône + durée totale
  auto-recalculée, nom de type dessous (IMAGE_1, AUDIO_2…)
- E — Long-press sur une piste ouvre la config (nom persisté + timing lié
  début/fin/durée), en étendant `ClipInspector`, accessible dans les deux modes

**Différé (spec séparée, suivant immédiat) :**
- F — Effets d'apparition/disparition riches par clip (fade/zoom/slide/reveal),
  distincts du fondu d'opacité `fadeIn`/`fadeOut` actuel. Nécessite de nouveaux
  champs modèle, un rendu `StoryRenderer` par-clip (et non par-slide) et un
  support export MP4. Le sheet de config du point E **réserve visuellement la
  place** pour ces effets (la section fondu existante y devient accessible),
  mais leur refonte en effets typés est hors de ce round.

## A — Parité du rayon d'angle du sheet (bug)

**Constat (reproduit sur simulateur, iOS 26).** Le sheet composer expose un
rayon de 24 pt en haut via `ComposerBottomBand.bandShape`
(`Story/Controls/ComposerBottomBand.swift:154-160`), peint une seule fois pour
tout le band (`.glassEffect(…, in: Self.bandShape)` sur iOS 26+, fallback
opaque en dessous, `ComposerBottomBand.swift:173-193`). Ce shape est **partagé
à l'identique** par tous les panneaux d'outil et par les deux sous-modes
Timeline — aucune branche du code ne différencie la forme entre Quick et Pro.

Pourtant, mesure pixel : en **Pro** le coin haut-gauche ET haut-droit ont un
vrai rayon (~16 pt rendus, contour incurvé sur ~65 px de haut) ; en **Simple**
les deux coins sont parfaitement carrés (0 pt, contour vertical net). Reproduit
deux fois en basculant Simple↔Pro.

**Diagnostic.** Le rayon `bandShape` est correct dans les deux cas au niveau
du code ; la différence de rendu vient de la façon dont `.glassEffect` (Liquid
Glass) compose son masque de coin selon la structure du sous-arbre qu'il
enveloppe. `QuickTimelineView` et `ProTimelineView` diffèrent structurellement
(hiérarchie de `ScrollView`, `GeometryReader`, `VStack` imbriqués) ; l'un des
deux fait que le clip du coin arrondi n'est pas honoré. La cause **exacte**
(quel conteneur écrase le masque) doit être isolée en implémentation par
bisection de la view hierarchy — ce n'est pas une ligne repérable par grep.

**Traitement.** Garantir que le sheet conserve son rayon de 24 pt visible,
identique en Simple et Pro. Deux voies possibles, à trancher en implémentation
selon ce que révèle la bisection :

1. **Clip explicite au niveau band** (préféré si applicable) : appliquer
   `.clipShape(Self.bandShape)` (ou un `.mask`) sur le contenu du band juste
   sous le `.glassEffect`, de sorte que le sous-arbre soit rogné à la forme
   quelle que soit sa structure interne — indépendant de Quick/Pro.
2. **Neutraliser le conteneur fautif** : si la bisection montre qu'un
   `GeometryReader`/`ScrollView` précis de `QuickTimelineView` (ou Pro) casse
   le masque, isoler ce conteneur derrière un `.compositingGroup()` ou
   réordonner pour que le clip du coin s'applique en dernier.

**Critère d'acceptation.** Capture pixel du coin haut-gauche et haut-droit :
rayon > 0 et identique (±1 px) entre Simple et Pro, aux mêmes hauteur de
panneau et zoom.

## B — Le contenu occupe toute la largeur, dans les deux modes

**Constat.** Deux causes cumulées empêchent le contenu de remplir la largeur
du sheet, plus marquées en Pro :

1. **`minLaneWidth` divergent.** Quick passe `minLaneWidth: 200`
   (`QuickTimelineView.swift:275`), Pro passe `320`
   (`ProTimelineView.swift:382`). `TimelineScrubArea.laneWidth` calcule
   `max(geometry.width(for: totalDuration), minLaneWidth)`
   (`TimelineScrubArea.swift:26-30`). Pour une même durée et un même zoom, si
   la largeur naturelle (durée × pixels/s) tombe sous le plancher, Pro réserve
   jusqu'à 320 pt là où Quick s'arrête à 200 — mais surtout, aucun des deux
   planchers n'est relié à la largeur réelle du sheet : le plancher est un
   nombre magique, pas l'espace disponible.

2. **Colonne d'étiquette fixe à 72 pt, dupliquée.** La largeur de la colonne
   collante est codée en dur à deux endroits **non reliés** :
   `TimelineScrubArea.laneLabelWidth` (`TimelineScrubArea.swift:18`, utilisée
   pour offsetter ruler + playhead + poignée) et le littéral `72` dans
   `TrackBarView.body` (`TrackBarView.swift:51`). 72 pt sur un écran de ~402 pt
   de large, c'est ~18 % de la largeur du sheet dépensés en étiquette.

**Traitement.**

- **Unifier la largeur de colonne en une seule source.** Introduire une
  constante partagée (p. ex. `TimelineScrubArea.laneLabelWidth`) et faire
  `TrackBarView` la consommer via un paramètre d'init (`labelColumnWidth`) au
  lieu du littéral `72`, pour que ruler, playhead, poignée et étiquette soient
  toujours d'accord. Le point D fixe sa nouvelle valeur (~44 pt, colonne
  étroite mais plus haute).
- **Largeur de lane pilotée par l'espace réel.** Remplacer le plancher magique
  par une largeur calculée à partir de la largeur disponible du sheet : la lane
  fait `max(geometry.width(for: totalDuration), availableWidth − labelColumn − 2×padding)`,
  où `availableWidth` vient d'un `GeometryReader` du conteneur. Ainsi le
  contenu remplit **toujours** exactement la largeur visible (jamais moins, et
  s'étend au-delà via scroll quand la durée l'exige), identiquement en Quick et
  Pro. Le même `availableWidth` alimente les deux modes → plus de divergence
  200/320.
- Garder le comportement de scroll horizontal quand la timeline est plus longue
  que l'écran (inchangé) ; seul le **plancher** change de « nombre fixe » à
  « largeur disponible ».

**Critère d'acceptation.** À durée courte (lane naturelle < largeur écran), le
ruler et les pistes s'étendent jusqu'au bord droit du sheet (moins le padding),
en Simple comme en Pro. Le ruler reste aligné pixel-près avec les clips en
dessous (l'offset de colonne unique garantit x=0 identique).

## C — Liquid Glass sur tout le chrome de navigation/contrôle

**Constat.** Quatre zones n'ont aujourd'hui aucun vrai verre iOS 26 (matériau
plat ou fill opaque) :

- **(A) Rangée outils** — `ComposerToolPanelHost.headerRow`
  (`Story/Controls/ComposerToolPanelHost.swift:73-140`) : `backButton` en
  `.ultraThinMaterial` plat (ligne 99, pas de gate), `switchChip`
  (Media/Sound/Drawing/Text) en Capsule solide (lignes 122-131) — zéro verre.
- **(B) Toggle Simple/Pro** — `TimelineModeSwitcher`
  (`Story/Timeline/Views/Controls/TimelineModeSwitcher.swift:53-69`) :
  `.ultraThinMaterial` inconditionnel, jamais gaté iOS 26 (le commentaire
  prétend « matches TimelineToolbar » mais il n'y a pas de `.glassEffect`).
- **(C) Barre d'outils Pro** — `TimelineToolbar` (undo/redo/snap/règle) : le
  fond de rangée devient `Color.clear` sur 26+ pour laisser voir le verre du
  band, mais les boutons/pastilles eux-mêmes sont plats (`TimelineToolbar.swift:98-162`).
- **(D) Barre de transport** — `TransportBar` (lecture/zoom/muet/undo) :
  `Button(.plain)` à fills solides/gradient, aucun verre (`TransportBar.swift:145-263`).

**Traitement.** Appliquer le wrapper existant `Compatibility/AdaptiveGlass`
(`adaptiveGlass(in:tint:interactive:)`, `adaptiveGlassProminent(in:tint:)`,
`AdaptiveGlassContainer`) — déjà éprouvé sur `ClipInspector` — à ces quatre
zones. C'est un atome agnostique (Shape + Color), il applique le vrai
`.glassEffect` sur iOS 26+ et un fallback matériau/gradient identique à
l'existant en dessous, donc **zéro régression** sur < 26.

- **(A)** `backButton` et chaque `switchChip` : remplacer le fond Capsule par
  `.adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)` ;
  grouper la rangée de chips dans un `AdaptiveGlassContainer` pour que les
  capsules adjacentes se fondent correctement (le verre ne peut pas
  échantillonner du verre sans conteneur).
- **(B)** `TimelineModeSwitcher` : le segment actif en
  `adaptiveGlassProminent(in: Capsule(), tint: indigo500)` (blanc sur indigo,
  parité fallback), la piste en `adaptiveGlass`. Retirer les fills
  `.ultraThinMaterial` inconditionnels.
- **(C)/(D)** Boutons de `TimelineToolbar` et `TransportBar` : appliquer
  `adaptiveGlass(in: Circle()/Capsule(), tint: indigo…)` sur chaque bouton,
  groupés par `AdaptiveGlassContainer` par rangée. Le bouton lecture (gradient
  de marque) peut rester `adaptiveGlassProminent` pour garder son emphase.

**Contrainte de composition.** Le band parent porte déjà du vrai verre ; le
verre ne peut pas échantillonner du verre. On suit la règle canonique déjà
documentée dans `ClipInspector` : les **surfaces** de rangée restent
transparentes/matériau, seuls les **contrôles flottants** prennent le glass,
groupés en `AdaptiveGlassContainer`. Ne pas empiler glass-sur-glass.

**Critère d'acceptation.** Sur iOS 26, les boutons de navigation et de contrôle
sont réfractifs (répondent au fond) ; sur < 26, rendu identique à aujourd'hui
(fallback matériau/gradient). Aucun contrôle ne perd en lisibilité sur fond
clair/pastel.

## D — Colonne d'étiquette de piste enrichie

**Constat.** La colonne collante affiche aujourd'hui, sur une seule ligne
(hauteur 36-40 pt), une puce d'icône + le titre tronqué (« VIDÉO 1 » s'affiche
« VID… » faute de place, `TrackBarView.swift:87-96`). Aucune durée n'est
affichée dans la colonne ni sur la barre de clip. Le filmstrip/waveform réel
vit **dans** la barre de clip (zone scrollable, `VideoClipBar`/`AudioClipBar`),
inchangé par ce point.

**Traitement.** Enrichir `TrackBarView` (colonne d'étiquette uniquement) :

- **Colonne étroite (~44 pt), pistes plus hautes (~56 pt).** Réduire la
  largeur de la colonne (récupère de la largeur pour la lane, cf. point B) et
  augmenter `laneHeight` (Quick passe de 36 à ~52, Pro de 40 à ~56) pour
  empiler deux lignes.
- **Ligne 1 : icône + durée totale.** La puce d'icône de type (déjà présente,
  couleur par kind) suivie de la durée totale de la piste, formatée court
  (p. ex. `3,2s` / `1:04`).
- **Ligne 2 : nom de type.** `IMAGE_1`, `AUDIO_2`, `VIDEO_1`, `TEXT_1` — le
  numéro d'index par kind (déjà calculé dans `resolveAllTracks`,
  `QuickTimelineView.swift:100-141`). Ce label devient aussi le nom par défaut
  éditable (cf. point E) : si l'utilisateur a renommé la piste, ce nom
  personnalisé s'affiche à la place du tag de type.
- **Durée auto-recalculée et live.** La durée affichée est **dérivée** de la
  géométrie du clip de la piste (`startTime` + durée effective, via
  `TimelineGeometry.effectiveClipDuration`, déjà utilisée par les barres) et se
  met à jour à chaque édition (trim/split/déplacement) puisqu'elle est
  recalculée à chaque rendu à partir de `viewModel.project`. Fonction `static`
  pure `TrackBarView`-scoped (ou helper) pour le formatage, testable sans
  monter la vue.

**Interfaces.** `TrackBarView` gagne des paramètres : `durationLabel: String`
(formaté par le conteneur depuis la géométrie), `typeLabel: String` (le
`IMAGE_i` / nom custom), et `labelColumnWidth: CGFloat` (point B). Reste une
leaf view à `let` primitifs (pas d'`@ObservedObject`). Le titre mono-ligne
actuel est remplacé par la pile deux-lignes.

**Accessibilité.** `accessibilityComposedLabel` combine nom + durée + verrou
pour VoiceOver (le visuel deux-lignes ne doit pas fragmenter l'annonce).

**Critère d'acceptation.** Chaque piste affiche icône + durée sur la première
ligne, nom de type/custom sur la seconde ; la durée bouge visiblement après un
trim ou un déplacement de clip. Aucun texte tronqué en « VID… ».

## E — Long-press → configuration piste (nom + timing lié)

**Constat.** Le seul éditeur de clip existant est `ClipInspector`
(`Story/Timeline/Views/Inspector/ClipInspector.swift`), **monté uniquement en
Pro** (`ProTimelineView.swift:500`, overlay bottom-leading, ouvert au tap). Le
mode Simple n'a **aucune** UI d'édition de piste : sélectionner un clip n'y
fait que le surligner. Le long-press est aujourd'hui identique au tap sur tous
les clips (`onLongPress: { viewModel.selectClip(...) }`). Le panneau (i) de
`ClipInspector` a déjà des champs début/durée éditables par pas de ±0,1 s
(`steppableTimeField`, `ClipInspector.swift:342-378`) mais **pas** de champ nom,
et **pas** de saisie fin ni de liage début/fin/durée. L'enum
`InspectorPresentation` définit un cas `.sheet` (`InspectorPresentation.swift:6`)
**jamais utilisé** — prévu pour Quick, jamais branché.

**Traitement.** Étendre `ClipInspector` (choix utilisateur : un seul sheet pour
tout, plutôt qu'un nouveau mini-sheet parallèle) et le rendre accessible en
Simple.

1. **Champ nom persisté.** Ajouter un champ nom optionnel sur les trois modèles
   (`StoryMediaObject`, `StoryAudioPlayerObject`, `StoryTextObject` dans
   `Models/StoryModels.swift`) — nouveau champ `Codable` optionnel (p. ex.
   `name: String?`), rétro-compatible (absent = tag de type par défaut). Le
   surfacer dans `ClipInspector` (nouveau champ texte dans le header ou la
   section détails), câblé via un nouveau callback `onNameChanged: (String) ->
   Void` → `TimelineViewModel` (nouvel `EditCommand` renommage, undoable). Le
   nom persisté alimente aussi l'étiquette du point D.
2. **Bloc timing lié début/fin/durée.** Remplacer les deux `steppableTimeField`
   (début, durée) par un bloc à **trois** valeurs liées : début, fin, durée,
   avec la contrainte `fin = début + durée`. Éditer l'une recalcule les deux
   autres selon la règle : ajuster **début** déplace le clip (durée constante,
   fin suit) ; ajuster **durée** garde le début et bouge la fin ; ajuster
   **fin** garde le début et recalcule la durée. Fonction `static` pure pour la
   résolution des trois valeurs sous contrainte (clamps : durée ≥ 0, fin ≤
   `slideDuration`), testable en isolation. Réutilise les callbacks existants
   `onStartAdjusted`/`onDurationAdjusted` + un nouveau `onEndAdjusted` dérivé.
3. **Accès en Simple via long-press + `.sheet`.** Brancher enfin
   `InspectorPresentation.sheet` : en Quick, monter `ClipInspector(presentation:
   .sheet, …)` dans un vrai `.sheet` SwiftUI (avec `adaptiveSheetGlassBackground()`,
   déjà fourni par `AdaptiveGlass.swift:68-75`, et `presentationDetents`),
   déclenché par le long-press d'un clip (`onLongPress` route désormais vers
   l'ouverture du sheet au lieu du simple `selectClip`). En Pro, le long-press
   devient un raccourci équivalent au tap (ouvre l'inspecteur popover existant) ;
   le tap y garde son comportement actuel. Le layout `.sheet` (`presentation ==
   .sheet`) utilise déjà `padding 18`, `cornerRadius 0`, `maxWidth: .infinity`
   dans `ClipInspector.body` (`ClipInspector.swift:235-244`) — prêt à l'emploi.
4. **Section fondu accessible en Simple.** Par effet de bord de (3), la section
   `animationConfig` (fadeIn/fadeOut, chips presets) devient atteignable en
   Simple. C'est le point d'ancrage visuel du chantier différé F : les effets
   riches par clip s'y grefferont. Rien d'autre ne change sur le fondu dans ce
   round (mêmes 5 presets, même mécanisme d'opacité).

**Interfaces.** `ClipInspector.ClipSnapshot` gagne `name: String?`.
`ClipInspector` gagne `onNameChanged` et `onEndAdjusted`. `TimelineViewModel`
gagne `setClipName(id:name:)` (+ `EditCommand`) et un helper de résolution du
timing lié. Les résolveurs `resolveClipSnapshot`
(`ProTimelineView.swift:102-145`) propagent le nom.

**Critère d'acceptation.** En Simple, long-press sur une piste ouvre un sheet
natif avec : nom éditable (persiste après fermeture/réouverture), et un bloc
début/fin/durée où modifier l'un met à jour les deux autres de façon cohérente.
En Pro, long-press ouvre l'inspecteur (équivalent tap). Le nom renommé apparaît
dans l'étiquette de piste (point D).

## Approche de test (TDD, par point)

- **A** : pas de logique pure isolable (rendu) — test par capture simulateur
  avant/après (script pixel du coin, comme en design). Si la voie 1 (clip
  explicite) est retenue, un test snapshot léger peut vérifier la présence du
  `clipShape`. Vérification manuelle Simple/Pro obligatoire.
- **B** : fonction pure de résolution de largeur de lane
  (`laneWidth(totalDuration:geometry:availableWidth:labelColumn:padding:)`),
  table-driven : durée courte → remplit `availableWidth` ; durée longue →
  `geometry.width`. Test d'unification : `TrackBarView` et `TimelineScrubArea`
  lisent la même constante de colonne. Vérif visuelle bord droit.
- **C** : pas de logique métier — les wrappers `AdaptiveGlass` sont déjà
  testés/éprouvés. Vérif : grep confirmant qu'aucune des 4 zones ne garde de
  fill opaque non-gaté ; vérif visuelle iOS 26 + fallback < 26 (build simu 18.2
  si dispo).
- **D** : fonction pure de formatage durée (`formatTrackDuration(_:)`) +
  résolution du type/nom (custom vs `IMAGE_i`), table-driven. Test que la durée
  affichée suit un trim (via ViewModel + assertion sur le label calculé).
- **E** : fonction pure de résolution du timing lié
  (`resolveLinkedTiming(edited:start:end:duration:slideDuration:)`),
  table-driven (chaque champ édité → deux autres corrects, clamps).
  `TimelineViewModel` : `setClipName` persiste + undoable + resync snapshot.
  Test que `ClipSnapshot.name` propage. Décodage rétro-compat : un modèle sans
  `name` décode sans erreur.

## Vérification (bout-en-bout, en plus des tests unitaires)

- Build `./apps/ios/meeshy.sh build`, install frais, valider sur simulateur
  iOS 26 (`C295B364-8CA6-4214-BC52-E411A97EBFE2`) ET, si dispo, un runtime
  < 26 (fallback Liquid Glass), avec média distinguable (pas les assets
  synthétiques unis du simu).
- Matrice : basculer Simple↔Pro plusieurs fois (coin arrondi stable, point A) ;
  durée courte (contenu pleine largeur, point B) ; trim/déplacement (durée
  d'étiquette live, point D) ; long-press image + audio + texte en Simple ET
  Pro (sheet nom/timing, point E) ; renommer une piste et vérifier que
  l'étiquette suit et survit à la fermeture/réouverture.
- Confirmer que le ruler reste aligné pixel-près avec les clips après le
  changement de largeur de colonne (point B/D).

## Questions ouvertes pour l'implémentation

- **A** : la cause exacte du coin carré en Simple doit être bisectée dans la
  view hierarchy. Priorité au clip explicite (voie 1) s'il suffit ; sinon
  isoler le conteneur fautif. Vérifier que le clip n'introduit pas d'artefact de
  bord sur le verre (le `.glassEffect` doit rester la couche extérieure).
- **D/E** : le nom de type par défaut (`IMAGE_i`) suit-il le format exact
  demandé (`IMAGE_1` underscore + index 1-based) ou la casse localisée existante
  (« Image 1 ») ? À confirmer — le spec suppose le format `TYPE_i` demandé
  explicitement par l'utilisateur, en majuscules avec underscore, distinct du
  titre de barre de clip localisé.
- **E** : l'augmentation de `laneHeight` (~56 pt) interagit avec la hauteur par
  défaut du panneau Timeline (`defaultPanelHeight(.timeline) = 320`,
  `ComposerToolPanelHost.swift:194`). Vérifier qu'au moins une piste reste
  visible sans redimensionner (recoupe le point E « panel height » différé du
  round précédent) ; si trop juste, ajuster la hauteur par défaut du panneau
  Timeline en conséquence.
- **F (différé)** : la section fondu rendue accessible en Simple par le point E
  garde le mécanisme d'opacité actuel ; la spec suivante décidera si les effets
  typés remplacent ou complètent `fadeIn`/`fadeOut`.
