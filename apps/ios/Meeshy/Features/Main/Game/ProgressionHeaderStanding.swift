import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE GROUPE DE L'EN-TÊTE DE LA PREMIÈRE PAGE (#9564, amendement n° 2) — à droite du titre, UN seul groupe : le
/// blason de rang (Gloire) et le nombre de Meeshes avec sa pièce. Chacun rebondit et ouvre SES précisions : le
/// blason, la feuille du rang ; le compteur, SA feuille d'avant la refonte (solde, frappes, et la frappe par Mee et
/// Meo quand les points le permettent, #9537).
///
/// Rien si la passerelle ne sert pas la donnée : pas de blason sans bloc `game`, pas de compteur sans solde — un
/// solde de zéro montré à quelqu'un qui en a deux serait pire qu'une absence. Il ne vit QUE sur la première page :
/// la fiche des Meeshes a son héros.
struct ProgressionHeaderStanding: View {
    /// Le rang servi ; `nil` devant un ancien serveur (ou sous « Jeu masqué »).
    let glory: GameBlock.Glory?
    /// Le solde servi ; `nil` quand la passerelle ne le sert pas.
    let meesh: EngagementMeeshProgress?
    let isMinting: Bool
    let mintError: String?
    /// La pièce que la feuille du compteur frappe ; `nil` : pas de scène de frappe.
    let next: GameMintNext?
    let onMint: () -> Void

    /// Le blason tient dans le disque des chromes ronds de l'en-tête.
    static let blasonSide: CGFloat = 30

    var body: some View {
        if glory != nil || meesh != nil {
            HStack(spacing: MeeshySpacing.xs) {
                if let glory {
                    RankBlasonView(rank: glory.rank, division: glory.division)
                        .frame(width: Self.blasonSide, height: Self.blasonSide)
                        .frame(minWidth: Self.blasonSide, minHeight: MeeshyControlSize.tapTarget)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(GameCopy.rankLabel(glory.rank, division: glory.division))
                        .gameElement(GameElementDetails.rank(glory), identifier: "progression.rank.entry")
                }
                if let meesh {
                    ProgressionMeeshEntry(
                        meesh: meesh, isMinting: isMinting, mintError: mintError, next: next, onMint: onMint
                    )
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(GameDetailText.headerGroup)
        }
    }
}
