import SwiftUI
import MeeshySDK

struct CreateTrackingLinkView: View {
    let onCreate: (TrackingLink) -> Void

    @ObservedObject private var theme = ThemeManager.shared
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
                            Text(error).font(.system(size: 13)).foregroundColor(.red)
                                .padding(.horizontal, 20)
                        }
                        createButton
                    }
                    .padding(.top, 20).padding(.bottom, 40)
                }
            }
            .navigationTitle("Nouveau lien de tracking")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }.foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            formField("URL de destination *", placeholder: "https://meeshy.me", text: $destinationUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never)
            formField("Nom interne", placeholder: "ex: Campagne Instagram", text: $name)
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
                    Text("Paramètres UTM").font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Image(systemName: showUtmFields ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12)).foregroundColor(theme.textMuted)
                }
            }
            .padding(.horizontal, 20)

            if showUtmFields {
                VStack(spacing: 10) {
                    formField("Campaign", placeholder: "ex: summer_sale", text: $campaign)
                    formField("Source", placeholder: "ex: instagram, email", text: $source)
                    formField("Medium", placeholder: "ex: social, cpc, email", text: $medium)
                }
                .padding(.horizontal, 20)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private var tokenSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Token personnalisé (optionnel)")
                .font(.system(size: 13, weight: .medium)).foregroundColor(theme.textSecondary)
            TextField("ex: summer24 (6 chars min)", text: $customToken)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Text("Laissez vide pour un token aléatoire")
                .font(.system(size: 11)).foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 20)
    }

    private var createButton: some View {
        Button(action: create) {
            if isCreating {
                ProgressView().tint(.white)
            } else {
                Text("Créer le lien").font(.system(size: 16, weight: .bold)).foregroundColor(.white)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(
            Capsule().fill(LinearGradient(
                colors: [Color(hex: "A855F7"), Color(hex: "6366F1")],
                startPoint: .leading, endPoint: .trailing
            ))
        )
        .disabled(!isValid || isCreating).opacity(!isValid || isCreating ? 0.5 : 1)
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private func formField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textSecondary)
            TextField(placeholder, text: text)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
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
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}
