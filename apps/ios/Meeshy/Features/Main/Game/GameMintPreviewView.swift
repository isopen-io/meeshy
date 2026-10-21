import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE CADRE DE LA FRAPPE (#9537 ; épopée § 5, #11180) — LA section de frappe du jeu, et la seule. Dans la fiche de
/// l'Héritage, il suit la tête (ce que tu gardes) et dit, dans cet ordre :
///
///  1. la SCÈNE, sur toute la largeur : Mee, l'enclume, le flan, Meo et son marteau (`MintStrikeScene`) ;
///  2. « La Meesh n° 92 » ;
///  3. UNE phrase, où le prix paraît UNE fois : « Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. » ;
///  4. le bouton « Frapper avec Mee et Meo », avec « +1 000 de gloire » en petit DANS le bouton ;
///  5. une phrase de Mee, sous l'action.
///
/// Aucun calcul (ni « Restera », ni niveau d'après, ni prix de base, ni rang d'après) : il vit dans les règles. Quand la
/// frappe n'est pas possible, aucun bouton grisé (directive du porteur) : ce qu'il manque, ou ce qui la ferme (l'Ombre,
/// un rang). La frappe confirmée par la passerelle retourne la pièce sur son revers numéroté. Chaque chiffre déclare
/// son identité (`GameFactsTag`) : un fait ne paraît qu'une fois par écran. Miroir de
/// `apps/web/src/components/game-mint-preview.tsx`.
struct GameMintPreviewView: View {
    let game: GameBlock
    let online: Bool
    let minting: Bool
    let error: String?
    let celebration: MintCelebration?
    let onMint: () -> Void
    var haptics: GameHapticsProviding = GameHaptics.shared

    private var theme: ThemeManager { ThemeManager.shared }
    private var mint: GameMintPreview { game.mint }

    /// Ce que le cadre dit, pur.
    var model: GameMintFrameModel { GameMintFrameModel(mint: mint, pocket: game.level.sparkFacts.pocket) }

    /// La scène occupe la bande ; une pièce plus large que 84 pt pousserait Mee et Meo hors d'une carte de 320 pt.
    static let bandCoinSide: CGFloat = 84

    var body: some View {
        let frame = model
        GameCard(tint: MeeshyColors.warning, anchor: .mint) {
            band
            line(frame.title, font: MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold), identifier: "game.mint.title")
                .accessibilityAddTraits(.isHeader)
            if let celebration {
                Text(String(
                    localized: "game.mint.minted_line",
                    defaultValue: "Meesh n° \(GameCopy.formatCount(celebration.number)) frappée, \(GameCopy.editionName(celebration.edition)).",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .accessibilityAddTraits(.updatesFrequently)
                .accessibilityIdentifier("game.mint.celebration")
            }
            line(frame.sentence, font: MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium), identifier: "game.mint.sentence")
            if let missing = frame.missing {
                line(missing, font: MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold), identifier: "game.mint.missing")
            }
            // L'Ombre, puis la réserve fermée par le rang (#10848) : la frappe ne se tente pas, l'écran dit pourquoi.
            if let blocker = frame.blocker {
                GameNote(text: blocker.text)
                    .modifier(GameFactsTag(blocker.facts))
                    .accessibilityIdentifier("game.mint.blocked")
            }
            if let glory = frame.glory {
                action(glory)
            }
            meeLine(frame.mee)
            if !minting {
                GameErrorLine(message: error, identifier: "game.mint.error")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.mint.hero")
        .adaptiveOnChange(of: celebration?.key) { _, key in
            if key != nil { haptics.play(GameHapticPattern.strike) }
        }
    }

    // MARK: - La bande de la scène

    private var band: some View {
        MintStrikeScene(
            edition: celebration?.edition ?? mint.edition,
            number: celebration?.number ?? mint.number,
            year: Calendar.current.component(.year, from: Date()),
            play: celebration?.key ?? 0,
            coinSide: Self.bandCoinSide,
            restsReversed: celebration != nil
        )
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityIdentifier("game.mint.band")
    }

    private func line(_ said: ProgressionFactText, font: Font, identifier: String) -> some View {
        Text(said.text)
            .font(font)
            .foregroundStyle(theme.textPrimary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .modifier(GameFactsTag(said.facts))
            .accessibilityIdentifier(identifier)
    }

    // MARK: - L'action, la gloire dans le bouton

    @ViewBuilder
    private func action(_ glory: ProgressionFactText) -> some View {
        GameActionButton(
            title: String(localized: "game.mint.action", defaultValue: "Frapper avec Mee et Meo", bundle: .main),
            busyTitle: String(localized: "game.mint.minting", defaultValue: "Frappe en cours…", bundle: .main),
            detail: glory.text,
            busy: minting, disabled: !online, identifier: minting ? "game.mint.minting" : "game.mint.action",
            action: onMint
        )
        .modifier(GameFactsTag(glory.facts))
        if !online {
            GameNote(text: String(localized: "game.mint.offline", defaultValue: "Hors ligne : la frappe reprendra avec la connexion.", bundle: .main))
        }
    }

    // MARK: - La phrase de Mee

    private func meeLine(_ said: ProgressionFactText) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
            MeeStickerFilmView(filmID: "mee-sourire", animated: false, side: 28, animates: false, pixelCap: 112)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)
            Text(said.text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .italic()
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .modifier(GameFactsTag(said.facts))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("game.mint.mee")
    }
}

/// CE QUE LE CADRE DE LA FRAPPE DIT (#11180), pur : chaque ligne et les faits qu'elle porte. Le prix ne paraît que
/// dans la phrase ; aucune ligne ne soustrait, ne pourcente ni ne prédit un « après ».
struct GameMintFrameModel: Equatable {
    /// « La Meesh n° 92 ».
    let title: ProgressionFactText
    /// « Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. »
    let sentence: ProgressionFactText
    /// « Il en manque encore 1 839 pour la frapper. » ; `nil` quand rien ne manque.
    let missing: ProgressionFactText?
    /// L'Ombre ou la réserve fermée : ce qui ferme la frappe.
    let blocker: ProgressionFactText?
    /// « +1 000 de gloire », dans le bouton ; `nil` sans bouton (frappe impossible).
    let glory: ProgressionFactText?
    /// La phrase de Mee, sous l'action.
    let mee: ProgressionFactText

    init(mint: GameMintPreview, pocket: Int) {
        title = ProgressionFactText(
            String(localized: "game.mint.next_title", defaultValue: "La Meesh n° \(GameCopy.formatCount(mint.number))", bundle: .main),
            .mintNext
        )
        sentence = ProgressionFactText(
            GameFicheCopy.mintSentence(price: GameCopy.points(mint.price), held: GameCopy.formatCount(pocket)),
            .mintPrice, .sparksPocket
        )
        missing = !mint.canMint && mint.missingPoints > 0
            ? ProgressionFactText(GameFicheCopy.mintMissing(GameCopy.formatCount(mint.missingPoints)), .mintMissing)
            : nil
        blocker = Self.blocker(mint)
        glory = mint.canMint
            ? ProgressionFactText(
                String(localized: "game.mint.chip.glory", defaultValue: "+\(GameCopy.formatCount(mint.gloryGained)) de gloire", bundle: .main),
                .mintGlory)
            : nil
        mee = Self.mee(mint)
    }

    private static func blocker(_ mint: GameMintPreview) -> ProgressionFactText? {
        guard let message = GameMintCostCopy.blockerMessage(mint) else { return nil }
        switch mint.blocker {
        case .sparksDebt: return ProgressionFactText(message, .sparksDebt)
        case .treasuryLocked: return ProgressionFactText(message, .treasuryLocked)
        case .missingSparks, nil: return ProgressionFactText(text: message, facts: [])
        }
    }

    /// La pièce qui vient, quand elle est d'or ou de prisme ; sinon la prochaine qui le sera ; et, frappe impossible,
    /// l'envie d'y revenir.
    private static func mee(_ mint: GameMintPreview) -> ProgressionFactText {
        guard mint.canMint else { return ProgressionFactText(GameFicheCopy.meeWait) }
        switch mint.edition {
        case .gold: return ProgressionFactText(GameFicheCopy.meeGold)
        case .prism: return ProgressionFactText(GameFicheCopy.meePrism)
        case .silver:
            let special = (max(1, mint.number) + 99) / 100 * 100
            let number = GameCopy.formatCount(special)
            let text = GameMint.edition(forNumber: special) == .prism ? GameFicheCopy.meeNextPrism(number) : GameFicheCopy.meeNextGold(number)
            return ProgressionFactText(text, .mintNextSpecial)
        }
    }

    /// Les faits du cadre, dans l'ordre de lecture.
    var facts: [ProgressionFactID] {
        [title, sentence, missing, blocker, glory, mee].compactMap { $0 }.flatMap(\.facts)
    }

    /// Tout ce que le cadre écrit.
    var texts: [String] { [title, sentence, missing, blocker, glory, mee].compactMap { $0?.text } }
}
