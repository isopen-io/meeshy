import SwiftUI
import MeeshySDK

// MARK: - Les Meeshes qui manquent pour un pack (#20528)

/// **Ce qui manque pour acheter un pack, dit AVANT le geste** (tranche iOS de #17378, miroir de
/// `apps/web/src/lib/packs/shortfall.ts`) : au lieu de le découvrir au refus de l'achat
/// (`shop.error.insufficient`). Le solde est celui que `GET /packs/shop` sert ; l'écart, celui de
/// `GameSpend.preview`, la loi de tout geste qui dépense. Le serveur reste juge : la ligne montre,
/// « Acheter » reste offert.
public struct PackMeeshShortfall: Hashable, Sendable {
    public let missing: Int
    /// « Il vous manque 8 Meeshes », le compte dans les chiffres du lecteur.
    public let line: String

    public init(missing: Int, language: String) {
        self.missing = missing
        self.line = missing == 1
            ? String(localized: "shop.short.one", defaultValue: "Il vous manque 1 Meesh", bundle: .module)
            : String(format: String(localized: "shop.short.many", defaultValue: "Il vous manque %@ Meeshes", bundle: .module),
                     PackUnlockCopy.formatCount(missing, language: language))
    }

    /// `nil` = rien à dire : solde inconnu (ancien serveur), pack possédé, gratuit ou abordable.
    public static func missing(balance: Int?, price: Int?, owned: Bool) -> Int? {
        guard !owned, let price, let balance else { return nil }
        let preview = GameSpend.preview(held: balance, cost: price)
        return preview.affordable ? nil : preview.missing
    }

    static func of(_ pack: ShopPack, balance: Int?, language: String) -> PackMeeshShortfall? {
        missing(balance: balance, price: pack.price, owned: pack.isOwned).map { PackMeeshShortfall(missing: $0, language: language) }
    }

    /// Le chemin vers les Meeshes : la frappe, dans la fiche de l'Héritage.
    public static var earnLabel: String {
        String(localized: "shop.short.earn", defaultValue: "Frapper des Meeshes", bundle: .module)
    }
}

/// **La ligne sous un pack trop cher** : l'écart, puis « Frapper des Meeshes » quand l'app sait y mener
/// (`onEarn`). Le lien est un bouton à part entière, cible de 44 pt, hors de l'élément qui ouvre la fiche.
struct PackMeeshShortfallLine: View {
    let shortfall: PackMeeshShortfall
    let slug: String
    let onEarn: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
    }

    @ViewBuilder
    private var content: some View {
        Text(shortfall.line)
            .font(MeeshyFont.relative(12, weight: .semibold))
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("shop.short.\(slug)")
        if let onEarn {
            Button {
                HapticFeedback.light()
                onEarn()
            } label: {
                Text(PackMeeshShortfall.earnLabel)
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .underline()
                    .foregroundStyle(MeeshyColors.indigo500)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("shop.earn.\(slug)")
        }
    }
}
