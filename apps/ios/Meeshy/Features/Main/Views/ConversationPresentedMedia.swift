import SwiftUI

// MARK: - Ce que la conversation présente ou ouvre en édition
//
// Enveloppes `Identifiable` des présentations de `ConversationView`, extraites
// de `ConversationView.swift` (cohésion) sans changer de forme.

/// Lot 3.2 — enveloppe `Identifiable` d'une URL de fichier pour la
/// `ShareSheet` de la rangée plate (même patron que `BubbleFullscreenPlace`).
struct FocalShareFileItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
}

/// A pending audio attachment opened for editing — carries the attachment id
/// so the editor can replace that exact tray chip on confirm (never append).
/// La vidéo en attente ouverte dans l'éditeur, avec l'id de SA pièce jointe
/// (#8443) : sans lui, le résultat ne savait pas quel chip remplacer.
struct PendingVideoEdit: Identifiable, Equatable {
    let id: String
    let url: URL
}

struct PendingAudioEdit: Identifiable, Equatable {
    /// The id of the `MessageAttachment` being edited.
    let id: String
    let url: URL
}
