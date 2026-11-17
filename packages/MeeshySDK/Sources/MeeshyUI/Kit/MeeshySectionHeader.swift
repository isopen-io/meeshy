import SwiftUI

/// **L'en-tête de section (K44)** : un titre, ce qu'elle compte, et un seul geste de
/// fin. Il annonce, il ne contient rien : le corps et son repli appartiennent à
/// l'hôte, et aucun état d'ouverture n'est gardé ici.
///
/// Agnostique : il reçoit un texte et un nombre. Le titre est un en-tête pour le
/// lecteur d'écran (`level` de 1 à 6) et le compteur est lu avec lui. Repliable
/// (`onToggle` reçoit l'état DEMANDÉ), toute la ligne est UN bouton qui dit
/// `expandedLabel` ou `collapsedLabel`, le chevron et le point sont muets. Statique,
/// la ligne ne répond pas : seul l'accessoire se touche.
public struct MeeshySectionHeader<Lead: View, Accessory: View>: View {
    private let title: String
    private let count: Int?
    private let form: MeeshySectionHeaderForm
    private let size: MeeshySectionHeaderSize
    private let step: (number: Int, state: MeeshySectionHeaderStepState)?
    private let isCollapsible: Bool
    private let isExpanded: Bool
    private let onToggle: ((Bool) -> Void)?
    private let isLive: Bool
    private let level: Int
    private let expandedLabel: String?
    private let collapsedLabel: String?
    private let tint: Color?
    private let lead: Lead
    private let accessory: Accessory

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(title: String,
                count: Int? = nil,
                form: MeeshySectionHeaderForm = .title,
                size: MeeshySectionHeaderSize = .page,
                step: (number: Int, state: MeeshySectionHeaderStepState)? = nil,
                isCollapsible: Bool = false,
                isExpanded: Bool = true,
                onToggle: ((Bool) -> Void)? = nil,
                isLive: Bool = false,
                level: Int = 2,
                expandedLabel: String? = nil,
                collapsedLabel: String? = nil,
                tint: Color? = nil,
                @ViewBuilder lead: () -> Lead,
                @ViewBuilder accessory: () -> Accessory) {
        self.title = title
        self.count = count
        self.form = form
        self.size = size
        self.step = step
        self.isCollapsible = isCollapsible && onToggle != nil
        self.isExpanded = isExpanded
        self.onToggle = onToggle
        self.isLive = isLive
        self.level = level
        self.expandedLabel = expandedLabel
        self.collapsedLabel = collapsedLabel
        self.tint = tint
        self.lead = lead()
        self.accessory = accessory()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private func recipe(isPressed: Bool) -> MeeshySectionHeaderRecipe {
        MeeshySectionHeaderRecipe.resolve(form: form, size: size, count: count, isCollapsible: isCollapsible,
                                          isExpanded: isExpanded, isPressed: isPressed, isLive: isLive,
                                          textScale: dynamicTypeSize.isAccessibilitySize ? 2 : 1)
    }

    private var spokenTitle: String {
        guard let count, count > 0 else { return title }
        return "\(title), \(count)"
    }

    private var headingLevel: AccessibilityHeadingLevel {
        switch level {
        case ...1: return .h1
        case 2: return .h2
        case 3: return .h3
        case 4: return .h4
        case 5: return .h5
        default: return .h6
        }
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        if let onToggle, isCollapsible {
            Button(action: { onToggle(!isExpanded) }) { EmptyView() }
                .buttonStyle(MeeshySectionHeaderStyle { isPressed in row(recipe: recipe(isPressed: isPressed), includesAccessory: false) })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spokenTitle)
                .accessibilityValue((isExpanded ? expandedLabel : collapsedLabel) ?? "")
                .accessibilityAddTraits([.isButton, .isHeader])
                .accessibilityHeading(headingLevel)
        } else {
            row(recipe: rest, includesAccessory: true)
        }
    }

