import SwiftUI

/// **La note (K46)** : ce que l'écran doit dire sans qu'on l'ait demandé tient en
/// une note en ligne : un glyphe, une phrase, un ton. Elle vit DANS le flux : une
/// note qui arrive déplace ce qui la suit de sa hauteur exacte et ne recouvre rien.
///
/// Agnostique : le texte est déjà traduit, la fraîcheur d'une donnée en direct
/// est dite par l'hôte (`isStale`). Tête, phrase et seconde ligne se lisent en un
/// seul élément ; l'action de fin reste un bouton à part, nommé. Seul `warn` est
/// annoncé à son arrivée, poliment.
public struct MeeshyNote<Action: View>: View {
    private let text: String
    private let emphasis: String?
    private let form: MeeshyNoteForm
    private let kind: MeeshyNoteKind
    private let lead: MeeshyNoteLead?
    private let detail: String?
    private let isStale: Bool
    private let tint: Color?
    private let announces: Bool?
    private let label: String?
    private let action: Action

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: Double = 390
    @State private var announcedKind: MeeshyNoteKind?

    public init(_ text: String,
                emphasis: String? = nil,
                form: MeeshyNoteForm = .line,
                kind: MeeshyNoteKind = .neutral,
                lead: MeeshyNoteLead? = nil,
                detail: String? = nil,
                isStale: Bool = false,
                tint: Color? = nil,
                announces: Bool? = nil,
                label: String? = nil,
                @ViewBuilder action: () -> Action) {
        self.text = text
        self.emphasis = emphasis
        self.form = form
        self.kind = kind
        self.lead = lead
        self.detail = detail
        self.isStale = isStale
        self.tint = tint
        self.announces = announces
        self.label = label
        self.action = action()
    }

    public var body: some View {
        let recipe = MeeshyNoteRecipe.resolve(form: form, kind: kind, lead: lead, size: .regular,
                                              isStale: isStale, hasDetail: detail != nil,
                                              hasAction: hasAction, width: width, reduceMotion: reduceMotion)
        let tone = MeeshyNoteColors.tone(recipe.inkKind, tint: tint, isDark: colorScheme == .dark)
        VStack(spacing: 0) {
            container(recipe: recipe, tone: tone)
            if recipe.bottomRuleWidth > 0 {
                Rectangle().fill(tone.opacity(MeeshyOpacity.medium)).frame(height: CGFloat(recipe.bottomRuleWidth))
            }
        }
        .frame(maxWidth: form == .banner ? .infinity : nil, alignment: .leading)
        .background(GeometryReader { proxy in
            Color.clear.preference(key: MeeshyNoteWidthKey.self, value: Double(proxy.size.width))
        })
        .onPreferenceChange(MeeshyNoteWidthKey.self) { width = $0 }
        .task(id: kind) { announceIfNeeded() }
    }

    private var hasAction: Bool { Action.self != EmptyView.self }

    @ViewBuilder
    private func container(recipe: MeeshyNoteRecipe, tone: Color) -> some View {
        switch recipe.container {
        case .tinted:
            HStack(spacing: 0) {
                Rectangle().fill(tone).frame(width: CGFloat(recipe.ruleWidth))
                content(recipe: recipe, tone: tone)
                    .padding(.vertical, MeeshySpacing.md)
                    .padding(.leading, MeeshySpacing.mdPlus)
                    .padding(.trailing, MeeshySpacing.mdPlus)
            }
            .background(tone.opacity(Double(recipe.tintPercent) / 100))
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(recipe.cornerRadius), style: .continuous))
        case .full:
            content(recipe: recipe, tone: tone)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.md)
                .frame(minHeight: CGFloat(recipe.minimumHeight))
        case .none:
            content(recipe: recipe, tone: tone)
        }
    }

    @ViewBuilder
    private func content(recipe: MeeshyNoteRecipe, tone: Color) -> some View {
        if recipe.actionWrapsBelow {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                reading(recipe: recipe, tone: tone)
                action.frame(minHeight: CGFloat(recipe.actionTapHeight))
            }
        } else {
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                reading(recipe: recipe, tone: tone)
                if hasAction {
                    Spacer(minLength: MeeshySpacing.sm)
                    action.frame(minHeight: CGFloat(recipe.actionTapHeight))
                }
            }
        }
    }

    /// Tête, phrase et seconde ligne : UN seul élément pour le lecteur d'écran.
    private func reading(recipe: MeeshyNoteRecipe, tone: Color) -> some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            leadView(recipe: recipe, tone: tone)
            VStack(alignment: .leading, spacing: 1) {
                Text(MeeshyNoteRecipe.attributedPhrase(text, emphasis: emphasis))
                    .meeshyScaledFont(CGFloat(recipe.phraseSize), weight: form == .live ? .semibold : .regular)
                    .foregroundStyle(form == .live ? tone : MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                    .lineSpacing(CGFloat(recipe.phraseSize * (MeeshyNoteRecipe.lineHeightMultiplier - 1)))
                    .fixedSize(horizontal: false, vertical: true)
                if recipe.showsDetail, let detail {
                    Text(verbatim: detail)
                        .meeshyScaledFont(CGFloat(MeeshyNoteRecipe.detailSize))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: colorScheme == .dark))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? spoken)
    }

    private var spoken: String {
        [text, detail].compactMap { $0 }.joined(separator: ". ")
    }

    @ViewBuilder
    private func leadView(recipe: MeeshyNoteRecipe, tone: Color) -> some View {
        switch recipe.lead {
        case .glyph(let name):
            Image(systemName: name)
                .resizable()
                .scaledToFit()
                .frame(width: CGFloat(recipe.leadSize), height: CGFloat(recipe.leadSize))
                .foregroundStyle(tone)
                .accessibilityHidden(true)
        case .dot(let pulsing):
            MeeshyNoteDot(size: CGFloat(recipe.leadSize), tone: tone, pulsing: pulsing)
                .frame(minHeight: CGFloat(recipe.phraseSize * MeeshyNoteRecipe.lineHeightMultiplier))
                .accessibilityHidden(true)
        case .none:
            EmptyView()
        }
    }

    private func announceIfNeeded() {
        guard MeeshyNoteRecipe.shouldAnnounce(previous: announcedKind, current: kind, override: announces) else {
            announcedKind = kind
            return
        }
        announcedKind = kind
        #if canImport(UIKit) && os(iOS)
        UIAccessibility.post(notification: .announcement, argument: label ?? spoken)
        #endif
    }
}

