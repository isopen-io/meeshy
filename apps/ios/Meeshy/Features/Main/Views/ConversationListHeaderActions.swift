import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les actions de l'en-tête de la liste

/// Extraites de `ConversationListHeaderOverlay` pour que l'en-tête choisisse,
/// par `ViewThatFits`, l'espacement qui TIENT dans la colonne — le volet gauche
/// d'un iPad peut descendre à ~200 pt.
extension ConversationListHeaderOverlay {
    @ViewBuilder
    func headerActions(spacing: CGFloat) -> some View {
        // Header action glyphs (link/plus/bell/gear + notification badge) keep
        // fixed point sizes: two sit inside 40x40 glass circles and the row reads
        // as chrome — scaling them with Dynamic Type would break the toolbar grid.
        HStack(spacing: spacing) {
            // iOS 26 Liquid Glass for the two primary actions (share link +
            // new conversation), grouped so the glass circles blend. Gating/
            // fallback owned by the SDK Compatibility wrappers.
            AdaptiveGlassContainer(spacing: 10) {
                HStack(spacing: spacing) {
                    Button {
                        showShareLinkSheet = true
                    } label: {
                        Image(systemName: "link.badge.plus")
                            .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo500)
                            .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                            .adaptiveGlass(in: Circle(), interactive: true)
                    }
                    .accessibilityLabel(String(localized: "conversation.list.create_share_link", defaultValue: "Créer un lien de partage", bundle: .main))

                    Button {
                        onNewConversation?()
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: MeeshyIconSize.lg, weight: .bold))
                            .foregroundColor(MeeshyColors.indigo500)
                            .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                            .adaptiveGlass(in: Circle(), interactive: true)
                    }
                    .accessibilityLabel(String(localized: "conversation.list.new_conversation", defaultValue: "Nouvelle conversation", bundle: .main))
                }
            }

            if let onNotificationsTap {
                // Le compteur d'alertes non lues (pastille rouge) portait
                // l'information par la seule couleur/badge — muet pour
                // VoiceOver. Exposé en `accessibilityValue` (pluriel géré).
                // #4328 — UNE clé : le catalogue porte le pluriel des sept langues (l'arabe en a six catégories), le ternaire d'avant le tenait en Swift sur deux clés absentes.
                let unreadA11yValue: String = iPadNotificationCount <= 0
                    ? ""
                    : String(localized: "conversation.list.notifications.unread.a11y",
                             defaultValue: "\(iPadNotificationCount) non lues", bundle: .main)
                Button {
                    HapticFeedback.light()
                    onNotificationsTap()
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo500)

                        if iPadNotificationCount > 0 {
                            Text(NotificationBadge.displayed(iPadNotificationCount))
                                .font(.system(size: 9, weight: NotificationBadge.fontWeight))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                // Capsule et non cercle figé : « 99+ » doit
                                // s'afficher entier, pas être rogné.
                                .padding(.horizontal, MeeshySpacing.xs)
                                .frame(minWidth: 16, minHeight: 16)
                                .background(Capsule().fill(MeeshyColors.error))
                                .offset(x: 6, y: -6)
                        }
                    }
                }
                .accessibilityLabel(String(localized: "conversation.list.notifications", defaultValue: "Notifications", bundle: .main))
                .accessibilityValue(unreadA11yValue)
            }

            if let onSettingsTap {
                Button {
                    HapticFeedback.light()
                    onSettingsTap()
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                }
                .accessibilityLabel(String(localized: "conversation.list.settings", defaultValue: "Réglages", bundle: .main))
            }
        }
    }
}
