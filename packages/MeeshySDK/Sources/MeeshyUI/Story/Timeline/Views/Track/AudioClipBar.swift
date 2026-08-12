import SwiftUI
import MeeshySDK

public struct AudioClipBar: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: AudioClipBar, rhs: AudioClipBar) -> Bool {
        lhs.clipId == rhs.clipId
            && lhs.title == rhs.title
            && lhs.startTime == rhs.startTime
            && lhs.duration == rhs.duration
            && lhs.volume == rhs.volume
            && lhs.isMuted == rhs.isMuted
            && lhs.isSelected == rhs.isSelected
            && lhs.isLocked == rhs.isLocked
            && lhs.isDark == rhs.isDark
            && lhs.geometry == rhs.geometry
            && lhs.laneHeight == rhs.laneHeight
            && lhs.waveformSamples == rhs.waveformSamples
            && lhs.audioURL == rhs.audioURL
            && VolumeCurveOverlay.volumeSignature(lhs.keyframes)
                == VolumeCurveOverlay.volumeSignature(rhs.keyframes)
    }

    public let clipId: String
    public let title: String
    public let startTime: Float
    public let duration: Float
    public let volume: Float
    public let isMuted: Bool
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let waveformSamples: [Float]
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onMoveDelta: (CGFloat) -> Void
    /// Fired when the move drag ends so the caller can commit the move as
    /// an undoable command and clear the in-flight drag state. Without this
    /// the drift snowballs across frames because each `onChanged` re-reads
    /// the (already-mutated) clip start. Mirrors `VideoClipBar.onMoveEnded`.
    public let onMoveEnded: () -> Void
    /// Poignées de trim — la fenêtre d'un audio se règle au doigt (affichées
    /// à la sélection). Défauts no-op pour les call sites existants.
    public let onTrimStartDelta: (CGFloat) -> Void
    public let onTrimEndDelta: (CGFloat) -> Void
    /// URL locale du fichier — quand `waveformSamples` est vide (draft
    /// restauré, repost), la barre extrait elle-même sa forme d'onde
    /// (AudioWaveform, RMS + cache). Sans ça la lane audio était un aplat.
    public let audioURL: URL?
    /// Points d'automation du clip — seule leur composante `volume` est
    /// tracée, en lecture seule. L'édition passe par la fiche.
    public let keyframes: [StoryKeyframe]
    /// Mute UN-BOUTON de la piste. Non-nil → le badge haut-parleur devient un
    /// bouton TOUJOURS visible (toggle) ; nil → comportement historique, badge
    /// d'état affiché seulement quand la piste est coupée.
    public let onToggleMute: (() -> Void)?

    /// Forme d'onde auto-extraite (état interne, hors `==`).
    @State private var loadedSamples: [Float] = []

    var effectiveSamples: [Float] {
        Self.resolveSamples(local: loadedSamples, published: waveformSamples)
    }

    /// Arbitre entre les deux sources de forme d'onde.
    ///
    /// Le calcul local prime dès qu'il a abouti : il est en haute résolution et
    /// à l'amplitude réelle, alors que `waveformSamples` transporte 80 valeurs
    /// normalisées au pic — deux pistes de niveaux très différents s'y
    /// dessinaient à la même hauteur, ce qui rend le réglage d'un volume
    /// impossible à l'œil. Les valeurs publiées restent le repli des reposts et
    /// des brouillons restaurés, pour qui aucun fichier local n'existe.
    nonisolated static func resolveSamples(local: [Float], published: [Float]) -> [Float] {
        local.isEmpty ? published : local
    }

    public init(
        clipId: String, title: String, startTime: Float, duration: Float,
        volume: Float, isMuted: Bool, isSelected: Bool, isLocked: Bool,
        isDark: Bool, geometry: TimelineGeometry, laneHeight: CGFloat,
        waveformSamples: [Float],
        audioURL: URL? = nil,
        keyframes: [StoryKeyframe] = [],
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void,
        onMoveEnded: @escaping () -> Void = {},
        onTrimStartDelta: @escaping (CGFloat) -> Void = { _ in },
        onTrimEndDelta: @escaping (CGFloat) -> Void = { _ in },
        onToggleMute: (() -> Void)? = nil
    ) {
        self.clipId = clipId; self.title = title
        self.startTime = startTime; self.duration = duration
        self.volume = volume; self.isMuted = isMuted
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight; self.waveformSamples = waveformSamples
        self.audioURL = audioURL
        self.keyframes = keyframes
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onMoveDelta = onMoveDelta
        self.onMoveEnded = onMoveEnded
        self.onTrimStartDelta = onTrimStartDelta
        self.onTrimEndDelta = onTrimEndDelta
        self.onToggleMute = onToggleMute
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.clip.audio", bundle: .module), title)
    }

    public var accessibilityValueDescription: String {
        let pct = Int((volume * 100).rounded())
        let muted = isMuted
            ? String(localized: "story.timeline.a11y.audio.muted_suffix", bundle: .module)
            : ""
        return "Volume \(pct)%\(muted)"
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            Rectangle()
                .fill(MeeshyColors.warning.opacity(isDark ? 0.32 : 0.22))
            WaveformStrip(samples: effectiveSamples, tint: Color.white.opacity(0.85))
            volumeCurve
            titleOverlay
            if onToggleMute != nil {
                muteToggleButton
            } else if isMuted {
                muteBadge
            }
            if isSelected {
                RoundedRectangle(cornerRadius: 6).stroke(MeeshyColors.indigo400, lineWidth: 2)
                    .allowsHitTesting(false)
            }
            if ClipTrimHandles.shouldShow(isSelected: isSelected, isLocked: isLocked) {
                ClipTrimHandles(laneHeight: laneHeight,
                                onTrimStartDelta: onTrimStartDelta,
                                onTrimEndDelta: onTrimEndDelta)
            }
        }
        .frame(width: geometry.width(for: duration), height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: geometry.x(for: startTime))
        .contentShape(Rectangle())
        // Même composition que VideoClipBar : le drag en haute priorité AVANT
        // les taps, sans long-press. En basse priorité il cédait au ScrollView
        // horizontal, et le long-press à 0,4 s avalait le glissement lent.
        .highPriorityGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
                .onEnded { _ in if !isLocked { onMoveEnded() } }
        )
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue(accessibilityValueDescription)
        .task(id: audioURL) {
            guard waveformSamples.isEmpty, let audioURL else { return }
            loadedSamples = await AudioWaveform.samples(url: audioURL, count: 80)
        }
    }

    /// In-clip name chip — parity with `VideoClipBar.titleLabel` so audio
    /// clips also surface their content name without opening the inspector.
    /// Hidden under ~44pt to avoid colliding with the waveform on very
    /// short clips. Title typically arrives localised ("Audio") from the
    /// caller — the postMediaId UUID it used to receive was useless to
    /// users at the clip level.
    @ViewBuilder
    private var titleOverlay: some View {
        let width = geometry.width(for: duration)
        if width >= 44 && !title.isEmpty {
            VStack(spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white)
                        .accessibilityHidden(true)
                    Text(title)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .shadow(color: .black.opacity(0.45), radius: 1, y: 0.5)
                }
                .padding(.horizontal, 8)
                .frame(height: VideoClipBar.titleBandHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
            }
            .allowsHitTesting(false)
        }
    }

    /// Courbe d'automation — même teinte que sur les pistes vidéo, pour qu'elle
    /// se reconnaisse d'un coup d'œil quel que soit le type de piste.
    ///
    /// Elle laisse la bande de titre libre, comme sur la vidéo : superposée,
    /// elle barrait le nom du clip dès que le volume passait à mi-course. La
    /// forme d'onde, elle, occupe toute la hauteur — sur une piste audio elle
    /// EST le contenu, pas une bande d'appoint.
    @ViewBuilder
    private var volumeCurve: some View {
        if !keyframes.isEmpty {
            VStack(spacing: 0) {
                Color.clear.frame(height: VideoClipBar.titleBandHeight)
                VolumeCurveOverlay(keyframes: keyframes,
                                   duration: duration,
                                   tint: MeeshyColors.warning)
            }
        }
    }

    /// Bouton mute UN TAP, toujours visible sur le bord traînant du clip.
    /// `.onTapGesture` (pas `Button`) : un tap enfant prime sur les taps du
    /// conteneur, et le drag haute-priorité du clip (minimumDistance 4) laisse
    /// passer un tap immobile — même recette que `ClipTrimHandles`.
    private var muteToggleButton: some View {
        Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            .font(.caption2)
            .padding(5)
            .background(Circle().fill(Color.black.opacity(isMuted ? 0.75 : 0.45)))
            .foregroundStyle(isMuted ? MeeshyColors.error : Color.white)
            .padding(3)
            .contentShape(Rectangle().inset(by: -6))
            .onTapGesture { onToggleMute?() }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .accessibilityElement()
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isMuted
                ? String(localized: "story.audio.track.unmute", defaultValue: "Activer le son de cette piste", bundle: .module)
                : String(localized: "story.audio.track.mute", defaultValue: "Couper le son de cette piste", bundle: .module))
    }

    private var muteBadge: some View {
        // Force le badge sur le bord traînant ; sans `frame(alignment: .trailing)`
        // il hérite du `.leading` du `ZStack` parent et se superpose au
        // `titleOverlay` (icône waveform + titre) sur les clips ≥ 44 pt.
        Image(systemName: "speaker.slash.fill")
            .font(.caption2)
            .padding(4)
            .background(Circle().fill(Color.black.opacity(0.6)))
            .foregroundStyle(Color.white)
            .padding(4)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityHidden(true)
    }
}
