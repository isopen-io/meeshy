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
    public let onSelectTrack: (String) -> Void
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

    public init(tracks: [Plan2DTrack],
                zoom: Plan2DZoom,
                laneWidth: CGFloat,
                slideDuration: Double,
                isDark: Bool,
                onSelectTrack: @escaping (String) -> Void,
                onReorder: @escaping (String, Int) -> Void,
                onTrimStart: @escaping (String, Double) -> Void,
                onTrimEnd: @escaping (String, Double) -> Void) {
        self.tracks = tracks
        self.zoom = zoom
        self.laneWidth = laneWidth
        self.slideDuration = slideDuration
        self.isDark = isDark
        self.onSelectTrack = onSelectTrack
        self.onReorder = onReorder
        self.onTrimStart = onTrimStart
        self.onTrimEnd = onTrimEnd
    }

    // MARK: - Geste en vol (armement du réordonnancement, trim en cours)

    @State private var gestureStartedAt: Date?
    @State private var gestureStartRow: Int?
    @State private var gestureEdge: Edge?
    @State private var isReorderArmed: Bool = false
    @State private var lastPlaneCrossingRow: Int?
    @State private var lastTrimTranslationX: CGFloat = 0

    public var body: some View {
        Canvas { context, size in
            let laneHeight = TimelineMetrics.laneHeight
            for (index, track) in tracks.enumerated() {
                let rowY = CGFloat(index) * laneHeight
                let planeColor = Self.color(for: track.plane, isDark: isDark)

                context.fill(Path(CGRect(x: 0, y: rowY, width: size.width, height: laneHeight)),
                            with: .color(planeColor.opacity(0.06)))

                context.draw(
                    Text(track.label)
                        .font(.caption)
                        .foregroundColor(isDark ? .white : .black),
                    at: CGPoint(x: 10, y: rowY + laneHeight / 2),
                    anchor: .leading
                )

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
                    let bar = CGRect(x: startX, y: rowY + 8,
                                     width: max(2, endX - startX), height: laneHeight - 16)
                    context.fill(Path(roundedRect: bar, cornerRadius: 6), with: .color(planeColor))
                }

                for time in track.keyframeTimes {
                    let x = Self.x(forTime: time, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                    let diamond = Self.diamondPath(center: CGPoint(x: x, y: rowY + laneHeight / 2), radius: 5)
                    context.fill(diamond, with: .color(MeeshyColors.warning))
                    context.stroke(diamond, with: .color(.black.opacity(0.55)), lineWidth: 0.8)
                }
            }
        }
        .frame(width: Self.labelColumnWidth + laneWidth * zoom.scale,
              height: CGFloat(tracks.count) * TimelineMetrics.laneHeight)
        .contentShape(Rectangle())
        .simultaneousGesture(rowGesture)
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
    private static func x(forTime t: Double, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> CGFloat {
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

    // MARK: - Gestes (rév. 2, M11)

    enum Edge: Equatable { case start, end }

    /// Même seuil que le hold du viseur de capture (P9) — 0,45 s — pour que
    /// l'appui long garde UN seul sens appris dans tout le composer.
    static let reorderArmDuration: TimeInterval = 0.45
    /// Tolérance de doigt avant qu'un mouvement ne soit plus considéré comme
    /// un tap/une tenue immobile — même valeur que le slop de capture (P9).
    static let reorderSlop: CGFloat = 24
    /// Cible tappable minimale (HIG) — les poignées de bord la réclament
    /// TOUJOURS, y compris quand la barre visuelle est bien plus étroite
    /// (la zone déborde alors hors de la barre).
    static let edgeHandleMinHitWidth: CGFloat = 44

    static func withinSlop(_ translation: CGSize) -> Bool {
        abs(translation.width) <= reorderSlop && abs(translation.height) <= reorderSlop
    }

    /// Rangée touchée par un point Y — `nil` hors du plan (au-dessus de la
    /// première piste ou sous la dernière), jamais un index hors bornes.
    static func rowIndex(forY y: CGFloat, laneHeight: CGFloat, trackCount: Int) -> Int? {
        guard laneHeight > 0, trackCount > 0, y >= 0 else { return nil }
        let index = Int(y / laneHeight)
        guard index >= 0, index < trackCount else { return nil }
        return index
    }

    /// Cran net (M11) : vrai seulement quand la piste quittée et la piste
    /// atteinte ne portent pas le MÊME plan — traverser deux pistes du même
    /// plan ne déclenche rien.
    static func crossedPlaneBoundary(from: Int, to: Int, tracks: [Plan2DTrack]) -> Bool {
        guard tracks.indices.contains(from), tracks.indices.contains(to) else { return false }
        return tracks[from].plane != tracks[to].plane
    }

    /// Poignée de bord touchée, si `touchX` tombe dans sa zone tappable
    /// (≥ 44 pt, débordante hors de la barre visuelle). Une piste fantôme
    /// n'a pas de bord à tirer — elle n'a pas de durée choisie (O4).
    static func edgeHandle(touchX: CGFloat, track: Plan2DTrack,
                           zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Edge? {
        guard case let .timed(start, end) = track.bar else { return nil }
        let startX = x(forTime: start, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let endX = x(forTime: end, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let half = edgeHandleMinHitWidth / 2
        if abs(touchX - startX) <= half { return .start }
        if abs(touchX - endX) <= half { return .end }
        return nil
    }

    /// Delta de temps (secondes) pour un delta de pixels ANCRÉ au geste —
    /// inverse ponctuel de `Plan2DLayout.x`, gardé côté vue (D1 est gelé).
    static func timeDelta(forDeltaX deltaX: CGFloat, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Double {
        guard laneWidth > 0, zoom.scale > 0 else { return 0 }
        return Double(deltaX / (laneWidth * zoom.scale)) * slideDuration
    }

    private var rowGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged(handleChanged)
            .onEnded(handleEnded)
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
            gestureEdge = row.flatMap { idx -> Edge? in
                guard tracks.indices.contains(idx) else { return nil }
                return Self.edgeHandle(touchX: value.startLocation.x, track: tracks[idx],
                                      zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
            }
        }

        guard let startRow = gestureStartRow, tracks.indices.contains(startRow) else { return }
        let track = tracks[startRow]

        if let edge = gestureEdge {
            let deltaX = value.translation.width - lastTrimTranslationX
            lastTrimTranslationX = value.translation.width
            let deltaSeconds = Self.timeDelta(forDeltaX: deltaX, zoom: zoom,
                                              laneWidth: laneWidth, slideDuration: slideDuration)
            switch edge {
            case .start: onTrimStart(track.id, deltaSeconds)
            case .end: onTrimEnd(track.id, deltaSeconds)
            }
            return
        }

        guard let startedAt = gestureStartedAt else { return }
        if !isReorderArmed {
            guard Self.withinSlop(value.translation) else { return }
            guard Date().timeIntervalSince(startedAt) >= Self.reorderArmDuration else { return }
            isReorderArmed = true
            HapticFeedback.light()
        }

        let currentRow = Self.rowIndex(forY: value.location.y,
                                       laneHeight: TimelineMetrics.laneHeight,
                                       trackCount: tracks.count) ?? startRow
        if currentRow != lastPlaneCrossingRow {
            if Self.crossedPlaneBoundary(from: lastPlaneCrossingRow ?? startRow, to: currentRow, tracks: tracks) {
                #if canImport(UIKit) && os(iOS)
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                #endif
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
        }
        guard let startRow = gestureStartRow, tracks.indices.contains(startRow) else { return }
        guard gestureEdge == nil else { return }

        guard isReorderArmed else {
            if Self.withinSlop(value.translation) {
                onSelectTrack(tracks[startRow].id)
            }
            return
        }

        let endRow = Self.rowIndex(forY: value.location.y,
                                   laneHeight: TimelineMetrics.laneHeight,
                                   trackCount: tracks.count) ?? startRow
        if endRow != startRow {
            onReorder(tracks[startRow].id, endRow)
        }
    }
}
