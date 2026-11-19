import SwiftUI
import MeeshySDK

// MARK: - « Pour aller plus loin » (#19674)
//
// Décision porteur : la fiche d'un autre ne montre plus ce que notre cercle n'ouvre pas — ni rangée fantôme, ni
// cadenas par outil. À la place, UNE carte dit le chemin : les cercles qu'il reste à gagner (Ami, Proche, Sang), ce
// qu'il faut pour atteindre chacun, et en quelques mots ce qu'il ouvre. Elle ne porte que des NOMS de capacités, jamais
// une donnée de la personne. Le cercle qui ouvre une capacité est celui de la loi d'accès (`RelationFeature`) : aucun
// seuil n'est réécrit ici.

/// Un cercle qu'il reste à gagner.
public nonisolated struct ProfileNextCircleStep: Equatable, Sendable {
    public let level: RelationLevel
    /// Ce que ce cercle ajoute à celui d'en dessous, dans l'ordre de la face Actions.
    public let opens: [ProfileRelationAction]
    /// Le prochain cran : c'est lui qui se lit en premier, les suivants en filigrane.
    public let isNext: Bool
}

/// L'échelle des cercles qui se GAGNENT : Ami se demande directement depuis Public, Communauté ou Connaissance ;
/// Proche et Sang viennent de la série d'échanges.
public nonisolated enum ProfileNextCircleLadder {
    public static let rungs: [RelationLevel] = [.friend, .close, .blood]

    /// Les cercles au-dessus du cercle commun `level`, du plus proche au Sang ; vide au Sang.
    public static func steps(above level: RelationLevel) -> [ProfileNextCircleStep] {
        let remaining = rungs.filter { $0 > level }
        return remaining.enumerated().map { index, rung in
            ProfileNextCircleStep(level: rung, opens: opens(at: rung), isNext: index == 0)
        }
    }

    /// Les opérations que le cercle `rung` ouvre et que celui d'en dessous n'ouvrait pas.
    public static func opens(at rung: RelationLevel) -> [ProfileRelationAction] {
        ProfileRelationAction.allCases.filter { $0.feature?.minimumLevel == rung && !$0.isDestructive }
    }
}

/// La carte « Pour aller plus loin » : un cran par cercle restant, le prochain mis en avant. Rien au Sang.
public struct ProfileNextCircles: View {
    private let level: RelationLevel
    private let name: String
    private let tint: Color
    private let progress: String?

    /// `progress` : où en est la série vers le prochain cran, telle que le serveur la sert (« Semaines d'affilée : 3
    /// sur 4 ») ; posée sous le prochain cran seulement.
    public init(level: RelationLevel, name: String, tint: Color, progress: String? = nil) {
        self.level = level
        self.name = name
        self.tint = tint
        self.progress = progress
    }

    public var body: some View {
        let steps = ProfileNextCircleLadder.steps(above: level)
        if !steps.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfileNextCirclesCopy.title)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.element.level) { index, step in
                        ProfileNextCircleRow(step: step, name: name, tint: tint, isLast: index == steps.count - 1,
                                             progress: step.isNext ? progress : nil)
                            .meeshyCascade(rank: index)
                    }
                }
                .padding(.vertical, MeeshySpacing.sm)
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
            }
            .meeshyCascadeFace()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("profile.nextCircles")
        }
    }
}

/// Un cran de l'échelle : le médaillon du cercle — la forme organique de la planche, qui ondule en continu
/// (`motion.morph`, #19785) — relié au suivant par un fil, son nom, le chemin, ce qu'il ouvre.
private struct ProfileNextCircleRow: View {
    let step: ProfileNextCircleStep
    let name: String
    let tint: Color
    let isLast: Bool
    let progress: String?

