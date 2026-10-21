import Foundation
import MeeshySDK

/// CE QUE CHAQUE CONCEPT DIT (#9564, #11180) — la carte de la première page, la tête de la fiche, la jauge vers l'étape
/// suivante, les sous-pages. Une loi PURE : elle lit la progression et le bloc `game` servis, et ne calcule ni niveau,
/// ni rang, ni prix — chaque nombre est celui du serveur, mis en mots. MIROIR de `conceptView`
/// (`apps/web/src/lib/view/progression-concepts.ts`).
///
/// UN FAIT NE PARAÎT QU'UNE FOIS PAR ÉCRAN (épopée § 3.3) : chaque donnée porte l'IDENTITÉ du fait qu'elle dit
/// (`ProgressionFactID`), et le dédoublonnage compare des identités, jamais des chaînes.
///
///  1. UNE DONNÉE APPARTIENT À UN SEUL CONCEPT : ta lumière aux Étincelles, le prix et le manque de la prochaine Meesh à
///     l'Héritage (la fiche des Étincelles y mène), tout multiplicateur aux Élans, les étoiles à la Renaissance.
///  2. LA CARTE DIT UN NOM EN PETIT, UNE VALEUR EN GRAND, UNE LIGNE EN PETIT, et la ligne ne redit jamais la valeur.
///  3. LA FICHE NE REDIT RIEN (`ProgressionConceptFiche`).
///
/// Ce qui demande une action PREND la ligne (`urgent`) : Offrande prête, acte personnel qui expire, Flamme en danger,
/// frappe possible, Renaissance possible. Tout « il manque » nomme sa cible : le niveau, la Meesh, le rang, la zone.

/// Une ligne « libellé → valeur » de « Où j'en suis ».
struct ProgressionConceptFact: Equatable, Identifiable {
    let label: String
    let value: String
    /// La donnée dont la ligne parle, quand elle a SA phrase au catalogue (`game.detail.fact.<donnée>`).
    var detail: GameDetailFactKey?
    /// L'IDENTITÉ du fait (#11180) : deux lignes de même identité sur un écran sont un défaut.
    var identity: ProgressionFactID?

    var id: String { label }
}

/// LA CARTE D'UN CONCEPT sur la première page (#11180, épopée § 5) — trois étages : le NOM en petit, la VALEUR en grand,
/// UNE ligne en petit. Ni pastilles, ni jauge, ni paragraphe : la fiche dit le reste.
struct ProgressionConceptCard: Equatable, Identifiable {
    let concept: ProgressionConcept
    let name: String
    /// La valeur de la tête, sur UNE ligne.
    let value: String
    /// Le fait que la valeur dit.
    let valueFact: ProgressionFactID
    /// Le fait que l'emblème montre lui-même (l'anneau porte le niveau), et ce qu'un lecteur d'écran en entend.
    var emblem: ProgressionEmblemFact?
    /// La ligne en petit : l'action quand le concept attend un geste, sinon la donnée qui suit la valeur.
    let line: ProgressionFactText?
    /// La ligne demande une action (Offrande prête, Flamme en danger, frappe possible…) : elle se marque.
    var urgent = false
    /// La part parcourue vers l'étape suivante — la jauge du héros de la fiche ; `nil` sans étape suivante.
    let gauge: Double?

    var id: String { concept.rawValue }

    /// Les faits que la carte montre.
    var facts: [ProgressionFactID] { [valueFact] + [emblem?.fact].compactMap { $0 } + (line?.facts ?? []) }

    /// Un seul élément pour VoiceOver : le nom, ce que l'emblème montre, la valeur, la ligne — le trait « bouton »
    /// est posé par la vue.
    var accessibilityLabel: String {
        [name, emblem?.label, value, line?.text].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

/// La sous-page d'une fiche (« Aller plus loin ») : le troisième niveau du jeu (`GameNavigationMap`).
enum ProgressionConceptLink: Equatable, Identifiable {
    case page(GamePage)
    case section(ProgressionSection)

    var id: String {
        switch self {
        case .page(let page): "page.\(page.rawValue)"
        case .section(let section): "section.\(section.rawValue)"
        }
    }

    var title: String {
        switch self {
        case .page(.league): ConceptText.linkLeague
        case .page(.season): ConceptText.linkSeason
        case .page(.prestige): ConceptText.linkPrestige
        case .page(.showcase): ConceptText.linkShowcase
        case .page(.atlas): ConceptText.linkAtlas
        case .page(.settings): GameText.doorSettings
        case .section(.badges): ConceptText.linkBadges
        case .section(.defis): ConceptText.linkDefis
        case .section(.succes): ConceptText.linkSucces
        }
    }
}

extension GameCopy {
    /// L'état de la Flamme en une courte phrase ; `nil` quand elle brûle sans rien à signaler.
    static func flameStatus(_ status: FlameStatus) -> String? {
        switch status {
        case .none: String(localized: "game.flame.status.none", defaultValue: "Un geste aujourd’hui allume ta Flamme", bundle: .main)
        case .lit: nil
        case .atRisk: String(localized: "game.flame.status.at_risk", defaultValue: "Fais un geste avant minuit", bundle: .main)
        case .covered: String(localized: "game.flame.status.covered", defaultValue: "Une Veilleuse la garde", bundle: .main)
        case .out: String(localized: "game.flame.status.out", defaultValue: "Éteinte", bundle: .main)
        }
    }

    /// « 23 jours », ou « Flamme à allumer » à zéro : une série nulle ne se dit pas « 0 jour ».
    static func flameDays(_ days: Int) -> String {
        days <= 0
            ? String(localized: "game.flame.no_streak", defaultValue: "Flamme à allumer", bundle: .main)
            : GameCopy.days(days)
    }

    /// « ×1,25 » — un multiplicateur, deux décimales au plus, dans la locale.
    static func factor(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)))
    }

    /// « Flamme · +46 % sur tes rêves » — la forme de la Flamme et ce qu'elle ajoute à tes rêves.
    static func flameFormLine(_ form: FlameFormKey, bonus: Int) -> String {
        String(
            localized: "game.flame.form_line",
            defaultValue: "\(GameCopy.flameFormName(form)) · +\(GameCopy.formatCount(bonus)) % sur tes rêves",
            bundle: .main
        )
    }
}

