import SwiftUI

/// Shared scrub surface for the Quick & Pro timelines: ONE horizontal
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
    public let onScrub: (Float) -> Void
    public let onScrubBegan: () -> Void
    public let onScrubEnded: () -> Void
    private let tracks: (CGFloat) -> TracksContent

    /// `tracks` receives the resolved lane width so every `TrackBarView` row
    /// spans exactly the same horizontal extent as the ruler above it.
    public init(
        totalDuration: Float,
        geometry: TimelineGeometry,
        currentTime: Float,
        isDark: Bool,
        minLaneWidth: CGFloat,
        rulerHeight: CGFloat = 22,
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
        self.onScrub = onScrub
        self.onScrubBegan = onScrubBegan
        self.onScrubEnded = onScrubEnded
        self.tracks = tracks
    }

    public var body: some View {
        let laneWidth = Self.laneWidth(totalDuration: totalDuration,
                                       geometry: geometry,
                                       minLaneWidth: minLaneWidth)
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
            .overlay(alignment: .topLeading) { playheadOverlay }
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
