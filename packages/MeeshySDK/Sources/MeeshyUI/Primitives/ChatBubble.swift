import SwiftUI

public struct ChatBubble: View {
    public let text: String
    public let isMe: Bool
    public var index: Int = 0
    public var animateEntrance: Bool = true
    public var contactColor: String = "FF2E63"

    @State private var isVisible = false
    @State private var isPressed = false
    @ObservedObject private var theme = ThemeManager.shared

    private var isDark: Bool { theme.mode.isDark }

    public init(text: String, isMe: Bool, index: Int = 0, animateEntrance: Bool = true, contactColor: String = "FF2E63") {
        self.text = text; self.isMe = isMe; self.index = index; self.animateEntrance = animateEntrance; self.contactColor = contactColor
    }

    public var body: some View {
        bubbleContent
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
                .padding()
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
