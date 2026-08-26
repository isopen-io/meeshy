import SwiftUI
import Combine
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    public static let shared = StoryReaderPlayheadState()

    /// `nil` = aucun tick reçu depuis le dernier `reset()` (slide qui démarre,
    /// ou canvas en `.edit`). Sinon, dernière valeur publiée par le
    /// `CADisplayLink`. Distinguer `nil` d'un `0` légitime permet aux consumers
    /// de basculer proprement vers un fallback sans recourir à un sentinel
    /// `> 0` ambigu (le canvas démarre légitimement à 0 sur chaque slide).
    @Published public private(set) var elapsedSeconds: TimeInterval?

    /// Seuil minimum entre deux publications (≈ 30 Hz).
    public static let quantum: TimeInterval = 1.0 / 30.0

    public init() {}

    public func publish(_ seconds: TimeInterval) {
        let next = max(0, seconds)
        if let current = elapsedSeconds {
            if abs(next - current) >= Self.quantum {
                elapsedSeconds = next
            }
        } else {
            elapsedSeconds = next
        }
    }

    public func reset() {
        guard elapsedSeconds != nil else { return }
        elapsedSeconds = nil
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
///   gauche/droite entre slides. L'overlay parent gère l'état mute.
///
/// **Leaf view pure** — pas d'`@ObservedObject` sur des singletons. `isUserMuted`
/// est un input primitif `let`, l'observateur de la registry vit dans
/// `AudioForegroundReaderOverlay`. Conforme à la règle CLAUDE.md
/// "Zero Unnecessary Re-render" : la chip ne se ré-évalue que si ses inputs
/// `Equatable` changent (id, position, mute, sélection).
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
    public let isUserMuted: Bool
    public let onDragEnd: () -> Void
    public let onTap: () -> Void
    /// Tap sur l'icône (mode `.composer`) → coupe / réactive le son de cette
    /// piste. Le composer persiste via le `volume` du modèle (0 = muet).
    public let onToggleMute: () -> Void
    /// Durée de la slide, fournie par le READER (l'overlay la possède) —
    /// arme le compte à rebours « · M:SS » du crédit défilant. Le composer
    /// n'en passe pas : son canvas `.edit` n'alimente pas le playhead, un
    /// compteur y serait un chiffre mort.
    public let slideDuration: TimeInterval?

    @GestureState private var dragOffset: CGSize = .zero
    @Environment(\.colorScheme) private var colorScheme

    public init(audioObject: Binding<StoryAudioPlayerObject>,
                canvasSize: CGSize,
                mode: Mode = .composer,
                isSelected: Bool = false,
                isUserMuted: Bool = false,
                slideDuration: TimeInterval? = nil,
                onDragEnd: @escaping () -> Void = {},
                onTap: @escaping () -> Void = {},
                onToggleMute: @escaping () -> Void = {}) {
        self._audioObject = audioObject
        self.canvasSize = canvasSize
        self.mode = mode
        self.isSelected = isSelected
        self.isUserMuted = isUserMuted
        self.slideDuration = slideDuration
        self.onDragEnd = onDragEnd
        self.onTap = onTap
        self.onToggleMute = onToggleMute
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
            .accessibilityLabel(accessibilityTitle)
            .accessibilityValue(accessibilityValueLabel)
            .accessibilityHint(accessibilityHintLabel)
            .accessibilityAddTraits(.isButton)
    }

    private var chipContent: some View {
        HStack(spacing: 8) {
            muteToggleIcon
                .frame(width: 18, height: 18)
            // Son de bibliothèque → crédit défilant « titre · @pseudo · M:SS » ;
            // piste propre (première publication) → sinusoïde, comme toujours.
            // Le compteur ne s'arme qu'au reader (slideDuration fourni) — le
            // frame s'élargit alors juste assez pour loger « · M:SS ».
            //
            // Passe par le résolveur PROMU (B8f, arbitrage 9) plutôt que par
            // `resolve` : le cache froid (métadonnées non résolues) reste
            // dans la forme CRÉDIT, jamais la sinusoïde qui mentirait sur la
            // provenance d'une piste empruntée (constat 9).
            switch AudioChipDisplay.display(for: AudioChipDisplay.backgroundAnnouncement(
                sound: AudioChipDisplay.borrowedSound(soundId: audioObject.soundId),
                libraryTitle: audioObject.name,
                libraryUsername: audioObject.soundAuthorUsername,
                libraryDuration: nil
            )) {
            case .marquee(let text):
                AudioChipMarquee(text: text,
                                 paused: isUserMuted,
                                 window: readerPlaybackWindow)
                    .frame(width: readerPlaybackWindow == nil ? 92 : 124, height: 18)
                    .opacity(isUserMuted ? 0.55 : 1.0)
            case .waveform:
                AudioForegroundSineWave(paused: isUserMuted)
                    .frame(width: 54, height: 18)
                    .opacity(isUserMuted ? 0.35 : 1.0)
            }
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

    /// Icône audio = bouton mute en mode composer (tap → coupe/réactive le
    /// son), simple indicateur en mode reader (l'overlay parent gère le toggle).
    @ViewBuilder
    private var muteToggleIcon: some View {
        switch mode {
        case .composer:
            Button(action: onToggleMute) { iconView }
                .buttonStyle(.plain)
                .accessibilityLabel(isUserMuted
                    ? "Activer le son de cette piste"
                    : "Couper le son de cette piste")
        case .reader:
            iconView
        }
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

    private var iconName: String {
        isUserMuted ? "waveform.slash" : "waveform"
    }

    /// Fenêtre du secteur pour le compteur du marquee — mêmes primitives et
    /// même fin de fenêtre que `AudioForegroundReaderOverlay.visibleAudios`
    /// (le compteur atteint 0:00 exactement quand la chip disparaît).
    /// `nil` hors reader : pas de compteur.
    private var readerPlaybackWindow: AudioChipPlaybackWindow? {
        guard let slideDuration else { return nil }
        return AudioChipPlaybackWindow(
            startTime: audioObject.startTime.map(TimeInterval.init),
            duration: audioObject.duration.map(TimeInterval.init),
            isBackground: audioObject.isBackground == true,
            slideDuration: slideDuration)
    }

    private var strokeColor: Color {
        isSelected
            ? MeeshyColors.indigo400
            : (colorScheme == .dark ? Color.white.opacity(0.25) : MeeshyColors.indigo950.opacity(0.18))
    }

    // MARK: Accessibility strings

    private var accessibilityTitle: String { "Audio foreground" }

    private var accessibilityValueLabel: String {
        switch mode {
        case .composer:
            return isSelected ? "Sélectionné" : "Non sélectionné"
        case .reader:
            return isUserMuted ? String(localized: "story.audio.chip.muted", defaultValue: "Coupé", bundle: .module) : String(localized: "story.audio.chip.active", defaultValue: "Actif", bundle: .module)
        }
    }

    private var accessibilityHintLabel: String {
        switch mode {
        case .composer:
            return String(localized: "story.audio.chip.hint.composer", defaultValue: "Double tap pour sélectionner. Faites glisser pour déplacer.", bundle: .module)
        case .reader:
            return String(localized: "story.audio.chip.hint.reader", defaultValue: "Double tap pour couper ou activer cette piste audio.", bundle: .module)
        }
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

/// Mini-waveform de badge : barres statiques dessinées depuis les samples
/// réels de la piste (~80 extraits à la composition), sinusoïde animée en
/// repli quand la piste n'en porte pas (payloads antérieurs). Atome pur —
/// paramètres opaques, aucune décision produit.
@MainActor
public struct StoryWaveformBadgeView: View {
    public let samples: [Float]
    public let paused: Bool

    public init(samples: [Float], paused: Bool = false) {
        self.samples = samples
        self.paused = paused
    }

    public var body: some View {
        if samples.isEmpty {
            AudioForegroundSineWave(paused: paused)
        } else {
            Canvas { ctx, size in
                let bars = Self.downsample(samples, to: 24)
                let barWidth = size.width / CGFloat(bars.count)
                let centerY = size.height / 2
                for (index, sample) in bars.enumerated() {
                    let x = CGFloat(index) * barWidth + barWidth / 2
                    let height = max(2, CGFloat(sample) * size.height * 0.9)
                    ctx.fill(
                        Path(roundedRect: CGRect(x: x - barWidth * 0.3,
                                                 y: centerY - height / 2,
                                                 width: barWidth * 0.6,
                                                 height: height),
                             cornerRadius: barWidth * 0.3),
                        with: .color(.white.opacity(0.9))
                    )
                }
            }
        }
    }

    /// Downsample par MAX de bucket — le max préserve les pics visuels que la
    /// moyenne écraserait. Pur + testable.
    nonisolated public static func downsample(_ samples: [Float], to buckets: Int) -> [Float] {
        guard buckets > 0, samples.count > buckets else { return samples }
        let bucketSize = Double(samples.count) / Double(buckets)
        return (0..<buckets).map { bucket in
            let start = Int(Double(bucket) * bucketSize)
            let end = min(samples.count, Int(Double(bucket + 1) * bucketSize))
            return samples[start..<max(start + 1, end)].max() ?? 0
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

/// Onde animée COMPACTE du header du reader : posée à la suite de la note
/// musicale, elle signale qu'un audio de fond accompagne la story — la note
/// dit la présence, l'onde dit que ça joue.
///
/// Taille imposée par construction : le `Canvas` sous-jacent s'étirerait à
/// tout l'espace disponible dans un `HStack` sans cadre explicite.
///
/// Décorative pour VoiceOver : la note musicale voisine porte déjà le label
/// « Audio de fond », une seconde annonce serait redondante.
///
/// Reduce Motion (système OU override in-app) fige l'onde sur sa silhouette
/// courante plutôt que d'animer en boucle — même doctrine que
/// `ReelAudioBackdrop`.
@MainActor
public struct StoryHeaderAudioWaveform: View {

    public let width: CGFloat
    public let height: CGFloat
    /// Gel demandé par l'appelant (lecture en pause côté reader).
    public let paused: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    public init(width: CGFloat = 26, height: CGFloat = 10, paused: Bool = false) {
        self.width = width
        self.height = height
        self.paused = paused
    }

    public var body: some View {
        AudioForegroundSineWave(
            paused: paused || MeeshyMotion.shouldReduce(system: systemReduceMotion,
                                                        userForced: userForcedReduceMotion)
        )
        .frame(width: width, height: height)
        .accessibilityHidden(true)
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
    /// Fallback utilisé uniquement quand `StoryReaderPlayheadState.elapsedSeconds`
    /// est `nil` (aucun tick reçu — slide qui démarre, ou canvas en `.edit`).
    /// `nil` ici → on traite comme `0` (chip visible si la fenêtre couvre 0).
    public let fallbackElapsedTime: TimeInterval?
    /// Hook optionnel pour le caller (haptic supplémentaire, logging, …).
    /// L'overlay gère lui-même le toggle dans `StoryReaderAudioMuteRegistry`
    /// — `StoryCanvasUIView` souscrit à la registry et applique au mixer.
    public let onTap: ((StoryAudioPlayerObject) -> Void)?

    @ObservedObject private var playhead = StoryReaderPlayheadState.shared
    @ObservedObject private var muteRegistry = StoryReaderAudioMuteRegistry.shared

    public init(foregroundAudios: [StoryAudioPlayerObject],
                slideDuration: TimeInterval,
                fallbackElapsedTime: TimeInterval? = nil,
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
                    isUserMuted: Self.chipShowsMuted(
                        viewerMuted: muteRegistry.isMuted(audio.id),
                        audio: audio),
                    slideDuration: slideDuration,
                    onTap: {
                        HapticFeedback.light()
                        StoryReaderAudioMuteRegistry.shared.toggle(audio.id)
                        onTap?(audio)
                    }
                )
            }
        }
        // Quand l'overlay disparaît (viewer fermé), reset les états partagés
        // pour ne pas fuiter vers le prochain cycle (re-entry rapide sur la
        // même story sinon le mute persiste).
        .onDisappear {
            StoryReaderAudioMuteRegistry.shared.clear()
            StoryReaderPlayheadState.shared.reset()
        }
    }

    /// Playhead effectif : le clock canvas dès qu'un tick a été publié,
    /// sinon le fallback fourni par le caller, sinon `0`.
    private var elapsedTime: TimeInterval {
        playhead.elapsedSeconds ?? fallbackElapsedTime ?? 0
    }

    private var visibleAudios: [StoryAudioPlayerObject] {
        Self.visibleAudios(in: foregroundAudios,
                           elapsed: elapsedTime,
                           slideDuration: slideDuration)
    }

    /// État muet AFFICHÉ par le chip reader — pur, extrait pour tests.
    ///
    /// Deux sources de silence coexistent et l'icône doit refléter l'OU des
    /// deux : le mute du VIEWER (tap sur le chip, per-session, registry) et le
    /// mute de l'AUTEUR (`volume == 0` persisté au modèle — le mixer tient
    /// alors la piste à zéro quoi qu'il arrive). Sans la seconde, une piste
    /// coupée par l'auteur affichait une onde animée « audible » que rien ne
    /// faisait sonner.
    public static func chipShowsMuted(viewerMuted: Bool,
                                      audio: StoryAudioPlayerObject) -> Bool {
        viewerMuted || audio.isMuted
    }

    /// Filtre pur (extrait pour tests).
    /// - Exclut les audios background (le bg n'a pas de chip visuel — il joue
    ///   en boucle sur toute la slide).
    /// - Garde ceux dont la fenêtre `[start, end]` contient `elapsed`.
    ///   `start` par défaut = `0`, `end` par défaut = `slideDuration`.
    public static func visibleAudios(in audios: [StoryAudioPlayerObject],
                                     elapsed: TimeInterval,
                                     slideDuration: TimeInterval) -> [StoryAudioPlayerObject] {
        audios.filter { audio in
            guard audio.isBackground != true else { return false }
            let start = Double(audio.startTime ?? 0)
            let end = audio.duration.map { start + Double($0) } ?? slideDuration
            return elapsed >= start && elapsed <= end
        }
    }
}
