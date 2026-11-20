import SwiftUI
import MeeshySDK

/// **LES DEMANDES EN ATTENTE, EN TÊTE DE L'ÉCRAN MEMBRES** (#19877, miroir de
/// `JoinRequestsSection` du web, #19871) — pour l'intendant seul. Chaque ligne
/// dit QUI demande (avatar, nom), D'OÙ (le pays, jamais la ville) et QUAND ;
/// deux vrais boutons de 44 pt, nommés pour VoiceOver.
///
/// Aucun point de présence : la passerelle ne sert pas celle d'un demandeur.
struct CommunityJoinRequestsSection: View {
    let requests: [APICommunityJoinRequest]
    let hasMore: Bool
    let busy: Bool
    let onAccept: (APICommunityJoinRequest) -> Void
    let onReject: (APICommunityJoinRequest) -> Void
    let onMore: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

    var body: some View {
        Section {
            ForEach(requests) { request in
                CommunityJoinRequestRow(
                    request: request,
                    busy: busy,
                    onAccept: { onAccept(request) },
                    onReject: { onReject(request) }
                )
                if request.id != requests.last?.id {
                    Divider().padding(.leading, 68)
                }
            }
            if hasMore {
                Button(action: onMore) {
                    Text(String(localized: "community.members.requests.more", defaultValue: "Voir plus de demandes", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.indigo500)
                        .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                }
            }
        } header: {
            header
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: "clock")
                .meeshyScaledFont(MeeshyIconSize.xxs)
            Text(String(localized: "community.members.requests.section", defaultValue: "Demandes en attente", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .rounded))
            Text("\(requests.count)\(hasMore ? "+" : "")")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .foregroundStyle(theme.textSecondary)
        .textCase(.uppercase)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .background(theme.backgroundSecondary.opacity(0.3))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct CommunityJoinRequestRow: View {
    let request: APICommunityJoinRequest
    let busy: Bool
    let onAccept: () -> Void
    let onReject: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: request.name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(request.name),
                avatarURL: request.avatar
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(request.name)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                Text(meta)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)

            Spacer(minLength: MeeshySpacing.xs)

            decisionButton(
                systemImage: "xmark",
                tint: theme.textMuted,
                label: String(format: String(localized: "community.members.requests.rejectLabel", defaultValue: "Refuser la demande de %@", bundle: .module), request.name),
                action: onReject
            )
            decisionButton(
                systemImage: "checkmark",
                tint: MeeshyColors.success,
                label: String(format: String(localized: "community.members.requests.acceptLabel", defaultValue: "Accepter la demande de %@", bundle: .module), request.name),
                action: onAccept
            )
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private var meta: String {
        let country = request.country.flatMap { locale.localizedString(forRegionCode: $0) }
        let date = request.createdAt.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(locale))
        let asked = String(format: String(localized: "community.members.requests.asked", defaultValue: "Demande du %@", bundle: .module), date)
        return [country, asked].compactMap { $0 }.joined(separator: " · ")
    }

    private func decisionButton(systemImage: String, tint: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .meeshyScaledFont(MeeshyIconSize.sm, weight: .bold)
                .foregroundStyle(tint)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(Circle().fill(tint.opacity(0.12)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}
