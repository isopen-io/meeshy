//
//  OfflineBanner.swift
//  Meeshy
//
//  Red banner displayed when there's no internet connection
//  Shows prominently at the top of screens to alert users
//

import SwiftUI

// MARK: - Offline Banner

/// A prominent red banner displayed when there's no internet connection
struct OfflineBanner: View {
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var isExpanded = true

    var body: some View {
        if !networkMonitor.isConnected {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 16, weight: .semibold))

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Pas de connexion internet")
                            .font(.system(size: 14, weight: .semibold))

                        if isExpanded {
                            Text("Certaines fonctionnalits ne sont pas disponibles")
                                .font(.system(size: 12))
                                .opacity(0.9)
                        }
                    }

                    Spacer()

                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isExpanded.toggle()
                        }
                    } label: {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .medium))
                            .padding(8)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, isExpanded ? 12 : 8)
            }
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [Color.red, Color.red.opacity(0.9)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .foregroundColor(.white)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

// MARK: - Compact Offline Indicator

/// A smaller offline indicator for use in toolbars or constrained spaces
struct CompactOfflineIndicator: View {
    @ObservedObject private var networkMonitor = NetworkMonitor.shared

    var body: some View {
        if !networkMonitor.isConnected {
            HStack(spacing: 6) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 12, weight: .medium))
                Text("Hors ligne")
                    .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.red)
            .foregroundColor(.white)
            .clipShape(Capsule())
        }
    }
}

// MARK: - Offline Overlay

/// Full-screen overlay for critical offline situations
struct OfflineOverlay: View {
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    let message: String
    let showRetry: Bool
    let onRetry: (() -> Void)?

    init(
        message: String = "Cette fonctionnalit ncessite une connexion internet",
        showRetry: Bool = true,
        onRetry: (() -> Void)? = nil
    ) {
        self.message = message
        self.showRetry = showRetry
        self.onRetry = onRetry
    }

    var body: some View {
        if !networkMonitor.isConnected {
            ZStack {
                Color.black.opacity(0.7)
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 60))
                        .foregroundColor(.red)

                    VStack(spacing: 8) {
                        Text("Pas de connexion")
                            .font(.title2.bold())
                            .foregroundColor(.white)

                        Text(message)
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }

                    if showRetry, let onRetry = onRetry {
                        Button {
                            onRetry()
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.clockwise")
                                Text("Ressayer")
                            }
                            .font(.system(size: 16, weight: .semibold))
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Color.red)
                            .foregroundColor(.white)
                            .clipShape(Capsule())
                        }
                    }
                }
                .padding(32)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(uiColor: .systemBackground).opacity(0.95))
                )
                .padding(24)
            }
            .transition(.opacity)
        }
    }
}

// MARK: - View Modifier

/// View modifier to add offline banner at the top of any view
struct OfflineBannerModifier: ViewModifier {
    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            OfflineBanner()
            content
        }
    }
}

extension View {
    /// Adds an offline banner at the top of the view
    func withOfflineBanner() -> some View {
        modifier(OfflineBannerModifier())
    }
}

// MARK: - Preview

#Preview("Offline Banner") {
    VStack {
        OfflineBanner()
        Spacer()
        CompactOfflineIndicator()
        Spacer()
    }
}

#Preview("Offline Overlay") {
    Text("Content")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay {
            OfflineOverlay(onRetry: {})
        }
}
