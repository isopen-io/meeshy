//
//  FullProfileEditView.swift
//  Meeshy
//
//  Vue d'édition complète du profil utilisateur
//  iOS 16+
//

import SwiftUI
import PhotosUI

struct FullProfileEditView: View {
    // MARK: - Properties

    @ObservedObject var viewModel: ProfileViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingPhotosPicker = false
    @State private var showingUnsavedChangesAlert = false
    @State private var showingChangeEmailSheet = false
    @State private var showingChangePhoneSheet = false
    @State private var showingChangePasswordSheet = false

    // Local edit states
    @State private var editFirstName: String = ""
    @State private var editLastName: String = ""
    @State private var editDisplayName: String = ""
    @State private var editBio: String = ""

    // MARK: - Initialization

    init(viewModel: ProfileViewModel) {
        self.viewModel = viewModel
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Avatar Section
                    avatarSection

                    // Profile Information
                    profileInfoSection

                    // Contact Information (Read-only with secure change)
                    contactInfoSection

                    // Bio Section
                    bioSection
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Modifier le profil")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        handleCancel()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Enregistrer") {
                        handleSave()
                    }
                    .fontWeight(.semibold)
                    .disabled(!hasChanges() || viewModel.isLoading)
                }
            }
            .photosPicker(
                isPresented: $showingPhotosPicker,
                selection: $selectedPhotoItem,
                matching: .images,
                photoLibrary: .shared()
            )
            .onChange(of: selectedPhotoItem) { _, newValue in
                if let item = newValue {
                    Task {
                        await viewModel.updateAvatar(from: item)
                        selectedPhotoItem = nil
                    }
                }
            }
            .alert("Modifications non enregistrées", isPresented: $showingUnsavedChangesAlert) {
                Button("Annuler", role: .cancel) { }
                Button("Quitter sans enregistrer", role: .destructive) {
                    dismiss()
                }
            } message: {
                Text("Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter sans les enregistrer ?")
            }
            .sheet(isPresented: $showingChangeEmailSheet) {
                ChangeEmailView()
            }
            .sheet(isPresented: $showingChangePhoneSheet) {
                ChangePhoneView()
            }
            .sheet(isPresented: $showingChangePasswordSheet) {
                ChangePasswordView()
            }
            .interactiveDismissDisabled(hasChanges())
            .overlay {
                if viewModel.isLoading {
                    ProgressView("Enregistrement...")
                        .padding()
                        .background(Color(.systemBackground))
                        .cornerRadius(12)
                        .shadow(radius: 10)
                }
            }
        }
        .onAppear {
            loadInitialValues()
        }
    }

    // MARK: - Sections

    private var avatarSection: some View {
        VStack(spacing: 16) {
            ZStack {
                if let user = viewModel.user {
                    AvatarView(
                        imageURL: user.avatarURL?.absoluteString,
                        initials: user.initials,
                        size: 120
                    )
                }

                if viewModel.isUploadingAvatar {
                    ZStack {
                        Color.black.opacity(0.5)
                            .clipShape(Circle())
                        ProgressView()
                            .tint(.white)
                    }
                    .frame(width: 120, height: 120)
                }
            }

            Button {
                showingPhotosPicker = true
            } label: {
                Label("Changer la photo", systemImage: "camera.fill")
                    .font(.callout)
                    .foregroundColor(.blue)
            }
            .disabled(viewModel.isUploadingAvatar)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }

    private var profileInfoSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Informations du profil")

            VStack(spacing: 0) {
                // Username (Read-only)
                ProfileFieldRow(
                    label: "Pseudo",
                    value: "@\(viewModel.user?.username ?? "")",
                    icon: "at",
                    iconColor: .purple,
                    isEditable: false
                )

                ProfileSectionDivider()

                // First Name
                ProfileFieldRow(
                    label: "Prénom",
                    icon: "person.fill",
                    iconColor: .blue,
                    isEditable: true,
                    placeholder: "Votre prénom",
                    editValue: $editFirstName,
                    onEditingChanged: { _ in
                        checkForChanges()
                    }
                )

                ProfileSectionDivider()

                // Last Name
                ProfileFieldRow(
                    label: "Nom",
                    icon: "person.fill",
                    iconColor: .blue,
                    isEditable: true,
                    placeholder: "Votre nom",
                    editValue: $editLastName,
                    onEditingChanged: { _ in
                        checkForChanges()
                    }
                )

                ProfileSectionDivider()

                // Display Name
                ProfileFieldRow(
                    label: "Nom d'affichage",
                    icon: "textformat",
                    iconColor: .indigo,
                    isEditable: true,
                    placeholder: "Comment vous voulez être appelé",
                    editValue: $editDisplayName,
                    onEditingChanged: { _ in
                        checkForChanges()
                    }
                )
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(16)
            .padding(.horizontal)
        }
    }

    private var contactInfoSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "Informations de contact")

            VStack(spacing: 0) {
                // Phone Number (Secure change procedure)
                Button {
                    showingChangePhoneSheet = true
                } label: {
                    HStack {
                        ProfileFieldRow(
                            label: "Numéro de téléphone",
                            value: viewModel.user?.phoneNumber ?? "Non renseigné",
                            icon: "phone.fill",
                            iconColor: .green,
                            isEditable: false
                        )

                        Image(systemName: "chevron.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                }
                .buttonStyle(.plain)

                ProfileSectionDivider()

                // Email (Secure change procedure)
                Button {
                    showingChangeEmailSheet = true
                } label: {
                    HStack {
                        ProfileFieldRow(
                            label: "Adresse email",
                            value: viewModel.user?.email ?? "",
                            icon: "envelope.fill",
                            iconColor: .orange,
                            isEditable: false
                        )

                        Image(systemName: "chevron.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                }
                .buttonStyle(.plain)

                ProfileSectionDivider()

                // Password (Secure change procedure)
                Button {
                    showingChangePasswordSheet = true
                } label: {
                    HStack {
                        ProfileFieldRow(
                            label: "Mot de passe",
                            value: "••••••••",
                            icon: "key.fill",
                            iconColor: .red,
                            isEditable: false
                        )

                        Image(systemName: "chevron.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(16)
            .padding(.horizontal)

            Text("Pour des raisons de sécurité, ces informations nécessitent une vérification spéciale pour être modifiées.")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal)
                .padding(.top, 8)
        }
    }

    private var bioSection: some View {
        VStack(spacing: 0) {
            SectionHeader(title: "À propos")

            ProfileMultilineFieldRow(
                label: "Bio",
                value: viewModel.user?.bio ?? "",
                icon: "text.alignleft",
                iconColor: .teal,
                isEditable: true,
                placeholder: "Parlez-nous de vous...",
                lineLimit: 5,
                editValue: $editBio
            ) {
                checkForChanges()
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(16)
            .padding(.horizontal)
        }
    }

    // MARK: - Actions

    private func loadInitialValues() {
        guard let user = viewModel.user else { return }
        editFirstName = user.firstName
        editLastName = user.lastName
        editDisplayName = user.displayName ?? ""
        editBio = user.bio ?? ""
    }

    private func hasChanges() -> Bool {
        guard let user = viewModel.user else { return false }
        return editFirstName != user.firstName ||
               editLastName != user.lastName ||
               editDisplayName != (user.displayName ?? "") ||
               editBio != (user.bio ?? "")
    }

    private func checkForChanges() {
        // Cette méthode est appelée à chaque modification pour déclencher la mise à jour de la vue
        // La détection réelle des changements est faite par hasChanges()
    }

    private func handleCancel() {
        if hasChanges() {
            showingUnsavedChangesAlert = true
        } else {
            dismiss()
        }
    }

    private func handleSave() {
        Task {
            // Create update request with all edited fields
            var request = UserProfileUpdateRequest()
            request.firstName = editFirstName.isEmpty ? nil : editFirstName
            request.lastName = editLastName.isEmpty ? nil : editLastName
            request.displayName = editDisplayName.isEmpty ? nil : editDisplayName
            request.bio = editBio.isEmpty ? nil : editBio

            // Send update with the request
            let success = await viewModel.updateProfile(request: request)

            if success {
                dismiss()
            }
        }
    }
}

// Note: ChangePhoneView is now in Account/ChangePhoneView.swift
// with full verification flow (password + SMS code)

// MARK: - Preview

#if DEBUG
#Preview("Full Profile Edit") {
    FullProfileEditView(viewModel: ProfileViewModel())
}
#endif