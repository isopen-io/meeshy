// MARK: - Conversation media filmstrip (fullscreen gallery scrubber)
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Pellicule de TOUS les médias visuels de la conversation, posée sur toute la
/// rangée sous les détails de l'auteur, en bas du plein écran.
///
/// ## La tête de lecture est le bord DROIT
///
/// L'élément le plus à droite de la bande est, à chaque instant, celui affiché
/// en plein écran. On fait donc défiler la bande de gauche à droite pour
/// parcourir la conversation, exactement comme on ferait glisser une pellicule
/// devant une fenêtre de projection.
///
/// Deux conséquences de mise en page, toutes deux délibérées :
/// - une marge de contenu EN TÊTE égale à la largeur de la fenêtre moins une
///   vignette, sans laquelle le PREMIER média ne pourrait jamais atteindre le
///   bord droit ;
/// - un alignement `.viewAligned`, pour que le défilement s'arrête toujours
///   sur un média entier, jamais entre deux.
///
/// Ces deux-là ne se choisissent pas séparément : c'est le dimensionnement de
/// la marge de tête — `largeur − vignette − marge de queue` — qui fait
/// COÏNCIDER les deux ancrages. Un média aligné sur le bord de contenu de tête
/// est alors EXACTEMENT celui posé sous la tête de lecture, à droite ; les
/// points d'arrêt du `viewAligned` et les positions que lit
/// `scrollPosition(anchor: .trailing)` tombent donc sur la même grille, à tout
/// décalage — y compris en butée de fin, où le dernier média est à droite.
/// Une marge de tête choisie autrement les ferait diverger d'un reste, et la
/// bande s'arrêterait sur un média coupé.
///
/// ## Coût de rendu
///
/// Chaque vignette est décodée à sa taille d'AFFICHAGE (`targetSize`), donc
/// sous une clé de cache dimensionnée : la bande ne peut pas se voir servir les
/// pixels plein format que la page du même média affiche à côté. `LazyHStack` +
/// `.equatable()` bornent le travail à ce qui est visible et à ce qui change
/// réellement — c'est ce qui permet de la monter au-dessus d'une galerie déjà
/// occupée à décoder une image plein écran.
/// Géométrie de la pellicule, isolée du rendu pour être VÉRIFIABLE.
///
/// La coïncidence des deux ancrages décrite sur `ConversationMediaFilmstrip`
/// est une propriété arithmétique, pas une intention : elle se démontre — et,
/// ce qui compte davantage, elle se casserait en silence si quelqu'un
/// ajustait une marge. `FilmstripMetricsTests` la tient.
enum FilmstripMetrics {
    static let itemSide: CGFloat = 54
    static let spacing: CGFloat = 6
    static let verticalPadding: CGFloat = 10
    static let bottomPadding: CGFloat = 6
    static let trailingInset: CGFloat = 12

    /// Hauteur totale réservée par la bande, lue par la galerie pour ancrer le
    /// transport vidéo au-dessus d'elle.
    static let reservedHeight: CGFloat = itemSide + verticalPadding * 2 + bottomPadding

    /// Pas de la grille : une vignette plus l'espace qui la suit.
    static let stride: CGFloat = itemSide + spacing

    /// Marge de contenu EN TÊTE. C'est elle qui rend le premier média
    /// atteignable par la tête de lecture — et, en la dimensionnant ainsi,
    /// qui aligne la grille du `viewAligned` sur le bord droit.
    static func leadingInset(containerWidth: CGFloat) -> CGFloat {
        max(0, containerWidth - itemSide - trailingInset)
    }

    static func contentWidth(count: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        return CGFloat(count) * itemSide + CGFloat(count - 1) * spacing
    }

    /// Décalage de défilement qui pose le média `index` sous la tête de lecture.
    static func scrollOffset(forIndex index: Int) -> CGFloat {
        CGFloat(max(0, index)) * Self.stride
    }

    /// Média posé sous la tête de lecture à ce décalage.
    static func indexAtPlayhead(scrollOffset: CGFloat, count: Int) -> Int {
        guard count > 0 else { return 0 }
        let raw = Int((scrollOffset / Self.stride).rounded())
        return min(max(0, raw), count - 1)
    }

    /// Décalage maximal atteignable, marges comprises. Doit être un point
    /// d'arrêt de la grille — sinon la bande finit sur un média coupé.
    static func maxScrollOffset(count: Int, containerWidth: CGFloat) -> CGFloat {
        let total = leadingInset(containerWidth: containerWidth)
            + contentWidth(count: count)
            + trailingInset
        return max(0, total - containerWidth)
    }
}

struct ConversationMediaFilmstrip: View {
    let attachments: [MessageAttachment]
    @Binding var currentPageID: String?
    let accentColor: String

    /// Hauteur totale réservée par la bande, lue par la galerie pour ancrer le
    /// transport vidéo au-dessus d'elle.
    static var reservedHeight: CGFloat { FilmstripMetrics.reservedHeight }

    /// Position de la bande. Distincte de `currentPageID` pour que la
    /// synchronisation reste explicitement à sens unique dans chaque direction
    /// (chacune gardée par une égalité), au lieu d'un aller-retour où pager et
    /// bande se relanceraient mutuellement.
    @State private var scrollAnchorID: String?

    init(
        attachments: [MessageAttachment],
        currentPageID: Binding<String?>,
        accentColor: String
    ) {
        self.attachments = attachments
        self._currentPageID = currentPageID
        self.accentColor = accentColor
        _scrollAnchorID = State(initialValue: currentPageID.wrappedValue)
    }

