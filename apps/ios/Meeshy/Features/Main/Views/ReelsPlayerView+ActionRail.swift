import SwiftUI
import MeeshySDK
import MeeshyUI

// =============================================================================
// Le RAIL D'ACTIONS du lecteur de réels — sorti de `ReelsPlayerView.swift` (#6693).
//
// La découpe précède l'ajout : l'hôte pesait 1 583 lignes, au-delà du plafond de
// 1 200, et le cliquet `FileSizeBudgetGuardTests` interdit d'AJOUTER à un fichier
// de la dette héritée. Le rail est ce que #6693 change — ses glyphes au repos
// prennent la teinte que la luminance du réel affiché commande — et il se tient
// seul : il observe le view-model, il ne lit rien de la page.
//
// Même motif que `ReelsPlayerView+Carousel.swift` (#4927) et `+Video.swift`
// (#4628). Les gardes qui nomment l'hôte par son NOM de fichier reçoivent ce
// fichier dans leur liste, dans le même commit.
// =============================================================================

// MARK: - Action Rail (reactive — observes the view-model so the like / bookmark
// / comment counters update the instant they change)

/// `internal` depuis la découpe #6693 : `ReelPageView`, resté dans l'hôte, le monte.
///
/// Les cellules sont celles du plein écran (`FullscreenActionButton`, #8878) en style
/// flottant : le menu « … », lui, a rejoint la barre haute (`ReelMoreOptionsMenu`).
struct ReelActionRail: View {
    @ObservedObject var viewModel: ReelsViewModel
    let reel: FeedPost
    var onComment: () -> Void

    @State private var showsReactionPalette = false
    @State private var stripRoom: CGFloat = 0

    var body: some View {
        FullscreenActionRail {
            let isLiked = viewModel.isLiked(reel.id)
            ReelRailAction(
                systemImage: isLiked ? FullscreenChromeSymbol.likeActive : FullscreenChromeSymbol.like,
                outline: FullscreenChromeSymbol.like,
                label: String(localized: "reels.action.like", defaultValue: "J'aime", bundle: .main),
                count: viewModel.likeCount(reel),
                isActive: isLiked,
                activeTint: MeeshyColors.error,
                accentHex: reel.authorColor,
                action: { viewModel.toggleLike(reel) }
            )
            // Appui bref = ❤️ ; appui long = la palette. Le GESTE est ici, le
            // CADRE sur le rail entier : un overlay ancré à un bouton s'y
            // trouve comprimé et la rangée d'émojis s'ouvre vide — mesuré au
            // simulateur sur le détail d'un post, et le rail est plus étroit
            // encore.
            .reactionPaletteTrigger(isPresented: $showsReactionPalette)

            // Vues/impressions : désormais privées (auteur-only) dans la ligne meta
            // sous le nom — plus de compteur de vues public ici.

            ReelRailAction(
                systemImage: FullscreenChromeSymbol.comments,
                label: String(localized: "reels.action.comment", defaultValue: "Commenter", bundle: .main),
                count: viewModel.commentCount(reel),
                action: onComment
            )

            let isBookmarked = viewModel.isBookmarked(reel.id)
            ReelRailAction(
                systemImage: isBookmarked ? "bookmark.fill" : "bookmark",
                outline: "bookmark",
                label: String(localized: "reels.action.bookmark", defaultValue: "Enregistrer", bundle: .main),
                count: viewModel.bookmarkCount(reel),
                isActive: isBookmarked,
                activeTint: MeeshyColors.warning,
                accentHex: reel.authorColor,
                action: { viewModel.toggleBookmark(reel) }
            )

            // Icône principale : Republier (Partager reste disponible dans le
            // menu « … », parité avec `ReelFeedCard.actionsRow`). Repost
            // append-only (pas d'un-repost) — `participated` reste vrai une
            // fois posé, comme le feed.
            let isReposted = viewModel.isReposted(reel.id)
            ReelRailAction(
                systemImage: FullscreenChromeSymbol.repost,
                outline: FullscreenChromeSymbol.repost,
                label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main),
                count: viewModel.repostCount(reel),
                isActive: isReposted,
                activeTint: MeeshyColors.success,
                accentHex: reel.authorColor,
                action: { viewModel.repost(reel) }
            )
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: ReelStripRoomKey.self,
                    value: max(0, proxy.frame(in: .global).minX - FullscreenChromeMetrics.edgeInset)
                )
            }
        )
        .onPreferenceChange(ReelStripRoomKey.self) { stripRoom = $0 }
        // Le CADRE sur le rail ENTIER, pas sur le bouton : la rangée d'émojis
        // s'ouvre vers la GAUCHE (le rail est collé au bord droit de l'écran),
        // au niveau du cœur. Ancrée au bouton, elle s'ouvrait comprimée et
        // hors cadre — mesuré au simulateur sur le détail d'un post.
        .overlay(alignment: .topTrailing) {
            if showsReactionPalette, stripRoom > 0 {
                FullscreenReactionStrip(
                    onReact: { emoji in
                        HapticFeedback.light()
                        viewModel.react(reel, emoji: emoji)
                        closeReactionPalette()
                    },
                    onDismiss: closeReactionPalette
                )
                .frame(width: stripRoom)
                .fixedSize(horizontal: false, vertical: true)
                .offset(x: FullscreenChromeMetrics.reactionStripLeadingOffset)
                .transition(.scale(scale: 0.85, anchor: .trailing).combined(with: .opacity))
            }
        }
    }

    private func closeReactionPalette() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showsReactionPalette = false
        }
    }
}

