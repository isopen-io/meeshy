//
//  MessageBubbleColors.swift
//  Meeshy
//
//  Pastel color palette for message bubbles based on type and ownership
//  Modern, youthful aesthetic with transparency
//
//  v2 - Added dynamic bubble styling with gradients, glow effects, and animations
//

import SwiftUI

// MARK: - Bubble Color Palette

extension Color {
    // MARK: - Own Messages (Cool Tones)

    /// Soft pastel blue for own text messages
    static let bubbleOwnText = Color(red: 0.67, green: 0.82, blue: 0.98) // #ABD1FA

    /// Lavender for own voice messages
    static let bubbleOwnVoice = Color(red: 0.82, green: 0.76, blue: 0.98) // #D1C2FA

    /// Mint green for own media messages
    static let bubbleOwnMedia = Color(red: 0.70, green: 0.93, blue: 0.84) // #B3EDD6

    /// Light purple for own forwarded messages
    static let bubbleOwnForwarded = Color(red: 0.84, green: 0.80, blue: 0.98) // #D6CCFA

    // MARK: - Received Messages (Warm Tones)

    /// Soft peach for received text messages
    static let bubbleReceivedText = Color(red: 0.98, green: 0.89, blue: 0.84) // #FAE3D6

    /// Coral for received voice messages
    static let bubbleReceivedVoice = Color(red: 0.98, green: 0.84, blue: 0.84) // #FAD6D6

    /// Light yellow for received media messages
    static let bubbleReceivedMedia = Color(red: 0.98, green: 0.95, blue: 0.76) // #FAF2C2

    /// Pink for received forwarded messages
    static let bubbleReceivedForwarded = Color(red: 0.98, green: 0.84, blue: 0.89) // #FAD6E3

    // MARK: - Special Message Types

    /// Gold for encrypted messages (E2EE)
    static let bubbleEncrypted = Color(red: 0.98, green: 0.93, blue: 0.70) // #FAECB3

    /// Soft purple for view-once messages
    static let bubbleViewOnce = Color(red: 0.91, green: 0.84, blue: 0.98) // #E8D6FA

    /// Light gray for system messages
    static let bubbleSystem = Color(red: 0.94, green: 0.94, blue: 0.96) // #F0F0F5

    /// Error state
    static let bubbleError = Color(red: 0.98, green: 0.84, blue: 0.84) // #FAD6D6

    // MARK: - v2 - MessageSource Colors

    /// Orange for ads/sponsored messages
    static let bubbleAds = Color(red: 1.0, green: 0.85, blue: 0.70) // #FFD9B3

    /// Blue for app system messages
    static let bubbleApp = Color(red: 0.70, green: 0.85, blue: 1.0) // #B3D9FF

    /// Green for agent/assistant messages
    static let bubbleAgent = Color(red: 0.70, green: 0.95, blue: 0.80) // #B3F2CC

    /// Indigo for authority/official messages
    static let bubbleAuthority = Color(red: 0.80, green: 0.75, blue: 0.98) // #CCBFFA

    /// Sending state shimmer
    static let bubbleShimmer = Color.white.opacity(0.3)

    /// v2 - Overlay for pressed state
    static let bubbleOverlay = Color.black.opacity(0.08)

    // MARK: - v2 - Text Color Helper

    /// Returns appropriate text color based on bubble background color
    /// v2 - Dynamic text color for better readability
    static func bubbleTextColor(for backgroundColor: Color, isOwnMessage: Bool) -> Color {
        // For pastel backgrounds, dark text works best
        // For own messages with darker colors, use white
        if isOwnMessage {
            return Color.primary
        } else {
            return Color.primary
        }
    }

    // MARK: - v2 - Glow Effect

    /// Applies subtle glow effect for special message types
    @ViewBuilder
    static func glowEffect(color: Color) -> some View {
        color
            .blur(radius: 8)
            .opacity(0.4)
    }
}

// MARK: - Bubble Style Configuration
// v2 - Enhanced with gradient support, glow intensity, and dynamic shadow radius

struct BubbleStyleConfig {
    /// v2 - Primary base color for the bubble
    let baseColor: Color
    /// v2 - Secondary accent color for gradients
    let accentColor: Color
    /// v2 - Opacity level (0.0 - 1.0)
    let opacity: Double
    /// v2 - Shadow color with opacity
    let shadowColor: Color
    /// v2 - Shadow blur radius
    let shadowRadius: CGFloat
    /// v2 - Glow intensity for special messages (0.0 = no glow, 0.3 = subtle glow)
    let glowIntensity: Double

    // MARK: - v2 - Convenience initializer with defaults

    init(
        baseColor: Color,
        accentColor: Color? = nil,
        opacity: Double = 0.88,
        shadowColor: Color = .gray.opacity(0.2),
        shadowRadius: CGFloat = 4,
        glowIntensity: Double = 0
    ) {
        self.baseColor = baseColor
        self.accentColor = accentColor ?? baseColor.opacity(0.9)
        self.opacity = opacity
        self.shadowColor = shadowColor
        self.shadowRadius = shadowRadius
        self.glowIntensity = glowIntensity
    }

