import SwiftUI
import MeeshyUI

struct OfflineBanner: View {
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)

            Text(String(localized: "connection.offline", defaultValue: "Hors ligne"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            Text(String(localized: "connection.offline.subtitle", defaultValue: "Les messages seront envoyes a la reconnexion"))
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(.white.opacity(0.8))
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [
                    Color(hex: "E74C3C").opacity(0.9),
                    Color(hex: "C0392B").opacity(0.85)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: Color(hex: "E74C3C").opacity(0.3), radius: 6, y: 2)
        .padding(.horizontal, 16)
        .padding(.top, 50)
    }
}
