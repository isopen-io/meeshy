import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La rangée de traduction posée entre une légende et son invite** (#6504).
///
/// Elle RENDS ce que `CaptionTranslationOffer` décide, et rien d'autre :
/// - des traductions existent ⇒ les drapeaux de langue, l'actif marqué — un
///   toucher affiche la légende dans cette langue ;
/// - aucune ⇒ « Demander la traduction », qui part tout de suite ; pendant la
///   demande, un indicateur d'activité remplace le bouton, et les drapeaux
///   prennent sa place quand la traduction arrive ;
/// - rien à offrir ⇒ rien n'est rendu.
///
/// Registre `.overlay` des drapeaux, comme la rangée du lecteur de réel : elle
/// flotte sur un média dont le tap pilote la lecture.
struct MediaCaptionTranslationRow: View {
    let offer: CaptionTranslationOffer
    let isRequesting: Bool
    let onSelectLanguage: (String) -> Void
    let onTranslateNow: (String) -> Void

    var body: some View {
        switch offer {
        case .none:
            EmptyView()
        case .languages(let codes, let active):
            HStack(spacing: 6) {
                TranslationsBadge(metrics: .overlay)
                ForEach(codes, id: \.self) { code in
                    LanguageFlagChip(
                        code: code,
                        isActive: active?.lowercased() == code.lowercased(),
                        metrics: .overlay
                    ) {
                        onSelectLanguage(code)
                    }
                }
            }
            .accessibilityIdentifier("media.caption.translation.languages")
        case .translateNow(let target):
            if isRequesting {
                ProgressView()
                    .tint(.white)
                    .frame(minWidth: 32, minHeight: 32)
                    .accessibilityLabel(String(localized: "feed.post.translation.requested",
                                               defaultValue: "Demandée", bundle: .main))
            } else {
                Button {
                    HapticFeedback.light()
                    onTranslateNow(target)
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
            }
        }
    }
}
