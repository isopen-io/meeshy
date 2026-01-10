//
//  RegistrationStep5CompleteView.swift
//  Meeshy
//
//  Step 5: Complete - Summary, Terms, and Celebration
//  "C'est parti!" with confetti animation
//

import SwiftUI

struct RegistrationStep5CompleteView: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var headerAppeared = false
    @State private var summaryAppeared = false
    @State private var showTerms = false

    private let accentColor = RegistrationStep.complete.accentColor

    var body: some View {
        ZStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection

                    // Summary
                    if !viewModel.showConfetti {
                        summarySection
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    // Terms acceptance
                    if !viewModel.showConfetti {
                        termsSection
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    // Success view
                    if viewModel.showConfetti {
                        successSection
                    }

                    // Error message
                    if let error = viewModel.registrationError {
                        errorView(error)
                    }

                    Spacer(minLength: 100)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
            }

            // Confetti overlay
            if viewModel.showConfetti {
                ConfettiView(isActive: $viewModel.showConfetti)
            }
        }
        .sheet(isPresented: $showTerms) {
            TermsView()
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.1))
                    .frame(width: 100, height: 100)

                Text(viewModel.showConfetti ? "🎊" : "🎉")
                    .font(.system(size: 50))
                    .scaleEffect(headerAppeared ? 1 : 0.5)
            }

            VStack(spacing: 8) {
                Text(viewModel.showConfetti ? "Bienvenue sur Meeshy!" : "C'est presque fini!")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.primary)

                Text(viewModel.showConfetti
                     ? "Ton compte a été créé avec succès! 🚀"
                     : "Vérifie tes infos et accepte les conditions pour commencer!")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .opacity(headerAppeared ? 1 : 0)
            .offset(y: headerAppeared ? 0 : 20)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                headerAppeared = true
            }
        }
    }

    // MARK: - Summary Section

    private var summarySection: some View {
        VStack(spacing: 16) {
            HStack {
                Text("📋")
                Text("Récapitulatif")
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
            }

            VStack(spacing: 12) {
                // Identity
                SummaryRow(
                    icon: "👤",
                    label: "Nom",
                    value: "\(viewModel.firstName) \(viewModel.lastName)"
                )

                SummaryRow(
                    icon: "🔍",
                    label: "Username",
                    value: "@\(viewModel.username)"
                )

                Divider()

                // Contact
                SummaryRow(
                    icon: "📱",
                    label: "Téléphone",
                    value: viewModel.formattedPhoneNumber,
                    badge: viewModel.isPhoneVerified ? "Vérifié ✓" : nil
                )

                SummaryRow(
                    icon: "✉️",
                    label: "Email",
                    value: viewModel.email
                )

                Divider()

                // Languages
                SummaryRow(
                    icon: "🌍",
                    label: "Pays",
                    value: viewModel.selectedCountry?.name ?? "-"
                )

                SummaryRow(
                    icon: "💬",
                    label: "Langues",
                    value: "\(viewModel.primaryLanguage?.name ?? "-") / \(viewModel.secondaryLanguage?.name ?? "-")"
                )

                // Profile (if filled)
                if !viewModel.bio.isEmpty {
                    Divider()

                    SummaryRow(
                        icon: "✍️",
                        label: "Bio",
                        value: viewModel.bio
                    )
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: Color.black.opacity(0.05), radius: 8, y: 2)
            )
        }
        .opacity(summaryAppeared ? 1 : 0)
        .offset(y: summaryAppeared ? 0 : 30)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.2)) {
                summaryAppeared = true
            }
        }
    }

    // MARK: - Terms Section

    private var termsSection: some View {
        VStack(spacing: 16) {
            // Terms toggle
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    viewModel.hasAcceptedTerms.toggle()
                }
                HapticFeedback.selection.trigger()
            }) {
                HStack(spacing: 12) {
                    // Checkbox
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(viewModel.hasAcceptedTerms ? accentColor : Color.gray.opacity(0.3), lineWidth: 2)
                            .frame(width: 24, height: 24)

                        if viewModel.hasAcceptedTerms {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(accentColor)
                                .frame(width: 24, height: 24)

                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: viewModel.hasAcceptedTerms)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("J'accepte les conditions d'utilisation")
                            .font(.system(size: 15))
                            .foregroundColor(.primary)

                        Text("et la politique de confidentialité")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                    }

                    Spacer()
                }
            }

            // Read terms link
            Button(action: {
                showTerms = true
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "doc.text")
                    Text("Lire les conditions")
                }
                .font(.system(size: 14))
                .foregroundColor(accentColor)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemBackground))
        )
    }

    // MARK: - Success Section

    private var successSection: some View {
        VStack(spacing: 24) {
            SuccessCheckmarkView()

            VStack(spacing: 8) {
                Text("Compte créé!")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.green)

                Text("Prépare-toi à connecter avec le monde entier! 🌍")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.top, 40)
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)

            Text(error)
                .font(.system(size: 14))
                .foregroundColor(.red)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.red.opacity(0.1))
        )
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

// MARK: - Summary Row

struct SummaryRow: View {
    let icon: String
    let label: String
    let value: String
    var badge: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Text(icon)
                .font(.system(size: 18))
                .frame(width: 24)

            Text(label)
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .leading)

            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)

            if let badge = badge {
                Text(badge)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.green)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.green.opacity(0.1))
                    )
            }

            Spacer()
        }
    }
}

// MARK: - Terms View

struct TermsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Group {
                        Text("Conditions Générales d'Utilisation")
                            .font(.title2.bold())

                        Text("Dernière mise à jour: Janvier 2026")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Text("1. Acceptation des conditions")
                            .font(.headline)

                        Text("En utilisant Meeshy, vous acceptez d'être lié par ces conditions d'utilisation. Si vous n'acceptez pas ces conditions, vous ne pouvez pas utiliser l'application.")

                        Text("2. Description du service")
                            .font(.headline)

                        Text("Meeshy est une application de messagerie avec traduction automatique qui permet aux utilisateurs de communiquer dans différentes langues.")

                        Text("3. Confidentialité")
                            .font(.headline)

                        Text("Nous respectons votre vie privée. Vos messages sont chiffrés de bout en bout et nous ne vendons jamais vos données à des tiers.")

                        Text("4. Utilisation acceptable")
                            .font(.headline)

                        Text("Vous acceptez de ne pas utiliser Meeshy pour envoyer du spam, harceler d'autres utilisateurs, ou partager du contenu illégal.")
                    }

                    Group {
                        Text("5. Propriété intellectuelle")
                            .font(.headline)

                        Text("Meeshy et tous ses contenus sont protégés par le droit d'auteur et autres lois sur la propriété intellectuelle.")

                        Text("6. Modifications")
                            .font(.headline)

                        Text("Nous pouvons modifier ces conditions à tout moment. Les modifications prendront effet dès leur publication dans l'application.")

                        Text("7. Contact")
                            .font(.headline)

                        Text("Pour toute question concernant ces conditions, contactez-nous à: support@meeshy.app")
                    }
                }
                .padding()
            }
            .navigationTitle("Conditions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    RegistrationStep5CompleteView(viewModel: RegistrationFlowViewModel())
}