    @ResolvedThemePalette private var theme

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            MeeshyMedallion(systemImage: ProfileInCommonCopy.circleGlyph(step.level), tint: tint, shape: .blob,
                            fill: step.isNext ? .solid : .soft, decor: step.isNext ? .halo : .none,
                            size: step.isNext ? .s44 : .s36, state: step.isNext ? .current : .normal)
                .frame(width: Self.column)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(ProfileNextCirclesCopy.title(of: step.level))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundStyle(step.isNext ? theme.textPrimary : theme.textSecondary)
                Text(ProfileNextCirclesCopy.how(to: step.level, name: name))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let progress {
                    MeeshyBadge(.label(progress), leading: .systemImage("chart.line.uptrend.xyaxis"), kind: .accent,
                                tint: tint, size: .s28)
                }
                if let opens = ProfileNextCirclesCopy.opens(step) {
                    Label(opens, systemImage: "sparkles")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(tint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, isLast ? 0 : MeeshySpacing.lg)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .background(alignment: .topLeading) { connector }
        .opacity(step.isNext ? 1 : MeeshyOpacity.strong)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("profile.nextCircles.\(step.level.rawValue)")
    }
}

private extension ProfileNextCircleRow {
    /// Le diamètre du médaillon (`.s36`, `.s44` pour le prochain cran), d'où le fil part vers le cran suivant.
    var medallion: CGFloat { CGFloat((step.isNext ? MeeshyMedallionSize.s44 : .s36).rawValue) }
    /// La colonne des médaillons : celle du plus grand, pour que le fil relie leurs centres.
    static let column = CGFloat(MeeshyMedallionSize.s44.rawValue)

    /// Le fil qui relie ce cran au suivant : il descend du bas du médaillon jusqu'au bas de la rangée.
    @ViewBuilder
    var connector: some View {
        if !isLast {
            Capsule()
                .fill(tint.opacity(MeeshyOpacity.medium))
                .frame(width: MeeshyBorder.emphasis)
                .padding(.top, MeeshySpacing.sm + medallion + MeeshySpacing.xs)
                .padding(.leading, MeeshySpacing.lg + (Self.column - MeeshyBorder.emphasis) / 2)
                .accessibilityHidden(true)
        }
    }
}

/// Les mots de « Pour aller plus loin ».
enum ProfileNextCirclesCopy {
    static var title: String {
        String(localized: "profile.nextCircles.title", defaultValue: "Pour aller plus loin", bundle: .module)
    }

    static func title(of level: RelationLevel) -> String {
        switch level {
        case .blood:
            return String(localized: "profile.nextCircles.blood.title", defaultValue: "Lien de Sang", bundle: .module)
        case .close:
            return String(localized: "profile.nextCircles.close.title", defaultValue: "Devenir Proches", bundle: .module)
        case .friend, .acquaintance, .community, .public:
            return String(localized: "profile.nextCircles.friend.title", defaultValue: "Devenir Amis", bundle: .module)
        }
    }

    /// Ce qu'il faut pour atteindre le cercle, sans chiffre : les seuils de la série sont servis, jamais recopiés.
    static func how(to level: RelationLevel, name: String) -> String {
        switch level {
        case .blood:
            return String(localized: "profile.nextCircles.blood.how", defaultValue: "Échangez chaque semaine des mois durant : l’un propose le Sang, l’autre accepte.", bundle: .module)
        case .close:
            return String(localized: "profile.nextCircles.close.how", defaultValue: "Échangez chaque semaine, des semaines d’affilée, puis proposez d’être Proches.", bundle: .module)
        case .friend, .acquaintance, .community, .public:
            let format = String(localized: "profile.nextCircles.friend.how", defaultValue: "Envoie une demande d’ami à %@ : dès qu’elle est acceptée, vous êtes Amis.", bundle: .module)
            return String(format: format, name)
        }
    }

    /// « Ouvre : Bring et Position » ; au Sang, la position en direct, que la face Actions ne range pas.
    @MainActor static func opens(_ step: ProfileNextCircleStep) -> String? {
        guard step.level != .blood else {
            return String(localized: "profile.nextCircles.blood.opens", defaultValue: "Ouvre : la position en direct, son historique et la proximité", bundle: .module)
        }
        guard !step.opens.isEmpty else { return nil }
        let titles = step.opens.map(\.title)
        let joined = ListFormatter.localizedString(byJoining: titles)
        let format = String(localized: "profile.nextCircles.opens", defaultValue: "Ouvre : %@", bundle: .module)
        return String(format: format, joined)
    }
}
