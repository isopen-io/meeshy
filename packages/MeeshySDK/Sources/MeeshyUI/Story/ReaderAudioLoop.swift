import Foundation
import AVFoundation
import MeeshySDK

/// **La boucle du mixer de lecture : UNE loi pour le premier plan et le fond (#9867).**
///
/// Les deux slots avaient chacun leur rebouclage, et ils avaient divergé : le
/// fond se réarmait à chaque fin de passe, le premier plan replanifiait sa
/// deuxième passe sans handler — la troisième n'était jamais planifiée et le
/// clip se taisait après deux tours.
///
/// La loi tient en deux règles :
/// 1. **une passe d'avance.** Au départ, la passe qui joue ET la suivante sont
///    remises au node ; la fin de la passe N arme la passe N+2. Le réarmement
///    traverse le fil principal (le node et le fichier ne sont pas `Sendable`),
///    et c'est cette avance qui lui laisse une passe entière de marge : un fil
///    principal occupé pendant un geste ne creuse plus de trou audible.
/// 2. **un handler ne réarme que SA passe, sur SON node.** `node.stop()` rend
///    tous les handlers en attente ; un `stop()` suivi d'un `play()` immédiat
///    les verrait arriver sur une passe neuve et doublerait la boucle. L'époque
///    de lecture (`playbackEpoch`) et l'identité du node les écartent.
nonisolated enum ReaderLoopLaw {
    static func shouldRearm(capturedEpoch: UInt64, liveEpoch: UInt64,
                            capturedNode: ObjectIdentifier, liveNode: ObjectIdentifier?) -> Bool {
        capturedEpoch == liveEpoch && capturedNode == liveNode
    }

    /// **L'écoulé d'une entrée en boucle se replie sur UNE passe (#10362).**
    ///
    /// Entrer dans une boucle à `t` au-delà de sa longueur — la scène du
    /// composer joue sans fin, le lecteur s'ouvre parfois loin dans la slide —
    /// demandait à la fenêtre une position hors du fichier : `scheduleAudio`
    /// ne planifiait rien, et la boucle ne démarrait jamais. Une boucle n'a
    /// pas de fin ; sa position est l'écoulé modulo la passe.
    ///
    /// Une longueur de passe nulle ou non finie rend l'écoulé tel quel (la
    /// règle d'avant), un écoulé non fini ou négatif rend zéro.
    static func elapsedInPass(_ elapsedInClip: Double, passLength: Double) -> Double {
        guard elapsedInClip.isFinite, elapsedInClip > 0 else { return 0 }
        guard passLength.isFinite, passLength > 0 else { return elapsedInClip }
        return elapsedInClip.truncatingRemainder(dividingBy: passLength)
    }

    /// Durée d'UNE passe : la fenêtre de rognage bornée à la source, ou la
    /// source entière — ce que `TimelineAudioWindow.segment` rend réellement.
    static func passLength(sourceDuration: Double, trimBounds: MediaTrimBounds?) -> Double {
        guard let trimBounds else { return sourceDuration }
        return max(0, min(trimBounds.end, sourceDuration) - trimBounds.start)
    }
}

/// **Qui boucle : la déclaration de l'auteur, sauf dans l'aperçu du composer (#10362).**
///
/// Le lecteur suit le modèle : un fond boucle sauf refus déclaré, un clip de
/// premier plan joue une fois sauf boucle déclarée — la slide a une durée, et
/// le clip s'y tait à sa place. L'aperçu d'ÉDITION n'a pas de durée : la scène
/// joue tant qu'on compose, et un clip joué une fois s'y taisait pour de bon
/// au bout de quelques secondes. Les vidéos de la scène bouclent déjà en
/// édition (`attachPlayer(loop: mode != .play)`) ; le son suit la même loi.
nonisolated enum ReaderAudioLoopPolicy {
    static func loops(declared: Bool?, isBackground: Bool, isEditPreview: Bool) -> Bool {
        isEditPreview || (declared ?? isBackground)
    }
}

