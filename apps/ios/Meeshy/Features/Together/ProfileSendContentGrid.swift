import SwiftUI
import MeeshySDK
import MeeshyUI

/// La grille de « Lui envoyer un contenu » (#20243) : trois cartes larges par ligne, défilement vertical. Chaque carte
/// montre le contenu comme la carte de #20211 (`ContentCard.Showcase`) — une vidéo seule se joue sur place, muette,
/// élue par la politique du fil (`ReelFeedAutoplayCoordinator` : une seule, la plus centrée) ; un diaporama se fait
/// glisser ; un son s'écoute ; une scène se peint arrêtée. Un toucher choisit la carte.
struct ProfileSendContentGrid: View {
    let posts: [FeedPost]
    let kind: ProfileSendContentKind
    let selectedId: String?
    let tint: Color
    let width: CGFloat
    let autoplay: ReelFeedAutoplayCoordinator
    let onSelect: (String) -> Void

    static let spacing = MeeshySpacing.sm
    private let preferredLanguages = ReaderPrism.resolve(for: AuthManager.shared.currentUser)

    private var size: CGSize {
        ProfileSendContentGridLayout.cardSize(width: width, spacing: Self.spacing, kind: kind)
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: Self.spacing, alignment: .top),
              count: ProfileSendContentGridLayout.columns)
    }

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: Self.spacing) {
            ForEach(posts, id: \.id) { post in
                ProfileSendContentCard(post: post, size: size, isSelected: post.id == selectedId, tint: tint,
                                       preferredLanguages: preferredLanguages, autoplay: autoplay,
                                       onSelect: { onSelect(post.id) })
                    .equatable()
            }
        }
    }
}

/// Le chargement a la forme de la grille qui le remplace : six cartes « en préparation », aux mesures servies.
struct ProfileSendContentGridSkeleton: View {
    let kind: ProfileSendContentKind
    let tint: Color
    let width: CGFloat

    var body: some View {
        let size = ProfileSendContentGridLayout.cardSize(width: width, spacing: ProfileSendContentGrid.spacing,
                                                         kind: kind)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ProfileSendContentGrid.spacing),
                                 count: ProfileSendContentGridLayout.columns),
                  spacing: ProfileSendContentGrid.spacing) {
            ForEach(0..<6, id: \.self) { _ in
                RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                    .fill(tint.opacity(MeeshyOpacity.light))
                    .frame(height: size.height)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Une carte de la grille. `Equatable` : le défilement et l'élection d'une autre vidéo ne réévaluent que les cartes
/// concernées — seule une carte vidéo observe le coordinateur.
struct ProfileSendContentCard: View, Equatable {
    let post: FeedPost
    let size: CGSize
    let isSelected: Bool
    let tint: Color
    let preferredLanguages: [String]
    let autoplay: ReelFeedAutoplayCoordinator
    let onSelect: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.post.id == rhs.post.id && lhs.post.content == rhs.post.content && lhs.size == rhs.size
            && lhs.isSelected == rhs.isSelected && lhs.tint == rhs.tint
            && lhs.preferredLanguages == rhs.preferredLanguages
    }

    private var showcase: ContentCard.Showcase { ContentCard.Showcase(post: post) }

    var body: some View {
        let showcase = self.showcase
        let label = ProfileSendContentCopy.spokenLabel(of: post, showcase: showcase)
        visual(showcase, label: label)
            .frame(width: size.width, height: size.height)
            .background(tint.opacity(MeeshyOpacity.light))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
            .overlay { selectionRing }
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
            .onTapGesture(perform: onSelect)
            .modifier(ProfileSendContentCardAccessibility(
                role: ProfileSendContentCardRole(showcase.visual), label: label, isSelected: isSelected,
                onSelect: onSelect))
            .accessibilityIdentifier("profile.sendContent.card.\(post.id)")
    }

    @ViewBuilder
    private func visual(_ showcase: ContentCard.Showcase, label: String) -> some View {
        switch showcase.visual {
        case .none:
            ProfileSendContentTextFace(text: ProfileSendContentCopy.textTile(of: post) ?? "")
        case .media(let media):
            if let clip = ProfileSendContentPlayback.inlineVideo(of: post, showcase: showcase) {
                ProfileSendContentInlineVideo(postId: post.id, clip: clip, autoplay: autoplay)
            } else {
                page(.media(media), showcase: showcase)
            }
        case .slideshow(let pages):
            ProfileSendContentPager(count: pages.count, label: label, isSelected: isSelected, onSelect: onSelect) { index in
                page(pages[index], showcase: showcase)
            }
        case .sound(let sound):
            ProfileSendContentSoundFace(sound: sound, accentColor: post.authorColor,
                                        text: ProfileSendContentCopy.textTile(of: post), label: label,
                                        isSelected: isSelected, onSelect: onSelect)
        case .scene(let index):
            page(.scene(index), showcase: showcase)
        }
    }

    @ViewBuilder
    private func page(_ page: ContentCard.Page, showcase: ContentCard.Showcase) -> some View {
        switch page {
        case .media(let media):
            ContentLinkCardMedia(media: media, kind: Self.postType(of: post), extraCount: 0,
                                 accentColor: post.authorColor, showsKindPill: false, fixedHeight: size.height)
                .equatable()
        case .scene(let index):
            if let scene = showcase.scene {
                ContentLinkCardScene(scene: scene, index: index, kind: Self.postType(of: post),
                                     accentColor: post.authorColor, preferredLanguages: preferredLanguages,
                                     showsKindPill: false, fixedHeight: size.height)
            }
        }
    }

    @ViewBuilder
    private var selectionRing: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .strokeBorder(tint, lineWidth: 3)
                .overlay(alignment: .topTrailing) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .bold))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Color.white, tint)
                        .padding(MeeshySpacing.xs)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    static func postType(of post: FeedPost) -> PostType {
        PostType(rawValue: (post.type ?? "").uppercased()) ?? .post
    }
}

