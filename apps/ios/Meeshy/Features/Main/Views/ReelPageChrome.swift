import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// Extrait de `ReelsPlayerView.swift` (#7625) : l'hôte dépassait le budget de
// 1 200 lignes et le préchauffage du pager devait y entrer. Le CHROME d'une
// page de réel — rangée méta, barre de lecture, poster.

// MARK: - Reel Language Flags (Prisme Linguistique)

/// Meta row for a reel — mirrors the conversation message-bubble footer
/// (`BubbleFooter.metaLeading`): the timestamp, then the translate toggle
/// (`🌐`, stable position), then the available-language flag pills. Tapping a
/// flag reads that language; the active one is underlined in its language color.
/// The translate toggle flips between the viewer's preferred translation and the
/// original. (Per-language is a LOCAL switch over the post's pre-loaded
/// translations — iOS has no on-demand post-translation request path.)
struct ReelMetaRow: View {
    let timestamp: String
    let originalLanguage: String?
    let translationLanguages: [String]
    let selectedLanguage: String?
    var onSelectLanguage: (String) -> Void

    /// Deduped, ordered (original first), capped at 4 to stay discreet.
    private var codes: [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        func add(_ raw: String?) {
            guard let code = raw, !code.isEmpty, !seen.contains(code.lowercased()) else { return }
            seen.insert(code.lowercased())
            ordered.append(code)
        }
        add(originalLanguage)
        translationLanguages.sorted().forEach { add($0) }
        return Array(ordered.prefix(4))
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(timestamp)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.65))

            if !codes.isEmpty {
                // Translation flags only (the translate toggle is disabled for now):
                // tap a flag to read that language; the active one is underlined.
                HStack(spacing: 6) {
                    ForEach(codes, id: \.self) { code in
                        // Registre `.overlay` : la rangée flotte au-dessus de la
                        // vidéo, dont le tap pilote la lecture. Des cibles de
                        // 44 pt y prendraient une bande de 44 pt au geste de
                        // lecture — 32 pt suffisent et restent au-dessus des
                        // ~16 pt que servait la puce d'origine.
                        LanguageFlagChip(
                            code: code,
                            isActive: selectedLanguage?.lowercased() == code.lowercased(),
                            metrics: .overlay
                        ) {
                            onSelectLanguage(code)
                        }
                    }
                }
            }
        }
        .shadow(color: .black.opacity(0.4), radius: 3, y: 1)
    }
}

// MARK: - Reel Scrub Bar

/// Draggable seek bar for the active reel video — Instagram-reels style: just
/// the track + thumb, no time numbers. Bound to the shared engine's
/// `currentTime` / `duration`; dragging seeks anywhere in the clip via
/// `seek(to:)`. Reuses the proven scrub pattern (GeometryReader + high-priority
/// drag so the horizontal pan wins over the vertical pager).
///
/// App-side (not an SDK atom): it is bound to the `SharedAVPlayerManager`
/// singleton and placed by a product decision (reels-only, no skip, no
/// tap-zones — the user explicitly chose the draggable bar only).
struct ReelScrubBar: View {
    @ObservedObject var manager: SharedAVPlayerManager
    let accentColor: String

    @State private var isSeeking = false
    @State private var seekFraction: Double = 0

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekFraction : manager.currentTime / manager.duration
    }

    var body: some View {
        track
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "reels.scrub", defaultValue: "Avancer ou reculer", bundle: .main))
            // No on-screen time numbers (Instagram-reels style), but VoiceOver
            // still announces playback position as a percentage.
            .accessibilityValue(LocalizedNumber.percent(Int((progress * 100).rounded())))
    }

    private var track: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 4
            let thumbSize: CGFloat = 14
            let filledWidth = geo.size.width * CGFloat(progress)

            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3)).frame(height: trackHeight)
                Capsule().fill(accent).frame(width: max(0, filledWidth), height: trackHeight)
                Circle().fill(Color.white).frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .scaleEffect(isSeeking ? 1.25 : 1.0)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            // 32pt target + high-priority drag so the scrub wins over the
            // vertical pager (same rationale as VideoTransportControls.seekBar).
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard manager.duration > 0 else { return }
                        isSeeking = true
                        seekFraction = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        // ALWAYS clear the seeking flag, even on the early
                        // duration==0 bail. A drag whose `onEnded` leaves
                        // `isSeeking` stuck `true` would freeze `progress` on
                        // the stale `seekFraction` forever — the scrub would
                        // stop tracking playback and seeks would die (the
                        // "scrub dead after a play-through" failure mode).
                        defer { isSeeking = false; seekFraction = 0 }
                        guard manager.duration > 0 else { return }
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration)
                        HapticFeedback.light()
                    }
            )
        }
        .frame(height: 32)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSeeking)
    }
}

// MARK: - Reel Poster

/// Edge-to-edge progressive image used as the video poster. Falls back to a
/// tinted fill while loading. (Image reels now use `ReelImageCell`, which fits
/// the image over a blurred backdrop rather than cropping it full-bleed.)
/// `internal` (not `private`) so the feed-card surface (`ReelFeedVideoSurface`)
/// can reuse it as the muted-video poster.
struct ReelPoster: View, Equatable {
    let thumbHash: String?
    let url: String?
    let color: String
    /// `.fill` (default) crops edge-to-edge for the feed card. The fullscreen
    /// viewer passes `.fit` so the poster matches the `.resizeAspect` video it
    /// sits under — same framing during the poster→first-frame handoff.
    var contentMode: ContentMode = .fill

    var body: some View {
        ProgressiveCachedImage(
            thumbHash: thumbHash,
            thumbnailUrl: url,
            fullUrl: url,
            autoLoad: true
        ) {
            Color(hex: color).shimmer()
        }
        .aspectRatio(contentMode: contentMode)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
    }
}
