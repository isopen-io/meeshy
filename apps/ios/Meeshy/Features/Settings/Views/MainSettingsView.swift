//
//  MainSettingsView.swift
//  Meeshy
//
//  Main settings view with profile summary and all app settings
//  iOS 16+
//

import SwiftUI

// ============================================================
// TAB SETTINGS - MAIN SETTINGS VIEW
// Cette vue est affichée dans le tab "Réglages" de MainTabView
// Elle regroupe toutes les informations du profil utilisateur
// et les paramètres de l'application
// ============================================================

// MARK: - Shimmer Effect
// Note: ShimmerModifier is defined in Meeshy/Core/UI/Modifiers/ShimmerModifier.swift

struct MainSettingsView: View {
    @StateObject private var viewModel = ProfileViewModel()
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var showingLogoutAlert = false
    @State private var showingChangePassword = false
    @State private var showingChangeEmail = false
    @State private var showingFullProfileEdit = false
    @State private var isLoggingOut = false
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Search field
                    searchField

                    // New Profile Header Summary - Clickable
                    if let user = viewModel.user {
                        ProfileHeaderSummaryView(
                            user: user,
                            isLoading: viewModel.isLoading,
                            onTap: { showingFullProfileEdit = true }
                        )
                        .padding(.horizontal)
                    } else {
                        // Loading state
                        profileHeaderLoadingState
                    }

                    // Account Settings
                    accountSection

                    // App Settings
                    appSettingsSection

                    // Privacy & Security
                    privacySection

                    // Appearance
                    appearanceSection

                    // iOS Features
                    iOSFeaturesSection

                    // Data & Storage
                    dataStorageSection

                    // About & Support
                    aboutSection

                    // Copyright
                    copyrightView

