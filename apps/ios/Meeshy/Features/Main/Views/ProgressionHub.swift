import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES TROIS HEROS ET LES TROIS PORTES DU HUB (#5838, #5843).
///
/// L'écran empilait badges, défis et succès dans un seul défilement, et
/// web-v3 empilait les mêmes pièces dans un AUTRE ordre. La séquence est
/// désormais déclarée dans `ProgressionLayout` (miroir de `progression-layout.ts`,
/// gardé par `progression-layout-mirror-parity`) et la vue la PARCOURT.
///
/// C'est la différence qui empêche la divergence de revenir : un client qui
/// compose sa propre séquence finit toujours par la faire dériver.

/// LE HERO DU DERNIER SUCCÈS (#5840).
///
/// Le PROCHAIN succès aurait demandé une distance — « encore 2 » — et cette
/// distance n'existe nulle part : les compteurs servis sont par AXE quand les
/// défis sont par FAMILLE, sans pont. Le porteur a tranché pour le DERNIER, qui
/// se lit dans ce qui est déjà servi.
///
/// Sur un compte qui n'a rien décroché il ne DISPARAÎT pas : il dit quoi viser.
/// Une section qui s'efface au premier lancement rend muet le seul moment où
/// l'utilisateur a besoin qu'on lui parle.
struct ProgressionLastAchievementHero: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let progress: EngagementProgress
    let isDark: Bool
    /// Ouvre la CÉLÉBRATION — animation et étoiles (directive porteur).
    var onReveal: (EngagementReveal) -> Void = { _ in }

    /// Ce que le hero montre — et ce qu'il CÉLÈBRE au toucher.
    ///
    /// Les deux provenances ne portent pas le même type de date : `String?`
    /// (ISO du fil) pour les succès composés, `Date?` pour les paliers générés.
    /// On compare donc des `Date`, en décodant l'ISO une seule fois — comparer
    /// deux chaînes de formats différents aurait « marché » sur les cas
    /// courants et menti sur les autres.
    private var dernier: (titre: String, quand: String, reveal: EngagementReveal?)? {
        var candidats: [(titre: String, date: Date, reveal: EngagementReveal?)] = []

        for succes in progress.achievements where succes.unlocked {
            guard let brut = succes.reachedAt, let date = ISO8601DateFormatter().date(from: brut) else { continue }
            candidats.append((ProgressionCopy.title(for: succes.key), date, .achievement(succes.key)))
        }
        for section in progress.achievementSections {
            for entree in section.entries where entree.unlocked {
                guard let date = entree.reachedAt,
                      let libelle = AchievementCopy.label(entree.family, tier: entree.tier) else { continue }
                // Pas de `reveal` pour un palier GÉNÉRÉ : `EngagementReveal` ne
                // sait célébrer que les succès NOMMÉS, et lui en fabriquer un
                // par défaut donnerait une célébration cohérente et FAUSSE —
                // le repli menteur que son propre doc-comment interdit (#5847).
                candidats.append((libelle, date, nil))
            }
        }

        guard let plusRecent = candidats.max(by: { $0.date < $1.date }) else { return nil }
        let quand = ProgressionCopy.obtained(ISO8601DateFormatter().string(from: plusRecent.date)) ?? ""
        return (plusRecent.titre, quand, plusRecent.reveal)
    }

    var body: some View {
        let acquis = dernier
        Button {
            if let reveal = acquis?.reveal { onReveal(reveal) }
        } label: {
            corps(acquis)
        }
        .buttonStyle(.plain)
        .disabled(acquis?.reveal == nil)
        .accessibilityHint(acquis?.reveal == nil ? Text(verbatim: "") : Text(ProgressionCopy.heroRevealHint))
    }

    @ViewBuilder
    private func corps(_ acquis: (titre: String, quand: String, reveal: EngagementReveal?)?) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(MeeshyColors.success.opacity(0.22))
                .frame(width: 48, height: 48)
                .overlay(Image(systemName: "trophy.fill").foregroundStyle(MeeshyColors.success))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(acquis == nil ? ProgressionCopy.heroFirstTitle : ProgressionCopy.heroLastTitle)
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(theme.textMuted)
                if let acquis {
                    Text(acquis.titre).font(.body.weight(.bold)).foregroundStyle(theme.textPrimary)
                    Text(acquis.quand).font(.caption).foregroundStyle(theme.textMuted)
                } else {
                    Text(ProgressionCopy.heroFirstHint)
                        .font(.body.weight(.bold))
                        .foregroundStyle(theme.textPrimary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(MeeshyColors.success.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(MeeshyColors.success.opacity(0.28), lineWidth: 1)
                )
        )
    }
}

