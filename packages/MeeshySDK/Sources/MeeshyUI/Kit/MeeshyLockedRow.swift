import SwiftUI
import MeeshySDK

/// **La rangée verrouillée (K37)** : ce qui est fermé à mon niveau se voit, verrouillé,
/// avec ce qui l'ouvre. Un fantôme : bord pointillé, encre atténuée, cadenas. Il dit le
/// NOM de la chose, ce qui l'ouvre, et propose le geste pour l'obtenir.
///
/// **Rien de vrai derrière le pointillé** : la rangée ne reçoit que trois textes écrits
/// par l'app (un nom, une exigence, un geste) et un glyphe du jeu. Aucune valeur, aucune
/// image, aucun compte ; pas de flou sur un vrai contenu, un flou se capture et se devine.
/// L'app lit la loi d'accès, traduit sa règle en mots, puis pose la rangée.
public struct MeeshyLockedRow: View {
    private let title: String
    private let requirement: String
    private let systemImage: String?
    private let action: MeeshyLockedRowAction?
    private let form: MeeshyLockedRowForm
    private let tint: Color?
    private let isOpen: Bool
    private let isUnlocking: Bool
    private let onUnlocked: (() -> Void)?
    private let onPress: (() -> Void)?
    private let label: String?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }
    @Environment(\.locale) private var locale
    @State private var hasUnlocked = false

    public init(title: String,
                requirement: String,
                systemImage: String? = nil,
                action: MeeshyLockedRowAction? = nil,
                form: MeeshyLockedRowForm = .row,
                tint: Color? = nil,
                isOpen: Bool = false,
                isUnlocking: Bool = false,
                onUnlocked: (() -> Void)? = nil,
                onPress: (() -> Void)? = nil,
                label: String? = nil) {
        self.title = title
        self.requirement = requirement
        self.systemImage = systemImage
        self.action = action
        self.form = form
        self.tint = tint
        self.isOpen = isOpen
        self.isUnlocking = isUnlocking
        self.onUnlocked = onUnlocked
        self.onPress = onPress
        self.label = label
    }

    private var accent: Color { tint ?? .accentColor }
    private var shownOpen: Bool {
        MeeshyLockedRowRecipe.shownOpen(isOpen: isOpen, isUnlocking: isUnlocking, hasPlayed: hasUnlocked)
    }

    public var body: some View {
        let recipe = MeeshyLockedRowRecipe.resolve(form: form, hasAction: action != nil, isPending: action?.isPending ?? false,
                                                   isDone: action?.isDone ?? false, isOpen: shownOpen,
                                                   isPressable: onPress != nil, isPressed: false, isEnabled: isEnabled,
                                                   isUnlocking: isUnlocking, reduceMotion: reduceMotion)
        Group {
            switch form {
            case .row: row(recipe: recipe)
            case .tile: tile(recipe: recipe)
            case .inline: inline(recipe: recipe)
            }
        }
        .task(id: isUnlocking) { await playUnlock(recipe: recipe) }
    }

    private func playUnlock(recipe: MeeshyLockedRowRecipe) async {
        guard isUnlocking else {
            hasUnlocked = false
            return
        }
        guard MeeshyLockedRowRecipe.unlockStep(isUnlocking: isUnlocking, hasPlayed: hasUnlocked) == .play else { return }
        withAnimation(MeeshyMotion.animation(.morph, reduce: reduceMotion)) { hasUnlocked = true }
        do { try await Task.sleep(for: .milliseconds(recipe.unlockFadeMilliseconds)) } catch { return }
        guard !Task.isCancelled else { return }
        onUnlocked?()
    }

    private var spoken: String {
        label ?? MeeshyLockedRowWords.spokenLabel(title: title, requirement: requirement, isOpen: shownOpen, locale: locale)
    }

    // MARK: - Formes

    private func row(recipe: MeeshyLockedRowRecipe) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            reading(recipe: recipe) {
                HStack(spacing: MeeshySpacing.md) {
                    lock(recipe: recipe)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        titleText
                        if !recipe.showsAction { requirementChip }
                    }
                    Spacer(minLength: MeeshySpacing.sm)
                    if recipe.showsAction { requirementChip }
                }
            }
            actionView(recipe: recipe)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: recipe.minimumHeight)
        .background(outline(recipe: recipe))
    }

    private func tile(recipe: MeeshyLockedRowRecipe) -> some View {
        reading(recipe: recipe) {
            VStack(spacing: MeeshySpacing.sm) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .meeshyScaledFont(recipe.thingGlyphSize)
                        .foregroundStyle(Color.secondary)
                }
                titleText
                requirementChip
            }
            .frame(maxWidth: .infinity)
            .padding(MeeshySpacing.lg)
            .overlay(alignment: .topTrailing) { lock(recipe: recipe).padding(MeeshySpacing.md) }
            .background(outline(recipe: recipe))
        }
        .overlay(alignment: .bottom) { actionView(recipe: recipe).padding(.bottom, MeeshySpacing.sm) }
    }

    private func inline(recipe: MeeshyLockedRowRecipe) -> some View {
        reading(recipe: recipe) {
            HStack(spacing: MeeshySpacing.xs) {
                lock(recipe: recipe)
                HStack(spacing: MeeshySpacing.xxs) {
                    Text(verbatim: title).foregroundStyle(Color.secondary)
                    Text(verbatim: "·").foregroundStyle(Color.secondary)
                    Text(verbatim: requirement).foregroundStyle(accent)
                }
                .meeshyScaledFont(MeeshyFont.subheadSize)
                .lineLimit(1)
            }
        }
    }

    // MARK: - Parties

    private var titleText: some View {
        Text(verbatim: title)
            .meeshyScaledFont(MeeshyFont.bodySize, weight: .semibold)
            .foregroundStyle(Color.secondary)
            .lineLimit(2)
    }

    private var requirementChip: some View {
        Text(verbatim: requirement)
            .meeshyScaledFont(MeeshyFont.smallSize, weight: .semibold)
            .foregroundStyle(accent)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xxs)
            .overlay(Capsule().stroke(accent.opacity(MeeshyOpacity.strong), lineWidth: 1))
    }

    @ViewBuilder
    private func lock(recipe: MeeshyLockedRowRecipe) -> some View {
        if recipe.showsLock {
            Image(systemName: "lock.fill")
                .meeshyScaledFont(recipe.lockSize * 0.8)
                .foregroundStyle(Color.secondary)
                .frame(width: recipe.lockSize, height: recipe.lockSize)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func outline(recipe: MeeshyLockedRowRecipe) -> some View {
        if form != .inline {
            RoundedRectangle(cornerRadius: recipe.cornerRadius, style: .continuous)
                .strokeBorder(recipe.isDashed ? Color.secondary.opacity(MeeshyOpacity.strong) : accent,
                              style: StrokeStyle(lineWidth: recipe.strokeWidth,
                                                 dash: recipe.isDashed ? recipe.dash.map { CGFloat($0) } : []))
        }
    }

    @ViewBuilder
    private func reading<Content: View>(recipe: MeeshyLockedRowRecipe, @ViewBuilder content: () -> Content) -> some View {
        let element = content()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
        if recipe.isButton, let onPress {
            Button(action: onPress) { element }
                .buttonStyle(.plain)
                .frame(minHeight: MeeshyControlSize.tapTarget)
        } else {
            element
        }
    }

    @ViewBuilder
    private func actionView(recipe: MeeshyLockedRowRecipe) -> some View {
        if recipe.showsAction, let action {
            Button(action: action.perform) {
                Text(verbatim: action.title)
                    .meeshyScaledFont(MeeshyFont.labelSize, weight: .semibold)
                    .foregroundStyle(Color.primary)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(minHeight: recipe.actionHeight)
                    .background(Capsule().fill(accent.opacity(MeeshyOpacity.light)))
                    .overlay(Capsule().stroke(accent.opacity(MeeshyOpacity.strong), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!recipe.actionIsActive)
            .opacity(recipe.actionIsActive ? 1 : 0.5)
            .accessibilityValue(MeeshyLockedRowWords.actionValue(isPending: action.isPending, isDone: action.isDone, locale: locale) ?? "")
        }
    }
}
