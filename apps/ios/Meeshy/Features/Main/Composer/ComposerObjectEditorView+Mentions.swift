import SwiftUI

/// **La bande `@` de l'écran où la frappe a VRAIMENT lieu** (2026-09-05).
///
/// ## Ce que ce fichier corrige
///
/// Le composer avait trois surfaces de saisie qui montaient une bande de
/// mentions — la description, le document, et le canvas de la première vue.
/// L'éditeur plein écran n'en avait AUCUNE, alors que c'est lui qui reçoit la
/// frappe : `openObjectEditor` (`MeeshyComposerHost+Intake`) présente ce
/// `fullScreenCover` **et** appelle `enterTextEditingMode` dans le même geste,
/// et ce sont les deux seuls appelants d'`enterTextEditingMode` du dépôt.
///
/// La bande de la première vue est donc peinte SOUS un écran modal qui couvre
/// tout, depuis #4634. Elle interprète une frappe qui n'a pas lieu là.
///
/// > **Une vue montée sous un écran modal n'a aucun site où rougir.** Elle
/// > compile, elle se construit, ses conditions s'évaluent — et personne ne la
/// > voit jamais. Le compilateur ne dit rien, aucun témoin ne tombe, et la
/// > capacité paraît servie parce qu'elle est ÉCRITE.
///
/// ## Pourquoi ici, et pas dans le fichier principal
///
/// `ComposerObjectEditorView.swift` frôlait 1180 lignes — sous le plafond dur
/// de 1200, au-dessus du seuil de 1000 où un découpage se justifie sans se
/// discuter. Une extension par SURFACE est le découpage que le budget demande
/// (`+Media` existe déjà pour la même raison).
///
/// Conséquence de forme : `mentionStrip` n'est pas `private`. Un `private` sur
/// une propriété d'une `View` la rend inaccessible depuis un fichier
/// d'extension frère, même dans le module — le piège que le `CLAUDE.md` d'iOS
/// documente sous « accès cross-file ».
extension ComposerObjectEditorView {

    /// **La bande passe AVANT les options, et se peint même quand elles sont
    /// repliées.**
    ///
    /// Elle n'appartient pas à l'outil ouvert : elle appartient à la FRAPPE.
    /// La gater sur `optionsAreCollapsed` la ferait disparaître exactement au
    /// moment où l'auteur replie le panneau pour voir sa scène en tapant — le
    /// geste le plus naturel de cet écran.
    ///
    /// La condition est `showsSuggestions`, LA règle du contrôleur : elle
    /// distingue « on cherche encore » (rien à peindre) de « personne ne
    /// correspond » (la bande le DIT). Les trois autres surfaces écrivaient
    /// chacune la leur, mot pour mot ; celle-ci n'avait pas de règle du tout,
    /// faute de bande.
    ///
    /// Le texte remis à la bande vient du MODÈLE et y retourne par
    /// `updateTextContent` — le même site que la frappe. Un `@State`
    /// intermédiaire ferait diverger ce que le canvas peint de ce que la
    /// publication emporte.
    @ViewBuilder
    var mentionStrip: some View {
        if mentionBox.controller.showsSuggestions,
           let id = viewModel.textEditingMode.activeTextId,
           let objet = viewModel.currentEffects.textObjects.first(where: { $0.id == id }) {
            ComposerMentionStrip(
                controller: mentionBox.controller,
                currentText: objet.text,
                onSelect: { remplace in
                    viewModel.updateTextContent(id: id, text: remplace)
                }
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
