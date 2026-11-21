import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Quel réel ? » (planche `Lien-Suivi-Creer`) : mes publications du genre de la cible, en rangée de vignettes du kit
/// (K20), la choisie cerclée et nommée dessous. Cache d'abord : le modèle des publications du profil sert ce qu'il a,
/// les squelettes du billet ne paraissent que sur un cache vide.
struct TrackingPublicationPicker: View {
    let target: TrackingLinkTarget
    let selection: TrackingLinkContent?
    let tint: Color
    let onPick: (TrackingLinkContent) -> Void

    @StateObject private var viewModel: ProfileUserPostsViewModel

    init(userId: String, target: TrackingLinkTarget, selection: TrackingLinkContent?, tint: Color,
         onPick: @escaping (TrackingLinkContent) -> Void) {
        self.target = target
        self.selection = selection
        self.tint = tint
        self.onPick = onPick
        _viewModel = StateObject(wrappedValue: ProfileUserPostsViewModel(userId: userId))
    }

    private var choices: [TrackingLinkContent] { TrackingLinkContent.choices(from: viewModel.posts, for: target) }

    private static let words = MeeshyThumbnailRowWords(
        add: LinkCreationCopy.contentRowWords, duplicate: LinkCreationCopy.contentRowWords,
        moveEarlier: LinkCreationCopy.contentRowWords, moveLater: LinkCreationCopy.contentRowWords
    )

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: LinkCreationCopy.whichContent(target), form: .overline)
            content
            if target == .story {
                MeeshyNote(LinkCreationCopy.publicStoriesOnly, lead: .systemImage("globe"), tint: tint)
            }
            if let selection {
                Label(selection.title, systemImage: LinkCreationCopy.targetGlyph(target))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .foregroundStyle(ThemeManager.shared.textPrimary)
            }
        }
        .task { await viewModel.loadInitial() }
    }

    @ViewBuilder
    private var content: some View {
        let shown = choices
        if shown.isEmpty && viewModel.isLoading {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(0..<3, id: \.self) { _ in MeeshyTicket(title: "", code: "", size: .mini, kind: .loading) }
            }
            .accessibilityHidden(true)
        } else if shown.isEmpty {
            MeeshyNote(LinkCreationCopy.nothingToTrack, lead: .systemImage("tray"), tint: tint)
        } else {
            MeeshyThumbnailRow(
                shown.map { MeeshyThumbnail(id: $0.id, accessibilityLabel: $0.title) },
                current: selection?.id,
                label: LinkCreationCopy.whichContent(target),
                words: Self.words,
                alignment: .leading,
                onSelect: { id in
                    if let picked = shown.first(where: { $0.id == id }) { onPick(picked) }
                },
                content: { thumbnail, state in
                    CachedAsyncImage(url: shown.first { $0.id == thumbnail.id }?.thumbnailURL, targetSize: state.size,
                                     showsStatusOverlays: false) {
                        tint.opacity(MeeshyOpacity.light)
                    }
                    .scaledToFill()
                }
            )
        }
    }
}

/// « Quelle conversation ? » : mes conversations de groupe en puces du kit (K04), choix unique.
struct TrackingConversationPicker: View {
    let conversations: [Conversation]
    let selection: TrackingLinkContent?
    let onPick: (TrackingLinkContent) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: LinkCreationCopy.whichContent(.conversation), form: .overline)
            if conversations.isEmpty {
                MeeshyNote(LinkCreationCopy.nothingToTrack, lead: .systemImage("tray"))
            } else {
                MeeshyChipRow(
                    conversations.map { MeeshyChip(id: $0.id, title: $0.name) },
                    selection: Set([selection?.id].compactMap { $0 }),
                    label: LinkCreationCopy.whichContent(.conversation),
                    mode: .single,
                    layout: .wrap,
                    surface: .theme,
                    size: .compact,
                    onChange: { _, id in
                        if let picked = conversations.first(where: { $0.id == id }) {
                            onPick(TrackingLinkContent(id: picked.id, title: picked.name))
                        }
                    }
                )
            }
        }
    }
}
