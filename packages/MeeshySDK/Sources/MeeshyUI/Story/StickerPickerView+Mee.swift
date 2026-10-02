import SwiftUI
import MeeshySDK

// MARK: - Les onglets Mee, Meo et Mee & Meo (#9053, #9058)

extension StickerPickerView {

    static let meeCellSide: CGFloat = 96

    /// **Une section par INTENTION** — ce que le sticker permet de dire —, dans
    /// l'ordre du web : son titre, puis la phrase qui dit quand l'employer. Les
    /// vignettes sont ANIMÉES (#9059), décodées à `gridPixelCap` hors du fil
    /// principal ; une case qui quitte l'écran rend son film au cache.
    @ViewBuilder
    func meeSections(_ onglet: StickerSheetTab) -> some View {
        let personnage = Self.meeCharacter(of: onglet)
        ForEach(MeeStickerCatalog.sections(of: personnage)) { groupe in
            Section {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3),
                          spacing: 8) {
                    ForEach(groupe.stickers) { sticker in
                        Button {
                            HapticFeedback.medium()
                            meeStickerPick?(sticker)
                        } label: {
                            MeeStickerFilmView(sticker: sticker, side: Self.meeCellSide,
                                               pixelCap: MeeStickerFilmView.gridPixelCap)
                                .frame(maxWidth: .infinity)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(sticker.title)
                    }
                }
            } header: {
                sectionHeader(symbole: onglet.symbolName, titre: groupe.intent.title) {
                    Text(groupe.intent.hint)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    static func meeCharacter(of onglet: StickerSheetTab) -> MeeSticker.Character {
        switch onglet {
        case .meo: .meo
        case .meeAndMeo: .duo
        default: .mee
        }
    }
}
