//
//  RegistrationStep4ProfileView.swift
//  Meeshy
//
//  Step 4: Profile - Photo and Bio
//  "Profil" with camera and gallery options
//

import SwiftUI
import PhotosUI

struct RegistrationStep4ProfileView: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var headerAppeared = false
    @State private var showImageOptions = false
    @State private var selectedPhotoItem: PhotosPickerItem?

    private let accentColor = RegistrationStep.profile.accentColor

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerSection

                // Profile photo
                OnboardingFieldCard(
                    explanation: .photo,
                    accentColor: accentColor,
                    delay: 0.1
                ) {
                    profilePhotoSection
                }

                // Bio
                OnboardingFieldCard(
                    explanation: .bio,
                    accentColor: accentColor,
                    delay: 0.2
                ) {
                    bioSection
                }

                // Preview card
                if viewModel.profileImage != nil || !viewModel.bio.isEmpty {
                    profilePreview
                }

                // Skip info
                skipInfo

                Spacer(minLength: 100)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .confirmationDialog("Ajouter une photo", isPresented: $showImageOptions) {
            Button("Prendre une photo") {
                viewModel.showCamera = true
            }

            Button("Choisir dans la galerie") {
                viewModel.showImagePicker = true
            }

            if viewModel.profileImage != nil {
                Button("Supprimer la photo", role: .destructive) {
                    withAnimation {
                        viewModel.profileImage = nil
                    }
                    HapticFeedback.light.trigger()
                }
            }

            Button("Annuler", role: .cancel) {}
        }
        .sheet(isPresented: $viewModel.showCamera) {
            OnboardingCameraView(image: $viewModel.profileImage)
        }
        .photosPicker(
            isPresented: $viewModel.showImagePicker,
            selection: $selectedPhotoItem,
            matching: .images
        )
        .onChange(of: selectedPhotoItem) { newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        viewModel.profileImage = image
                    }
                }
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.1))
                    .frame(width: 100, height: 100)

                Text("📸")
                    .font(.system(size: 50))
                    .scaleEffect(headerAppeared ? 1 : 0.5)
            }

            VStack(spacing: 8) {
                Text("Ton profil Meeshy")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.primary)

                Text("Une photo et quelques mots pour que tes contacts te reconnaissent! 😊")
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

    // MARK: - Profile Photo Section

    private var profilePhotoSection: some View {
        HStack(spacing: 20) {
            // Photo circle
            Button(action: {
                showImageOptions = true
                HapticFeedback.light.trigger()
            }) {
                ZStack {
                    if let image = viewModel.profileImage {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                    } else {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [accentColor.opacity(0.3), accentColor.opacity(0.1)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 100, height: 100)

                        Image(systemName: "camera.fill")
                            .font(.system(size: 30))
                            .foregroundColor(accentColor)
                    }

                    // Edit badge
                    Circle()
                        .fill(accentColor)
                        .frame(width: 32, height: 32)
                        .overlay(
                            Image(systemName: viewModel.profileImage == nil ? "plus" : "pencil")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        )
                        .offset(x: 35, y: 35)
                }
            }

            // Photo options
            VStack(alignment: .leading, spacing: 8) {
                Button(action: {
                    viewModel.showCamera = true
                }) {
                    Label("Prendre une photo", systemImage: "camera")
                        .font(.system(size: 14))
                        .foregroundColor(accentColor)
                }

                Button(action: {
                    viewModel.showImagePicker = true
                }) {
                    Label("Choisir une image", systemImage: "photo.on.rectangle")
                        .font(.system(size: 14))
                        .foregroundColor(accentColor)
                }
            }
        }
    }

    // MARK: - Bio Section

    private var bioSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $viewModel.bio)
                .frame(minHeight: 80, maxHeight: 120)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )

            // Character count
            HStack {
                if viewModel.bio.isEmpty {
                    Text("Ex: Entrepreneur à Yaoundé 🚀")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text("\(viewModel.bio.count)/150")
                    .font(.system(size: 12))
                    .foregroundColor(viewModel.bio.count > 150 ? .red : .secondary)
            }
        }
    }

    // MARK: - Profile Preview

    private var profilePreview: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Aperçu de ton profil")
                    .font(.system(size: 14, weight: .medium))
                Spacer()
            }

            HStack(spacing: 16) {
                // Avatar
                if let image = viewModel.profileImage {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 60, height: 60)
                        .clipShape(Circle())
                } else {
                    Circle()
                        .fill(accentColor.opacity(0.3))
                        .frame(width: 60, height: 60)
                        .overlay(
                            Text(String(viewModel.firstName.prefix(1)))
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(accentColor)
                        )
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(viewModel.firstName) \(viewModel.lastName)")
                        .font(.system(size: 17, weight: .semibold))

                    Text("@\(viewModel.username)")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)

                    if !viewModel.bio.isEmpty {
                        Text(viewModel.bio)
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: Color.black.opacity(0.05), radius: 8, y: 2)
            )
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }

    // MARK: - Skip Info

    private var skipInfo: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle")
                .foregroundColor(.secondary)

            Text("Cette étape est optionnelle, tu pourras compléter ton profil plus tard!")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal)
    }
}

// MARK: - Onboarding Camera View (renamed to avoid conflict)

struct OnboardingCameraView: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraDevice = .front
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: OnboardingCameraView

        init(_ parent: OnboardingCameraView) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.image = image
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - Preview

#Preview {
    RegistrationStep4ProfileView(viewModel: RegistrationFlowViewModel())
}