nonisolated struct ReelStripRoomKey: PreferenceKey {
    nonisolated static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - More Options Menu (top bar)

/// Menu « … » — mêmes actions/libellés/icônes que `FeedPostCard`/`ReelFeedCard`
/// (copier/partager/enregistrer/épingler/modifier/supprimer/signaler), parité
/// du lecteur plein écran avec les cartes du feed. Monté par la barre haute du
/// lecteur (`FullscreenMoreMenu`, #8878), au bord de FIN comme dans la story.
struct ReelMoreOptionsMenu: View {
    let viewModel: ReelsViewModel
    let reel: FeedPost
    var onShare: () -> Void
    var onEdit: () -> Void
    var onOpenDetail: (() -> Void)?
    /// Flux « Enregistrer en local » sur le média du réel (coordinateur possédé
    /// par `ReelsPlayerView`, seul habilité à présenter la sheet de destination).
    var onSaveMedia: () -> Void

    private var isOwnReel: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == reel.authorId
    }

    var body: some View {
        FullscreenMoreMenu {
            entries
        }
        .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
    }

    @ViewBuilder
    private var entries: some View {
        if let onOpenDetail {
            Button {
                onOpenDetail()
            } label: {
                Label(String(localized: "feed.post.open", defaultValue: "Ouvrir", bundle: .main), systemImage: "arrow.up.right.square")
            }
        }
        Button {
            UIPasteboard.general.string = reel.content
            HapticFeedback.success()
        } label: {
            Label(String(localized: "feed.post.copy_text", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
        }
        Button {
            onShare()
        } label: {
            Label(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main), systemImage: FullscreenChromeSymbol.share)
        }
        if reel.primaryReelDisplayMedia != nil {
            Button {
                onSaveMedia()
            } label: {
                Label(String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main), systemImage: FullscreenChromeSymbol.save)
            }
        }
        if isOwnReel {
            Button {
                Task { await viewModel.pinPost(reel.id) }
                HapticFeedback.light()
            } label: {
                Label(String(localized: "feed.post.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin")
            }
            Button {
                onEdit()
                HapticFeedback.light()
            } label: {
                Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
            }
            Divider()
            Button(role: .destructive) {
                Task { await viewModel.deletePost(reel.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        } else {
            Divider()
            Button(role: .destructive) {
                Task { await viewModel.reportPost(reel.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "feed.post.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
            }
        }
    }
}

// MARK: - Action Button

/// La cellule du rail : l'atome flottant du plein écran, plus ce que le réel ajoute —
/// le compteur, le schéma que la luminance du réel SOUS LE GLYPHE commande
/// (#6693, #6704) et le contour de participation dans la couleur de l'auteur.
private struct ReelRailAction: View {
    let systemImage: String
    /// Outline variant overlaid in the accent colour when `isActive` — an
    /// accent BORDER on the glyph (not a circle). Nil = no participation border.
    var outline: String? = nil
    let label: String
    var count: Int = 0
    var isActive: Bool = false
    /// La teinte d'un état ACTIF — aimé, enregistré, republié. `nil` au repos : le
    /// glyphe prend la teinte que la part du réel SOUS LUI commande (#6693, #6704). Il
    /// était blanc d'office, et la recette l'a mesuré à 2,00:1 sur une mire cyan.
    var activeTint: Color? = nil
    var accentHex: String = ""
    let action: () -> Void

    private var caption: String? {
        count > 0 ? CompactCountLabel.text(count) : nil
    }

    var body: some View {
        FullscreenActionButton(
            systemImage: systemImage,
            label: label,
            style: .floating,
            caption: caption,
            accessibilityValue: count > 0 ? LocalizedNumber.exact(count) : nil,
            isActive: isActive,
            activeTint: activeTint,
            action: action
        )
        .overlay { participationOutline }
        .mediaChromeGlyph()
    }

    @ViewBuilder
    private var participationOutline: some View {
        if isActive, let outline {
            VStack(spacing: MeeshySpacing.xxs) {
                // Glyphe de la cellule flottante (56 pt de large, doctrine 86i) : même
                // taille figée que celui de l'atome, pour que le contour le recouvre.
                Image(systemName: outline)
                    .font(.system(size: FullscreenChromeMetrics.floatingGlyphSize, weight: .semibold))
                    .foregroundStyle(Color(hex: accentHex))
                if let caption {
                    Text(caption)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .hidden()
                }
            }
            .frame(width: FullscreenChromeMetrics.floatingCellWidth)
            .frame(minHeight: FullscreenChromeMetrics.tapTarget)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
