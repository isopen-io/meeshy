import Foundation
import MeeshySDK

/// La DERNIÈRE frappe réglée par la passerelle, telle que la cérémonie la reçoit : une pièce (frappée, ou déjà frappée
/// par la même intention), ou un refus et son code. Le compteur la distingue de la frappe d'avant.
struct GameMintSettlement: Equatable {
    enum Outcome: Equatable {
        case minted(number: Int?)
        case refused(code: String?)
    }

    let outcome: Outcome
    let key: Int

    /// Ce que la passerelle a répondu à une frappe qu'elle a acceptée : « insufficient » est un refus (la lumière ne
    /// suffit pas), « minted » et « already-minted » une pièce (miroir de `routes/progression-game-actions.ts`).
    static func outcome(of result: APIMeeshMintResult, preview: GameMintPreview?) -> Outcome {
        result.status == "insufficient"
            ? .refused(code: GameErrorCode.insufficientPoints.rawValue)
            : .minted(number: result.number ?? preview?.number)
    }

    /// Le code d'une frappe que la passerelle a refusée : le sien, `NETWORK` quand le réseau ne l'a pas portée, sinon aucun.
    static func refusalCode(for error: Error) -> String? {
        if let refusal = GameService.refusal(of: error) { return refusal.rawValue }
        if error is URLError { return GameMintCeremony.networkRefusalCode }
        if case MeeshyError.network = error { return GameMintCeremony.networkRefusalCode }
        return nil
    }
}

/// La réponse de la passerelle, telle que la scène la reçoit.
enum MintCeremonyAnswer: Equatable {
    case pending
    case confirmed(number: Int)
    case refused(code: String?)
}

/// LA GLOIRE DE LA FRAPPE (#19859, miroir de `MintCeremonyGlory` du web) : la Gloire du joueur AVANT le geste, celle que
/// l'aperçu promet et le Mythe servi. La scène finit sur la gloire gagnée ET le pas vers le rang suivant.
struct MintCeremonyGlory: Equatable, Sendable {
    let before: Int
    let gained: Int
    let mythic: Bool

    /// Lue AU GESTE : la Gloire que la passerelle rafraîchit pendant la scène ne compte pas deux fois.
    init(mint: GameMintPreview, glory: GameBlock.Glory) {
        before = glory.glory
        gained = mint.gloryGained
        mythic = glory.rank == .mythe
    }

    init(before: Int, gained: Int, mythic: Bool) {
        self.before = before
        self.gained = gained
        self.mythic = mythic
    }

    /// La gloire que la scène écrit : celle que l'aperçu sert, la constante de la frappe en repli.
    var shownGain: Int { gained > 0 ? gained : GameGlory.points.mint }

    /// Le pas vers le rang suivant : la marche franchie, ou la gloire qui manque ; `nil` pour le Mythe et en Légende I.
    var step: GloryAfterGain? { GameGlory.afterGain(before: before, gained: shownGain, mythic: mythic) }
}

/// UNE cérémonie demandée par un toucher : la pièce que l'écran annonçait, et la dernière frappe réglée au moment du
/// toucher — la réponse qui compte est la PREMIÈRE réglée après lui.
///
/// La pièce a DEUX éditions (#11483) : la LOI (`edition`, le numéro du centième ou du millième) décide de la
/// chorégraphie — un coup, trois coups et les aïeux, la nuit du prisme et les deux frappeurs ; le DESSIN (`look`, la plus
/// haute édition atteinte) décide de la matière — la pièce, l'oiseau du revers, les poussières.
struct MintCeremonyRequest: Identifiable, Equatable {
    let id = UUID()
    let edition: MeeshEdition
    let look: MeeshEdition
    let number: Int
    let settledKey: Int
    /// La gloire du joueur au toucher et celle que la frappe apporte (#19859) ; absente, « +1 000 de gloire » seul.
    let glory: MintCeremonyGlory?

    /// - Parameter edition: la loi de la pièce, telle que l'aperçu la sert ; le dessin se déduit de son numéro.
    init(number: Int, edition: MeeshEdition, settled: GameMintSettlement?, glory: MintCeremonyGlory? = nil) {
        self.edition = edition
        look = GameMint.displayEdition(forNumber: number)
        self.number = number
        settledKey = settled?.key ?? 0
        self.glory = glory
    }