    private func row(recipe: MeeshySectionHeaderRecipe, includesAccessory: Bool) -> some View {
        let isDark = colorScheme == .dark
        let layout = recipe.accessoryBelowTitle ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                                                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm))
        return layout {
            leading(recipe: recipe, isDark: isDark)
            titleBlock(recipe: recipe, isDark: isDark)
            if !recipe.accessoryBelowTitle && !recipe.showsRules { Spacer(minLength: MeeshySpacing.sm) }
            accessory
            if recipe.showsChevron {
                Image(systemName: "chevron.up")
                    .font(MeeshyFont.relative(13, weight: .bold))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .rotationEffect(.degrees(recipe.chevronDegrees))
                    .meeshyAnimation(.easeInOut(duration: 0.2), value: recipe.chevronDegrees)
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, minHeight: CGFloat(recipe.minHeight), alignment: .leading)
        .background(Color.accentColor.opacity(recipe.pressVeil))
        .scaleEffect(CGFloat(recipe.pressScale))
        .contentShape(Rectangle())
        .accessibilityElement(children: recipe.isWholeRowTappable ? .ignore : .contain)
    }

    @ViewBuilder
    private func leading(recipe: MeeshySectionHeaderRecipe, isDark: Bool) -> some View {
        if form == .step, let step {
            stepBadge(step: step, recipe: recipe, isDark: isDark)
        } else if Lead.self != EmptyView.self {
            lead
                .frame(width: CGFloat(recipe.leadingSize), height: CGFloat(recipe.leadingSize))
                .padding(.trailing, CGFloat(MeeshySectionHeaderRecipe.leadGap) - MeeshySpacing.sm)
                .accessibilityHidden(true)
        }
    }

    private func stepBadge(step: (number: Int, state: MeeshySectionHeaderStepState),
                           recipe: MeeshySectionHeaderRecipe, isDark: Bool) -> some View {
        let accent = tint ?? Color.accentColor
        let look = MeeshySectionHeaderRecipe.stepAppearance(step.state)
        return ZStack {
            Circle().fill(look == .filled ? accent : (look == .check ? MeeshyColors.success : Color.clear))
            Circle().strokeBorder(look == .outlined ? MeeshyColors.textMuted(isDark: isDark) : Color.clear, lineWidth: 1.5)
            if look == .check {
                Image(systemName: "checkmark").font(MeeshyFont.relative(12, weight: .bold)).foregroundStyle(Color.white)
            } else {
                Text("\(step.number)").font(MeeshyFont.relative(13, weight: .heavy, design: .rounded))
                    .foregroundStyle(look == .filled ? Color.white : MeeshyColors.textSecondary(isDark: isDark))
            }
        }
        .frame(width: CGFloat(recipe.leadingSize), height: CGFloat(recipe.leadingSize))
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func titleBlock(recipe: MeeshySectionHeaderRecipe, isDark: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if recipe.showsRules { rule(isDark: isDark).padding(.trailing, CGFloat(recipe.ruleGap)) }
            Text(title)
                .font(MeeshyFont.relative(CGFloat(recipe.titleFontSize), weight: recipe.isUppercase || recipe.showsRules ? .bold : .heavy,
                              design: recipe.isUppercase || recipe.showsRules ? .default : .rounded))
                .textCase(recipe.isUppercase || recipe.showsRules ? .uppercase : nil)
                .foregroundStyle(recipe.isUppercase || recipe.showsRules ? MeeshyColors.textMuted(isDark: isDark) : MeeshyColors.textPrimary(isDark: isDark))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(headingLevel)
            if recipe.showsCount, let count {
                Text("\(count)")
                    .font(MeeshyFont.relative(CGFloat(recipe.countFontSize), weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .padding(.leading, CGFloat(recipe.countGap))
                    .accessibilityLabel(String(count))
            }
            if recipe.liveDotSize > 0 {
                Circle().fill(MeeshyColors.success)
                    .frame(width: CGFloat(recipe.liveDotSize), height: CGFloat(recipe.liveDotSize))
                    .padding(.leading, CGFloat(recipe.liveDotGap))
                    .accessibilityHidden(true)
            }
            if recipe.showsRules { rule(isDark: isDark).padding(.leading, CGFloat(recipe.ruleGap)) }
        }
    }

    private func rule(isDark: Bool) -> some View {
        Rectangle().fill(MeeshyColors.hairline(isDark: isDark)).frame(height: 1).frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}

/// Le style qui rend la ligne entière avec l'état d'appui : voile de 9 %, échelle 0,985.
private struct MeeshySectionHeaderStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}

extension MeeshySectionHeader where Lead == EmptyView, Accessory == EmptyView {
    public init(title: String,
                count: Int? = nil,
                form: MeeshySectionHeaderForm = .title,
                size: MeeshySectionHeaderSize = .page,
                isCollapsible: Bool = false,
                isExpanded: Bool = true,
                onToggle: ((Bool) -> Void)? = nil,
                expandedLabel: String? = nil,
                collapsedLabel: String? = nil) {
        self.init(title: title, count: count, form: form, size: size, step: nil, isCollapsible: isCollapsible,
                  isExpanded: isExpanded, onToggle: onToggle, isLive: false, level: 2,
                  expandedLabel: expandedLabel, collapsedLabel: collapsedLabel, tint: nil,
                  lead: { EmptyView() }, accessory: { EmptyView() })
    }
}
