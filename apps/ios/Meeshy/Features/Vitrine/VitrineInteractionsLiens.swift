#if DEBUG
import Foundation
import MeeshySDK
import MeeshyUI
import SwiftUI

/// Le LIEN dans l'en-tête de la fiche (#9904) : « Dis-moi tout », la conversation d'un lien anonyme partagé aux proches,
/// où chacun écrit sans compte dans sa langue ; la liste des conversations de SAV d'une activité, une par produit ; et le
/// client qui arrive par le lien d'un SAV, sans compte. Aucun sondage : l'app n'en a pas, la vitrine n'en montre pas.
extension VitrineInteractions {
    /// L'invitation se laisse lire — le SAV, ses langues, ce qu'un invité pourra faire — avant le choix.
    static let tenueDeLInvitation: Duration = .milliseconds(1500)
    /// Le formulaire monte, puis se remplit comme sous les doigts du client : son nom, sa langue.
    static let monteeDuFormulaire: Duration = .milliseconds(600)
    static let entreDeuxChamps: Duration = .milliseconds(350)
    static let tenueDuFormulaire: Duration = .milliseconds(1800)
    /// La conversation ou la liste se laisse lire.
    static let tenueDeLEcran: Duration = .milliseconds(3000)

    /// Le nom que tape le client du SAV : celui du lecteur du kit, qui découvre le SAV par son lien.
    static func nomDeLInvite(_ f: VitrineFixtures) -> (prenom: String, nom: String) {
        (f.lecteur.firstName ?? f.lecteur.username, f.lecteur.lastName ?? "")
    }

    /// Le choix « sans compte » (`proceedToForm`, comme `JoinFlowSheet.handleLandingChoice`), puis le nom et la langue de
    /// l'invité — la sienne, celle qu'il lira.
    static func rejoindreSansCompte(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let parcours = VitrineRendu.shared.invitation else {
            fatalError("Vitrine « \(scene.rawValue) » : l'invitation n'a pas prêté son parcours")
        }
        VitrineTournage.etape("invitation")
        try? await Task.sleep(for: tenueDeLInvitation)
        VitrineTournage.etape("sans-compte")
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { parcours.proceedToForm() }
        try? await Task.sleep(for: monteeDuFormulaire)
        let (prenom, nom) = nomDeLInvite(f)
        parcours.firstName = prenom
        try? await Task.sleep(for: entreDeuxChamps)
        parcours.lastName = nom
        try? await Task.sleep(for: entreDeuxChamps)
        parcours.language = f.lang
        VitrineTournage.etape("formulaire")
        try? await Task.sleep(for: tenueDuFormulaire)
    }

    /// Un écran qui se LIT : la conversation « Dis-moi tout », la liste des SAV. L'étape date son instant.
    static func tenirLEcran(_ scene: VitrineScene) async {
        VitrineTournage.etape("ecran")
        try? await Task.sleep(for: tenueDeLEcran)
    }
}
#endif
