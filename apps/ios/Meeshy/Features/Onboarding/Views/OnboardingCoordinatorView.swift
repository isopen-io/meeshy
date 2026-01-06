//
//  OnboardingCoordinatorView.swift
//  Meeshy
//
//  Coordinator view managing the onboarding flow
//  Minimum iOS 16+
//

import SwiftUI

struct OnboardingCoordinatorView: View {
    // MARK: - Properties

    @StateObject private var viewModel = OnboardingViewModel()

    // MARK: - Body

    var body: some View {
        ZStack {
            // Background
            Color(UIColor.systemBackground)
                .ignoresSafeArea()

            // Single step: Permissions only
            // Profile setup happens AFTER login, not during onboarding
            PermissionsView(viewModel: viewModel)
        }
        .interactiveDismissDisabled()
    }
}

// MARK: - Preview

#Preview {
    OnboardingCoordinatorView()
}
