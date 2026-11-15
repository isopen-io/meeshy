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
nonisolated struct ComposerForegroundSound: Equatable, Identifiable {

    /// **Le FICHIER est l'identité.** Deux sons peuvent partager durée, type et
    /// même transcription sans être le même son ; leur URL, non — c'est elle
    /// que `documentLocalMedia` porte, et elle qui désigne l'entrée à remplacer
    /// quand l'auteur en édite un.
    var id: URL { url }


    let url: URL
    let duration: TimeInterval
    let mimeType: String
    let cues: [AudioTranscriptCue]
    /// Le texte entier, pour une transcription SANS minutage — saisie à la main
    /// par « Rédiger » ou « Coller ». Vide quand il n'y a pas de transcription
    /// du tout : la carte ne peint alors aucune zone de texte (loi 4).
    let text: String

    /// **N sons, N cartes — et chacun porte SA transcription** (#4672).
    ///
    /// > Question du porteur, 2026-09-01 : « si on ajoute un second son comment
    /// > cela est géré ? »
    ///
    /// Mal, jusqu'ici. Le meuble ne gardait qu'UNE transcription, écrasée à
    /// chaque retour de la feuille, et cette résolution élisait le DERNIER son
    /// de la liste. Avec deux vocaux : une seule carte s'affichait, le premier
    /// son restait dans `documentLocalMedia` — donc **il partait à la
    /// publication** — et rien à l'écran ne disait qu'il existait encore.
    ///
    /// Un défaut de cette forme est pire qu'une absence : la publication porte
    /// un contenu que le composer n'affiche plus, et l'auteur ne peut ni
    /// l'entendre, ni le rogner, ni le retirer.
    ///
    /// La transcription se cherche désormais PAR FICHIER. Une carte qui n'en
    /// trouve pas rend un son sans texte — jamais celui d'un voisin, qui aurait
    /// l'air d'une reconnaissance ratée plutôt que d'une absence.
    ///
    /// La famille du média se lit de `ComposerIngestRouter`, le site unique du
    /// routage MIME du composer — jamais d'un `hasPrefix("audio")` réécrit ici.
    ///
    /// **L'ORDRE est celui de la pose**, pas un tri : c'est l'ordre dans lequel
    /// l'auteur les a enregistrés, et le seul qu'il puisse prévoir.
    static func resolveAll(localMedia: [ComposerDocumentMedia],
                           transcriptions: [URL: MobileTranscriptionPayload]) -> [ComposerForegroundSound] {
        localMedia
            .filter { ComposerIngestRouter.route(mime: $0.mimeType) == .audio }
            .map { media in
                let transcription = transcriptions[media.url]
                return ComposerForegroundSound(
                    url: media.url,
                    // Une durée absente ne disqualifie pas le son : le lecteur
                    // relit la vraie durée du fichier au chargement et corrige.
                    // La refuser ici ferait disparaître la carte pour un champ
                    // que rien n'oblige à remplir.
                    duration: media.durationMs.map { TimeInterval($0) / 1000 } ?? 0,
                    mimeType: media.mimeType,
                    cues: cues(from: transcription),
                    text: transcription?.text ?? ""
                )
            }
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
