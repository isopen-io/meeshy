import SwiftUI

struct MessageComposer: View {
    @Binding var text: String
    @FocusState.Binding var isFocused: Bool
    let onSend: () -> Void

    @State private var textHeight: CGFloat = 40
    @State private var attachRotation: Double = 0
    @State private var sendBounce: Bool = false
    @State private var glowPhase: CGFloat = 0
    @State private var focusBounce: Bool = false
    @StateObject private var textAnalyzer = TextAnalyzer()

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Attach button
            attachButton

            // Text field
            textInputField

            // Smart Context / Send / Voice button
            actionButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(composerBackground)
        .onChange(of: text) { _, newText in
            textAnalyzer.analyze(text: newText)
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(analyzer: textAnalyzer)
        }
        .onChange(of: isFocused) { _, newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                focusBounce = newValue
            }
        }
    }

    private var attachButton: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                attachRotation += 90
            }
        }) {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))
                .rotationEffect(.degrees(attachRotation))
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
                            focusBounce ?
                            LinearGradient(colors: [Color(hex: "08D9D6").opacity(0.5), Color(hex: "FF2E63").opacity(0.5)], startPoint: .leading, endPoint: .trailing) :
                                LinearGradient(colors: [Color.white.opacity(0.15), Color.white.opacity(0.1)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: focusBounce ? 1.5 : 1
                        )
                )
                .shadow(color: focusBounce ? Color(hex: "08D9D6").opacity(0.2) : Color.clear, radius: 8, x: 0, y: 0)
        )
        .scaleEffect(focusBounce ? 1.02 : 1.0)
    }

    @ViewBuilder
    private var actionButton: some View {
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        if hasText {
            // Send button with sentiment/language badges
            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                    sendBounce = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    sendBounce = false
                    onSend()
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                        .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: sendBounce ? 12 : 8, x: 0, y: 4)

                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .rotationEffect(.degrees(sendBounce ? 55 : 45))
                        .offset(x: sendBounce ? 2 : -1, y: sendBounce ? -2 : 1)

                    // Sentiment badge (top-right)
                    Text(textAnalyzer.sentiment.emoji)
                        .font(.system(size: 12))
                        .offset(x: 16, y: -16)
                        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: textAnalyzer.sentiment)

                    // Language flag badge (bottom-right, after 20+ chars)
                    if text.count > 20, let lang = textAnalyzer.displayLanguage {
                        Text(lang.flag)
                            .font(.system(size: 10))
                            .offset(x: 16, y: 16)
                            .transition(.scale.combined(with: .opacity))
                            .onTapGesture {
                                textAnalyzer.showLanguagePicker = true
                            }
                    }
                }
                .scaleEffect(sendBounce ? 1.2 : 1)
            }
            .frame(width: 44, height: 44)
            .transition(.scale.combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasText)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: sendBounce)
        } else {
            // Voice button
            Button {
                let impact = UIImpactFeedbackGenerator(style: .light)
                impact.impactOccurred()
            } label: {
                ZStack {
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
            .transition(.scale.combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasText)
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
