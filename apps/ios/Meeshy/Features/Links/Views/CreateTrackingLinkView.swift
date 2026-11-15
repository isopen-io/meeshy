import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct CreateTrackingLinkView: View {
    let onCreate: (TrackingLink) -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @State private var name: String = ""
    @State private var destinationUrl: String = ""
    @State private var campaign: String = ""
    @State private var source: String = ""
    @State private var medium: String = ""
    @State private var customToken: String = ""
    @State private var showUtmFields = false
    @State private var isCreating = false
    @State private var errorMessage: String? = nil
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isValid: Bool { !destinationUrl.isEmpty && URL(string: destinationUrl) != nil }

    var body: some View {
        LinksPage(
            title: String(localized: "tracking.link.create.title", defaultValue: "Nouveau lien de suivi", bundle: .main),
            accent: MeeshyColors.trackingAccent,
            glyph: .close
        ) {
            VStack(spacing: MeeshySpacing.xl) {
                formSection
                utmSection
                tokenSection
                if let error = errorMessage {
                    Text(error).font(MeeshyFont.relative(MeeshyFont.footnoteSize)).foregroundStyle(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.xl)
                }
                createButton
            }
            .padding(.top, MeeshySpacing.xl).padding(.bottom, 40)
        }
    }

    private var formSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            LinksFormField(
                label: String(localized: "tracking.link.create.field.url", defaultValue: "URL de destination *", bundle: .main),
                prompt: "https://meeshy.me",
                text: $destinationUrl,
                input: .token,
                accessibilityLabel: String(localized: "tracking.link.create.field.url.a11y", defaultValue: "URL de destination", bundle: .main),
                hint: String(localized: "a11y.tracking.field.required", defaultValue: "Champ obligatoire", bundle: .main)
            )
            LinksFormField(
                label: String(localized: "tracking.link.create.field.name", defaultValue: "Nom interne", bundle: .main),
                prompt: String(localized: "tracking.link.create.field.name.placeholder", defaultValue: "ex. : Campagne Instagram", bundle: .main),
                text: $name
            )
        }
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private var utmSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyToggleRow(
                String(localized: "tracking.link.create.utm.title", defaultValue: "Paramètres UTM", bundle: .main),
                accessory: .toggle(isOn: showUtmFields),
                action: {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.8)) {
                        showUtmFields.toggle()
                    }
                }
            )
            .accessibilityHint(String(localized: "a11y.tracking.utm.hint", defaultValue: "Affiche ou masque les paramètres UTM", bundle: .main))
            .padding(.horizontal, MeeshySpacing.lg)

            if showUtmFields {
                VStack(spacing: MeeshySpacing.smPlus) {
                    LinksFormField(
                        label: String(localized: "tracking.link.create.utm.campaign", defaultValue: "Campagne", bundle: .main),
                        prompt: String(localized: "tracking.link.create.utm.campaign.placeholder", defaultValue: "ex. : summer_sale", bundle: .main),
                        text: $campaign, input: .token
                    )
                    LinksFormField(
                        label: String(localized: "tracking.link.create.utm.source", defaultValue: "Source", bundle: .main),
                        prompt: String(localized: "tracking.link.create.utm.source.placeholder", defaultValue: "ex. : instagram, email", bundle: .main),
                        text: $source, input: .token
                    )
                    LinksFormField(
                        label: String(localized: "tracking.link.create.utm.medium", defaultValue: "Moyen", bundle: .main),
                        prompt: String(localized: "tracking.link.create.utm.medium.placeholder", defaultValue: "ex. : social, cpc, email", bundle: .main),
                        text: $medium, input: .token
                    )
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private var tokenSection: some View {
        LinksFormField(
            label: String(localized: "tracking.link.create.token.title", defaultValue: "Token personnalisé (optionnel)", bundle: .main),
            prompt: String(localized: "tracking.link.create.token.placeholder", defaultValue: "ex. : summer24 (6 caractères min.)", bundle: .main),
            text: $customToken,
            input: .token,
            caption: String(localized: "tracking.link.create.token.help", defaultValue: "Laissez vide pour un token aléatoire", bundle: .main)
        )
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private var createButton: some View {
        MeeshySplitActionButton(
            String(localized: "tracking.link.create.button", defaultValue: "Créer le lien", bundle: .main),
            hint: isValid
                ? nil
                : String(localized: "a11y.tracking.create.disabled.hint", defaultValue: "Saisissez une URL de destination valide pour créer le lien", bundle: .main),
            phase: isCreating
                ? .busy(progress: nil, title: String(localized: "a11y.tracking.create.in-progress", defaultValue: "Création en cours", bundle: .main))
                : .ready,
            width: .fill,
            isEnabled: isValid,
            action: create
        )
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private func create() {
        isCreating = true
        errorMessage = nil
        Task {
            do {
                let req = CreateTrackingLinkRequest(
                    name: name.isEmpty ? nil : name,
                    originalUrl: destinationUrl,
                    campaign: campaign.isEmpty ? nil : campaign,
                    source: source.isEmpty ? nil : source,
                    medium: medium.isEmpty ? nil : medium,
                    token: customToken.isEmpty ? nil : customToken
                )
                let link = try await TrackingLinkService.shared.createLink(req)
                await MainActor.run {
                    HapticFeedback.success()
                    onCreate(link)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    let message = error.localizedDescription
                    errorMessage = message
                    isCreating = false
                    UIAccessibility.post(notification: .announcement, argument: message)
                }
            }
        }
    }
}
