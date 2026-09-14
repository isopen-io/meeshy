import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La rangée de traduction posée entre une légende et son invite** (#6504).
///
/// Elle RENDS ce que `CaptionTranslationOffer` décide, et rien d'autre :
/// - des traductions existent ⇒ les drapeaux de langue, l'actif marqué — un
///   toucher affiche la légende dans cette langue ; la pastille de traduction
///   ouvre la feuille ;
/// - aucune ⇒ l'icône de traduction, qui ouvre LA feuille de traduction des
///   messages et des audios : on y choisit la langue souhaitée ;
/// - rien à offrir ⇒ rien n'est rendu.
///
/// Même glyphe ⇒ même effet : l'icône et la pastille ouvrent toutes deux la
/// feuille. Pendant une demande, un indicateur d'activité se pose à côté, sans
/// retirer l'accès à la feuille.
///
/// Registre `.overlay` des drapeaux, comme la rangée du lecteur de réel : elle
/// flotte sur un média dont le tap pilote la lecture.
struct MediaCaptionTranslationRow: View {
    let offer: CaptionTranslationOffer
    let isRequesting: Bool
    let onSelectLanguage: (String) -> Void
    let onOpenTranslations: () -> Void

    var body: some View {
        switch offer {
        case .none:
            EmptyView()
        case .languages(let codes, let active):
            HStack(spacing: 6) {
                TranslationsBadge(metrics: .overlay, action: onOpenTranslations)
                ForEach(codes, id: \.self) { code in
                    LanguageFlagChip(
                        code: code,
                        isActive: active?.lowercased() == code.lowercased(),
                        metrics: .overlay
                    ) {
                        onSelectLanguage(code)
                    }
                }
                indicateurDeDemande
            }
            .accessibilityIdentifier("media.caption.translation.languages")
        case .translate:
            HStack(spacing: 6) {
                Button {
                    HapticFeedback.light()
                    onOpenTranslations()
                } label: {
                    Image(systemName: "translate")
                        .font(MeeshyFont.relative(15, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(minWidth: 32, minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "bubble.footer.translation.request",
                                           defaultValue: "Demander la traduction", bundle: .main))
                .accessibilityIdentifier("media.caption.translation.request")
                indicateurDeDemande
            }
        }
    }

    @ViewBuilder
    private var indicateurDeDemande: some View {
        if isRequesting {
            ProgressView()
                .tint(.white)
                .controlSize(.small)
                .accessibilityLabel(String(localized: "feed.post.translation.requested",
                                           defaultValue: "Demandée", bundle: .main))
        }
    }
}
