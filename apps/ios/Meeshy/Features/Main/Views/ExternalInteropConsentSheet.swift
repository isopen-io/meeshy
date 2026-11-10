import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Ce qui part chez Meta (#17118 × #17120)

/// La feuille montrée avant la première conversation avec un ami WhatsApp.
/// « J'accepte et je continue » est le seul geste qui écrit ; « Annuler », le
/// glissement vers le bas et la croix n'écrivent rien. Un consentement déjà
/// donné sous la version en vigueur rend la main aussitôt.
struct ExternalInteropConsentSheet: View {
    let onConsented: () -> Void
    let onCancel: () -> Void

    @StateObject private var model = ExternalInteropConsentModel()
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                Text(String(localized: "conversation.external.entry.title", defaultValue: "Écrire à un ami WhatsApp", bundle: .main))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(String(localized: "conversation.external.consent.lead", defaultValue: "Pour joindre votre ami sur WhatsApp, Meeshy transmet à Meta, qui exploite WhatsApp :", bundle: .main))
                    .font(.body)
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                disclosureList
                notes
                if let answer = model.answer {
                    Text(ExternalInteropConsentCopy.answer(answer))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(MeeshyColors.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("external-interop-consent-answer")
                }
                actions
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.vertical, MeeshySpacing.xl)
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await model.load() }
        .adaptiveOnChange(of: model.consented) { _, consented in
            guard consented else { return }
            HapticFeedback.success()
            onConsented()
            dismiss()
        }
        .adaptiveOnChange(of: model.answer) { _, answer in
            guard let answer else { return }
            HapticFeedback.error()
            UIAccessibility.post(notification: .announcement, argument: ExternalInteropConsentCopy.answer(answer))
        }
        .accessibilityIdentifier("external-interop-consent")
    }

    private var disclosureList: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(model.disclosures, id: \.self) { disclosure in
                HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
                    Text(verbatim: "•")
                        .foregroundStyle(theme.textMuted)
                        .accessibilityHidden(true)
                    Text(ExternalInteropConsentCopy.disclosure(disclosure))
                        .font(.body)
                        .foregroundStyle(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(ExternalInteropConsentCopy.retention(days: model.retentionDays))
            Text(String(localized: "conversation.external.consent.translation", defaultValue: "La traduction se fait sur votre appareil : Meeshy ne voit jamais le contenu de cette conversation.", bundle: .main))
            Text(String(localized: "conversation.external.consent.withdraw", defaultValue: "Vous pouvez retirer ce consentement à tout moment : Meeshy efface alors les numéros de vos amis WhatsApp.", bundle: .main))
        }
        .font(.footnote)
        .foregroundStyle(theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var actions: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Button {
                HapticFeedback.medium()
                Task { await model.accept() }
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    if model.isRecording { ProgressView().tint(.white) }
                    Text(String(localized: "conversation.external.consent.accept", defaultValue: "J’accepte et je continue", bundle: .main))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(MeeshyColors.indigo400))
            }
            .buttonStyle(.plain)
            .disabled(model.isRecording)
            .accessibilityIdentifier("external-interop-consent-accept")

            Button {
                HapticFeedback.light()
                onCancel()
                dismiss()
            } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(theme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("external-interop-consent-cancel")
        }
    }
}
