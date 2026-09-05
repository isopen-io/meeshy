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
        let rendu = MediaCaptionRule.collapse("Trois petits mots", words: 10)
        #expect(rendu.head == "Trois petits mots")
        #expect(rendu.isTruncated == false)
    }

    @Test("exactement la limite ne déclenche PAS le dépliage")
    func exactlyAtLimitIsNotTruncated() {
        let dix = "un deux trois quatre cinq six sept huit neuf dix"
        let rendu = MediaCaptionRule.collapse(dix, words: 10)
        #expect(rendu.head == dix)
        #expect(rendu.isTruncated == false)
    }

    @Test("au-delà de la limite, on garde les 10 premiers mots et on signale la suite")
    func longCaptionKeepsFirstTenWords() {
        let onze = "un deux trois quatre cinq six sept huit neuf dix onze"
        let rendu = MediaCaptionRule.collapse(onze, words: 10)
        #expect(rendu.head == "un deux trois quatre cinq six sept huit neuf dix")
        #expect(rendu.isTruncated == true)
    }

    /// Les sauts de ligne et les espaces multiples SÉPARENT des mots sans en
    /// fabriquer de vides — sinon une légende aérée serait tronquée bien avant
    /// son dixième mot réel.
    @Test("les blancs multiples et les sauts de ligne ne comptent pas pour des mots")
    func whitespaceRunsDoNotCountAsWords() {
        let aere = "un   deux\n\ntrois    quatre"
        let rendu = MediaCaptionRule.collapse(aere, words: 10)
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
        let rendu = MediaCaptionRule.collapse(japonais, words: 10)
        #expect(rendu.head == japonais)
        #expect(rendu.isTruncated == false)
    }

    /// La tête tronquée ne traîne pas le blanc qui suivait son dernier mot :
    /// l'ellipse se colle au texte, pas à un espace orphelin.
    @Test("la tête tronquée ne finit pas par un blanc")
    func truncatedHeadHasNoTrailingWhitespace() {
        let long = "un deux trois quatre cinq six sept huit neuf dix    onze douze"
        let rendu = MediaCaptionRule.collapse(long, words: 10)
        #expect(rendu.head.hasSuffix("dix"))
    }

    /// Une légende vide n'a rien à déplier — et surtout rien à AFFICHER : c'est
    /// l'hôte qui décide de ne pas monter la couche, mais la règle ne doit pas
    /// prétendre qu'il y a une suite.
    @Test("une légende vide n'est jamais tronquée")
    func emptyCaptionIsNeverTruncated() {
        let rendu = MediaCaptionRule.collapse("   \n  ", words: 10)
        #expect(rendu.isTruncated == false)
    }
}

/// **Le SEUIL et la TÊTE sont deux nombres distincts** (directive 2026-08-30).
///
/// « On affiche les 15 premiers mots si le texte fait plus de 30 mots ; sinon
/// on affiche tout, une fois. » Ces témoins sont écrits sur la BANDE — entre 16
/// et 30 mots — où les deux règles divergent. Un témoin posé à 5 ou à 40 mots
/// rendrait le même verdict sous l'ancienne règle (seuil unique de 10) et sous
/// la nouvelle : il ne pourrait pas tomber.
@Suite("MediaCaptionOverlay — seuil 30, tête 15")
struct MediaCaptionOverlaySeuilTests {

    private func mots(_ n: Int) -> String {
        (1...n).map { "mot\($0)" }.joined(separator: " ")
    }

    @Test("vingt mots sortent ENTIERS — au-dessus de la tête, sous le seuil")
    func vingtMotsEntiers() {
        let rendu = MediaCaptionRule.collapse(mots(20), threshold: 30, head: 15)
        #expect(rendu.isTruncated == false)
        #expect(rendu.head == mots(20))
    }

    @Test("exactement trente mots sortent entiers — le seuil est STRICT")
    func trenteMotsEntiers() {
        let rendu = MediaCaptionRule.collapse(mots(30), threshold: 30, head: 15)
        #expect(rendu.isTruncated == false)
    }

    @Test("trente-et-un mots se replient sur les QUINZE premiers, pas sur trente")
    func trenteEtUnRepliesSurQuinze() {
        let rendu = MediaCaptionRule.collapse(mots(31), threshold: 30, head: 15)
        #expect(rendu.isTruncated == true)
        #expect(rendu.head == mots(15))
    }

    @Test("les valeurs par défaut du composant portent la règle du porteur")
    func defautsDuPorteur() {
        #expect(MediaCaptionRule.wordThreshold == 30)
        #expect(MediaCaptionRule.wordHead == 15)
        #expect(MediaCaptionRule.wordHead < MediaCaptionRule.wordThreshold)
    }
}
