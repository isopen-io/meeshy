//
//  KeyboardManager.swift
//  Meeshy
//
//  Manages keyboard appearance, height, and scroll behavior
//  iOS 16+
//

import SwiftUI
import Combine

@MainActor
final class KeyboardManager: ObservableObject {
    // MARK: - Published Properties

    @Published var keyboardHeight: CGFloat = 0
    @Published var isKeyboardVisible: Bool = false

    // MARK: - Private Properties

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Singleton

    static let shared = KeyboardManager()

    // MARK: - Initialization

    init() {
        setupKeyboardNotifications()
    }

    // MARK: - Setup Notifications

    private func setupKeyboardNotifications() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .compactMap { notification -> CGFloat? in
                guard let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
                    return nil
                }
                return keyboardFrame.height
            }
            .sink { [weak self] height in
                withAnimation(.easeOut(duration: 0.25)) {
                    self?.keyboardHeight = height
                    self?.isKeyboardVisible = true
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .sink { [weak self] _ in
                withAnimation(.easeOut(duration: 0.25)) {
                    self?.keyboardHeight = 0
                    self?.isKeyboardVisible = false
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Public Methods

    func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// MARK: - Keyboard Avoiding Modifier

struct KeyboardAvoiding: ViewModifier {
    @StateObject private var keyboardManager = KeyboardManager.shared

    func body(content: Content) -> some View {
        content
            .padding(.bottom, keyboardManager.keyboardHeight)
            .animation(.easeOut(duration: 0.25), value: keyboardManager.keyboardHeight)
    }
}

extension View {
    func keyboardAvoiding() -> some View {
        modifier(KeyboardAvoiding())
    }
}

// MARK: - Keyboard Toolbar

struct KeyboardToolbar: ViewModifier {
    @StateObject private var keyboardManager = KeyboardManager.shared
    let content: () -> AnyView

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    self.content()
                }
            }
    }
}

extension View {
    func keyboardToolbar<Content: View>(@ViewBuilder content: @escaping () -> Content) -> some View {
        modifier(KeyboardToolbar(content: { AnyView(content()) }))
    }
}

// MARK: - Dismiss Keyboard on Tap

struct DismissKeyboardOnTap: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onTapGesture {
                KeyboardManager.shared.dismissKeyboard()
            }
    }
}

extension View {
    func dismissKeyboardOnTap() -> some View {
        modifier(DismissKeyboardOnTap())
    }
}

// MARK: - Keyboard Height Preference Key

struct KeyboardHeightPreferenceKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Keyboard Scroll Manager

final class KeyboardScrollManager {
    struct UncheckedProxy: @unchecked Sendable {
        let proxy: ScrollViewProxy
    }

    static func scrollToBottom(with proxy: ScrollViewProxy, messageId: String, delay: Double = 0.1) {
        let uncheckedProxy = UncheckedProxy(proxy: proxy)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.easeOut(duration: 0.3)) {
                uncheckedProxy.proxy.scrollTo(messageId, anchor: .bottom)
            }
        }
    }

    static func scrollToMessage(with proxy: ScrollViewProxy, messageId: String, anchor: UnitPoint = .center) {
        withAnimation(.easeInOut(duration: 0.3)) {
            proxy.scrollTo(messageId, anchor: anchor)
        }
    }
}

// MARK: - Keyboard Responsive Text Editor

struct KeyboardResponsiveTextEditor: View {
    @Binding var text: String
    let placeholder: String
    let minHeight: CGFloat
    let maxHeight: CGFloat
    let onCommit: () -> Void

    @State private var textEditorHeight: CGFloat = 50
    @FocusState private var isFocused: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.system(size: 17))
                    .foregroundColor(.secondary)
                    .padding(.leading, 16)
                    .padding(.top, 15)
                    .allowsHitTesting(false)
            }

            TextEditor(text: $text)
                .font(.system(size: 17))
                .foregroundColor(.primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .frame(minHeight: minHeight, maxHeight: min(textEditorHeight, maxHeight))
                .focused($isFocused)
                .onChange(of: text) { _ in
                    updateHeight()
                }
        }
        .background(Color(.systemGray6))
        .cornerRadius(24)
    }

    private func updateHeight() {
        let size = CGSize(width: UIScreen.main.bounds.width - 120, height: .infinity)
        let estimatedSize = text.boundingRect(
            with: size,
            options: .usesLineFragmentOrigin,
            attributes: [.font: UIFont.systemFont(ofSize: 17)],
            context: nil
        )

        let newHeight = min(max(estimatedSize.height + 30, minHeight), maxHeight)
        if abs(newHeight - textEditorHeight) > 5 {
            textEditorHeight = newHeight
        }
    }
}

// MARK: - Keyboard Adaptive Spacer

struct KeyboardAdaptiveSpacer: View {
    @StateObject private var keyboardManager = KeyboardManager.shared

    var body: some View {
        Spacer()
            .frame(height: keyboardManager.keyboardHeight)
            .animation(.easeOut(duration: 0.25), value: keyboardManager.keyboardHeight)
    }
}

// MARK: - Usage Examples

struct KeyboardManagerExamples: View {
    @State private var text = ""
    @StateObject private var keyboardManager = KeyboardManager.shared

    var body: some View {
        VStack {
            // Example 1: Simple keyboard avoiding
            TextField("Enter text", text: $text)
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
                .keyboardAvoiding()

            // Example 2: Dismiss keyboard on tap
            ScrollView {
                // Content
            }
            .dismissKeyboardOnTap()

            // Example 3: Keyboard toolbar
            TextField("Message", text: $text)
                .keyboardToolbar {
                    HStack {
                        Button("Bold") {
                            // Add bold formatting
                        }
                        Button("Italic") {
                            // Add italic formatting
                        }
                        Spacer()
                        Button("Done") {
                            KeyboardManager.shared.dismissKeyboard()
                        }
                    }
                }

            // Example 4: Monitor keyboard state
            if keyboardManager.isKeyboardVisible {
                Text("Keyboard is visible")
                Text("Height: \(keyboardManager.keyboardHeight)")
            }
        }
    }
}

// MARK: - Preview

#Preview {
    KeyboardManagerExamples()
}
