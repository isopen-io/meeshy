import SwiftUI
import MeeshySDK
import MeeshyUI

/// Carte d'une story dans « Mes stories » — vignette, bande de glyphes, date.
///
/// UNE carte pour les deux onglets. Ce qui change entre une story publiée et
/// un brouillon est porté par `MyStoryCardModel` (des données), pas par deux
/// vues jumelles : le patron de glyphe est déjà écrit trois fois dans la vue
/// d'origine, deux cartes distinctes en auraient fait cinq.
struct MyStoryCardModel: Equatable {
    let id: String
    let kind: MyStoryCardKind
    let thumbnailURL: String?
    /// Composite de TOUTES les couches (texte, dessin, stickers), seule
    /// representation cliente de ce que l'auteur a reellement compose.
    /// `thumbnailURL` ne reflete que le media de FOND.
    let thumbHash: String?
    /// Date affichée sous la carte : publication pour une story, dernière
    /// modification pour un brouillon.
    let date: Date
    /// `nil` pour un brouillon — rien n'expire tant que rien n'est publié.
    let expiresAt: Date?
    let counts: [MyStoryGlyph: Int]
    /// Titre d'un brouillon, quand il en a un. Les stories publiées n'en
    /// affichent pas : leur vignette parle pour elles.
    let title: String?
}

struct MyStoryCard: View {
    let model: MyStoryCardModel
    let now: Date
    let accentColor: Color
    let isDark: Bool
    let onOpen: () -> Void
    let onGlyph: (MyStoryGlyph) -> Void
    let moreMenu: AnyView?

    @Environment(\.locale) private var locale

    private var isVeiled: Bool {
        MyStoryCardPresentation.isVeiled(expiresAt: model.expiresAt, now: now)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            thumbnail
            MyStoryActionBar(
                glyphs: MyStoryCardPresentation.glyphs(for: model.kind),
                counts: model.counts,
                moreMenu: moreMenu,
                onSelect: onGlyph
            )
            .equatable()
            dateLabel
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        // La carte compose son propre libellé : sans cela VoiceOver énonce une
        // vignette muette suivie de compteurs nus.
        .accessibilityElement(children: .contain)
    }

    /// `Color.clear` POSE le cadre, le contenu vient en overlay.
    ///
    /// L'image etait posee directement dans un `ZStack` : en `scaledToFill()`
    /// elle DIMENSIONNE la pile, donc la carte prenait la largeur de l'image
    /// au lieu de celle de la cellule — les tuiles se chevauchaient et le
    /// `clipShape` de la carte arrivait trop tard. Un cadre neutre d'abord,
    /// l'image ensuite, le rognage juste apres : la cellule impose sa taille.
    private var thumbnail: some View {
        Color.clear
            .aspectRatio(9 / 16, contentMode: .fit)
            .overlay(thumbnailLayers)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(thumbnailAccessibilityLabel)
    }

    @ViewBuilder
    private var thumbnailLayers: some View {
        ZStack {
            // Delegue a `MyStoryThumbnailResolver` — reimplementer le choix
            // ici rendait vide toute story SANS media de fond (texte seul,
            // dessin) : elles n'ont pas d'URL, seulement un thumbHash.
            switch MyStoryThumbnailResolver.resolve(thumbHash: model.thumbHash,
                                                    remoteURL: model.thumbnailURL) {
            case .composite(let hash):
                if let image = UIImage.fromThumbHash(hash) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else if let url = model.thumbnailURL, !url.isEmpty {
                    CachedAsyncImage(url: url) { placeholderFill }
                } else {
                    placeholderFill
                }
            case .remoteURL(let url):
                CachedAsyncImage(url: url) { placeholderFill }
            case .placeholder:
                placeholderFill
            }

            if isVeiled {
                // Le voile couvre la VIGNETTE seule : la bande de glyphes reste
                // nette en dessous — c'est par elle qu'on consulte encore vues,
                // réactions et commentaires d'une story éteinte.
                Rectangle().fill(Color.black.opacity(0.55))
            }

            if let title = model.title, !title.isEmpty {
                Text(title)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .shadow(color: .black.opacity(0.5), radius: 2)
            }
        }
    }

    private var placeholderFill: some View {
        Rectangle()
            .fill(accentColor.opacity(0.20))
            .overlay(Image(systemName: "photo").foregroundColor(accentColor))
    }

    private var dateLabel: some View {
        Text(MyStoryCardPresentation.dateLabel(for: model.date, now: now, locale: locale))
            .font(MeeshyFont.relative(11, weight: .medium))
            .foregroundColor(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
    }

    private var thumbnailAccessibilityLabel: String {
        let date = MyStoryCardPresentation.dateLabel(for: model.date, now: now, locale: locale)
        guard isVeiled else { return date }
        return String(localized: "story.mine.card.expired",
                      defaultValue: "Story expirée, \(date)")
    }
}
