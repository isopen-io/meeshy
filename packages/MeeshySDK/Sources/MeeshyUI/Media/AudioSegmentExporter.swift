import AVFoundation
import Foundation

/// **Matérialiser un segment rogné** (#4657).
///
/// Un rognage qui ne produit pas de fichier est un contrôle INERTE : l'auteur
/// déplace deux poignées, voit la sélection changer, et publie la piste
/// entière. C'est ce module qui donne un effet aux poignées.
public nonisolated enum AudioSegmentExporter {

    /// Tolérance sous laquelle une borne est considérée « au bout ».
    ///
    /// Une poignée posée à la main ne tombe jamais sur la milliseconde ; sans
    /// tolérance, **toute** ouverture de la feuille ré-encoderait la piste pour
    /// n'en retirer que quelques centièmes — du temps et de la qualité perdus
    /// pour rien.
    public static let edgeTolerance: TimeInterval = 0.05

    /// Faut-il découper ? Règle PURE, éprouvable sans fichier.
    ///
    /// `false` ⇒ l'appelant sert l'URL d'origine. Ne pas ré-encoder ce qui n'a
    /// pas été rogné n'est pas une optimisation : un ré-encodage change le
    /// conteneur, le débit et la durée de quelques trames, et le faire sans
    /// raison ferait mentir la durée que le composer vient d'annoncer.
    public static func needsExport(range: ClosedRange<TimeInterval>,
                                   fullDuration: TimeInterval) -> Bool {
        guard fullDuration > 0 else { return false }
        let debutRogne = range.lowerBound > edgeTolerance
        let finRognee = range.upperBound < fullDuration - edgeTolerance
        return debutRogne || finRognee
    }

    /// Rend l'URL à publier : l'originale si rien n'est rogné, sinon un `.m4a`
    /// neuf dans le dossier temporaire.
    ///
    /// `nil` seulement quand la découpe était NÉCESSAIRE et a échoué —
    /// l'appelant doit alors renoncer plutôt que publier la piste entière, qui
    /// n'est pas ce que l'auteur a demandé.
    public static func export(url: URL,
                              range: ClosedRange<TimeInterval>,
                              fullDuration: TimeInterval) async -> URL? {
        guard needsExport(range: range, fullDuration: fullDuration) else { return url }

        let asset = AVURLAsset(url: url)
        guard let session = AVAssetExportSession(asset: asset,
                                                 presetName: AVAssetExportPresetAppleM4A) else {
            return nil
        }

        let sortie = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-trim-\(UUID().uuidString).m4a")
        session.outputURL = sortie
        session.outputFileType = .m4a
        session.timeRange = CMTimeRange(
            start: CMTime(seconds: range.lowerBound, preferredTimescale: 600),
            end: CMTime(seconds: range.upperBound, preferredTimescale: 600)
        )

        await session.export()
        guard session.status == .completed,
              FileManager.default.fileExists(atPath: sortie.path) else {
            try? FileManager.default.removeItem(at: sortie)
            return nil
        }
        return sortie
    }
}
