import SwiftUI
import MeeshySDK

// MARK: - L'onglet Mee & Meo (#9053, #9058, #9068)

extension StickerPickerView {

    static let meeCellSide: CGFloat = 96

    /// **Une section par INTENTION** — ce que le sticker permet de dire —, dans
    /// l'ordre du web : son titre, puis la phrase qui dit quand l'employer.
    /// Mee, Meo et leurs duos y sont rangés ENSEMBLE (directive porteur
    /// 2026-10-02). Les vignettes sont ANIMÉES (#9059), décodées à
    /// `gridPixelCap` hors du fil principal ; une case qui quitte l'écran rend
    /// son film au cache.
    @ViewBuilder
    var meeSections: some View {
        ForEach(MeeStickerCatalog.sections) { groupe in
            Section {
                meeGrid(groupe.stickers)
            } header: {
                sectionHeader(symbole: StickerSheetTab.meeAndMeo.symbolName, titre: groupe.intent.title) {
                    Text(groupe.intent.hint)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// La grille d'un groupe de Mee — celle de l'onglet ET celle des favoris
    /// et récents : même case, même appui long, même envoi (#9067).
    @ViewBuilder
    func meeGrid(_ stickers: [MeeSticker]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3),
                  spacing: 8) {
            ForEach(stickers) { sticker in
                Button {
                    HapticFeedback.medium()
                    usage.noteUse(.mee(sticker))
                    meeStickerPick?(sticker)
                } label: {
                    MeeStickerFilmView(sticker: sticker, side: Self.meeCellSide,
                                       pixelCap: MeeStickerFilmView.gridPixelCap)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .stickerFavoriteMenu(.mee(sticker), usage: usage)
                .accessibilityLabel(sticker.title)
            }
        }
    }
}
