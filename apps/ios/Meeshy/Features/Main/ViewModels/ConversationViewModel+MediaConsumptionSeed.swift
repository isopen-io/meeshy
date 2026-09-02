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

    /// Sème les deux magasins depuis la consommation servie sur les pièces
    /// jointes fraîchement chargées, pour que la teinte de la waveform (audio) /
    /// la barre de progression (vidéo) reflètent l'avancée faite sur les autres
    /// appareils dès l'ouverture de la conversation.
    ///
    /// Orchestration APP : elle dérive la fraction depuis la durée de la pièce
    /// jointe et décide QUAND semer — les magasins restent des briques opaques.
    func seedMediaConsumption(from messages: [Message]) {
        for message in messages {
            for attachment in message.attachments {
                guard let consumption = attachment.currentUserConsumption else { continue }
                let durationMs = attachment.duration ?? 0
                let positionMs: Int?
                let complete: Bool
                switch attachment.type {
                case .audio:
                    positionMs = consumption.lastPlayPositionMs
                    complete = consumption.listenedComplete
                    if !complete, let seconds = Self.seedResumePositionSeconds(
                        positionMs: positionMs,
                        localPositionSeconds: AudioPlaybackPositionStore.shared.position(for: attachment.id)
                    ) {
                        AudioPlaybackPositionStore.shared.save(seconds, for: attachment.id)
                    }
                case .video:
                    positionMs = consumption.lastWatchPositionMs
                    complete = consumption.watchedComplete
                    if !complete, let seconds = Self.seedResumePositionSeconds(
                        positionMs: positionMs,
                        localPositionSeconds: VideoPlaybackPositionStore.shared.position(for: attachment.id)
                    ) {
                        VideoPlaybackPositionStore.shared.save(seconds, for: attachment.id)
                    }
                default:
                    continue
                }
                // Rien à semer sans complétion ni position mesurable.
                guard complete || (positionMs != nil && durationMs > 0) else { continue }
                // `record` plafonne `complete` à la fraction 1 : 0 est donc sûr
                // quand seule la complétion est connue (ni position ni durée).
                let fraction: Double
                if durationMs > 0, let pos = positionMs {
                    fraction = Double(pos) / Double(durationMs)
                } else {
                    fraction = 0
                }
                MediaConsumptionStore.shared.record(fraction: fraction, complete: complete, for: attachment.id)
            }
        }
    }

    /// La décision PURE : quelle position de reprise écrire dans le magasin
    /// local, au vu de celle qu'il porte déjà et de celle que le serveur sert ?
    ///
    /// **Règle : le MAXIMUM des deux, et jamais un recul.** Rend les secondes à
    /// écrire, ou `nil` quand il n'y a rien à écrire — position serveur absente
    /// ou nulle, ou LOCALE déjà plus avancée.
    ///
    /// ## Ce que l'ancienne règle protégeait, et ce qu'elle coûtait
    ///
    /// Elle refusait tout dès qu'une position locale existait
    /// (`guard !hasLocalPosition`), au motif qu'une position locale plus avancée
    /// — ou volontairement abandonnée — ne doit pas être écrasée par une valeur
    /// serveur peut-être périmée. La moitié « plus avancée » est juste, et le
    /// MAXIMUM la garde intégralement. La moitié « volontairement abandonnée »
    /// se payait très cher : elle gelait l'appareil sur son premier contact,
    /// pour toute la vie de la pièce jointe.
    ///
    /// > Une garde qui refuse TOUTE écriture pour protéger le cas où la valeur
    /// > entrante est plus PETITE protège aussi le cas où elle est plus grande —
    /// > c'est-à-dire exactement celui qu'on voulait servir. Comparer coûte une
    /// > ligne de plus que refuser, et ne perd rien.
    ///
    /// La zone morte de reprise (trop près d'un bord) est re-vérifiée au moment
    /// de la LECTURE par le moteur lui-même : elle n'est délibérément pas
    /// dupliquée ici.
    nonisolated static func seedResumePositionSeconds(
        positionMs: Int?,
        localPositionSeconds: Double?
    ) -> Double? {
        guard let positionMs, positionMs > 0 else { return nil }
        let serverSeconds = Double(positionMs) / 1000
        guard let local = localPositionSeconds else { return serverSeconds }
        return serverSeconds > local ? serverSeconds : nil
    }
}