    /// Ce que la passerelle a répondu depuis le toucher : une pièce, un refus, ou rien encore.
    func answer(_ settled: GameMintSettlement?) -> MintCeremonyAnswer {
        guard let settled, settled.key > settledKey else { return .pending }
        switch settled.outcome {
        case .minted(let minted): return .confirmed(number: minted ?? number)
        case .refused(let code): return .refused(code: code)
        }
    }
}

/// LA CONDUITE D'UNE CÉRÉMONIE (#11177) — l'horloge depuis le toucher, la réponse de la passerelle et l'instant où elle
/// est arrivée, les vibrations de chaque coup, la fin. La scène (`MintCeremonyScene`) ne fait que lire `plan(at:)` à
/// chaque image. Miroir de la boucle de `apps/web/src/components/game/mint-ceremony.tsx`.
///
///  - tant que la passerelle n'a pas répondu, les coups restent devant : Meo garde le marteau levé ;
///  - une pièce confirmée fixe le déroulé ; chaque coup vibre à son impact, plus fort au dernier ;
///  - un refus ramène la lumière (sous « Réduire les animations », il ferme la scène : l'écran dit le refus) ;
///  - toucher passe la scène à tout instant.
@MainActor
final class MintCeremonyRun: ObservableObject {

    /// La LOI de la pièce : la chorégraphie.
    let edition: MeeshEdition
    /// Le DESSIN de la pièce (#11483) : la matière de la pièce, de son revers et des poussières.
    let look: MeeshEdition
    let modest: Bool
    let reduced: Bool
    let particles: MintCeremonyParticles
    /// La gloire gagnée que la scène écrit, et le pas vers le rang suivant qu'elle dit dessous (#19859).
    let gloryGained: Int
    let gloryStep: GloryAfterGain?

    @Published private(set) var number: Int
    @Published private(set) var refusal: MintRefusalReason?
    @Published private(set) var isFinished = false

    private(set) var mode: MintCeremonyMode
    private(set) var answeredAtMs: Double?
    private let startedAt: TimeInterval
    private let clock: () -> TimeInterval
    private let haptics: GameHapticsProviding
    private let onFinish: () -> Void
    private var timers: [Task<Void, Never>] = []
    private var lastFrame: TimeInterval?
    private var slowFrames = 0
    private(set) var stride = 1

    nonisolated deinit {}

    init(edition: MeeshEdition, look: MeeshEdition? = nil, number: Int, reduced: Bool, modest: Bool = MintCeremonyRun.isModestDevice,
         glory: MintCeremonyGlory? = nil, haptics: GameHapticsProviding = GameHaptics.shared,
         clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         onFinish: @escaping () -> Void) {
        self.edition = edition
        self.look = look ?? edition
        self.number = number
        self.reduced = reduced
        self.modest = modest
        self.haptics = haptics
        self.clock = clock
        self.onFinish = onFinish
        gloryGained = glory?.shownGain ?? GameGlory.points.mint
        gloryStep = glory?.step
        mode = reduced ? .reduced : .normal
        startedAt = clock()
        particles = reduced
            ? MintCeremonyParticles(weave: [], dust: [], bursts: [], puff: [])
            : MintCeremonyParticles.build(
                GameMintCeremony.plan(edition: edition, look: self.look, mode: .normal, modest: modest), seed: number
            )
        timers = [after(Self.pendingLimit) { [weak self] in self?.giveUpIfPending() }]
    }

    /// Une passerelle muette ne garde pas le marteau levé indéfiniment : passé ce délai, la lumière revient.
    nonisolated static let pendingLimit: TimeInterval = 20

    private func giveUpIfPending() {
        guard answeredAtMs == nil, mode != .refused else { return }
        receive(.refused(code: nil))
    }

