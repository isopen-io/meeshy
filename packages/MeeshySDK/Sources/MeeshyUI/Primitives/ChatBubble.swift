import SwiftUI
import Combine
import MeeshySDK

public struct ChatBubble: View {
    public let text: String
    public let isMe: Bool
    public var index: Int = 0
    public var animateEntrance: Bool = true
    public var contactColor: String = MeeshyColors.brandPrimaryHex

    @State private var isVisible = false
    @State private var isPressed = false
    // Leaf cell — do not observe the ThemeManager singleton (every published
    // change would re-render every bubble). Dark/light is read reactively from
    // the environment (driven by the app-root `.preferredColorScheme`), and the
    // singleton is accessed non-observingly for its derived colors.
    @Environment(\.colorScheme) private var colorScheme

    private var theme: ThemeManager { ThemeManager.shared }
    private var isDark: Bool { colorScheme == .dark }

    public init(text: String, isMe: Bool, index: Int = 0, animateEntrance: Bool = true, contactColor: String = MeeshyColors.brandPrimaryHex) {
        self.text = text; self.isMe = isMe; self.index = index; self.animateEntrance = animateEntrance; self.contactColor = contactColor
    }

    public var body: some View {
        bubbleContent
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Text("\(isMe ? String(localized: "a11y.message.is_me", bundle: .main) : String(localized: "a11y.message.not_me", bundle: .main)): \(text)"))
            .opacity(animateEntrance ? (isVisible ? 1 : 0) : 1)
            .offset(x: animateEntrance ? (isVisible ? 0 : (isMe ? 40 : -40)) : 0)
            .scaleEffect(animateEntrance ? (isVisible ? 1 : 0.85) : 1, anchor: isMe ? .bottomTrailing : .bottomLeading)
            .onAppear {
                guard animateEntrance else { return }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.75).delay(Double(index) * MeeshyAnimation.staggerDelay)) {
                    isVisible = true
                }
            }
    }

    private var bubbleContent: some View {
        HStack {
            if isMe { Spacer() }
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .padding()
                .accessibilityLabel(isMe
                    ? String(format: String(localized: "accessibility.message_from_me", defaultValue: "Mon message : %@", bundle: .main), text)
                    : String(format: String(localized: "accessibility.message_from_other", defaultValue: "Message : %@", bundle: .main), text))
                .background(bubbleBackground)
                .foregroundColor(isMe ? .white : theme.textPrimary)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .overlay(bubbleStroke)
                .shadow(
                    color: Color(hex: contactColor).opacity(isMe ? (isDark ? 0.3 : 0.15) : (isDark ? 0.1 : 0.05)),
                    radius: isMe ? 8 : 5,
                    x: 0, y: 3
                )
                .scaleEffect(isPressed ? 0.96 : 1)
                .animation(MeeshyAnimation.springFast, value: isPressed)
                .onLongPressGesture(minimumDuration: 0.5, pressing: { pressing in
                    isPressed = pressing
                }) {
                    HapticFeedback.medium()
                }
            if !isMe { Spacer() }
        }
        .frame(maxWidth: .infinity, alignment: isMe ? .trailing : .leading)
    }

    private var bubbleBackground: some View {
        let accent = Color(hex: contactColor)

        return RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(
                isMe ?
                LinearGradient(
                    colors: [accent, accent.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        accent.opacity(isDark ? 0.35 : 0.25),
                        accent.opacity(isDark ? 0.2 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
    }

    private var bubbleStroke: some View {
        let accent = Color(hex: contactColor)

        return RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .stroke(
                isMe ?
                LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing) :
                LinearGradient(
                    colors: [accent.opacity(isDark ? 0.5 : 0.3), accent.opacity(isDark ? 0.2 : 0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: isMe ? 0 : 1
            )
    }
}
