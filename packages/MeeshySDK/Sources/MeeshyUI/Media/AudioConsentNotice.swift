import SwiftUI

/// Note inline discrète invitant l'utilisateur à activer le consentement vocal.
/// Atome SDK : paramètres opaques, aucune décision produit, aucun singleton.
public struct AudioConsentNotice: View, Equatable {
    private let message: String
    private let actionTitle: String
    private let accentHex: String
    private let onTap: () -> Void

    public init(message: String, actionTitle: String, accentHex: String, onTap: @escaping () -> Void) {
        self.message = message
        self.actionTitle = actionTitle
        self.accentHex = accentHex
        self.onTap = onTap
    }

    public nonisolated static func == (lhs: AudioConsentNotice, rhs: AudioConsentNotice) -> Bool {
        lhs.message == rhs.message && lhs.actionTitle == rhs.actionTitle && lhs.accentHex == rhs.accentHex
    }

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                Image(systemName: "mic.slash").font(.caption)
                    .foregroundStyle(.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(message).font(.caption).multilineTextAlignment(.leading)
                        .foregroundStyle(.primary)
                    Text(actionTitle).font(.caption2.weight(.semibold))
                        .foregroundStyle(Color(hex: accentHex))
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption2)
                    .foregroundStyle(Color(hex: accentHex))
            }
            .padding(.horizontal, 10).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(hex: accentHex).opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(message). \(actionTitle)"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("audioConsentNotice")
    }
}
