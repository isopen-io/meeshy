import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Pending Settings Banner (inline)

/// Le bandeau des réglages en attente, monté par les DEUX racines (l'iPad ne le montrait pas : un réglage en file
/// hors ligne n'y laissait aucune trace). Une story en attente n'a pas de bandeau : elle se lit à l'horloge de
/// l'anneau du tray et de « File » (#15223, décision du porteur #14879).
struct RootPendingBanners: View {
    var body: some View {
        VStack(spacing: MeeshySpacing.xs + 2) {
            PendingSettingsBannerInline()
            Spacer()
        }
        .padding(.top, MeeshySpacing.xxxl + MeeshySpacing.lg)
        .zIndex(189)
    }
}

private struct PendingSettingsBannerInline: View {
    @State private var pendingCount: Int = 0
    @State private var subscription: AnyCancellable?

    var body: some View {
        Group {
            if pendingCount > 0 {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.indigo950)

                    Text("\(String(localized: "root.pending_changes", defaultValue: "Modifications en attente", bundle: .main)) (\(pendingCount))")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.indigo950)
                        .lineLimit(1)
                        .layoutPriority(1)

                    Spacer(minLength: MeeshySpacing.sm)

                    // La version FR est plus longue : shrink-avant-troncature pour rester lisible.
                    Text(String(localized: "root.sync_on_reconnect", defaultValue: "Synchronisation au retour en ligne", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                        .foregroundStyle(MeeshyColors.indigo950.opacity(0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm)
                // Ambre `warning` (état en attente / hors-ligne) ; texte foncé pour le contraste.
                .background(
                    LinearGradient(
                        colors: [
                            MeeshyColors.warning,
                            MeeshyColors.amber500
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .shadow(color: MeeshyColors.warning.opacity(MeeshyOpacity.medium), radius: MeeshyShadow.medium.radius, y: 2)
                .padding(.horizontal, MeeshySpacing.lg)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: pendingCount)
        .task {
            pendingCount = await SettingsActionQueue.shared.count
            subscription = SettingsActionQueue.shared.pendingCountChanged.publisher
                .receive(on: DispatchQueue.main)
                .sink { count in
                    pendingCount = count
                }
        }
        .onDisappear {
            subscription?.cancel()
            subscription = nil
        }
    }
}
