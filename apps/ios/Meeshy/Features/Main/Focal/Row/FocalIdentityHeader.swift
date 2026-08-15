import SwiftUI
import MeeshySDK
import MeeshyUI

/// En-tête d'identité de la rangée plate — « Pseudo · HH:mm » (contrat
/// §WS-4), affiché UNIQUEMENT en tête de groupe (`input.isFirstInGroup`).
/// Pastille `22` (`FocalMetrics.Avatar.size`), nom `13` heavy
/// (`FocalMetrics.Name`), heure `12`/`600` (`FocalMetrics.Time`).
///
/// « "Toi" en indigo avec ses ✓✓ » (critère §7) : `isMe` ⇒ nom = clé
/// `focal.row.you`, tint `MeeshyColors.indigo500`, `BubbleDeliveryCheck`
/// DANS l'en-tête (pas en pied — contrat §WS-4 : « pas en pied »).
///
/// Vue PURE : primitifs uniquement, aucun `@State`.
struct FocalIdentityHeader: View, Equatable {
    let isMe: Bool
    let senderDisplayName: String
    let senderUsername: String?
    let senderAvatarURL: String?
    let senderThumbHash: String?
    let senderColorHex: String
    let senderPresence: PresenceState
    let senderStoryRing: StoryRingState
    let senderMoodEmoji: String?
    let timeString: String
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil

    static func == (lhs: FocalIdentityHeader, rhs: FocalIdentityHeader) -> Bool {
        lhs.isMe == rhs.isMe
            && lhs.senderDisplayName == rhs.senderDisplayName
            && lhs.senderUsername == rhs.senderUsername
            && lhs.senderAvatarURL == rhs.senderAvatarURL
            && lhs.senderThumbHash == rhs.senderThumbHash
            && lhs.senderColorHex == rhs.senderColorHex
            && lhs.senderPresence == rhs.senderPresence
            && lhs.senderStoryRing == rhs.senderStoryRing
            && lhs.senderMoodEmoji == rhs.senderMoodEmoji
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.isDark == rhs.isDark
    }

    /// Nom affiché — clé `focal.row.you` pour « Toi » (contrat §7),
    /// `senderDisplayName` sinon.
    private var displayName: String {
        isMe
            ? String(localized: "focal.row.you", defaultValue: "Toi", bundle: .main)
            : senderDisplayName
    }

    private var nameColor: Color {
        isMe ? MeeshyColors.indigo500 : (isDark ? .white.opacity(0.92) : .black.opacity(0.88))
    }

    /// `.read` toujours indigo (jamais blanc, jamais gras) — paire réelle du
    /// dépôt actée par le contrat §0 : `indigo400` sombre / `indigo600` clair
    /// (`BubbleFooter.readColor`, `private`, reconstruit ici à l'identique —
    /// même écart de réutilisation que WS-3, la logique est triviale, 2
    /// branches, pas une loi).
    private var readTint: Color {
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }

    private var metaTint: Color {
        isDark ? .white.opacity(0.55) : .black.opacity(0.5)
    }

    var body: some View {
        Button {
            onOpenProfile?(ProfileSheetUser(
                userId: nil,
                username: senderUsername ?? senderDisplayName,
                displayName: senderDisplayName,
                avatarURL: senderAvatarURL,
                accentColor: senderColorHex
            ))
        } label: {
            HStack(spacing: 7) {
                MeeshyAvatar(
                    name: senderDisplayName,
                    context: .custom(FocalMetrics.Avatar.size),
                    accentColor: senderColorHex,
                    avatarURL: senderAvatarURL,
                    thumbHash: senderThumbHash,
                    storyState: senderStoryRing,
                    moodEmoji: senderMoodEmoji,
                    presenceState: senderPresence,
                    enablePulse: false,
                    isDark: isDark
                )

                Text(displayName)
                    .font(FocalMetrics.Name.font)
                    .foregroundColor(nameColor)
                    .lineLimit(1)

                if isMe, let deliveryStatus {
                    BubbleDeliveryCheck(
                        status: deliveryStatus,
                        isOffline: false,
                        tint: metaTint,
                        readTint: readTint
                    )
                }

                Spacer(minLength: 0)

                Text(timeString)
                    .font(FocalMetrics.Time.font)
                    .foregroundColor(metaTint)
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .frame(minHeight: 22)
    }
}
