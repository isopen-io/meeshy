import SwiftUI

/// **Les tuiles de choix (K47)** : une liste d'options opaques, une sélection,
/// quatre choix fermés. Chaque tuile porte un médaillon, un chiffre ou un glyphe,
/// un titre et une phrase ; l'hôte tient la sélection et la reçoit en retour.
///
/// Agnostique : aucun lien, aucune durée de partage, aucun cercle, aucune adresse.
/// Une tuile verrouillée ne répond que si l'hôte donne `onLockedTap`.
public struct MeeshyChoiceTiles: View {
    private let label: String
    private let items: [MeeshyChoiceItem]
    private let selection: MeeshyChoiceSelection
    private let columns: Int
    private let content: MeeshyChoiceContent
    private let format: MeeshyChoiceFormat
    private let surface: MeeshyChoiceSurface
    private let tone: MeeshyGlassTone?
    private let tint: Color?
    private let allowsEmpty: Bool
    private let maxSelected: Int?
    private let countLabel: ((Int, Int) -> String)?
    private let onSelect: (String) -> Void
    private let onLockedTap: ((String) -> Void)?

    public init(label: String,
                items: [MeeshyChoiceItem],
                selection: MeeshyChoiceSelection,
                columns: Int = 2,
                content: MeeshyChoiceContent = .option,
                format: MeeshyChoiceFormat = .square,
                surface: MeeshyChoiceSurface = .tonal,
                tone: MeeshyGlassTone? = nil,
                tint: Color? = nil,
                allowsEmpty: Bool = false,
                maxSelected: Int? = nil,
                countLabel: ((Int, Int) -> String)? = nil,
                onSelect: @escaping (String) -> Void,
                onLockedTap: ((String) -> Void)? = nil) {
        assert(!label.isEmpty, "MeeshyChoiceTiles : label obligatoire")
        self.label = label
        self.items = items
        self.selection = selection
        self.columns = columns
        self.content = content
        self.format = format
        self.surface = surface
        self.tone = tone
        self.tint = tint
        self.allowsEmpty = allowsEmpty
        self.maxSelected = maxSelected
        self.countLabel = countLabel
        self.onSelect = onSelect
        self.onLockedTap = onLockedTap
    }

