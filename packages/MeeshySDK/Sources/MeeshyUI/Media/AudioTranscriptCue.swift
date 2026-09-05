import Foundation

/// **Une ligne de transcription, et l'instant où elle se dit** (#4657).
///
/// Atome pur : aucun singleton, aucune règle produit, aucune dépendance à
/// SwiftUI. C'est ce qui autorise la règle ci-dessous à être éprouvée sans
/// monter d'écran, et le composant qui la consomme à rester une présentation.
///
/// `start` et `end` sont OPTIONNELS parce que la matière l'est : une
/// transcription saisie à la main (« Rédiger », « Coller ») n'a aucun minutage,
/// et une reconnaissance sur appareil peut rendre des segments partiellement
/// datés. Une ligne sans minutage se LIT — elle ne s'ALLUME jamais. Rendre le
/// minutage obligatoire aurait obligé chaque appelant à fabriquer des bornes,
/// c'est-à-dire à mentir sur ce qu'il sait.
public nonisolated struct AudioTranscriptCue: Identifiable, Equatable, Sendable {

    public let id: Int
    public let text: String
    public let start: TimeInterval?
    public let end: TimeInterval?

    public init(id: Int, text: String, start: TimeInterval? = nil, end: TimeInterval? = nil) {
        self.id = id
        self.text = text
        self.start = start
        self.end = end
    }

    /// La ligne en cours à l'instant `time`, ou `nil` s'il n'y en a aucune.
    ///
    /// ## Les quatre décisions que cette règle porte
    ///
    /// 1. **Une ligne sans `start` n'est jamais active.** Elle s'affiche, elle
    ///    ne s'allume pas — voir le doc-comment du type.
    /// 2. **La borne basse est INCLUSE, la haute EXCLUE.** Deux lignes
    ///    consécutives partagent toujours un instant (`end` de l'une == `start`
    ///    de l'autre) ; sans cette asymétrie, la surbrillance clignoterait entre
    ///    les deux à chaque frontière.
    /// 3. **`end` absent ⇒ la ligne court jusqu'à la suivante.** C'est la
    ///    lecture la plus fidèle d'une transcription qui ne date que ses
    ///    départs, et elle évite le trou noir entre deux lignes datées.
    /// 4. **La DERNIÈRE ligne sans `end` court jusqu'à la fin.** Autrement, le
    ///    texte s'éteindrait avant que le son se taise — le seul moment où
    ///    l'utilisateur regarde encore.
    public static func activeIndex(in cues: [AudioTranscriptCue],
                                   at time: TimeInterval) -> Int? {
        guard !cues.isEmpty else { return nil }
        for (index, cue) in cues.enumerated() {
            guard let start = cue.start, time >= start else { continue }
            let borneHaute = cue.end ?? cues[(index + 1)...]
                .compactMap(\.start)
                .first
            guard let borneHaute else { return index }
            if time < borneHaute { return index }
        }
        return nil
    }
}

extension AudioTranscriptCue {

    /// **Regrouper les segments en PHRASES lisibles.**
    ///
    /// La reconnaissance sur appareil segmente par MOT : « OK, » « dans »
    /// « tous »… Rendues telles quelles, une ligne par segment, ces lignes
    /// donnent une colonne d'un mot de large — mesuré au simulateur le
    /// 2026-09-01, et illisible. Le minutage, lui, est juste : c'est la
    /// GRANULARITÉ d'affichage qui ne l'est pas.
    ///
    /// > Une donnée exacte peut être inexploitable telle quelle. La question
    /// > n'est pas « le minutage est-il bon ? » mais « à quelle échelle un
    /// > lecteur peut-il suivre ? » — et un mot n'en est pas une.
    ///
    /// Deux règles de coupe, et la première prime :
    ///
    /// 1. **une fin de phrase coupe**, quelle que soit la longueur atteinte :
    ///    c'est la frontière que l'auteur a dictée ;
    /// 2. **sinon on coupe à `maxCharacters`**, avant de dépasser — jamais
    ///    après, sinon la ligne déborde de la carte au lieu d'y tenir.
    ///
    /// La phrase hérite du DÉBUT du premier segment et de la FIN du dernier :
    /// elle reste donc active pendant toute sa durée parlée, ce qui est
    /// exactement ce qu'un lecteur suit.
    static func phrases(from cues: [AudioTranscriptCue],
                        maxCharacters: Int = 48) -> [AudioTranscriptCue] {
        guard !cues.isEmpty else { return [] }
        var resultat: [AudioTranscriptCue] = []
        var courante: [AudioTranscriptCue] = []

        func clore() {
            guard !courante.isEmpty else { return }
            let texte = courante
                .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            if !texte.isEmpty {
                resultat.append(AudioTranscriptCue(
                    id: resultat.count,
                    text: texte,
                    start: courante.compactMap(\.start).first,
                    end: courante.compactMap(\.end).last
                ))
            }
            courante = []
        }

        for cue in cues {
            let mot = cue.text.trimmingCharacters(in: .whitespacesAndNewlines)
            let longueur = courante.reduce(0) { $0 + $1.text.count + 1 }
            if !courante.isEmpty, longueur + mot.count > maxCharacters { clore() }
            courante.append(cue)
            if mot.last.map({ ".!?…".contains($0) }) == true { clore() }
        }
        clore()
        return resultat
    }
}
