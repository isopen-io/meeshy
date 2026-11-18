import SwiftUI
import MeeshySDK

/// Nos médias partagés : les filtres du kit (K04) pour chaque type servi, la grille (K49) du type choisi, et les
/// vocaux joués sur le lecteur d'onde (K35) — un seul son à la fois, arrêté en quittant la fiche.
struct ProfileInCommonMedia: View {
    let digest: ProfileInCommonDigest
    let kind: InCommonMediaKind
    let items: [InCommonMedia]
    let tint: Color
    let onSelect: (InCommonMediaKind) -> Void
    let onOpenImage: (String) -> Void

    static let shownVoices = 3

    @StateObject private var player = AudioPlaybackManager(registerWithCoordinator: true)

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileInCommonCopy.media, count: digest.mediaTotal)
                .padding(.horizontal, MeeshySpacing.xl)
            MeeshyChipRow(digest.mediaFilters.map { chip(for: $0) }, selection: [kind], label: ProfileInCommonCopy.mediaFilters,
                          surface: .theme, size: .compact, inset: MeeshySpacing.xl,
                          onChange: { _, chosen in onSelect(chosen) })
            content
                .padding(.horizontal, MeeshySpacing.xl)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.inCommon.media")
        .onDisappear { player.stop() }
    }

    @ViewBuilder
    private var content: some View {
        if kind == .audio {
            VStack(spacing: MeeshySpacing.sm) {
                ForEach(items.prefix(Self.shownVoices)) { voice in
                    voiceRow(voice)
                }
            }
        } else {
            VStack(spacing: MeeshySpacing.md) {
                MeeshyMediaGrid(label: ProfileInCommonCopy.filter(kind), items: items.map { gridItem(for: $0) },
                                layout: .regular, columns: 3, shape: .square, tint: tint,
                                onOpen: { id in open(id) },
                                content: { item, size in thumbnail(of: item, size: size) })
                if let voice = digest.latestVoice {
                    voiceRow(voice)
                }
            }
        }
    }

    private func chip(for filter: InCommonMediaKind) -> MeeshyChip<InCommonMediaKind> {
        MeeshyChip(id: filter, title: ProfileInCommonCopy.filter(filter),
                   systemImage: ProfileInCommonCopy.filterGlyph(filter))
    }

    private func gridItem(for media: InCommonMedia) -> MeeshyMediaGridItem {
        let label = media.originalName ?? ProfileInCommonCopy.filter(kind)
        switch media.mediaKind {
        case .image, .video:
            return MeeshyMediaGridItem(id: media.id, kind: .media, label: label, aspect: media.aspect,
                                       badge: media.mediaKind == .video ? videoBadge(media) : nil)
        default:
            return MeeshyMediaGridItem(id: media.id, kind: .text, label: label,
                                       badge: MeeshyMediaTileBadge(systemImage: ProfileInCommonCopy.filterGlyph(kind)),
                                       text: label)
        }
    }

    private func videoBadge(_ media: InCommonMedia) -> MeeshyMediaTileBadge {
        MeeshyMediaTileBadge(systemImage: "play.fill", value: media.duration.map { Self.clock($0) })
    }

    @ViewBuilder
    private func thumbnail(of item: MeeshyMediaGridItem, size: CGSize) -> some View {
        let media = items.first { $0.id == item.id }
        CachedAsyncImage(url: media?.thumbnailUrl ?? media?.fileUrl, targetSize: size, thumbHash: media?.thumbHash,
                         byteSize: media?.fileSize.map { Int($0) }) {
            Color.clear
        }
        .accessibilityHidden(true)
    }

    private func open(_ id: String) {
        guard let media = items.first(where: { $0.id == id }), media.mediaKind == .image,
              let url = media.fileUrl, !url.isEmpty else { return }
        onOpenImage(url)
    }

    private func voiceRow(_ voice: InCommonMedia) -> some View {
        let isLoaded = player.currentUrl == voice.fileUrl
        return MeeshyGroupCard {
            MeeshyWavePlayer(
                label: voice.originalName ?? ProfileInCommonCopy.voice,
                progress: isLoaded ? player.progress : 0,
                isPlaying: isLoaded && player.isPlaying,
                duration: (voice.duration ?? 0) / 1000,
                tint: tint,
                phase: isLoaded && player.isLoading ? .buffering : .ready,
                onToggle: { toggle(voice) },
                onScrub: scrub(isLoaded: isLoaded)
            )
        }
    }

    /// Le glissement n'existe que sur le vocal chargé.
    private func scrub(isLoaded: Bool) -> ((Double) -> Void)? {
        guard isLoaded else { return nil }
        return { fraction in player.seek(to: fraction) }
    }

    private func toggle(_ voice: InCommonMedia) {
        guard let url = voice.fileUrl, !url.isEmpty else { return }
        if player.currentUrl == url {
            player.togglePlayPause()
        } else {
            player.play(urlString: url)
        }
    }

    /// « 0:38 » depuis une durée en millisecondes.
    nonisolated static func clock(_ milliseconds: Double) -> String {
        let seconds = max(Int((milliseconds / 1000).rounded()), 0)
        return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
    }
}