/// LE HERO DU NIVEAU — pleine largeur, et il ÉNUMÈRE (#5841).
///
/// Le barème est DÉRIVÉ d'`EngagementCatalog.axisWeights`, jamais recopié : le
/// porteur l'a réglé trois fois le 2026-09-09, et une phrase en dur se serait
/// périmée au premier réglage sans qu'aucun témoin ne rougisse.
struct ProgressionLevelHero: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let progress: EngagementProgress
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(alignment: .firstTextBaseline) {
                Text(ProgressionCopy.levelTitle(progress.level.level))
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(theme.textPrimary)
                Spacer(minLength: MeeshySpacing.sm)
                Text(ProgressionCopy.score(progress.level.scale.value))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
            }

            ProgressionBar(
                progress: progress.level.scale.progress,
                tint: MeeshyColors.brandPrimary,
                label: String(localized: "progression.a11y.bar.level", defaultValue: "Progression vers le niveau suivant", bundle: .main)
            )

            Text(ProgressionCopy.nextStep(for: progress.level.scale, kind: .level, level: progress.level.level))
                .font(.caption)
                .foregroundStyle(theme.textMuted)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: MeeshyColors.brandPrimary))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.border(tint: MeeshyColors.brandPrimary), lineWidth: 1)
                )
        )
    }
}

/// LE HERO DES ÉLANS EN COURS (#5842).
///
/// L'élan était UN facteur global en bannière ; le porteur le veut au pluriel —
/// ce sur quoi on est en train de tenir. Il lit les familles ACTIVES, jamais une
/// liste écrite : `content.mood` (#5735) s'y ajoutera sans renumérotation.
struct ProgressionElansHero: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let progress: EngagementProgress
    let isDark: Bool

    private var famillesActives: [EngagementAxisFamily] {
        var vues: [EngagementAxisFamily] = []
        for axe in progress.axes where axe.scale.value > 0 {
            if !vues.contains(axe.axis.family) { vues.append(axe.axis.family) }
        }
        return vues
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars").foregroundStyle(MeeshyColors.brandPrimary)
                Text(titre).font(.body.weight(.bold)).foregroundStyle(theme.textPrimary)
                Spacer(minLength: 0)
            }

            if famillesActives.isEmpty {
                Text(ProgressionCopy.elansEmpty)
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
            } else {
                ProgressionWrap(items: famillesActives.map { ProgressionCopy.title(for: $0) })
                    .foregroundStyle(theme.textPrimary)
                Text(explication)
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(MeeshyColors.brandPrimary.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(MeeshyColors.brandPrimary.opacity(0.24), lineWidth: 1)
                )
        )
    }

    private var titre: String {
        guard let elan = progress.elan, elan.isAccelerated else { return ProgressionCopy.elansTitle }
        return "Élan ×\(Int(elan.factor))"
    }

    private var explication: String {
        guard let elan = progress.elan, elan.isAccelerated else { return ProgressionCopy.elansHint }
        return ProgressionCopy.elan(
            factor: elan.factor,
            families: elan.activeFamilyCount,
            windowDays: elan.windowDays,
            hasStanding: elan.hasStanding
        )
    }
}

/// Une PORTE du hub : son titre, son compte, et le geste qui l'ouvre.
///
/// Le compte est ce qui donne envie d'ouvrir — un lien sans chiffre ne dit pas
/// s'il vaut le geste.
struct ProgressionSectionLink: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let section: ProgressionSection
    let progress: EngagementProgress
    let isDark: Bool
    let onOpen: () -> Void

    private var titre: String {
        switch section {
        case .badges: return ProgressionCopy.badgesTitle
        case .defis: return AchievementCopy.sectionsHeader
        case .succes: return ProgressionCopy.achievementsTitle
        }
    }

    private var symbole: String {
        switch section {
        case .badges: return "rosette"
        case .defis: return "star.fill"
        case .succes: return "trophy.fill"
        }
    }

    private var teinte: Color {
        switch section {
        case .badges: return MeeshyColors.brandPrimary
        case .defis: return MeeshyColors.warning
        case .succes: return MeeshyColors.success
        }
    }

    private var compte: String {
        switch section {
        case .badges:
            return "\(progress.badgesEarned) / \(progress.badgesTotal)"
        case .succes:
            return "\(progress.achievements.filter(\.unlocked).count) / \(progress.achievements.count)"
        case .defis:
            let fait = progress.achievementSections.reduce(0) { $0 + $1.unlockedCount }
            let total = progress.achievementSections.reduce(0) { $0 + $1.attainableCount }
            return "\(fait) / \(total)"
        }
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: MeeshySpacing.md) {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(teinte.opacity(0.16))
                    .frame(width: 36, height: 36)
                    .overlay(Image(systemName: symbole).font(.subheadline).foregroundStyle(teinte))
                    .accessibilityHidden(true)

                Text(titre).font(.body.weight(.semibold)).foregroundStyle(theme.textPrimary)
                Spacer(minLength: MeeshySpacing.sm)
                Text(compte).font(.body.weight(.bold)).foregroundStyle(teinte)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(theme.textMuted)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surfaceGradient(tint: teinte))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.border(tint: teinte), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(titre), \(compte)")
    }
}

