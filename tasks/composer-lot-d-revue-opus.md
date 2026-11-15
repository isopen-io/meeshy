# Revue Opus du lot D — rapport intégral (2026-08-21)

# Revue finale — lot D (timeline plan 2D iOS), branche `feat/composer-lot-d` @ `5b16fe1ab`

Périmètre relu : les 13 commits `d36869973..HEAD` (diff **35 fichiers**, +4129/−23), l'état final de `Plan2DLayout` / `Plan2DView` / `StoryTimelineHost` / `Plan2DProjectAdapter` / `Plan2DReorderResolver` / `TimelineMetrics` / `ClipInspector` / `TimelineInspectorHost` / `TimelineViewModel+Plan4Helpers`, les 12 fichiers de test du lot, le code remplacé (`git show d36869973:…/StoryTimelineView.swift`), et les trois référentiels (plan lot D, execution-spec, `planche-meeshy-composer.html`).

---

## CONSTATS

### MAJEUR 1 — Un losange de keyframe **audio** est dessiné et tappable, mais aucun inspecteur ne le résout : le tap est un cul-de-sac qui **efface silencieusement la sélection en cours**

Le plan projette les keyframes audio, contrairement à l'ancien conteneur :

`packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/Plan2DLayout.swift:209`
```swift
keyframes: markers(of: audio.keyframes, clipStart: audio.startTime.map(Double.init)))
```

Ils sont dessinés (`Plan2DView.swift:153-158`, `for time in track.keyframeTimes`), hit-testés (`Plan2DView.swift:341-351` `keyframeHit`), et routés :

`Plan2DView.swift:497-499` → `onSelectKeyframe(keyframeId)`
`StoryTimelineHost.swift:261` → `onSelectKeyframe: { viewModel.inspectClip(id: $0) }`
`ClipSelectionState.swift:62-65` → `inspect()` pose `selectedClipId = clipId; inspectedClipId = clipId`

Or le résolveur ne connaît **que** média et texte :

`TimelineInspectorHost.swift:254-256` (doc-comment) et `:257-289` (corps)
```swift
/// A keyframe id is searched across every clip's `keyframes` collection
/// (media + text — audio has no keyframes).
…
for media in viewModel.project.mediaObjects { … }
for text  in viewModel.project.textObjects  { … }
return nil
```

Chaîne : `resolveSelectionKind` (`:333-350`) → `nil` → `presentedSelection` (`:58-78`) → `nil` → la sheet **ne s'ouvre jamais**. Le tap ne fait rien de visible, mais `selectedClipId` pointe désormais sur un id qu'aucun résolveur ne connaît (et le plan ne rend aucune sélection, cf. constat 4 — l'utilisateur n'a aucun signal).

L'affirmation est reconnue fausse ici : l'ancien conteneur ne dessinait **jamais** ces losanges — `KeyframeMarkerResolver.swift:17-18` : « *Tous les keyframes du projet (médias + textes — **l'audio n'en a pas**)* ». C'est donc une surface **nouvelle** du lot D.

Et les keyframes audio existent bien en production : `TimelineInspectorHost.swift:434` `viewModel.addKeyframeAtPlayhead(volume: volume)` → `TimelineViewModel.swift:690-711` écrit `AddKeyframeCommand(clipId:kind:.audio…)` ; `TimelineInspectorHost.swift:194-196` relit `audio.keyframes` pour la courbe de volume.

La ligne P0 D3 affirme le contraire : « *`Plan2DTrack` porte désormais l'IDENTITÉ de ses losanges (`Plan2DKeyframe`) et **un tap dessus route vers SON `KeyframeInspector`*** » — faux pour toute la famille audio.

---

### MAJEUR 2 — Le geste armé est à deux axes **sans verrou d'axe ni zone morte** : tout réordonnancement vertical décale aussi le clip dans le temps et empile une commande `MoveClip`

`Plan2DView.swift:373-382`
```swift
guard gestureEdge == nil, isReorderArmed else { return nil }
guard case .timed = track.bar else { return nil }
let seconds = timeDelta(forDeltaX: translation.width, …)
guard seconds != 0 else { return nil }
```
`seconds != 0` est la **seule** condition sur l'axe horizontal — aucune zone morte, aucune comparaison |Δx| vs |Δy|.

