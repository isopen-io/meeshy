import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Pending Settings Banner (inline)

/// Les deux bandeaux d'attente, montés par les DEUX racines (l'iPad ne les montrait pas : un réglage ou une story
/// en file hors ligne n'y laissait aucune trace).
struct RootPendingBanners: View {
    var body: some View {
        VStack(spacing: MeeshySpacing.xs + 2) {
            PendingSettingsBannerInline()
            PendingStoryBannerInline()
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
                        .foregroundColor(MeeshyColors.indigo950)

                    Text("\(String(localized: "root.pending_changes", defaultValue: "Modifications en attente", bundle: .main)) (\(pendingCount))")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo950)
                        .lineLimit(1)
                        .layoutPriority(1)

                    Spacer(minLength: MeeshySpacing.sm)

                    // cf. PendingStoryBannerInline : la version FR est plus longue —
                    // shrink-avant-troncature pour rester lisible.
                    Text(String(localized: "root.sync_on_reconnect", defaultValue: "Synchronisation au retour en ligne", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                        .foregroundColor(MeeshyColors.indigo950.opacity(0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm)
                // Ambre `warning` cohérent avec PendingStoryBannerInline (état
                // en attente / hors-ligne) ; texte foncé pour le contraste.
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

// MARK: - Pending Story Banner (inline)

/// Surfaces the count of stories waiting in `StoryPublishQueue` (typically
/// composed offline). Mirrors `PendingSettingsBannerInline`. Self-hides
/// when the queue drains, OR when the user swipes it away (up/left/right —
/// user request 2026-07-19: it had no gesture at all before). A manual
/// dismiss only holds for the CURRENT `pendingCount` — it reappears the
/// moment the count changes (a new story queued, or one resolves), so a
/// swipe never permanently hides a genuinely new situation.
private struct PendingStoryBannerInline: View {
    @ObservedObject private var publishService: StoryPublishService
    @State private var dismissedAtCount: Int?

    init(publishService: StoryPublishService = .shared) {
        self.publishService = publishService
    }

    private var isVisible: Bool {
        publishService.pendingCount > 0 && dismissedAtCount != publishService.pendingCount
    }

    var body: some View {
        Group {
            if isVisible {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "photo.stack")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo950)

                    Text("\(String(localized: "root.pending_stories", defaultValue: "Stories en attente", bundle: .main)) (\(publishService.pendingCount))")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo950)
                        .lineLimit(1)
                        .layoutPriority(1)

                    Spacer(minLength: MeeshySpacing.sm)

                    // Texte secondaire : la version FR ("Publication au retour en
                    // ligne") est plus longue que l'anglaise — `minimumScaleFactor`
                    // la réduit avant de tronquer, pour qu'elle reste lisible en
                    // portrait étroit / Dynamic Type agrandi.
                    Text(String(localized: "root.publish_on_reconnect", defaultValue: "Publication au retour en ligne", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                        .foregroundColor(MeeshyColors.indigo950.opacity(0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm)
                // Ambre `warning` (design system : "Attention / pending") au lieu
                // de l'indigo de marque, pour signaler un état hors-ligne/en
                // attente ; texte foncé (indigo950) pour un contraste lisible sur
                // l'ambre clair.
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
                .gesture(
                    DragGesture(minimumDistance: 15)
                        .onEnded { value in
                            guard PendingBannerDismissResolver.shouldDismiss(translation: value.translation) else { return }
                            dismiss()
                        }
                )
                .accessibilityAction(named: Text(String(localized: "common.dismiss", defaultValue: "Masquer", bundle: .main))) {
                    dismiss()
                }
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: publishService.pendingCount)
    }

    private func dismiss() {
        dismissedAtCount = publishService.pendingCount
        HapticFeedback.light()
    }
}
