import SwiftUI
import MeeshySDK

// MARK: - Les Instants dans « Personnalisés » (#9069)

extension StickerPickerView {

    /// **Mee et Meo qui écrivent tes mots, ton lieu, l'heure ou la météo**
    /// (directive porteur 2026-10-02). Ils lisent ce que l'onglet sait déjà :
    /// les mots tapés dans son champ, le lieu choisi, l'heure de l'ouverture ;
    /// la météo garde la valeur de chaque sticker. Les vignettes montrent ce
    /// qui partira.
    ///
    /// Chaque ligne est un enfant DIRECT de la pile paresseuse de la feuille —
    /// une pile imbriquée ne créait pas ses rangées au-delà de la première
    /// mesure (la section Météo restait vide, 2026-10-02). L'onglet espace ses
    /// enfants comme des sections ; une rangée se rapproche de la précédente
    /// par une marge haute négative, les titres gardent l'aération.
    @ViewBuilder
    var meeInstantSections: some View {
        if let meeInstantPick {
            let typed = meeInstantTypedSlots
            sectionHeader(symbole: StickerSheetTab.meeAndMeo.symbolName,
                          titre: String(localized: "sticker.sheet.instants.title",
                                        defaultValue: "Instants", bundle: .module)) {
                Text(String(localized: "sticker.sheet.instants.hint",
                            defaultValue: "Ce que vous écrivez s’affiche sur le sticker", bundle: .module))
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            ForEach(MeeInstantCatalog.rows(columns: Self.meeColumns)) { row in
                switch row {
                case .title(let kind):
                    Text(Self.instantKindTitle(kind))
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .padding(.top, Self.instantTitlePull)
                case .instants(let instants):
                    instantRow(instants, typed: typed, pick: meeInstantPick)
                        .padding(.top, Self.instantRowPull)
                }
            }
        }
    }

    /// Ramène l'espacement de section de l'onglet à celui d'une rangée.
    private static var instantRowPull: CGFloat { 8 - Self.rowSpacing(for: .custom) }
    private static var instantTitlePull: CGFloat { 16 - Self.rowSpacing(for: .custom) }

    /// Ce que l'onglet sait déjà, rangé par emplacement.
    var meeInstantTypedSlots: [MeeSlot: String] {
        var typed: [MeeSlot: String] = [:]
        typed[.message] = typedStickerTextTrimmed
        typed[.place] = currentPlace?.name
        typed[.time] = StickerSlotFiller.timeSlots(at: openedAt)[StickerSlotFiller.timeSlot]
        return typed
    }

    private func instantRow(_ instants: [MeeInstant], typed: [MeeSlot: String],
                            pick: @escaping (MeeInstant, [MeeSlot: String]) -> Void) -> some View {
        HStack(spacing: 8) {
            ForEach(instants) { instant in
                Button {
                    HapticFeedback.medium()
                    pick(instant, instant.sentSlots(typed))
                } label: {
                    MeeInstantView(instant: instant, slots: typed, side: Self.meeCellSide,
                                   pixelCap: MeeStickerFilmView.gridPixelCap)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(instant.title)
            }
            ForEach(instants.count..<Self.meeColumns, id: \.self) { _ in
                Color.clear.frame(maxWidth: .infinity)
            }
        }
        .frame(height: Self.meeCellSide)
    }

    static func instantKindTitle(_ kind: MeeInstant.Kind) -> String {
        switch kind {
        case .message: String(localized: "sticker.sheet.instants.message", defaultValue: "Messages", bundle: .module)
        case .moment: String(localized: "sticker.sheet.instants.moment", defaultValue: "Moments", bundle: .module)
        case .lieu: String(localized: "sticker.sheet.instants.lieu", defaultValue: "Lieux", bundle: .module)
        case .meteo: String(localized: "sticker.sheet.instants.meteo", defaultValue: "Météo", bundle: .module)
        }
    }
}
