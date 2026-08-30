import Testing
@testable import MeeshyUI

/// La règle de troncature de la légende posée sur un canvas (#4474).
///
/// Le porteur l'a formulée en MOTS, pas en lignes ni en caractères : « uniquement
/// les 10 premiers mots avec (voir plus/see more) ». Une troncature par lignes
/// (`lineLimit`) dépend de la largeur de l'écran et de la taille de police du
/// lecteur — deux appareils ne montrent alors pas la même chose. Un compte de
/// MOTS est stable partout, c'est ce qui la rend spécifiable.
@Suite("MediaCaptionOverlay")
struct MediaCaptionOverlayTests {

    @Test("une légende plus courte que la limite n'est pas tronquée")
    func shortCaptionIsNotTruncated() {
        let rendu = MediaCaptionOverlay.collapse("Trois petits mots", words: 10)
        #expect(rendu.head == "Trois petits mots")
        #expect(rendu.isTruncated == false)
    }

    @Test("exactement la limite ne déclenche PAS le dépliage")
    func exactlyAtLimitIsNotTruncated() {
        let dix = "un deux trois quatre cinq six sept huit neuf dix"
        let rendu = MediaCaptionOverlay.collapse(dix, words: 10)
        #expect(rendu.head == dix)
        #expect(rendu.isTruncated == false)
    }

    @Test("au-delà de la limite, on garde les 10 premiers mots et on signale la suite")
    func longCaptionKeepsFirstTenWords() {
        let onze = "un deux trois quatre cinq six sept huit neuf dix onze"
        let rendu = MediaCaptionOverlay.collapse(onze, words: 10)
        #expect(rendu.head == "un deux trois quatre cinq six sept huit neuf dix")
        #expect(rendu.isTruncated == true)
    }

    /// Les sauts de ligne et les espaces multiples SÉPARENT des mots sans en
    /// fabriquer de vides — sinon une légende aérée serait tronquée bien avant
    /// son dixième mot réel.
    @Test("les blancs multiples et les sauts de ligne ne comptent pas pour des mots")
    func whitespaceRunsDoNotCountAsWords() {
        let aere = "un   deux\n\ntrois    quatre"
        let rendu = MediaCaptionOverlay.collapse(aere, words: 10)
        #expect(rendu.isTruncated == false)
        #expect(rendu.head == aere)
    }

    /// **Une langue sans espaces n'a pas dix mots.** Un texte japonais ou chinois
    /// compte UN mot pour la découpe par blancs : le tronquer à « 10 mots » le
    /// laisserait entier quelle que soit sa longueur. La règle ne prétend donc
    /// pas le rogner — elle le rend tel quel, et c'est le comportement voulu :
    /// mieux vaut une légende entière qu'une légende coupée au mauvais endroit.
    @Test("un texte sans blancs est rendu entier plutôt que coupé au hasard")
    func spacelessTextIsRenderedWhole() {
        let japonais = "今日はとてもいい天気ですから公園に行きましょう"
        let rendu = MediaCaptionOverlay.collapse(japonais, words: 10)
        #expect(rendu.head == japonais)
        #expect(rendu.isTruncated == false)
    }

    /// La tête tronquée ne traîne pas le blanc qui suivait son dernier mot :
    /// l'ellipse se colle au texte, pas à un espace orphelin.
    @Test("la tête tronquée ne finit pas par un blanc")
    func truncatedHeadHasNoTrailingWhitespace() {
        let long = "un deux trois quatre cinq six sept huit neuf dix    onze douze"
        let rendu = MediaCaptionOverlay.collapse(long, words: 10)
        #expect(rendu.head.hasSuffix("dix"))
    }

    /// Une légende vide n'a rien à déplier — et surtout rien à AFFICHER : c'est
    /// l'hôte qui décide de ne pas monter la couche, mais la règle ne doit pas
    /// prétendre qu'il y a une suite.
    @Test("une légende vide n'est jamais tronquée")
    func emptyCaptionIsNeverTruncated() {
        let rendu = MediaCaptionOverlay.collapse("   \n  ", words: 10)
        #expect(rendu.isTruncated == false)
    }
}
