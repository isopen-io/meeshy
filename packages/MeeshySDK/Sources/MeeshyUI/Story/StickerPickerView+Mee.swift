import SwiftUI
import MeeshySDK

// MARK: - L'onglet Mee & Meo (#9053, #9058, #9068)

extension StickerPickerView {

    static let meeCellSide: CGFloat = 96
    static let meeColumns = 3

    /// **Une section par INTENTION** — ce que le sticker permet de dire —, dans
    /// l'ordre du web : son titre, puis la phrase qui dit quand l'employer.
    /// Mee, Meo et leurs duos y sont rangés ENSEMBLE (directive porteur
    /// 2026-10-02).
    ///
    /// **Des RANGÉES, pas une grille par section.** Chaque ligne est un enfant
    /// direct de la pile paresseuse de la feuille, d'une hauteur connue : la
    /// pile ne crée que ce qui entre à l'écran. Une `LazyVGrid` par intention
    /// créait ses quarante cases d'un coup et faisait osciller la hauteur du
    /// contenu au bas de la planche — défilement figé, processeur à 100 %
    /// (retour porteur 2026-10-02).
    @ViewBuilder
    var meeSections: some View {
        ForEach(MeeStickerCatalog.rows(columns: Self.meeColumns)) { row in
            switch row {
            case .title(let intent):
                sectionHeader(symbole: StickerSheetTab.meeAndMeo.symbolName, titre: intent.title) {
                    Text(intent.hint)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, intent == MeeStickerCatalog.sections.first?.intent
                         ? 0 : MeeshySpacing.xxl - Self.rowSpacing(for: .meeAndMeo))
            case .stickers(let stickers):
                meeRow(stickers)
            }
        }
    }

    /// La grille des Mee de Favoris et Récents — les mêmes rangées.
    @ViewBuilder
    func meeGrid(_ stickers: [MeeSticker]) -> some View {
        VStack(spacing: 8) {
            ForEach(Array(stride(from: 0, to: stickers.count, by: Self.meeColumns)), id: \.self) { debut in
                meeRow(Array(stickers[debut..<min(debut + Self.meeColumns, stickers.count)]))
            }
        }
    }

    /// Une rangée : trois places, même incomplète, pour que la dernière case
    /// d'une intention reste dans sa colonne.
    private func meeRow(_ stickers: [MeeSticker]) -> some View {
        HStack(spacing: 8) {
            ForEach(stickers) { sticker in
                meeCell(sticker)
            }
            ForEach(stickers.count..<Self.meeColumns, id: \.self) { _ in
                Color.clear.frame(maxWidth: .infinity)
            }
        }
        .frame(height: Self.meeCellSide)
    }

    private func meeCell(_ sticker: MeeSticker) -> some View {
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
