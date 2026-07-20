import SwiftUI
import Combine
import MeeshySDK

struct AffiliateCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
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

                VStack(spacing: 24) {
                    formSection
                    createButton
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
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
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(String(localized: "affiliate.create.name.label", defaultValue: "Nom du lien", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                TextField(String(localized: "affiliate.create.name.placeholder", defaultValue: "Ex: Invitation Twitter", bundle: .main), text: $name)
                    .font(MeeshyFont.relative(14))
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(String(localized: "affiliate.create.maxUses.label", defaultValue: "Utilisations max (optionnel)", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                TextField(String(localized: "affiliate.create.maxUses.placeholder", defaultValue: "Illimite", bundle: .main), text: $maxUses)
                    .font(MeeshyFont.relative(14))
                    .keyboardType(.numberPad)
                    .padding(12)
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
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }
        }
    }

    // MARK: - Create Button

    private var createButton: some View {
        Button {
            Task { await create() }
        } label: {
            HStack(spacing: 8) {
                if isCreating {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "link.badge.plus")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                }
                Text(String(localized: "affiliate.create.button", defaultValue: "Creer le lien", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(
                        name.trimmingCharacters(in: .whitespaces).isEmpty
                            ? Color(hex: accentColor).opacity(0.4)
                            : Color(hex: accentColor)
                    )
            )
        }
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
            errorMessage = String(localized: "affiliate.create.error", defaultValue: "Erreur lors de la creation", bundle: .main)
            HapticFeedback.error()
        }
        isCreating = false
    }
}
