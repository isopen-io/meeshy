import SwiftUI
import MeeshySDK

// MARK: - L'emblème d'un contenant de l'Héritage (#17437)
//
// Une image par contenant, de la Bourse à la Réserve, lisible à 18 pt — là où l'atlas empile des pièces, qui ne se
// distinguent plus à cette taille. Le contenant grandit avec lui : une bourse, un sac, un coffret, un coffre, une
// couronne, puis l'édifice de la Réserve. Décoratif : l'hôte dit le nom du contenant au lecteur d'écran.

public struct TreasuryTierEmblem: View {

    private let tier: TreasuryTierKey
    private let side: CGFloat
    private let color: Color

    public init(tier: TreasuryTierKey, side: CGFloat = 18, color: Color) {
        self.tier = tier
        self.side = side
        self.color = color
    }

    /// Le symbole de chaque contenant — tous présents depuis iOS 14.
    public static func symbol(for tier: TreasuryTierKey) -> String {
        switch tier {
        case .bourse: "bag.fill"
        case .escarcelle: "handbag.fill"
        case .coffret: "shippingbox.fill"
        case .coffre: "archivebox.fill"
        case .tresor: "crown.fill"
        case .reserve: "building.columns.fill"
        }
    }

    public var body: some View {
        Image(systemName: Self.symbol(for: tier))
            .font(.system(size: side * 15 / 18, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: side, height: side)
            .accessibilityHidden(true)
    }
}
