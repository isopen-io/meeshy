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
    /// Des RANGÉES de hauteur fixe dans une pile paresseuse — jamais une grille
    /// par famille, qui figeait le défilement de la planche Mee & Meo.
    @ViewBuilder
    var meeInstantSections: some View {
        if let meeInstantPick {
            let typed = meeInstantTypedSlots
            LazyVStack(alignment: .leading, spacing: 8) {
                sectionHeader(symbole: StickerSheetTab.meeAndMeo.symbolName,
                              titre: String(localized: "sticker.sheet.instants.title",
                                            defaultValue: "Instants", bundle: .module)) {
                    Text(String(localized: "sticker.sheet.instants.hint",
                                defaultValue: "Ce que vous écrivez s’affiche sur le sticker", bundle: .module))
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                ForEach(MeeInstantCatalog.sections) { section in
                    Text(Self.instantKindTitle(section.kind))
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .padding(.top, 6)
                    ForEach(Array(stride(from: 0, to: section.instants.count, by: Self.meeColumns)), id: \.self) { debut in
                        instantRow(Array(section.instants[debut..<min(debut + Self.meeColumns, section.instants.count)]),
                                   typed: typed, pick: meeInstantPick)
                    }
                }
            }
        }
    }

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