Pire, l'armement autorise jusqu'à 24 pt de translation horizontale AVANT de s'armer (`Plan2DView.swift:451` `guard Self.withinSlop(value.translation)`, `:289` `reorderSlop: CGFloat = 24`), donc le **premier** `moveDelta` post-armement rend déjà ces 24 pt en secondes.

Les deux mutations partent : `Plan2DView.swift:461` `onMove(track.id, seconds)` pendant le geste, `:488` `onMoveEnded`, `:503-504` `onReorder`. Côté hôte, `StoryTimelineHost.swift:279-288` → `beginClipDrag` / `dragClipMoved` / `endClipDrag`, et :

`TimelineViewModel.swift:376-381`
```swift
let unchanged = abs(drag.currentStartTime - drag.originalStartTime) < 0.0005
```
À `laneWidth 300` / slide 10 s (30 px/s), 0,0005 s = **0,015 pt**. Autrement dit : tout réordonnancement au doigt réel pousse un `MoveClipCommand` et décale le clip.

Le test censé couvrir ce cas ne teste que le vecteur mathématiquement pur :
`Plan2DRestoredCapabilitiesTests.swift:280-283`
```swift
func test_aPurelyVerticalDrag_producesNoTimeMove() {
    XCTAssertNil(delta(CGSize(width: 0, height: 120)),
                 "Réordonner verticalement ne doit pas décaler la piste dans le temps")
}
```
`width: 0` exactement — un cas qui n'existe pas sur un écran tactile. Le test énonce un invariant que le code ne tient pas.

---

### MAJEUR 3 — Le **verrou** des clips de fond et synthétiques est perdu : ils redeviennent déplaçables et rognables, alors que la lecture ignore leur fenêtre (régression d'un correctif issu d'un retour utilisateur daté)

Ancien conteneur, `git show d36869973:…/StoryTimelineView.swift:625-631` :
```
// Un FOND couvre toute la slide : sa fenêtre début/durée est
// ignorée en lecture. Le verrouiller sur la timeline évite le
// mensonge « je déplace le début mais rien ne change » (retour
// user 2026-07-11) …
let isImmovableBackground = isSynthetic || media.isBackground == true
```
`:650` `isLocked: isImmovableBackground` → `VideoClipBar.swift:186-187` `if !isLocked { onMoveDelta(…) }`, `:168` `ClipTrimHandles.shouldShow(isSelected:isLocked:)`, `:165` `if isLocked { lockBadge }`.

Le plan n'a **aucune** notion de verrou : `Plan2DView.edgeHandle` (`:319-328`) et `moveDelta` (`:373-382`) n'excluent que `.ghost`. `grep -rn "isLocked\|isSynthetic" …/Plan2D*` → aucun résultat dans tout le diff du lot. Le badge cadenas et l'annonce VoiceOver « (verrouillée) » (`TrackBarView.swift:73`) disparaissent aussi.

Cette perte n'apparaît nulle part dans la liste des simplifications assumées du fichier (`StoryTimelineHost.swift:26-52`, qui ne nomme que compact/déployé, pinch et auto-scroll).

Corollaire : `ClipTrimHandles.shouldShow(isSelected:isLocked:)` conditionnait aussi le trim à la **sélection préalable**. Dans le plan, `edgeHandle` est actif sur toute barre `.timed` sans sélection — le rognage accidentel devient possible dès le premier contact.

---

### MAJEUR 4 — Le plan ne rend **aucune sélection**

`Plan2DView` n'expose ni ne reçoit d'état de sélection : la liste complète de ses propriétés (`Plan2DView.swift:33-66`) ne contient rien de tel, et son `==` l'exclut par construction :
```swift
Plan2DView.swift:25-31
lhs.tracks == rhs.tracks && lhs.zoom == rhs.zoom
    && lhs.slideDuration == rhs.slideDuration
    && lhs.laneWidth == rhs.laneWidth && lhs.isDark == rhs.isDark
```
`StoryTimelineHost.swift:242-289` ne lui passe rien de la sélection, et `.equatable()` (`:293`) garantit qu'un changement de `selectedClipId` **ne redessine pas** le Canvas.

