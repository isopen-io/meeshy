import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MessageViewsSendAttemptsCard

/// Historique local des tentatives d'envoi (spec 2026-07-08
/// message-send-failure-retry-flow). Vide pour les messages reçus : l'hôte
/// ne monte pas la carte.
struct MessageViewsSendAttemptsCard: View {
    let attempts: [SendAttemptRecord]
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    /// Pluriel résolu explicitement : le markup AGA inline (`^[…](inflect: true)`)
    /// dans un `defaultValue` sans entrée String Catalog fuit en brut sur iOS 18.x.
    /// `bundle` / `locale` : même paire que `PostStatAccessibility` — la table
    /// et la règle de pluriel, injectables pour qu'un témoin fixe la loi.
    static func sendAttemptCountLabel(_ count: Int,
                                      bundle: Bundle = .main,
                                      locale: Locale = .current) -> String {
        String(
            localized: "message-detail.send-history.attempt-count",
            defaultValue: "\(count) tentatives",
            bundle: bundle,
            locale: locale
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(accent.opacity(0.7))
                Text(String(localized: "message-detail.send-history.title", defaultValue: "Historique d'envoi", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                Spacer()
                Text(Self.sendAttemptCountLabel(attempts.count))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(theme.textMuted)
            }

            if let first = attempts.first {
                MessageViewsMetaRow(
                    icon: "paperplane",
                    label: String(localized: "message-detail.send-history.first-attempt", defaultValue: "1re tentative", bundle: .main),
                    value: first.startedAt.formatted(.dateTime.day().month().year().hour().minute()),
                    accent: accent
                )
            }

            VStack(spacing: 0) {
                ForEach(attempts, id: \.attemptNumber) { attempt in
                    sendAttemptRow(attempt)
                    if attempt.attemptNumber != attempts.last?.attemptNumber {
                        MessageViewsMetaDivider()
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
            )
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(accent.opacity(0.1), lineWidth: MeeshyBorder.hairline)
                )
        )
    }

    private func sendAttemptRow(_ attempt: SendAttemptRecord) -> some View {
        let isSuccess = attempt.outcome == SendAttemptRecord.Outcome.success.rawValue
        return HStack(alignment: .top, spacing: MeeshySpacing.smPlus) {
            Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.caption2.weight(.medium))
                .foregroundColor(isSuccess ? MeeshyColors.success : MeeshyColors.error)
                .frame(width: 16)
                .padding(.top, 1)
                .accessibilityLabel(isSuccess
                    ? String(localized: "message-detail.send-history.outcome.succeeded", defaultValue: "Réussi", bundle: .main)
                    : String(localized: "message-detail.send-history.outcome.failed", defaultValue: "Échec", bundle: .main))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(String(localized: "message-detail.send-history.attempt-number", defaultValue: "Tentative \(attempt.attemptNumber)", bundle: .main))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(theme.textPrimary)
                    Text(sendAttemptTransportLabel(attempt.transport))
                        .font(.caption2.weight(.medium))
                        .foregroundColor(accent.opacity(0.8))
                        .padding(.horizontal, MeeshySpacing.xsPlus)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(accent.opacity(0.1)))
                }
                if let errorMessage = attempt.errorMessage, !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(2)
                }
            }

            Spacer()

            Text(attempt.startedAt.formatted(.dateTime.hour().minute().second()))
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(theme.textMuted)
        }
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.sm)
        .accessibilityElement(children: .combine)
    }

    private func sendAttemptTransportLabel(_ transport: String) -> String {
        switch SendAttemptRecord.Transport(rawValue: transport) {
        case .socketFirst: return String(localized: "message-detail.send-history.transport.realtime", defaultValue: "Temps réel", bundle: .main)
        case .rest: return "REST"
        case .socketFallback: return String(localized: "message-detail.send-history.transport.realtime-fallback", defaultValue: "Repli temps réel", bundle: .main)
        case .outbox: return String(localized: "message-detail.send-history.transport.auto-retry", defaultValue: "Nouvelle tentative automatique", bundle: .main)
        case nil: return transport
        }
    }
}
