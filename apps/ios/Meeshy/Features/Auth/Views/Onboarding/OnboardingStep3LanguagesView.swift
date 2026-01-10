//
//  RegistrationStep3LanguagesView.swift
//  Meeshy
//
//  Step 3: Languages - Country, Primary & Secondary Language
//  "Langues" with auto-translation preview
//

import SwiftUI

struct RegistrationStep3LanguagesView: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var headerAppeared = false
    @State private var showCountryPicker = false
    @State private var showTranslationDemo = false

    private let accentColor = RegistrationStep.languages.accentColor

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerSection

                // Form fields
                VStack(spacing: 16) {
                    // Country
                    OnboardingFieldCard(
                        explanation: .country,
                        accentColor: accentColor,
                        delay: 0.1
                    ) {
                        Button(action: {
                            showCountryPicker = true
                        }) {
                            HStack(spacing: 12) {
                                Text(viewModel.selectedCountry?.flag ?? "🌍")
                                    .font(.system(size: 32))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(viewModel.selectedCountry?.name ?? "Sélectionner un pays")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.primary)

                                    if viewModel.selectedCountry != nil {
                                        Text("Détecté automatiquement")
                                            .font(.system(size: 12))
                                            .foregroundColor(.secondary)
                                    }
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(.secondarySystemBackground))
                            )
                        }
                    }

                    // Primary Language
                    OnboardingFieldCard(
                        explanation: .primaryLanguage,
                        accentColor: accentColor,
                        delay: 0.2
                    ) {
                        OnboardingLanguageSelector(
                            selectedLanguage: $viewModel.primaryLanguage,
                            availableLanguages: viewModel.availableLanguages,
                            excludeLanguage: viewModel.secondaryLanguage
                        )
                    }

                    // Secondary Language
                    OnboardingFieldCard(
                        explanation: .secondaryLanguage,
                        accentColor: accentColor,
                        delay: 0.3
                    ) {
                        OnboardingLanguageSelector(
                            selectedLanguage: $viewModel.secondaryLanguage,
                            availableLanguages: viewModel.availableLanguages,
                            excludeLanguage: viewModel.primaryLanguage
                        )
                    }

                    // Translation demo
                    if viewModel.primaryLanguage != nil && viewModel.secondaryLanguage != nil {
                        translationDemo
                    }
                }

                Spacer(minLength: 100)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .sheet(isPresented: $showCountryPicker) {
            CountryPickerSheet(
                selectedCountry: $viewModel.selectedCountry,
                isPresented: $showCountryPicker
            )
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.1))
                    .frame(width: 100, height: 100)

                Text("🌍")
                    .font(.system(size: 50))
                    .scaleEffect(headerAppeared ? 1 : 0.5)
            }

            VStack(spacing: 8) {
                Text("Parlons langues!")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.primary)

                Text("Meeshy traduit automatiquement tes messages! Plus de barrières de langue! 🎉")
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

    // MARK: - Translation Demo

    private var translationDemo: some View {
        VStack(spacing: 12) {
            HStack {
                Text("✨")
                Text("Voici comment ça marche:")
                    .font(.system(size: 14, weight: .medium))
                Spacer()
            }

            VStack(spacing: 8) {
                // Original message
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Tu écris en \(viewModel.primaryLanguage?.name ?? "ta langue")")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)

                        Text(sampleMessage(for: viewModel.primaryLanguage?.code ?? "fr"))
                            .font(.system(size: 14))
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(accentColor.opacity(0.2))
                            )
                    }
                    Spacer()
                }

                // Arrow
                Image(systemName: "arrow.down")
                    .foregroundColor(accentColor)

                // Translated message
                HStack {
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("Ton ami voit en \(viewModel.secondaryLanguage?.name ?? "sa langue")")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)

                        Text(translatedMessage(for: viewModel.secondaryLanguage?.code ?? "en"))
                            .font(.system(size: 14))
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(.secondarySystemBackground))
                            )
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(color: accentColor.opacity(0.1), radius: 8, y: 2)
        )
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }

    private func sampleMessage(for code: String) -> String {
        switch code {
        case "fr": return "Salut! Comment ça va?"
        case "en": return "Hey! How are you?"
        case "es": return "¡Hola! ¿Cómo estás?"
        case "de": return "Hallo! Wie geht es dir?"
        case "pt": return "Olá! Como você está?"
        case "zh": return "你好！你好吗？"
        case "ja": return "こんにちは！元気ですか？"
        case "ar": return "مرحبا! كيف حالك؟"
        default: return "Salut! Comment ça va?"
        }
    }

    private func translatedMessage(for code: String) -> String {
        switch code {
        case "fr": return "Salut! Comment ça va?"
        case "en": return "Hey! How are you?"
        case "es": return "¡Hola! ¿Cómo estás?"
        case "de": return "Hallo! Wie geht es dir?"
        case "pt": return "Olá! Como você está?"
        case "zh": return "你好！你好吗？"
        case "ja": return "こんにちは！元気ですか？"
        case "ar": return "مرحبا! كيف حالك؟"
        default: return "Hey! How are you?"
        }
    }
}

// MARK: - Onboarding Language Selector (renamed to avoid conflict)

struct OnboardingLanguageSelector: View {
    @Binding var selectedLanguage: SupportedLanguage?
    let availableLanguages: [SupportedLanguage]
    let excludeLanguage: SupportedLanguage?

    private var filteredLanguages: [SupportedLanguage] {
        availableLanguages.filter { $0.code != excludeLanguage?.code }
    }

    var body: some View {
        VStack(spacing: 8) {
            ForEach(filteredLanguages, id: \.code) { language in
                OnboardingLanguageRow(
                    language: language,
                    isSelected: selectedLanguage?.code == language.code,
                    onSelect: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedLanguage = language
                        }
                        HapticFeedback.selection.trigger()
                    }
                )
            }
        }
    }
}

struct OnboardingLanguageRow: View {
    let language: SupportedLanguage
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                Text(language.flag)
                    .font(.system(size: 24))

                Text(language.name)
                    .font(.system(size: 16))
                    .foregroundColor(.primary)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    Circle()
                        .stroke(Color.gray.opacity(0.3), lineWidth: 2)
                        .frame(width: 24, height: 24)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.green.opacity(0.1) : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.green.opacity(0.3) : Color.clear, lineWidth: 1)
            )
        }
    }
}

// MARK: - Preview

#Preview {
    RegistrationStep3LanguagesView(viewModel: RegistrationFlowViewModel())
}
