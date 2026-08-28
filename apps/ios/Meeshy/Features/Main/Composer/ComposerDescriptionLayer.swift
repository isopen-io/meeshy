import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La description est un calque de LECTURE, pas un champ** (#4065, planche
/// rév. 27 § P4).
///
/// ## Ce que ça change, et pourquoi c'est la loi 6
///
/// Au repos, la description se rend **comme le lecteur la verra** — même
/// renderer, même taille, même traitement des mentions et des hashtags, même
/// troncature. Un tap la déplie en édition ; la refermer la re-rend.
///
/// C'est la loi 6 (« le lecteur EST l'aperçu ») portée au TEXTE : jusqu'ici elle
/// ne valait que pour la scène. Un `TextField` permanent montrait à l'auteur une
/// chose — un cadre de saisie — pendant que son public en verrait une autre.
///
/// **Le rendu passe par `MessageTextRenderer`, celui-là même que le lecteur
/// utilise** (`ReelsPlayerView.reelDescriptionText`, `PostDetailView`). Une
/// seconde mise en forme « qui ressemble » aurait divergé au premier ajustement,
/// et un `@mention` serait resté du texte brut ici alors qu'il est coloré et
/// cliquable là-bas — un aperçu qui ment sur le rendu final est exactement ce
/// que la loi 6 interdit.
///
/// ## Le Prisme ne s'exerce PAS ici, et c'est le piège de l'issue pris à l'endroit
///
/// L'issue met en garde : « rendre la description en mode reader sans passer par
/// le résolveur du lecteur donnerait un aperçu qui ment ». Le résolveur, à la
/// COMPOSITION, n'a rien à résoudre — le texte vient d'être frappé, aucune
/// traduction n'existe encore, et le pipeline ne tourne qu'après publication.
///
/// Donc ce calque **rend le texte de l'auteur et n'annonce AUCUNE langue.**
/// Poser une pastille de langue ici serait le défaut du cycle 123 refait à
/// l'identique — une surface qui AFFIRME une langue qu'elle ne sert pas — et il
/// serait pire ici, puisque la langue affirmée serait celle d'une traduction qui
/// n'existe pas. Le Prisme s'exerce à la LECTURE, sur le contenu publié.
///
/// ## Deux libellés, et ils ne disent pas la même chose
///
/// - **l'amorce** appartient au CALQUE : elle décrit le GESTE (« Touchez pour
///   écrire »), et c'est le calque qui l'offre, pas son hôte ;
/// - **l'invite du champ** appartient à l'HÔTE : elle décrit le CONTENU attendu
///   (« Qu'avez-vous en tête ? », « Ajoutez une description… »), qui n'est pas le
///   même selon le profil.
///
/// Les confondre aurait donné soit une amorce qui ne dit pas quoi faire, soit
/// une invite de champ qui parle d'un tap qu'on ne peut plus faire — on est déjà
/// en train d'écrire.
struct ComposerDescriptionLayer: View {

    @Binding var text: String

    /// L'invite du CHAMP — ce que l'hôte attend comme contenu.
    let placeholder: String

    /// La troncature du repos. Trois lignes, comme la légende d'un réel : au
    /// delà, la description mangerait la place que l'encastrement vient de
    /// libérer (#4061).
    var collapsedLineLimit: Int = 3

    /// **Ouvre directement en ÉDITION** (#4124). La couche plein écran de
    /// l'atelier est ouverte PAR un geste qui dit déjà « je veux écrire » :
    /// y présenter d'abord le mode lecture demanderait un second tap pour
    /// atteindre ce que le premier avait demandé.
    ///
    /// Défaut `false` — le calque monté en place (surface de scène) s'ouvre au
    /// repos, où c'est le tap sur le texte qui déclenche l'édition.
    var opensEditingOnAppear: Bool = false

    /// **Occupe toute la hauteur qu'on lui donne** (#4124). Le champ compact
    /// convient au calque posé EN PLACE, où il légende une scène ; la couche
    /// plein écran, elle, est une surface d'écriture — le texte y part du haut
    /// et descend. Centré dans une hauteur libre, il flotterait au milieu d'un
    /// vide et sauterait d'une demi-ligne à chaque retour.
    var fillsAvailableHeight: Bool = false

    @State private var isEditing = false
    @FocusState private var isFocused: Bool

    /// **L'autocomplétion @mention du calque.** État d'UI ÉPHÉMÈRE, purement
    /// local à ce champ — même patron que `ComposerDocumentSurface`,
    /// `PostDetailView` et `FeedCommentsSheet`, qui en portent chacun un.
    ///
    /// Ce n'est pas une règle dédoublée : la RÈGLE (« qu'est-ce qu'un `@`
    /// actif », « où insérer le pseudo ») vit dans `MentionComposerController`
    /// et n'existe qu'une fois. Ce qui se dédouble est le CURSEUR, et un
    /// curseur par champ est exactement ce qu'il faut — deux champs partageant
    /// une requête active se voleraient leurs suggestions.
    @StateObject private var mentionBox = ComposerMentionControllerBox()

    var body: some View {
        Group {
            if isEditing { editor } else { reader }
        }
        .frame(maxWidth: .infinity,
               maxHeight: fillsAvailableHeight ? .infinity : nil,
               alignment: .topLeading)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .onAppear { if opensEditingOnAppear { isEditing = true } }
    }

    // MARK: - Le repos : ce que le lecteur verra

    /// **Un bouton, pas un `onTapGesture`.** VoiceOver annonce alors le trait
    /// « bouton » — donc que la zone FAIT quelque chose —, et l'indice nomme
    /// l'action. Un geste posé sur du texte n'aurait annoncé qu'un texte.
    private var reader: some View {
        Button {
            isEditing = true
        } label: {
            readerText
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(text.isEmpty ? ComposerDescriptionCopy.amorce : text))
        .accessibilityHint(Text(ComposerDescriptionCopy.editHint))
    }

    /// Vide ⇒ une amorce, **jamais un cadre vide**. Un cadre annonce une zone de
    /// saisie ; l'amorce annonce un geste, et c'est le geste qui manque à
    /// l'auteur devant une description qu'il n'a pas encore écrite.
    @ViewBuilder
    private var readerText: some View {
        if text.isEmpty {
            Text(ComposerDescriptionCopy.amorce)
                .font(MeeshyFont.relative(15))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        } else {
            MessageTextRenderer.render(
                text,
                fontSize: 15,
                color: MeeshyColors.textPrimary(isDark: true),
                mentionColor: MeeshyColors.mentionColor(isDark: true),
                hashtagColor: MeeshyColors.hashtagColor(isDark: true),
                accentColor: MeeshyColors.textPrimary(isDark: true),
                usesRelativeFont: true
            )
            .lineLimit(collapsedLineLimit)
            .multilineTextAlignment(.leading)
        }
    }

    // MARK: - L'édition, dépliée au tap

    /// **La fermeture est un contrôle EXPLICITE, et il le faut.** Avec
    /// `axis: .vertical`, la touche retour insère une ligne — `onSubmit` ne part
    /// jamais. Sans bouton, le seul moyen de re-rendre le calque aurait été de
    /// perdre le focus ailleurs : une sortie qu'aucun libellé n'annonce, et que
    /// VoiceOver ne peut pas atteindre.
    private var editor: some View {
        VStack(alignment: .leading, spacing: 8) {
            // La bande des mentions passe EN TÊTE quand la couche remplit
            // l'écran : le curseur y démarre en haut, pas au ras du clavier.

            // **La bande des mentions s'insère AU-DESSUS du champ**, jamais en
            // dessous : le calque vit au bas de l'écran, juste sur le socle —
            // une bande posée sous le champ passerait derrière lui.
            //
            // `!suggestions.isEmpty`, pas seulement `activeQuery != nil` — même
            // raison que la bande du document : ici il n'y a AUCUN appel réseau
            // en attente qui remplirait la liste plus tard, donc « pas d'ami
            // accepté », « requête sans correspondance » et « chargement en
            // cours » sont tous des états NOMINAUX. Gater sur la seule requête
            // peindrait une bande de verre vide dans chacun.
            if mentionBox.controller.activeQuery != nil && !mentionBox.controller.suggestions.isEmpty {
                ComposerMentionStrip(
                    controller: mentionBox.controller,
                    currentText: text,
                    onSelect: { updated in text = updated }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            field
            if fillsAvailableHeight { Spacer(minLength: 0) }
        }
        .animation(
            .spring(response: 0.3, dampingFraction: 0.8),
            value: mentionBox.controller.activeQuery != nil && !mentionBox.controller.suggestions.isEmpty
        )
        // Les amis acceptés sont le seul jeu de candidats : mentionner qui ne
        // vous a pas accepté n'a pas de destinataire.
        .task { mentionBox.candidates = await ComposerMentionFriendsSource.acceptedFriends() }
        // **Le `@` déclenche la bande, et c'est le TEXTE qui le dit** — jamais
        // un geste ni un bouton. La règle d'extraction vit dans le contrôleur
        // (`extractMentionQuery`), partagée avec les trois autres champs du
        // dépôt qui la posent.
        .adaptiveOnChange(of: text) { _, nouveau in
            mentionBox.controller.handleQuery(in: nouveau)
        }
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(fillsAvailableHeight ? 1...24 : 1...5)
                .font(MeeshyFont.relative(15))
                // Adaptatif, pour la même raison que la coche : le calque sert
                // deux fonds, un plateau sombre et une couche floutée qui prend
                // la teinte de la scène.
                .glassControlForeground()
                .focused($isFocused)
                .accessibilityLabel(Text(placeholder))

            Button {
                isFocused = false
                isEditing = false
                // La requête ne survit pas à la fermeture : rouvrir le calque
                // sur une bande héritée d'une frappe précédente offrirait des
                // suggestions pour un `@` que le curseur a quitté.
                mentionBox.controller.clearSuggestions()
            } label: {
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(14).weight(.semibold))
                    // Adaptatif : le calque vit sur le plateau SOMBRE de la
                    // surface de scène ET sur la couche floutée de l'atelier,
                    // qui prend la teinte du fond composé. Une couleur figée
                    // « claire » disparaît sur la seconde.
                    .glassControlForeground()
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel(Text(ComposerDescriptionCopy.done))
        }
        .onAppear {
            // Une prise de focus posée dans le tour de boucle de l'insertion est
            // avalée : le champ n'est pas encore dans la chaîne de responder.
            // Même raison que le `focusDelay` de la surface document, en plus
            // court — la vue est déjà à l'écran, seul le champ vient de naître.
            DispatchQueue.main.async { isFocused = true }
        }
    }
}

/// Les libellés du calque, résolus par le catalogue `.main`. Écrits ici plutôt
/// qu'en littéraux dans la vue : un libellé posé en ligne échappe au cliquet de
/// complétude et n'est jamais traduit.
nonisolated enum ComposerDescriptionCopy {

    static var amorce: String {
        String(localized: "composer.description.amorce",
               defaultValue: "Touchez pour écrire", bundle: .main)
    }

    static var editHint: String {
        String(localized: "composer.description.a11y.edit",
               defaultValue: "Touchez pour modifier la description", bundle: .main)
    }

    static var done: String {
        String(localized: "composer.description.a11y.done",
               defaultValue: "Terminer la description", bundle: .main)
    }

    /// Le libellé du bouton de clavier de la COUCHE (#4124). Court, parce qu'il
    /// se lit dans la barre du clavier où « Terminer la description » serait
    /// tronqué — et parce qu'à cet endroit le contexte est déjà donné par ce
    /// qu'on est en train d'écrire. `common.done` existe et est traduite dans
    /// les sept langues : aucune clé neuve pour une phrase déjà servie.
    static var doneShort: String {
        String(localized: "common.done", defaultValue: "Terminé", bundle: .main)
    }

    /// Ce que l'icône de la rangée haute OUVRE — l'indice VoiceOver du geste,
    /// distinct de l'indice du calque en place (« Touchez pour modifier »),
    /// parce que le geste n'est pas le même : ici on ouvre une couche.
    static var openLayer: String {
        String(localized: "composer.description.a11y.open",
               defaultValue: "Écrire la description", bundle: .main)
    }
}