L'ancien conteneur le rendait à quatre endroits : `StoryTimelineView.swift:498` (`isSelected: track.containsClipId(…)`), `:649`, `:727`, `:786`, `:835`.

Conséquence directe sur une promesse du modèle, désormais intenable :
`ClipSelectionState.swift:68-69` : « *Referme la fiche SANS désélectionner — l'utilisateur retrouve la piste qu'il consultait, **surlignée***. » Plus rien n'est surligné. Combiné au constat 1, l'utilisateur ne peut ni voir ce qui est sélectionné, ni voir que sa sélection a été empoisonnée. Régression non consignée.

---

### MAJEUR 5 — Grammaire gestuelle M11 : le plan réadopte **exactement les deux pièges** que le module documente comme résolus

`Plan2DView.swift:164` `.simultaneousGesture(rowGesture)` avec `:411` `DragGesture(minimumDistance: 0)`, à l'intérieur de `StoryTimelineHost.swift:225` `ScrollView([.horizontal, .vertical], showsIndicators: true)`.

Le module porte la note contraire, écrite après constat :
`VideoClipBar.swift:178-183`
```
// Le drag AVANT les taps et en HAUTE priorité. En basse priorité
// (.gesture) il cédait au ScrollView horizontal de TimelineScrubArea ;
// et le onLongPressGesture qui le précédait s'engageait à 0,4 s de
// doigt immobile, donc un glissement lent — poser, hésiter, glisser —
// ne démarrait jamais.
```
(identique `TextClipBar.swift:102-106`, `AudioClipBar.swift:149-151`, toutes trois en `.highPriorityGesture(DragGesture(minimumDistance: 4))`).

Le plan fait les deux :
1. **priorité simultanée** — le trim de bord et le déplacement armé s'appliquent pendant que le `ScrollView` panne sous le doigt ;
2. **armement sur immobilité à 0,45 s** — `Plan2DView.swift:286` `reorderArmDuration = 0.45`, `:450-455` :
```swift
if !isReorderArmed {
    guard Self.withinSlop(value.translation) else { return }
    guard Date().timeIntervalSince(startedAt) >= Self.reorderArmDuration else { return }
```
Un glissement lent qui dépasse 24 pt avant 0,45 s **ne s'arme jamais** : ni réordonnancement, ni déplacement temporel. C'est le scénario « poser, hésiter, glisser » nommé dans la note ci-dessus, avec un seuil *plus long* (0,45 vs 0,40).

Sous-constat : l'armement est piloté par des évènements de mouvement (`handleChanged`), pas par un timer. `DragGesture.onChanged` ne se déclenche pas sur un doigt strictement immobile — l'haptique d'armement (`:454` `HapticFeedback.light()`) ne peut donc arriver qu'au premier mouvement, jamais « à l'armement » comme M11 le décrit.

---

### MAJEUR 6 — L'aimantation lit une échelle qui n'est plus celle du plan

Le lot introduit un **second** repère temps→pixels (`Plan2DView.equivalentGeometry`, `Plan2DView.swift:235-239`) dérivé de `laneWidth × zoom.scale / slideDuration`. Mais la tolérance d'aimantation continue de lire `viewModel.zoomScale`, le curseur continu du transport :

`TimelineViewModel.swift:322-325`
```swift
let magnetEngine = SnapEngine(
    toleranceSeconds: TimelineGeometry(zoomScale: zoomScale).dragSnapToleranceSeconds)
```
`TimelineGeometry.swift:53-57` : `min(Float(8.0 / pixelsPerSecond), 0.25)` avec `basePixelsPerSecond = 50` (`:11`).

Les deux échelles n'ont plus aucun rapport. Chiffres, lane 350 pt, `zoomScale` par défaut 1.0 (`TimelineViewModel.swift:84`) ⇒ tolérance figée à **0,16 s** :
- slide 60 s ⇒ densité réelle 5,8 px/s ⇒ 0,16 s ≈ **1 pt** d'écran : l'aimant n'accroche plus jamais visuellement ;
- slide 1 s ⇒ densité réelle 350 px/s ⇒ 0,16 s ≈ **56 pt** d'écran : l'aimant avale un sixième de la piste.

