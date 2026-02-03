import SwiftUI

struct ChatBubble: View {
    let text: String
    let isMe: Bool
    
    var body: some View {
        bubbleContent
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
                .shadow(color: Color.black.opacity(0.1), radius: 5, x: 0, y: 2)
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
            .stroke(Color.white.opacity(0.3), lineWidth: 0.5)
    }
}
