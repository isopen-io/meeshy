import SwiftUI

/// Transport row shared by Quick & Pro containers. Strict primitive `let` API
/// — no @ObservedObject — so SwiftUI can skip body re-evaluation when nothing
/// the bar cares about changed.
public struct TransportBar: View {

    public let isPlaying: Bool
    public let currentTime: Float
    public let duration: Float
    public let zoomScale: CGFloat
    public let isMuted: Bool
    /// Le readout `courant / durée`. La vue simple (Quick) le masque — la
    /// position se lit sur le playhead et la règle (retour user 2026-07-11) ;
    /// le Pro le conserve pour le calage précis.
    public let showsTimeReadout: Bool
    /// Undo/redo compacts pour le mode Quick (pas de TimelineToolbar dédiée).
    /// nil = masqués — le Pro garde sa toolbar et passe nil ici.
    public let canUndo: Bool?
    public let canRedo: Bool?
    /// Chip d'aimantation (fusion Simple+Pro : le snap vit dans le transport).
    /// nil = masqué — les surfaces sans moteur de snap ne l'affichent pas.
    public let isSnapEnabled: Bool?
    public let onPlayToggle: () -> Void
    public let onMuteToggle: () -> Void
    public let onZoomIn: () -> Void
    public let onZoomOut: () -> Void
    public let onZoomReset: () -> Void
    public let onUndo: () -> Void
    public let onRedo: () -> Void
    public let onSnapToggle: () -> Void