/// La tête d'une carte, avant que la ligne d'action ne prenne la place de la ligne.
private struct ConceptHeadParts {
    let value: ProgressionFactText
    var emblem: ProgressionEmblemFact?
    let line: ProgressionFactText?
    var urgent: ProgressionFactText?
}

enum ProgressionConceptModel {

    static func count(_ value: Int) -> String { GameCopy.formatCount(value) }

    static func ratio(_ done: Int, _ total: Int) -> String {
        ConceptText.ratio(count(done), count(total))
    }

    private static func share(_ done: Int, _ total: Int) -> Double? {
        total > 0 ? min(1, max(0, Double(done) / Double(total))) : nil
    }

    static func defisDone(_ progress: EngagementProgress) -> Int {
        progress.achievementSections.reduce(0) { $0 + $1.unlockedCount }
    }

    static func defisTotal(_ progress: EngagementProgress) -> Int {
        progress.achievementSections.reduce(0) { $0 + $1.attainableCount }
    }

    // MARK: - Les cartes de la première page

    static func cards(progress: EngagementProgress, game: GameBlock?, now: Date = Date()) -> [ProgressionConceptCard] {
        ProgressionConcepts.served(for: progress, game: game).map { card($0, progress: progress, game: game, now: now) }
    }

    static func card(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                     now: Date = Date()) -> ProgressionConceptCard {
        let head = self.head(concept, progress: progress, game: game, now: now)
        let valueFact = head.value.facts.first ?? .level
        let line = (head.urgent ?? head.line).flatMap { $0.facts.contains(valueFact) ? nil : $0 }
        return ProgressionConceptCard(
            concept: concept,
            name: ConceptText.name(concept),
            value: head.value.text,
            valueFact: valueFact,
            emblem: head.emblem,
            line: line,
            urgent: head.urgent != nil && line == head.urgent,
            gauge: gauge(concept, progress: progress, game: game)
        )
    }

