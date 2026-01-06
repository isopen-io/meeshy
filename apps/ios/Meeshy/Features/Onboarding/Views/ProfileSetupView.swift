//
//  ProfileSetupView.swift
//  Meeshy
//
//  Initial profile setup screen
//  Minimum iOS 16+, with iOS 17+ PhotosPicker enhancements
//

import SwiftUI
import PhotosUI

struct ProfileSetupView: View {
    // MARK: - Properties

    @ObservedObject var viewModel: OnboardingViewModel
    @State private var showImagePicker = false
    @State private var selectedItem: PhotosPickerItem?

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // Header
                headerSection

                // Avatar Picker
                avatarSection

                // Profile Form
                profileFormSection

                // Complete Button
                AuthButton(
                    title: "Complete Setup",
                    isLoading: viewModel.isLoading,
                    isEnabled: !viewModel.displayName.isEmpty,
                    style: .primary
                ) {
                    viewModel.completeOnboarding()
                }

                // Skip Button
                Button(action: {
                    viewModel.completeOnboarding()
                }) {
                    Text("Skip")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .disabled(viewModel.isLoading)

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
            .padding(.top, 40)
            .padding(.bottom, 40)
        }
        .onTapGesture {
            hideKeyboard()
        }
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 12) {
            Text("Complete Your Profile")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            Text("Help others recognize you")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
        }
    }

    private var avatarSection: some View {
        VStack(spacing: 16) {
            // Avatar Image
            ZStack(alignment: .bottomTrailing) {
                if let image = viewModel.profileImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 120, height: 120)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color(UIColor.systemGray5), lineWidth: 2)
                        )
                } else {
                    ZStack {
                        Circle()
                            .fill(Color(UIColor.systemGray5))
                            .frame(width: 120, height: 120)

                        Image(systemName: "person.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                    }
                }

                // Camera Button
                Button(action: {
                    showImagePicker = true
                }) {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0, green: 122/255, blue: 1))
                            .frame(width: 36, height: 36)

                        Image(systemName: "camera.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                    }
                    .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
                }
                .accessibilityLabel("Change profile photo")
            }

            Text("Add a profile photo")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
        }
        .photosPicker(isPresented: $showImagePicker, selection: $selectedItem, matching: .images)
        .onChange(of: selectedItem) { newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    viewModel.profileImage = image
                }
            }
        }
    }

    private var profileFormSection: some View {
        VStack(spacing: 20) {
            // Display Name
            AuthTextField(
                title: "Display Name",
                placeholder: "Enter your name",
                text: $viewModel.displayName,
                textContentType: .name,
                autoFocus: false
            )

            // Language Picker
            languagePickerSection
        }
    }

    private var languagePickerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preferred Language")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)

            Menu {
                ForEach(viewModel.availableLanguages) { language in
                    Button(action: {
                        viewModel.selectedLanguage = language.code

                        // Haptic feedback
                        let generator = UIImpactFeedbackGenerator(style: .light)
                        generator.impactOccurred()
                    }) {
                        HStack {
                            Text("\(language.flag) \(language.name)")
                            if viewModel.selectedLanguage == language.code {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                HStack {
                    if let selectedLanguage = viewModel.availableLanguages.first(where: { $0.code == viewModel.selectedLanguage }) {
                        Text("\(selectedLanguage.flag) \(selectedLanguage.name)")
                            .font(.system(size: 17))
                            .foregroundColor(.primary)
                    }

                    Spacer()

                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 16)
                .frame(height: 50)
                .background(Color(UIColor.systemGray6))
                .cornerRadius(12)
            }
            .accessibilityLabel("Select preferred language")
        }
    }

    // MARK: - Helper Methods

    private func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}

// MARK: - Preview

#Preview {
    ProfileSetupView(viewModel: OnboardingViewModel())
}
