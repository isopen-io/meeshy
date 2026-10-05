import SwiftUI
import MeeshySDK

// MARK: - Un onglet par pack installé, et la Boutique (#9190)

extension StickerPickerView {

    /// Les pages servies — la règle pure, alimentée par ce que l'hôte injecte.
    var offeredPages: [StickerSheetPage] {
        StickerSheetPage.offered(hasMee: meeStickerPick != nil,
                                 installed: packShelf?.installed,
                                 hasPackPick: packShelf != nil,
                                 hasShop: packShelf?.shop != nil)
    }

    /// La page RENDUE : la choisie si elle est encore servie, sinon la première
    /// — un pack retiré depuis la Boutique ne laisse pas un onglet fantôme.
    var displayedPage: StickerSheetPage {
        StickerSheetPage.resolved(selectedPage, among: offeredPages)
    }

    var displayedPageBinding: Binding<StickerSheetPage> {
        Binding(get: { displayedPage }, set: { selectedPage = $0 })
    }

    var tabEntries: [StickerSheetTabBar.Entry] {
        offeredPages.map { page in
            StickerSheetTabBar.Entry(page: page, title: Self.pageTitle(page, packs: packShelf?.installed),
                                     symbolName: Self.pageSymbol(page))
        }
    }

    static func pageTitle(_ page: StickerSheetPage, packs: [StickerPack]?) -> String {
        switch page {
        case .fixed(let onglet):
            return onglet.title
        case .pack(let slug):
            if let name = packs?.first(where: { $0.slug == slug })?.name { return name }
            return builtinPackTitle(slug) ?? slug
        case .shop:
            return String(localized: "sticker.sheet.tab.shop", defaultValue: "Boutique", bundle: .module)
        }
    }

    /// Le nom d'un pack intégré avant que la passerelle ait répondu — celui
    /// de `BUILTIN_STICKER_PACKS`, que le shared ne traduit pas non plus.
    static func builtinPackTitle(_ slug: String) -> String? {
        switch BuiltinStickerPack(slug: slug) {
        case .mee: "Mee"
        case .meo: "Meo"
        case .meeEtMeo: "Mee & Meo"
        case nil: nil
        }
    }

    static func pageSymbol(_ page: StickerSheetPage) -> String {
        switch page {
        case .fixed(let onglet): onglet.symbolName
        case .pack(let slug): BuiltinStickerPack(slug: slug) == nil ? "square.stack.3d.up.fill" : "bird.fill"
        case .shop: "bag.fill"
        }
    }

    // MARK: - Le contenu d'un pack

    @ViewBuilder
    func packContent(slug: String) -> some View {
        if let cast = MeeStickerCatalog.cast(forPackSlug: slug) {
            meeSections(cast: cast)
        } else if let shelf = packShelf, let pack = shelf.installed?.first(where: { $0.slug == slug }) {
            thirdPartyPackSection(pack, pick: shelf.onPick)
        }
    }

    /// **Un pack de tiers** : son auteur, puis ses stickers fixes et
    /// cinématiques. Un tap les remet à l'hôte, qui les envoie ou les pose avec
    /// leur image de repli et le descripteur `pack.<slug>.<clé>` du web.
    @ViewBuilder
    private func thirdPartyPackSection(_ pack: StickerPack,
                                       pick: @escaping (StickerPack, StickerPackItem) -> Void) -> some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: Self.meeColumns),
                      spacing: 10) {
                ForEach(pack.sendableItems) { item in
                    Button {
                        HapticFeedback.medium()
                        pick(pack, item)
                    } label: {
                        CachedAsyncImage(url: item.fileUrl,
                                         targetSize: CGSize(width: Self.meeCellSide, height: Self.meeCellSide),
                                         showsStatusOverlays: false,
                                         autoLoad: true) {
                            Text(item.emoji).font(.system(size: 40))
                        }
                        .scaledToFit()
                        .frame(width: Self.meeCellSide, height: Self.meeCellSide)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.title)
                }
            }
        } header: {
            sectionHeader(symbole: Self.pageSymbol(.pack(pack.slug)), titre: pack.name) {
                Text(String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@",
                                           bundle: .module), pack.author))
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - La Boutique

    @ViewBuilder
    var shopContent: some View {
        if let shop = packShelf?.shop {
            shop()
        }
    }
}
