import SwiftUI

/// Barre de trim tactile de l'inspecteur clip : la fenêtre [début…fin] se
/// manipule DIRECTEMENT au doigt — poignée gauche = début (fin fixe), poignée
/// droite = fin (début fixe), segment central = déplacement (durée constante).
/// Remplace les steppers « 0:0… » tronqués comme affordance principale
/// (capture user 2026-07-20 : « définir début/durée du bout du doigt »).
///
/// Pendant le drag, la fenêtre prévisualisée est calculée LOCALEMENT
/// (`previewWindow`, pur et clampé) ; le delta n'est commité qu'au lâcher —
/// une seule entrée d'undo par geste, même contrat que les poignées du rail.
public struct ClipTimingBar: View {

    public enum DragField: Equatable, Sendable { case move, trimStart, trimEnd }

    /// Durée plancher d'un clip — miroir du clamp `max(0.05, …)` de
    /// `TimelineViewModel.trimClipStart/End`.
    public nonisolated static let minimumDuration: Float = 0.05

    // MARK: - Géométrie pure (testée sans monter la vue)

    /// Secondes correspondant à une translation horizontale sur la piste.
    public nonisolated static func seconds(forTranslation dx: CGFloat,
                                           trackWidth: CGFloat,
                                           slideDuration: Float) -> Float {
        guard trackWidth > 0 else { return 0 }
        return Float(dx / trackWidth) * slideDuration
    }

    /// Abscisse d'un instant sur la piste.
    public nonisolated static func x(forTime t: Float,
                                     trackWidth: CGFloat,
                                     slideDuration: Float) -> CGFloat {
        guard slideDuration > 0 else { return 0 }
        return CGFloat(t / slideDuration) * trackWidth
    }

    /// Fenêtre prévisualisée pendant un drag, clampée aux bornes de la slide
    /// et à la durée plancher. `move` préserve la durée ; `trimStart` garde la
    /// fin fixe ; `trimEnd` garde le début fixe.
    public nonisolated static func previewWindow(field: DragField,
                                                 start: Float, duration: Float,
                                                 deltaSeconds: Float,
                                                 slideDuration: Float,
                                                 minDuration: Float = ClipTimingBar.minimumDuration
    ) -> (start: Float, duration: Float) {
        let end = start + duration
        switch field {
        case .move:
            let s = max(0, min(start + deltaSeconds, max(0, slideDuration - duration)))
            return (s, duration)
        case .trimStart:
            let s = max(0, min(start + deltaSeconds, end - minDuration))
            return (s, end - s)
        case .trimEnd:
            let e = max(start + minDuration, min(end + deltaSeconds, slideDuration))
            return (start, e - start)
        }
    }

    // MARK: - Inputs

    public let start: Float
    public let duration: Float
    public let slideDuration: Float
    /// Deltas COMMITÉS au lâcher (une entrée d'undo par geste).
    public let onMoveCommitted: (Float) -> Void
    public let onTrimStartCommitted: (Float) -> Void
    public let onTrimEndCommitted: (Float) -> Void

    @State private var drag: (field: DragField, deltaSeconds: Float)?

    public init(start: Float, duration: Float, slideDuration: Float,
                onMoveCommitted: @escaping (Float) -> Void,
                onTrimStartCommitted: @escaping (Float) -> Void,
                onTrimEndCommitted: @escaping (Float) -> Void) {
        self.start = start
        self.duration = duration
        self.slideDuration = slideDuration
        self.onMoveCommitted = onMoveCommitted
        self.onTrimStartCommitted = onTrimStartCommitted
        self.onTrimEndCommitted = onTrimEndCommitted
    }

    // MARK: - Body

    /// Étendue affichée : la slide, jamais moins que la fenêtre du clip (un
    /// clip qui déborde reste entièrement manipulable).
    private var displayTotal: Float {
        max(slideDuration, start + duration, Self.minimumDuration)
    }

    private var previewedWindow: (start: Float, duration: Float) {
        guard let drag else { return (start, duration) }
        return Self.previewWindow(field: drag.field, start: start, duration: duration,
                                  deltaSeconds: drag.deltaSeconds, slideDuration: displayTotal)
    }

    private static let trackHeight: CGFloat = 30
    private static let handleHitWidth: CGFloat = 30

