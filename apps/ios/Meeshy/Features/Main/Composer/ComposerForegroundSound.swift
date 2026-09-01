import Foundation
import MeeshySDK
import MeeshyUI

/// **Le son placé en CONTENU de publication, prêt à être écouté dans le
/// composer** (directive porteur 2026-09-01, #4657).
///
/// Un son de FOND se lit à côté de l'avatar — c'est un attribut de la
/// publication, et `ComposerAvatarSoundBadge` le dit en trois signes. Un son de
/// CONTENU est le propos lui-même : il se joue là où le propos se lit, juste
/// sous la zone de texte, avec sa transcription qui défile.
///
/// > « Lorsqu'on a un son en contenu de publication, sans canvas, il faut
/// > mettre juste après la zone texte le composant de lecture du contenu audio
/// > avec la transcription défilant, et la possibilité de toucher pour éditer
/// > le son via la vue de création audio. »
///
/// ## Pourquoi une VALEUR, et non une lecture faite dans la vue
///
/// La surface document est une PRÉSENTATION : elle reçoit des valeurs et rend
/// des événements. Lui faire fouiller `documentLocalMedia` à la recherche d'un
/// mime audio en ferait une seconde lectrice de l'état du meuble — et la règle
/// « quel son est le son du contenu ? » deviendrait invérifiable, faute de
/// pouvoir la convoquer sans monter un écran.
///
/// ## « Sans canvas » n'est PAS un champ de cette règle
///
/// La condition est tenue par la STRUCTURE : la carte se monte dans
/// `textOnlyContent`, la branche que la surface ne rend que lorsque
/// `showsScene` est faux. L'écrire aussi ici ferait deux gardes pour une
/// condition, et la seconde se tairait le jour où la première changerait.
nonisolated struct ComposerForegroundSound: Equatable {

    let url: URL
    let duration: TimeInterval
    let mimeType: String
    let cues: [AudioTranscriptCue]
    /// Le texte entier, pour une transcription SANS minutage — saisie à la main
    /// par « Rédiger » ou « Coller ». Vide quand il n'y a pas de transcription
    /// du tout : la carte ne peint alors aucune zone de texte (loi 4).
    let text: String

    /// **Le DERNIER son de la liste média gagne.**
    ///
    /// Le meuble ne garde qu'UNE transcription (`documentTranscription`,
    /// écrasée à chaque retour de la feuille) : elle décrit donc le son posé en
    /// dernier. Élire un autre son afficherait la transcription d'un voisin —
    /// un défaut pire que l'absence, parce qu'il a l'air d'une transcription
    /// ratée plutôt que d'une transcription absente.
    ///
    /// La famille du média se lit de `ComposerIngestRouter`, le site unique du
    /// routage MIME du composer — jamais d'un `hasPrefix("audio")` réécrit ici.
    static func resolve(localMedia: [ComposerDocumentMedia],
                        transcription: MobileTranscriptionPayload?) -> ComposerForegroundSound? {
        guard let media = localMedia.last(where: {
            ComposerIngestRouter.route(mime: $0.mimeType) == .audio
        }) else { return nil }

        return ComposerForegroundSound(
            url: media.url,
            // Une durée absente ne disqualifie pas le son : le lecteur relit la
            // vraie durée du fichier au chargement et corrige. La refuser ici
            // ferait disparaître la carte pour un champ que rien n'oblige à
            // remplir.
            duration: media.durationMs.map { TimeInterval($0) / 1000 } ?? 0,
            mimeType: media.mimeType,
            cues: cues(from: transcription),
            text: transcription?.text ?? ""
        )
    }

    /// Les segments datés deviennent des lignes ; leur ORDRE est celui du
    /// service, et l'index sert d'identité — deux segments peuvent porter le
    /// même texte (« oui », « oui ») sans être la même ligne.
    static func cues(from transcription: MobileTranscriptionPayload?) -> [AudioTranscriptCue] {
        guard let transcription, !transcription.segments.isEmpty else { return [] }
        return transcription.segments.enumerated().map { index, segment in
            AudioTranscriptCue(id: index,
                               text: segment.text,
                               start: segment.start,
                               end: segment.end)
        }
    }
}

extension ComposerForegroundSound {

    /// **Ce qu'une transcription SURVIT à une édition** (directive porteur
    /// 2026-09-01).
    ///
    /// `AudioPostComposerView` ne re-transcrit PAS un son qu'on lui remet pour
    /// le rogner — et c'est le bon choix : faire repayer une reconnaissance
    /// vocale qu'on n'a pas demandée est du travail chaud pour rien. Elle rend
    /// donc `nil`, et l'écrire tel quel effacerait le texte dès le premier
    /// aller-retour dans la feuille.
    ///
    /// Trois cas, et le second est celui qui manquait :
    ///
    /// 1. **La feuille rend une transcription** ⇒ c'est elle, toujours. Elle
    ///    décrit le son qui part.
    /// 2. **Rien n'est rendu et le FICHIER n'a pas changé** ⇒ l'ancienne tient.
    ///    `AudioSegmentExporter.export` rend l'URL D'ORIGINE quand aucun
    ///    rognage n'est nécessaire : l'égalité des URL est donc la preuve que
    ///    les octets sont les mêmes, pas une approximation.
    /// 3. **Rien n'est rendu et le fichier a changé** ⇒ plus rien. Les bornes
    ///    de l'ancienne désignent des instants qui n'existent plus, et une
    ///    transcription qui surligne à côté est pire qu'une absence : elle a
    ///    l'air d'une reconnaissance ratée.
    static func survivingTranscription(returned: MobileTranscriptionPayload?,
                                       previous: MobileTranscriptionPayload?,
                                       editedURL: URL?,
                                       returnedURL: URL) -> MobileTranscriptionPayload? {
        if let returned { return returned }
        guard let editedURL, editedURL == returnedURL else { return nil }
        return previous
    }
}
