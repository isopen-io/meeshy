import SwiftUI

struct MessageComposer: View {
    @Binding var text: String
    @FocusState.Binding var isFocused: Bool
    let onSend: () -> Void

    @State private var textHeight: CGFloat = 40

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Attach button
            attachButton

            // Text field
            textInputField

            // Send / Voice button
            actionButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(composerBackground)
    }

    private var attachButton: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
        }) {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.1))
                        .overlay(
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 1)
                        )
                )
        }
    }

    private var textInputField: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text("Message...")
                    .foregroundColor(.white.opacity(0.4))
                    .padding(.leading, 16)
            }

            TextField("", text: $text, axis: .vertical)
                .focused($isFocused)
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .lineLimit(1...5)
                .font(.system(size: 16))
        }
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            isFocused ?
                            LinearGradient(colors: [Color(hex: "08D9D6").opacity(0.5), Color(hex: "FF2E63").opacity(0.5)], startPoint: .leading, endPoint: .trailing) :
                                LinearGradient(colors: [Color.white.opacity(0.15), Color.white.opacity(0.1)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: 1
                        )
                )
        )
    }

    @ViewBuilder
    private var actionButton: some View {
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        Button(action: {
            if hasText {
                onSend()
            } else {
                // Voice message action
                let impact = UIImpactFeedbackGenerator(style: .light)
                impact.impactOccurred()
            }
        }) {
            ZStack {
                if hasText {
                    // Send button with gradient
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                        .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 8, x: 0, y: 4)

                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .rotationEffect(.degrees(45))
                        .offset(x: -1, y: 1)
                } else {
                    // Voice button
                    Circle()
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 44, height: 44)
                        .overlay(
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 1)
                        )

                    Image(systemName: "mic.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasText)
        }
    }

    private var composerBackground: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .overlay(
                Rectangle()
                    .fill(Color.black.opacity(0.3))
            )
            .overlay(
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Color.white.opacity(0.1), Color.clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(height: 1),
                alignment: .top
            )
            .shadow(color: Color.black.opacity(0.2), radius: 15, x: 0, y: -5)
    }
}
