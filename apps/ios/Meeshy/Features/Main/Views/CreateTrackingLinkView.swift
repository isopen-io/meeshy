import SwiftUI
import Combine
import MeeshySDK

struct CreateTrackingLinkView: View {
    let onCreate: (TrackingLink) -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
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

    private var isValid: Bool { !destinationUrl.isEmpty && URL(string: destinationUrl) != nil }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        formSection
                        utmSection
                        tokenSection
                        if let error = errorMessage {
                            Text(error).font(.footnote).foregroundColor(MeeshyColors.error)
                                .padding(.horizontal, 20)
                        }
                        createButton
                    }
                    .padding(.top, 20).padding(.bottom, 40)
                }
            }
            .navigationTitle(String(localized: "tracking.link.create.title", defaultValue: "Nouveau lien de tracking", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }.foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            formField(
                String(localized: "tracking.link.create.field.url", defaultValue: "URL de destination *", bundle: .main),
                placeholder: "https://meeshy.me",
                text: $destinationUrl,
                accessibilityLabel: String(localized: "tracking.link.create.field.url.a11y", defaultValue: "URL de destination", bundle: .main),
                hint: String(localized: "a11y.tracking.field.required", defaultValue: "Champ obligatoire", bundle: .main)
            )
                .keyboardType(.URL).textInputAutocapitalization(.never)
            formField(String(localized: "tracking.link.create.field.name", defaultValue: "Nom interne", bundle: .main), placeholder: String(localized: "tracking.link.create.field.name.placeholder", defaultValue: "ex: Campagne Instagram", bundle: .main), text: $name)
        }
        .padding(.horizontal, 20)
    }

    private var utmSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showUtmFields.toggle()
                }
            } label: {
                HStack {
                    Text(String(localized: "tracking.link.create.utm.title", defaultValue: "Paramètres UTM", bundle: .main)).font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Image(systemName: showUtmFields ? "chevron.up" : "chevron.down")
                        .font(.caption).foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 20)
            .accessibilityHint(String(localized: "a11y.tracking.utm.hint", defaultValue: "Affiche ou masque les paramètres UTM", bundle: .main))
            .accessibilityValue(showUtmFields
                ? String(localized: "accessibility.section_expanded", defaultValue: "Développée", bundle: .main)
                : String(localized: "accessibility.section_collapsed", defaultValue: "Réduite", bundle: .main))

            if showUtmFields {
                VStack(spacing: 10) {
                    formField(String(localized: "tracking.link.create.utm.campaign", defaultValue: "Campaign", bundle: .main), placeholder: String(localized: "tracking.link.create.utm.campaign.placeholder", defaultValue: "ex: summer_sale", bundle: .main), text: $campaign)
                    formField(String(localized: "tracking.link.create.utm.source", defaultValue: "Source", bundle: .main), placeholder: String(localized: "tracking.link.create.utm.source.placeholder", defaultValue: "ex: instagram, email", bundle: .main), text: $source)
                    formField(String(localized: "tracking.link.create.utm.medium", defaultValue: "Medium", bundle: .main), placeholder: String(localized: "tracking.link.create.utm.medium.placeholder", defaultValue: "ex: social, cpc, email", bundle: .main), text: $medium)
                }
                .padding(.horizontal, 20)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private var tokenSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "tracking.link.create.token.title", defaultValue: "Token personnalisé (optionnel)", bundle: .main))
                .font(.footnote.weight(.medium)).foregroundColor(theme.textSecondary)
            TextField(String(localized: "tracking.link.create.token.placeholder", defaultValue: "ex: summer24 (6 chars min)", bundle: .main), text: $customToken)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Text(String(localized: "tracking.link.create.token.help", defaultValue: "Laissez vide pour un token aléatoire", bundle: .main))
                .font(.caption2).foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 20)
    }

    private var createButton: some View {
        Button(action: create) {
            if isCreating {
                ProgressView().tint(.white)
            } else {
                Text(String(localized: "tracking.link.create.button", defaultValue: "Créer le lien", bundle: .main)).font(.callout.weight(.bold)).foregroundColor(.white)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(
            Capsule().fill(LinearGradient(
                colors: [MeeshyColors.trackingAccent, MeeshyColors.brandPrimary],
                startPoint: .leading, endPoint: .trailing
            ))
        )
        .disabled(!isValid || isCreating).opacity(!isValid || isCreating ? 0.5 : 1)
        .padding(.horizontal, 20)
        .accessibilityLabel(String(localized: "tracking.link.create.button", defaultValue: "Créer le lien", bundle: .main))
        .accessibilityValue(isCreating
            ? String(localized: "a11y.tracking.create.in-progress", defaultValue: "Création en cours", bundle: .main)
            : "")
        .accessibilityHint(isValid
            ? ""
            : String(localized: "a11y.tracking.create.disabled.hint", defaultValue: "Saisissez une URL de destination valide pour créer le lien", bundle: .main))
    }

    @ViewBuilder
    private func formField(_ label: String, placeholder: String, text: Binding<String>, accessibilityLabel: String? = nil, hint: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.medium))
                .foregroundColor(theme.textSecondary)
                .accessibilityHidden(true)
            TextField(placeholder, text: text)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
                .accessibilityLabel(accessibilityLabel ?? label)
                .accessibilityHint(hint ?? "")
        }
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
                    AccessibilityNotification.Announcement(message).post()
                }
            }
        }
    }
}