C'est exactement la classe de désynchronisation que la 2e revue DoD a corrigée pour `TransitionChromeLane` (garde `Plan2DIntegrationGuardTests.swift:144-155`), laissée ici non corrigée et non consignée — alors que la bande d'opérations continue d'offrir la bascule `isSnapEnabled` (`StoryTimelineHost.swift:120`).

---

### MAJEUR 7 — Quatre des sept familles de `Plan2DLayout` sont **injoignables en production** : code mort testé vert

L'unique adaptateur de production ne porte que quatre familles :
`Plan2DProjectAdapter.swift:19-26`
```swift
StoryEffects(stickerObjects: project.stickerObjects,
             textObjects: project.textObjects,
             mediaObjects: project.mediaObjects,
             audioPlayerObjects: project.audioPlayerObjects)
```
et `TimelineProject` (`StoryModels.swift:2802-2812`) ne porte effectivement ni `background`, ni `locationObjects`, ni `drawingStrokes`, ni `backgroundAudioId`.

Donc `placeTracks` (`Plan2DLayout.swift:163-171`), `drawingTracks` (`:175-184`), `visualBackgroundTrack` (`:219-227`) et `legacyBackgroundSoundTrack` (`:232-240`) — soit les glyphes `◎`, `✎`, `▦` et la piste de son de fond hérité — **ne produisent jamais une rangée dans l'app**. Ils sont pourtant l'objet de quatre tests verts (`Plan2DLayoutTests.swift:163-225`), dont le critère d'acceptation n°4 du plan D1 Step 1 : « *le fond est une piste `.bg` et, SANS timing propre, `.ghost`* ». Ce critère n'est satisfait que par un `StoryEffects` construit à la main dans un test.

La limitation d'**entrée** est bien disclosée (`Plan2DProjectAdapter.swift:10-16` et `Plan2DProjectAdapterTests` 3e cas). Sa **conséquence** — 4 branches mortes en production, un critère de plan tenu hors production — ne l'est nulle part.

---

### MINEUR 8 — Le désaveu du zoom ne couvre que la moitié haute

`StoryTimelineHost.swift:38-41` : « *au-delà d'un `zoomScale` de 1.0, ces boutons ne changent plus le palier affiché* ».
Or `:186` `plan2DZoom: viewModel.zoomScale > 1 ? .detail : .fit` : tout l'intervalle **[0,05 ; 1,0] est aussi `.fit`**. Le bouton zoom-arrière (`:159-161`) est donc un no-op visuel en **tout** point, et le défaut est précisément 1.0. Le transport continue par ailleurs d'afficher le `zoomScale` continu (`:140`).

### MINEUR 9 — L'icône U9 ne suit pas la table des symboles de la spec

`views.html:1686` : « *`arrow.uturn.backward.circle` (retour fantôme U9)* ».
`ClipInspector.swift:1098` : `systemImage: "arrow.uturn.backward"` (sans `.circle`).

### MINEUR 10 — Le second volet U9 n'est ni implémenté ni listé « Hors v1 »

Planche P8 (`views.html:872-874`) : « *…l'inspecteur timing porte l'action **« Suivre la slide »** (remise à nil), **et le bord étiré jusqu'aux butées propose le retour par un snap étiqueté*** ». Aucune trace de ce snap : `grep -n "snap" …/Plan2DView.swift` → aucun résultat. La spec §F (rév. 4) pose que « *un comportement des planches ni implémenté par un lot ni listé ici est un défaut de spec* » ; il n'y figure pas.

### MINEUR 11 — La garde négative ne peut structurellement rien attraper, et elle a trois fichiers de retard

`Plan2DIntegrationGuardTests.swift:303-307`
```swift
let strays = Self.d3DiffPaths.filter { !Self.isWithinOwnership($0) }
XCTAssertEqual(strays, [], …)
```
Elle ne filtre que la liste **écrite à la main** (`:255-288`, 32 entrées) : un fichier hors périmètre non déclaré est invisible par construction. Le diff réel du lot est de 35 fichiers ; absents du manifeste (tous dans le périmètre possédé, donc sans dommage — mais le manifeste se présente comme « *le MANIFESTE du diff* ») : `…/Views/TimelineMetrics.swift`, `…/Views/Container/StoryTimelineView.swift`, `…/Tests/…/Plan2DRenderMeasureTests.swift`.
Le balayage d'arbre (`:319-334`) ne parcourt que `Sources/MeeshyUI` — une fuite `Plan2D` dans `Sources/MeeshySDK` ou `apps/ios` passerait.
Trois « contrôles positifs » assertent sur un littéral, pas sur la garde (`:39-42`, `:73-80`, `:338-341` — ex. `XCTAssertTrue(sample.contains("StoryTimelineView"))` teste `String.contains`), ce qui gonfle le 26/26 annoncé.

