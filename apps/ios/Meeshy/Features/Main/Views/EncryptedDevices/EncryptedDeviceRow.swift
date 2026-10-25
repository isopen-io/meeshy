import SwiftUI
import MeeshyE2EE
import MeeshyUI

/// Une ligne de « Mes appareils chiffrés » : symbole, nom, état, date. Un seul
/// élément VoiceOver, qui lit les trois.
struct EncryptedDeviceRow: View, Equatable {
    let device: EndToEndOwnDevice
    let isBusy: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let row = EncryptedDevicePresentation(device)
        return HStack(spacing: MeeshySpacing.md) {
            Image(systemName: row.systemImage)
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                .foregroundColor(row.tint)
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(row.tint.opacity(MeeshyOpacity.light)))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(row.title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Label(row.status, systemImage: statusSymbol)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundColor(row.tint)
                if let detail = row.detail {
                    Text(detail)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundColor(theme.textSecondary)
                }
            }

            Spacer(minLength: 0)

            if isBusy {
                ProgressView()
            } else if !device.isCurrent {
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.md)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: row.tint))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.lg).stroke(theme.border(tint: row.tint), lineWidth: 1))
        )
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.accessibilityLabel)
        .accessibilityAddTraits(device.isCurrent ? [] : .isButton)
    }

    private var statusSymbol: String {
        switch device.trust {
        case .thisDevice: "checkmark.seal.fill"
        case .approved: "lock.shield.fill"
        case .pending: "clock.badge.exclamationmark"
        }
    }
}

/// Les textes des avis de l'écran, partagés par la liste et ses feuilles.
enum EncryptedDeviceNoticeText {
    static func title(_ notice: EncryptedDevicesViewModel.Notice?, devices: [EndToEndOwnDevice]) -> String {
        switch notice {
        case .noMatch:
            String(localized: "e2ee.devices.notice.noMatch.title", defaultValue: "Code non reconnu", bundle: .main)
        case .approved(let deviceId):
            String(
                format: String(localized: "e2ee.devices.notice.approved.title", defaultValue: "« %@ » est approuvé", bundle: .main),
                devices.first { $0.deviceId == deviceId }.map(EncryptedDevicePresentation.title(of:))
                    ?? String(format: String(localized: "e2ee.devices.numbered", defaultValue: "Appareil n° %d", bundle: .main), Int(deviceId))
            )
        case .actionFailed, nil:
            String(localized: "e2ee.devices.notice.failed.title", defaultValue: "Action impossible", bundle: .main)
        }
    }

    static func message(_ notice: EncryptedDevicesViewModel.Notice?) -> String {
        switch notice {
        case .noMatch:
            String(
                localized: "e2ee.devices.notice.noMatch.message",
                defaultValue: "Ce code ne correspond à aucun de vos appareils. Rien n’a été approuvé. Lisez le code affiché dans « Mes appareils chiffrés » sur votre autre appareil.",
                bundle: .main
            )
        case .approved:
            String(
                localized: "e2ee.devices.notice.approved.message",
                defaultValue: "Si ce n’est pas déjà fait, lisez aussi le code de cet appareil depuis l’autre : vos messages chiffrés se liront alors sur les deux.",
                bundle: .main
            )
        case .actionFailed, nil:
            String(localized: "e2ee.devices.notice.failed.message", defaultValue: "Rien n’a changé. Vérifiez votre connexion, puis réessayez.", bundle: .main)
        }
    }
}