    /// La valeur de la tête (la carte, le héros générique de la fiche, les précisions du héros).
    static func value(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> String {
        head(concept, progress: progress, game: game, now: now).value.text
    }

    // MARK: - La tête de chaque concept

    private static func head(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                             now: Date) -> ConceptHeadParts {
        switch concept {
        case .level: levelHead(progress, game)
        case .points: pointsHead(progress, game)
        case .meesh: meeshHead(progress, game)
        case .glory: gloryHead(game)
        case .flame: flameHead(progress, game)
        case .missions: missionsHead(game, now: now)
        case .league: leagueHead(game)
        case .season: seasonHead(game, now: now)
        case .prestige: prestigeHead(game)
        case .elans: elansHead(progress)
        case .badges: countedHead(.badges, done: progress.badgesEarned, total: progress.badgesTotal)
        case .defis: countedHead(.defis, done: defisDone(progress), total: defisTotal(progress))
        case .succes: countedHead(.succes, done: progress.unlockedAchievementCount, total: progress.achievements.count)
        case .showcase: showcaseHead(game)
        case .atlas: atlasHead(game)
        }
    }

    /// La LUMIÈRE : l'anneau porte le niveau, la valeur nomme l'état de la lumière (épopée § 4 : « anneau 34 · Éclat »).
    private static func levelHead(_ progress: EngagementProgress, _ game: GameBlock?) -> ConceptHeadParts {
        guard let level = game?.level.shown else {
            let scale = progress.level.scale
            return ConceptHeadParts(
                value: ProgressionFactText(GameText.bannerLevel(level: count(progress.level.level)), .level),
                line: scale.remainingToNext.map {
                    ProgressionFactText(ConceptText.chipToLevel(level: count(progress.level.level + 1), points: GameCopy.points($0)), .levelNext)
                } ?? ProgressionFactText(GameCopy.points(scale.value), .score)
            )
        }
        return ConceptHeadParts(
            value: ProgressionFactText(GameCopy.tierName(level.tier), .tier),
            emblem: ProgressionEmblemFact(fact: .level, label: GameText.bannerLevel(level: count(level.level))),
            line: level.nextThreshold == nil
                ? ProgressionFactText(GameCopy.levelTopShort(cap: level.cap), .levelTop)
                : ProgressionFactText(ConceptText.chipToLevel(level: count(level.level + 1), points: GameCopy.points(level.pointsToNext)), .levelNext)
        )
    }

    /// LES ÉTINCELLES : TA LUMIÈRE, lue par son nom (`sparkFacts.pocket`) — jamais `level.score`, la base du niveau, ni
    /// le cycle, ni le total à vie, ni le prix d'une Meesh (il est à l'Héritage). En petit : l'Ombre d'abord, qui ferme
    /// la frappe, sinon le « depuis toujours ».
    private static func pointsHead(_ progress: EngagementProgress, _ game: GameBlock?) -> ConceptHeadParts {
        guard let game else {
            return ConceptHeadParts(value: ProgressionFactText(GameCopy.points(progress.level.scale.value), .sparksPocket), line: nil)
        }
        let head = GameSparksHeadModel(game.level)
        let debt = game.level.sparksDebt ?? 0
        return ConceptHeadParts(
            value: head.pocket,
            line: debt > 0 ? ProgressionFactText(GameFicheCopy.shadow(count(debt)), .sparksDebt) : head.lifetime
        )
    }

    /// L'HÉRITAGE : les Meeshes gardées ; la ligne dit le contenant (« Coffret · le Coffre s'ouvre à 100 »).
    private static func meeshHead(_ progress: EngagementProgress, _ game: GameBlock?) -> ConceptHeadParts {
        let canMint = game?.mint.canMint ?? progress.meesh?.canMint ?? false
        let urgent = canMint ? ProgressionFactText(ConceptText.chipMintReady, .canMint) : nil
        guard let game else {
            guard let meesh = progress.meesh else {
                return ConceptHeadParts(value: ProgressionFactText(GameCopy.meeshes(0), .meeshHeld), line: nil)
            }
            return ConceptHeadParts(
                value: ProgressionFactText(GameCopy.meeshes(meesh.balance), .meeshHeld),
                line: meesh.canMint
                    ? ProgressionFactText(ConceptText.chipNextPrice(GameCopy.points(meesh.mintCost)), .mintPrice)
                    : ProgressionFactText(ConceptText.chipToMeesh(number: count(meesh.mintedLifetime + 1), missing: count(meesh.missingPoints)),
                                          .mintMissing, .mintNext),
                urgent: urgent
            )
        }
        let treasury = game.treasury
        return ConceptHeadParts(
            value: ProgressionFactText(GameCopy.meeshes(progress.meesh?.balance ?? treasury.held), .meeshHeld),
            line: container(treasury),
            urgent: urgent
        )
    }

    /// « Coffret · le Coffre s'ouvre à 100 » : le contenant qu'on possède, puis le suivant — deux faits, une ligne.
    private static func container(_ treasury: TreasuryStanding) -> ProgressionFactText? {
        let opens = treasury.next.map { GameFicheCopy.opens($0.key, at: $0.minHeld) }
        switch (treasury.tier, opens) {
        case (nil, nil): return nil
        case (nil, let opens?): return ProgressionFactText(opens, .treasuryNext)
        case (let tier?, nil): return ProgressionFactText(GameCopy.treasuryName(tier), .treasuryTier)
        case (let tier?, let opens?): return ProgressionFactText(GameCopy.treasuryName(tier) + " · " + opens, .treasuryTier, .treasuryNext)
        }
    }

    private static func gloryHead(_ game: GameBlock?) -> ConceptHeadParts {
        guard let glory = game?.glory else { return ConceptHeadParts(value: ProgressionFactText("", .rank), line: nil) }
        return ConceptHeadParts(
            value: ProgressionFactText(GameCopy.rankLabel(glory), .rank),
            line: ProgressionFactText(GameCopy.gloryAmount(count(glory.glory)), .glory)
        )
    }

    private static func flameHead(_ progress: EngagementProgress, _ game: GameBlock?) -> ConceptHeadParts {
        guard let flame = game?.flame else {
            return ConceptHeadParts(
                value: ProgressionFactText(GameCopy.flameDays(progress.streak.currentDays), .streak),
                line: ProgressionFactText(ProgressionCopy.streakRecord(progress.streak.longestDays), .streakRecord)
            )
        }
        return ConceptHeadParts(
            value: ProgressionFactText(GameCopy.flameDays(flame.days), .streak),
            line: flame.form.map { ProgressionFactText(GameCopy.flameFormLine($0, bonus: min(100, max(0, flame.bonusPercent))), .flameForm) }
                ?? ProgressionFactText(ConceptText.chipFreezesOf(count(flame.freezes), count(flame.maxFreezes)), .freezes),
            urgent: flame.status == .atRisk ? GameCopy.flameStatus(.atRisk).map { ProgressionFactText($0, .flameState) } : nil
        )
    }

    /// LE RÊVE : les actes réalisés ; une porte encore fermée se dit par son seuil, en valeur (« Dès le niveau 5 »).
    private static func missionsHead(_ game: GameBlock?, now: Date) -> ConceptHeadParts {
        guard let game else { return ConceptHeadParts(value: ProgressionFactText("", .missionsDone), line: nil) }
        let missions = game.missions
        guard missions.unlocked else {
            return ConceptHeadParts(
                value: ProgressionFactText(GameText.doorLeagueLocked(level: count(GameMissions.minLevel)), .missionsUnlockLevel), line: nil
            )
        }
        let chest = ProgressionFactText(chestLabel(game.chest.status), .chest)
        return ConceptHeadParts(
            value: ProgressionFactText(ratio(missions.items.filter(\.isCompleted).count, missions.items.count), .missionsDone),
            line: missions.prismDay ? ProgressionFactText(ConceptText.chipPrismDay, .prismDay) : chest,
            urgent: game.chest.status == .ready ? chest : expiring(missions, now: now)
        )
    }

    private static func expiring(_ missions: GameBlock.Missions, now: Date) -> ProgressionFactText? {
        guard let personal = missions.personal, let end = personal.endsAtDate else { return nil }
        let phase = GameMissionClock.phase(start: personal.startsAtDate, end: end, completed: personal.mission.isCompleted, now: now)
        guard case .running = phase else { return nil }
        return GameCopy.missionTimerLine(phase, window: nil).map { ProgressionFactText($0, .missionExpiring) }
    }

    private static func chestLabel(_ status: GameBlock.Chest.Status) -> String {
        switch status {
        case .ready: ConceptText.chipChestReady
        case .locked: ConceptText.chipChestLocked
        case .claimed: ConceptText.chipChestClaimed
        }
    }

    /// LA JOUTE : le nom du cercle, la place en petit ; fermée, son seuil.
    private static func leagueHead(_ game: GameBlock?) -> ConceptHeadParts {
        guard let league = game?.league else { return ConceptHeadParts(value: ProgressionFactText("", .league), line: nil) }
        if league.access == .locked {
            return ConceptHeadParts(
                value: ProgressionFactText(GameText.doorLeagueLocked(level: count(GameLeague.minLevel)), .leagueUnlockLevel), line: nil
            )
        }
        guard let current = GameLeagueDetail.current(of: league) else {
            return ConceptHeadParts(
                value: ProgressionFactText(GameText.doorLeagueOpen, .league),
                line: ProgressionFactText(GameText.leagueFriendsTitle, .leagueFriendsDoor)
            )
        }
        return ConceptHeadParts(
            value: ProgressionFactText(GameText.leagueName(current.league), .league),
            line: ProgressionFactText(GameText.leagueRankLine(rank: count(current.rank), size: count(current.groupSize)), .leaguePlace)
        )
    }

    /// LE VOYAGE : les haltes, la semaine en petit ; avant le premier, la date d'ouverture, jamais un vide.
    private static func seasonHead(_ game: GameBlock?, now: Date) -> ConceptHeadParts {
        guard let season = game?.season else {
            guard let upcoming = game?.seasonUpcoming else {
                return ConceptHeadParts(value: ProgressionFactText(GameText.doorSeasonNone, .season), line: nil)
            }
            // L'état se CALCULE (#10224), comme la page du Voyage : hors ligne, la copie « à venir » bascule d'elle-même
            // à la fermeture du dimanche 20 h qui ouvre le voyage.
            let tense = GameSeason.liveTense(served: .upcoming, startDay: upcoming.startDay, endDay: upcoming.endDay, at: .local(now))
            let value = tense == .upcoming
                ? GameText.doorSeasonUpcoming(date: GameWave2Format.day(upcoming.startDay))
                : GameText.doorSeason(number: count(upcoming.number))
            return ConceptHeadParts(value: ProgressionFactText(value, .season), line: nil)
        }
        return ConceptHeadParts(
            value: ProgressionFactText(GameText.doorSeasonSteps(steps: count(season.steps), total: count(season.stepsTotal)), .seasonSteps),
            line: ProgressionFactText(ConceptText.chipWeekOf(count(season.week), count(GameSeason.weeks)), .seasonWeek)
        )
    }

    private static func prestigeHead(_ game: GameBlock?) -> ConceptHeadParts {
        guard let prestige = game?.prestige else { return ConceptHeadParts(value: ProgressionFactText("", .prestigeStars), line: nil) }
        let door = prestige.stars >= prestige.max ? GameText.bannerTop : GameText.doorPrestigeLocked
        return ConceptHeadParts(
            value: ProgressionFactText(ratio(prestige.stars, prestige.max), .prestigeStars),
            line: ProgressionFactText(door, .prestigeDoor),
            urgent: prestige.canPrestige ? ProgressionFactText(GameText.doorPrestigeReady, .prestigeDoor) : nil
        )
    }

    private static func elansHead(_ progress: EngagementProgress) -> ConceptHeadParts {
        guard let elan = progress.elan else {
            return ConceptHeadParts(value: ProgressionFactText(ConceptText.valueNoElan, .factor), line: ProgressionFactText(families(0), .elanFamilies))
        }
        let value = elan.isAccelerated ? ConceptText.valueFactor(GameCopy.factor(elan.factor)) : ConceptText.valueNoElan
        return ConceptHeadParts(
            value: ProgressionFactText(value, .factor),
            line: ProgressionFactText(families(elan.activeFamilyCount), .elanFamilies)
        )
    }

    private static func countedHead(_ concept: ProgressionConcept, done: Int, total: Int) -> ConceptHeadParts {
        ConceptHeadParts(
            value: ProgressionFactText(ratio(done, total), .earned(concept)),
            line: ProgressionFactText(total > done ? ConceptText.chipToUnlock(count(total - done)) : ConceptText.chipAllDone, .left(concept))
        )
    }

    private static func showcaseHead(_ game: GameBlock?) -> ConceptHeadParts {
        guard let trophies = game?.trophies, !trophies.items.isEmpty else {
            return ConceptHeadParts(value: ProgressionFactText(GameText.doorShowcaseEmpty, .trophies), line: nil)
        }
        return ConceptHeadParts(
            value: ProgressionFactText(GameText.doorShowcaseCount(count: trophies.items.count), .trophies),
            line: game?.visibility.map { ProgressionFactText(ConceptText.chipVisible(GameText.visibilityLabel($0.showcase)), .showcaseVisibility) }
        )
    }

    private static func atlasHead(_ game: GameBlock?) -> ConceptHeadParts {
        guard let atlas = game?.atlas else { return ConceptHeadParts(value: ProgressionFactText("", .atlasStamps), line: nil) }
        return ConceptHeadParts(
            value: ProgressionFactText(ratio(atlas.stamped, atlas.total), .atlasStamps),
            line: ProgressionFactText(GameText.atlasRemaining(remaining: count(max(0, atlas.total - atlas.stamped))), .atlasLeft)
        )
    }

    static func families(_ active: Int) -> String {
        GameCopy.isSingular(active) ? ConceptText.chipFamiliesOne(count(active)) : ConceptText.chipFamiliesOther(count(active))
    }

    // MARK: - La jauge vers l'étape suivante

    static func gauge(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Double? {
        switch concept {
        case .level:
            if let level = game?.level.shown { return level.nextThreshold == nil ? nil : level.progress }
            return progress.level.scale.nextThreshold == nil ? nil : progress.level.scale.progress
        case .points, .elans, .showcase, .prestige, .league:
            return nil
        case .meesh:
            if let mint = game?.mint, mint.price > 0 {
                return share(max(0, mint.price - mint.missingPoints), mint.price)
            }
            return progress.meesh?.progress
        case .glory:
            guard let glory = game?.glory, glory.next != nil else { return nil }
            return glory.progress
        case .flame:
            return progress.streak.scale.nextThreshold == nil ? nil : progress.streak.scale.progress
        case .missions:
            guard let missions = game?.missions, missions.unlocked else { return nil }
            return share(missions.items.filter(\.isCompleted).count, missions.items.count)
        case .season:
            guard let season = game?.season, !season.completed else { return nil }
            return season.progress
        case .badges:
            return share(progress.badgesEarned, progress.badgesTotal)
        case .defis:
            return share(defisDone(progress), defisTotal(progress))
        case .succes:
            return share(progress.unlockedAchievementCount, progress.achievements.count)
        case .atlas:
            guard let atlas = game?.atlas else { return nil }
            return share(atlas.stamped, atlas.total)
        }
    }

    // MARK: - Aller plus loin

    /// « Aller plus loin » : la sous-page du concept, et ELLE SEULE (carte de navigation, amendement n° 4). Aucun lien
    /// transverse : « Comment ça marche » est une porte de la première page, et la fiche porte déjà « C'est quoi ? »
    /// et « Comment en gagner ». Les sept concepts du jeu de base n'en ont pas : la section ne paraît pas.
    static func links(_ concept: ProgressionConcept) -> [ProgressionConceptLink] {
        switch concept {
        case .league: [.page(.league)]
        case .season: [.page(.season)]
        case .prestige: [.page(.prestige)]
        case .badges: [.section(.badges)]
        case .defis: [.section(.defis)]
        case .succes: [.section(.succes)]
        case .showcase: [.page(.showcase)]
        case .atlas: [.page(.atlas)]
        case .level, .points, .meesh, .glory, .flame, .missions, .elans: []
        }
    }

    /// Le concept qu'une ancre du guide (ou d'une notification) désigne : sa FICHE s'ouvre, plus rien ne défile.
    static func concept(for anchor: GameAnchor) -> ProgressionConcept {
        switch anchor {
        case .level: .level
        case .missions: .missions
        case .flame, .flamePanel: .flame
        case .treasury: .meesh
        case .rank: .glory
        case .mint: .meesh
        }
    }

    /// La fiche où une proposition de photo se pose : celle du concept que son emblème célèbre.
    static func concept(for emblem: PhotoEmblem) -> ProgressionConcept {
        switch emblem {
        case .start, .tier, .levelHundred: .level
        case .rank: .glory
        case .meesh, .treasury: .meesh
        case .flame: .flame
        case .achievement: .succes
        case .mission: .missions
        case .trophy: .showcase
        case .leagueUp: .league
        case .season: .season
        case .prestige: .prestige
        }
    }
}

// MARK: - La phrase d'état d'un concept (#10540)

/// LA PHRASE D'ÉTAT — retour du porteur : « j'ai 77 099 points, il te manque 1 839 points, points à convertir 5 823,
/// niveau 27 ». Trois chiffres justes qui mesurent trois choses, et l'écran ne disait pas lesquelles. Chaque valeur en
/// cours peut être suivie d'UNE phrase qui dit l'étape où l'on est et ce que le chiffre vise : le niveau suivant, la
/// prochaine Meesh, le rang, la zone de montée. MIROIR de `conceptStateOf`
/// (`apps/web/src/lib/view/progression-state.ts`).
///
/// CHAQUE PHRASE DIT LES FAITS QU'ELLE PORTE (#11180, épopée § 3.3) : une fiche dont la tête dit déjà l'un d'eux ne
/// la rend pas (`ProgressionConceptFiche`) — un fait ne paraît qu'une fois par écran.
///
/// Pure : le bloc `game` et la progression sont lus tels que servis, puis habillés par le catalogue. Ce que le serveur
/// ne sert pas n'a pas de phrase (`nil`) : rien n'est inventé.
extension ProgressionConceptModel {

    /// Le solde à convertir : celui du porte-monnaie servi ; sans lui, une frappe impossible le DIT (le prix moins le
    /// manque) ; possible, il reste inconnu — jamais déduit du score.
    static func convertiblePoints(progress: EngagementProgress, game: GameBlock?) -> Int? {
        if let meesh = progress.meesh { return meesh.debitablePoints }
        guard let mint = game?.mint, !mint.canMint else { return nil }
        return max(0, mint.price - mint.missingPoints)
    }

    /// La phrase d'état seule.
    static func state(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> String? {
        stateLine(concept, progress: progress, game: game)?.text
    }

    /// La phrase d'état et les faits qu'elle enchâsse.
    static func stateLine(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> ProgressionFactText? {
        switch concept {
        case .level: levelState(progress, game)
        case .points: pointsState(progress, game)
        case .meesh: meeshState(progress, game)
        case .glory: gloryState(game)
        case .flame: flameState(progress, game)
        case .missions: missionsState(game)
        case .league: leagueState(game)
        case .season: seasonState(game)
        case .prestige: prestigeState(game)
        case .elans: elansState(progress)
        case .badges: countedState(.badges, done: progress.badgesEarned, total: progress.badgesTotal)
        case .defis: countedState(.defis, done: defisDone(progress), total: defisTotal(progress))
        case .succes: countedState(.succes, done: progress.unlockedAchievementCount, total: progress.achievements.count)
        case .showcase: showcaseState(game)
        case .atlas: atlasState(game)
        }
    }

    private static func levelState(_ progress: EngagementProgress, _ game: GameBlock?) -> ProgressionFactText? {
        guard let block = game?.level else {
            let scale = progress.level.scale
            guard let next = scale.nextThreshold else { return ProgressionFactText(GameCopy.levelTop(cap: nil), .levelTop) }
            return ProgressionFactText(
                ConceptText.stateLevelSimple(level: count(progress.level.level), left: GameCopy.points(max(0, next - scale.value)),
                                             next: count(progress.level.level + 1)),
                .level, .levelNext
            )
        }
        let level = block.shown
        // Retenu par une épreuve (#9706) : la phrase dit l'épreuve, jamais « il en reste 0 ».
        if level.held, let step = level.step { return ProgressionFactText(GameCopy.levelHeld(step), .levelStep) }
        guard let next = level.nextThreshold else { return ProgressionFactText(GameCopy.levelTop(cap: level.cap), .level, .levelTop) }
        return ProgressionFactText(
            ConceptText.stateLevelProgress(
                level: count(level.level), done: GameCopy.points(max(0, block.score - level.floorScore)),
                span: count(next - level.floorScore), left: count(level.pointsToNext), next: count(level.level + 1)
            ),
            .level, .levelProgress, .levelNext
        )
    }

    private static func pointsState(_ progress: EngagementProgress, _ game: GameBlock?) -> ProgressionFactText? {
        guard let game else { return nil }
        let mint = game.mint
        let number = count(mint.number)
        let price = GameCopy.points(mint.price)
        let facts: [ProgressionFactID] = mint.canMint
            ? [.sparksPocket, .mintNext, .mintPrice]
            : [.sparksPocket, .mintNext, .mintPrice, .mintMissing]
        // Les étincelles (#10846) : UN seul solde, la poche, toute convertible — jamais le cycle, indicatif (#10892).
        if game.level.sparks != nil {
            let pocket = GameCopy.points(game.level.sparkFacts.pocket)
            let text = mint.canMint
                ? ConceptText.statePointsReadyPlain(held: pocket, number: number, price: price)
                : ConceptText.statePointsMissingPlain(held: pocket, number: number, price: price, missing: GameCopy.points(mint.missingPoints))
            return ProgressionFactText(text: text, facts: facts)
        }
        let held = GameCopy.points(game.level.score)
        guard let convertible = convertiblePoints(progress: progress, game: game) else {
            return ProgressionFactText(text: ConceptText.statePointsReadyPlain(held: held, number: number, price: price), facts: facts)
        }
        let toConvert = GameCopy.convertiblePoints(convertible)
        guard !mint.canMint else {
            return ProgressionFactText(text: ConceptText.statePointsReady(held: held, convertible: toConvert, number: number, price: price),
                                       facts: facts)
        }
        return ProgressionFactText(
            text: ConceptText.statePointsMissing(held: held, convertible: toConvert, number: number, price: price,
                                                 missing: GameCopy.convertiblePoints(mint.missingPoints)),
            facts: facts
        )
    }

    private static func meeshState(_ progress: EngagementProgress, _ game: GameBlock?) -> ProgressionFactText? {
        guard let game else { return nil }
        let mint = game.mint
        let balance = progress.meesh?.balance ?? game.treasury.held
        let minted = count(progress.meesh?.mintedLifetime ?? max(0, mint.number - 1))
        let kept = balance <= 0
            ? ProgressionFactText(ConceptText.stateMeeshKeptNone(minted: minted), .meeshHeld, .minted)
            : ProgressionFactText(ConceptText.stateMeeshKept(balance: GameCopy.meeshes(balance), minted: minted), .meeshHeld, .minted)
        let number = count(mint.number)
        let price = GameCopy.points(mint.price)
        let next = mint.canMint
            ? ProgressionFactText(ConceptText.stateMeeshNextReady(number: number, price: price), .mintNext, .mintPrice)
            : ProgressionFactText(ConceptText.stateMeeshNextMissing(number: number, price: price, missing: GameCopy.convertiblePoints(mint.missingPoints)),
                                  .mintNext, .mintPrice, .mintMissing)
        return kept.then(next)
    }

    private static func gloryState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let glory = game?.glory else { return nil }
        let rank = GameCopy.rankLabel(glory)
        let held = count(glory.glory)
        guard let next = glory.next else { return ProgressionFactText(ConceptText.stateGloryTop(rank: rank, glory: held), .rank, .glory) }
        return ProgressionFactText(
            ConceptText.stateGloryNext(
                rank: rank, glory: held, missing: count(glory.gloryMissing ?? max(0, next.minGlory - glory.glory)),
                next: GameCopy.rankLabel(next.rank, division5: next.shownDivision)
            ),
            .rank, .glory, .gloryMissing, .rankNext
        )
    }

    private static func flameState(_ progress: EngagementProgress, _ game: GameBlock?) -> ProgressionFactText? {
        guard let flame = game?.flame else {
            let streak = progress.streak
            guard streak.currentDays > 0 else { return ProgressionFactText(ConceptText.stateFlameNone) }
            return ProgressionFactText(ConceptText.stateFlameStreak(days: GameCopy.days(streak.currentDays), record: GameCopy.days(streak.longestDays)),
                                       .streak, .streakRecord)
        }
        let days = GameCopy.days(flame.days)
        switch flame.status {
        case .none: return ProgressionFactText(ConceptText.stateFlameNone)
        case .out: return ProgressionFactText(ConceptText.stateFlameOut, .flameState)
        case .atRisk: return ProgressionFactText(ConceptText.stateFlameAtRisk(days: days), .streak, .flameState)
        case .covered: return ProgressionFactText(ConceptText.stateFlameCovered(days: days), .streak, .flameState)
        case .lit:
            return ProgressionFactText(
                ConceptText.stateFlameLit(days: days, bonus: count(min(100, max(0, flame.bonusPercent))), freezes: ratio(flame.freezes, flame.maxFreezes)),
                .streak, .flameForm, .freezes
            )
        }
    }

    private static func missionsState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let game else { return nil }
        let missions = game.missions
        guard missions.unlocked else {
            return ProgressionFactText(GameCopy.missionsLocked(level: count(game.level.shown.level)), .missionsUnlockLevel, .level)
        }
        let total = missions.items.count
        let done = missions.items.filter(\.isCompleted).count
        switch game.chest.status {
        case .claimed: return ProgressionFactText(ConceptText.stateMissionsClaimed(done: count(done), total: count(total)), .missionsDone, .chest)
        case .ready: return ProgressionFactText(ConceptText.stateMissionsReady(done: count(done), total: count(total)), .missionsDone, .chest)
        case .locked:
            return ProgressionFactText(ConceptText.stateMissionsProgress(done: count(done), total: count(total), left: count(max(0, total - done))),
                                       .missionsDone)
        }
    }

    private static func leagueState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let game, let league = game.league else { return nil }
        if league.access == .locked {
            return ProgressionFactText(GameText.leagueLocked(level: count(GameLeague.minLevel), current: count(game.level.shown.level)),
                                       .leagueUnlockLevel, .level)
        }
        guard let current = GameLeagueDetail.current(of: league) else { return ProgressionFactText(ConceptText.stateLeagueUnplaced, .league) }
        let place = ProgressionFactText(
            ConceptText.stateLeaguePlace(league: GameText.leagueName(current.league), rank: count(current.rank),
                                         size: count(current.groupSize), points: GameCopy.points(current.weekPoints)),
            .league, .leaguePlace, .weekPoints
        )
        guard let zone = leagueZoneState(current) else { return place }
        return place.then(zone)
    }

    /// La zone, avec ce qu'il manque pour la zone de MONTÉE — la cible est dans la phrase.
    private static func leagueZoneState(_ current: GameLeagueBlock.Current) -> ProgressionFactText? {
        if current.zone == .promotion { return ProgressionFactText(ConceptText.stateLeagueZonePromotion, .leagueZone) }
        guard let missing = current.pointsToPromotion, missing > 0 else { return nil }
        switch current.zone {
        case .promotion: return ProgressionFactText(ConceptText.stateLeagueZonePromotion, .leagueZone)
        case .safe: return ProgressionFactText(ConceptText.stateLeagueZoneSafe(missing: GameCopy.points(missing)), .leagueZone, .leagueMissing)
        case .relegation: return ProgressionFactText(ConceptText.stateLeagueZoneRelegation(missing: GameCopy.points(missing)), .leagueZone, .leagueMissing)
        }
    }

    private static func seasonState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let game else { return nil }
        guard let season = game.season else { return ProgressionFactText(GameText.seasonNone, .season) }
        let number = count(season.number)
        let week = count(season.week)
        let weeks = count(GameSeason.weeks)
        let total = count(season.stepsTotal)
        guard season.steps < season.stepsTotal else {
            return ProgressionFactText(ConceptText.stateSeasonDone(number: number, week: week, weeks: weeks, total: total),
                                       .season, .seasonWeek, .seasonSteps)
        }
        return ProgressionFactText(
            ConceptText.stateSeasonProgress(number: number, week: week, weeks: weeks, steps: count(season.steps), total: total,
                                            stars: GameText.seasonStars(count: season.starsToNext)),
            .season, .seasonWeek, .seasonSteps, .seasonNext
        )
    }