/// **Une boucle d'aperçu rejoue ses fondus à CHAQUE tour (#10367).**
///
/// Les fondus d'un clip se posaient une fois, à la planification de la passe
/// (`AudioEnvelope`) : montée au début, descente avant la fin. Une piste
/// bouclée par l'aperçu d'édition (`ReaderAudioLoopPolicy`) repartait au tour
/// suivant sur un node resté à zéro — muette pour de bon après son premier
/// fondu de sortie.
///
/// Le volume se LIT donc sur la phase du tour : l'écoulé dans le clip replié
/// sur le cycle (`elapsedInPass`), montée sur `fadeIn`, descente sur les
/// `fadeOut` dernières secondes du cycle, le plus petit des deux facteurs
/// gouvernant quand ils se chevauchent. Une entrée en cours de boucle tombe
/// d'elle-même à la bonne amplitude.
nonisolated enum ReaderLoopEnvelope {

    /// Seule une boucle IMPOSÉE par l'aperçu et porteuse d'un fondu rejoue
    /// son enveloppe : le lecteur garde ses fondus posés une fois, et une
    /// boucle sans fondu n'a rien à rejouer — son volume ne bouge pas.
    static func repeatsEveryPass(loopsEveryClip: Bool, fadeIn: Double, fadeOut: Double) -> Bool {
        loopsEveryClip && (positive(fadeIn) > 0 || positive(fadeOut) > 0)
    }

    /// Durée d'un tour d'enveloppe. Une boucle DÉCLARÉE par l'auteur occupe sa
    /// durée sur la timeline (le fichier y tourne plusieurs fois) : ses fondus
    /// encadrent ce span. Une boucle imposée par l'aperçu tourne à la passe
    /// réelle — la fenêtre de rognage — pour que la descente touche zéro à
    /// l'instant où le fichier repart. Une durée inexploitable retombe sur
    /// l'autre.
    static func cycle(declaredLoop: Bool?, occupiedDuration: Double, passLength: Double) -> Double {
        let occupied = positive(occupiedDuration)
        let pass = positive(passLength)
        if declaredLoop == true, occupied > 0 { return occupied }
        return pass > 0 ? pass : occupied
    }

    /// Le tour du FOND (#10369) : sans déclaration, un fond boucle au lecteur
    /// (`ReaderAudioLoopPolicy`) — ses fondus y encadrent donc le span occupé.
    static func backgroundCycle(declaredLoop: Bool?, occupiedDuration: Double, passLength: Double) -> Double {
        cycle(declaredLoop: declaredLoop ?? true, occupiedDuration: occupiedDuration, passLength: passLength)
    }

    /// Volume à l'instant `elapsedInClip` (secondes depuis le début du clip,
    /// tous tours confondus). Un écoulé négatif — le clip n'a pas commencé —
    /// vaut le début du tour.
    static func volume(elapsedInClip: Double, cycle: Double,
                       fadeIn: Double, fadeOut: Double, target: Float) -> Float {
        let phase = ReaderLoopLaw.elapsedInPass(elapsedInClip, passLength: cycle)
        let rise = positive(fadeIn)
        let fall = positive(fadeOut)
        let span = positive(cycle)
        let rising = rise > 0 ? min(1, phase / rise) : 1
        let falling = (fall > 0 && span > 0) ? min(1, max(0, (span - phase) / fall)) : 1
        return target * Float(min(rising, falling))
    }

    private static func positive(_ seconds: Double) -> Double {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return seconds
    }
}

/// Le slot d'une boucle — `Sendable`, donc transportable par le handler de fin
/// de passe, qui ne peut pas capturer le node lui-même.
nonisolated enum ReaderLoopSlot: Hashable, Sendable {
    case foreground(String)
    case background
}

/// Ce qu'une passe de boucle remet au node, lu sur le slot vivant.
struct ReaderLoopSource {
    let node: AVAudioPlayerNode
    let file: AVAudioFile
    let trimBounds: MediaTrimBounds?

    /// Durée d'UNE passe : la fenêtre de rognage bornée au fichier, ou le
    /// fichier entier — ce que `TimelineAudioWindow.segment` rend réellement.
    var passLength: Double {
        ReaderLoopLaw.passLength(
            sourceDuration: Double(file.length) / max(file.processingFormat.sampleRate, 1),
            trimBounds: trimBounds)
    }
}

extension ReaderAudioMixer {

    /// Lance la boucle d'un slot : la première passe (éventuellement entrée en
    /// cours de piste, #6580) puis, derrière elle, une passe entière d'avance.
    /// Si la première passe n'a rien planifié (ouverture au-delà de la fin du
    /// clip), la boucle ne démarre pas — même règle que `scheduleAudio`.
    func scheduleLoop(_ slot: ReaderLoopSlot, elapsedInClip: Double, at scheduleAt: AVAudioTime?) {
        guard let source = loopSource(for: slot) else { return }
        let rearm = loopRearmHandler(slot, node: source.node)
        let entry = ReaderLoopLaw.elapsedInPass(elapsedInClip, passLength: source.passLength)
        guard scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                            elapsedInClip: entry,
                            at: scheduleAt, completionHandler: rearm) else { return }
        scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                      elapsedInClip: 0,
                      at: nil, completionHandler: rearm)
    }

    private func loopRearmHandler(_ slot: ReaderLoopSlot, node: AVAudioPlayerNode) -> @Sendable () -> Void {
        let epoch = playbackEpoch
        let nodeId = ObjectIdentifier(node)
        return { @Sendable [weak self] in
            // `_ =` : discarde le handle du `Task` pour que la closure rende `Void`.
            _ = Task { @MainActor [weak self] in
                self?.rearmLoop(slot, epoch: epoch, nodeId: nodeId)
            }
        }
    }

    /// Arme UNE passe de plus, au début de la fenêtre — `elapsedInClip: 0`
    /// écrit à dessein : l'écoulé de la slide ne vaut que pour l'entrée.
    private func rearmLoop(_ slot: ReaderLoopSlot, epoch: UInt64, nodeId: ObjectIdentifier) {
        let live = loopSource(for: slot)
        guard ReaderLoopLaw.shouldRearm(capturedEpoch: epoch, liveEpoch: playbackEpoch,
                                        capturedNode: nodeId,
                                        liveNode: live.map { ObjectIdentifier($0.node) }),
              let source = live else { return }
        scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                      elapsedInClip: 0,
                      at: nil, completionHandler: loopRearmHandler(slot, node: source.node))
    }
}
