import SwiftUI
import MeeshySDK
import MeeshyUI

/// Méta discrète — rangée de suite de groupe (`input.isFirstInGroup ==
/// false`) : PAS d'en-tête d'identité (contrat §7 : « `FocalIdentityHeader`
/// absent, texte seul au retrait 29 »), seulement l'heure en petit sous le
/// texte, retrait `29` (`FocalMetrics.Text.indent`).
///
/// Cote « Méta 10,5 → `.caption2` » (contrat §0 — deux écarts de design
/// actés hors code) : `MeeshyFont.relative(10.5)` ne rend PAS 10.5 pt
/// littéral (10/10.5/11 tombent tous sur `.caption2` côté SDK) — appelé tel
/// quel, jamais remplacé par un `.caption2` en dur, pour que le fait reste
/// visible au lecteur du code si le mapping SDK change un jour.
struct FocalMetaRow: View, Equatable {
    let isMe: Bool
    let timeString: String
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool

    private var metaTint: Color {
        isDark ? .white.opacity(0.45) : .black.opacity(0.4)
    }

    private var readTint: Color {
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }

    var body: some View {
        HStack(spacing: 4) {
            Spacer(minLength: 0)
            Text(timeString)
                .font(MeeshyFont.relative(10.5))
                .foregroundColor(metaTint)
            if isMe, let deliveryStatus {
                BubbleDeliveryCheck(
                    status: deliveryStatus,
                    isOffline: false,
                    tint: metaTint,
                    readTint: readTint
                )
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
        .accessibilityHidden(true)
    }
}
