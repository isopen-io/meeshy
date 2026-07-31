import Foundation
import MeeshySDK

/// Adresse distante d'une piste audio de story — **point de résolution unique**
/// partagé par la lecture et l'export.
///
/// Deux sources, dans cet ordre :
/// 1. `postMediaId` — le cas normal : la piste vient d'un média du post, et
///    l'appelant sait le transformer en URL.
/// 2. `mediaURL` — le SEUL chemin d'un son EMPRUNTÉ à la bibliothèque. Un son
///    emprunté n'a délibérément aucun `postMediaId` : il n'appartient pas à
///    cette publication, il est seulement joué par elle. Sans ce repli, la
///    lecture ignorait purement la piste et la story publiait en silence.
///
/// Les deux se terminent par la même résolution d'URL RELATIVE. La gateway sert
/// `/api/v1/static/<uuid>.m4a` ; `URL(string:)` accepte cette chaîne et rend une
/// URL sans schéma, que le cache disque refuse ensuite sans un mot. C'est la
/// panne silencieuse qu'on a déjà payée sur les fonds de story — le remède est
/// le même : passer par `MeeshyConfig.resolveMediaURL`.
///
/// Et c'est bien à la LECTURE qu'il faut résoudre, jamais à l'écriture : graver
/// une URL absolue dans `storyEffects` y figerait l'hôte du moment, et la story
/// deviendrait injouable dès que l'environnement change.
public enum StoryAudioSourceResolver {

    /// - Parameter resolver: transforme un `postMediaId` en URL. Absent ou
    ///   rendant `nil`, on bascule sur `mediaURL`.
    public static func remoteURL(
        for audio: StoryAudioPlayerObject,
        preferredLanguages: [String],
        resolver: ((String) -> URL?)?
    ) -> URL? {
        let mediaId = audio.resolvedPostMediaId(preferredLanguages: preferredLanguages)
        if !mediaId.isEmpty, let fromMedia = resolver?(mediaId) {
            return fromMedia
        }
        return playableURL(from: audio.mediaURL)
    }

    /// Résout une adresse persistée — absolue, relative ou `file://` — en URL
    /// exploitable. `nil` sur une chaîne vide ou irrécupérable.
    public static func playableURL(from raw: String?) -> URL? {
        guard let raw, !raw.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        if let direct = URL(string: raw), direct.isFileURL { return direct }
        return MeeshyConfig.resolveMediaURL(raw)
    }
}
