#if DEBUG
import Foundation
import MeeshySDK

/// Une vraie interaction que la vitrine filme (#9810), pour les aperçus vidéo de l'App Store.
///
/// La scène ouvre le VRAI écran, rempli des fixtures du kit, puis — après le clap du tournage — joue l'interaction par
/// un enchaînement DEBUG qui appelle les MÊMES méthodes que le geste. Les gestes simulés (idb) ont été écartés : leurs
/// coordonnées changent avec l'appareil, la langue et la longueur des textes, et un toucher manqué filme un écran figé
/// sans que rien ne le signale ; l'enchaînement, lui, échoue en nommant la scène.
nonisolated enum VitrineInteraction: String, CaseIterable, Sendable {
    /// Le compteur de Meeshes ouvre la fiche, Mee et Meo frappent (`ProgressionViewModel.mint()`).
    case frappe

    /// La célébration du jeu que l'interaction déclenche : la passerelle fictive la prépare.
    var celebration: VitrineCelebration? {
        switch self {
        case .frappe: .frappe
        }
    }
}

extension VitrineScene {
    nonisolated var interaction: VitrineInteraction? {
        switch self {
        case .interactionFrappe: .frappe
        case .amour, .groupe, .global, .lien, .progression, .imagine, .jeuRang, .jeuCoffre, .jeuFrappe, .jeuNiveau, .jeuBadge: nil
        }
    }

    /// Le jeu que la passerelle fictive sert : la célébration d'une scène du jeu, ou celle qu'une interaction déclenche.
    nonisolated var jeuServi: VitrineCelebration? {
        celebration ?? interaction?.celebration
    }
}

/// Le déroulé d'une interaction, une fois « prêt » posé : le clap, « début », l'interaction, « fin ».
@MainActor
enum VitrineInteractions {
    static func jouer(_ scene: VitrineScene) async {
        guard let interaction = scene.interaction else { return }
        await VitrineTournage.tourner(scene) {
            switch interaction {
            case .frappe: await frapperDepuisLeCompteur(scene)
            }
        }
    }

    /// Le toucher du compteur (`ProgressionHeaderStanding.onOpenMeesh`) pousse la fiche des Meeshes ; la scène y
    /// frappe par le geste réel une fois la fiche lue et sa transition posée.
    private static func frapperDepuisLeCompteur(_ scene: VitrineScene) async {
        guard let ouvrir = VitrineRendu.shared.ouvrirLeJeu, let concept = scene.jeuServi?.concept else {
            fatalError("Vitrine « \(scene.rawValue) » : l'écran Progression n'a pas prêté son routeur")
        }
        ouvrir(.progressionConcept(concept))
        await VitrineRendu.shared.attendre([.fiche(concept)])
        try? await Task.sleep(for: VitrineStage.pose)
        await VitrineJeu.jouerSurLaFiche(scene)
    }
}
#endif