### MINEUR 12 — Chiffres de tests contradictoires dans P0 pour les mêmes suites

- Ligne D1 : « ✓ **14/14** (Swift Testing, suite `Plan 2D — pistes et échelle`) » — ligne D3 : « `Plan2DLayoutTests` **19/19** ». Fichier réel : **19** `@Test`.
- Ligne D2 : « ✓ **31/31** (XCTest, suite `Plan2DViewGuardTests`) » — ligne D3 : « `Plan2DViewGuardTests` **43/43** ». Fichier réel : **43** `func test_`.
- Ligne D3 : « **6937 XCTest + 824 Swift Testing**, 0 échec (35 skipped) — SCHEME COMPLET » — ligne D5 : « `MeeshySDKTests` 3678/3678 (22 skipped) + `MeeshyUITests` 3262/3262 (13 skipped) + **Swift Testing 288/288** (44 suites) ». Même scheme, facteur ≈ 2,9 sur le compte Swift Testing, non réconcilié.

La règle de la planche (`views.html:233-234`) : « *chaque tâche dont le gate passe met à jour cette planche […] dans le MÊME commit que son gate ; un P0 périmé est un défaut bloquant* ».

### MINEUR 13 — Camembert intact ⇒ P0 auto-contradictoire

Vérifié : le diff `views.html` du lot est de 1 `<tr>` retiré + 5 ajoutés, le `conic-gradient` (`:238`) et les légendes ne bougent pas — la règle spéciale du lot est **respectée**. Mais la page reste incohérente avec elle-même : `:240-241` affiche toujours « **40 %** · 23 / 57 tâches · exécutées & testées » et la légende `:249` « *Planifié, plans revus — 28 tâches (49,1 %) : lots C (10) · **D (5)*** », alors que la matrice porte D1→D5 en « Implémenté ✓ / Testé ✓ ». Rien dans la page n'explique l'exception (le commit D5 la justifie, la planche non), et le paragraphe `:233-234` exige encore la mise à jour du camembert.

### MINEUR 14 — Le banc D4 mesure un rendu **à froid** sous un seuil calibré sur des valeurs à chaud

`Plan2DRenderMeasureTests.swift:98-110` chronomètre le **premier** `render(zoom:)` du processus pour chaque zoom (un seul appel encadré par `CFAbsoluteTimeGetCurrent`), donc warm-up SwiftUI/`ImageRenderer` inclus, contre `provisionalRegressionBudgetSeconds = 0.01` (`:96`) recalé sur des mesures à chaud (commit `bb979c93b` : « *measure average 0,002s, valeurs 0,0014-0,0018s* »).
`test_render_thirtyTracks_measuresRenderCost` (`:114-120`) utilise `measure(metrics:)` sans `.xcbaselines` committé : il **ne peut jamais échouer**, il est informatif (ce que le commentaire dit).
La garde réelle se réduit donc à un unique seuil ×4-6 sur une mesure à froid : elle attrape une régression ×10, pas une ×3, et reste exposée à la variance de démarrage.

### MINEUR 15 — L'invariant « un losange tombe dans la barre de son clip » n'est tenu que par la fixture du test

`Plan2DLayout.swift:264-269` (`markers`) ne borne jamais au fenêtrage du clip, et `TimelineViewModel+Plan4Helpers.swift:179-186` (`trimClipEnd`) rétrécit la fenêtre sans toucher `keyframes`. Un clip rogné plus court que son dernier keyframe redessine donc ce losange **hors** de sa barre — le symptôme même que la 3e revue DoD qualifiait de CRITIQUE, par une autre cause. Le test `Plan2DViewGuardTests.swift:332-353` n'assert que sur une fixture favorable (kf à t=1 et t=2 dans un clip de 3 s).

