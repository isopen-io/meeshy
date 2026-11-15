import Foundation

/// **COMBIEN de médias une publication — ou un commentaire — peut porter**
/// (#6578).
///
/// Miroir Swift de `MAX_POST_MEDIA` (`packages/shared/types/attachment.ts`), la
/// borne que le schéma du serveur applique à `mediaIds` d'un post ET à
/// `attachmentIds` d'un commentaire depuis que le bornage à 1 de ce dernier a
/// été levé.
///
/// > **Deux plafonds seraient deux vérités**, et la seconde dériverait au
/// > premier ajustement : un sélecteur de photos qui en laisse choisir plus que
/// > l'envoi n'en accepte est un contrôle qui ment — l'utilisateur en désigne
/// > douze, le serveur en refuse le lot, et rien à l'écran ne l'avait dit.
///
/// Le dépôt porte encore des `maxSelectionCount: 10` littéraux, écrits avant
/// que cette constante existe ; ils disent la même chose par coïncidence, pas
/// par construction. Les y ramener est un lot à part.
public let MAX_POST_MEDIA = 10
