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
struct ReelActionRail: View {
    @ObservedObject var viewModel: ReelsViewModel
    let reel: FeedPost
    var onComment: () -> Void
    var onShare: () -> Void
    var onEdit: () -> Void
    var onOpenDetail: (() -> Void)?
    /// Menu « … » → déclenche le flux « Enregistrer en local » sur le média
    /// du réel (coordinateur possédé par `ReelPageView`, seul habilité à
    /// présenter la sheet de destination).
    var onSaveMedia: () -> Void

    @State private var showsReactionPalette = false

    private var isOwnReel: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == reel.authorId
    }

    var body: some View {
        VStack(spacing: 22) {
            let isLiked = viewModel.isLiked(reel.id)
            ReelActionButton(
                systemName: isLiked ? "heart.fill" : "heart",
                outline: "heart",
                tint: isLiked ? MeeshyColors.error : nil,
                count: viewModel.likeCount(reel),
                participated: isLiked,
                accentHex: reel.authorColor,
                action: { viewModel.toggleLike(reel) }
            )
            .accessibilityLabel(String(localized: "reels.action.like", defaultValue: "J'aime", bundle: .main))
            // Appui bref = ❤️ ; appui long = la palette. Le GESTE est ici, le
            // CADRE sur le rail entier : un overlay ancré à un bouton s'y
            // trouve comprimé et la rangée d'émojis s'ouvre vide — mesuré au
            // simulateur sur le détail d'un post, et le rail est plus étroit
            // encore.
            .reactionPaletteTrigger(isPresented: $showsReactionPalette)

            // Vues/impressions : désormais privées (auteur-only) dans la ligne meta
            // sous le nom — plus de compteur de vues public ici.

            ReelActionButton(
                systemName: "bubble.right.fill",
                tint: nil,
                count: viewModel.commentCount(reel),
                action: onComment
            )
            .accessibilityLabel(String(localized: "reels.action.comment", defaultValue: "Commenter", bundle: .main))

            let isBookmarked = viewModel.isBookmarked(reel.id)
            ReelActionButton(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                outline: "bookmark",
                tint: isBookmarked ? MeeshyColors.warning : nil,
                count: viewModel.bookmarkCount(reel),
                participated: isBookmarked,
                accentHex: reel.authorColor,
                action: { viewModel.toggleBookmark(reel) }
            )
            .accessibilityLabel(String(localized: "reels.action.bookmark", defaultValue: "Enregistrer", bundle: .main))

            // Icône principale : Republier (Partager reste disponible dans le
            // menu « … », parité avec `ReelFeedCard.actionsRow`). Repost
            // append-only (pas d'un-repost) — `participated` reste vrai une
            // fois posé, comme le feed.
            let isReposted = viewModel.isReposted(reel.id)
            ReelActionButton(
                systemName: "arrow.2.squarepath",
                outline: "arrow.2.squarepath",
                tint: isReposted ? MeeshyColors.success : nil,
                count: viewModel.repostCount(reel),
                participated: isReposted,
                accentHex: reel.authorColor,
                action: { viewModel.repost(reel) }
            )
            .accessibilityLabel(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main))

            moreOptionsMenu
        }
        // Le CADRE sur le rail ENTIER, pas sur le bouton : la rangée d'émojis
        // s'ouvre vers la GAUCHE (le rail est collé au bord droit de l'écran),
        // au niveau du cœur. Ancrée au bouton, elle s'ouvrait comprimée et
        // hors cadre — mesuré au simulateur sur le détail d'un post.
        .reactionPaletteFrame(isPresented: $showsReactionPalette,
                              isDark: true,
                              anchor: .topTrailing,
                              offsetX: -56) { viewModel.react(reel, emoji: $0) }
    }

    /// Menu « … » — mêmes actions/libellés/icônes que `FeedPostCard`/`ReelFeedCard`
    /// (copier/partager/enregistrer/épingler/modifier/supprimer/signaler), parité
    /// du lecteur plein écran avec les cartes du feed.
    private var moreOptionsMenu: some View {
        Menu {
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
                Label(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
            }
            if reel.primaryReelDisplayMedia != nil {
                Button {
                    onSaveMedia()
                } label: {
                    Label(String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main), systemImage: "arrow.down.to.line")
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
        } label: {
            VStack(spacing: 5) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 26, weight: .semibold))
                    .glassControlForeground()
                    .frame(width: 48, height: 32)
            }
            .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            // Le schéma se pose sur le LIBELLÉ, jamais sur le `Menu` : posé plus
            // haut, il habillerait aussi la feuille du menu.
            .mediaChromeTinted()
        }
        .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
        .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
    }
}

// MARK: - Action Button

private struct ReelActionButton: View {
    let systemName: String
    /// Outline variant overlaid in the accent colour when `participated` — an
    /// accent BORDER on the glyph (not a circle). Nil = no participation border.
    var outline: String? = nil
    /// La teinte d'un état ACTIF — aimé, enregistré, republié. `nil` au repos : le
    /// glyphe prend la teinte que la luminance du réel affiché commande (#6693). Il
    /// était blanc d'office, et la recette l'a mesuré à 2,00:1 sur une mire cyan.
    let tint: Color?
    let count: Int?
    var participated: Bool = false
    var accentHex: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ZStack {
                    // Glyphes du rail d'actions (like/comment/bookmark/share) : taille figée pour
                    // la cohérence de la colonne fixe width:48 (doctrine 86i) ; le bouton porte le libellé
                    Image(systemName: systemName)
                        .font(.system(size: 26, weight: .semibold))
                        .mediaChromeForeground(tint)
                    if participated, let outline {
                        Image(systemName: outline)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundColor(Color(hex: accentHex))
                    }
                }
                .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                if let count, count > 0 {
                    Text(CompactCountLabel.text(count))
                        .font(.caption2.weight(.semibold))
                        .glassControlForeground()
                        .shadow(color: .black.opacity(0.35), radius: 2)
                }
            }
            .frame(width: 48)
            // Élargit la zone sensible autour du glyph + compteur. La pile
            // d'actions flotte au-dessus du `mediaLayer` qui porte le tap
            // play/pause (`handleContentTap`) : sans cette extension, un tap qui
            // manquait le glyph de quelques pixels traversait jusqu'au média et
            // togglait la lecture au lieu d'activer le bouton (bug user
            // 2026-06-28). `contentShape(Rectangle())` rend tout le rectangle
            // élargi (padding inclus) sensible, et le padding vertical comble les
            // gaps entre les boutons du rail.
            .padding(.vertical, 6)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
            .mediaChromeTinted()
        }
        .buttonStyle(.plain)
    }
}
