import SwiftUI
import MeeshySDK

// MARK: - Les onglets Mee et Meo (#9053)

extension StickerPickerView {

    static let meeCellSide: CGFloat = 96

    /// Solo, puis « à deux » — les sections du web, dans son ordre. Les
    /// vignettes sont ANIMÉES (#9059), décodées à `gridPixelCap` hors du fil
    /// principal ; une case qui quitte l'écran rend son film au cache.
    @ViewBuilder
    func meeSections(_ onglet: StickerSheetTab) -> some View {
        let personnage: MeeSticker.Character = onglet == .meo ? .meo : .mee
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
                sectionHeader(symbole: onglet.symbolName,
                              titre: Self.meeSectionTitle(personnage, groupe.section))
            }
        }
    }

    static func meeSectionTitle(_ personnage: MeeSticker.Character,
                                _ section: MeeSticker.Section) -> String {
        switch (personnage, section) {
        case (.mee, .solo):
            return String(localized: "sticker.sheet.mee.solo", defaultValue: "Mee", bundle: .module)
        case (.mee, .duo):
            return String(localized: "sticker.sheet.mee.duo", defaultValue: "Mee à deux", bundle: .module)
        case (.meo, .solo):
            return String(localized: "sticker.sheet.meo.solo", defaultValue: "Meo", bundle: .module)
        case (.meo, .duo):
            return String(localized: "sticker.sheet.meo.duo", defaultValue: "Meo à deux", bundle: .module)
        }
    }
}