// MARK: - Les faces

/// Une vidéo seule, jouée sur place, MUETTE, par le lecteur du fil (`ReelFeedVideoSurface`). Seule cette face observe
/// le coordinateur : l'élection d'une autre vidéo ne réévalue que les cartes vidéo.
private struct ProfileSendContentInlineVideo: View {
    let postId: String
    let clip: FeedMedia
    @ObservedObject var autoplay: ReelFeedAutoplayCoordinator

    var body: some View {
        ReelFeedVideoSurface(media: clip, isActive: autoplay.activeReelId == postId, silenced: true)
            .overlay(alignment: .bottomTrailing) {
                if let duration = clip.durationFormatted {
                    ContentLinkCardChip(label: duration)
                        .padding(MeeshySpacing.xs)
                }
            }
            .reportReelFrame(id: postId, kind: .video)
    }
}

/// Plusieurs pages qu'on fait glisser sur place ; le toucher choisit la carte, le glissement change de page.
private struct ProfileSendContentPager<Page: View>: View {
    let count: Int
    let label: String
    let isSelected: Bool
    let onSelect: () -> Void
    @ViewBuilder let content: (Int) -> Page

    @State private var current = 0

    var body: some View {
        TabView(selection: $current) {
            ForEach(0..<count, id: \.self) { index in
                content(index)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onSelect)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .bottom) {
            ContentLinkCardPageDots(count: count, current: current)
                .padding(.bottom, MeeshySpacing.xs)
                .allowsHitTesting(false)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(ContentLinkCardCopy.pagePosition(current + 1, of: count))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction(.default) { onSelect() }
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: current = min(current + 1, count - 1)
            case .decrement: current = max(current - 1, 0)
            @unknown default: break
            }
        }
    }
}

/// Un contenu sans média : la première ligne de son texte posée sur l'aplat.
private struct ProfileSendContentTextFace: View {
    let text: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .padding(MeeshySpacing.sm)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityHidden(true)
    }
}

/// Un son seul : le lecteur audio du kit, comme dans la carte de #20211, sous la première ligne du texte.
private struct ProfileSendContentSoundFace: View {
    let sound: ContentCard.Sound
    let accentColor: String
    let text: String?
    let label: String
    let isSelected: Bool
    let onSelect: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Image(systemName: "waveform")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                if let text {
                    Text(text)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction(.default) { onSelect() }
            Spacer(minLength: 0)
            AudioPlayerView(attachment: attachment, context: .messageBubble, chrome: .flatMinimal,
                            accentColor: accentColor)
        }
        .padding(MeeshySpacing.xs)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var attachment: MeeshyMessageAttachment {
        FeedMedia(id: sound.attachmentId, type: .audio, url: sound.url, duration: sound.durationSeconds)
            .toMessageAttachment()
    }
}

/// Qui porte la parole de la carte pour VoiceOver : la carte elle-même, ou une face qui garde ses propres contrôles
/// (le diaporama qu'on ajuste, le lecteur sonore qu'on joue).
enum ProfileSendContentCardRole {
    case card
    case pager
    case sound

    init(_ visual: ContentCard.Visual) {
        switch visual {
        case .slideshow: self = .pager
        case .sound: self = .sound
        case .none, .media, .scene: self = .card
        }
    }
}

/// VoiceOver : la carte se dit en une phrase (genre, puis texte), se choisit par l'action par défaut et se dit
/// « sélectionnée » une fois choisie.
private struct ProfileSendContentCardAccessibility: ViewModifier {
    let role: ProfileSendContentCardRole
    let label: String
    let isSelected: Bool
    let onSelect: () -> Void

    func body(content: Content) -> some View {
        switch role {
        case .card:
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                .accessibilityAction(.default) { onSelect() }
        case .pager, .sound:
            content.accessibilityElement(children: .contain)
        }
    }
}
