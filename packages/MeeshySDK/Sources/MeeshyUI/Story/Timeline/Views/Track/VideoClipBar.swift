import SwiftUI
import UIKit

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
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
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

    /// Filmstrip auto-extrait quand l'hôte ne fournit pas de frames (vidéos).
    /// Exclu de `==` (état interne, pas une prop visuelle d'entrée).
    @State private var loadedFrames: [UIImage] = []

    private var effectiveFrames: [UIImage] {
        frames.isEmpty ? loadedFrames : frames
    }

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
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
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
        self.onTap = onTap
        self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress
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
            titleLabel
            if isLocked { lockBadge }
            if isSelected { selectionHalo }
            if !isLocked {
                ClipTrimHandles(laneHeight: laneHeight,
                                onTrimStartDelta: onTrimStartDelta,
                                onTrimEndDelta: onTrimEndDelta)
            }
        }
        .frame(width: width, height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: xOrigin)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
                .onEnded { _ in if !isLocked { onMoveEnded() } }
        )
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
            HStack(spacing: 4) {
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .shadow(color: .black.opacity(0.45), radius: 1, y: 0.5)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .allowsHitTesting(false)
        }
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
