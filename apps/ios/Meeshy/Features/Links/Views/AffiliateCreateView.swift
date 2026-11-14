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

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        LinksPage(
            title: String(localized: "affiliate.create.title", defaultValue: "Nouveau lien", bundle: .main),
            accent: Color(hex: accentColor),
            glyph: .close
        ) {
            VStack(spacing: MeeshySpacing.xxl) {
                formSection
                createButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            LinksFormField(
                label: String(localized: "affiliate.create.name.label", defaultValue: "Nom du lien", bundle: .main),
                prompt: String(localized: "affiliate.create.name.placeholder", defaultValue: "Ex. : Invitation Twitter", bundle: .main),
                text: $name
            )
            LinksFormField(
                label: String(localized: "affiliate.create.maxUses.label", defaultValue: "Utilisations max (optionnel)", bundle: .main),
                prompt: String(localized: "affiliate.create.maxUses.placeholder", defaultValue: "Illimité", bundle: .main),
                text: $maxUses,
                input: .numeric
            )

            if let errorMessage {
                Text(errorMessage)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
            }
        }
    }

    // MARK: - Create Button

    /// Le bouton principal du kit, sans chevron : pendant l'envoi il devient un
    /// anneau et dit « Création en cours » — la clé déjà partagée avec le bouton
    /// jumeau des liens de suivi.
    private var createButton: some View {
        MeeshySplitActionButton(
            String(localized: "affiliate.create.button", defaultValue: "Créer le lien", bundle: .main),
            phase: isCreating
                ? .busy(progress: nil, title: String(localized: "a11y.tracking.create.in-progress", defaultValue: "Création en cours", bundle: .main))
                : .ready,
            width: .fill,
            isEnabled: !trimmedName.isEmpty,
            action: { Task { await create() } }
        )
    }

    // MARK: - Actions

    @MainActor
    private func create() async {
        guard !trimmedName.isEmpty else { return }
        isCreating = true
        errorMessage = nil

        do {
            let uses = Int(maxUses.filter(\.isNumber))
            let token = try await AffiliateService.shared.createToken(
                name: trimmedName,
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
