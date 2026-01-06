//
//  UserProfileView.swift
//  Meeshy
//
//  View other user's profile
//  iOS 16+
//

import SwiftUI

struct UserProfileView: View {
    // MARK: - Properties

    let userId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: UserProfileViewModel
    @State private var showingBlockAlert = false
    @State private var showingReportSheet = false

    // MARK: - Initialization

    init(userId: String) {
        self.userId = userId
        self._viewModel = StateObject(wrappedValue: UserProfileViewModel(userId: userId))
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    if let user = viewModel.user {
                        // Header
                        headerView(user: user)

                        // Action buttons
                        actionButtons(user: user)

                        // About section
                        if user.bio != nil || user.email != nil {
                            aboutSection(user: user)
                        }

                        // Danger actions
                        dangerActions(user: user)
                    } else if viewModel.isLoading {
                        loadingView
                    } else {
                        errorView
                    }
                }
                .padding(.vertical, 24)
            }
            .background(Color.meeshyBackground)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await viewModel.loadUser()
            }
            .alert("Block User", isPresented: $showingBlockAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Block", role: .destructive) {
                    Task {
                        await viewModel.blockUser()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to block this user? They will no longer be able to message you.")
            }
            .sheet(isPresented: $showingReportSheet) {
                ReportUserView(userId: userId)
            }
        }
    }

    // MARK: - Subviews

    private func headerView(user: User) -> some View {
        VStack(spacing: 16) {
            // Avatar
            AvatarView(
                imageURL: user.avatar,
                initials: user.initials,
                size: 120,
                showOnlineIndicator: true,
                isOnline: user.isOnline
            )

            // Name
            Text(user.displayNameOrUsername)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.meeshyTextPrimary)

            // Username
            Text("@\(user.username)")
                .font(.system(size: 17))
                .foregroundColor(.meeshyTextSecondary)

            // Online status
            if user.isOnline {
                Text("Online")
                    .font(.subheadline)
                    .foregroundColor(.meeshySuccess)
            } else if let lastSeen = user.lastSeen {
                Text("Last seen \(formatLastSeen(lastSeen))")
                    .font(.subheadline)
                    .foregroundColor(.meeshyTextSecondary)
            } else {
                Text("Offline")
                    .font(.subheadline)
                    .foregroundColor(.meeshyTextSecondary)
            }
        }
    }

    private func actionButtons(user: User) -> some View {
        HStack(spacing: 12) {
            // Message button
            Button {
                // TODO: Create conversation with user
            } label: {
                HStack {
                    Image(systemName: "message.fill")
                    Text("Message")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.meeshyPrimary)
                .cornerRadius(12)
            }

            // Call button
            Button {
                // TODO: Start call with user
            } label: {
                Image(systemName: "phone.fill")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.meeshySuccess)
                    .cornerRadius(12)
            }
        }
        .padding(.horizontal, 16)
    }

    private func aboutSection(user: User) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("About")
                .font(.headline)
                .foregroundColor(.meeshyTextPrimary)
                .padding(.horizontal, 16)

            VStack(alignment: .leading, spacing: 12) {
                if ((user.bio?.isEmpty) != nil) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "text.quote")
                            .foregroundColor(.meeshyTextSecondary)
                            .frame(width: 24)

                        Text(user.bio!)
                            .font(.system(size: 15))
                            .foregroundColor(.meeshyTextPrimary)
                    }
                }

                if user.email != nil {
                    HStack(spacing: 12) {
                        Image(systemName: "envelope.fill")
                            .foregroundColor(.meeshyTextSecondary)
                            .frame(width: 24)

                        Text("Email verified")
                            .font(.system(size: 15))
                            .foregroundColor(.meeshyTextPrimary)
                    }
                }

                HStack(spacing: 12) {
                    Image(systemName: "calendar")
                        .foregroundColor(.meeshyTextSecondary)
                        .frame(width: 24)

                    Text("Joined \(formatJoinedDate(user.createdAt))")
                        .font(.system(size: 15))
                        .foregroundColor(.meeshyTextPrimary)
                }
            }
            .padding(16)
            .background(Color.meeshySecondaryBackground)
            .cornerRadius(12)
            .padding(.horizontal, 16)
        }
    }

    private func dangerActions(user: User) -> some View {
        VStack(spacing: 12) {
            Button {
                showingBlockAlert = true
            } label: {
                HStack {
                    Image(systemName: "hand.raised.fill")
                    Text("Block User")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.orange)
                .cornerRadius(12)
            }
            .padding(.horizontal, 16)

            Button {
                showingReportSheet = true
            } label: {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("Report User")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.meeshyError)
                .cornerRadius(12)
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, 16)
    }

    private var loadingView: some View {
        VStack {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading profile...")
                .font(.subheadline)
                .foregroundColor(.meeshyTextSecondary)
                .padding(.top, 16)
        }
        .frame(maxHeight: .infinity)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.xmark")
                .font(.system(size: 64))
                .foregroundColor(.meeshyTextSecondary)

            Text("Failed to load profile")
                .font(.headline)
                .foregroundColor(.meeshyTextPrimary)

            Button("Try Again") {
                Task {
                    await viewModel.loadUser()
                }
            }
            .font(.headline)
            .foregroundColor(.meeshyPrimary)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Helper Methods

    private func formatLastSeen(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func formatJoinedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }
}

// MARK: - Report User View

struct ReportUserView: View {
    let userId: String

    @Environment(\.dismiss) private var dismiss
    @State private var selectedReason: ReportReason = .spam
    @State private var additionalInfo: String = ""
    @State private var isSubmitting: Bool = false

    enum ReportReason: String, CaseIterable {
        case spam = "Spam"
        case harassment = "Harassment"
        case inappropriate = "Inappropriate Content"
        case impersonation = "Impersonation"
        case other = "Other"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Reason", selection: $selectedReason) {
                        ForEach(ReportReason.allCases, id: \.self) { reason in
                            Text(reason.rawValue).tag(reason)
                        }
                    }
                } header: {
                    Text("Report Reason")
                }

                Section {
                    TextField("Additional information (optional)", text: $additionalInfo, axis: .vertical)
                        .lineLimit(5...10)
                } header: {
                    Text("Details")
                } footer: {
                    Text("Please provide any additional context that might help us review this report.")
                }
            }
            .navigationTitle("Report User")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Submit") {
                        submitReport()
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    private func submitReport() {
        isSubmitting = true

        // TODO: Submit report to API
        logger.info("Reporting user \(userId) for \(selectedReason.rawValue)")

        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isSubmitting = false
            dismiss()
        }
    }
}

// MARK: - Preview

#Preview {
    UserProfileView(userId: "user123")
}