    public var body: some View {
        let count = MeeshyChoiceTilesRecipe.columns(columns)
        let gap = CGFloat(MeeshyChoiceTilesRecipe.spacing)
        let multiple: Bool = { if case .multiple = selection { return true } else { return false } }()
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            VStack(spacing: gap) {
                ForEach(Array(MeeshyChoiceTilesRecipe.rows(items, columns: count, base: format).enumerated()), id: \.offset) { _, row in
                    HStack(spacing: gap) {
                        ForEach(row) { item in
                            MeeshyChoiceTile(
                                item: item,
                                isSelected: MeeshyChoiceTilesRecipe.isSelected(item.id, in: selection),
                                isDisabled: MeeshyChoiceTilesRecipe.isDisabled(item, selection: selection, maxSelected: maxSelected),
                                content: content,
                                format: MeeshyChoiceTilesRecipe.format(for: item, base: format),
                                surface: surface,
                                tone: tone,
                                tint: tint,
                                columns: count,
                                isMultiple: multiple,
                                action: { handle(item) })
                        }
                        ForEach(0..<fillerCount(row: row, columns: count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            if let text = MeeshyChoiceTilesRecipe.countText(selection: selection, maxSelected: maxSelected, label: countLabel) {
                Text(verbatim: text)
                    .meeshyScaledFont(MeeshyFont.subheadSize)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func fillerCount(row: [MeeshyChoiceItem], columns: Int) -> Int {
        let isWideRow = row.count == 1 && format == .square && MeeshyChoiceTilesRecipe.format(for: row[0], base: format) == .wide
        return isWideRow ? 0 : max(columns - row.count, 0)
    }

    private func handle(_ item: MeeshyChoiceItem) {
        switch MeeshyChoiceTilesRecipe.outcome(selection: selection, tapped: item, allowsEmpty: allowsEmpty, maxSelected: maxSelected) {
        case .select(let id), .deselect(let id):
            HapticFeedback.light()
            onSelect(id)
        case .locked(let id):
            onLockedTap?(id)
        case .ignored:
            break
        }
    }
}

/// **Une tuile seule (K47)**, pour un hôte qui pose sa propre grille.
public struct MeeshyChoiceTile: View {
    private let item: MeeshyChoiceItem
    private let isSelected: Bool
    private let isDisabled: Bool
    private let content: MeeshyChoiceContent
    private let format: MeeshyChoiceFormat
    private let surface: MeeshyChoiceSurface
    private let tone: MeeshyGlassTone?
    private let tint: Color?
    private let columns: Int
    private let isMultiple: Bool
    private let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    public init(item: MeeshyChoiceItem,
                isSelected: Bool,
                isDisabled: Bool = false,
                content: MeeshyChoiceContent = .option,
                format: MeeshyChoiceFormat = .square,
                surface: MeeshyChoiceSurface = .tonal,
                tone: MeeshyGlassTone? = nil,
                tint: Color? = nil,
                columns: Int = 2,
                isMultiple: Bool = false,
                action: @escaping () -> Void) {
        self.item = item
        self.isSelected = isSelected
        self.isDisabled = isDisabled
        self.content = content
        self.format = format
        self.surface = surface
        self.tone = tone
        self.tint = tint
        self.columns = columns
        self.isMultiple = isMultiple
        self.action = action
    }

    private func recipe(isPressed: Bool) -> MeeshyChoiceTilesRecipe {
        let state: MeeshyChoiceItemState = isDisabled && item.state == .enabled ? .disabled : item.state
        return MeeshyChoiceTilesRecipe.resolve(content: content, format: format, surface: surface, columns: columns,
                                               isSelected: isSelected, isPressed: isPressed, state: state)
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        Button(action: action) { EmptyView() }
            .buttonStyle(MeeshyChoiceTileStyle { pressed in face(recipe: recipe(isPressed: pressed)) })
            .disabled(!rest.isInteractive)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([item.title, item.detail, item.value.map { "\($0) \(item.unit ?? "")" }]
                .compactMap { $0 }.joined(separator: ". "))
            .accessibilityAddTraits(rest.isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func face(recipe: MeeshyChoiceTilesRecipe) -> some View {
        let isDark = colorScheme == .dark
        let accent = item.tint ?? tint ?? MeeshyColors.brandPrimary
        let shape = RoundedRectangle(cornerRadius: CGFloat(MeeshyChoiceTilesRecipe.cornerRadius), style: .continuous)
        let tile = VStack(spacing: MeeshySpacing.sm) {
            head(recipe: recipe, accent: accent, isDark: isDark)
            Text(verbatim: item.title)
                .meeshyScaledFont(MeeshyFont.bodySize, weight: .semibold)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .multilineTextAlignment(.center)
            if let detail = item.detail, format != .compact {
                Text(verbatim: detail)
                    .meeshyScaledFont(MeeshyFont.smallSize)
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .multilineTextAlignment(.center)
            }
            if recipe.isLocked { Image(systemName: "lock").foregroundStyle(MeeshyColors.textSecondary(isDark: isDark)) }
        }
        .padding(MeeshySpacing.md)
        .frame(maxWidth: .infinity, minHeight: format == .compact ? 64 : (content == .value ? 132 : 112))
        return Group {
            if recipe.usesGlass {
                tile.meeshyGlass(in: shape, tone: tone)
            } else {
                tile.background(shape.fill(MeeshyColors.textSecondary(isDark: isDark).opacity(MeeshyOpacity.subtle)))
            }
        }
        .overlay(shape.strokeBorder(recipe.isSelected ? accent : Color.clear, lineWidth: CGFloat(recipe.borderWidth)))
        .overlay(alignment: .topTrailing) { selectionMark(recipe: recipe, accent: accent) }
        .opacity(recipe.opacity)
        .scaleEffect(CGFloat(recipe.pressScale))
    }

    @ViewBuilder
    private func head(recipe: MeeshyChoiceTilesRecipe, accent: Color, isDark: Bool) -> some View {
        switch content {
        case .value:
            VStack(spacing: 0) {
                Text(verbatim: item.value ?? "")
                    .font(MeeshyFont.relative(CGFloat(recipe.valueSize), weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                if let unit = item.unit {
                    Text(verbatim: unit).meeshyScaledFont(MeeshyFont.smallSize).foregroundStyle(.secondary)
                }
            }
        case .icon:
            Circle()
                .fill(recipe.isSelected ? MeeshyColors.textPrimary(isDark: isDark) : accent.opacity(MeeshyOpacity.light))
                .frame(width: 54, height: 54)
                .overlay(Image(systemName: item.systemImage ?? "circle")
                    .font(MeeshyFont.relative(22))
                    .foregroundStyle(recipe.isSelected ? MeeshyColors.textPrimary(isDark: !isDark) : accent))
        case .option:
            if let image = item.systemImage {
                Circle().fill(accent.opacity(MeeshyOpacity.light)).frame(width: 40, height: 40)
                    .overlay(Image(systemName: image).foregroundStyle(accent))
            }
        }
    }

    @ViewBuilder
    private func selectionMark(recipe: MeeshyChoiceTilesRecipe, accent: Color) -> some View {
        if isMultiple {
            Image(systemName: recipe.isSelected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(recipe.isSelected ? accent : Color.secondary)
                .padding(MeeshySpacing.sm)
        }
    }
}

private struct MeeshyChoiceTileStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}
