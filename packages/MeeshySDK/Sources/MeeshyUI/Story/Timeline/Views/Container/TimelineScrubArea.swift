import SwiftUI

/// Scrub surface of the story timeline: ONE horizontal
/// scroller hosting the ruler and the track lanes so ticks, clips and the
/// playhead all share the same time→x mapping and scroll together, with the
/// draggable `PlayheadView` overlaid across the full lane height.
///
/// Before this component the ruler lived OUTSIDE the tracks' horizontal
/// ScrollView: its ticks neither aligned with the clips below (lanes are
/// inset by the 72pt sticky label + 12pt padding) nor followed the scroll
/// offset — and no playhead was mounted at all, so `splitSelectedAtPlayhead`
/// and `addKeyframeAtPlayhead` silently operated at t≈0.
public struct TimelineScrubArea<TracksContent: View>: View {

    /// Width of the `TrackBarView` sticky label column. The ruler and the
    /// playhead are both offset by this amount so x=0 of the time axis lands
    /// exactly on the lane origin.
    public nonisolated static var laneLabelWidth: CGFloat { 72 }
    public nonisolated static var horizontalPadding: CGFloat { 12 }
    /// Leading inset applied to the playhead overlay — the time axis origin
    /// in scroll-content coordinates.
    public nonisolated static var playheadLeadingInset: CGFloat { horizontalPadding + laneLabelWidth }

    /// Lane width shared by the ruler, every `TrackBarView` and the playhead
    /// clamp. Mirrors the containers' historical `max(width, minLaneWidth)`.
    public nonisolated static func laneWidth(totalDuration: Float,
                                             geometry: TimelineGeometry,
                                             minLaneWidth: CGFloat) -> CGFloat {
        max(geometry.width(for: totalDuration), minLaneWidth)
    }

    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let currentTime: Float
    public let isDark: Bool
    public let minLaneWidth: CGFloat
    public let rulerHeight: CGFloat
    /// True pendant la lecture — active le suivi automatique du playhead
    /// (auto-scroll) pour qu'il ne sorte jamais du viewport à droite.
    public let isPlaying: Bool
    /// Pinch-to-zoom : reçoit le zoomScale cible (clampé [0.25, 4]). nil =
    /// pas de pinch (les boutons +/− du transport restent la seule entrée).
    public let onZoomScaleChanged: ((CGFloat) -> Void)?
    /// Pin direct de la durée de slide — monte la `DurationHandle` (losange
    /// indigo) en fin de ruler. nil = pas de poignée.
    public let onSlideDurationChanged: ((Float) -> Void)?
    /// Temps aimanté du drag de clip en cours (non-nil UNIQUEMENT quand
    /// l'aimant a accroché) — affiche le guide vertical magenta.
    public let snapGuideTime: Float?
    public let onScrub: (Float) -> Void
    public let onScrubBegan: () -> Void
    public let onScrubEnded: () -> Void
    private let tracks: (CGFloat) -> TracksContent

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Dernier temps sur lequel l'auto-follow a scrollé — throttle pour ne
    /// pas émettre un scrollTo par frame (60 Hz).
    @State private var lastFollowedTime: Float = -1
    /// Ancre du pinch en cours — le zoom cible = ancre × magnification (une
    /// lecture par geste, jamais re-lue mid-geste : anti boule-de-neige).
    @State private var magnifyAnchor: CGFloat?

    /// `tracks` receives the resolved lane width so every `TrackBarView` row
    /// spans exactly the same horizontal extent as the ruler above it.
    public init(
        totalDuration: Float,
        geometry: TimelineGeometry,
        currentTime: Float,
        isDark: Bool,
        minLaneWidth: CGFloat,
        rulerHeight: CGFloat = 22,
        isPlaying: Bool = false,
        onZoomScaleChanged: ((CGFloat) -> Void)? = nil,
        onSlideDurationChanged: ((Float) -> Void)? = nil,
        snapGuideTime: Float? = nil,
        onScrub: @escaping (Float) -> Void,
        onScrubBegan: @escaping () -> Void = {},
        onScrubEnded: @escaping () -> Void = {},
        @ViewBuilder tracks: @escaping (CGFloat) -> TracksContent
    ) {
        self.totalDuration = totalDuration
        self.geometry = geometry
        self.currentTime = currentTime
        self.isDark = isDark
        self.minLaneWidth = minLaneWidth
        self.rulerHeight = rulerHeight
        self.isPlaying = isPlaying
        self.onZoomScaleChanged = onZoomScaleChanged
        self.onSlideDurationChanged = onSlideDurationChanged
        self.snapGuideTime = snapGuideTime
        self.onScrub = onScrub
        self.onScrubBegan = onScrubBegan
        self.onScrubEnded = onScrubEnded
        self.tracks = tracks
    }

