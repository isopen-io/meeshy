import SwiftUI
import UIKit
import MeeshySDK

/// Single video clip rendered inside a track lane.
/// Includes : color tint (success green), frame strip, fade gradients, trim
/// handles, drag, accessibility label & VoiceOver actions.
public struct VideoClipBar: View, Equatable {

    public static func == (lhs: VideoClipBar, rhs: VideoClipBar) -> Bool {
        lhs.clipId == rhs.clipId
            && lhs.title == rhs.title
            && lhs.startTime == rhs.startTime
            && lhs.duration == rhs.duration
            && lhs.fadeIn == rhs.fadeIn
            && lhs.fadeOut == rhs.fadeOut
            && lhs.isSelected == rhs.isSelected
            && lhs.isLocked == rhs.isLocked
            && lhs.isDark == rhs.isDark
            && lhs.geometry == rhs.geometry
            && lhs.laneHeight == rhs.laneHeight
            && lhs.frames.count == rhs.frames.count
            && lhs.videoURL == rhs.videoURL
            && lhs.imageURL == rhs.imageURL
            && lhs.isMuted == rhs.isMuted
            && VolumeCurveOverlay.volumeSignature(lhs.keyframes)
                == VolumeCurveOverlay.volumeSignature(rhs.keyframes)
    }

    public let clipId: String
    public let title: String
    public let startTime: Float
    public let duration: Float
    public let fadeIn: Float
    public let fadeOut: Float
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let frames: [UIImage]
    /// URL locale de la vidéo — quand `frames` est vide, la barre extrait
    /// elle-même son filmstrip (async, caché par `VideoFilmstrip`). Les
    /// vignettes manquantes rendaient les clips vidéo illisibles (retour
    /// user 2026-07-11 : « je ne vois pas les thumbnails »).
    public let videoURL: URL?
    /// URL locale de l'IMAGE — fallback quand le bitmap de session
    /// (`loadedImages`) n'existe plus (draft restauré, repost) : la barre
    /// charge sa vignette depuis le cache disque (ImageStill, downsamplée).
    public let imageURL: URL?
    /// Points d'automation du clip — seule leur composante `volume` est
    /// tracée, en lecture seule. L'édition passe par la fiche.
    public let keyframes: [StoryKeyframe]
    /// Piste coupée par l'auteur (`media.volume <= 0` — la persistance du
    /// mute). Pilote l'icône du bouton mute et le badge d'état.
    public let isMuted: Bool
    /// Mute UN-BOUTON de la piste vidéo. Non-nil → bouton haut-parleur visible
    /// en bas-droite (le haut-droite porte déjà le cadenas des fonds) ; nil →
    /// aucun bouton (clips image / fonds synthétiques, rien à couper).
    public let onToggleMute: (() -> Void)?
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onTrimStartDelta: (CGFloat) -> Void
    public let onTrimEndDelta: (CGFloat) -> Void
    public let onMoveDelta: (CGFloat) -> Void
    /// Fired when the move drag ends so the caller can commit the move as
    /// an undoable command and clear the in-flight drag state. Without this
    /// the drift snowballs across frames because each `onChanged` re-reads
    /// the (already-mutated) clip start.
    public let onMoveEnded: () -> Void

    private var width: CGFloat { geometry.width(for: duration) }
    private var xOrigin: CGFloat { geometry.x(for: startTime) }

    /// Bandes EMPILÉES du clip vidéo : titre en haut, courbe de volume au
    /// milieu, forme d'onde en bas.
    ///
    /// Trois calques parallèles plutôt que superposés. Superposée, la courbe
    /// barrait le titre dès que le volume passait à mi-course — et le niveau
    /// nominal, lui, se colle en haut : aucune position n'était sûre tant que
    /// les deux partageaient la même hauteur (constat visuel 2026-07-28,
    /// `VideoLaneCohabitationSnapshotTests`).
    public nonisolated static let titleBandHeight: CGFloat = 18
    /// Hauteur de la bande de forme d'onde, plaquée en bas du clip.
    public nonisolated static let waveformBandHeight: CGFloat = 16

    /// Filmstrip auto-extrait quand l'hôte ne fournit pas de frames (vidéos).
    /// Exclu de `==` (état interne, pas une prop visuelle d'entrée).
    @State private var loadedFrames: [UIImage] = []