/// LE HERO DE LA FLAMME — la série de jours, seule (directive porteur).
///
/// Elle avait été repliée dans le hero du niveau ; le porteur veut trois heros
/// distincts. Trois questions différentes — où j'en suis, ce qui multiplie, ce
/// que je tiens — méritent trois blocs, pas un bloc dense.
struct ProgressionFlammeHero: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let progress: EngagementProgress
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(MeeshyColors.warning.opacity(0.20))
                .frame(width: 48, height: 48)
                .overlay(Image(systemName: "flame.fill").foregroundStyle(MeeshyColors.warning))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(ProgressionCopy.streak(progress.streak.scale.value))
                    .font(.body.weight(.bold))
                    .foregroundStyle(theme.textPrimary)
                Text(ProgressionCopy.streakRecord(progress.streak.longestDays))
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
            }
            Spacer(minLength: 0)

            Text(ProgressionCopy.nextStep(for: progress.streak.scale, kind: .streak))
                .font(.caption)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(theme.textMuted)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(MeeshyColors.warning.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(MeeshyColors.warning.opacity(0.26), lineWidth: 1)
                )
        )
    }
}

/// Des pastilles qui RETOMBENT À LA LIGNE.
///
/// Elle s'appuie sur le `FlowLayout` DÉJÀ présent dans l'app
/// (`Components/FlowLayout.swift`) : en écrire un second l'aurait redéclaré, et
/// c'est exactement ce que la compilation a refusé. Le doc-comment de l'existant
/// le disait — « `FlowLayout` existe déjà dans l'app ».
struct ProgressionWrap: View {
    let items: [String]

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.16)))
            }
        }
    }
}

/// UNE PAGE DÉDIÉE — Badges, Défis ou Succès (#5843).
///
/// Le hub n'annonce qu'un COMPTE ; le détail vit ici, où il a la place de
/// respirer. Les trois partagent ce cadre : le retour, le titre, et le compte
/// en haut à droite que le porteur a demandé. Écrit une fois, sinon les trois
/// dériveraient exactement comme le hub et web-v3 ont dérivé.
///
/// **Aucune requête.** La progression est déjà chargée par le hub et passée
/// telle quelle : ouvrir une page ne montre ni spinner ni squelette. Un écran
/// qui attend le réseau alors que les données sont là est un bug, pas une
/// dette (§ Instant App Principles).
struct ProgressionSectionPage: View {

    let section: ProgressionSection
    let progress: EngagementProgress?
    let isDark: Bool
    let onClose: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private var titre: String {
        switch section {
        case .badges: return ProgressionCopy.badgesTitle
        case .defis: return AchievementCopy.sectionsHeader
        case .succes: return ProgressionCopy.achievementsTitle
        }
    }

    private var teinte: Color {
        switch section {
        case .badges: return MeeshyColors.brandPrimary
        case .defis: return MeeshyColors.warning
        case .succes: return MeeshyColors.success
        }
    }

    private func compte(_ progress: EngagementProgress) -> String {
        switch section {
        case .badges:
            return "\(progress.badgesEarned) / \(progress.badgesTotal)"
        case .succes:
            return "\(progress.unlockedAchievementCount) / \(progress.achievements.count)"
        case .defis:
            let fait = progress.achievementSections.reduce(0) { $0 + $1.unlockedCount }
            let total = progress.achievementSections.reduce(0) { $0 + $1.attainableCount }
            return "\(fait) / \(total)"
        }
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "chevron.backward")
                            .font(MeeshyFont.relative(16, weight: .semibold))
                            .foregroundColor(MeeshyColors.brandPrimary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(Text(verbatim: "Retour"))

                    Text(titre)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)

                    Spacer(minLength: MeeshySpacing.sm)

                    if let progress {
                        Text(compte(progress))
                            .font(.body.weight(.bold))
                            .foregroundStyle(teinte)
                    }
                }
                .padding(.horizontal, 16)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        if let progress {
                            contenu(progress)
                        }
                        Spacer().frame(height: 40)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }
        }
    }

    @ViewBuilder
    private func contenu(_ progress: EngagementProgress) -> some View {
        switch section {
        case .badges:
            ForEach(progress.axesByFamily) { group in
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(ProgressionCopy.title(for: group.family))
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(theme.textMuted)
                        .accessibilityAddTraits(.isHeader)

                    ProgressionCard(tint: MeeshyColors.brandPrimary) {
                        VStack(spacing: 0) {
                            ForEach(Array(group.axes.enumerated()), id: \.element.id) { index, axis in
                                if index > 0 { Divider().overlay(theme.textMuted.opacity(0.2)) }
                                ProgressionAxisRow(axis: axis)
                            }
                        }
                    }
                }
            }

        case .succes:
            ProgressionCard(tint: MeeshyColors.success) {
                VStack(spacing: 0) {
                    ForEach(Array(progress.achievements.enumerated()), id: \.element.id) { index, achievement in
                        if index > 0 { Divider().overlay(theme.textMuted.opacity(0.2)) }
                        ProgressionAchievementRow(achievement: achievement)
                    }
                }
            }

        case .defis:
            ProgressionGeneratedAchievements(sections: progress.achievementSections)
        }
    }
}