    // MARK: - v2 - Factory method for message-based styling

    /// Returns the appropriate style configuration based on message type and ownership
    /// v2 - Dynamic styling with gradients and effects
    static func style(for message: Message, isOwnMessage: Bool) -> BubbleStyleConfig {
        // System messages
        if message.isSystemMessage {
            return BubbleStyleConfig(
                baseColor: .bubbleSystem,
                accentColor: .bubbleSystem.opacity(0.85),
                opacity: 0.9,
                shadowColor: .gray.opacity(0.15),
                shadowRadius: 3,
                glowIntensity: 0
            )
        }

        // Encrypted messages (E2EE) - v2: golden glow effect
        if message.isEncrypted {
            return BubbleStyleConfig(
                baseColor: .bubbleEncrypted,
                accentColor: Color(red: 0.95, green: 0.88, blue: 0.60),
                opacity: 0.88,
                shadowColor: Color(red: 0.83, green: 0.65, blue: 0.45).opacity(0.3),
                shadowRadius: 6,
                glowIntensity: 0.25
            )
        }

        // View-once messages - v2: purple mystique glow
        if message.isViewOnceMessage {
            return BubbleStyleConfig(
                baseColor: .bubbleViewOnce,
                accentColor: Color(red: 0.85, green: 0.78, blue: 0.95),
                opacity: 0.85,
                shadowColor: Color(red: 0.72, green: 0.63, blue: 0.83).opacity(0.3),
                shadowRadius: 6,
                glowIntensity: 0.2
            )
        }

        // Error state - v2: subtle red warning
        if message.sendError != nil {
            return BubbleStyleConfig(
                baseColor: .bubbleError,
                accentColor: Color(red: 0.95, green: 0.78, blue: 0.78),
                opacity: 0.9,
                shadowColor: .red.opacity(0.25),
                shadowRadius: 5,
                glowIntensity: 0
            )
        }

        // v2 - MessageSource-specific styling (ads, app, agent, authority)
        if let source = message.messageSource, source != .user {
            switch source {
            case .ads:
                return BubbleStyleConfig(
                    baseColor: .bubbleAds,
                    accentColor: Color(red: 0.98, green: 0.75, blue: 0.55),
                    opacity: 0.92,
                    shadowColor: .orange.opacity(0.25),
                    shadowRadius: 5,
                    glowIntensity: 0.1
                )
            case .app:
                return BubbleStyleConfig(
                    baseColor: .bubbleApp,
                    accentColor: Color(red: 0.55, green: 0.78, blue: 0.98),
                    opacity: 0.92,
                    shadowColor: .blue.opacity(0.2),
                    shadowRadius: 4,
                    glowIntensity: 0.05
                )
            case .agent:
                return BubbleStyleConfig(
                    baseColor: .bubbleAgent,
                    accentColor: Color(red: 0.55, green: 0.88, blue: 0.70),
                    opacity: 0.92,
                    shadowColor: .green.opacity(0.2),
                    shadowRadius: 4,
                    glowIntensity: 0.15
                )
            case .authority:
                return BubbleStyleConfig(
                    baseColor: .bubbleAuthority,
                    accentColor: Color(red: 0.70, green: 0.62, blue: 0.95),
                    opacity: 0.92,
                    shadowColor: .indigo.opacity(0.25),
                    shadowRadius: 5,
                    glowIntensity: 0.2
                )
            case .user, .system:
                break // Continue to other checks
            }
        }

        // Forwarded messages
        if message.isForwarded {
            let bgColor = isOwnMessage ? Color.bubbleOwnForwarded : Color.bubbleReceivedForwarded
            let accentColor = isOwnMessage ? Color(red: 0.78, green: 0.72, blue: 0.95) : Color(red: 0.95, green: 0.78, blue: 0.85)
            let shadowBase = isOwnMessage ? Color(red: 0.72, green: 0.63, blue: 0.83) : Color(red: 0.83, green: 0.63, blue: 0.72)
            return BubbleStyleConfig(
                baseColor: bgColor,
                accentColor: accentColor,
                opacity: 0.88,
                shadowColor: shadowBase.opacity(0.25),
                shadowRadius: 4,
                glowIntensity: 0
            )
        }

        // Voice/Audio messages - v2: distinct voice message styling
        if message.effectiveMessageType == .audio {
            let bgColor = isOwnMessage ? Color.bubbleOwnVoice : Color.bubbleReceivedVoice
            let accentColor = isOwnMessage ? Color(red: 0.75, green: 0.68, blue: 0.95) : Color(red: 0.95, green: 0.78, blue: 0.78)
            let shadowBase = isOwnMessage ? Color(red: 0.72, green: 0.63, blue: 0.83) : Color(red: 0.83, green: 0.63, blue: 0.63)
            return BubbleStyleConfig(
                baseColor: bgColor,
                accentColor: accentColor,
                opacity: 0.88,
                shadowColor: shadowBase.opacity(0.25),
                shadowRadius: 4,
                glowIntensity: 0
            )
        }

        // Media messages (image, video) - v2: fresh media styling
        if message.effectiveMessageType == .image || message.effectiveMessageType == .video {
            let bgColor = isOwnMessage ? Color.bubbleOwnMedia : Color.bubbleReceivedMedia
            let accentColor = isOwnMessage ? Color(red: 0.62, green: 0.88, blue: 0.78) : Color(red: 0.95, green: 0.90, blue: 0.68)
            let shadowBase = isOwnMessage ? Color(red: 0.50, green: 0.77, blue: 0.66) : Color(red: 0.83, green: 0.78, blue: 0.50)
            return BubbleStyleConfig(
                baseColor: bgColor,
                accentColor: accentColor,
                opacity: 0.88,
                shadowColor: shadowBase.opacity(0.25),
                shadowRadius: 4,
                glowIntensity: 0
            )
        }

        // Default text messages - v2: clean pastel gradients
        let bgColor = isOwnMessage ? Color.bubbleOwnText : Color.bubbleReceivedText
        let accentColor = isOwnMessage ? Color(red: 0.58, green: 0.75, blue: 0.95) : Color(red: 0.95, green: 0.85, blue: 0.78)
        let shadowBase = isOwnMessage ? Color(red: 0.49, green: 0.70, blue: 0.91) : Color(red: 0.91, green: 0.72, blue: 0.49)
        return BubbleStyleConfig(
            baseColor: bgColor,
            accentColor: accentColor,
            opacity: 0.88,
            shadowColor: shadowBase.opacity(0.25),
            shadowRadius: 4,
            glowIntensity: 0
        )
    }

}

