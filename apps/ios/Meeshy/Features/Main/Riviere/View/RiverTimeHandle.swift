import SwiftUI
import MeeshyUI

/// R-3 — la poignée du temps, au bord droit du pane : une piste graduée
/// (`RiverTimeScale`, règle pure) et une poignée qu'on TIENT pour sauter à
/// la période voulue. Apparaît au défilement, s'efface au repos.
///
/// Cette vue ne calcule aucun temps ni aucun rang : elle lit l'échelle,
/// pose la poignée à `fraction`, et rend à l'hôte la fraction où le doigt
/// l'a laissée (`onSeek`) — c'est l'hôte qui cadre.
struct RiverTimeHandle: View {
    let scale: RiverTimeScale
    /// Position de repos de la poignée — fraction du rang lu.
    let fraction: Double
    let isVisible: Bool
    let isDark: Bool
    let onSeek: (Double) -> Void

    @State private var dragFraction: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var shownFraction: Double { dragFraction ?? fraction }

    var body: some View {
        GeometryReader { proxy in
            let trackHeight = max(0, proxy.size.height - RiverTimeHandleMetrics.handleHeight)
            ZStack(alignment: .topTrailing) {
                track(trackHeight: trackHeight)
                handle(trackHeight: trackHeight)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topTrailing)
            // Le geste est CAPTÉ côté UIKit, dans la seule colonne de la
            // poignée : sur un `ScrollView` à deux axes, un `DragGesture`
            // SwiftUI — même prioritaire — laissait le pan du scroll view
            // emporter le doigt (mesuré au simulateur le 2026-08-22 : le
            // contenu défilait, la poignée ne bougeait pas). Un
            // `UIPanGestureRecognizer` dont le pan du scroll view doit
            // attendre l'échec tient la poignée, et rien d'autre.
            .overlay(alignment: .trailing) {
                RiverTimeHandleDragCatcher(
                    onChanged: { y in
                        guard trackHeight > 0 else { return }
                        dragFraction = min(1, max(0, (y - RiverTimeHandleMetrics.handleHeight / 2) / trackHeight))
                    },
                    onEnded: { y in
                        guard trackHeight > 0 else { dragFraction = nil; return }
                        let fraction = min(1, max(0, (y - RiverTimeHandleMetrics.handleHeight / 2) / trackHeight))
                        dragFraction = nil
                        onSeek(fraction)
                    }
                )
                .frame(width: RiverTimeHandleMetrics.handleWidth + RiverTimeHandleMetrics.trackInset * 2)
            }
        }
        .opacity(isVisible || dragFraction != nil ? 1 : 0)
        .animation(reduceMotion ? nil : .easeInOut(duration: RiverMetrics.Motion.handleFadeDuration), value: isVisible)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "riviere.timeHandle.label", defaultValue: "Axe du temps", bundle: .main))
        .accessibilityValue(scale.label(atFraction: shownFraction))
    }

    // MARK: - Piste et graduations

    private func track(trackHeight: CGFloat) -> some View {
        ZStack(alignment: .topTrailing) {
            Capsule()
                .fill(ThemeManager.shared.textMuted.opacity(0.25))
                .frame(width: RiverTimeHandleMetrics.trackWidth, height: trackHeight)
                .padding(.trailing, RiverTimeHandleMetrics.trackInset + (RiverTimeHandleMetrics.handleWidth - RiverTimeHandleMetrics.trackWidth) / 2)
                .offset(y: RiverTimeHandleMetrics.handleHeight / 2)
            ForEach(Array(scale.ticks.enumerated()), id: \.offset) { _, tick in
                HStack(spacing: 4) {
                    Text(tick.label)
                        .font(MeeshyFont.relative(RiverTimeHandleMetrics.tickLabelSize, weight: .semibold))
                        .foregroundColor(ThemeManager.shared.textMuted)
                        .lineLimit(1)
                    Rectangle()
                        .fill(ThemeManager.shared.textMuted.opacity(0.5))
                        .frame(width: RiverTimeHandleMetrics.tickLength, height: 1)
                }
                .padding(.trailing, RiverTimeHandleMetrics.trackInset + RiverTimeHandleMetrics.handleWidth / 2)
                .offset(y: RiverTimeHandleMetrics.handleHeight / 2 + trackHeight * tick.fraction - 7)
            }
        }
    }

    // MARK: - Poignée

    private func handle(trackHeight: CGFloat) -> some View {
        HStack(spacing: 8) {
            if dragFraction != nil {
                Text(scale.label(atFraction: shownFraction))
                    .font(MeeshyFont.relative(RiverTimeHandleMetrics.labelSize, weight: .bold))
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(MeeshyColors.backgroundSecondary(isDark: isDark).opacity(0.96)))
            }
            Capsule()
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                .overlay(
                    Image(systemName: "line.3.horizontal")
                        .font(MeeshyFont.relative(RiverTimeHandleMetrics.tickLabelSize, weight: .bold))
                        .foregroundColor(ThemeManager.shared.textMuted)
                )
                .frame(width: RiverTimeHandleMetrics.handleWidth, height: RiverTimeHandleMetrics.handleHeight)
                .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
        }
        .padding(.trailing, RiverTimeHandleMetrics.trackInset)
        .offset(y: trackHeight * shownFraction)
    }

}

// MARK: - Capture UIKit du glisser — la poignée tient tête au pan du scroll view

private struct RiverTimeHandleDragCatcher: UIViewRepresentable {
    let onChanged: (CGFloat) -> Void
    let onEnded: (CGFloat) -> Void

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var onChanged: (CGFloat) -> Void
        var onEnded: (CGFloat) -> Void

        init(onChanged: @escaping (CGFloat) -> Void, onEnded: @escaping (CGFloat) -> Void) {
            self.onChanged = onChanged
            self.onEnded = onEnded
        }

        @objc func pan(_ recognizer: UIPanGestureRecognizer) {
            guard let view = recognizer.view else { return }
            let y = recognizer.location(in: view).y
            switch recognizer.state {
            case .began, .changed: onChanged(y)
            case .ended: onEnded(y)
            case .cancelled, .failed: onEnded(y)
            default: break
            }
        }

        /// Le pan du scroll view ATTEND l'échec du nôtre : tant que le doigt
        /// est dans la colonne de la poignée, le contenu ne défile pas.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer && other.view is UIScrollView
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onChanged: onChanged, onEnded: onEnded) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        view.isAccessibilityElement = false
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.delegate = context.coordinator
        pan.maximumNumberOfTouches = 1
        view.addGestureRecognizer(pan)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded = onEnded
    }
}
