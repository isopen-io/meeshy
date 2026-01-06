//
//  ImprovedProfilePreview.swift
//  Meeshy
//
//  Preview and test file for improved profile views
//  iOS 16+
//

import SwiftUI

#if DEBUG

// MARK: - Mock Data

extension User {
    static var mockUser: User {
        User(
            id: "1",
            username: "johndoe",
            firstName: "John",
            lastName: "Doe",
            bio: "Développeur iOS passionné par l'innovation et la technologie mobile. J'aime créer des applications élégantes et performantes.",
            email: "john.doe@example.com",
            phoneNumber: "+33 6 12 34 56 78",
            displayName: "John D.",
            avatar: "https://via.placeholder.com/150",
            isOnline: true
        )
    }

    static var mockUserMinimal: User {
        User(
            id: "2",
            username: "janedoe",
            firstName: "Jane",
            lastName: "Doe",
            email: "jane.doe@example.com"
        )
    }
}

// MARK: - Test View

struct ImprovedProfileTestView: View {
    @StateObject private var viewModel = ProfileViewModel()
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Main Settings View
            MainSettingsView()
                .tabItem {
                    Label("Réglages", systemImage: "gear")
                }
                .tag(0)

            // Tab 2: Full Edit View
            NavigationStack {
                FullProfileEditView(viewModel: viewModel)
            }
            .tabItem {
                Label("Édition", systemImage: "pencil.circle")
            }
            .tag(1)

            // Tab 3: Components
            ComponentsTestView()
                .tabItem {
                    Label("Composants", systemImage: "square.stack.3d.up")
                }
                .tag(2)
        }
        .onAppear {
            // Inject mock user
            viewModel.user = .mockUser
        }
    }
}

// MARK: - Components Test View

struct ComponentsTestView: View {
    @State private var editableText = "Test value"
    @State private var multilineText = "This is a longer text that can span multiple lines for testing the multiline field row component."

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Profile Header Summary Tests
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Profile Headers")
                            .font(.headline)
                            .padding(.horizontal)

                        ProfileHeaderSummaryView(
                            user: .mockUser,
                            isLoading: false
                        ) {
                            print("Header tapped - Full user")
                        }
                        .padding(.horizontal)

                        ProfileHeaderSummaryView(
                            user: .mockUserMinimal,
                            isLoading: false
                        ) {
                            print("Header tapped - Minimal user")
                        }
                        .padding(.horizontal)
                    }

                    Divider()

                    // Field Row Tests
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Field Rows")
                            .font(.headline)
                            .padding(.horizontal)

                        VStack(spacing: 0) {
                            // Editable field
                            ProfileFieldRow(
                                label: "Prénom",
                                icon: "person.fill",
                                iconColor: .blue,
                                isEditable: true,
                                placeholder: "Votre prénom",
                                editValue: $editableText
                            )
                            .padding(.horizontal)

                            ProfileSectionDivider()

                            // Non-editable with value
                            ProfileFieldRow(
                                label: "Email",
                                value: "test@example.com",
                                icon: "envelope.fill",
                                iconColor: .orange,
                                isEditable: false
                            )
                            .padding(.horizontal)

                            ProfileSectionDivider()

                            // Non-editable empty
                            ProfileFieldRow(
                                label: "Téléphone",
                                value: "",
                                icon: "phone.fill",
                                iconColor: .green,
                                isEditable: false
                            )
                            .padding(.horizontal)

                            ProfileSectionDivider()

                            // Multiline field
                            ProfileMultilineFieldRow(
                                label: "Bio",
                                value: "",
                                icon: "text.alignleft",
                                iconColor: .teal,
                                isEditable: true,
                                placeholder: "Parlez-nous de vous",
                                lineLimit: 4,
                                editValue: $multilineText,
                                onSubmit: nil
                            )
                            .padding(.horizontal)
                        }
                        .background(Color(.secondarySystemGroupedBackground))
                        .cornerRadius(16)
                        .padding(.horizontal)
                    }

                    Divider()

                    // Loading State
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Loading State")
                            .font(.headline)
                            .padding(.horizontal)

                        HStack(spacing: 16) {
                            Circle()
                                .fill(Color(.systemGray4))
                                .frame(width: 72, height: 72)
                                .shimmer()

                            VStack(alignment: .leading, spacing: 8) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(.systemGray4))
                                    .frame(width: 150, height: 20)
                                    .shimmer()

                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(.systemGray4))
                                    .frame(width: 100, height: 16)
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
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Composants")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

// MARK: - Previews

#Preview("Test complet") {
    ImprovedProfileTestView()
}

#Preview("Réglages") {
    MainSettingsView()
}

#Preview("Édition complète") {
    FullProfileEditView(viewModel: {
        let vm = ProfileViewModel()
        vm.user = .mockUser
        return vm
    }())
}

#Preview("En-tête résumé") {
    VStack(spacing: 20) {
        ProfileHeaderSummaryView(
            user: .mockUser,
            isLoading: false
        ) {
            print("Tapped")
        }

        ProfileHeaderSummaryView(
            user: .mockUserMinimal,
            isLoading: false
        ) {
            print("Tapped")
        }
    }
    .padding()
    .background(Color(.systemGroupedBackground))
}

#Preview("Changement email") {
    ChangeEmailView()
}

#Preview("Changement mot de passe") {
    ChangePasswordView()
}

#endif