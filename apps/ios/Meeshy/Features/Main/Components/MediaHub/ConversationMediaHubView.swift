import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'écran « Médias, liens et documents » d'une conversation (#8103)

/// Ce que l'hôte sait faire d'un élément — l'écran ne connaît ni le fil ni
/// la navigation.
struct ConversationMediaHubActions {
    /// Ouvrir la galerie de la conversation sur une pièce. `nil` ⇒ l'écran
    /// présente la galerie lui-même (depuis la liste des conversations, où
    /// aucun fil n'est monté).
    var openVisual: ((MessageAttachment) -> Void)?
    /// Rejoindre le message dans le fil (chemin `around` du fil s'il n'est pas
    /// chargé). `nil` ⇒ l'action n'est pas proposée.
    var goToMessage: ((String) -> Void)?

    static let none = ConversationMediaHubActions()
}

/// Le contenu de l'onglet Médias de la fiche de conversation : segments,
/// recherche, liste paresseuse. Monté DANS le `ScrollView` de la fiche.
struct ConversationMediaHubView: View {
    let conversationId: String
    let accentColor: String
    let actions: ConversationMediaHubActions

    @StateObject private var model: ConversationMediaHubViewModel
    @State private var query = ""
    @State private var galleryStart: MessageAttachment?
    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    init(conversationId: String, accentColor: String, actions: ConversationMediaHubActions) {
        self.conversationId = conversationId
        self.accentColor = accentColor
        self.actions = actions
        _model = StateObject(wrappedValue: ConversationMediaHubViewModel(conversationId: conversationId))
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            segmentBar
            if model.listing.phase == .offline, !model.listing.items.isEmpty {
                offlineNotice
            }
            content
        }
        .padding(.bottom, 32)
        .task { model.select(model.selectedKind) }
        .adaptiveOnChange(of: query) { _, text in model.updateQuery(text) }
        .onDisappear { model.close() }
        .fullScreenCover(item: $galleryStart) { start in
            MediaHubGalleryCover(
                conversationId: conversationId,
                start: start,
                fallback: model.visualAttachments,
                accentColor: accentColor
            )
        }
    }

    // MARK: - Recherche

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(mutedText)
                .accessibilityHidden(true)
            TextField(ConversationMediaHubCopy.searchPlaceholder, text: $query)
                .font(.body)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .accessibilityLabel(ConversationMediaHubCopy.searchLabel(ConversationMediaHubCopy.kind(model.selectedKind)))
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(mutedText)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(mutedText.opacity(0.15), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    // MARK: - Segments

    private var segmentBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ConversationMediaKind.allCases, id: \.self) { kind in
                    let selected = model.selectedKind == kind
                    Button {
                        guard !selected else { return }
                        HapticFeedback.light()
                        model.select(kind)
                    } label: {
                        MediaHubSegmentChip(kind: kind, isSelected: selected, accentHex: accentColor, isDark: isDark)
                            .equatable()
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ConversationMediaHubCopy.segmentsLabel)
    }

    private var offlineNotice: some View {
        Label(ConversationMediaHubCopy.offline, systemImage: "wifi.slash")
            .font(.footnote.weight(.medium))
            .foregroundColor(MeeshyColors.warning)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
    }

    // MARK: - Contenu

    @ViewBuilder
    private var content: some View {
        let listing = model.listing
        if listing.items.isEmpty {
            emptyContent(listing.phase)
        } else if model.selectedKind == .visual {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 3), spacing: 2) {
                ForEach(listing.items) { item in
                    visualTile(item)
                        .onAppear { if item.id == listing.items.last?.id { model.loadMore() } }
                }
            }
            .padding(.horizontal, 2)
            listFooter(listing)
        } else {
            LazyVStack(spacing: 14) {
                ForEach(listing.items) { item in
                    row(item)
                        .onAppear { if item.id == listing.items.last?.id { model.loadMore() } }
                }
                listFooter(listing)
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder
    private func emptyContent(_ phase: ConversationMediaHubPhase) -> some View {
        let segment = ConversationMediaHubCopy.kind(model.selectedKind)
        switch phase {
        case .loading:
            MediaHubSkeleton(kind: model.selectedKind)
        case .offline:
            MediaHubStateView(icon: "wifi.slash", message: ConversationMediaHubCopy.offlineEmpty, isDark: isDark,
                              actionTitle: ConversationMediaHubCopy.retry, action: model.retry)
        case .failed:
            MediaHubStateView(icon: "exclamationmark.triangle", message: ConversationMediaHubCopy.error, isDark: isDark,
                              actionTitle: ConversationMediaHubCopy.retry, action: model.retry)
        case .loaded:
            MediaHubStateView(
                icon: ConversationMediaHubCopy.icon(model.selectedKind),
                message: model.activeQuery.map(ConversationMediaHubCopy.emptySearch) ?? ConversationMediaHubCopy.empty(segment),
                isDark: isDark
            )
        }
    }

    @ViewBuilder
    private func listFooter(_ listing: ConversationMediaHubListing) -> some View {
        if listing.loadMoreFailed {
            MediaHubStateView(icon: "arrow.clockwise", message: ConversationMediaHubCopy.moreError, isDark: isDark,
                              actionTitle: ConversationMediaHubCopy.retry, action: model.loadMore)
                .padding(.top, -24)
        } else if listing.canLoadMore {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityLabel(ConversationMediaHubCopy.loading)
        }
    }

    // MARK: - Éléments

    private func visualTile(_ item: ConversationMediaHubItem) -> some View {
        let isVideo = item.attachment?.type == .video
        let label = ConversationMediaHubCopy.tile(isVideo: isVideo, sender: senderName(item), date: dateLabel(item.sentAt))
        return MediaHubVisualTile(item: item, accessibilityText: label)
            .equatable()
            .onTapGesture { open(item) }
            .accessibilityAction { open(item) }
            .modifier(GoToMessageAffordance(messageId: item.messageId, goToMessage: actions.goToMessage))
    }

    @ViewBuilder
    private func row(_ item: ConversationMediaHubItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            rowBody(item)
            HStack(spacing: 6) {
                Text("\(senderName(item)) · \(dateLabel(item.sentAt))")
                    .font(.caption)
                    .foregroundColor(mutedText)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let goToMessage = actions.goToMessage {
                    Button { goToMessage(item.messageId) } label: {
                        Image(systemName: "arrow.turn.up.left")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(Color(hex: accentColor))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ConversationMediaHubCopy.goToMessage)
                }
            }
        }
        .modifier(GoToMessageAffordance(messageId: item.messageId, goToMessage: actions.goToMessage))
    }

    @ViewBuilder
    private func rowBody(_ item: ConversationMediaHubItem) -> some View {
        switch item.payload {
        case .attachment(let attachment):
            if item.kind == .audio, let carrier = model.carrier(item.messageId) {
                AudioMediaView(attachment: attachment, message: carrier, contactColor: accentColor,
                               visualAttachments: [], isDark: isDark, accentColor: accentColor)
                    .equatable()
            } else {
                DocumentViewerView(attachment: attachment, context: .messageBubble,
                                   accentColor: accentColor, isMe: item.isMe)
            }
        case .link(let url, _, let target):
            if let target {
                ConversationLinkCard(target: target, urlString: url, fallbackAccent: accentColor, isDark: isDark)
                    .id(target)
            } else {
                LinkPreviewCard(urlString: url, accentColor: accentColor, isDark: isDark)
            }
        case .place(let place):
            MediaHubPlaceRow(place: place, subtitle: dateLabel(item.sentAt), accentHex: accentColor, isDark: isDark)
                .equatable()
        }
    }

    // MARK: - Actions

    private func open(_ item: ConversationMediaHubItem) {
        guard let attachment = item.attachment else { return }
        HapticFeedback.light()
        if let openVisual = actions.openVisual {
            openVisual(attachment)
        } else {
            galleryStart = attachment
        }
    }

    // MARK: - Aides

    private var mutedText: Color {
        isDark ? .white.opacity(0.55) : MeeshyColors.indigo950.opacity(0.5)
    }

    private func senderName(_ item: ConversationMediaHubItem) -> String {
        item.senderName.isEmpty ? "—" : item.senderName
    }

    private func dateLabel(_ date: Date) -> String {
        let sameYear = Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.day().month(.abbreviated))
            : date.formatted(.dateTime.day().month(.abbreviated).year())
    }
}