extension MeeshyNote where Action == EmptyView {
    public init(_ text: String,
                emphasis: String? = nil,
                form: MeeshyNoteForm = .line,
                kind: MeeshyNoteKind = .neutral,
                lead: MeeshyNoteLead? = nil,
                detail: String? = nil,
                isStale: Bool = false,
                tint: Color? = nil,
                announces: Bool? = nil,
                label: String? = nil) {
        self.init(text, emphasis: emphasis, form: form, kind: kind, lead: lead, detail: detail,
                  isStale: isStale, tint: tint, announces: announces, label: label, action: { EmptyView() })
    }
}

/// La liste de notes : chaque ligne un glyphe et une phrase ; la liste annonce son
/// nombre de lignes.
public struct MeeshyNoteItem: Sendable, Equatable, Identifiable {
    public let systemImage: String
    public let text: String
    public var id: String { "\(systemImage)|\(text)" }

    public init(systemImage: String, text: String) {
        self.systemImage = systemImage
        self.text = text
    }
}

public struct MeeshyNoteList: View {
    private let items: [MeeshyNoteItem]
    private let kind: MeeshyNoteKind
    private let size: MeeshyNoteSize

    @Environment(\.colorScheme) private var colorScheme

    public init(items: [MeeshyNoteItem], kind: MeeshyNoteKind = .neutral, size: MeeshyNoteSize = .regular) {
        self.items = items
        self.kind = kind
        self.size = size
    }

    public var body: some View {
        let tone = MeeshyNoteColors.tone(kind, tint: nil, isDark: colorScheme == .dark)
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(items) { item in
                HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                    Image(systemName: item.systemImage)
                        .resizable()
                        .scaledToFit()
                        .frame(width: MeeshyIconSize.md, height: MeeshyIconSize.md)
                        .foregroundStyle(tone)
                        .accessibilityHidden(true)
                    Text(verbatim: item.text)
                        .meeshyScaledFont(CGFloat(MeeshyNoteRecipe.listPhraseSize(size)))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct MeeshyNoteWidthKey: PreferenceKey {
    static let defaultValue: Double = 390
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

/// Le point de 9 : fixe, ou battant (un anneau qui s'élargit et s'éteint). Le
/// battement n'anime que l'échelle et l'opacité d'un anneau, hors de la boîte du
/// point, et s'arrête sous mouvement réduit.
private struct MeeshyNoteDot: View {
    let size: CGFloat
    let tone: Color
    let pulsing: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isBeating = false

    var body: some View {
        Circle()
            .fill(tone)
            .frame(width: size, height: size)
            .background(
                Circle()
                    .fill(tone.opacity(MeeshyOpacity.medium))
                    .frame(width: size, height: size)
                    .scaleEffect(isBeating ? 2.2 : 1)
                    .opacity(isBeating ? 0 : 1)
                    .animation(MeeshyMotion.animation(.pulse, reduce: reduceMotion), value: isBeating)
            )
            .onAppear { isBeating = pulsing && !reduceMotion }
            .onDisappear { isBeating = false }
    }
}

/// Les couleurs des sens de la note : la seule traduction sens vers couleur.
enum MeeshyNoteColors {
    static func tone(_ kind: MeeshyNoteKind, tint: Color?, isDark: Bool) -> Color {
        if let tint { return tint }
        switch kind {
        case .neutral: return MeeshyColors.textSecondary(isDark: isDark)
        case .info: return MeeshyColors.info
        case .ok: return isDark ? MeeshyColors.success : MeeshyColors.successDeep
        case .warn: return isDark ? MeeshyColors.warning : MeeshyColors.amber500
        case .security: return MeeshyColors.brandPrimary
        }
    }
}