    /// Espace à réserver EN TÊTE pour que le premier média puisse venir se
    /// poser sous la tête de lecture. `DeviceLayout.windowSize` et non l'écran :
    /// sous Split View la fenêtre n'est qu'une fraction de l'affichage.
    private var leadingInset: CGFloat {
        FilmstripMetrics.leadingInset(containerWidth: DeviceLayout.windowSize.width)
    }

    var body: some View {
        Group {
            if #available(iOS 17.0, *) {
                modernStrip
            } else {
                legacyStrip
            }
        }
        .frame(height: FilmstripMetrics.reservedHeight)
        .adaptiveOnChange(of: currentPageID) { _, newID in
            guard scrollAnchorID != newID else { return }
            scrollAnchorID = newID
        }
    }

    // MARK: - iOS 17+ : la bande PILOTE aussi le plein écran

    @available(iOS 17.0, *)
    private var modernStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: FilmstripMetrics.spacing) {
                ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                    thumbnail(attachment, at: index)
                }
            }
            .scrollTargetLayout()
            .padding(.vertical, FilmstripMetrics.verticalPadding)
        }
        .contentMargins(.leading, leadingInset, for: .scrollContent)
        .contentMargins(.trailing, FilmstripMetrics.trailingInset, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned(limitBehavior: .never))
        .scrollPosition(id: $scrollAnchorID, anchor: .trailing)
        .padding(.bottom, FilmstripMetrics.bottomPadding)
        .adaptiveOnChange(of: scrollAnchorID) { _, newID in
            guard let newID, newID != currentPageID else { return }
            currentPageID = newID
        }
    }

    // MARK: - iOS 16 : la bande SUIT le plein écran (sélection au tap)

    /// `scrollPosition(id:anchor:)` et `contentMargins` n'existent pas avant
    /// iOS 17 : la bande se recale sur la page courante via `ScrollViewReader`
    /// et la sélection se fait au tap. Le défilement libre n'y change pas le
    /// média affiché — dégradation choisie, la bande reste un aperçu et un
    /// sélecteur complets.
    private var legacyStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: FilmstripMetrics.spacing) {
                    Color.clear.frame(width: leadingInset, height: 1)
                    ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                        thumbnail(attachment, at: index)
                            .id(attachment.id)
                    }
                }
                .padding(.vertical, FilmstripMetrics.verticalPadding)
                .padding(.trailing, FilmstripMetrics.trailingInset)
            }
            .padding(.bottom, FilmstripMetrics.bottomPadding)
            .adaptiveOnChange(of: currentPageID, initial: true) { _, newID in
                guard let newID else { return }
                withAnimation(.easeInOut(duration: 0.25)) {
                    proxy.scrollTo(newID, anchor: .trailing)
                }
            }
        }
    }

    private func thumbnail(_ attachment: MessageAttachment, at index: Int) -> some View {
        FilmstripThumbnail(
            attachment: attachment,
            isCurrent: attachment.id == currentPageID,
            accentColor: accentColor,
            side: FilmstripMetrics.itemSide,
            accessibilityLabel: MediaPositionLabel.text(position: index + 1, of: attachments.count),
            onTap: { select(attachment.id) }
        )
        .equatable()
    }

    private func select(_ id: String) {
        guard id != currentPageID else { return }
        HapticFeedback.light()
        currentPageID = id
    }
}

// MARK: - Thumbnail

/// Une vignette de la pellicule.
///
/// `Equatable` sans lire l'environnement : la comparaison décide seule du
/// re-rendu, donc la vue ne doit dépendre de rien qu'elle ne compare. La
/// densité de pixels est résolue par `ProgressiveCachedImage` à partir du
/// `targetSize` en points qu'on lui passe.
private struct FilmstripThumbnail: View, Equatable {
    let attachment: MessageAttachment
    let isCurrent: Bool
    let accentColor: String
    let side: CGFloat
    let accessibilityLabel: String
    let onTap: () -> Void

    static func == (lhs: FilmstripThumbnail, rhs: FilmstripThumbnail) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.isCurrent == rhs.isCurrent
            && lhs.accentColor == rhs.accentColor
            && lhs.side == rhs.side
            && lhs.accessibilityLabel == rhs.accessibilityLabel
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
    }

    /// Une vignette n'affiche JAMAIS le fichier plein format : la vignette
    /// serveur si elle existe, sinon le thumbHash porté par la pièce jointe.
    private var thumbnailURL: String? {
        attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
    }

    var body: some View {
        Button(action: onTap) {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbnailURL,
                fullUrl: thumbnailURL,
                targetSize: CGSize(width: side, height: side)
            ) {
                Color(hex: attachment.thumbnailColor).opacity(0.5)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: side, height: side)
            .clipShape(shape)
            .overlay(alignment: .bottomTrailing) { videoGlyph }
            .overlay(
                shape.strokeBorder(
                    isCurrent ? Color(hex: accentColor) : Color.white.opacity(0.18),
                    lineWidth: isCurrent ? 2 : 1
                )
            )
            .opacity(isCurrent ? 1 : 0.55)
            .scaleEffect(isCurrent ? 1 : 0.9)
            .animation(.spring(response: 0.28, dampingFraction: 0.85), value: isCurrent)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isCurrent ? [.isButton, .isSelected] : .isButton)
    }

    /// Glyphe décoratif : le libellé VoiceOver de la vignette porte déjà la
    /// position, et le type se lit à l'ouverture.
    @ViewBuilder
    private var videoGlyph: some View {
        if attachment.type == .video {
            Image(systemName: "play.fill")
                .font(.system(size: 8, weight: .black))
                .foregroundColor(.white)
                .padding(3)
                .background(Circle().fill(Color.black.opacity(0.55)))
                .padding(3)
                .accessibilityHidden(true)
        }
    }
}