    private var effectiveFrames: [UIImage] {
        frames.isEmpty ? loadedFrames : frames
    }

    /// Forme d'onde de la piste audio de la vidéo. Vide tant qu'elle n'est pas
    /// extraite, et vide pour toujours si la vidéo est muette : aucune bande
    /// n'est alors dessinée. Exclue de `==` (état interne).
    @State private var loadedWaveform: [Float] = []

    public var accessibilityComposed: String {
        String(
            format: String(localized: "story.timeline.a11y.clip.video", bundle: .module),
            title
        )
    }

    public init(
        clipId: String,
        title: String,
        startTime: Float,
        duration: Float,
        fadeIn: Float,
        fadeOut: Float,
        isSelected: Bool,
        isLocked: Bool,
        isDark: Bool,
        geometry: TimelineGeometry,
        laneHeight: CGFloat,
        frames: [UIImage],
        videoURL: URL? = nil,
        imageURL: URL? = nil,
        keyframes: [StoryKeyframe] = [],
        isMuted: Bool = false,
        onToggleMute: (() -> Void)? = nil,
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onTrimStartDelta: @escaping (CGFloat) -> Void,
        onTrimEndDelta: @escaping (CGFloat) -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void,
        onMoveEnded: @escaping () -> Void = {}
    ) {
        self.clipId = clipId
        self.title = title
        self.startTime = startTime
        self.duration = duration
        self.fadeIn = fadeIn
        self.fadeOut = fadeOut
        self.isSelected = isSelected
        self.isLocked = isLocked
        self.isDark = isDark
        self.geometry = geometry
        self.laneHeight = laneHeight
        self.frames = frames
        self.videoURL = videoURL
        self.imageURL = imageURL
        self.keyframes = keyframes
        self.isMuted = isMuted
        self.onToggleMute = onToggleMute
        self.onTap = onTap
        self.onDoubleTap = onDoubleTap
        self.onTrimStartDelta = onTrimStartDelta
        self.onTrimEndDelta = onTrimEndDelta
        self.onMoveDelta = onMoveDelta
        self.onMoveEnded = onMoveEnded
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            background
            framesStrip
            fadeGradients
            waveformBand
            volumeCurve
            titleLabel
            if isLocked { lockBadge }
            if onToggleMute != nil { muteToggleButton }
            if isSelected { selectionHalo }
            if ClipTrimHandles.shouldShow(isSelected: isSelected, isLocked: isLocked) {
                ClipTrimHandles(laneHeight: laneHeight,
                                onTrimStartDelta: onTrimStartDelta,
                                onTrimEndDelta: onTrimEndDelta)
            }
        }
        .frame(width: width, height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: xOrigin)
        .contentShape(Rectangle())
        // Le drag AVANT les taps et en HAUTE priorité. En basse priorité
        // (.gesture) il cédait au ScrollView horizontal de TimelineScrubArea ;
        // et le onLongPressGesture qui le précédait s'engageait à 0,4 s de
        // doigt immobile, donc un glissement lent — poser, hésiter, glisser —
        // ne démarrait jamais. minimumDistance: 4 laisse passer les taps, qui
        // ne translatent pas.
        .highPriorityGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
                .onEnded { _ in if !isLocked { onMoveEnded() } }
        )
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue(String(
            format: String(localized: "story.timeline.a11y.clip.timeRange", bundle: .module),
            startTime, duration
        ))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .task(id: videoURL ?? imageURL) {
            guard frames.isEmpty else { return }
            if let videoURL {
                loadedFrames = await VideoFilmstrip.frames(url: videoURL, count: 6,
                                                           maxHeight: laneHeight)
            } else if let imageURL,
                      let still = await ImageStill.thumbnail(url: imageURL,
                                                             maxHeight: laneHeight) {
                loadedFrames = [still]
            }
        }
        .task(id: videoURL) {
            guard let videoURL else { return }
            // `AVAudioFile` sait lire la piste audio d'un MP4. Un conteneur
            // sans son — ou qu'ExtAudioFile ne sait pas ouvrir — renvoie un
            // tableau vide, et la bande ne se dessine tout simplement pas.
            loadedWaveform = await AudioWaveform.samples(url: videoURL, count: 128)
        }
    }

    // MARK: - Subviews

    private var background: some View {
        Rectangle()
            .fill(backgroundFill)
    }

    /// Locked clips (synthetic background image lane) read as muted indigo so
    /// the user differentiates them at a glance from real video clips, which
    /// stay green to signal "live media you can edit."
    private var backgroundFill: Color {
        if isLocked {
            return isDark
                ? MeeshyColors.indigo700.opacity(0.45)
                : MeeshyColors.indigo300.opacity(0.55)
        }
        return MeeshyColors.success.opacity(isDark ? 0.32 : 0.22)
    }

    /// Tiny title chip so the user can read "Image de fond" / file name right
    /// on the clip without opening the inspector. Hidden when the clip is
    /// thinner than ~44pt to avoid overflow.
    @ViewBuilder
    private var titleLabel: some View {
        if width >= 44 && !title.isEmpty {
            VStack(spacing: 0) {
                HStack(spacing: 4) {
                    Text(title)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .shadow(color: .black.opacity(0.45), radius: 1, y: 0.5)
                }
                .padding(.horizontal, 8)
                .frame(height: Self.titleBandHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
            }
            .allowsHitTesting(false)
        }
    }

    /// Bouton mute UN TAP en BAS-droite (le haut-droite porte le cadenas des
    /// fonds). `.onTapGesture` plutôt que `Button` : un tap enfant prime sur
    /// les taps du conteneur, et le drag haute-priorité (minimumDistance 4)
    /// laisse passer un tap immobile — même recette que `ClipTrimHandles`.
    private var muteToggleButton: some View {
        Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            .font(.caption2)
            .padding(5)
            .background(Circle().fill(Color.black.opacity(isMuted ? 0.75 : 0.45)))
            .foregroundStyle(isMuted ? MeeshyColors.error : Color.white)
            .padding(3)
            .contentShape(Rectangle().inset(by: -6))
            .onTapGesture { onToggleMute?() }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            .accessibilityElement()
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isMuted
                ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
                : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }

    private var lockBadge: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "lock.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(4)
                    .background(
                        Circle().fill(MeeshyColors.indigo700.opacity(0.85))
                    )
                    .padding(4)
            }
            Spacer()
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var framesStrip: some View {
        HStack(spacing: 0) {
            ForEach(Array(effectiveFrames.enumerated()), id: \.offset) { _, image in
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: max(8, width / CGFloat(max(effectiveFrames.count, 1))),
                           height: laneHeight - 4)
                    .clipped()
            }
        }
        .opacity(0.85)
        .accessibilityHidden(true)
    }

    /// Bande de forme d'onde plaquée en bas du clip, sous les vignettes.
    ///
    /// En bas parce que le haut porte déjà le titre : superposées, les deux
    /// deviendraient illisibles. Elle reste absente pour une image ou une
    /// vidéo muette, plutôt que d'afficher une bande vide qui laisserait
    /// croire à un silence.
    @ViewBuilder
    private var waveformBand: some View {
        if !loadedWaveform.isEmpty {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                WaveformStrip(samples: loadedWaveform, tint: Color.white.opacity(0.7))
                    .frame(height: Self.waveformBandHeight)
            }
            .allowsHitTesting(false)
        }
    }

    /// Courbe d'automation du volume, en lecture seule, dans sa PROPRE bande —
    /// entre le titre et la forme d'onde, sans jamais les traverser.
    ///
    /// Même teinte que sur les pistes audio : c'est le même objet, il doit se
    /// reconnaître partout.
    @ViewBuilder
    private var volumeCurve: some View {
        if !keyframes.isEmpty {
            VStack(spacing: 0) {
                Color.clear.frame(height: Self.titleBandHeight)
                VolumeCurveOverlay(keyframes: keyframes,
                                   duration: duration,
                                   tint: MeeshyColors.warning)
                Color.clear.frame(height: Self.waveformBandHeight)
            }
        }
    }

    private var fadeGradients: some View {
        HStack(spacing: 0) {
            LinearGradient(colors: [Color.black.opacity(0.85), Color.black.opacity(0)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: max(0, geometry.width(for: fadeIn)))
            Spacer(minLength: 0)
            LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.85)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: max(0, geometry.width(for: fadeOut)))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var selectionHalo: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .stroke(MeeshyColors.indigo400, lineWidth: 2)
            .shadow(color: MeeshyColors.indigo500.opacity(0.45), radius: 6)
            .allowsHitTesting(false)
    }

}