### MINEUR 16 — Le libellé de piste n'est ni tronqué ni écrêté

`Plan2DView.swift:129-135` : `context.draw(Text(track.label)…, at: CGPoint(x: 10, …), anchor: .leading)` — un `GraphicsContext.draw` n'a ni troncature ni cadre. La colonne d'étiquette fait 84 pt (`TrackBarView.swift:87`). L'ancien conteneur l'encadrait : `TrackBarView.swift:103-105` `.frame(width: labelColumnWidth, height: laneHeight, alignment: .leading)`. Les libellés texte sont construits sur le contenu entier (`Plan2DLayout.swift:141` `label: "\(Glyph.text) \"\(text.text)\""`) : un texte long déborde sur les barres.

### MINEUR 17 — Échos de boucle décalés verticalement par rapport aux barres

Barres : `Plan2DView.swift:148-149` `y: rowY + 8`, `height: laneHeight - 16` (36 pt).
Échos : `StoryTimelineHost.swift:350-360` `ZStack(alignment: .topLeading)` + `.frame(height: TimelineMetrics.laneHeight, alignment: .topLeading)`, tuiles `height: laneHeight - 4` (`LoopRepeatOverlay.swift:74`) → 48 pt collées au haut de la rangée. L'ancien conteneur les posait dans le `ZStack(alignment: .leading)` de la lane (centrées verticalement).

### MINEUR 18 — Une barre plus étroite que 22 pt n'a plus de poignée de FIN

`Plan2DView.swift:324-327` évalue `.start` en premier avec `half = 22` : pour une barre de moins de 22 pt, tout contact résout en `.start`, la fin devient inatteignable.

### MINEUR 19 — Un tap sur le bord gauche d'un clip dont le premier keyframe est à t=0 n'ouvre jamais la fiche du clip

`Plan2DView.swift:496-502` consulte `keyframeHit` (rayon 16 pt) avant `onSelectTrack` ; un losange à `kf.time == 0` couvre le bord gauche de la barre.

---

## DÉCOMPTE

| Sévérité | Nombre | N° |
|---|---|---|
| BLOQUANT | **0** | — |
| MAJEUR | **7** | 1, 2, 3, 4, 5, 6, 7 |
| MINEUR | **12** | 8 → 19 |
| **Total** | **19** | |

Aucun BLOQUANT au sens « le lot ne compile pas / ne teste pas / perd une ligne P2 nommée » — le STOP de merge existant est celui du budget D4, correctement consigné et non levé. Les constats 1 à 4 sont néanmoins des dead-ends fonctionnels ou des régressions non consignées d'un correctif utilisateur daté : ils appellent une correction avant merge, pas une note.

---

## AXES BLANCHIS (avec preuve de vérification)

**A. Couleur = le PLAN, jamais un format.** `Plan2DView.swift:201-207` — `.fg` → `indigo300/indigo500`, `.content` → `indigo500/indigo600`, `.bg` → `indigo700/indigo800`, tous depuis `MeeshyColors.swift:10-15`. Les échos de boucle sont teintés `Plan2DView.color(for: .bg, …)` (`StoryTimelineHost.swift:356`). Les losanges utilisent `MeeshyColors.warning` = `#FBBF24` (`MeeshyColors.swift:45`), soit le jeton d'ÉTAT `--kf` des maquettes, explicitement autorisé (`views.html:14` : « *jetons d'ÉTAT des maquettes — jamais une couleur de format (U15)* »). Aucune couleur S/P/R/M ni `tint(for: track.kind)` dans le diff. *Réserve* : la garde `Plan2DViewGuardTests.swift:513-520` n'assert que la distinction des trois teintes — elle n'attraperait pas une palette de format. Le code est juste, la garde est faible.

**B. Aucun `.onChange` brut.** `git diff d36869973..HEAD -- 'packages/MeeshySDK/Sources/**' | grep '^+.*\.onChange('` → **0 résultat**.

