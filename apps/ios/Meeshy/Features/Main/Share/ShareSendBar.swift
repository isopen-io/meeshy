import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Zone 4 — la barre Envoyer**, fixe en bas : la légende (une par envoi),
/// « Ensemble / Séparément » à partir de deux pièces, l'avertissement de sortie
/// du chiffrement (V8), les plafonds (V9), et le bouton qui compte les
/// destinataires et annonce son effet.
struct ShareSendBar: View {
    @ObservedObject var model: ShareSheetViewModel
    let plan: SharePlan
    let accentColor: String
    let onSend: () -> Void

    @ObservedObject private var network = NetworkMonitor.shared
    private var theme: ThemeManager { ThemeManager.shared }
    private var accent: Color { Color(hex: accentColor) }

    private var recipientCount: Int { plan.limits.recipients }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if !network.isOnline { banner(ShareSheetCopy.offline, symbol: "wifi.slash", color: MeeshyColors.warning) }
            if let warning = encryptionWarning { banner(warning, symbol: "lock.open", color: MeeshyColors.warning) }
            if plan.limits.trimCount > 0 {
                banner(ShareSheetCopy.tooHeavy(files: plan.limits.files, bytes: plan.limits.bytes), symbol: "exclamationmark.triangle", color: MeeshyColors.error)
            }
            if plan.limits.overRecipients > 0 { banner(ShareSheetCopy.tooManyRecipients, symbol: "person.3", color: MeeshyColors.error) }
            if plan.caption != nil, !model.hasSent {
                TextField(ShareSheetCopy.captionPlaceholder, text: $model.caption, axis: .vertical)
                    .lineLimit(1...4)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.inputBackground))
                    .submitLabel(.send)
            }
            if plan.grouping != nil, !model.hasSent {
                Picker("", selection: $model.grouping) {
                    Text(ShareSheetCopy.together).tag(ShareGrouping.together)
                    Text(ShareSheetCopy.separately).tag(ShareGrouping.separately)
                }
                .pickerStyle(.segmented)
            }
            if !model.hasSent { sendButton }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .background(.ultraThinMaterial)
    }

    /// V8 : les destinations NON chiffrées d'une source chiffrée, nommées.
    private var encryptionWarning: String? {
        guard let encryption = plan.encryption, !encryption.warnDestinationIds.isEmpty, !model.hasSent else { return nil }
        let names = model.selection.filter { encryption.warnDestinationIds.contains($0.id) }.map(\.title)
        guard !names.isEmpty else { return nil }
        return ShareSheetCopy.encryptionWarning(names.joined(separator: ", "))
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Text(plan.limits.trimCount > 0 ? ShareSheetCopy.trimLast(plan.limits.trimCount) : ShareSheetCopy.sendButton(plan.title, count: recipientCount))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.buttonHeight)
                .background(Capsule().fill(plan.canSend ? accent : theme.textMuted.opacity(MeeshyOpacity.strong)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!plan.canSend)
        .accessibilityLabel(ShareSheetCopy.sendAccessibility(recipientCount))
        .accessibilityIdentifier("share.sheet.send")
    }

    private func banner(_ text: String, symbol: String, color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
            .foregroundColor(theme.textPrimary)
            .padding(MeeshySpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(color.opacity(MeeshyOpacity.light)))
            .fixedSize(horizontal: false, vertical: true)
    }
}