/// « Aller au message » au menu contextuel et au rotor VoiceOver.
private struct GoToMessageAffordance: ViewModifier {
    let messageId: String
    let goToMessage: ((String) -> Void)?

    func body(content: Content) -> some View {
        if let goToMessage {
            content
                .contextMenu {
                    Button { goToMessage(messageId) } label: {
                        Label(ConversationMediaHubCopy.goToMessage, systemImage: "arrow.turn.up.left")
                    }
                }
                .accessibilityAction(named: ConversationMediaHubCopy.goToMessage) { goToMessage(messageId) }
        } else {
            content
        }
    }
}

/// La galerie plein écran quand l'écran la présente lui-même : TOUS les
/// médias de la conversation (#8095), ouverte sur la pièce touchée. Sans fil
/// monté, ni réponse ni réaction — seulement regarder.
private struct MediaHubGalleryCover: View {
    let start: MessageAttachment
    let fallback: [MessageAttachment]
    let accentColor: String
    @StateObject private var catalog: ConversationMediaCatalog

    init(conversationId: String, start: MessageAttachment, fallback: [MessageAttachment], accentColor: String) {
        self.start = start
        self.fallback = fallback
        self.accentColor = accentColor
        _catalog = StateObject(wrappedValue: ConversationMediaCatalog(conversationId: conversationId))
    }

    var body: some View {
        let pieces = catalog.snapshot.attachments.isEmpty ? fallback : catalog.snapshot.attachments
        ConversationMediaGalleryView(
            allAttachments: ConversationMediaGalleryLayer.galleryAttachments(start: start, all: pieces),
            startAttachmentId: start.id,
            accentColor: accentColor,
            captionMap: catalog.snapshot.captions,
            senderInfoMap: catalog.snapshot.senderInfo
        )
        .onAppear { catalog.open(preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser)) }
        .onDisappear { catalog.close() }
    }
}
