import SwiftUI

/// Contrôleur de défilement de la timeline — la poignée sous les pistes.
///
/// La timeline défilait déjà, mais sans le dire : `showsIndicators: false`, et
/// la seule zone où un glissement passait était le fond laissé libre entre les
/// clips. Zoomé à 400 % sur une story de trois minutes, rien n'indiquait ni où
/// l'on se trouvait ni ce qu'il restait à droite.
///
/// La poignée répond aux deux questions à la fois : sa LARGEUR dit quelle part
/// du contenu tient à l'écran, sa POSITION dit où l'on en est, et on peut la
/// tirer.
struct TimelineScrollBar: View {

    /// Décalage horizontal courant du contenu, en points.
    let scrollX: CGFloat
    let contentWidth: CGFloat
    let viewportWidth: CGFloat
    let isDark: Bool
    /// Reçoit le décalage visé pendant le glissement de la poignée.
    let onScrollTo: (CGFloat) -> Void

    /// Hauteur de la zone tactile. La poignée elle-même est fine ; c'est la
    /// zone qui doit rester attrapable au doigt.
    static let barHeight: CGFloat = 20
    static let thumbHeight: CGFloat = 5

    /// Décalage au moment où le doigt s'est posé — le glissement part de LÀ.
    /// Sans cette ancre, chaque `onChanged` réappliquerait la translation à un
    /// décalage déjà déplacé et la poignée fuirait sous le doigt.
    @State private var dragAnchorX: CGFloat?

    var body: some View {
        GeometryReader { geo in
            let trackWidth = geo.size.width
            let thumbWidth = TimelineScrollMetrics.thumbWidth(
                trackWidth: trackWidth,
                contentWidth: contentWidth,
                viewportWidth: viewportWidth
            )
            let progress = TimelineScrollMetrics.progress(
                scrollX: scrollX,
                contentWidth: contentWidth,
                viewportWidth: viewportWidth
            )
            let thumbX = TimelineScrollMetrics.thumbX(progress: progress,
                                                      trackWidth: trackWidth,
                                                      thumbWidth: thumbWidth)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08))
                    .frame(height: Self.thumbHeight)
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.45) : Color.black.opacity(0.32))
                    .frame(width: thumbWidth, height: Self.thumbHeight)
                    .offset(x: thumbX)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let anchor = dragAnchorX ?? thumbX
                        if dragAnchorX == nil { dragAnchorX = anchor }
                        let target = TimelineScrollMetrics.scrollX(
                            forThumbX: anchor + value.translation.width,
                            trackWidth: trackWidth,
                            thumbWidth: thumbWidth,
                            contentWidth: contentWidth,
                            viewportWidth: viewportWidth
                        )
                        onScrollTo(target)
                    }
                    .onEnded { _ in dragAnchorX = nil }
            )
        }
        .frame(height: Self.barHeight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.timeline.a11y.scrollbar",
                                   defaultValue: "Défilement de la timeline",
                                   bundle: .module))
        .accessibilityValue(
            "\(Int((TimelineScrollMetrics.progress(scrollX: scrollX, contentWidth: contentWidth, viewportWidth: viewportWidth) * 100).rounded())) %"
        )
        .accessibilityAdjustableAction { direction in
            let step = viewportWidth * 0.25
            switch direction {
            case .increment: onScrollTo(scrollX + step)
            case .decrement: onScrollTo(max(0, scrollX - step))
            @unknown default: break
            }
        }
    }
}