    public var body: some View {
        let window = previewedWindow
        VStack(spacing: 5) {
            GeometryReader { geo in
                track(window: window, width: geo.size.width)
            }
            .frame(height: Self.trackHeight)
            readouts(window: window)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func track(window: (start: Float, duration: Float), width: CGFloat) -> some View {
        let x0 = Self.x(forTime: window.start, trackWidth: width, slideDuration: displayTotal)
        let x1 = Self.x(forTime: window.start + window.duration, trackWidth: width, slideDuration: displayTotal)
        let segmentWidth = max(x1 - x0, 12)
        ZStack(alignment: .leading) {
            Capsule()
                .fill(MeeshyColors.indigo500.opacity(0.14))
                .frame(height: Self.trackHeight)
            RoundedRectangle(cornerRadius: 9)
                .fill(MeeshyColors.indigo500.opacity(drag?.field == .move ? 0.95 : 0.8))
                .frame(width: segmentWidth, height: Self.trackHeight)
                .overlay(
                    Image(systemName: "arrow.left.and.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.9))
                )
                .offset(x: x0)
                .gesture(dragGesture(.move, width: width))
                .accessibilityElement()
                .accessibilityLabel(String(localized: "story.timeline.inspector.timing.move",
                                           defaultValue: "Position du clip", bundle: .module))
                .accessibilityValue(accessibilityWindowValue(window: window))
                .accessibilityAdjustableAction { direction in
                    onMoveCommitted(direction == .increment ? 0.1 : -0.1)
                }
            handle(active: drag?.field == .trimStart)
                .offset(x: x0 - Self.handleHitWidth / 2)
                .gesture(dragGesture(.trimStart, width: width))
                .accessibilityElement()
                .accessibilityLabel(String(localized: "story.timeline.inspector.start",
                                           defaultValue: "Début", bundle: .module))
                .accessibilityValue(TransportBar.formatTimeCompact(seconds: window.start))
                .accessibilityAdjustableAction { direction in
                    onTrimStartCommitted(direction == .increment ? 0.1 : -0.1)
                }
            handle(active: drag?.field == .trimEnd)
                .offset(x: x1 - Self.handleHitWidth / 2)
                .gesture(dragGesture(.trimEnd, width: width))
                .accessibilityElement()
                .accessibilityLabel(String(localized: "story.timeline.inspector.end",
                                           defaultValue: "Fin", bundle: .module))
                .accessibilityValue(TransportBar.formatTimeCompact(seconds: window.start + window.duration))
                .accessibilityAdjustableAction { direction in
                    onTrimEndCommitted(direction == .increment ? 0.1 : -0.1)
                }
        }
    }

    /// Poignée de trim : grip blanc bien visible dans une zone de hit large
    /// (44 pt de haut via la rangée) — jamais un simple trait de 2 px.
    private func handle(active: Bool) -> some View {
        ZStack {
            Color.clear
            Capsule()
                .fill(.white)
                .frame(width: 5, height: Self.trackHeight - 8)
                .shadow(color: .black.opacity(0.35), radius: 1.5, y: 0.5)
                .scaleEffect(active ? 1.25 : 1)
        }
        .frame(width: Self.handleHitWidth, height: Self.trackHeight + 14)
        .contentShape(Rectangle())
    }

    /// Lectures DÉBUT / DURÉE / FIN — suivent la fenêtre prévisualisée en
    /// direct pendant le geste, format compact jamais tronqué.
    private func readouts(window: (start: Float, duration: Float)) -> some View {
        HStack(alignment: .firstTextBaseline) {
            readout(title: String(localized: "story.timeline.inspector.start",
                                  defaultValue: "Début", bundle: .module),
                    value: TransportBar.formatTimeCompact(seconds: window.start),
                    alignment: .leading)
            Spacer(minLength: 8)
            readout(title: String(localized: "story.timeline.inspector.duration",
                                  defaultValue: "Durée", bundle: .module),
                    value: String(format: "%.1f s", window.duration),
                    alignment: .center)
            Spacer(minLength: 8)
            readout(title: String(localized: "story.timeline.inspector.end",
                                  defaultValue: "Fin", bundle: .module),
                    value: TransportBar.formatTimeCompact(seconds: window.start + window.duration),
                    alignment: .trailing)
        }
    }

    private func readout(title: String, value: String, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.callout, design: .monospaced))
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }

    private func accessibilityWindowValue(window: (start: Float, duration: Float)) -> String {
        "\(TransportBar.formatTimeCompact(seconds: window.start)) – "
            + TransportBar.formatTimeCompact(seconds: window.start + window.duration)
    }

    private func dragGesture(_ field: DragField, width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                drag = (field, Self.seconds(forTranslation: value.translation.width,
                                            trackWidth: width, slideDuration: displayTotal))
            }
            .onEnded { value in
                let delta = Self.seconds(forTranslation: value.translation.width,
                                         trackWidth: width, slideDuration: displayTotal)
                let window = Self.previewWindow(field: field, start: start, duration: duration,
                                                deltaSeconds: delta, slideDuration: displayTotal)
                drag = nil
                commit(field: field, window: window)
            }
    }

    /// N'émet que le delta effectivement APPLIQUÉ après clamp — un drag qui
    /// bute sur une borne ne pousse pas d'entrée d'undo fantôme.
    private func commit(field: DragField, window: (start: Float, duration: Float)) {
        let epsilon: Float = 0.005
        switch field {
        case .move:
            let applied = window.start - start
            if abs(applied) > epsilon { onMoveCommitted(applied) }
        case .trimStart:
            let applied = window.start - start
            if abs(applied) > epsilon { onTrimStartCommitted(applied) }
        case .trimEnd:
            let applied = (window.start + window.duration) - (start + duration)
            if abs(applied) > epsilon { onTrimEndCommitted(applied) }
        }
    }
}
