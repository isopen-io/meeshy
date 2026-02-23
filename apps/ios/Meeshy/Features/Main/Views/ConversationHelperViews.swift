// MARK: - Extracted from ConversationView.swift
import SwiftUI
import CoreLocation
import MeeshySDK
import MeeshyUI

// MARK: - Themed Back Button
struct ThemedBackButton: View {
    let color: String
    var compactMode: Bool = false
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                // Circle background — collapses in compact mode
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [Color(hex: color).opacity(0.5), MeeshyColors.teal.opacity(0.5)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: Color(hex: color).opacity(0.3), radius: 6, y: 3)
                    .opacity(compactMode ? 0 : 1)
                    .scaleEffect(compactMode ? 0.4 : 1)

                // Chevron — always visible
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: color), MeeshyColors.teal],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .frame(width: compactMode ? 24 : 40, height: 40)
            .scaleEffect(isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: compactMode)
        }
    }
}

// MARK: - Themed Avatar Button
struct ThemedAvatarButton: View {
    let name: String
    let color: String
    let secondaryColor: String
    let isExpanded: Bool
    var hasStoryRing: Bool = false
    var avatarURL: String? = nil
    var presenceState: PresenceState = .offline
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            MeeshyAvatar(
                name: name,
                mode: .conversationHeader,
                accentColor: color,
                secondaryColor: secondaryColor,
                avatarURL: avatarURL,
                storyState: hasStoryRing ? .unread : .none,
                presenceState: presenceState
            )
            .shadow(color: Color(hex: color).opacity(isExpanded ? 0.6 : 0.4), radius: isExpanded ? 12 : 8, y: 3)
            .scaleEffect(isPressed ? 0.9 : (isExpanded ? 1.1 : 1))
        }
    }
}

// MARK: - Themed Composer Button
struct ThemedComposerButton: View {
    let icon: String
    let colors: [String]
    var isActive: Bool = false
    var rotateIcon: Bool = false
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        isActive ?
                        LinearGradient(colors: colors.map { Color(hex: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing) :
                        LinearGradient(colors: [Color(hex: colors[0]).opacity(0.2), Color(hex: colors[1]).opacity(0.15)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(colors: colors.map { Color(hex: $0).opacity(isActive ? 0 : 0.4) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: isActive ? 0 : 1
                            )
                    )
                    .shadow(color: Color(hex: colors[0]).opacity(isActive ? 0.5 : 0.2), radius: isActive ? 10 : 6, y: 3)

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(isActive ? .white : Color(hex: colors[0]))
                    .rotationEffect(rotateIcon ? .degrees(45) : .degrees(0))
                    .offset(x: rotateIcon ? -1 : 0, y: rotateIcon ? 1 : 0)
            }
            .scaleEffect(isPressed ? 0.9 : 1)
        }
    }
}

// MARK: - Legacy Support (Message defined in Models.swift, ChatMessage is alias)
struct ConversationOptionButton: View {
    let icon: String
    let color: String
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, action: action) }
}

struct AttachOptionButton: View {
    let icon: String
    let color: String
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, action: action) }
}

struct MessageBubble: View {
    let message: Message
    var body: some View { ThemedMessageBubble(message: message, contactColor: "4ECDC4") }
}

struct ColorfulMessageBubble: View {
    let message: Message
    let contactColor: String
    var body: some View { ThemedMessageBubble(message: message, contactColor: contactColor) }
}

// MARK: - Location Manager
class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((CLLocation?) -> Void)?

    @Published var lastLocation: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestLocation(completion: @escaping (CLLocation?) -> Void) {
        self.completion = completion

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            completion(nil)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        lastLocation = location
        completion?(location)
        completion = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        completion?(nil)
        completion = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        if authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        }
    }
}
