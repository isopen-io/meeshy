import Foundation

// MARK: - Story Draft Summary

/// Ce qu'il faut pour dresser la liste des brouillons sans en charger aucun :
/// la vue « Mes stories » n'a besoin ni des effets ni des médias pour rendre
/// une ligne.
public struct StoryDraftSummary: Identifiable, Sendable, Equatable {
    public let id: String
    public let updatedAt: Date
    public let slideCount: Int
    /// Premier texte non vide de la story, s'il y en a un — sinon la vue
    /// retombe sur un libellé dérivé du nombre de diapositives.
    public let title: String?
    /// Première image du brouillon encore présente sur disque, pour la vignette.
    /// Chemin LOCAL : à lire directement, pas à résoudre comme une URL distante.
    public let coverFileURL: URL?
    /// Fond de la première slide (hex ou `gradient:…`). Toujours présent, là où
    /// un brouillon n'a ni image ni `thumbHash` — celui-ci n'est composé qu'à
    /// la publication. C'est donc la seule chose que TOUT brouillon peut montrer.
    public let backgroundHex: String?
    /// Composite de toutes les couches, pose des le PREMIER enregistrement du
    /// brouillon par le composer — meme producteur qu'a la publication.
    public let thumbHash: String?
    /// Non-nil : une publication est EN COURS pour ce brouillon (gelé —
    /// exclu des reprises tant que la file/l'upload travaille). Levé au
    /// succès (le brouillon disparaît), à l'échec permanent (il redevient
    /// éditable, avec `lastPublishError`) ou à l'annulation.
    public let pendingPublishAt: Date?
    /// Dernier échec PERMANENT de publication : la story est revenue en
    /// brouillon pour amélioration, l'erreur reste affichable jusqu'à la
    /// prochaine tentative (`markPendingPublish` la supplante).
    public let lastPublishError: String?
    /// Non-nil : ce brouillon ÉDITE une story déjà publiée — la réouverture
    /// doit rouvrir le mode édition (`PUT /posts/:id`), jamais la création.
    public let editingPostId: String?

    public init(id: String, updatedAt: Date, slideCount: Int,
                title: String?, coverFileURL: URL?, backgroundHex: String?,
                thumbHash: String?,
                pendingPublishAt: Date? = nil,
                lastPublishError: String? = nil,
                editingPostId: String? = nil) {
        self.id = id
        self.updatedAt = updatedAt
        self.slideCount = slideCount
        self.title = title
        self.coverFileURL = coverFileURL
        self.backgroundHex = backgroundHex
        self.thumbHash = thumbHash
        self.pendingPublishAt = pendingPublishAt
        self.lastPublishError = lastPublishError
        self.editingPostId = editingPostId
    }
}
