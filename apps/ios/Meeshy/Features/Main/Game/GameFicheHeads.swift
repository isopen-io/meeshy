import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA TÊTE DES FICHES DES ÉTINCELLES ET DE L'HÉRITAGE (#11180, épopée § 3.3 et § 5) — chacune répond à UNE question,
/// et son plus gros chiffre y répond : « combien d'étincelles ai-je ? » (ta lumière, la poche) et « qu'est-ce que je
/// garde ? » (les Meeshes de ton Héritage). Un nom en petit au-dessus, le chiffre en grand, puis deux tailles au plus :
/// le contenant suivant, puis le « depuis toujours ». Aucun calcul, aucun prix : le prix vit dans le cadre de la
/// frappe, une fois. MIROIR de `apps/web/src/components/game-fiche-heads.tsx`.

/// TA LUMIÈRE : la poche en grand, lue PAR SON NOM (`sparkFacts.pocket`) — jamais `level.score`, la base du niveau
/// qui ne la recouvre que tant que la loi du niveau lit la poche (#10892). Ni le cycle, ni le total à vie en grand :
/// le « depuis toujours » vient dessous, en petit. Une Ombre passe AVANT tout : tant qu'elle est là, on ne frappe pas.
struct GameSparksHeadModel: Equatable {
    /// L'Ombre, en une ligne, quand elle existe.
    let shadow: ProgressionFactText?
    let label: String
    let pocket: ProgressionFactText
    /// « 377 752 reçues depuis toujours » ; `nil` devant un serveur d'avant les étincelles.
    let lifetime: ProgressionFactText?

    init(_ level: GameBlock.Level) {
        let debt = level.sparksDebt ?? 0
        shadow = debt > 0 ? ProgressionFactText(GameMintCostCopy.debtText(debt), .sparksDebt) : nil
        label = GameFicheCopy.lightLabel
        pocket = ProgressionFactText(GameCopy.points(level.sparkFacts.pocket), .sparksPocket)
        lifetime = level.sparkLedger.map {
            ProgressionFactText(GameSparksCopy.cumulLine(cycle: $0.cycle, lifetime: $0.lifetime), .sparksLifetime)
        }
    }

    /// Les faits que la tête montre, dans l'ordre de lecture.
    var facts: [ProgressionFactID] { [shadow, pocket, lifetime].compactMap { $0 }.flatMap(\.facts) }
}

/// L'HÉRITAGE : la DERNIÈRE pièce frappée en emblème, le contenant en tête (« Ton Coffret »), les Meeshes gardées en
/// grand, le contenant suivant, les frappées depuis toujours.
struct GameHeritageHeadModel: Equatable {
    let label: ProgressionFactText
    let held: ProgressionFactText
    /// « le Coffre s’ouvre à 100 » ; `nil` à la dernière réserve.
    let opens: ProgressionFactText?
    /// « 91 frappées depuis toujours » ; `nil` quand rien n'a été frappé ou que le serveur ne le sert pas.
    let minted: ProgressionFactText?
    /// La dernière pièce frappée (#11483) : son numéro est le compte des frappées depuis toujours, et elle se dessine
    /// dans son édition d'AFFICHAGE — le n° 247, frappé après le n° 100, est d'or. `nil` : rien de frappé, le flan.
    let coin: GameHeritageCoin?

    init(balance: Int, treasury: TreasuryStanding, minted: Int?) {
        label = ProgressionFactText(text: GameFicheCopy.held(treasury.tier), facts: treasury.tier == nil ? [] : [.treasuryTier])
        held = ProgressionFactText(GameCopy.meeshes(balance), .meeshHeld)
        opens = treasury.next.map { ProgressionFactText(GameFicheCopy.opens($0.key, at: $0.minHeld), .treasuryNext) }
        self.minted = minted.flatMap { $0 > 0 ? ProgressionFactText(GameFicheCopy.minted($0), .minted) : nil }
        coin = minted.flatMap { $0 > 0 ? GameHeritageCoin(number: $0) : nil }
    }

    /// Ce que l'état SERT : les Meeshes du portefeuille (le trésor à défaut), le contenant du jeu, les frappées.
    static func served(progress: EngagementProgress, game: GameBlock) -> GameHeritageHeadModel {
        GameHeritageHeadModel(
            balance: progress.meesh?.balance ?? game.treasury.held, treasury: game.treasury, minted: progress.meesh?.mintedLifetime
        )
    }

    var facts: [ProgressionFactID] { [label, held, opens, minted].compactMap { $0 }.flatMap(\.facts) }
}

/// La pièce de la tête de l'Héritage : un numéro, et l'édition qu'on y DESSINE (`GameMint.displayEdition`).
struct GameHeritageCoin: Hashable {
    let number: Int
    let edition: MeeshEdition

    init(number: Int) {
        self.number = number
        edition = GameMint.displayEdition(forNumber: number)
    }
}

