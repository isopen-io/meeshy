import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct AffiliateCreateView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var name = ""
    @State private var maxUses = ""
    @State private var isCreating = false
    @State private var errorMessage: String?

    var onCreate: ((AffiliateToken) -> Void)?

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: MeeshySpacing.xxl) {
                    formSection
                    createButton
                    Spacer()
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.lg)
            }
            .navigationTitle(String(localized: "affiliate.create.title", defaultValue: "Nouveau lien", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        }
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                // A `Text` sitting above a `TextField` is a separate accessibility
                // element, not the field's label: VoiceOver would read the field as
                // its placeholder ("Ex: Invitation Twitter") and never say what it
                // is for. Hiding the caption and promoting it to the field's own
                // label is the pattern `CreateTrackingLinkView.formField` already
                // applies to the twin screen.
                Text(String(localized: "affiliate.create.name.label", defaultValue: "Nom du lien", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .accessibilityHidden(true)

                TextField(String(localized: "affiliate.create.name.placeholder", defaultValue: "Ex. : Invitation Twitter", bundle: .main), text: $name)
                    .accessibilityLabel(String(localized: "affiliate.create.name.label", defaultValue: "Nom du lien", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .padding(MeeshySpacing.md)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
            }

            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                Text(String(localized: "affiliate.create.maxUses.label", defaultValue: "Utilisations max (optionnel)", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .accessibilityHidden(true)

                TextField(String(localized: "affiliate.create.maxUses.placeholder", defaultValue: "Illimité", bundle: .main), text: $maxUses)
                    .accessibilityLabel(String(localized: "affiliate.create.maxUses.label", defaultValue: "Utilisations max (optionnel)", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .keyboardType(.numberPad)
                    .padding(MeeshySpacing.md)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }
        }
    }

    // MARK: - Create Button

    private var createButton: some View {
        Button {
            Task { await create() }
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isCreating {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                } else {
                    // Decorative glyph — the adjacent "Créer le lien" text already
                    // says what the button does, so hide it rather than let
                    // VoiceOver read the SF Symbol name in front of the label.
                    Image(systemName: "link.badge.plus")
                        .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                        .accessibilityHidden(true)
                }
                Text(String(localized: "affiliate.create.button", defaultValue: "Créer le lien", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(
                        name.trimmingCharacters(in: .whitespaces).isEmpty
                            ? Color(hex: accentColor).opacity(0.4)
                            : Color(hex: accentColor)
                    )
            )
        }
        .accessibilityLabel(String(localized: "affiliate.create.button", defaultValue: "Créer le lien", bundle: .main))
        // While the request is in flight the glyph becomes a bare `ProgressView`:
        // a sighted user sees a spinner, a VoiceOver user hears only "dimmed" and
        // cannot tell whether the tap registered. Carry the transient state as a
        // value, exactly as the twin button does (CreateTrackingLinkView:136) and
        // the mood composer (MeeshyComposerHost.publishButton). The key is shared with the
        // tracking-link button — same action, same words, already localised.
        .accessibilityValue(isCreating
            ? String(localized: "a11y.tracking.create.in-progress", defaultValue: "Création en cours", bundle: .main)
            : "")
        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
    }

    // MARK: - Actions

    @MainActor
    private func create() async {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isCreating = true
        errorMessage = nil

        do {
            let uses = Int(maxUses)
            let token = try await AffiliateService.shared.createToken(
                name: name.trimmingCharacters(in: .whitespaces),
                maxUses: uses
            )
            HapticFeedback.success()
            onCreate?(token)
            dismiss()
        } catch {
            let message = String(localized: "affiliate.create.error", defaultValue: "Erreur lors de la création", bundle: .main)
            errorMessage = message
            HapticFeedback.error()
            // The error surfaces inside the form, far from the focused button, so
            // VoiceOver would never reach it on its own: the haptic fires and
            // nothing is said. Announce it, as the twin screen does on the same
            // failure path (CreateTrackingLinkView:184).
            UIAccessibility.post(notification: .announcement, argument: message)
        }
        isCreating = false
    }
}
