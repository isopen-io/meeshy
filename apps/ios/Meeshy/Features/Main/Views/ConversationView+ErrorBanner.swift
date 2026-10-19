import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La bannière d'erreur de la conversation
//
// Extraite de `ConversationView.swift` (cohésion) : elle ne lit que le message
// d'erreur et l'état plié / déplié de l'en-tête (la bande qu'elle doit
// dégager), et rend le rejet à l'hôte par `onDismiss`.

struct ConversationErrorBanner: View {
    let error: String?
    let showOptions: Bool
    let onDismiss: () -> Void

    var body: some View {
        Group {
            if let error {
                VStack {
                    Color.clear.frame(height: showOptions ? 72 : 56)
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(MeeshyColors.warning)
                            .accessibilityHidden(true)
                        Text(error)
                            .font(.caption)
                            .lineLimit(2)
                        Spacer()
                        Button {
                            onDismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                    }
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(.ultraThinMaterial)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    Spacer()
                }
            }
        }
    }
}
