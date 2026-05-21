import SwiftUI
import MeeshySDK

/// Registry partagée du mute per-piste pour les chips audio du reader.
///
/// Source de vérité unique pour l'icône du chip (`waveform` vs
/// `waveform.slash`) ET pour la commande envoyée à `ReaderAudioMixer`.
/// `StoryCanvasUIView` souscrit au `$muted` Publisher en mode `.play` et
/// applique chaque changement via `setMute(_:for:)` sur le mixer.
///
/// Le scope est volontairement global : un seul reader est actif à la fois
/// (la PlaybackCoordinator garantit l'exclusivité). À chaque changement de
/// slide / story, appeler `clear()` pour repartir d'un état neutre.
@MainActor
public final class StoryReaderAudioMuteRegistry: ObservableObject {

    public static let shared = StoryReaderAudioMuteRegistry()

    @Published public private(set) var muted: Set<String> = []

    public init() {}

    public func isMuted(_ audioId: String) -> Bool { muted.contains(audioId) }

    @discardableResult
    public func toggle(_ audioId: String) -> Bool {
        if muted.contains(audioId) {
            muted.remove(audioId)
            return false
        }
        muted.insert(audioId)
        return true
    }

    public func clear() {
        guard !muted.isEmpty else { return }
        muted.removeAll()
    }
}

/// Playhead courant du reader (en secondes, relatif à l'origine de la
/// slide). Source de vérité unique : la `currentTime` du
/// `StoryCanvasUIView` en mode `.play`, alimentée par son `CADisplayLink`
/// — c'est le même clock qui pilote le rendu (keyframes texte, fades,
/// scheduling audio host-time). Bien plus précis que la `progress` (0..1)
/// du timer SwiftUI qui ignore le temps réel d'arrivée des médias.
///
/// Throttling : on ne re-publie que si le delta dépasse `quantum` (33 ms,
/// soit ~30 Hz). Suffisant pour gater la fenêtre `startTime..end` du
/// `AudioForegroundReaderOverlay` sans déclencher 60 re-renders/sec sur
/// les vues observatrices.
@MainActor
public final class StoryReaderPlayheadState: ObservableObject {

    public static let shared = StoryReaderPlayheadState()

    @Published public private(set) var elapsedSeconds: TimeInterval = 0

    /// Seuil minimum entre deux publications (≈ 30 Hz).
    public static let quantum: TimeInterval = 1.0 / 30.0

    public init() {}

    public func publish(_ seconds: TimeInterval) {
        let next = max(0, seconds)
        if abs(next - elapsedSeconds) >= Self.quantum {
            elapsedSeconds = next
        }
    }

    public func reset() {
        guard elapsedSeconds != 0 else { return }
        elapsedSeconds = 0
    }
}

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
    /// Observée uniquement en mode reader — pilote l'icône `waveform.slash`
    /// quand l'utilisateur a coupé cette piste depuis le chip.
    @ObservedObject private var muteRegistry = StoryReaderAudioMuteRegistry.shared

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
            iconView
                .frame(width: 18, height: 18)
            AudioForegroundSineWave(paused: isUserMuted)
                .frame(width: 54, height: 18)
                .opacity(isUserMuted ? 0.35 : 1.0)
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

    /// L'icône bascule entre un gradient brand (audible) et un gris clair
    /// (mutée). Split en `@ViewBuilder` pour rester iOS 16 compatible :
    /// `AnyShapeStyle` n'existe qu'à partir d'iOS 17, donc on applique deux
    /// modifiers différents au lieu d'un computed `var: some ShapeStyle`.
    @ViewBuilder
    private var iconView: some View {
        let icon = Image(systemName: iconName)
            .font(.system(size: 14, weight: .bold))
        if isUserMuted {
            icon.foregroundColor(.white.opacity(0.55))
        } else {
            icon.foregroundStyle(MeeshyColors.brandGradient)
        }
    }

    /// `isUserMuted` ne s'applique qu'au mode reader (la registry n'a pas de
    /// sens pour les audios en cours d'édition côté composer).
    private var isUserMuted: Bool {
        mode == .reader && muteRegistry.isMuted(audioObject.id)
    }

    private var iconName: String {
        isUserMuted ? "waveform.slash" : "waveform"
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
    let paused: Bool

    init(paused: Bool = false) { self.paused = paused }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: paused)) { context in
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
    public let slideDuration: TimeInterval
    /// Fallback utilisé uniquement si le canvas n'a pas (encore) publié de
    /// playhead — typiquement avant la première frame du `displayLink`.
    /// Une fois `StoryReaderPlayheadState.elapsedSeconds > 0`, ce paramètre
    /// est ignoré.
    public let fallbackElapsedTime: TimeInterval
    /// Hook optionnel pour le caller (haptic supplémentaire, logging, …).
    /// L'overlay gère lui-même le toggle dans `StoryReaderAudioMuteRegistry`
    /// — `StoryCanvasUIView` souscrit à la registry et applique au mixer.
    public let onTap: ((StoryAudioPlayerObject) -> Void)?

    @ObservedObject private var playhead = StoryReaderPlayheadState.shared

    public init(foregroundAudios: [StoryAudioPlayerObject],
                slideDuration: TimeInterval,
                fallbackElapsedTime: TimeInterval = 0,
                onTap: ((StoryAudioPlayerObject) -> Void)? = nil) {
        self.foregroundAudios = foregroundAudios
        self.slideDuration = slideDuration
        self.fallbackElapsedTime = fallbackElapsedTime
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
                    onTap: {
                        HapticFeedback.light()
                        StoryReaderAudioMuteRegistry.shared.toggle(audio.id)
                        onTap?(audio)
                    }
                )
            }
        }
    }

    /// Playhead effectif : le clock canvas dès qu'il a commencé à publier,
    /// sinon le fallback fourni par le caller (typiquement
    /// `progress × duration` côté SwiftUI viewer).
    private var elapsedTime: TimeInterval {
        playhead.elapsedSeconds > 0 ? playhead.elapsedSeconds : fallbackElapsedTime
    }

    /// Filtre :
    /// - exclut les audios background (le bg n'a pas de chip visuel — il joue
    ///   en boucle sur toute la slide).
    /// - garde ceux dont la fenêtre `start..end` contient `elapsedTime`.
    ///   `start` par défaut = 0, `end` par défaut = `slideDuration`.
    private var visibleAudios: [StoryAudioPlayerObject] {
        let now = elapsedTime
        return foregroundAudios.filter { audio in
            guard audio.isBackground != true else { return false }
            let start = Double(audio.startTime ?? 0)
            let end = audio.duration.map { start + Double($0) } ?? slideDuration
            return now >= start && now <= end
        }
    }
}
