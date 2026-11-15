import Foundation
import SwiftUI

// MARK: - Le vocabulaire de la rangée

/// Où en est ce qu'une vignette représente : prête, en préparation (anneau
/// indéterminé), en envoi (anneau à `progress`, 0…1), en attente (voile et
/// minuteur) ou en échec (voile et glyphe d'alerte). L'hôte le calcule : la
/// rangée ne connaît ni envoi, ni file, ni média.
public nonisolated enum MeeshyThumbnailStatus: Equatable, Sendable {
    case ready
    case preparing
    case sending(Double)
    case waiting
    case failed
}

/// Le retour haptique de la rangée. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyThumbnailHaptic: String, Sendable, Equatable, CaseIterable {
    case standard
    case none
}

// MARK: - La vignette (valeur)

/// Une vignette : une VALEUR, donc comparable. Aucune chaîne n'est fabriquée
/// ici : l'hôte passe le nom, la valeur dite et le nom de la croix, déjà traduits.
///
/// `contentVersion` dit qu'un aperçu est neuf : la cellule compare ses valeurs,
/// pas la fermeture de l'hôte, donc l'hôte dont l'image vient d'être recomposée
/// incrémente ce compteur et seule CETTE vignette se redessine.
public nonisolated struct MeeshyThumbnail<ID: Hashable & Sendable>: Equatable, Sendable, Identifiable {
    public let id: ID
    public let accessibilityLabel: String
    public let accessibilityValue: String?
    public let status: MeeshyThumbnailStatus
    /// Non nul : la vignette est supprimable, et la croix de l'armement porte ce nom.
    public let removeLabel: String?
    public let contentVersion: Int

    public init(
        id: ID,
        accessibilityLabel: String,
        accessibilityValue: String? = nil,
        status: MeeshyThumbnailStatus = .ready,
        removeLabel: String? = nil,
        contentVersion: Int = 0
    ) {
        self.id = id
        self.accessibilityLabel = accessibilityLabel
        self.accessibilityValue = accessibilityValue
        self.status = status
        self.removeLabel = removeLabel
        self.contentVersion = contentVersion
    }

    public var hasAccessibleName: Bool { !accessibilityLabel.isEmpty }
}

/// Ce que la rangée dit au contenu : la courante, la soulevée, le statut et la
/// taille que la loi d'ajustement lui donne.
public nonisolated struct MeeshyThumbnailState: Equatable, Sendable {
    public let isCurrent: Bool
    public let isLifted: Bool
    public let status: MeeshyThumbnailStatus
    public let size: CGSize

    public init(isCurrent: Bool, isLifted: Bool, status: MeeshyThumbnailStatus, size: CGSize) {
        self.isCurrent = isCurrent
        self.isLifted = isLifted
        self.status = status
        self.size = size
    }
}

// MARK: - Les mots

/// Les noms que la rangée dit au lecteur d'écran : tous viennent de l'hôte.
public nonisolated struct MeeshyThumbnailRowWords: Equatable, Sendable {
    public let add: String
    public let duplicate: String
    public let moveEarlier: String
    public let moveLater: String

    public init(add: String, duplicate: String, moveEarlier: String, moveLater: String) {
        self.add = add
        self.duplicate = duplicate
        self.moveEarlier = moveEarlier
        self.moveLater = moveLater
    }
}

/// Une action d'accessibilité de l'hôte sur une vignette : son nom, son effet.
public struct MeeshyThumbnailAction {
    public let name: String
    public let perform: () -> Void

    public init(name: String, perform: @escaping () -> Void) {
        self.name = name
        self.perform = perform
    }
}
