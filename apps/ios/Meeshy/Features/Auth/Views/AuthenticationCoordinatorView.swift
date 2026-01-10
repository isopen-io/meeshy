//
//  AuthenticationCoordinatorView.swift
//  Meeshy
//
//  Authentication flow coordinator
//

import SwiftUI

struct AuthenticationCoordinatorView: View {
    // MARK: - Properties

    @StateObject private var loginViewModel = LoginViewModel()
    @StateObject private var registerViewModel = RegisterViewModel()

    @State private var currentView: AuthView = .login
    @State private var showTwoFactor = false
    @State private var showForgotPassword = false
    @State private var showNewOnboarding = false

    // MARK: - Auth View State

    enum AuthView {
        case login
        case register
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                Color.meeshyBackground
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Logo
                    header

                    // Auth View Switcher
                    authViewPicker

                    // Current View
                    currentAuthView
                        .transition(.opacity)

                    Spacer()
                }
            }
            .sheet(isPresented: $showTwoFactor) {
                TwoFactorView()
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordView()
            }
            .fullScreenCover(isPresented: $showNewOnboarding) {
                OnboardingFlowView {
                    // Registration completed successfully
                    showNewOnboarding = false
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 16) {
            Image(systemName: "message.circle.fill")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 100, height: 100)
                .foregroundColor(.meeshyPrimary)

            Text("Meeshy")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.meeshyTextPrimary)

            Text("Connect with the world")
                .font(.subheadline)
                .foregroundColor(.meeshyTextSecondary)
        }
        .padding(.top, 60)
        .padding(.bottom, 40)
    }

    // MARK: - View Picker

    private var authViewPicker: some View {
        HStack(spacing: 0) {
            Button {
                withAnimation {
                    currentView = .login
                }
            } label: {
                Text("Login")
                    .font(.headline)
                    .foregroundColor(currentView == .login ? .meeshyPrimary : .meeshyTextSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        VStack(spacing: 0) {
                            Spacer()
                            Rectangle()
                                .fill(currentView == .login ? Color.meeshyPrimary : Color.clear)
                                .frame(height: 2)
                        }
                    )
            }

            Button {
                // Open the new animated onboarding flow
                showNewOnboarding = true
            } label: {
                Text("S'inscrire")
                    .font(.headline)
                    .foregroundColor(.meeshyTextSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        VStack(spacing: 0) {
                            Spacer()
                            Rectangle()
                                .fill(Color.clear)
                                .frame(height: 2)
                        }
                    )
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Current Auth View

    @ViewBuilder
    private var currentAuthView: some View {
        // Now only showing LoginView since Register opens the new onboarding flow
        LoginView()
            .environmentObject(loginViewModel)
            .onTapGesture(count: 2) {
                // Quick dev login on double tap
                #if DEBUG
                // loginViewModel.quickDevLogin()
                #endif
            }
    }
}

// MARK: - Preview

struct AuthenticationCoordinatorView_Previews: PreviewProvider {
    static var previews: some View {
        AuthenticationCoordinatorView()
    }
}
