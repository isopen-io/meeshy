// apps/ios/Meeshy/Features/Main/Focal/Lens/FocalReadMoreSheet.swift

import SwiftUI
import MeeshyUI

/// Charge utile de la sheet « Lire plus » (spec Magnificence §3) —
/// construite par `FocalRow` depuis son contenu DÉJÀ résolu : le texte est
/// l'effectif du Prisme (traduction préférée, sinon l'original), jamais
/// re-résolu en aval. L'identité est le message : `.sheet(item:)` remplace
/// proprement le contenu si un second « Lire plus » arrive pendant la
/// présentation.
struct FocalReadMorePayload: Identifiable, Equatable {
    let messageId: String
    let senderName: String
    let timeString: String
    let text: String
    let accentHex: String
    let isDark: Bool

    var id: String { messageId }
}

/// « Lire plus » : le contenu INTÉGRAL du message, directement scrollable —
/// un message de trois écrans ne se déplie JAMAIS inline en Focal (il
/// casserait la loupe et l'atterrissage d'élection). Grand detent,
/// fermeture au swipe, on reste dans le fil.
struct FocalReadMoreSheet: View {
    let payload: FocalReadMorePayload

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(payload.senderName)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(Color(hex: payload.accentHex))
                Text(payload.timeString)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 12)

            ScrollView {
                Text(payload.text)
                    .font(MeeshyFont.relative(16))
                    .lineSpacing(4)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityLabel(Text(String(
            localized: "focal.readmore.sheet",
            defaultValue: "Message complet de \(payload.senderName)",
            bundle: .main
        )))
    }
}
