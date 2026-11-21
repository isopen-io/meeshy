import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le bloc visuel de la carte d'un contenu** (#20211) — ce que
/// `ContentCard.visual` a élu, rendu par les briques existantes : la vignette
/// de la carte, le player de scène arrêté (`MeeshyScenePlayer`, mode carte,
/// en pause), le lecteur audio du kit (`AudioPlayerView`).
///
/// Toucher l'image ou la scène ouvre le contenu ; glisser le diaporama change
/// de page sans rien ouvrir ; le lecteur sonore garde son propre bouton.
struct ContentLinkCardVisual: View, Equatable {
    let card: ContentCard
    let accentColor: String
    let preferredLanguages: [String]
    let onOpen: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.card == rhs.card && lhs.accentColor == rhs.accentColor && lhs.preferredLanguages == rhs.preferredLanguages
    }

    var body: some View {
        switch card.visual {
        case .none:
            EmptyView()
        case .media(let media):
            ContentLinkCardMedia(media: media, kind: card.kind, extraCount: 0, accentColor: accentColor)
                .equatable()
                .contentShape(Rectangle())
                .onTapGesture(perform: onOpen)
        case .slideshow(let pages):
            ContentLinkCardSlideshow(pages: pages, card: card, accentColor: accentColor,
                                     preferredLanguages: preferredLanguages, onOpen: onOpen)
        case .sound(let sound):
            ContentLinkCardSound(sound: sound, kind: card.kind, accentColor: accentColor)
        case .scene(let index):
            if let scene = card.scene {
                ContentLinkCardScene(scene: scene, index: index, kind: card.kind, accentColor: accentColor,
                                     preferredLanguages: preferredLanguages, showsKindPill: true)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onOpen)
            }
        }
    }
}

// MARK: - Diaporama

/// Les pages qu'on fait glisser une à une — médias d'un post ou d'un réel,
/// scènes d'un document. La hauteur se lit sur la PREMIÈRE page et ne change
/// plus : la bulle ne saute pas pendant le glissement. Le glissement appartient
/// au pager ; seul un toucher ouvre le contenu.
struct ContentLinkCardSlideshow: View {
    let pages: [ContentCard.Page]
    let card: ContentCard
    let accentColor: String
    let preferredLanguages: [String]
    let onOpen: () -> Void

    @State private var page = 0

    private var height: CGFloat {
        ContentLinkCardLayout.mediaHeight(aspectRatio: Self.aspectRatio(of: pages.first))
    }

    var body: some View {
        TabView(selection: $page) {
            ForEach(Array(pages.enumerated()), id: \.offset) { index, item in
                pageView(item)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onOpen)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topLeading) {
            ContentLinkCardKindPill(kind: card.kind, accentColor: accentColor, onMedia: true)
                .padding(MeeshySpacing.sm)
                .allowsHitTesting(false)
        }
        .overlay(alignment: .topTrailing) {
            ContentLinkCardChip(label: ContentLinkCardCopy.pagePosition(page + 1, of: pages.count))
                .padding(MeeshySpacing.sm)
                .allowsHitTesting(false)
        }
        .overlay(alignment: .bottom) {
            ContentLinkCardPageDots(count: pages.count, current: page)
                .padding(.bottom, MeeshySpacing.sm)
                .allowsHitTesting(false)
        }
        .clipped()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ContentLinkCardCopy.slideshow(page + 1, of: pages.count))
        .accessibilityAddTraits(.isButton)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: page = min(page + 1, pages.count - 1)
            case .decrement: page = max(page - 1, 0)
            @unknown default: break
            }
        }
        .accessibilityAction(perform: onOpen)
        .accessibilityIdentifier("content-link-card-slideshow")
    }

    @ViewBuilder
    private func pageView(_ item: ContentCard.Page) -> some View {
        switch item {
        case .media(let media):
            ContentLinkCardMedia(media: media, kind: card.kind, extraCount: 0, accentColor: accentColor,
                                 showsKindPill: false, fixedHeight: height)
                .equatable()
        case .scene(let index):
            if let scene = card.scene {
                ContentLinkCardScene(scene: scene, index: index, kind: card.kind, accentColor: accentColor,
                                     preferredLanguages: preferredLanguages, showsKindPill: false, fixedHeight: height)
            }
        }
    }

    static func aspectRatio(of page: ContentCard.Page?) -> Double {
        switch page {
        case .media(let media)?: return media.aspectRatio
        case .scene?, nil: return ContentCard.portraitAspectRatio
        }
    }
}

