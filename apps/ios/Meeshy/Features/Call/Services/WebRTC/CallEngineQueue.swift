import Foundation

/// La file du moteur d'appel (#17039) : UNE file série où s'exécutent les
/// appels WebRTC qui attendent les fils internes de libwebrtc — fermer une
/// `RTCPeerConnection` ou un canal de données, détacher une piste d'un
/// émetteur ou d'un rendu, écrire `sender.parameters`. Sur le fil principal,
/// ces appels l'ont bloqué jusqu'à 6,37 s (rapports HangTracer de l'iPhone du
/// porteur) ; ici, l'interface n'attend jamais.
///
/// Contrat des sites appelants :
/// - l'état Swift (références, génération de session) se vide SUR PLACE,
///   avant la remise : un nouvel appel peut configurer aussitôt, et les rappels
///   de l'objet fermé sont écartés par leurs gardes d'identité ;
/// - l'objet WebRTC voyage dans la fermeture, jamais par `self` : sa dernière
///   référence tombe sur cette file, où sa libération peut elle aussi attendre ;
/// - la file est SÉRIE : deux travaux remis passent dans l'ordre de remise
///   (l'encodage qui précède une fermeture s'applique avant elle).
///
/// L'API Objective-C de libwebrtc est sûre entre fils (chaque appel est relayé
/// vers son fil de signalisation ou de travail) : c'est ce qui rend la remise
/// légitime.
nonisolated enum CallEngineQueue {
    private static let key = DispatchSpecificKey<Bool>()

    private static let queue: DispatchQueue = {
        let queue = DispatchQueue(label: "me.meeshy.call-engine", qos: .userInitiated)
        queue.setSpecific(key: key, value: true)
        return queue
    }()

    /// Vrai seulement dans un travail remis à la file.
    static var isCurrent: Bool { DispatchQueue.getSpecific(key: key) == true }

    /// Remet `work` à la file et rend la main aussitôt.
    static func run(_ work: @escaping @Sendable () -> Void) {
        queue.async(execute: work)
    }
}
