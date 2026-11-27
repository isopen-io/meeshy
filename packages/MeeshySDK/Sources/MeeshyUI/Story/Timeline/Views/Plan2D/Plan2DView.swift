import SwiftUI
import MeeshySDK
#if canImport(UIKit)
import UIKit
#endif

/// LE plan (P8) : vertical = empilement (l'ordre de `tracks` EST l'ordre à
/// l'écran, borné par les trois plans — c'est `Plan2DLayout`, D1, gelé, qui
/// le calcule), horizontal = durée. Dessiné en UN PASSE `Canvas` — jamais une
/// vue par piste ni une vue par keyframe (budget P15) : les barres, les
/// cadres pointillés des fantômes (O4) et les losanges de keyframes AFFICHÉS
/// (édités à l'Inspecteur existant, S4) sont des TRAITS, pas des sous-vues.
///
/// Une fois ARMÉ (appui court puis glisser, ou glissement horizontal franc
/// sur une piste), le geste sert UN axe et un seul, élu à la dominante :
/// vertical = empilement (`onReorder`), horizontal = durée (`onMove`). Les
/// deux axes sont ceux du plan, jamais ceux d'un même geste — un
/// réordonnancement au doigt n'a pas à décaler le clip dans le temps. Le
/// glissement vertical NU, lui, appartient au scroller.
///
/// Pure vue de dessin + geste : elle ne connaît ni `TimelineViewModel` ni
/// `Views/Inspector` — le tap appelle `onSelectTrack`, à l'appelant (D3)
/// d'ouvrir l'Inspecteur existant. C'est délibéré (le SDK fournit
/// l'atome, l'orchestration produit reste à l'appelant).
public struct Plan2DView: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual/data props only)
    public static func == (lhs: Plan2DView, rhs: Plan2DView) -> Bool {
        lhs.tracks == rhs.tracks
            && lhs.zoom == rhs.zoom
            && lhs.slideDuration == rhs.slideDuration
            && lhs.laneWidth == rhs.laneWidth
            && lhs.isDark == rhs.isDark
            && lhs.selectedTrackId == rhs.selectedTrackId
    }

    public let tracks: [Plan2DTrack]
    public let zoom: Plan2DZoom
    /// Largeur de la lane au zoom `.fit` — le VIEWPORT, pas la largeur totale
    /// du contenu. `Plan2DLayout.x` la multiplie par `zoom.scale` en interne :
    /// au zoom `.detail` le contenu dessiné dépasse ce viewport (l'appelant
    /// l'encadre dans un scroll horizontal).
    public let laneWidth: CGFloat
    public let slideDuration: Double
    public let isDark: Bool
    /// La piste sélectionnée — surlignée dans le Canvas (revue Opus, constat
    /// 4 : sans cette entrée dans `==`, un `selectedClipId` changé ne
    /// redessinait jamais le plan). `nil` = rien de sélectionné. Décide aussi
    /// si la piste montre ses poignées de bord (constat 3 — parité
    /// `ClipTrimHandles.shouldShow(isSelected:isLocked:)`, le trim exige la
    /// sélection préalable).
    public let selectedTrackId: String?
    public let onSelectTrack: (String) -> Void
    /// Un tap qui TOMBE sur un losange AFFICHÉ (`Plan2DKeyframe`, dans le
    /// rayon `keyframeHitRadius`) route ICI plutôt que vers `onSelectTrack` —
    /// S4 : l'édition n'a pas lieu dans le plan, mais encore faut-il pouvoir
    /// DÉSIGNER un keyframe précis ; l'appelant décide de ce qu'il en fait.
    public let onSelectKeyframe: (String) -> Void
    /// La piste `id` a été déposée à l'index `Int` — un entier dans l'espace
    /// de `tracks` (toutes plans confondus), pas un z relatif à un plan :
    /// c'est à l'appelant (au-delà de D2) de traduire cette position en
    /// mutation de plan/z sur le modèle.
    public let onReorder: (String, Int) -> Void
    /// Delta de bord en SECONDES (déjà converti depuis le geste — l'appelant
    /// n'a pas à connaître `laneWidth`/`zoom`). Incrémental, jamais cumulé :
    /// même piège que `ClipTrimHandles`, mêmes deltas ancrés au geste.
    public let onTrimStart: (String, Double) -> Void
    public let onTrimEnd: (String, Double) -> Void
    /// Déplacement TEMPOREL de la piste, en secondes CUMULÉES depuis le début
    /// du geste (jamais incrémental, contrairement au trim) : l'appelant
    /// reconstruit le temps depuis l'origine capturée au premier appel, la
    /// parade anti-dérive « boule de neige » déjà en place sur les barres de
    /// l'ancien conteneur.
    public let onMove: (String, Double) -> Void
    /// Le doigt a quitté l'écran après un déplacement — clôt la session de
    /// glissement côté appelant.
    public let onMoveEnded: (String) -> Void
    /// Le plan TIENT le geste (trim d'un bord, ou déplacement/réordonnancement
    /// armé) : à l'appelant d'immobiliser le scroller qui l'entoure le temps
    /// du geste. Sans ce signal, le contenu panne sous le doigt pendant que la
    /// barre se rogne — les deux se disputent le même doigt (constat 5).
    public let onScrollLockChanged: (Bool) -> Void

    public init(tracks: [Plan2DTrack],
                zoom: Plan2DZoom,
                laneWidth: CGFloat,
                slideDuration: Double,
                isDark: Bool,
                selectedTrackId: String?,
                onSelectTrack: @escaping (String) -> Void,
                onSelectKeyframe: @escaping (String) -> Void,
                onReorder: @escaping (String, Int) -> Void,
                onTrimStart: @escaping (String, Double) -> Void,
                onTrimEnd: @escaping (String, Double) -> Void,
                onMove: @escaping (String, Double) -> Void,
                onMoveEnded: @escaping (String) -> Void,
                onScrollLockChanged: @escaping (Bool) -> Void) {
        self.tracks = tracks
        self.zoom = zoom
        self.laneWidth = laneWidth
        self.slideDuration = slideDuration
        self.isDark = isDark
        self.selectedTrackId = selectedTrackId
        self.onSelectTrack = onSelectTrack
        self.onSelectKeyframe = onSelectKeyframe
        self.onReorder = onReorder
        self.onTrimStart = onTrimStart
        self.onTrimEnd = onTrimEnd
        self.onMove = onMove
        self.onMoveEnded = onMoveEnded
        self.onScrollLockChanged = onScrollLockChanged
    }

    // MARK: - Geste en vol (armement du réordonnancement, trim en cours)

    @State private var gestureStartedAt: Date?
    @State private var gestureStartRow: Int?
    @State private var gestureEdge: Edge?
    @State private var isReorderArmed: Bool = false
    @State private var lastPlaneCrossingRow: Int?
    @State private var lastTrimTranslationX: CGFloat = 0
    @State private var isMoving: Bool = false
    /// Axe ÉLU pour ce geste — `nil` tant que le doigt n'a pas quitté la zone
    /// morte. Élu une fois, il tient jusqu'au relâchement.
    @State private var lockedAxis: DragAxis?
    /// Translation observée à l'ARMEMENT : c'est l'origine des secondes
    /// rendues à l'appelant, jamais le touch-down.
    @State private var moveAnchor: CGSize = .zero
    /// Le doigt fait défiler : le plan a rendu la main et ne la reprend pas.
    @State private var hasYieldedToScroller: Bool = false
    @State private var isScrollLocked: Bool = false

    public var body: some View {
        Canvas { context, size in
            let laneHeight = TimelineMetrics.laneHeight

            let interval = Self.tickInterval(laneWidth: laneWidth, zoom: zoom, slideDuration: slideDuration)
            if slideDuration > 0, interval > 0 {
                let tickCount = max(1, Int((slideDuration / interval).rounded(.up)) + 1)
                let gridColor: Color = isDark ? .white.opacity(0.08) : .black.opacity(0.06)
                for i in 0..<tickCount {
                    let t = Double(i) * interval
                    let x = Self.x(forTime: t, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                    var gridLine = Path()
                    gridLine.move(to: CGPoint(x: x, y: 0))
                    gridLine.addLine(to: CGPoint(x: x, y: size.height))
                    context.stroke(gridLine, with: .color(gridColor), lineWidth: MeeshyBorder.hairline)
                }
            }

            for (index, track) in tracks.enumerated() {
                let rowY = CGFloat(index) * laneHeight
                let planeColor = Self.color(for: track.plane, isDark: isDark)
                let isSelected = track.id == selectedTrackId

                context.fill(Path(CGRect(x: 0, y: rowY, width: size.width, height: laneHeight)),
                            with: .color(planeColor.opacity(0.06)))

                // Écrêté à la colonne d'étiquette (mineur 16, revue Opus) —
                // `drawLayer` scope le clip à CE dessin seul : les barres et
                // losanges dessinés après, hors de la colonne, n'en héritent
                // jamais (contrairement à un `context.clip(to:)` posé sur le
                // contexte principal, qui resterait actif pour tout le reste
                // du passe).
                context.drawLayer { layerContext in
                    layerContext.clip(to: Path(CGRect(x: 0, y: rowY, width: Self.labelColumnWidth, height: laneHeight)))
                    layerContext.draw(
                        Self.labelText(for: track, isDark: isDark),
                        at: CGPoint(x: 10, y: rowY + laneHeight / 2),
                        anchor: .leading
                    )
                }

                switch track.bar {
                case .ghost:
                    let frame = CGRect(x: Self.labelColumnWidth + 4, y: rowY + 6,
                                       width: max(0, laneWidth * zoom.scale - 8),
                                       height: laneHeight - 12)
                    context.stroke(Path(roundedRect: frame, cornerRadius: 8),
                                   with: .color(planeColor),
                                   style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
                case .timed(let start, let end):
                    let startX = Self.x(forTime: start, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                    let endX = Self.x(forTime: end, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                    let bar = CGRect(x: startX, y: rowY + Self.barVerticalInset,
                                     width: max(2, endX - startX), height: laneHeight - Self.barVerticalInset * 2)
                    context.fill(Path(roundedRect: bar, cornerRadius: 6), with: .color(planeColor))
                }

                for time in track.keyframeTimes {
                    let x = Self.x(forTime: time, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                    let diamond = Self.diamondPath(center: CGPoint(x: x, y: rowY + laneHeight / 2), radius: 5)
                    context.fill(diamond, with: .color(MeeshyColors.warning))
                    context.stroke(diamond, with: .color(.black.opacity(0.55)), lineWidth: 0.8)
                }

                // Même jeton que l'ancien conteneur (`TrackBarView.laneBackground`,
                // `MeeshyColors.indigo400.opacity(0.55)`) — sans ce trait, un
                // `selectedClipId` changé restait invisible (revue Opus, constat 4).
                if isSelected {
                    let laneFrame = CGRect(x: Self.labelColumnWidth, y: rowY,
                                           width: laneWidth * zoom.scale, height: laneHeight)
                    context.stroke(Path(laneFrame), with: .color(MeeshyColors.indigo400.opacity(0.55)),
                                   lineWidth: 2)
                }
            }
        }
        .frame(width: Self.labelColumnWidth + laneWidth * zoom.scale,
              height: CGFloat(tracks.count) * TimelineMetrics.laneHeight)
        .contentShape(Rectangle())
        // Les poignées AVANT le geste de rangée : posées après lui, elles
        // seraient ses SŒURS et avaleraient le tap d'un bord (la fiche du clip
        // redeviendrait inatteignable sur toute barre étroite). Posées avant,
        // le geste de rangée les surplombe et continue de voir le contact,
        // pendant que la poignée garde sa haute priorité face au scroller.
        .overlay(alignment: .topLeading) { edgeHandleLayer }
        .simultaneousGesture(rowGesture)
        .accessibilityElement(children: .contain)
        // Éléments SYNTHÉTIQUES : `accessibilityChildren` ne rend rien à
        // l'écran, il ne fait que découper l'élément unique du `Canvas` en
        // une rangée par piste. Le budget P15 (jamais une vue par keyframe)
        // reste intact — ces enfants ne coûtent aucun dessin.
        .accessibilityChildren {
            VStack(spacing: 0) {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    Color.clear
                        .frame(height: TimelineMetrics.laneHeight)
                        .modifier(Plan2DTrackAccessibilityModifier(plan: self, track: track, index: index, label: Self.accessibilityLabel(for: track)))
                }
            }
        }
    }

    /// Libellé de piste, préfixé du MÊME badge cadenas que l'ancien
    /// conteneur (`TrackBarView.label`, `Image(systemName: "lock.fill")`
    /// teinté `MeeshyColors.warning`) quand la piste est verrouillée (revue
    /// Opus, constat 3). Un seul `Text` concaténé — le badge est un TRAIT du
    /// même passe `Canvas`, jamais une sous-vue (budget P15).
    private static func labelText(for track: Plan2DTrack, isDark: Bool) -> Text {
        let name = Text(track.label).foregroundColor(isDark ? .white : .black)
        guard track.isLocked else { return name.font(.caption) }
        let lock = Text(Image(systemName: "lock.fill")).foregroundColor(MeeshyColors.warning)
        return (lock + Text(" ") + name).font(.caption)
    }

    private static func diamondPath(center: CGPoint, radius: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: center.x, y: center.y - radius))
        path.addLine(to: CGPoint(x: center.x + radius, y: center.y))
        path.addLine(to: CGPoint(x: center.x, y: center.y + radius))
        path.addLine(to: CGPoint(x: center.x - radius, y: center.y))
        path.closeSubpath()
        return path
    }

    /// x en points DANS LE CANVAS (colonne d'étiquette incluse) — décale de
    /// `labelColumnWidth` la coordonnée pure que rend `Plan2DLayout.x`.
    static func x(forTime t: Double, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> CGFloat {
        labelColumnWidth + Plan2DLayout.x(forTime: t, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
    }

    /// Couleur PAR PLAN — jamais par format ni par kind (revue totale U15).
    /// Un seul dégradé du jeton de marque : le premier plan (le plus près du
    /// spectateur) porte la teinte la plus claire, le fond la plus profonde.
    static func color(for plane: TrackPlane, isDark: Bool) -> Color {
        switch plane {
        case .fg: return isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo500
        case .content: return isDark ? MeeshyColors.indigo500 : MeeshyColors.indigo600
        case .bg: return isDark ? MeeshyColors.indigo700 : MeeshyColors.indigo800
        }
    }

    // MARK: - Marge verticale d'une barre `.timed` — partagée avec l'écho de boucle

    /// Marge haut/bas d'une barre `.timed` dans sa lane (`laneHeight`) — UNE
    /// seule source pour le dessin de la barre elle-même (ci-dessus) et pour
    /// `loopEchoVerticalFrame`. Sans elle, les deux dérivaient chacune de son
    /// côté : les tuiles d'écho de boucle (marge 0/hauteur `laneHeight - 4`,
    /// alignées TOP) ne tombaient plus sur la fenêtre `[rowY + 8, rowY + 44]`
    /// de la barre qu'elles prolongent (mineur 17, revue Opus).
    static let barVerticalInset: CGFloat = 8

    /// Fenêtre verticale qu'un écho de boucle doit occuper pour tomber
    /// EXACTEMENT sur la barre `.timed` qu'il prolonge visuellement.
    static func loopEchoVerticalFrame(laneHeight: CGFloat) -> (topInset: CGFloat, height: CGFloat) {
        (barVerticalInset, laneHeight - barVerticalInset * 2)
    }

    // MARK: - Graduation — réutilise la dérivation par largeur de libellé de RulerView

    /// Colonne d'étiquette collante — MÊME constante que le conteneur
    /// mono-piste (`TrackBarView.labelColumnWidth`) : une seule source, pas
    /// un second littéral 84 qui dériverait avec le temps.
    static var labelColumnWidth: CGFloat { TrackBarView<AnyView>.labelColumnWidth }

    /// Intervalle de graduation à la densité de pixels ACTUELLE du plan
    /// (`laneWidth` × `zoom.scale` / `slideDuration`), converti en
    /// zoom-équivalent vis-à-vis de `TimelineGeometry.basePixelsPerSecond`
    /// puis délégué à `RulerView.tickInterval(for:)` — la dérivation par
    /// largeur de libellé (`RulerView.swift:58/64/105`) vit à UN seul
    /// endroit, jamais redéclarée ici.
    static func tickInterval(laneWidth: CGFloat, zoom: Plan2DZoom, slideDuration: Double) -> Double {
        guard slideDuration > 0, laneWidth > 0 else { return RulerView.tickLadder.last ?? 1 }
        let pixelsPerSecond = laneWidth * zoom.scale / CGFloat(slideDuration)
        let equivalentZoom = pixelsPerSecond / TimelineGeometry.basePixelsPerSecond
        return RulerView.tickInterval(for: equivalentZoom)
    }

    /// `TimelineGeometry` ÉQUIVALENTE à la densité de pixels actuelle du plan
    /// — même conversion que `tickInterval` ci-dessus, exposée pour que
    /// l'appelant (D3) puisse RÉUTILISER `RulerView` (mapping temps→x
    /// continu, geste de scrub déjà construit et testé) comme règle
    /// et tête de lecture du plan, sans jamais désynchroniser leur repère de
    /// celui que `Plan2DLayout.x` fait autorité sur les barres/losanges.
    static func equivalentGeometry(laneWidth: CGFloat, zoom: Plan2DZoom, slideDuration: Double) -> TimelineGeometry {
        guard slideDuration > 0, laneWidth > 0 else { return TimelineGeometry(zoomScale: 0.05) }
        let pixelsPerSecond = laneWidth * zoom.scale / CGFloat(slideDuration)
        return TimelineGeometry(zoomScale: pixelsPerSecond / TimelineGeometry.basePixelsPerSecond)
    }

    // MARK: - Accessibilité : une piste = un élément, préfixé par son plan

    /// Libellé VoiceOver d'une piste — MÊME composition que
    /// `TrackBarView.accessibilityComposedLabel` de l'ancien conteneur : le
    /// PRÉFIXE DE SECTION d'abord (ici le plan, la seule sémantique du plan
    /// 2D), puis le nom de la piste, puis ce qu'elle occupe dans le temps,
    /// puis — verrouillée — un suffixe LOCALISÉ (revue Opus constat 3 ;
    /// routage catalogue ajouté en revue DoD sur D6b — la première version
    /// codait ce suffixe en dur en français, contrairement aux DEUX autres
    /// composants de cette même fonction, déjà routés par `Bundle.module`.
    /// L'ancien conteneur, lui, codait le même littéral en dur
    /// (`TrackBarView.accessibilityComposedLabel:73`), mais ce chemin est
    /// mort en production — cf. axe G de la revue —, alors que celui-ci est
    /// le seul plan vivant : ici, la chaîne se rend réellement à
    /// l'utilisateur). Un `Canvas` n'est qu'un seul élément
    /// d'accessibilité : sans cette composition rendue par
    /// `accessibilityChildren`, le plan entier s'annoncerait comme un dessin
    /// muet.
    static func accessibilityLabel(for track: Plan2DTrack) -> String {
        let occupation: String
        switch track.bar {
        case .ghost:
            occupation = String(localized: "story.timeline.plan.track.followsSlide.a11y",
                                defaultValue: "Suit la slide", bundle: .module)
        case .timed(let start, let end):
            occupation = TrackBarView<AnyView>.formatTrackDuration(Float(end - start))
        }
        let lockSuffix = track.isLocked
            ? String(localized: "story.timeline.plan.track.locked.a11y",
                     defaultValue: " (verrouillée)", bundle: .module)
            : ""
        return "\(planeLabel(track.plane)) — \(track.label) — \(occupation)\(lockSuffix)"
    }

    /// Nom du plan, tel que VoiceOver l'annonce en tête de chaque piste. Le
    /// FOND réutilise la clé de section de l'ancien conteneur
    /// (`TrackBarView.accessibilityComposedLabel`) : une seule source pour un
    /// seul mot.
    static func planeLabel(_ plane: TrackPlane) -> String {
        switch plane {
        case .fg:
            return String(localized: "story.timeline.plan.plane.fg.a11y",
                          defaultValue: "Premier plan", bundle: .module)
        case .content:
            return String(localized: "story.timeline.plan.plane.content.a11y",
                          defaultValue: "Contenu", bundle: .module)
        case .bg:
            return String(localized: "story.timeline.track.section.bg.a11y",
                          defaultValue: "Fond", bundle: .module)
        }
    }

    private var rowGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged(handleChanged)
            .onEnded(handleEnded)
    }

    /// Les cibles de rognage, posées sur les bords des barres. Elles ne
    /// dessinent RIEN (le Canvas a déjà tout dessiné) : ce sont des zones
    /// tappables, bornées par le nombre de pistes TIMÉES — jamais par les
    /// keyframes (budget P15 intact).
    ///
    /// Elles existent comme vues, et non comme un test de plus dans le geste
    /// de rangée, parce que la HAUTE priorité ne s'obtient qu'ainsi sans
    /// confisquer au scroller tous les glissements du plan : la même raison
    /// qui donnait à l'ancien conteneur ses `ClipTrimHandles`.
    private var edgeHandleLayer: some View {
        ForEach(Self.edgeHandleZones(tracks: tracks, selectedTrackId: selectedTrackId, zoom: zoom,
                                     laneWidth: laneWidth, slideDuration: slideDuration)) { zone in
            Color.clear
                .frame(width: max(0, zone.width), height: TimelineMetrics.laneHeight - 16)
                .contentShape(Rectangle())
                .highPriorityGesture(trimGesture(for: zone))
                .offset(x: zone.minX,
                        y: CGFloat(zone.rowIndex) * TimelineMetrics.laneHeight + 8)
        }
    }

    /// `minimumDistance: 4` laisse passer les taps, qui ne translatent pas :
    /// un contact posé sur un bord et relâché sans bouger reste un tap, et
    /// c'est le geste de rangée qui l'ouvre à l'Inspecteur.
    private func trimGesture(for zone: EdgeHandleZone) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                setScrollLock(true)
                let deltaX = value.translation.width - lastTrimTranslationX
                lastTrimTranslationX = value.translation.width
                let deltaSeconds = Self.timeDelta(forDeltaX: deltaX, zoom: zoom,
                                                  laneWidth: laneWidth, slideDuration: slideDuration)
                switch zone.edge {
                case .start: onTrimStart(zone.trackId, deltaSeconds)
                case .end: onTrimEnd(zone.trackId, deltaSeconds)
                }
            }
            .onEnded { _ in
                lastTrimTranslationX = 0
                setScrollLock(false)
            }
    }

    /// Idempotent : deux frames de suite ne repostent pas le même verrou, et
    /// un geste qui n'a rien pris ne réveille pas l'hôte au relâchement.
    private func setScrollLock(_ locked: Bool) {
        guard isScrollLocked != locked else { return }
        isScrollLocked = locked
        onScrollLockChanged(locked)
    }

    private func handleChanged(_ value: DragGesture.Value) {
        if gestureStartedAt == nil {
            gestureStartedAt = Date()
            let row = Self.rowIndex(forY: value.startLocation.y,
                                    laneHeight: TimelineMetrics.laneHeight,
                                    trackCount: tracks.count)
            gestureStartRow = row
            lastPlaneCrossingRow = row
            lastTrimTranslationX = 0
            isReorderArmed = false
            isMoving = false
            lockedAxis = nil
            moveAnchor = .zero
            hasYieldedToScroller = false
            gestureEdge = row.flatMap { idx -> Edge? in
                guard tracks.indices.contains(idx) else { return nil }
                return Self.edgeHandle(touchX: value.startLocation.x, track: tracks[idx],
                                      isSelected: tracks[idx].id == selectedTrackId,
                                      zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
            }
        }

        guard let startRow = gestureStartRow, tracks.indices.contains(startRow) else { return }
        let track = tracks[startRow]

        // Le contact a commencé dans une zone de poignée : le trim appartient
        // à SA poignée, en haute priorité (grammaire du module). La rangée se
        // tait — la streamer ici aussi doublerait la mutation.
        guard gestureEdge == nil else { return }

        guard let startedAt = gestureStartedAt, !hasYieldedToScroller else { return }
        if !isReorderArmed {
            switch Self.armDecision(translation: value.translation,
                                    elapsed: Date().timeIntervalSince(startedAt)) {
            case .wait:
                return
            case .yieldToScroller:
                hasYieldedToScroller = true
                return
            // L'haptique marque le moment où le PLAN prend le geste — le seul
            // que cette vue puisse observer. Un doigt strictement immobile
            // n'émet aucune frame : prétendre signaler l'instant des 0,45 s
            // demanderait une horloge que ce geste n'a pas.
            case .arm(let axis):
                isReorderArmed = true
                HapticFeedback.light()
                lockedAxis = axis
                moveAnchor = value.translation
                setScrollLock(true)
            }
        }

        let sinceArm = CGSize(width: value.translation.width - moveAnchor.width,
                              height: value.translation.height - moveAnchor.height)
        if lockedAxis == nil { lockedAxis = Self.dominantAxis(sinceArm) }

        if let seconds = Self.moveDelta(translationSinceArm: sinceArm, axis: lockedAxis,
                                        gestureEdge: gestureEdge,
                                        isReorderArmed: isReorderArmed, track: track,
                                        zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration) {
            isMoving = true
            onMove(track.id, seconds)
        }

        // Le cran de franchissement annonce un CHANGEMENT DE PLAN à venir : sur
        // un geste élu horizontal, qui ne réordonne rien, il annoncerait une
        // mutation qui n'arrivera pas.
        guard lockedAxis != .horizontal else { return }
        let currentRow = Self.rowIndex(forY: value.location.y,
                                       laneHeight: TimelineMetrics.laneHeight,
                                       trackCount: tracks.count) ?? startRow
        if currentRow != lastPlaneCrossingRow {
            if Self.crossedPlaneBoundary(from: lastPlaneCrossingRow ?? startRow, to: currentRow, tracks: tracks) {
                HapticFeedback.rigid()
            }
            lastPlaneCrossingRow = currentRow
        }
    }

    private func handleEnded(_ value: DragGesture.Value) {
        defer {
            gestureStartedAt = nil
            gestureStartRow = nil
            gestureEdge = nil
            isReorderArmed = false
            lastPlaneCrossingRow = nil
            lastTrimTranslationX = 0
            isMoving = false
            lockedAxis = nil
            moveAnchor = .zero
            hasYieldedToScroller = false
            setScrollLock(false)
        }
        guard let startRow = gestureStartRow, tracks.indices.contains(startRow) else { return }
        if isMoving { onMoveEnded(tracks[startRow].id) }

        let endRow = Self.rowIndex(forY: value.location.y,
                                   laneHeight: TimelineMetrics.laneHeight,
                                   trackCount: tracks.count) ?? startRow

        switch Self.gestureOutcome(translation: value.translation, gestureEdge: gestureEdge,
                                   isReorderArmed: isReorderArmed, axis: lockedAxis,
                                   startRow: startRow, endRow: endRow) {
        case .select:
            switch Self.tapTarget(touchX: value.location.x, track: tracks[startRow],
                                  zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration) {
            case .keyframe(let keyframeId): onSelectKeyframe(keyframeId)
            case .track: onSelectTrack(tracks[startRow].id)
            }
        case .reorder(let to):
            onReorder(tracks[startRow].id, to)
        case .none:
            break
        }
    }
}
