import SwiftUI
import MeeshySDK
import MeeshyUI

/// #10006 — l'entrée SANS COMPTE dans World Wide (planche « Onboarding ») :
/// « Comment doit-on vous appeler ? » → « Bonjour …, vous lirez tout en… » →
/// le fil. La troisième étape EST la conversation : l'hôte la monte dès que la
/// session arrive (`GuestConversationContainer`).
struct WorldGuestEntryView: View {
    @StateObject private var viewModel: WorldGuestEntryViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var nameFocused: Bool

    let onEntered: (AnonymousSessionContext) -> Void

    init(entry: WorldEntry?, onEntered: @escaping (AnonymousSessionContext) -> Void) {
        _viewModel = StateObject(wrappedValue: WorldGuestEntryViewModel(initialEntry: entry))
        self.onEntered = onEntered
    }

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        ZStack {
            background
            VStack(spacing: 0) {
                topBar
                content
            }
        }
        .task {
            if let resumed = await viewModel.load() {
                onEntered(resumed)
            }
        }
    }

    // MARK: - Fond

    private var background: some View {
        ZStack {
            theme.backgroundPrimary
            RadialGradient(
                colors: [MeeshyColors.indigo500.opacity(isDark ? 0.18 : 0.10), MeeshyColors.indigo500.opacity(0)],
                center: UnitPoint(x: 0.5, y: 0.2),
                startRadius: 0,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - Barre du haut : retour + étapes

    private var topBar: some View {
        HStack {
            Button {
                HapticFeedback.light()
                if viewModel.step == .language {
                    withAnimation(stepAnimation) { viewModel.back() }
                } else {
                    dismiss()
                }
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .meeshyTapTarget()
            }
            .accessibilityLabel(viewModel.step == .language ? WorldGuestEntryCopy.back : WorldGuestEntryCopy.close)

            Spacer()

            HStack(spacing: MeeshySpacing.xsPlus) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index <= viewModel.step.rawValue ? MeeshyColors.indigo500 : MeeshyColors.indigo300.opacity(0.25))
                        .frame(width: 24, height: 4)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(WorldGuestEntryCopy.step(viewModel.step.rawValue + 1, of: 3))

            Spacer()

            Color.clear.frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Étapes

    private var stepAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.9)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.availability {
        case .unavailable:
            unavailableState
        case .checking:
            ProgressView()
                .tint(MeeshyColors.indigo400)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .open:
            ZStack {
                switch viewModel.step {
                case .name:
                    nameStep
                        .transition(.asymmetric(insertion: .move(edge: .leading), removal: .move(edge: .leading)))
                case .language:
                    languageStep
                        .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .trailing)))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
    }

    private var nameStep: some View {
        VStack(spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                .fill(MeeshyColors.brandGradient)
                .frame(width: 100, height: 100)
                .overlay(
                    Image(systemName: "globe")
                        .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .light))
                        .foregroundColor(.white)
                )
                .shadow(color: .black.opacity(isDark ? 0.5 : 0.15), radius: 10, x: 0, y: 6)
                .accessibilityHidden(true)

            Text(verbatim: viewModel.worldTitle)
                .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .bold))
                .foregroundStyle(
                    LinearGradient(colors: [MeeshyColors.indigo400, MeeshyColors.indigo500], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .padding(.top, MeeshySpacing.md)
                .accessibilityAddTraits(.isHeader)

            Text(WorldGuestEntryCopy.namePrompt)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                Text(WorldGuestEntryCopy.nameLabel)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .foregroundColor(theme.textMuted)
                TextField(WorldGuestEntryCopy.namePlaceholder, text: $viewModel.name)
                    .focused($nameFocused)
                    .textContentType(.name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.continue)
                    .onSubmit(advance)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize))
                    .foregroundColor(theme.textPrimary)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .frame(minHeight: 48)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.inputBackground))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).strokeBorder(MeeshyColors.indigo500, lineWidth: 2))
                    .accessibilityLabel(WorldGuestEntryCopy.nameLabel)
            }
            .padding(.top, MeeshySpacing.lg)

            Spacer(minLength: MeeshySpacing.lg)

            primaryButton(WorldGuestEntryCopy.continueAction, isEnabled: viewModel.canContinue, isBusy: false, action: advance)
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .padding(.top, MeeshySpacing.xxxl)
        .padding(.bottom, MeeshySpacing.xxxl)
        .onAppear { nameFocused = viewModel.name.isEmpty }
    }

    private var languageStep: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                    Text(WorldGuestEntryCopy.greeting(viewModel.trimmedName))
                        .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)

                    Text(WorldGuestEntryCopy.languageHint)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize))
                        .foregroundColor(theme.textSecondary)

                    languageList
                        .padding(.top, MeeshySpacing.sm)

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                            .foregroundColor(MeeshyColors.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, MeeshySpacing.xs)
                    }
                }
                .padding(.top, MeeshySpacing.xl)
            }

            primaryButton(
                WorldGuestEntryCopy.enterTitle(viewModel.worldTitle),
                isEnabled: viewModel.canContinue,
                isBusy: viewModel.isEntering,
                action: enter
            )
        }
        .padding(.horizontal, MeeshySpacing.xxl)
        .padding(.bottom, MeeshySpacing.xxxl)
    }

    private var languageList: some View {
        VStack(spacing: 0) {
            ForEach(viewModel.languages) { language in
                languageRow(language)
                if language.id != viewModel.languages.last?.id {
                    Divider().opacity(0.4)
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg).fill(theme.backgroundSecondary))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(WorldGuestEntryCopy.languageGroup)
    }

    private func languageRow(_ language: WorldGuestLanguage) -> some View {
        let isSelected = viewModel.language == language.code
        return Button {
            HapticFeedback.light()
            viewModel.language = language.code
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Text(verbatim: language.endonym)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Text(verbatim: language.code.uppercased())
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .bold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: 50)
            .background(isSelected ? MeeshyColors.indigo500.opacity(0.14) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var unavailableState: some View {
        VStack(spacing: MeeshySpacing.xl) {
            Spacer()
            Image(systemName: "globe")
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .light))
                .foregroundColor(MeeshyColors.indigo400)
                .accessibilityHidden(true)
            Text(WorldGuestEntryCopy.unavailable)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxxl)
            Button(WorldGuestEntryCopy.close) { dismiss() }
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .meeshyTapTarget()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Bouton principal (52 pt, rayon 14 — planche)

    private func primaryButton(_ title: String, isEnabled: Bool, isBusy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                if isBusy {
                    ProgressView().tint(.white)
                } else {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(MeeshyColors.brandGradient)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
            .opacity(isEnabled ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isBusy)
    }

    // MARK: - Actions

    private func advance() {
        guard viewModel.canContinue else { return }
        HapticFeedback.light()
        nameFocused = false
        withAnimation(stepAnimation) { viewModel.continueToLanguage() }
    }

    private func enter() {
        Task {
            guard let context = await viewModel.enter() else {
                HapticFeedback.error()
                return
            }
            HapticFeedback.success()
            onEntered(context)
        }
    }
}
