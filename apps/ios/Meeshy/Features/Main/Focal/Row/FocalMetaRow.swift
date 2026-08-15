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
///
/// **F-083ter — contraste réparé (régression F-083)** : `metaTint` utilisait
/// `0.4`/`0.45` (AA échoué sur les deux thèmes — 2,85:1 clair, 4,49:1 sombre,
/// découvert par `FocalPaletteContrastTests`/F-090). Aligné sur
/// `FocalMetrics.MetaText` (`0.55` les DEUX thèmes — voir sa doc pour le
/// calcul : `0.5` clair, la valeur historique de `FocalIdentityHeader`/
/// `BubbleFooter`, ne mesure que 3,98:1, encore sous AA) — UNE SEULE
/// constante nommée, lue par les deux rangées-sœurs, pour qu'une dérive
/// future ne puisse plus séparer silencieusement leurs opacités (garde R15 :
/// plus de littéral orphelin).
///
/// **F-083ter — F10, libellé « modifié » visible** : `editedAt`/
/// `isEditSaving`/`hasEditHistory` (déjà portés par `BubbleContent`, aucune
/// extension de `FocalRowInput`) pilotent `BubbleEditedIndicator` (§1.3,
/// `internal`, non `fileprivate` — vérifié). Jusqu'ici seul le libellé
/// VoiceOver l'annonçait (`MessageAccessibilityLabelComposer`, F-080) ;
/// l'œil le voit désormais aussi, comme F10 l'exige (« un message édité
/// affiche « modifié » en 10.5 en méta »).
struct FocalMetaRow: View, Equatable {
    let isMe: Bool
    let timeString: String
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool
    var editedAt: Date? = nil
    var isEditSaving: Bool = false
    var hasEditHistory: Bool = false

    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    private var readTint: Color {
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }

    var body: some View {
        HStack(spacing: 4) {
            Spacer(minLength: 0)
            editedIndicator
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

    @ViewBuilder
    private var editedIndicator: some View {
        if editedAt != nil || isEditSaving {
            BubbleEditedIndicator(isMe: isMe, isSaving: isEditSaving, hasEditHistory: hasEditHistory, isDark: isDark)
        }
    }
}