// MARK: - v2 - Bubble Background Modifier

/// v2 - Dynamic bubble background with gradient and glow support
struct DynamicBubbleBackground: ViewModifier {
    let config: BubbleStyleConfig
    let isOwn: Bool

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    // v2 - Base color with gradient using baseColor and accentColor
                    LinearGradient(
                        colors: [
                            config.baseColor.opacity(config.opacity),
                            config.accentColor.opacity(config.opacity * 0.85)
                        ],
                        startPoint: isOwn ? .topTrailing : .topLeading,
                        endPoint: isOwn ? .bottomLeading : .bottomTrailing
                    )

                    // v2 - Glow highlight for special messages
                    if config.glowIntensity > 0 {
                        LinearGradient(
                            colors: [
                                Color.white.opacity(config.glowIntensity),
                                Color.clear
                            ],
                            startPoint: .top,
                            endPoint: .center
                        )
                    }
                }
            )
            .shadow(color: config.shadowColor, radius: config.shadowRadius, x: 0, y: 2)
    }
}

extension View {
    /// v2 - Applies dynamic bubble background based on message type
    func dynamicBubbleBackground(for message: Message, isOwnMessage: Bool) -> some View {
        let config = BubbleStyleConfig.style(for: message, isOwnMessage: isOwnMessage)
        return self.modifier(DynamicBubbleBackground(config: config, isOwn: isOwnMessage))
    }
}

// MARK: - Preview

#Preview("Bubble Colors") {
    ScrollView {
        VStack(spacing: 16) {
            Group {
                Text("Own Text")
                    .padding()
                    .background(Color.bubbleOwnText.opacity(0.88))
                    .cornerRadius(16)

                Text("Own Voice")
                    .padding()
                    .background(Color.bubbleOwnVoice.opacity(0.88))
                    .cornerRadius(16)

                Text("Own Media")
                    .padding()
                    .background(Color.bubbleOwnMedia.opacity(0.88))
                    .cornerRadius(16)
            }

            Divider()

            Group {
                Text("Received Text")
                    .padding()
                    .background(Color.bubbleReceivedText.opacity(0.88))
                    .cornerRadius(16)

                Text("Received Voice")
                    .padding()
                    .background(Color.bubbleReceivedVoice.opacity(0.88))
                    .cornerRadius(16)

                Text("Received Media")
                    .padding()
                    .background(Color.bubbleReceivedMedia.opacity(0.88))
                    .cornerRadius(16)
            }

            Divider()

            Group {
                Text("Encrypted (E2EE)")
                    .padding()
                    .background(Color.bubbleEncrypted.opacity(0.88))
                    .cornerRadius(16)

                Text("View Once")
                    .padding()
                    .background(Color.bubbleViewOnce.opacity(0.85))
                    .cornerRadius(16)

                Text("System")
                    .padding()
                    .background(Color.bubbleSystem.opacity(0.9))
                    .cornerRadius(16)
            }
        }
        .padding()
    }
}