                    // Logout
                    logoutButton
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.large)
            .alert("Déconnexion", isPresented: $showingLogoutAlert) {
                Button("Annuler", role: .cancel) { }
                Button("Déconnexion", role: .destructive) {
                    Task {
                        isLoggingOut = true
                        await viewModel.logout()
                        isLoggingOut = false
                    }
                }
            } message: {
                Text("Êtes-vous sûr de vouloir vous déconnecter ?")
            }
            .sheet(isPresented: $showingChangePassword) {
                ChangePasswordView()
            }
            .sheet(isPresented: $showingChangeEmail) {
                ChangeEmailView()
            }
            .fullScreenCover(isPresented: $showingFullProfileEdit) {
                FullProfileEditView(viewModel: viewModel)
            }
            .overlay {
                if isLoggingOut {
                    ZStack {
                        Color.black.opacity(0.3)
                            .ignoresSafeArea()

                        VStack(spacing: 16) {
                            ProgressView()
                                .scaleEffect(1.5)
                            Text("Déconnexion...")
                                .font(.headline)
                                .foregroundColor(.white)
                        }
                        .padding(32)
                        .background(Color(.systemBackground))
                        .cornerRadius(16)
                        .shadow(radius: 10)
                    }
                }
            }
            .task {
                await viewModel.loadProfile()
            }
        }
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            TextField("Rechercher dans les réglages", text: $searchText)
                .textFieldStyle(.plain)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(10)
        .padding(.horizontal)
    }

    // MARK: - Loading State

    private var profileHeaderLoadingState: some View {
        HStack(spacing: 16) {
            // Avatar placeholder
            Circle()
                .fill(Color(.systemGray4))
                .frame(width: 72, height: 72)
                .shimmer()

            // Text placeholders
            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray4))
                    .frame(width: 150, height: 20)
                    .shimmer()

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray4))
                    .frame(width: 100, height: 16)
                    .shimmer()

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray4))
                    .frame(width: 80, height: 14)
                    .shimmer()
            }

            Spacer()
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .padding(.horizontal)
    }

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Compte")

            SettingRow(
                icon: "envelope.fill",
                title: "Email",
                value: viewModel.user?.email ?? "",
                color: .blue
            ) {
                showingChangeEmail = true
            }

            Divider().padding(.leading, 60)

            SettingRow(
                icon: "phone.fill",
                title: "Téléphone",
                value: viewModel.editPhoneNumber.isEmpty ? "Non renseigné" : viewModel.editPhoneNumber,
                color: .green
            ) {
                // Edit inline
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                SecuritySettingsView()
            } label: {
                SettingRow(
                    icon: "lock.fill",
                    title: "Mot de passe",
                    value: "••••••••",
                    color: .orange,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - App Settings

    private var appSettingsSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Application")

            NavigationLink {
                TranslationSettingsView()
            } label: {
                SettingRow(
                    icon: "textformat",
                    title: "Traduction",
                    value: "Automatique",
                    color: .purple,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                NotificationSettingsView()
            } label: {
                SettingRow(
                    icon: "bell.fill",
                    title: "Notifications",
                    value: "",
                    color: .red,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                ChatSettingsView()
            } label: {
                SettingRow(
                    icon: "message.fill",
                    title: "Chat",
                    value: "",
                    color: .blue,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - Privacy Section

    private var privacySection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Confidentialité & Sécurité")

            NavigationLink {
                PrivacySettingsView()
            } label: {
                SettingRow(
                    icon: "eye.fill",
                    title: "Confidentialité",
                    value: "",
                    color: .indigo,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                SecuritySettingsView()
            } label: {
                SettingRow(
                    icon: "shield.fill",
                    title: "Sécurité",
                    value: "",
                    color: .orange,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - Appearance Section

    private var appearanceSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Apparence")

            NavigationLink {
                AppearanceSettingsView()
            } label: {
                SettingRow(
                    icon: "paintbrush.fill",
                    title: "Thème & Affichage",
                    value: "",
                    color: .pink,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                BubbleShowcaseView()
            } label: {
                SettingRow(
                    icon: "bubble.left.and.bubble.right.fill",
                    title: "Aperçu de votre configuration",
                    value: "Tous les styles de messages",
                    color: .cyan,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - iOS Features Section

    private var iOSFeaturesSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Fonctionnalités iOS")

            NavigationLink {
                SiriShortcutsView()
            } label: {
                SettingRow(
                    icon: "waveform",
                    title: "Siri & Raccourcis",
                    value: "",
                    color: .purple,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                WidgetSettingsView()
            } label: {
                SettingRow(
                    icon: "square.stack.3d.up",
                    title: "Widgets",
                    value: "",
                    color: .blue,
                    showChevron: true
                )
            }

            if UIDevice.current.userInterfaceIdiom == .phone {
                Divider().padding(.leading, 60)

                NavigationLink {
                    AppleWatchSettingsView()
                } label: {
                    SettingRow(
                        icon: "applewatch",
                        title: "Apple Watch",
                        value: "",
                        color: .gray,
                        showChevron: true
                    )
                }
            }

            Divider().padding(.leading, 60)

            HStack(spacing: 16) {
                Image(systemName: "waveform.path")
                    .font(.system(size: 20))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.cyan)
                    .cornerRadius(8)

                Text("Retour haptique")
                    .font(.body)
                    .foregroundColor(.primary)

                Spacer()

                Toggle("", isOn: $settingsManager.hapticFeedbackEnabled)
                    .labelsHidden()
            }
            .padding()
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - Data & Storage Section

    private var dataStorageSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Données & Stockage")

            NavigationLink {
                DataStorageView()
            } label: {
                SettingRow(
                    icon: "internaldrive.fill",
                    title: "Stockage",
                    value: "\(settingsManager.currentCacheSize) Mo",
                    color: .gray,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                DataExportView()
            } label: {
                SettingRow(
                    icon: "square.and.arrow.up.fill",
                    title: "Exporter les données",
                    value: "",
                    color: .green,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                DeleteAccountView()
            } label: {
                SettingRow(
                    icon: "trash.fill",
                    title: "Supprimer le compte",
                    value: "",
                    color: .red,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - About Section

    private var aboutSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "À Propos")

            NavigationLink {
                AboutView()
            } label: {
                SettingRow(
                    icon: "info.circle.fill",
                    title: "À Propos de Meeshy",
                    value: "Version 1.0.0",
                    color: .blue,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                PrivacyPolicyView()
            } label: {
                SettingRow(
                    icon: "hand.raised.fill",
                    title: "Politique de confidentialité",
                    value: "",
                    color: .indigo,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                TermsOfServiceView()
            } label: {
                SettingRow(
                    icon: "doc.text.fill",
                    title: "Conditions d'utilisation",
                    value: "",
                    color: .teal,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                LicensesView()
            } label: {
                SettingRow(
                    icon: "doc.plaintext.fill",
                    title: "Licences",
                    value: "",
                    color: .brown,
                    showChevron: true
                )
            }

            Divider().padding(.leading, 60)

            NavigationLink {
                SupportView()
            } label: {
                SettingRow(
                    icon: "questionmark.circle.fill",
                    title: "Support",
                    value: "",
                    color: .pink,
                    showChevron: true
                )
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    // MARK: - Copyright

    private var copyrightView: some View {
        Text("© 2024 Meeshy. Tous droits réservés.")
            .font(.caption)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 8)
    }

    // MARK: - Logout Button

    private var logoutButton: some View {
        Button {
            showingLogoutAlert = true
        } label: {
            Text("Déconnexion")
                .font(.headline)
                .foregroundColor(.red)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(12)
        }
        .padding(.horizontal)
        .padding(.bottom, 40)
    }
}

// MARK: - Supporting Views

struct SectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.headline)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
            .padding(.vertical, 8)
    }
}

struct SettingRow: View {
    let icon: String
    let title: String
    let value: String
    let color: Color
    var showChevron: Bool = false
    var action: (() -> Void)? = nil

    var body: some View {
        if let action = action {
            Button {
                action()
            } label: {
                rowContent
            }
            .buttonStyle(.plain)
        } else {
            rowContent
        }
    }

    private var rowContent: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(color)
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .foregroundColor(.primary)

                if !value.isEmpty {
                    Text(value)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .contentShape(Rectangle())
    }
}

// MARK: - Backward compatibility
typealias UnifiedProfileView = MainSettingsView

#Preview {
    MainSettingsView()
}
