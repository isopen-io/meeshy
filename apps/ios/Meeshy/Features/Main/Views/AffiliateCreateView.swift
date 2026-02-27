import SwiftUI
import MeeshySDK

struct AffiliateCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var name = ""
    @State private var maxUses = ""
    @State private var isCreating = false
    @State private var errorMessage: String?

    var onCreate: ((AffiliateToken) -> Void)?

    private let accentColor = "2ECC71"

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
            .navigationTitle("Nouveau lien")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        }
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Nom du lien")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                TextField("Ex: Invitation Twitter", text: $name)
                    .font(.system(size: 14))
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Utilisations max (optionnel)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                TextField("Illimite", text: $maxUses)
                    .font(.system(size: 14))
                    .keyboardType(.numberPad)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
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
                        .font(.system(size: 16, weight: .semibold))
                }
                Text("Creer le lien")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
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
            errorMessage = "Erreur lors de la creation"
            HapticFeedback.error()
        }
        isCreating = false
    }
}