**C. Graduation dérivée des libellés.** `Plan2DView.swift:222-227` délègue à `RulerView.tickInterval(for:)`, dont la constante est dérivée (`RulerView.swift:66` `minLabelSpacing { labelHalfWidth * 2 + 8 }`). Gardes : `Plan2DViewGuardTests.swift:72-79` (interdit un `tickLadder` local), `:81-87` (égalité avec `RulerView` au zoom équivalent), `:497-503` (le corps dessine réellement avec — `Plan2DView.swift:108-119`).

**D. `TimelineMetrics.laneHeight`, plus aucun littéral 52.** `grep -rn "laneHeight: 52\|: CGFloat = 52\|height: 52" …/Story/Timeline/` → **une seule occurrence**, `TimelineMetrics.swift:10`. Les 4 sites de l'ancien conteneur ont migré (`StoryTimelineView.swift:502/511/518/531`), gardé par `Plan2DViewGuardTests.swift:137-144` (exactement 4, et interdiction de `laneHeight: 52`). *Note hors périmètre* : `StoryTimelineView.swift:482` conserve un `* 56` (hauteur de rangée + espacement de l'ancien conteneur), non touché par le lot.

**E. Keyframes en temps ABSOLU — correctif `175d22ffb` complet sur les surfaces existantes.** `Plan2DLayout.swift:264-269` (`origin + Double($0.time)`) reproduit la projection déjà présente deux fois : `KeyframeMarkerResolver.swift:22-33` et `TimelineInspectorHost.swift:267/281` (`clipStart + kf.time`). Dessin (`Plan2DView.swift:153-158`) et hit-test (`:341-351`) passent tous deux par `Plan2DLayout.x` sur la même valeur absolue. **Il n'existe aucun drag/trim de losange à corriger** : l'ancien conteneur l'avait déjà neutralisé (`LaneKeyframeOverlays.swift:24-27` `onDragDelta: { _ in }` — « *Le déplacement temporel s'édite au KeyframeInspector — un drag cumulatif par frame dériverait* ») et le plan n'en propose pas. Le trou résiduel est le **routage audio** (constat 1), pas la projection.

**F. Repère unique règle / tête de lecture / chrome / barres.** `StoryTimelineHost.swift:198-212` calcule `equivalentGeometry` **une fois**, hissé au-dessus du chrome et du scroller, et le passe à `TransitionChromeLane` (`:222`), `RulerView` (`:239`), `PlayheadView` (`:326`) et `LoopRepeatOverlay` (`:357`). L'algèbre coïncide : `TimelineGeometry.x(t) = t × 50 × zoomScale` avec `zoomScale = (laneWidth × zoom.scale / slideDuration) / 50` ⇒ `laneWidth × zoom.scale × t / slideDuration` = `Plan2DLayout.x` (`Plan2DLayout.swift:133`). Gardé par `Plan2DViewGuardTests.swift:106-133`. (La seule échelle restée à l'écart est celle de l'aimant — constat 6.)

**G. Intégration : un seul point d'entrée de production, ancien conteneur réellement hors chemin.** `grep -rn "StoryTimelineHost(" --include="*.swift" .` → 1 site de production, `TimelineExportFlow.swift:326`, dans `TimelineSheetContent`, présenté par `StoryComposerView+Canvas.swift:1438` et `ComposerToolPanelHost.swift:261`. `grep -rn "StoryTimelineView(" --include="*.swift" .` → **zéro instanciation de production** ; les 6 fichiers de test qui le montent sont nommés un à un dans `StoryTimelineHost.swift:8-24`, avec la distinction correcte entre ceux qui l'INSTANCIENT (3 transverses + 3 propres) et ceux qui ne font que le citer, et la dette est nommée comme « chantier séparé ». Manifeste `TimelineExportFlow` épinglé par hash (`Plan2DIntegrationGuardTests.swift:345-353`).

**H. Catalogue 7 langues.** Diff des clés : **8 ajoutées, 0 retirée**, chacune avec `['ar','de','en','es','fr','it','pt-BR']`. Les 8 nouvelles + la clé réutilisée `story.timeline.track.section.bg.a11y` (déjà complète) sont toutes listées dans la garde `TimelineLocalizationTests.swift` (+12 lignes). Le décompte de la ligne P0 (« 2 clés `followSlide`/`.hint` » + « 6 clés neuves ») fait bien 8 — cohérent.

