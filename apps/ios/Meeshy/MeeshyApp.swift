import SwiftUI

@main
struct MeeshyApp: App {
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                    .opacity(showSplash ? 0 : 1)
                    .scaleEffect(showSplash ? 0.96 : 1)

                if showSplash {
                    SplashScreen(onFinish: {
                        withAnimation(.easeInOut(duration: 0.6)) {
                            showSplash = false
                        }
                    })
                    .transition(.opacity.combined(with: .scale(scale: 1.1)))
                    .zIndex(1)
                }
            }
        }
    }
}

// MARK: - Splash Screen
struct SplashScreen: View {
    let onFinish: () -> Void

    @State private var showLogo = false
    @State private var showTitle = false
    @State private var showSubtitle = false
    @State private var glowPulse = false
    @State private var backgroundScale: CGFloat = 1.2

    var body: some View {
        ZStack {
            // Animated dark gradient background
            LinearGradient(
                colors: [
                    Color(hex: "0a0a1a"),
                    Color(hex: "1a1035"),
                    Color(hex: "0d1f2d")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .scaleEffect(backgroundScale)
            .ignoresSafeArea()

            // Ambient orbs
            Circle()
                .fill(Color(hex: "08D9D6").opacity(0.15))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: -80, y: -200)
                .scaleEffect(glowPulse ? 1.3 : 0.8)

            Circle()
                .fill(Color(hex: "FF2E63").opacity(0.12))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .offset(x: 90, y: 180)
                .scaleEffect(glowPulse ? 1.2 : 0.9)

            Circle()
                .fill(Color(hex: "B24BF3").opacity(0.1))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .offset(x: 60, y: -80)
                .scaleEffect(glowPulse ? 1.1 : 1.0)

            VStack(spacing: 0) {
                Spacer()

                // Animated Logo
                AnimatedLogoView(color: .white, lineWidth: 10, continuous: false)
                    .frame(width: 120, height: 120)
                    .opacity(showLogo ? 1 : 0)
                    .scaleEffect(showLogo ? 1 : 0.5)
                    .padding(.bottom, 32)

                // App Name — fade in + descend from above with bounce
                Text("Meeshy")
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "B24BF3"), Color(hex: "8B5CF6"), Color(hex: "A855F7")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: "B24BF3").opacity(0.5), radius: 12, x: 0, y: 4)
                    .fixedSize()
                    .frame(height: 80)
                    .opacity(showTitle ? 1 : 0)
                    .offset(y: showTitle ? 0 : -40)
                    .padding(.bottom, 8)

                // Tagline — fade in + descend from above with bounce
                Text("Break the language barrier")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .frame(height: 40)
                    .opacity(showSubtitle ? 1 : 0)
                    .offset(y: showSubtitle ? 0 : -20)

                Spacer()
            }
        }
        .onAppear {
            // Staggered entrance
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                showLogo = true
            }

            // Title: fade in + descend with bounce overshoot
            withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.5)) {
                showTitle = true
            }

            // Subtitle: same bounce, slightly later
            withAnimation(.spring(response: 0.7, dampingFraction: 0.55).delay(0.9)) {
                showSubtitle = true
            }

            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                glowPulse = true
            }

            withAnimation(.easeInOut(duration: 2.0)) {
                backgroundScale = 1.0
            }

            // Transition to main app (give enough time for all bounce animations)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) {
                onFinish()
            }
        }
    }
}