    /// Bornes de zoom partagées avec les boutons du transport.
    public nonisolated static var zoomRange: ClosedRange<CGFloat> { 0.25...4.0 }

    /// Zoom cible d'un pinch : ancre capturée au début du geste × facteur de
    /// magnification, clampé aux bornes. Pure — testable sans geste SwiftUI.
    public nonisolated static func pinchZoom(anchor: CGFloat, magnification: CGFloat) -> CGFloat {
        min(zoomRange.upperBound, max(zoomRange.lowerBound, anchor * magnification))
    }

    private nonisolated static var playheadAnchorId: String { "timeline-playhead-anchor" }

    public var body: some View {
        let laneWidth = Self.laneWidth(totalDuration: totalDuration,
                                       geometry: geometry,
                                       minLaneWidth: minLaneWidth)
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    RulerView(
                        totalDuration: totalDuration,
                        geometry: geometry,
                        isDark: isDark,
                        height: rulerHeight,
                        onTapTime: onScrub,
                        onScrubBegan: onScrubBegan,
                        onScrubEnded: onScrubEnded
                    )
                    .equatable()
                    .frame(width: laneWidth, alignment: .leading)
                    .padding(.leading, Self.laneLabelWidth)
                    tracks(laneWidth)
                }
                .padding(.horizontal, Self.horizontalPadding)
                .overlay(alignment: .topLeading) { snapGuideOverlay }
                .overlay(alignment: .topLeading) { playheadOverlay }
                .overlay(alignment: .topLeading) { durationHandleOverlay }
                .background(alignment: .topLeading) { playheadAnchor }
            }
            .adaptiveOnChange(of: currentTime) { _, time in
                followPlayheadIfPlaying(time: time, proxy: proxy)
            }
            .simultaneousGesture(pinchZoomGesture)
        }
    }

    /// Pinch-to-zoom de la densité temporelle — simultané avec le scroll
    /// horizontal (deux doigts = zoom, un doigt = pan, aucun conflit).
    private var pinchZoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                guard let onZoomScaleChanged else { return }
                let anchor = magnifyAnchor ?? geometry.zoomScale
                if magnifyAnchor == nil { magnifyAnchor = anchor }
                onZoomScaleChanged(Self.pinchZoom(anchor: anchor, magnification: value))
            }
            .onEnded { _ in magnifyAnchor = nil }
    }

    /// Ancre invisible qui suit le playhead dans l'espace du contenu —
    /// cible du `scrollTo` de l'auto-follow.
    private var playheadAnchor: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .offset(x: Self.playheadLeadingInset + geometry.x(for: currentTime))
            .id(Self.playheadAnchorId)
    }

    /// Suit le playhead PENDANT LA LECTURE uniquement (un scrub = le doigt de
    /// l'utilisateur décide déjà de la position ; un drag de clip ne doit pas
    /// voir la timeline bouger sous lui). Throttlé à ~0.5s de timeline pour
    /// ne pas émettre 60 scrollTo/s.
    private func followPlayheadIfPlaying(time: Float, proxy: ScrollViewProxy) {
        guard isPlaying else {
            lastFollowedTime = -1
            return
        }
        guard abs(time - lastFollowedTime) > 0.5 else { return }
        lastFollowedTime = time
        proxy.scrollTo(Self.playheadAnchorId, anchor: UnitPoint(x: 0.35, y: 0))
    }

    /// Losange indigo en fin de ruler — étire ou rogne la durée de la slide
    /// au doigt (le pin devient `effects.timelineDuration` au commit).
    @ViewBuilder
    private var durationHandleOverlay: some View {
        if let onSlideDurationChanged {
            DurationHandle(
                duration: totalDuration,
                geometry: geometry,
                laneHeight: rulerHeight,
                isDark: isDark,
                onChange: onSlideDurationChanged
            )
            .offset(x: Self.playheadLeadingInset)
        }
    }

    /// Guide vertical magenta au temps aimanté du drag en cours.
    @ViewBuilder
    private var snapGuideOverlay: some View {
        if let snapGuideTime {
            GeometryReader { proxy in
                SnapGuideView(
                    x: geometry.x(for: snapGuideTime),
                    height: max(0, proxy.size.height - 18),
                    label: String(format: "%.2f s", snapGuideTime),
                    isVisible: true,
                    reducedMotion: reduceMotion
                )
                .offset(x: Self.playheadLeadingInset)
            }
            .allowsHitTesting(false)
        }
    }

    private var playheadOverlay: some View {
        GeometryReader { proxy in
            PlayheadView(
                currentTime: currentTime,
                totalDuration: totalDuration,
                geometry: geometry,
                laneHeight: proxy.size.height,
                isDark: isDark,
                onScrub: onScrub,
                onScrubBegan: onScrubBegan,
                onScrubEnded: onScrubEnded
            )
            .offset(x: Self.playheadLeadingInset)
        }
    }
}
