import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Story Progress Bars

/// Segmented progress indicator for the story viewer's current group.
/// Extracted from `StoryViewerView.progressBars` so the header layer no
/// longer inlines a `ForEach` / `GeometryReader` subtree into the viewer's
/// opaque type. Sorti de `StoryViewerView+Content.swift` (hors budget) pour
/// recevoir le parcours au doigt (#7878).
///
/// **La story se parcourt au doigt** (#7878) : poser le doigt sur la rangée
/// fait s'effacer les segments au profit d'une piste épaisse, pleine largeur,
/// qui porte la story COURANTE — la largeur entière sert donc la précision,
/// quel que soit le nombre de stories du groupe. La scène se redessine sous le
/// doigt (`ScenePlaybackScrubber`), l'avance automatique attend
/// (`onScrubStateChanged`, la même pause que le glissé du rail), et au relâcher
/// le compte à rebours reprend depuis la position choisie (`onSeek`).
struct StoryProgressBarsView: View {
    let group: StoryGroup?
    let currentIndex: Int
    let progress: CGFloat
    let scrubber: ScenePlaybackScrubber
    /// Vrai pendant le glissé : le viewer suspend son horloge et cède ses
    /// gestes de navigation (tap, appui long, glissé de fermeture ou de cube).
    let onScrubStateChanged: (Bool) -> Void
    /// La fraction choisie au relâcher — le viewer y recale son compte à rebours.
    let onSeek: (Double) -> Void

    @State private var isScrubbing = false

    /// La rangée fait 3 pt ; la zone tactile monte dans la bande de statut
    /// (masquée dans le lecteur) et descend jusqu'au bord de l'en-tête — 44 pt.
    static let touchInsets = EdgeInsets(top: 30, leading: 0, bottom: 11, trailing: 0)

    var body: some View {
        HStack(spacing: 3) {
            if let group {
                ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, _ in
                    GeometryReader { barGeo in
                        let w = width(for: index, totalWidth: barGeo.size.width)
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.2))
                            Capsule()
                                .fill(index == currentIndex ? Self.activeFill : AnyShapeStyle(Color.white))
                                .frame(width: w)
                                .shadow(
                                    color: index == currentIndex ? MeeshyColors.indigo500.opacity(0.6) : .clear,
                                    radius: 4, y: 0
                                )
                        }
                    }
                    .frame(height: 3)
                    .accessibilityHidden(true)
                }
            }
        }
        .opacity(isScrubbing ? 0 : 1)
        .overlay {
            if group != nil {
                SceneScrubTrack(playback: Double(progress),
                                fill: Self.activeFill,
                                scrubber: scrubber,
                                restThickness: 3,
                                showsTrackAtRest: false,
                                touchInsets: Self.touchInsets,
                                onScrubbingChanged: { scrubbing in
                                    isScrubbing = scrubbing
                                    onScrubStateChanged(scrubbing)
                                },
                                onCommit: onSeek)
            }
        }
        .animation(.easeOut(duration: 0.15), value: isScrubbing)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.viewer.a11y.position", defaultValue: "Story \(currentIndex + 1) sur \(group?.stories.count ?? 0)", bundle: .main))
        .accessibilityValue(String(localized: "story.viewer.a11y.percent", defaultValue: "\(Int(progress * 100)) pourcent", bundle: .main))
        .sceneScrubAccessibility(progress: Double(progress), scrubber: scrubber, onCommit: onSeek)
    }

    private static let activeFill = AnyShapeStyle(LinearGradient(
        colors: [MeeshyColors.indigo500, MeeshyColors.error, MeeshyColors.indigo400],
        startPoint: .leading,
        endPoint: .trailing
    ))

    private func width(for index: Int, totalWidth: CGFloat) -> CGFloat {
        if index < currentIndex {
            return totalWidth
        } else if index == currentIndex {
            return totalWidth * progress
        } else {
            return 0
        }
    }
}
