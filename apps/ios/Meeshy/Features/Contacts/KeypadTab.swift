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
            .font(MeeshyFont.relative(26, weight: .medium, design: .rounded))
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
                .accessibilityHint(String(localized: "keypad.delete.a11y.hint", defaultValue: "Efface le dernier caractère", bundle: .main))
                .accessibilityAction(named: Text(String(localized: "keypad.clear.a11y", defaultValue: "Tout effacer", bundle: .main))) {
                    viewModel.clear()
                    HapticFeedback.medium()
                }
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
        switch viewModel.loadState {
        case .loading:
            ProgressView()
                .tint(MeeshyColors.indigo500)
                .padding(.top, 28)
        case .loaded:
            // A search actually ran and returned nothing.
            hintMessage(
                title: String(localized: "keypad.no-match.title", defaultValue: "Aucun contact trouve", bundle: .main),
                subtitle: String(localized: "keypad.no-match.subtitle", defaultValue: "Verifiez le numero ou le nom saisi.", bundle: .main)
            )
        default:
            // Idle / too-short / error: prompt without falsely claiming a
            // completed search found nothing.
            hintMessage(
                title: String(localized: "keypad.prompt.title", defaultValue: "Composez un numero ou un nom", bundle: .main),
                subtitle: String(localized: "keypad.prompt.subtitle", defaultValue: "Trouvez une personne par numero de telephone ou par nom.", bundle: .main)
            )
        }
    }

    private func hintMessage(title: String, subtitle: String) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
            Text(subtitle)
                .font(.footnote)
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .padding(.top, 24)
    }

    private func resultRow(_ user: UserSearchResult) -> some View {
        let name = user.displayName ?? user.username
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: 14) {
            Button {
                openProfile(user)
            } label: {
                HStack(spacing: 14) {
                    MeeshyAvatar(
                        name: name,
                        context: .userListItem,
                        accentColor: color,
                        avatarURL: user.avatar,
                        presenceState: PresenceManager.shared.resolvedState(userId: user.id, isOnline: user.isOnline)
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
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(name)
            .accessibilityHint(String(localized: "keypad.result.open-profile.a11y", defaultValue: "Ouvre le profil", bundle: .main))

            dialMenu(for: user, displayName: name)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func dialMenu(for user: UserSearchResult, displayName: String) -> some View {
        Menu {
            Button {
                startCall(user, displayName: displayName, isVideo: false)
            } label: {
                Label(String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), systemImage: "phone.fill")
            }
            Button {
                startCall(user, displayName: displayName, isVideo: true)
            } label: {
                Label(String(localized: "call.start.video", defaultValue: "Appel video", bundle: .main), systemImage: "video.fill")
            }
        } label: {
            Image(systemName: "phone.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 40, height: 40)
                .background(Circle().fill(MeeshyColors.indigo500.opacity(0.12)))
        }
        .accessibilityLabel(String(localized: "calls.call", defaultValue: "Appeler", bundle: .main))
    }

    private func startCall(_ user: UserSearchResult, displayName: String, isVideo: Bool) {
        HapticFeedback.medium()
        CallStarter.start(
            userId: user.id,
            displayName: displayName,
            isVideo: isVideo,
            onUnavailable: { openProfile(user) }
        )
    }

    private func openProfile(_ user: UserSearchResult) {
        router.deepLinkProfileUser = ProfileSheetUser(username: user.username)
        HapticFeedback.light()
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
                    // doctrine 82i — chiffre borné par la touche fixe 72×56 du pavé
                    .font(.system(size: 30, weight: .regular, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                Text(key.letters)
                    // doctrine 82i — lettres bornées par la touche fixe 72×56 du pavé
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
