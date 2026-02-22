import SwiftUI

public struct ChatBubble: View {
    public let text: String
    public let isMe: Bool
    public var index: Int = 0
    public var animateEntrance: Bool = true

    @State private var isVisible = false
    @State private var isPressed = false

    public init(text: String, isMe: Bool, index: Int = 0, animateEntrance: Bool = true) {
        self.text = text; self.isMe = isMe; self.index = index; self.animateEntrance = animateEntrance
    }

    public var body: some View {
        bubbleContent
            .opacity(animateEntrance ? (isVisible ? 1 : 0) : 1)
            .offset(x: animateEntrance ? (isVisible ? 0 : (isMe ? 40 : -40)) : 0)
            .scaleEffect(animateEntrance ? (isVisible ? 1 : 0.85) : 1, anchor: isMe ? .bottomTrailing : .bottomLeading)
            .onAppear {
                guard animateEntrance else { return }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.75).delay(Double(index) * 0.04)) {
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
                .foregroundColor(.white)
                .cornerRadius(20)
                .overlay(bubbleStroke)
                .shadow(color: (isMe ? Color(hex: "FF2E63") : Color.black).opacity(0.15), radius: isMe ? 8 : 5, x: 0, y: 3)
                .scaleEffect(isPressed ? 0.96 : 1)
                .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
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
        ZStack {
            if isMe {
                MeeshyColors.primaryGradient.opacity(0.9)
            } else {
                Color.white.opacity(0.15)
            }
            Color.clear.background(.ultraThinMaterial)
        }
    }

    private var bubbleStroke: some View {
        RoundedRectangle(cornerRadius: 20)
            .stroke(
                isMe ?
                LinearGradient(colors: [Color.white.opacity(0.4), Color.white.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing) :
                    LinearGradient(colors: [Color.white.opacity(0.3), Color.white.opacity(0.1)], startPoint: .top, endPoint: .bottom),
                lineWidth: 0.5
            )
    }
}
