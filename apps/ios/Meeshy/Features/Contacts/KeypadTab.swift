import SwiftUI
import MeeshySDK
import MeeshyUI

/// People hub **Keypad** tab: a dial pad that finds a person by phone number
/// or by name. Reuses the existing phone-lookup and user-search endpoints via
/// `KeypadViewModel`. Tapping a result opens that person's profile (where the
/// call/message actions live).
struct KeypadTab: View {
    @ObservedObject var viewModel: KeypadViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router

    private let keys: [[KeypadKey]] = [
        [.init("1", ""), .init("2", "ABC"), .init("3", "DEF")],
        [.init("4", "GHI"), .init("5", "JKL"), .init("6", "MNO")],
        [.init("7", "PQRS"), .init("8", "TUV"), .init("9", "WXYZ")],
        [.init("+", ""), .init("0", ""), .init("#", "")],
    ]

    var body: some View {
        VStack(spacing: 0) {
            inputBar
            results
            keypad
        }
        .adaptiveOnChange(of: viewModel.input) { _, _ in
            viewModel.scheduleSearch()
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField(
                String(localized: "keypad.input.placeholder", defaultValue: "Numero ou nom", bundle: .main),
                text: $viewModel.input
            )
            .font(.system(size: 26, weight: .medium, design: .rounded))
            .foregroundColor(theme.textPrimary)
            .multilineTextAlignment(.center)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .accessibilityLabel(String(localized: "keypad.input.a11y", defaultValue: "Champ numero ou nom", bundle: .main))

            if !viewModel.input.isEmpty {
                Button {
                    viewModel.deleteLast()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "delete.left.fill")
                        .font(.title3)
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "keypad.delete.a11y", defaultValue: "Effacer", bundle: .main))
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.4).onEnded { _ in
                        viewModel.clear()
                        HapticFeedback.medium()
                    }
                )
            }
        }
        .padding(.horizontal, 24)
        .frame(height: 64)
        .overlay(alignment: .bottom) { Divider().opacity(0.2) }
    }

    // MARK: - Results

    @ViewBuilder
    private var results: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            if viewModel.matches.isEmpty {
                hint
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.matches) { user in
                        resultRow(user)
                    }
                }
                .padding(.top, 6)
            }
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
    }

    @ViewBuilder
    private var hint: some View {
        if viewModel.loadState == .loading {
            ProgressView()
                .tint(MeeshyColors.indigo500)
                .padding(.top, 28)
        } else if !viewModel.input.isEmpty {
            VStack(spacing: 6) {
                Text(String(localized: "keypad.no-match.title", defaultValue: "Aucun contact trouve", bundle: .main))
                    .font(.callout.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "keypad.no-match.subtitle", defaultValue: "Composez un numero ou tapez un nom pour rechercher.", bundle: .main))
                    .font(.footnote)
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            .padding(.top, 24)
        } else {
            EmptyView()
        }
    }

    private func resultRow(_ user: UserSearchResult) -> some View {
        let name = user.displayName ?? user.username
        let color = DynamicColorGenerator.colorForName(name)
        let isOnline = user.isOnline ?? false

        return Button {
            router.deepLinkProfileUser = ProfileSheetUser(username: user.username)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 14) {
                MeeshyAvatar(
                    name: name,
                    context: .userListItem,
                    accentColor: color,
                    avatarURL: user.avatar,
                    presenceState: isOnline ? .online : .offline
                )
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    Text("@\(user.username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted.opacity(0.5))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(name)
    }

    // MARK: - Keypad

    private var keypad: some View {
        VStack(spacing: 14) {
            ForEach(keys.indices, id: \.self) { row in
                HStack(spacing: 28) {
                    ForEach(keys[row]) { key in
                        keyButton(key)
                    }
                }
            }
        }
        .padding(.vertical, 18)
        .overlay(alignment: .top) { Divider().opacity(0.2) }
    }

    private func keyButton(_ key: KeypadKey) -> some View {
        Button {
            viewModel.append(key.digit)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 1) {
                Text(key.digit)
                    .font(.system(size: 30, weight: .regular, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                Text(key.letters)
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1)
                    .foregroundColor(theme.textMuted)
                    .frame(height: 10)
            }
            .frame(width: 72, height: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(key.digit)
    }
}

// MARK: - Key model

private struct KeypadKey: Identifiable {
    let digit: String
    let letters: String
    var id: String { digit }
    init(_ digit: String, _ letters: String) {
        self.digit = digit
        self.letters = letters
    }
}
