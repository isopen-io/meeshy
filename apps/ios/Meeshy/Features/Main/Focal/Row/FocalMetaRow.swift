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
    /// Retrait — aligné sur la pastille. Défaut `FocalMetrics.Text.indent`.
    var indent: CGFloat = FocalMetrics.Text.indent
    var editedAt: Date? = nil
    var isEditSaving: Bool = false
    var hasEditHistory: Bool = false
    /// Toucher les COCHES ouvre les « détails de lecture ». Cette affordance
    /// vivait dans `FocalIdentityHeader` tant que les têtes de groupe se
    /// dataient par le haut ; elle a suivi les coches en bas (directive
    /// 2026-08-23) — la date, elle, reste informative. Le bouton n'est
    /// touchable que pendant le révélé (`FocalRevealedDetail` coupe le
    /// hit-test au repos) : sinon le fil immobile serait semé de boutons
    /// invisibles.
    var onShowReadStatus: (() -> Void)? = nil

    /// `==` MANUEL : `onShowReadStatus` est une closure, donc la synthèse
    /// automatique d'`Equatable` ne s'applique plus. Elle est volontairement
    /// HORS comparaison — c'est une action, pas un état ; la comparer
    /// rendrait la rangée inégale à chaque reconstruction du parent et
    /// annulerait le `.equatable()` qui protège la liste des re-rendus.
    /// Même écart que `FocalIdentityHeader` pour `onOpenProfile`.
    static func == (lhs: FocalMetaRow, rhs: FocalMetaRow) -> Bool {
        lhs.isMe == rhs.isMe
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.isDark == rhs.isDark
            && lhs.indent == rhs.indent
            && lhs.editedAt == rhs.editedAt
            && lhs.isEditSaving == rhs.isEditSaving
            && lhs.hasEditHistory == rhs.hasEditHistory
    }

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
            stamp
            if isMe, let deliveryStatus {
                // Directive 2026-08-24 : les coches ne s'inscrivent plus en
                // permanence — elles paraissent et s'effacent avec l'heure,
                // sous la MÊME fenêtre de défilement.
                FocalRevealedDetail {
                    deliveryChecks(deliveryStatus)
                }
            }
        }
        .padding(.leading, indent)
        .accessibilityHidden(true)
    }

    /// Les coches : un bouton quand la rangée sait ouvrir les détails de
    /// lecture (zone de toucher élargie, le glyphe reste au gabarit méta).
    @ViewBuilder
    private func deliveryChecks(_ status: Message.DeliveryStatus) -> some View {
        let check = BubbleDeliveryCheck(status: status, isOffline: false, tint: metaTint, readTint: readTint)
        if let onShowReadStatus {
            Button(action: onShowReadStatus) {
                check
                    .padding(.horizontal, 4)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "message.read_status", defaultValue: "Détails de lecture", bundle: .main))
        } else {
            check
        }
    }

    /// L'horodatage de la rangée : `FocalRevealedTime`, masqué au
    /// repos et révélé pendant le défilement. C'est ce qui remplace la pilule
    /// flottante « jour · heure » : l'information est rendue AU MESSAGE
    /// qu'elle date, au lieu de flotter détachée en haut de l'écran.
    private var stamp: some View {
        FocalRevealedTime(timeString: timeString, tint: metaTint)
    }

    @ViewBuilder
    private var editedIndicator: some View {
        if editedAt != nil || isEditSaving {
            BubbleEditedIndicator(isMe: isMe, isSaving: isEditSaving, hasEditHistory: hasEditHistory, isDark: isDark)
        }
    }
}