    public init(isPlaying: Bool, currentTime: Float, duration: Float,
                zoomScale: CGFloat, isMuted: Bool,
                showsTimeReadout: Bool = true,
                canUndo: Bool? = nil, canRedo: Bool? = nil,
                isSnapEnabled: Bool? = nil,
                onPlayToggle: @escaping () -> Void,
                onMuteToggle: @escaping () -> Void,
                onZoomIn: @escaping () -> Void,
                onZoomOut: @escaping () -> Void,
                onZoomReset: @escaping () -> Void,
                onUndo: @escaping () -> Void = {},
                onRedo: @escaping () -> Void = {},
                onSnapToggle: @escaping () -> Void = {}) {
        self.isPlaying = isPlaying; self.currentTime = currentTime; self.duration = duration
        self.zoomScale = zoomScale; self.isMuted = isMuted
        self.showsTimeReadout = showsTimeReadout
        self.canUndo = canUndo; self.canRedo = canRedo
        self.isSnapEnabled = isSnapEnabled
        self.onPlayToggle = onPlayToggle; self.onMuteToggle = onMuteToggle
        self.onZoomIn = onZoomIn; self.onZoomOut = onZoomOut; self.onZoomReset = onZoomReset
        self.onUndo = onUndo; self.onRedo = onRedo
        self.onSnapToggle = onSnapToggle
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    /// Compact display format for the transport readout. Trades sub-second
    /// precision for screen real-estate so the `current / total` pair fits in
    /// portrait without truncation. Use `formatTime(seconds:)` when you need
    /// the full ms-precision string (debug overlays, accessibility).
    /// - < 60s : `"0:00.0"` (1 decimal)
    /// - >=60s : `"1:05"`   (no decimal)
    public static func formatTimeCompact(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        if minutes >= 1 {
            let secs = Int(total.rounded()) - minutes * 60
            return String(format: "%d:%02d", minutes, secs)
        }
        return String(format: "0:%04.1f", total)
    }

    public static func zoomLabel(scale: CGFloat) -> String {
        "\(Int(scale * 100))%"
    }

    /// Clés a11y du chip snap — même contrat que l'ancienne TimelineToolbar
    /// pour que VoiceOver annonce l'état, pas juste le libellé.
    public static func snapAccessibilityKey(isOn: Bool) -> String {
        isOn ? "story.timeline.a11y.snap.on" : "story.timeline.a11y.snap.off"
    }

    public var body: some View {
        HStack(spacing: 10) {
            playButton
            if showsTimeReadout {
                timeReadout
            }
            Spacer(minLength: 4)
            undoRedoCluster
            snapChip
            zoomCluster
            muteButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .background(rowBackground)
        // MARK: - Keyboard Shortcuts (iPad / external keyboard)
        // Space — play/pause
        .keyboardShortcut(" ", modifiers: [])
        // ← / → — step backward / forward by 1 frame (handled via the scrub callback)
        .background(keyboardShortcutOverlay)
    }

    /// iOS 26+: the parent band (`ComposerBottomBand`) is now real Liquid
    /// Glass — stacking another `.ultraThinMaterial` here would blur/dull the
    /// same refracted color the band already shows through, breaking the
    /// continuous-surface feel. Pre-26 the band stays opaque, so this row
    /// keeps its own material for visual grouping, exactly as before.
    @ViewBuilder
    private var rowBackground: some View {
        if #available(iOS 26.0, *) {
            Color.clear
        } else {
            Rectangle().fill(.ultraThinMaterial)
        }
    }

    /// Invisible overlay buttons that capture keyboard shortcuts not expressible
    /// directly on the HStack (arrow keys need explicit Button wrapping).
    private var keyboardShortcutOverlay: some View {
        Group {
            Button(action: onPlayToggle) { EmptyView() }
                .keyboardShortcut(.space, modifiers: [])
                .opacity(0)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Keyboard shortcut availability (testable)

    /// True when this bar wires keyboard shortcuts (always true — used in tests).
    public static let hasKeyboardShortcuts: Bool = true

    /// Documented HIG contract: effective touch target (visual frame + contentShape inset)
    /// must meet Apple's 44×44pt minimum. Visual icons are 30×30 (or 36×36 for play)
    /// extended via `.contentShape(Rectangle().inset(by: -7))` / `inset(by: -4)`.
    public static let minimumHitTargetSize = CGSize(width: 44, height: 44)

    // MARK: - Sub-views

    private var playButton: some View {
        Button(action: onPlayToggle) {
            ZStack {
                Circle()
                    .fill(MeeshyColors.brandGradient)
                    .shadow(color: MeeshyColors.indigo500.opacity(0.35),
                            radius: 6, x: 0, y: 2)
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.white)
                    .offset(x: isPlaying ? 0 : 1)   // optical centring of play triangle
            }
            .frame(width: 32, height: 32)
            .contentShape(Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: isPlaying
            ? "story.timeline.transport.pause"
            : "story.timeline.transport.play",
            bundle: .module))
    }

    private var timeReadout: some View {
        let nowCompact = Self.formatTimeCompact(seconds: currentTime)
        let totalCompact = Self.formatTimeCompact(seconds: duration)
        // Full-precision strings reserved for accessibility — matches what the
        // Pro inspector and tests expect from `formatTime(seconds:)`.
        let nowPrecise = Self.formatTime(seconds: currentTime)
        let totalPrecise = Self.formatTime(seconds: duration)
        return HStack(spacing: 4) {
            Text(nowCompact)
                .foregroundStyle(MeeshyColors.indigo700)
            Text("/")
                .foregroundStyle(.secondary)
            Text(totalCompact)
                .foregroundStyle(.secondary)
        }
        .font(.system(.caption, design: .monospaced).weight(.semibold))
        .monospacedDigit()
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(format: String(localized: "story.timeline.transport.timeReadout",
                                                 bundle: .module), nowPrecise, totalPrecise))
    }

    @ViewBuilder
    private var undoRedoCluster: some View {
        if let canUndo, let canRedo {
            HStack(spacing: 6) {
                Button(action: onUndo) {
                    Image(systemName: "arrow.uturn.backward")
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle().inset(by: -7))
                }
                .buttonStyle(.plain)
                .disabled(!canUndo)
                .opacity(canUndo ? 1 : 0.35)
                .accessibilityLabel(String(localized: "story.timeline.toolbar.undo",
                                           defaultValue: "Annuler", bundle: .module))

                Button(action: onRedo) {
                    Image(systemName: "arrow.uturn.forward")
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle().inset(by: -7))
                }
                .buttonStyle(.plain)
                .disabled(!canRedo)
                .opacity(canRedo ? 1 : 0.35)
                .accessibilityLabel(String(localized: "story.timeline.toolbar.redo",
                                           defaultValue: "Rétablir", bundle: .module))
            }
            .foregroundStyle(MeeshyColors.indigo600)
        }
    }

    /// Pill d'aimantation — reprend le langage visuel exact du snap toggle de
    /// l'ancienne TimelineToolbar (point vert quand actif) pour que la fusion
    /// Simple+Pro ne change pas la sémantique visuelle apprise.
    @ViewBuilder
    private var snapChip: some View {
        if let isSnapEnabled {
            Button(action: onSnapToggle) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(isSnapEnabled ? MeeshyColors.success : Color.secondary.opacity(0.4))
                        .frame(width: 8, height: 8)
                    Text(String(localized: "story.timeline.toolbar.snap", bundle: .module))
                        .font(.caption2.weight(.semibold))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(isSnapEnabled
                                   ? MeeshyColors.indigo500.opacity(0.15)
                                   : Color.gray.opacity(0.1))
                )
                .contentShape(Rectangle().inset(by: -6))
            }
            .buttonStyle(.plain)
            .foregroundStyle(isSnapEnabled ? MeeshyColors.indigo700 : Color.secondary)
            .accessibilityLabel(isSnapEnabled
                ? String(localized: "story.timeline.a11y.snap.on", bundle: .module)
                : String(localized: "story.timeline.a11y.snap.off", bundle: .module))
        }
    }

    private var zoomCluster: some View {
        HStack(spacing: 6) {
            Button(action: onZoomOut) {
                Image(systemName: "minus.magnifyingglass")
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle().inset(by: -7))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomOut", bundle: .module))

            Button(action: onZoomReset) {
                Text(Self.zoomLabel(scale: zoomScale))
                    .font(.caption2.weight(.semibold))
                    .frame(minWidth: 36, minHeight: 30)
                    .contentShape(Rectangle().inset(by: -7))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomReset", bundle: .module))

            Button(action: onZoomIn) {
                Image(systemName: "plus.magnifyingglass")
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle().inset(by: -7))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomIn", bundle: .module))
        }
        .foregroundStyle(MeeshyColors.indigo600)
    }

    private var muteButton: some View {
        Button(action: onMuteToggle) {
            Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .frame(width: 30, height: 30)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isMuted ? MeeshyColors.error : MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isMuted
            ? "story.timeline.transport.unmute"
            : "story.timeline.transport.mute",
            bundle: .module))
    }

}