/// LA TÊTE RETENUE PENDANT LA FRAPPE (#11482) — l'écran est optimiste : le compte monte dès le toucher, et la passerelle
/// confirme pendant la cérémonie. La tête de l'Héritage garde donc ce qu'elle montrait AU TOUCHER — le compte, le
/// contenant, la dernière pièce — tant que la cérémonie n'est pas finie (au bout, ou passée d'un toucher) ET que la
/// passerelle n'a pas réglé la frappe. Ensuite seulement elle rattrape ce que l'état SERT : une pièce de plus, ou rien
/// de changé après un refus (l'instantané d'avant est restauré).
struct GameHeritageHold: Equatable {
    /// Ce que la tête montrait au toucher.
    let before: GameHeritageHeadModel
    /// La dernière frappe réglée au toucher : la réponse qui libère la tête est la PREMIÈRE réglée après lui.
    let settledKey: Int
    /// La cérémonie est finie : au bout, ou passée d'un toucher.
    let ceremonyEnded: Bool

    init(before: GameHeritageHeadModel, settled: GameMintSettlement?, ceremonyEnded: Bool = false) {
        self.before = before
        settledKey = settled?.key ?? 0
        self.ceremonyEnded = ceremonyEnded
    }

    /// La même retenue, cérémonie finie.
    func ended() -> GameHeritageHold {
        GameHeritageHold(before: before, settledKey: settledKey, ceremonyEnded: true)
    }

    private init(before: GameHeritageHeadModel, settledKey: Int, ceremonyEnded: Bool) {
        self.before = before
        self.settledKey = settledKey
        self.ceremonyEnded = ceremonyEnded
    }

    /// La tête est libérée : la cérémonie est finie et la passerelle a répondu depuis le toucher.
    func isReleased(by settled: GameMintSettlement?) -> Bool {
        ceremonyEnded && (settled?.key ?? 0) > settledKey
    }

    /// Ce que la tête montre : ce qu'elle montrait au toucher tant qu'elle est retenue, sinon ce que l'état sert.
    static func shown(served: GameHeritageHeadModel, hold: GameHeritageHold?, settled: GameMintSettlement?) -> GameHeritageHeadModel {
        guard let hold, !hold.isReleased(by: settled) else { return served }
        return hold.before
    }
}

/// Le gabarit commun des deux têtes : centré, un nom en petit, UN chiffre en grand, puis le secondaire et le tertiaire.
struct GameFicheHead<Emblem: View>: View {
    let shadow: ProgressionFactText?
    let label: ProgressionFactText
    let big: ProgressionFactText
    let secondary: ProgressionFactText?
    let tertiary: ProgressionFactText?
    let identifier: String
    @ViewBuilder let emblem: () -> Emblem

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            if let shadow {
                Text(shadow.text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(GameFactsTag(shadow.facts))
                    .accessibilityIdentifier("\(identifier).shadow")
            }
            emblem()
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)
            Text(label.text)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(GameFactsTag(label.facts))
                .accessibilityAddTraits(.isHeader)
            Text(big.text)
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .bold, design: .rounded))
                .foregroundStyle(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(GameValueRoll(value: big.text))
                .modifier(GameFactsTag(big.facts))
                .accessibilityIdentifier("\(identifier).value")
            if let secondary {
                Text(secondary.text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(GameFactsTag(secondary.facts))
            }
            if let tertiary {
                Text(tertiary.text)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(GameFactsTag(tertiary.facts))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xl)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

/// La tête des Étincelles.
struct GameSparksHeadView: View {
    let model: GameSparksHeadModel

    var body: some View {
        GameFicheHead(
            shadow: model.shadow, label: ProgressionFactText(text: model.label, facts: []), big: model.pocket,
            secondary: model.lifetime, tertiary: nil, identifier: "game.fiche.light"
        ) {
            ConceptMarkView(kind: .points)
        }
    }
}

/// La tête de l'Héritage : la dernière pièce frappée, dans son édition dessinée, prend la tête à la fin de la frappe —
/// un mouvement court, aucun sous « Réduire les animations ».
struct GameHeritageHeadView: View {
    let model: GameHeritageHeadModel

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GameFicheHead(
            shadow: nil, label: model.label, big: model.held, secondary: model.opens, tertiary: model.minted,
            identifier: "game.fiche.heritage"
        ) {
            ZStack {
                GameHeritageCoinView(coin: model.coin)
                    .id(model.coin)
                    .transition(reduceMotion ? .identity : .scale(scale: 0.6).combined(with: .opacity))
            }
            .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.7), value: model.coin)
        }
    }
}

/// La dernière pièce frappée, côté revers (son oiseau et son numéro) ; le flan d'argent quand rien n'a été frappé.
private struct GameHeritageCoinView: View, Equatable {
    let coin: GameHeritageCoin?

    var body: some View {
        if let coin {
            MeeshCoinView(face: .reverse(number: coin.number, year: Calendar.current.component(.year, from: Date())),
                          edition: coin.edition, figures: nil)
        } else {
            MeeshCoinView(face: .obverse, edition: .silver, figures: nil)
        }
    }
}