    private static func prestigeState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let game, let prestige = game.prestige else { return nil }
        if prestige.canPrestige { return ProgressionFactText(GameText.prestigeMee, .prestigeDoor, .level) }
        if prestige.stars >= prestige.max { return ProgressionFactText(GameText.prestigeMax, .prestigeDoor) }
        return ProgressionFactText(GameText.prestigeLocked(level: count(game.level.shown.level)), .prestigeDoor, .level)
    }

    private static func elansState(_ progress: EngagementProgress) -> ProgressionFactText? {
        guard let elan = progress.elan else { return nil }
        let active = families(elan.activeFamilyCount)
        return elan.isAccelerated
            ? ProgressionFactText(ConceptText.stateElansActive(factor: GameCopy.factor(elan.factor), families: active), .factor, .elanFamilies)
            : ProgressionFactText(ConceptText.stateElansIdle(families: active), .elanFamilies)
    }

    private static func countedState(_ concept: ProgressionConcept, done: Int, total: Int) -> ProgressionFactText? {
        guard total > 0 else { return nil }
        guard done < total else {
            return ProgressionFactText(ConceptText.stateCountComplete(done: count(done), total: count(total)), .earned(concept))
        }
        let left = count(total - done)
        let text = switch concept {
        case .defis: ConceptText.stateCountDefis(done: count(done), total: count(total), left: left)
        case .succes: ConceptText.stateCountSucces(done: count(done), total: count(total), left: left)
        default: ConceptText.stateCountBadges(done: count(done), total: count(total), left: left)
        }
        return ProgressionFactText(text, .earned(concept), .left(concept))
    }

    private static func showcaseState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let game, let trophies = game.trophies else { return nil }
        guard !trophies.items.isEmpty else { return ProgressionFactText(GameText.showcaseEmpty, .trophies) }
        return ProgressionFactText(
            ConceptText.stateShowcaseCount(
                trophies: GameText.doorShowcaseCount(count: trophies.items.count),
                who: GameText.visibilityLabel(game.visibility?.showcase ?? GameTrophies.defaultVisibility)
            ),
            .trophies, .showcaseVisibility
        )
    }

    private static func atlasState(_ game: GameBlock?) -> ProgressionFactText? {
        guard let atlas = game?.atlas else { return nil }
        guard atlas.stamped > 0 || !atlas.pending.isEmpty else { return ProgressionFactText(GameText.atlasEmpty, .atlasStamps) }
        return ProgressionFactText(
            ConceptText.stateAtlasProgress(stamped: count(atlas.stamped), total: count(atlas.total), pending: count(atlas.pending.count)),
            .atlasStamps, .atlasPending
        )
    }
}
