import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une ligne destinataire** — sous-vue `Equatable` à entrées de VALEUR : une
/// ligne qui passe « envoi » → « envoyé » ne réévalue pas ses voisines.
///
/// Un seul élément d'accessibilité : « Équipe Lyon, groupe, 12 membres,
/// sélectionné ». La présence se dit, le contour décoratif est muet. La présence
/// n'est rendue que là où le serveur la sert (amis acceptés) — une donnée
/// absente ne dessine aucun point.
struct ShareRecipientRow: View, Equatable {
    let recipient: ShareRecipient
    let presence: PresenceState?
    let isSelected: Bool
    let delivery: ShareDeliveryState?
    let accentHex: String
    let isDark: Bool
    let onTap: () -> Void
    let onRetry: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: ShareRecipientRow, rhs: ShareRecipientRow) -> Bool {
        lhs.recipient == rhs.recipient && lhs.presence == rhs.presence && lhs.isSelected == rhs.isSelected
            && lhs.delivery == rhs.delivery && lhs.accentHex == rhs.accentHex && lhs.isDark == rhs.isDark
    }

    private var detail: String { ShareSheetCopy.detail(recipient.detail, encrypted: recipient.isEncrypted) }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: recipient.title,
                    context: .conversationList,
                    kind: recipient.isGroup ? .entity : .user,
                    accentColor: DynamicColorGenerator.colorForName(recipient.title),
                    avatarURL: recipient.avatarURL,
                    presenceState: presence,
                    isDark: isDark
                )
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(recipient.title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: MeeshySpacing.xs) {
                        if recipient.isEncrypted {
                            Image(systemName: "lock.fill").font(MeeshyFont.relative(MeeshyFont.captionSize)).accessibilityHidden(true)
                        }
                        Text(statusLine ?? detail)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize))
                            .lineLimit(2)
                    }
                    .foregroundColor(statusColor)
                }
                Spacer(minLength: 0)
                trailing
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: MeeshyControlSize.tapTarget + MeeshySpacing.md)
            .background(isSelected ? Color(hex: accentHex).opacity(MeeshyOpacity.subtle) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var spokenLabel: String {
        var parts = [recipient.title, detail]
        if presence == .online { parts.append(String(localized: "share.sheet.a11y.online", defaultValue: "en ligne", bundle: .meeshyShare)) }
        if let statusLine { parts.append(statusLine) } else if isSelected { parts.append(ShareSheetCopy.selected) }
        return parts.joined(separator: ", ")
    }

    private var statusLine: String? {
        switch delivery {
        case .sending: return ShareSheetCopy.sending
        case .sent: return ShareSheetCopy.sent
        case .queued: return ShareSheetCopy.queued
        case .failed(let reason): return reason.isEmpty ? ShareSheetCopy.retry : reason
        case nil: return nil
        }
    }

    private var statusColor: Color {
        switch delivery {
        case .sent: return MeeshyColors.success
        case .failed: return MeeshyColors.error
        case .queued: return MeeshyColors.warning
        case .sending, nil: return theme.textMuted
        }
    }

    @ViewBuilder
    private var trailing: some View {
        switch delivery {
        case .sending:
            ProgressView().frame(width: 24, height: 24)
        case .sent:
            Image(systemName: "checkmark.circle.fill").font(.title3).foregroundColor(MeeshyColors.success)
        case .queued:
            Image(systemName: "clock.arrow.circlepath").font(.title3).foregroundColor(MeeshyColors.warning)
        case .failed:
            Button(ShareSheetCopy.retry, action: onRetry)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
                .frame(minHeight: MeeshyControlSize.tapTarget)
        case nil:
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundColor(isSelected ? Color(hex: accentHex) : theme.textMuted.opacity(0.6))
        }
    }
}

/// **Un récent** — avatar et prénom, cochable d'un toucher (le premier des deux gestes).
struct ShareRecentChip: View, Equatable {
    let recipient: ShareRecipient
    let presence: PresenceState?
    let isSelected: Bool
    let accentHex: String
    let isDark: Bool
    let onTap: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: ShareRecentChip, rhs: ShareRecentChip) -> Bool {
        lhs.recipient == rhs.recipient && lhs.presence == rhs.presence && lhs.isSelected == rhs.isSelected
            && lhs.accentHex == rhs.accentHex && lhs.isDark == rhs.isDark
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: MeeshySpacing.xs) {
                MeeshyAvatar(
                    name: recipient.title,
                    context: .conversationList,
                    kind: recipient.isGroup ? .entity : .user,
                    accentColor: DynamicColorGenerator.colorForName(recipient.title),
                    avatarURL: recipient.avatarURL,
                    presenceState: presence,
                    isDark: isDark
                )
                .overlay(alignment: .bottomTrailing) {
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.white, Color(hex: accentHex))
                            .font(.title3)
                    }
                }
                Text(recipient.title.split(separator: " ").first.map(String.init) ?? recipient.title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: 64)
            }
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isSelected ? "\(recipient.title), \(ShareSheetCopy.selected)" : recipient.title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
