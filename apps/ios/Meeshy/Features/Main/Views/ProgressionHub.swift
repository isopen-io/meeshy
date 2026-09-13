import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES TROIS HEROS ET LES TROIS PORTES DU HUB (#5838, #5843).
///
/// L'écran empilait badges, défis et succès dans un seul défilement, et
/// web-v2 empilait les mêmes pièces dans un AUTRE ordre. La séquence est
/// désormais déclarée dans `ProgressionLayout` (miroir de `progression-layout.ts`,
/// gardé par `progression-layout-mirror-parity`) et la vue la PARCOURT.
///
/// C'est la différence qui empêche la divergence de revenir : un client qui
/// compose sa propre séquence finit toujours par la faire dériver.

/// CE QU'UN HERO DEMANDE D'OUVRIR — le palier, sa date, et s'il est OBTENU.
///
/// Trois valeurs passées de main en main auraient fini par se désordonner, et
/// `AchievementRevealView.Occasion` a besoin des trois pour se composer
/// JUSTE : un palier verrouillé ouvert avec `unlocked: true` afficherait
/// « Débloqué » sur un succès qu'on n'a pas.
struct ProgressionRevealRequest: Identifiable {
    let reveal: EngagementReveal
    let reachedAt: String?
    let unlocked: Bool
    var id: String { "\(reveal)|\(unlocked)" }
}

/// LE HERO DU DERNIER SUCCÈS (#5840), ET DU PROCHAIN À DÉFAUT (#5831).
///
/// Deux élections concurrentes ont été écrites en parallèle, chacune couvrant
/// ce que l'autre ratait ; la fusion garde les deux moitiés.
///
/// **Obtenu** — l'élection de cette branche, qui balaie les succès NOMMÉS *et*
/// les paliers GÉNÉRÉS (`achievementSections`) : `heroAchievement` ne connaît
/// que les premiers, et le dernier fait d'un compte peut très bien être un
/// palier généré.
///
/// **Rien d'obtenu** — l'élection de #5831 (`heroAchievement`), qui nomme le
/// PROCHAIN verrouillé et sa CONDITION. Cette branche n'affichait là qu'un
/// conseil figé : correct, mais moins que ce que la passerelle sert déjà.
///
/// Dans les deux cas le hero ne DISPARAÎT pas — et dans les deux cas il
/// s'ouvre : « un succès qu'on n'a PAS encore obtenu s'y regarde aussi, c'est
/// là qu'on lit ce qu'il faut faire pour l'avoir » (#5831).
struct ProgressionLastAchievementHero: View {

    private var theme: ThemeManager { ThemeManager.shared }

    let progress: EngagementProgress
    let isDark: Bool
    /// Ouvre la CÉLÉBRATION — animation et étoiles (directive porteur).
    var onReveal: (ProgressionRevealRequest) -> Void = { _ in }

    /// Ce que le hero montre — et ce qu'il OUVRE au toucher.
    ///
    /// Les deux provenances ne portent pas le même type de date : `String?`
    /// (ISO du fil) pour les succès composés, `Date?` pour les paliers générés.
    /// On compare donc des `Date`, en décodant l'ISO une seule fois — comparer
    /// deux chaînes de formats différents aurait « marché » sur les cas
    /// courants et menti sur les autres.
    private var obtenu: (titre: String, quand: String, requete: ProgressionRevealRequest)? {
        var candidats: [(titre: String, date: Date, requete: ProgressionRevealRequest)] = []

        for succes in progress.achievements where succes.unlocked {
            // `ISO8601DateFormatter()` NU n'accepte pas les fractions de
            // seconde — or `reachedAt.toISOString()` en émet TOUJOURS. Chaque
            // candidat était donc écarté et le hero restait dans son état vide
            // pour tout le monde, sans que rien ne rougisse : l'état vide est
            // légitime, et la vue rendue était valide.
            guard let date = EngagementProgressResolver.reachedDate(succes.reachedAt) else { continue }
            candidats.append((
                ProgressionCopy.title(for: succes.key),
                date,
                ProgressionRevealRequest(
                    reveal: .achievement(succes.key),
                    reachedAt: succes.reachedAt,
                    unlocked: true
                )
            ))
        }
        for section in progress.achievementSections {
            for entree in section.entries where entree.unlocked {
                guard let date = entree.reachedAt,
                      let libelle = AchievementCopy.label(entree.family, tier: entree.tier) else { continue }
                // Un palier GÉNÉRÉ se célèbre AUSSI depuis #5831 :
                // `EngagementReveal.composedAchievement(family:tier:)` sait le
                // nommer. Cette branche posait `nil` ici, et son commentaire
                // affirmait que le type ne savait pas le faire — vrai à sa
                // base, faux depuis. Un commentaire qui justifie une lacune se
                // périme AVEC elle.
                candidats.append((
                    libelle,
                    date,
                    ProgressionRevealRequest(
                        reveal: .composedAchievement(family: entree.family, tier: entree.tier),
                        reachedAt: nil,
                        unlocked: true
                    )
                ))
            }
        }

        guard let plusRecent = candidats.max(by: { $0.date < $1.date }) else { return nil }
        // Ré-encoder la `Date` en ISO pour la faire re-décoder juste après
        // était un aller-retour qui reperdait la fraction de seconde au
        // passage. On date la `Date`.
        return (plusRecent.titre, ProgressionCopy.obtained(date: plusRecent.date), plusRecent.requete)
    }

    /// À défaut d'obtenu : le PROCHAIN verrouillé et ce qu'il demande (#5831).
    private var prochain: (titre: String, quand: String, requete: ProgressionRevealRequest)? {
        guard obtenu == nil, let cible = progress.heroAchievement, !cible.unlocked else { return nil }
        return (
            ProgressionCopy.title(for: cible.key),
            ProgressionCopy.condition(for: cible.key),
            ProgressionRevealRequest(
                reveal: .achievement(cible.key),
                reachedAt: cible.reachedAt,
                unlocked: false
            )
        )
    }

    var body: some View {
        let acquis = obtenu
        let vise = prochain
        let montre = acquis ?? vise
        Button {
            if let requete = montre?.requete { onReveal(requete) }
        } label: {
            corps(montre, obtenu: acquis != nil)
        }
        .buttonStyle(.plain)
        .disabled(montre == nil)
        .accessibilityHint(montre == nil ? Text(verbatim: "") : Text(ProgressionCopy.heroRevealHint))
    }

    @ViewBuilder
    private func corps(
        _ montre: (titre: String, quand: String, requete: ProgressionRevealRequest)?,
        obtenu: Bool
    ) -> some View {
        // Le VERT dit « acquis » ; sur un palier qu'on n'a pas encore, il
        // mentirait. La teinte suit donc ce que la carte MONTRE, jamais la
        // seule identité de la vue.
        let teinte = obtenu ? MeeshyColors.success : MeeshyColors.textMuted(isDark: isDark)
        HStack(spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(teinte.opacity(0.22))
                .frame(width: 48, height: 48)
                .overlay(Image(systemName: "trophy.fill").foregroundStyle(teinte))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(bandeau(montre: montre != nil, obtenu: obtenu))
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(theme.textMuted)
                if let montre {
                    Text(montre.titre).font(.body.weight(.bold)).foregroundStyle(theme.textPrimary)
                    Text(montre.quand).font(.caption).foregroundStyle(theme.textMuted)
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
                .fill(teinte.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(teinte.opacity(0.28), lineWidth: 1)
                )
        )
    }

    private func bandeau(montre: Bool, obtenu: Bool) -> String {
        if obtenu { return ProgressionCopy.heroLastTitle }
        return montre ? ProgressionCopy.heroNextTitle : ProgressionCopy.heroFirstTitle
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
                // `forward`, pas `right` : ce chevron dit « ouvre cette section »,
                // pas « va vers la droite de l'écran ». En arabe la lecture court
                // de droite à gauche, et un chevron nommé par un côté PHYSIQUE y
                // pointe à rebours du geste qu'il annonce. La variante sémantique
                // se retourne avec la langue ; garde : `RightToLeftLayoutGuardTests`.
                Image(systemName: "chevron.forward").font(.footnote).foregroundStyle(theme.textMuted)
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
                // La SÉMANTIQUE d'abord, comme ses deux voisins : le hero
                // s'ouvrait sur un chiffre sans nom.
                Text(ProgressionCopy.heroStreakTitle)
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(theme.textMuted)
                Text(ProgressionCopy.streak(progress.streak.scale.value))
                    .font(.body.weight(.bold))
                    .foregroundStyle(theme.textPrimary)
                Text(ProgressionCopy.streakRecord(progress.streak.longestDays))
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
                // Le jalon passe en DERNIÈRE LIGNE (directive porteur
                // 2026-09-09). À droite, il était cadré à l'opposé de ce qu'il
                // qualifie et se lisait comme une colonne à part ; en dessous,
                // il termine la phrase que les deux lignes commencent — où j'en
                // suis, mon record, ce qui reste. C'est aussi la forme qu'a
                // déjà `ProgressionStreakCard`, dont ce hero est le résumé.
                Text(ProgressionCopy.nextStep(for: progress.streak.scale, kind: .streak))
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
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
/// dériveraient exactement comme le hub et web-v2 ont dérivé.
///
/// **Aucune requête.** La progression est déjà chargée par le hub et passée
/// telle quelle : ouvrir une page ne montre ni spinner ni squelette. Un écran
/// qui attend le réseau alors que les données sont là est un bug, pas une
/// dette (§ Instant App Principles).
struct ProgressionSectionPage: View {

    let section: ProgressionSection

    /// **La page est AUTONOME dans la pile** (directive porteur 2026-09-09).
    ///
    /// Présentée en feuille, elle recevait l'état de son parent. Poussée, elle
    /// peut être atteinte sans lui — un lien profond, une notification, un
    /// retour depuis plus loin — et un état passé en paramètre serait alors
    /// vide sans que rien ne le dise. Elle lit donc le sien, et le cache le
    /// rend instantané : aucun spinner ne s'ajoute (Cache-First).
    @StateObject private var viewModel = ProgressionViewModel()

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var progress: EngagementProgress? { viewModel.progress }

    /// La célébration est portée ICI, pas chez l'hôte : c'est depuis les lignes
    /// de CETTE page qu'on ouvre un succès, et la porte doit rester là où le
    /// doigt se pose. Une porte qui existe et ne se voit pas est une porte qui
    /// n'existe pas.
    @State private var reveal: ProgressionRevealRequest?

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
                    // Le retour passe par la PILE — pas par une fermeture de
                    // feuille. Le glissement depuis le bord gauche fait donc le
                    // même geste, sans qu'aucun code ne le porte.
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.backward")
                            .font(MeeshyFont.relative(16, weight: .semibold))
                            .foregroundColor(MeeshyColors.brandPrimary)
                            .frame(width: 44, height: 44)
                    }
                    .adaptiveGlass(in: Circle(), interactive: true)
                    .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

                    Text(titre)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)

                    Spacer(minLength: MeeshySpacing.sm)

                    // La VALEUR est du verre elle aussi : posée nue sur le
                    // dégradé, elle flottait sans matière, et rien ne disait
                    // qu'elle appartenait au chrome plutôt qu'au contenu.
                    if let progress {
                        Text(compte(progress))
                            .font(.body.weight(.bold))
                            .foregroundStyle(teinte)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .adaptiveGlass(in: Capsule(), tint: teinte.opacity(0.18))
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
        // Le geste de bord, que `navigationBarHidden(true)` retire en silence.
        // Sans lui, la page est bien POUSSÉE mais ne se quitte qu'au bouton —
        // et l'utilisateur qui glisse depuis le bord n'obtient rien, ce qui se
        // lit comme une page bloquée plutôt que comme un geste non servi.
        .background(InteractivePopEnabler())
        .task { await viewModel.load() }
        .fullScreenCover(item: $reveal) { palier in
            AchievementRevealView(
                reveal: palier.reveal,
                occasion: .consultation(unlocked: palier.unlocked, reachedAt: palier.reachedAt)
            ) { reveal = nil }
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
                        Button {
                            reveal = ProgressionRevealRequest(
                                reveal: .achievement(achievement.key),
                                reachedAt: achievement.reachedAt,
                                unlocked: achievement.unlocked
                            )
                        } label: {
                            ProgressionAchievementRow(achievement: achievement)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityHint(Text(String(
                            localized: "progression.achievement.a11y.hint",
                            defaultValue: "Ouvre le succès en grand",
                            bundle: .main)))
                    }
                }
            }

        case .defis:
            ProgressionGeneratedAchievements(sections: progress.achievementSections)
        }
    }
}