    /// Un appareil modeste : quatre cœurs ou moins, ou le mode économie d'énergie. Moitié moins de particules.
    nonisolated static var isModestDevice: Bool {
        ProcessInfo.processInfo.activeProcessorCount <= 4 || ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    /// Les millisecondes depuis le toucher.
    var elapsedMs: Double { (clock() - startedAt) * 1000 }

    /// Le déroulé de l'instant : tant que la passerelle n'a pas répondu, les coups restent devant.
    nonisolated static func livePlan(edition: MeeshEdition, look: MeeshEdition? = nil, mode: MintCeremonyMode, answeredAtMs: Double?,
                                     nowMs: Double, modest: Bool) -> MintCeremonyPlan {
        let pending = max(nowMs + 1000, mode == .reduced ? 0 : Double(GameMintCeremony.strikeReadyMs + 1000))
        return GameMintCeremony.plan(edition: edition, look: look, mode: mode, answeredAtMs: answeredAtMs ?? pending, modest: modest)
    }

    func plan(atMs nowMs: Double) -> MintCeremonyPlan {
        Self.livePlan(edition: edition, look: look, mode: mode, answeredAtMs: answeredAtMs, nowMs: nowMs, modest: modest)
    }

    /// Des images qui tardent (au-delà d'une image à 60 Hz et demie) plusieurs fois de suite : un fil sur deux.
    func noteFrame(at uptime: TimeInterval) {
        if let lastFrame { slowFrames = uptime - lastFrame > 0.024 ? slowFrames + 1 : max(0, slowFrames - 1) }
        lastFrame = uptime
        if slowFrames >= 4 { stride = 2 }
    }

    /// Ce que VoiceOver dit de la scène (#20141) : la phrase de Mee tant que le marteau est levé, la raison d'un refus,
    /// et, la frappe confirmée, la gloire gagnée puis le pas vers le rang suivant.
    var spoken: String {
        if let refusal { return MintCeremonyCopy.refused(refusal) }
        guard answeredAtMs != nil else { return MintCeremonyCopy.say(edition, number: number) }
        return MintCeremonyCopy.confirmed(edition, number: number, gloryGained: gloryGained, gloryStep: gloryStep)
    }

    // MARK: - La réponse

    func receive(_ answer: MintCeremonyAnswer) {
        guard !isFinished else { return }
        switch answer {
        case .pending:
            return
        case .confirmed(let confirmed):
            guard answeredAtMs == nil else { return }
            number = confirmed
            answeredAtMs = elapsedMs
        case .refused(let code):
            guard mode != .refused else { return }
            refusal = GameMintCeremony.refusalReason(code: code)
            if mode == .reduced {
                finish()
                return
            }
            mode = .refused
            answeredAtMs = elapsedMs
        }
        schedule(plan(atMs: elapsedMs))
    }

    /// Les vibrations à venir, en secondes d'attente : chaque coup à son impact (le dernier plus fort) ; un coup déjà
    /// passé de plus d'un quart de seconde ne vibre plus.
    nonisolated static func blows(of plan: MintCeremonyPlan, afterMs nowMs: Double) -> [(delay: Double, isFinal: Bool)] {
        plan.strikes.compactMap { strike in
            let delay = (Double(strike.impactMs) - nowMs) / 1000
            return delay < -0.25 ? nil : (max(0, delay), strike.isFinal)
        }
    }

    private func schedule(_ plan: MintCeremonyPlan) {
        timers.forEach { $0.cancel() }
        let now = elapsedMs
        timers = Self.blows(of: plan, afterMs: now).map { blow in
            after(blow.delay) { [weak self] in self?.haptics.play(GameHapticPattern.ceremonyBlow(final: blow.isFinal)) }
        }
        timers.append(after(max(0, (Double(plan.endMs) - now) / 1000)) { [weak self] in self?.finish() })
    }

    private func after(_ seconds: Double, _ run: @escaping @MainActor () -> Void) -> Task<Void, Never> {
        Task { @MainActor in
            guard await cancellableSleep(for: .seconds(seconds)) else { return }
            run()
        }
    }

    // MARK: - La fin

    /// Toucher passe la scène : l'état final s'applique d'un coup.
    func skip() { finish() }

    func finish() {
        guard !isFinished else { return }
        isFinished = true
        timers.forEach { $0.cancel() }
        timers = []
        onFinish()
    }
}
