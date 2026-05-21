import SwiftUI
import MeeshySDK

/// Chip glass affichant un audio foreground sur le canvas.
///
/// Capsule `.ultraThinMaterial` + icône audio + onde sinusoïdale animée.
/// Position dérivée des coordonnées normalisées `x`/`y` du modèle.
///
/// Deux modes :
/// - `.composer` : drag actif (commit `x`/`y` au release pour éviter le
///   scintillement des vues observant le VM à chaque tick), tap = sélection.
/// - `.reader`  : pas de drag, tap absorbé pour bloquer la navigation
///   gauche/droite entre slides (le caller décide de l'action — typiquement
///   toggle mute global).
@MainActor
public struct AudioForegroundChip: View {

    public enum Mode: Sendable {
        case composer
        case reader
    }

    @Binding public var audioObject: StoryAudioPlayerObject
    public let canvasSize: CGSize
    public let mode: Mode
    public let isSelected: Bool
    public let onDragEnd: () -> Void
    public let onTap: () -> Void

    @GestureState private var dragOffset: CGSize = .zero
    @Environment(\.colorScheme) private var colorScheme

    public init(audioObject: Binding<StoryAudioPlayerObject>,
                canvasSize: CGSize,
                mode: Mode = .composer,
                isSelected: Bool = false,
                onDragEnd: @escaping () -> Void = {},
                onTap: @escaping () -> Void = {}) {
        self._audioObject = audioObject
        self.canvasSize = canvasSize
        self.mode = mode
        self.isSelected = isSelected
        self.onDragEnd = onDragEnd
        self.onTap = onTap
    }

    public var body: some View {
        Group {
            switch mode {
            case .composer:
                positionedChip.gesture(dragGesture)
            case .reader:
                positionedChip
            }
        }
    }

    private var positionedChip: some View {
        chipContent
            .position(
                x: max(0, min(canvasSize.width, audioObject.x * canvasSize.width)) + dragOffset.width,
                y: max(0, min(canvasSize.height, audioObject.y * canvasSize.height)) + dragOffset.height
            )
            // `.onTapGesture` consomme le tap : en mode reader le chip se trouve
            // dans un layer ZStack au-dessus du `StoryGestureOverlayView`, donc
            // la navigation gauche/droite ne se déclenche pas.
            .onTapGesture(perform: onTap)
            .accessibilityLabel("Audio foreground")
            .accessibilityAddTraits(.isButton)
    }

    private var chipContent: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(MeeshyColors.brandGradient)
                .frame(width: 18, height: 18)
            AudioForegroundSineWave()
                .frame(width: 54, height: 18)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(
            Capsule()
                .stroke(strokeColor, lineWidth: isSelected ? 2 : 1)
        )
        .contentShape(Capsule())
    }

    private var strokeColor: Color {
        isSelected
            ? MeeshyColors.indigo400
            : (colorScheme == .dark ? Color.white.opacity(0.25) : MeeshyColors.indigo950.opacity(0.18))
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in state = value.translation }
            .onEnded { value in
                guard canvasSize.width > 0, canvasSize.height > 0 else { return }
                let nextX = audioObject.x + value.translation.width / canvasSize.width
                let nextY = audioObject.y + value.translation.height / canvasSize.height
                audioObject.x = min(1, max(0, nextX))
                audioObject.y = min(1, max(0, nextY))
                onDragEnd()
            }
    }
}

/// Onde sinusoïdale animée — TimelineView pour ne pas re-render le parent à
/// chaque frame (sinon toutes les vues observant le ViewModel scintillent).
@MainActor
struct AudioForegroundSineWave: View {
    var body: some View {
        TimelineView(.animation) { context in
            Canvas { ctx, size in
                let t = context.date.timeIntervalSinceReferenceDate
                let midY = size.height / 2
                let amp = size.height / 2 * 0.8
                let step: CGFloat = 1.5
                var path = Path()
                var x: CGFloat = 0
                var first = true
                while x <= size.width {
                    let phase = t * 3.0 + Double(x) * 0.22
                    let y = midY + CGFloat(sin(phase)) * amp
                    if first {
                        path.move(to: CGPoint(x: x, y: y))
                        first = false
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                    x += step
                }
                ctx.stroke(path,
                           with: .color(.white.opacity(0.9)),
                           style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

/// Overlay reader : rend un `AudioForegroundChip` (mode `.reader`) pour chaque
/// audio foreground de la slide ACTUELLEMENT dans sa fenêtre de lecture
/// (`startTime` ... `startTime + duration`). Hors fenêtre → masqué (pas
/// d'animation gaspillée). Tap absorbé par le chip → propagation bloquée vers
/// la navigation gauche/droite du `StoryGestureOverlayView`.
@MainActor
public struct AudioForegroundReaderOverlay: View {

    public let foregroundAudios: [StoryAudioPlayerObject]
    public let elapsedTime: TimeInterval
    public let slideDuration: TimeInterval
    public let onTap: (StoryAudioPlayerObject) -> Void

    public init(foregroundAudios: [StoryAudioPlayerObject],
                elapsedTime: TimeInterval,
                slideDuration: TimeInterval,
                onTap: @escaping (StoryAudioPlayerObject) -> Void) {
        self.foregroundAudios = foregroundAudios
        self.elapsedTime = elapsedTime
        self.slideDuration = slideDuration
        self.onTap = onTap
    }

    public var body: some View {
        GeometryReader { geo in
            ForEach(visibleAudios, id: \.id) { audio in
                AudioForegroundChip(
                    audioObject: .constant(audio),
                    canvasSize: geo.size,
                    mode: .reader,
                    isSelected: false,
                    onTap: { onTap(audio) }
                )
            }
        }
    }

    /// Filtre :
    /// - exclut les audios background (le bg n'a pas de chip visuel — il joue
    ///   en boucle sur toute la slide).
    /// - garde ceux dont la fenêtre `start..end` contient `elapsedTime`.
    ///   `start` par défaut = 0, `end` par défaut = `slideDuration`.
    private var visibleAudios: [StoryAudioPlayerObject] {
        foregroundAudios.filter { audio in
            guard audio.isBackground != true else { return false }
            let start = Double(audio.startTime ?? 0)
            let end = audio.duration.map { start + Double($0) } ?? slideDuration
            return elapsedTime >= start && elapsedTime <= end
        }
    }
}
