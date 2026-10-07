import SwiftUI
import MeeshyUI

// MARK: - Les emblèmes dessinés des concepts sans brique propre (#9564, amendement n° 2)
//
// PROVISOIRE : les tracés de Points, Élans et Tableau de bord sont dessinés d'abord par le lot web (#9563) et repris
// ici tracé pour tracé. En attendant, la Signature Meeshy teintée — jamais une bulle.

/// L'emblème du tableau de bord.
struct DashboardEmblem: View {
    var body: some View {
        SignatureMark(style: .flat, color: MeeshyColors.brandPrimary)
    }
}
