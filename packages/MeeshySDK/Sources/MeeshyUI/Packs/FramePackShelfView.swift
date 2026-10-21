import SwiftUI
import MeeshySDK

// MARK: - Les onglets d'une Boutique : la Boutique, puis un par pack installé (#10150)

/// **Ce que la barre d'une Boutique propose** — la Boutique d'abord, puis un
/// onglet par pack INSTALLÉ, dans l'ordre du serveur. Installer ajoute
/// l'onglet ; retirer l'enlève.
public enum PackShopPage: Hashable, Identifiable, Sendable {
    case shop
    case pack(String)

    public var id: String {
        switch self {
        case .shop: "shop"
        case .pack(let slug): "pack.\(slug)"
        }
    }

    public static func offered(installed: [String]) -> [PackShopPage] {
        [.shop] + installed.map { .pack($0) }
    }

    /// La page choisie si elle est encore servie, sinon la Boutique — un pack
    /// retiré pendant que son onglet était ouvert ne laisse pas d'onglet fantôme.
    public static func resolved(_ chosen: PackShopPage, among offered: [PackShopPage]) -> PackShopPage {
        offered.contains(chosen) ? chosen : .shop
    }
}

/// La barre d'onglets d'une Boutique : des capsules qui défilent.
public struct PackShopTabBar: View {
    public struct Entry: Identifiable, Hashable {
        public let page: PackShopPage
        public let title: String
        public var id: String { page.id }

        public init(page: PackShopPage, title: String) {
            self.page = page
            self.title = title
        }
    }

    @Binding var selection: PackShopPage
    let entries: [Entry]

    public init(selection: Binding<PackShopPage>, entries: [Entry]) {
        self._selection = selection
        self.entries = entries
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(entries) { entry in
                    let selected = entry.page == selection
                    Button {
                        HapticFeedback.light()
                        selection = entry.page
                    } label: {
                        HStack(spacing: 6) {
                            if entry.page == .shop {
                                Image(systemName: "bag.fill").font(.system(size: 12, weight: .semibold))
                            }
                            Text(entry.title)
                                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                                .lineLimit(1)
                        }
                        .foregroundStyle(selected ? Color.white : Color.primary)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 36)
                        .background {
                            if selected {
                                Capsule().fill(MeeshyColors.brandGradient)
                            } else {
                                Capsule().fill(Color.primary.opacity(0.06))
                            }
                        }
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }
}

// MARK: - Les cadres d'un pack installé

/// Un cadre montré sur l'étagère : son nom traduit, ce à quoi il sert, sa vignette.
public struct FrameTile: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let usageText: String
    public let thumb: PackAssetFile

    public init(id: String, name: String, usageText: String, thumb: PackAssetFile) {
        self.id = id
        self.name = name
        self.usageText = usageText
        self.thumb = thumb
    }
}

public enum FrameShelfContent: Hashable, Sendable {
    case loading
    /// Le contrat est d'une version que ce client ne lit pas : rien ne se télécharge.
    case needsUpdate
    case unavailable
    case frames([FrameTile])
}

/// **L'onglet d'un pack de cadres installé** : ses cadres, chacun avec le
/// libellé de SON usage (`describeFrameUsage`) — la loi le veut affiché.
public struct FramePackShelfView: View {
    let content: FrameShelfContent

    public init(content: FrameShelfContent) {
        self.content = content
    }

    static let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)

    public var body: some View {
        switch content {
        case .loading:
            LazyVGrid(columns: Self.columns, spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(Color.primary.opacity(0.06))
                        .aspectRatio(SceneShape.aspect, contentMode: .fit)
                }
            }
            .accessibilityHidden(true)
        case .needsUpdate:
            notice(String(localized: "pack.shelf.needsUpdate",
                          defaultValue: "Mets à jour Meeshy pour voir les cadres de ce pack.", bundle: .module),
                   symbol: "arrow.down.app")
        case .unavailable:
            notice(String(localized: "pack.shelf.unavailable",
                          defaultValue: "Les cadres de ce pack n’ont pas pu se charger.", bundle: .module),
                   symbol: "wifi.exclamationmark")
        case .frames(let tiles):
            LazyVGrid(columns: Self.columns, spacing: 16) {
                ForEach(tiles) { tile in
                    tileView(tile)
                }
            }
        }
    }

    private func tileView(_ tile: FrameTile) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            StoredPackImage(file: tile.thumb, maxPixelSize: 540)
                .aspectRatio(SceneShape.aspect, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
            Text(tile.name)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .lineLimit(1)
            Label(tile.usageText, systemImage: "checkmark.seal")
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }

    private func notice(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.md)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.primary.opacity(0.05)))
    }
}

// MARK: - Le libellé d'usage, traduit

/// **« Rang Ambassadeur IV uniquement »** — `FrameUsageLaw.describeFrameUsage`
/// rendu dans la langue de l'interface. Les paramètres sont des CLÉS (`rank`,
/// `rarity`, `family`) que l'hôte nomme ; `division` arrive déjà en chiffres
/// romains. Les formats vivent dans le catalogue de MeeshyUI.
public enum FrameUsageText {
    static let parameterOrder = ["rank", "division", "rarity", "family"]

    public static func text(_ label: FrameUsageLabel,
                            name: (_ parameter: String, _ value: String) -> String,
                            format: @MainActor (String) -> String = localizedFormat) -> String {
        let values: [String] = parameterOrder.compactMap { parameter in
            guard let value = label.params[parameter] else { return nil }
            return parameter == "division" ? value : name(parameter, value)
        }
        let pattern = format(label.key)
        return values.isEmpty ? pattern : String(format: pattern, arguments: values)
    }

    public static func localizedFormat(_ key: String) -> String {
        String(localized: String.LocalizationValue(key), bundle: .module)
    }
}
