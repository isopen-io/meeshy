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
    /// S4 : l'édition reste à l'Inspecteur existant (`KeyframeInspector`),
    /// mais encore faut-il pouvoir DÉSIGNER un keyframe précis.
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
                    context.stroke(gridLine, with: .color(gridColor), lineWidth: 0.5)
                }
            }

            for (index, track) in tracks.enumerated() {
                let rowY = CGFloat(index) * laneHeight
                let planeColor = Self.color(for: track.plane, isDark: isDark)
                let isSelected = track.id == selectedTrackId

                context.fill(Path(CGRect(x: 0, y: rowY, width: size.width, height: laneHeight)),
                            with: .color(planeColor.opacity(0.06)))

                context.draw(
                    Self.labelText(for: track, isDark: isDark),
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
                ForEach(tracks) { track in
                    Color.clear
                        .frame(height: TimelineMetrics.laneHeight)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(Self.accessibilityLabel(for: track))
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

    /// `TimelineGeometry` ÉQUIVALENTE à la densité de pixels actuelle du plan
    /// — même conversion que `tickInterval` ci-dessus, exposée pour que
    /// l'appelant (D3) puisse RÉUTILISER `RulerView`/`PlayheadView` (mapping
    /// temps→x continu, geste de scrub déjà construit et testé) comme règle
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

    // MARK: - Gestes (rév. 2, M11)

    /// `nonisolated` pour la même raison que `GestureOutcome` plus bas : la
    /// conformance `Equatable` synthétisée serait sinon isolée au `MainActor`
    /// et ni `EdgeHandleZone` ni les bancs ne pourraient comparer deux bords.
    nonisolated enum Edge: Equatable { case start, end }

    /// Même seuil que le hold du viseur de capture (P9) — 0,45 s — pour que
    /// l'appui long garde UN seul sens appris dans tout le composer.
    static let reorderArmDuration: TimeInterval = 0.45
    /// Tolérance de doigt avant qu'un mouvement ne soit plus considéré comme
    /// un tap/une tenue immobile — même valeur que le slop de capture (P9).
    static let reorderSlop: CGFloat = 24
    /// Cible tappable visée (HIG) — la zone d'une poignée DÉBORDE hors de la
    /// barre pour l'atteindre quand celle-ci est étroite, et ne cède que
    /// devant l'autre poignée, avec qui elle partage alors la barre au milieu
    /// (`edgeHandleZones`).
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

    /// Cible tappable d'une poignée de bord, en x de CANVAS, pour une rangée
    /// donnée du plan. UNE seule source : le hit-test du geste et les cibles
    /// réellement posées à l'écran la lisent au même endroit.
    nonisolated struct EdgeHandleZone: Equatable, Identifiable {
        let trackId: String
        let edge: Edge
        let rowIndex: Int
        let minX: CGFloat
        let maxX: CGFloat

        var id: String { "\(trackId)#\(edge == .start ? "start" : "end")" }
        var width: CGFloat { maxX - minX }
        func contains(_ touchX: CGFloat) -> Bool { touchX >= minX && touchX <= maxX }
    }

    /// Les deux zones de poignée d'une piste — vide pour un fantôme (pas de
    /// bord à tirer, il n'a pas de durée choisie, O4), pour une piste NON
    /// sélectionnée, ou pour une piste VERROUILLÉE (fond/synthétique).
    ///
    /// Sélection préalable : « sélectionner une piste, c'est passer en mode
    /// édition dessus » (parité `ClipTrimHandles.shouldShow(isSelected:
    /// isLocked:)`) — sans cette garde, le rognage accidentel était possible
    /// dès le premier contact sur n'importe quelle barre (revue Opus,
    /// constat 3). Verrou : NI poignées NI déplacement pour un fond/
    /// synthétique — sa fenêtre est ignorée en lecture.
    ///
    /// La zone vise 44 pt (HIG) et DÉBORDE hors de la barre quand celle-ci est
    /// étroite. Elle ne déborde jamais au point d'avaler l'autre poignée : sous
    /// la largeur de la zone, les deux se PARTAGENT la barre en son milieu.
    /// Sans ce partage, le premier test évalué (`.start`) prenait tout contact
    /// et la poignée de FIN d'une barre plus étroite que 22 pt devenait
    /// inatteignable (revue Opus, mineur 18).
    static func edgeHandleZones(for track: Plan2DTrack, rowIndex: Int, isSelected: Bool, zoom: Plan2DZoom,
                                laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        guard isSelected, !track.isLocked else { return [] }
        return edgeZoneGeometry(for: track, rowIndex: rowIndex, zoom: zoom, laneWidth: laneWidth,
                                slideDuration: slideDuration)
    }

    /// Géométrie NUE des deux zones de bord d'une piste `.timed` — sans le
    /// garde de sélection/verrou ci-dessus. `tapTarget` (mineur 19,
    /// ci-dessous) en a besoin SANS ce garde : la préséance du bord sur un
    /// losange qui le recouvre est une question de ce que le doigt VISE,
    /// indépendante de la poignée étant ou non actuellement rendue (revue
    /// Opus DoD sur D6b — coupler les deux avait rendu la fiche du clip
    /// inatteignable au tap sur une piste non sélectionnée, la régression
    /// même que mineur 19 corrigeait).
    private static func edgeZoneGeometry(for track: Plan2DTrack, rowIndex: Int, zoom: Plan2DZoom,
                                         laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        guard case let .timed(start, end) = track.bar else { return [] }
        let startX = x(forTime: start, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let endX = x(forTime: end, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let half = edgeHandleMinHitWidth / 2
        let midX = (startX + endX) / 2
        return [
            EdgeHandleZone(trackId: track.id, edge: .start, rowIndex: rowIndex,
                           minX: startX - half, maxX: min(startX + half, midX)),
            EdgeHandleZone(trackId: track.id, edge: .end, rowIndex: rowIndex,
                           minX: max(endX - half, midX), maxX: endX + half)
        ]
    }

    /// Toutes les cibles du plan, rangée par rangée — ce que la couche de
    /// poignées pose réellement à l'écran. `selectedTrackId` borne les
    /// cibles à la SEULE piste sélectionnée (trim préalable, ci-dessus).
    static func edgeHandleZones(tracks: [Plan2DTrack], selectedTrackId: String?, zoom: Plan2DZoom,
                                laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        tracks.enumerated().flatMap { index, track in
            edgeHandleZones(for: track, rowIndex: index, isSelected: track.id == selectedTrackId,
                            zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        }
    }

    /// Poignée de bord touchée, si `touchX` tombe dans sa zone tappable. Au
    /// milieu exact d'une barre étroite, le DÉBUT l'emporte — une frontière
    /// doit appartenir à quelqu'un.
    static func edgeHandle(touchX: CGFloat, track: Plan2DTrack, isSelected: Bool,
                           zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Edge? {
        edgeHandleZones(for: track, rowIndex: 0, isSelected: isSelected, zoom: zoom, laneWidth: laneWidth,
                        slideDuration: slideDuration)
            .first { $0.contains(touchX) }?
            .edge
    }

    /// Rayon de tap d'un losange AFFICHÉ — même ordre de grandeur que la
    /// zone tappable de `KeyframeMarkerView` (`.inset(by: -16)` autour d'un
    /// losange de 8-10 pt) : le marqueur est petit, exiger la précision du
    /// pixel serait une régression.
    static let keyframeHitRadius: CGFloat = 16

    /// Le losange le plus proche de `touchX`, dans SA piste, s'il tombe dans
    /// `keyframeHitRadius` — `nil` si la piste n'a aucun losange ou si aucun
    /// n'est assez proche. Consulté par `handleEnded` AVANT `onSelectTrack`
    /// sur un outcome `.select` (Guard 4g) : sans lui, aucun keyframe
    /// individuel n'est jamais atteignable au tap.
    static func keyframeHit(touchX: CGFloat, track: Plan2DTrack,
                            zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> String? {
        track.keyframes
            .map { keyframe -> (id: String, distance: CGFloat) in
                let kx = x(forTime: keyframe.time, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                return (keyframe.id, abs(touchX - kx))
            }
            .filter { $0.distance <= keyframeHitRadius }
            .min { $0.distance < $1.distance }
            .map(\.id)
    }

    /// Les deux axes du plan : horizontal = durée, vertical = empilement. Un
    /// geste armé sert L'UN des deux, jamais les deux (revue Opus, constat 2 :
    /// sans verrou, tout réordonnancement au doigt empilait aussi un
    /// `MoveClipCommand`).
    nonisolated enum DragAxis: Equatable {
        case horizontal
        case vertical
    }

    /// Zone morte avant qu'un axe ne soit élu. Un doigt vertical porte
    /// toujours quelques points d'horizontal : comparer les dominantes sur une
    /// translation nulle éliraient au bruit.
    static let axisDeadZone: CGFloat = 8

    /// L'axe dominant d'une translation, `nil` tant que la zone morte n'est pas
    /// franchie. À égalité parfaite, le vertical l'emporte : un doute ne se
    /// paie jamais d'un déplacement temporel non voulu.
    static func dominantAxis(_ translation: CGSize) -> DragAxis? {
        let dx = abs(translation.width)
        let dy = abs(translation.height)
        guard max(dx, dy) >= axisDeadZone else { return nil }
        return dx > dy ? .horizontal : .vertical
    }

    /// Ce que le plan fait d'une frame de geste pas encore armé.
    ///
    /// `arm(axis:)` porte l'axe DÉJÀ connu quand l'armement vient d'un
    /// glissement franc (« poser, hésiter, glisser ») ; `nil` quand il vient
    /// d'une tenue, où l'axe reste à élire au premier vrai mouvement.
    nonisolated enum ArmDecision: Equatable {
        case wait
        case arm(axis: DragAxis?)
        case yieldToScroller
    }

    /// Qui tient le geste — le plan ou le scroller qui l'entoure.
    ///
    /// L'ordre des trois tests EST la correction (revue Opus, constat 5) :
    ///
    ///   1. la TENUE d'abord. `DragGesture.onChanged` ne se déclenche pas sur
    ///      un doigt strictement immobile : la première frame après la tenue a
    ///      souvent déjà quitté le slop. Tester le slop avant le délai
    ///      condamnerait tout réordonnancement ;
    ///   2. sous le slop, on attend — c'est encore un tap qui tremble ;
    ///   3. au-delà, la dominante tranche : un glissement HORIZONTAL franc sur
    ///      une piste appartient à la piste (le piège nommé
    ///      `VideoClipBar:178-183` — un appui long sur doigt immobile ne
    ///      s'engage jamais sur un glissement lent) ; un glissement VERTICAL
    ///      appartient au scroller, sans quoi la liste des pistes ne défilerait
    ///      plus nulle part.
    static func armDecision(translation: CGSize, elapsed: TimeInterval) -> ArmDecision {
        guard elapsed < reorderArmDuration else { return .arm(axis: nil) }
        guard !withinSlop(translation) else { return .wait }
        return dominantAxis(translation) == .horizontal ? .arm(axis: .horizontal) : .yieldToScroller
    }

    /// Ce qu'un tap DÉSIGNE sur une piste.
    ///
    /// Un losange posé au tout début de son clip se dessine EXACTEMENT sur le
    /// bord de la barre : son rayon de tap (16 pt) tombe entier dans la zone de
    /// poignée. Consulter les losanges en premier rendait alors la fiche du
    /// CLIP inatteignable au tap sur ce bord (revue Opus, mineur 19) — le bord
    /// a donc la préséance, et le losange reste la cible la plus précise
    /// partout ailleurs sur la barre.
    ///
    /// Cette préséance est INDÉPENDANTE de `selectedTrackId` — délibérément
    /// (revue Opus DoD sur D6b) : elle tranche ce que le doigt VISE, pas
    /// quelle poignée est actuellement rendue. La coupler à la sélection
    /// (arbitrage 2, D6b) avait réintroduit exactement la régression que
    /// mineur 19 corrigeait — sur une piste NON sélectionnée, dont la barre
    /// entière tombe sous le rayon de tap d'un losange à t=0, le tap
    /// n'atteignait plus jamais `.track`, donc plus aucune sélection ne
    /// pouvait naître d'un tap sur la barre.
    ///
    /// Reconciliation avec l'inspectabilité d'un keyframe AUDIO (arbitrage 3,
    /// D6c) : CLOSE, sans changement de règle ici. `TimelineInspectorHost.
    /// resolveAudioKeyframeOwnerSnapshot` route désormais tout losange audio
    /// vers l'inspecteur de SON CLIP — la même fiche que `.track` ouvrirait
    /// pour cette piste. Les deux issues de `tapTarget` sur un chevauchement
    /// audio (`.track` ou `.keyframe`) atterrissent donc sur LA MÊME sheet
    /// (`Plan2DAudioKeyframeEdgeReconciliationTests`, prouvé bout en bout) :
    /// la préséance du bord ne prive plus jamais l'utilisateur d'un
    /// inspecteur pour cette famille, elle ne fait plus que choisir PAR OÙ il
    /// y arrive. Pour texte/média, le losange reste distinct du clip
    /// (KeyframeInspector ≠ ClipInspector) — la préséance du bord y protège
    /// toujours la ré-atteignabilité de la fiche CLIP sur une barre courte,
    /// exactement le rôle que mineur 19 lui donnait.
    nonisolated enum TapTarget: Equatable {
        case keyframe(String)
        case track
    }

    static func tapTarget(touchX: CGFloat, track: Plan2DTrack,
                          zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> TapTarget {
        let onEdge = edgeZoneGeometry(for: track, rowIndex: 0, zoom: zoom, laneWidth: laneWidth,
                                      slideDuration: slideDuration).contains { $0.contains(touchX) }
        guard !onEdge,
              let keyframeId = keyframeHit(touchX: touchX, track: track, zoom: zoom,
                                           laneWidth: laneWidth, slideDuration: slideDuration)
        else { return .track }
        return .keyframe(keyframeId)
    }

    /// Delta de temps (secondes) pour un delta de pixels ANCRÉ au geste —
    /// inverse ponctuel de `Plan2DLayout.x`, gardé côté vue (D1 est gelé).
    static func timeDelta(forDeltaX deltaX: CGFloat, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Double {
        guard laneWidth > 0, zoom.scale > 0 else { return 0 }
        return Double(deltaX / (laneWidth * zoom.scale)) * slideDuration
    }

    /// Déplacement TEMPOREL d'une piste, en secondes cumulées depuis le début
    /// du geste — `nil` quand aucun déplacement ne s'applique.
    ///
    /// Déplacer une piste dans le temps passe par le MÊME armement que le
    /// réordonnancement vertical (M11), puis par l'ÉLECTION de l'axe
    /// horizontal : les deux mutations du plan ne partent jamais du même
    /// geste.
    ///
    /// Une piste FANTÔME est exclue : elle n'a pas de fenêtre à déplacer, et
    /// lui en fabriquer une au premier glissement transformerait un défaut en
    /// choix (O4) — la même raison qui prive son bord de poignée. Une piste
    /// VERROUILLÉE (fond/synthétique) l'est aussi : NI poignées NI
    /// déplacement (revue Opus, constat 3) — la lecture ignore sa fenêtre,
    /// la déplacer au doigt mentirait.
    ///
    /// Deux verrous, tous deux nés de la revue Opus : l'axe ÉLU doit être
    /// l'horizontal (un réordonnancement vertical n'émet JAMAIS de
    /// `MoveClipCommand`), et la translation est mesurée DEPUIS l'armement —
    /// les points de slop parcourus avant lui ne se rendent pas en secondes.
    static func moveDelta(translationSinceArm: CGSize, axis: DragAxis?, gestureEdge: Edge?,
                          isReorderArmed: Bool, track: Plan2DTrack, zoom: Plan2DZoom,
                          laneWidth: CGFloat, slideDuration: Double) -> Double? {
        guard gestureEdge == nil, isReorderArmed, axis == .horizontal else { return nil }
        guard !track.isLocked, case .timed = track.bar else { return nil }
        let seconds = timeDelta(forDeltaX: translationSinceArm.width, zoom: zoom,
                                laneWidth: laneWidth, slideDuration: slideDuration)
        guard seconds != 0 else { return nil }
        return seconds
    }

    /// Ce que produit un relâchement de doigt — décidé sur la seule
    /// TRANSLATION finale, jamais sur `gestureEdge`/`isReorderArmed` seuls :
    /// une poignée de bord ARMÉE dès le touch-down (zone tappable ≥ 44 pt,
    /// débordante sur barre étroite) redevient un TAP si le doigt n'a jamais
    /// bougé au-delà du slop — sinon toute barre plus étroite que la zone de
    /// poignée (le cas même que la zone débordante existe pour couvrir)
    /// perdrait son tap-vers-Inspecteur.
    /// `nonisolated` explicite : `MeeshyUI` bascule l'isolation par défaut sur
    /// `MainActor` (SE-0466) et `Plan2DView` en hérite via sa conformance à
    /// `View` — sans ce marqueur, la conformance `Equatable` synthétisée
    /// devient elle-même main-actor-isolée et `XCTAssertEqual` (contexte non
    /// isolé) refuse de la comparer. Même précédent que `Plan2DZoom`/
    /// `TrackBar` (`Plan2DLayout.swift`).
    nonisolated enum GestureOutcome: Equatable {
        case select
        case reorder(to: Int)
        case none
    }

    static func gestureOutcome(translation: CGSize, gestureEdge: Edge?, isReorderArmed: Bool,
                               axis: DragAxis?, startRow: Int, endRow: Int) -> GestureOutcome {
        guard !withinSlop(translation) else { return .select }
        guard gestureEdge == nil, isReorderArmed, axis == .vertical,
              endRow != startRow else { return .none }
        return .reorder(to: endRow)
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