**I. Budget P15 « jamais une vue par keyframe ».** Un seul `Canvas {` (`Plan2DView.swift:105`), gardé (`Plan2DViewGuardTests.swift:41-46`) ; aucun `ForEach` sur `keyframeTimes` (garde `:48-55`). Le seul `ForEach` du fichier est celui, synthétique, de l'accessibilité, sur `tracks` (`:172`) — une vue par PISTE, jamais par keyframe. Les overlays de l'hôte sont bornés par le nombre de jonctions (`transitionJunctionOverlay`) et de fonds bouclés (`loopEchoOverlay`), pas par les keyframes.

**J. `snapCandidates: []` n'est PAS une régression.** L'ancien conteneur passait déjà `snapCandidates: []` (`d36869973:StoryTimelineView.swift:687-690`), et `dragClipMoved` complète lui-même la liste via `magneticSnapCandidates` (`TimelineViewModel.swift:319`). Le guide de snap magenta n'était donc alimenté que par ce même chemin. (Le défaut est l'échelle, constat 6, pas les candidats.)

**K. Mute par clip cohérent et non mort.** `toggleClipMute` persiste via `volume` (`Plan4Helpers.swift:274-307`, `probe.toggleMute()` puis `SetClipPropertyCommand(.volume(old:new:))`, annulable et rendant le niveau quitté) — l'icône du bouton, pilotée par `volume == 0` (`ClipInspector.swift:799`), est donc fidèle. Le bouton n'est rendu que dans la section volume, elle-même conditionnée par `hasAudioAffordances(kind:)` (`ClipInspector.swift:128` + `:424-429` : vrai pour `.video`/`.audio` seulement) — jamais un contrôle mort sur image/texte/sticker.

**L. Règle spéciale du lot D sur P0.** Le diff `views.html` du lot se limite à 6 lignes `<tr>` (1 retirée, 5 ajoutées) : camembert (`:238`), légendes (`:247-250`), encadré de lecture (`:307-311`) et les lignes des autres lots sont intacts. Règle respectée. (Sa conséquence documentaire = constat 13.)

**M. Pureté SDK.** `Plan2DView` ne prend que des valeurs opaques et des closures, ne référence ni `TimelineViewModel` ni `Views/Inspector` (garde `Plan2DViewGuardTests.swift:383-388`), et n'appelle aucun singleton nommé Meeshy. `Plan2DLayout`, `Plan2DProjectAdapter`, `Plan2DReorderResolver` sont des `nonisolated enum` purs (imports : `Foundation`/`CoreGraphics`/`MeeshySDK`). L'orchestration (`StoryTimelineHost`) occupe exactement la place où vivait déjà l'ancien conteneur dans `MeeshyUI` — aucune violation neuve introduite par le lot.

**N. Gate D5.** Vérifié conforme au plan : le commit `5b16fe1ab` ne touche qu'une ligne de doc, ne modifie ni `project.pbxproj` ni `project.yml` (`git diff --stat` = 1 fichier), et son message énonce explicitement que « *le gate D5 ne lève PAS le STOP budget consigné à la ligne D4* ». Plancher iOS 16 (`Package.swift:33`) et build vert rapportés.

**O. D4 — formulation finale du verdict.** La ligne P0 D4 est exacte après `bb979c93b` : elle nomme l'appareil mesuré comme un **plafond** (A18 Pro), donne l'extrapolation plancher (« *≈ ×3,16 → coût plancher estimé 5,1–8,0 ms/passe […] marge réelle estimée ≈ ×2,1-2,65 sous 16,7 ms, PAS ×8* »), qualifie l'extrapolation d'« *optimiste (GPU/bande mémoire du plancher non capturés)* », et conclut « *VERDICT BUDGET : STOP, remonté au porteur produit* » en citant le plan D4 Step 2 mot pour mot. Le seuil du banc a bien été recalé de 0,05 s à 0,01 s dans le même commit (`Plan2DRenderMeasureTests.swift:96`), et les commentaires distinguent explicitement garde de régression et budget d'usage. **Le STOP de lot n'est donc ni levé ni contourné** — il est correctement documenté et répété en ligne D5. (La qualité du banc lui-même = constat 14.)
