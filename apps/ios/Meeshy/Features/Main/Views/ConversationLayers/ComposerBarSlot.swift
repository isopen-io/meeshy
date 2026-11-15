import SwiftUI

/// L'UNIQUE effacement de type de la chaîne du composer : `UniversalComposerBar`
/// range ses trois fentes (`editBanner`, `replyBanner`,
/// `customAttachmentsPreview`) dans un type effacé, cinq hôtes l'alimentent, et
/// le contrat de la barre ne change pas dans ce lot. L'effacement vit donc ICI,
/// à la frontière de la barre, et nulle part ailleurs dans l'écran.
enum ComposerBarSlot {
    static func erase<V: View>(_ view: V) -> AnyView {
        AnyView(view)
    }
}
