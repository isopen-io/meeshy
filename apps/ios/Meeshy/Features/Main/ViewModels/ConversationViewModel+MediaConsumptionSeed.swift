import Foundation
import MeeshySDK

/// L'AMORÇAGE de la progression média depuis le serveur — la moitié « ce que
/// j'ai déjà écouté ailleurs » de la reprise multi-appareil.
///
/// **Extrait de `ConversationViewModel.swift` au 232i (#3914)**, qui passait
/// 5 055 lignes : la directive 2026-08-28 interdit d'ajouter à un fichier hors
/// budget, et `FileSizeBudgetGuardTests` la mesure. La ligne de découpe est une
/// RESPONSABILITÉ — ici, la réconciliation entre deux sources de position (le
/// magasin LOCAL de l'appareil et la valeur SERVIE) — qui n'a rien à voir avec
/// le chargement, l'envoi ou la traduction que porte l'hôte.
///
/// ## Deux magasins, deux sémantiques — c'est là que le défaut vivait
///
/// | magasin | ce qu'il porte | fusion |
/// |---|---|---|
/// | `MediaConsumptionStore` | la teinte COSMÉTIQUE de la waveform / barre | MAX à chaque ouverture, depuis toujours |
/// | `Audio`/`VideoPlaybackPositionStore` | la position de REPRISE | *premier contact gagnant* — corrigé ici |
///
/// Le second refusait toute mise à jour dès qu'une position locale existait,
/// **si ancienne fût-elle**. Un appareil qui avait ouvert la pièce jointe une
/// fois n'apprenait donc plus jamais ce qui s'était passé ailleurs, jusqu'à
/// l'effacement de sa position (en pratique : la complétion). La synchronisation
/// multi-appareil ne servait qu'UNE fois par pièce jointe et par appareil.
extension ConversationViewModel {

    func seedMediaConsumption(from messages: [Message]) {
        MediaConsumptionSeeder.seed(from: messages)
    }
}
