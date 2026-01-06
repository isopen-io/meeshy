//
//  EditProfileView.swift
//  Meeshy
//
//  Edit profile sheet
//  iOS 16+
//

import SwiftUI
import PhotosUI

struct EditProfileView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @ObservedObject var viewModel: ProfileViewModel

    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showingImagePicker = false

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Avatar picker
                    avatarSection

                    // Form fields
                    formSection
                }
                .padding(.vertical, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        viewModel.cancelEditing()
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            let success = await viewModel.updateProfileFromEditFields()
                            if success {
                                dismiss()
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!viewModel.hasChanges())
                }
            }
            .photosPicker(
                isPresented: $showingImagePicker,
                selection: $selectedPhoto,
                matching: .images
            )
            .onChange(of: selectedPhoto) { newValue in
                Task {
                    if let data = try? await newValue?.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        _ = await viewModel.uploadAvatar(uiImage)
                    }
                }
            }
        }
    }

    // MARK: - Subviews

    private var avatarSection: some View {
        VStack(spacing: 16) {
            if viewModel.isUploadingAvatar {
                ZStack {
                    AvatarView(
                        imageURL: viewModel.user?.avatarURL?.absoluteString,
                        initials: viewModel.user?.initials ?? "?",
                        size: 120
                    )
                    .opacity(0.5)

                    ProgressView()
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                }
            } else {
                EditableAvatarView(
                    imageURL: viewModel.user?.avatarURL?.absoluteString,
                    initials: viewModel.user?.initials ?? "?",
                    size: 120
                ) {
                    showingImagePicker = true
                }
            }

            Text("Tap to change photo")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var formSection: some View {
        VStack(spacing: 16) {
            // Display Name
            VStack(alignment: .leading, spacing: 8) {
                Text("Display Name")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                TextField("Your name", text: $viewModel.editDisplayName)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(10)
                    .autocapitalization(.words)
            }
            .padding(.horizontal, 16)

            // Bio / Status
            VStack(alignment: .leading, spacing: 8) {
                Text("Status Message")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                TextField("Hey there!", text: $viewModel.editBio, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(3...5)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(10)
            }
            .padding(.horizontal, 16)

            // Phone Number
            VStack(alignment: .leading, spacing: 8) {
                Text("Phone Number")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                TextField("+1 (555) 123-4567", text: $viewModel.editPhoneNumber)
                    .textFieldStyle(.plain)
                    .keyboardType(.phonePad)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(10)
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Preview

#Preview {
    EditProfileView(viewModel: ProfileViewModel())
}