struct ContentLinkCardPageDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .fill(Color.white.opacity(index == current ? 1 : MeeshyOpacity.medium))
                    .frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, MeeshySpacing.xsPlus)
        .padding(.vertical, MeeshySpacing.xxs)
        .background(Capsule().fill(Color.black.opacity(MeeshyOpacity.strong)))
        .accessibilityHidden(true)
    }
}

// MARK: - Scène arrêtée

/// La scène telle que l'auteur l'a composée — son fond et les objets posés —,
/// peinte par le player de scène en mode carte, EN PAUSE : aucune lecture,
/// aucun son. Une scène qui bouge porte le signe lecture ; on la joue en
/// l'ouvrant.
struct ContentLinkCardScene: View {
    let scene: ContentCard.Scene
    let index: Int
    let kind: PostType
    let accentColor: String
    let preferredLanguages: [String]
    let showsKindPill: Bool
    var fixedHeight: CGFloat? = nil

    private var height: CGFloat {
        fixedHeight ?? ContentLinkCardLayout.mediaHeight(aspectRatio: ContentCard.portraitAspectRatio)
    }

    private var carrier: StoryItem {
        StoryItem(id: scene.carrierId, content: scene.content, media: scene.media,
                  storyEffects: scene.effects, createdAt: scene.createdAt)
    }

    var body: some View {
        MeeshyScenePlayer(
            document: scene.document,
            mode: .card,
            sceneIndex: .constant(index),
            isPlaying: .constant(false),
            accentColorHex: accentColor,
            carrier: carrier,
            sceneFloorHex: scene.floorHex
        )
        .preferredContentLanguages(preferredLanguages)
        .aspectRatio(SceneShape.aspect, contentMode: .fit)
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .background(Color(hex: accentColor).opacity(MeeshyOpacity.light))
        .allowsHitTesting(false)
        .overlay {
            if Self.moves(scene.document, at: index) { ContentLinkCardPlayGlyph() }
        }
        .overlay(alignment: .topLeading) {
            if showsKindPill {
                ContentLinkCardKindPill(kind: kind, accentColor: accentColor, onMedia: true)
                    .padding(MeeshySpacing.sm)
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }

    static func moves(_ document: CanvasV3, at index: Int) -> Bool {
        guard document.scenes.indices.contains(index) else { return false }
        return SceneMotion.isCinematic(document.scenes[index])
    }
}

// MARK: - Son seul

/// Le son d'un contenu sans visuel — un vocal posté, le son de fond d'une
/// humeur — dans le lecteur audio du kit : lecture, onde, durée, sans quitter
/// la conversation.
struct ContentLinkCardSound: View {
    let sound: ContentCard.Sound
    let kind: PostType
    let accentColor: String

    private var attachment: MeeshyMessageAttachment {
        FeedMedia(id: sound.attachmentId, type: .audio, url: sound.url, duration: sound.durationSeconds)
            .toMessageAttachment()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            ContentLinkCardKindPill(kind: kind, accentColor: accentColor, onMedia: false)
            AudioPlayerView(attachment: attachment, context: .messageBubble, chrome: .flatMinimal,
                            accentColor: accentColor)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.top, MeeshySpacing.smPlus)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("content-link-card-sound")
    }
}
