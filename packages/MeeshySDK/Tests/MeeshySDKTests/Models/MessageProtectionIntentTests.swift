import Testing
import Foundation
@testable import MeeshySDK

/// Ce que l'auteur ARME au composeur voyage avec TOUT ce qu'il envoie (#7498).
///
/// Le défaut relevé à la recette 1.1.0 : « cela fonctionne uniquement sur les
/// textes ». Un envoi produit souvent PLUSIEURS messages — un par groupe de
/// pièces jointes, plus le texte en dernier — et les trois champs du composeur
/// étaient relus à chaque envoi puis désarmés au premier acquittement. Le
/// deuxième groupe partait sans protection, la rangée allumée.
///
/// Une intention est une VALEUR : elle se saisit une fois au tap et se
/// transporte. Il n'y a plus de « moment » où la relire, donc plus de fenêtre
/// où la perdre.
@Suite("MessageProtectionIntent — une protection armée une fois, transportée partout")
struct MessageProtectionIntentTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test("Rien d'armé ne porte ni bit ni échéance")
    func test_none_neProtègeRien() {
        let intent = MessageProtectionIntent.none
        #expect(intent.isEmpty)
        #expect(intent.lifecycleFlags.isEmpty)
        #expect(intent.expiresAt(from: now) == nil)
    }

    @Test("Une durée éphémère pose le bit et l'échéance, comptée depuis l'ENVOI")
    func test_éphémère_poseBitEtÉchéance() {
        let intent = MessageProtectionIntent(ephemeralDurationSeconds: 300)
        #expect(intent.lifecycleFlags.contains(.ephemeral))
        #expect(intent.expiresAt(from: now) == now.addingTimeInterval(300))
    }

    /// L'échéance se calcule au moment où le message PART, pas au tap : entre
    /// les deux il y a la durée d'un upload, qui ne doit pas être volée au
    /// destinataire.
    @Test("La même intention rend deux échéances différentes à deux instants")
    func test_échéance_suitLInstantDeLEnvoi() {
        let intent = MessageProtectionIntent(ephemeralDurationSeconds: 60)
        let plusTard = now.addingTimeInterval(45)
        #expect(intent.expiresAt(from: now) != intent.expiresAt(from: plusTard))
        #expect(intent.expiresAt(from: plusTard) == plusTard.addingTimeInterval(60))
    }

    @Test("Une durée nulle ou négative n'arme rien")
    func test_duréeNonPositive_nArmeRien() {
        #expect(MessageProtectionIntent(ephemeralDurationSeconds: 0).isEmpty)
        #expect(MessageProtectionIntent(ephemeralDurationSeconds: -1).expiresAt(from: now) == nil)
    }

    @Test("Le flou et la vue unique posent LEUR bit, et seulement le leur")
    func test_flouEtVueUnique_posentLeurBit() {
        let flou = MessageProtectionIntent(isBlurred: true)
        #expect(flou.lifecycleFlags == .blurred)
        let vueUnique = MessageProtectionIntent(isViewOnce: true)
        #expect(vueUnique.lifecycleFlags == .viewOnce)
    }

    @Test("Trois protections cohabitent dans un seul champ de bits")
    func test_troisProtections_cohabitent() {
        let intent = MessageProtectionIntent(
            ephemeralDurationSeconds: 60, isBlurred: true, isViewOnce: true
        )
        #expect(intent.lifecycleFlags == MessageEffectFlags.lifecycleMask)
        #expect(!intent.isEmpty)
    }

    /// Un `false` explicite sur le fil écraserait un défaut de conversation
    /// côté serveur : ce qui n'est pas armé est ABSENT, pas faux.
    @Test("Ce qui n'est pas armé voyage comme ABSENT, jamais comme faux")
    func test_fil_absenceEtJamaisFaux() {
        let rien = MessageProtectionIntent.none
        #expect(rien.wireIsViewOnce == nil)
        #expect(rien.wireIsBlurred == nil)
        let armé = MessageProtectionIntent(isBlurred: true, isViewOnce: true)
        #expect(armé.wireIsViewOnce == true)
        #expect(armé.wireIsBlurred == true)
    }

    /// Une protection ne touche QUE l'axe du cycle de vie. Les effets
    /// d'apparition et les effets persistants se composent ailleurs, et les
    /// mélanger ferait qu'armer une vue unique allumerait un confetti.
    @Test("Une intention ne pose aucun bit hors de l'axe cycle de vie")
    func test_lifecycleFlags_neDébordePasSurLesAutresAxes() {
        let intent = MessageProtectionIntent(
            ephemeralDurationSeconds: 60, isBlurred: true, isViewOnce: true
        )
        #expect(intent.lifecycleFlags.intersection(.appearanceMask).isEmpty)
        #expect(intent.lifecycleFlags.intersection(.persistentMask).isEmpty)
    }
}
