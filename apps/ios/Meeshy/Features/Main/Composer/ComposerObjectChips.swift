import SwiftUI
import MeeshySDK
import MeeshyUI


// L'inspecteur de l'objet sélectionné — une RÈGLE pure, sortie de
// `ComposerHostRules.swift` quand elle a cessé de ne connaître que le texte.
// Trois kinds y répondent maintenant à la même question, et la question a un
// nom : « qu'est-ce que cet objet DIT de lui, sans qu'on le touche ? »

/// **Ce que l'inspecteur d'un objet DIT de lui (#4073, vue `1c`).**
///
/// La planche montre une rangée horizontale de jetons portant des valeurs
/// lisibles — `STYLE · NÉON`, `TAILLE 38`, `ALIGN ▭`, `0:00 → 0:06`. L'app rend
/// des bulles d'icônes : on y lit ce qu'on peut CHANGER, jamais ce qui EST.
///
/// La différence n'est pas décorative. Un réglage qu'il faut ouvrir pour
/// connaître oblige l'auteur à explorer pour se souvenir ; un jeton qui porte sa
/// valeur répond sans être touché. C'est la dimension 12 — **la complexité se
/// paie dans le code, jamais chez l'utilisateur**.
///
/// La règle rend des MOTS, pas des vues : ce qu'un jeton affiche s'éprouve sans
/// monter d'écran, ce qu'il ouvre est l'affaire de la vue.
nonisolated enum ComposerObjectChips {

    struct Chip: Equatable {
        /// Identité STABLE, indépendante du libellé : c'est elle que la vue
        /// utilise pour savoir quel réglage ouvrir, et elle ne change pas quand
        /// la valeur change.
        let id: String
        let label: String

        /// **Où cette valeur se CHANGE.** `nil` ⇒ nulle part — le jeton reste
        /// une LECTURE, et la vue ne l'annonce alors ni comme bouton ni comme
        /// activable.
        ///
        /// > Le contrat de la rangée portait `activeChipId` et `onSelect`
        /// > depuis sa livraison, et aucun hôte ne les remplissait : six
        /// > capsules qui s'annonçaient `.isButton` à VoiceOver, vibraient
        /// > sous le doigt, et n'ouvraient rien. La loi 4 dans sa forme la
        /// > plus coûteuse — le contrôle n'est pas absent, il PROMET.
        ///
        /// **La destination est une BANDE, jamais un outil du rail**, et ce
        /// n'est pas un rangement : `isServed` cache la rangée dès qu'un outil
        /// s'ouvre, donc un jeton menant à un outil ne pourrait JAMAIS se
        /// montrer actif. Le choix de destination est ce qui rend l'état
        /// encadré de la planche atteignable.
        var destination: ComposerSceneBand?
    }

    /// **Une destination n'est attachée que si sa bande est OUVRABLE.**
    ///
    /// `ComposerSceneBand.opened` refuse déjà d'ouvrir une bande absente du jeu
    /// servi ; attacher la destination sans regarder ce jeu fabriquerait un
    /// jeton qui s'illumine, vibre et n'ouvre rien — exactement le défaut que
    /// cette moitié de la règle existe pour fermer. Le jour où `.textStyles`
    /// trouve son hôte (#4083), le jeton STYLE devient actionnable sans qu'une
    /// ligne change ici : c'est le jeu SERVI qui décide, pas une liste tenue à
    /// la main.
    private static func porte(_ bande: ComposerSceneBand,
                              parmi ouvrables: Set<ComposerSceneBand>) -> ComposerSceneBand? {
        ouvrables.contains(bande) ? bande : nil
    }

    /// **Un jeton paraît quand il a quelque chose à DIRE** (loi 8). Un style
    /// absent ne fabrique pas « STYLE · — » : ce libellé occuperait la place en
    /// affirmant une valeur qui n'existe pas, ce qui enseigne moins que rien.
    ///
    /// La TAILLE fait exception et paraît toujours : elle n'est jamais absente
    /// du modèle — `fontSize` est non-optionnelle et porte une valeur par
    /// défaut. Il n'y a donc pas d'état « sans taille » à taire.
    ///
    /// L'ordre suit la planche — ce qui change l'apparence d'abord, le temps en
    /// dernier — et il ne dépend PAS de ce qui est renseigné : un jeton qui
    /// apparaît ne doit pas déplacer ses voisins sous le doigt.
    /// - Parameter locale: la locale qui FORME les nombres du jeton. Elle est
    ///   un paramètre plutôt qu'une lecture de `.current` parce qu'une règle
    ///   pure doit pouvoir être éprouvée sur une locale AUTRE que celle de la
    ///   machine qui la teste : un témoin qui lit `.current` rend le même
    ///   verdict avec et sans localisation, donc ne prouve rien.
    static func chips(for text: StoryTextObject,
                      locale: Locale = .current,
                      openableBands: Set<ComposerSceneBand> = []) -> [Chip] {
        var jetons: [Chip] = []
        if let style = text.textStyle, !style.isEmpty {
            jetons.append(Chip(id: "style", label: "STYLE · \(styleName(style))",
                               destination: porte(.textStyles, parmi: openableBands)))
        }
        let taille = LocalizedNumber.exact(Int(text.fontSize.rounded()), locale: locale)
        jetons.append(Chip(id: "size", label: "TAILLE \(taille)"))
        if let align = text.textAlign, !align.isEmpty {
            jetons.append(Chip(id: "align", label: "ALIGN · \(alignName(align))"))
        }
        if let fenetre = window(start: text.startTime,
                                duration: text.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timeline, parmi: openableBands)))
        }
        return jetons
    }

    /// `nil` ⇒ le texte est PERMANENT : il n'a pas de fin à annoncer, et un
    /// « 0:00 → 0:00 » mentirait sur sa durée.
    static func window(start: Double?, duration: Double?,
                       locale: Locale = .current) -> String? {
        guard let duration, duration > 0 else { return nil }
        let debut = max(0, start ?? 0)
        return "\(timecode(debut, locale: locale)) → \(timecode(debut + duration, locale: locale))"
    }

    /// **`String(format: "%d:%02d")` vécut ici, et gravait les chiffres
    /// LATINS** — « 0:06 » dans une interface arabe, où la fenêtre de temps
    /// s'écrit « ٠:٠٦ ». Le défaut n'a pas la forme qu'une garde de littéral
    /// reconnaît : aucune chaîne interpolée, aucun `\(…)`, juste un formateur
    /// qui rend un `String` déjà faux. `NumericAccessibilityValueGuardTests`
    /// va donc le chercher à sa SOURCE, dans le corps du formateur.
    ///
    /// L'arrondi PRÉCÈDE le formatage et reste ici : `LocalizedNumber` tronque
    /// vers zéro (c'est ce qu'une position de lecture demande), là où une
    /// BORNE de fenêtre s'arrondit — 5,7 s de durée annoncent 6 s, pas 5.
    static func timecode(_ seconds: Double, locale: Locale = .current) -> String {
        LocalizedNumber.duration(seconds: max(0, Int(seconds.rounded())), locale: locale)
    }

    /// Les cinq styles du modèle, dans les mots de la planche. Un style inconnu
    /// se rend TEL QUEL en majuscules plutôt que d'être tu : une valeur que le
    /// serveur a acceptée existe, et la cacher ferait croire à son absence.
    static func styleName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "neon": return "NÉON"
        case "bold": return "GRAS"
        case "typewriter": return "MACHINE"
        case "handwriting": return "MANUSCRIT"
        case "classic": return "CLASSIQUE"
        default: return raw.uppercased()
        }
    }

    // MARK: - Quand la rangée PARAÎT

    /// **La rangée paraît quand un objet est sélectionné ET qu'aucun outil
    /// n'occupe le bas.**
    ///
    /// > **Le premier câblage a demandé `toolOptions == nil`, et la rangée n'a
    /// > jamais pu paraître.** L'hôte passe ce panneau INCONDITIONNELLEMENT —
    /// > il se vide lui-même quand aucun outil n'est ouvert, et c'est sa façon
    /// > à lui de tenir la loi 4. Une vue qui existe toujours ne peut donc pas
    /// > servir de témoin à « un outil est ouvert » : la condition était
    /// > toujours fausse, et aucun témoin de RÈGLE ne pouvait le voir.
    ///
    /// La question se pose donc au MODE DU RAIL, qui la porte vraiment.
    /// `toolIsOpen` est un booléen plutôt que le mode lui-même pour que la
    /// règle reste éprouvable sans monter la moindre vue — et pour dire, par sa
    /// signature, ce qu'elle interroge réellement.
    ///
    /// Vérifié À L'ÉCRAN le 2026-08-31 : c'est la seule chose qui séparait une
    /// rangée correcte d'une rangée invisible.
    static func isServed(toolIsOpen: Bool, chips: [Chip]) -> Bool {
        !toolIsOpen && !chips.isEmpty
    }

    // MARK: - La résolution par SÉLECTION

    /// **Le dispatch par kind vit ICI, pas dans la vue.**
    ///
    /// Le meuble ne tient qu'un `id` : c'est la slide qui sait de quel kind il
    /// est. Faire résoudre la vue l'obligerait à connaître les trois types du
    /// modèle, et surtout mettrait le `switch` hors de portée d'un témoin —
    /// alors que c'est précisément lui qui réalise la promesse de la planche,
    /// « il change de contenu selon le kind ».
    ///
    /// `[]` ⇒ aucun objet sélectionné, ou un id qui ne désigne plus rien (un
    /// objet supprimé pendant que la sélection tenait encore). Dans les deux
    /// cas la rangée disparaît, plutôt que de peindre un cadre vide (loi 8).
    static func chips(forSelected id: String?,
                      in slide: StorySlide,
                      locale: Locale = .current,
                      openableBands: Set<ComposerSceneBand> = []) -> [Chip] {
        guard let id else { return [] }
        if let texte = slide.effects.textObjects.first(where: { $0.id == id }) {
            return chips(for: texte, locale: locale, openableBands: openableBands)
        }
        if let media = (slide.effects.mediaObjects ?? []).first(where: { $0.id == id }) {
            return chips(for: media, locale: locale, openableBands: openableBands)
        }
        if let sticker = (slide.effects.stickerObjects ?? []).first(where: { $0.id == id }) {
            return chips(for: sticker, locale: locale, openableBands: openableBands)
        }
        return []
    }

    // MARK: - Le BADGE de l'objet sélectionné

    /// **Ce que le badge de la vue `1c` dit — « TEXTE · PLAN FG · z 2 ».**
    ///
    /// `nil` ⇒ rien n'est sélectionné, ou l'id ne désigne plus rien (un objet
    /// supprimé pendant que la sélection tenait encore). Dans les deux cas le
    /// canvas n'encadre rien, plutôt que d'encadrer du vide.
    ///
    /// ## Pourquoi le PLAN et le Z sont dans le badge
    ///
    /// Ce n'est pas de l'information technique offerte au passage. `bringForward`
    /// et `sendBackward` vivent au rail *trailing*, mutent `zIndex` sur le
    /// modèle, et ne rendent **aucun retour visible** : sur deux objets qui ne se
    /// chevauchent pas, empiler ne change rien à l'écran. L'auteur empilait à
    /// l'aveugle. Un badge qui porte `z 2` transforme une action muette en action
    /// lisible — dimension 8, « feedback instantané ».
    ///
    /// Le PLAN complète la réponse : un média de fond ne se déplace pas comme un
    /// objet de premier plan (règle produit 2026-07-11, le fond n'est mouvable
    /// que par sa propre porte). Dire le plan explique donc pourquoi le doigt
    /// n'obtient pas le même effet sur deux objets d'apparence semblable.
    static func badge(forSelected id: String?,
                      in slide: StorySlide,
                      locale: Locale = .current) -> String? {
        guard let id else { return nil }
        if let texte = slide.effects.textObjects.first(where: { $0.id == id }) {
            return badge(kind: "TEXTE", isBackground: false,
                         zIndex: texte.zIndex, locale: locale)
        }
        if let media = (slide.effects.mediaObjects ?? []).first(where: { $0.id == id }) {
            return badge(kind: "MÉDIA", isBackground: media.isBackground,
                         zIndex: media.zIndex, locale: locale)
        }
        if let sticker = (slide.effects.stickerObjects ?? []).first(where: { $0.id == id }) {
            return badge(kind: "STICKER", isBackground: false,
                         zIndex: sticker.zIndex, locale: locale)
        }
        return nil
    }

    /// Les trois parties se composent ICI et pas au site d'appel : la forme du
    /// badge — le séparateur, l'ordre, la casse — est une décision unique, et
    /// trois recompositions divergeraient au premier ajustement.
    ///
    /// Le `z` reste MINUSCULE au milieu de deux mots capitalisés, comme la
    /// maquette : c'est ce qui le fait lire comme une unité (« z 2 ») plutôt
    /// que comme un troisième mot.
    private static func badge(kind: String, isBackground: Bool,
                              zIndex: Int, locale: Locale) -> String {
        let plan = isBackground ? "PLAN BG" : "PLAN FG"
        return "\(kind) · \(plan) · z \(LocalizedNumber.exact(zIndex, locale: locale))"
    }

    // MARK: - L'état ENCADRÉ, et la bascule qui le produit

    /// **Le jeton actif est celui de la bande OUVERTE.** La planche l'encadre,
    /// et c'est la seule chose de la rangée que VoiceOver ne peut pas lire dans
    /// un libellé.
    ///
    /// Interroger la bande plutôt que de retenir un id à part évite la seule
    /// panne que cet état puisse avoir : un cadre qui survit à la fermeture de
    /// ce qu'il désigne. Et la comparaison porte sur la DESTINATION, jamais sur
    /// « une bande est ouverte » — la palette de fond s'ouvre depuis la rangée
    /// d'outils basse et ne règle aucun objet.
    static func activeChipId(chips: [Chip], openedBand: ComposerSceneBand?) -> String? {
        guard let openedBand else { return nil }
        return chips.first { $0.destination == openedBand }?.id
    }

    /// **Taper le jeton actif REFERME sa bande.** Sans bascule, l'auteur n'a
    /// aucun geste pour ranger ce qu'il vient d'ouvrir depuis le même endroit :
    /// l'ouverture serait un aller simple.
    ///
    /// Un jeton SANS destination laisse la bande exactement où elle est — la
    /// refermer ferait de « TAILLE 140 % », pendant un rognage, un bouton
    /// d'annulation déguisé.
    static func toggled(_ chipId: String,
                        in chips: [Chip],
                        opened: ComposerSceneBand?) -> ComposerSceneBand? {
        guard let destination = chips.first(where: { $0.id == chipId })?.destination else {
            return opened
        }
        return opened == destination ? nil : destination
    }

    // MARK: - Les autres kinds

    /// **« Il change de contenu selon le kind, jamais de place »** — c'est la
    /// phrase de la planche, et c'est une exigence de POSITION autant que de
    /// contenu. Elle se tient ici en rendant le MÊME type pour les trois kinds :
    /// la vue n'a pas à savoir ce qu'elle affiche, donc elle ne peut pas se
    /// ranger différemment selon le cas.
    ///
    /// L'ordre est celui du texte — ce qui change l'APPARENCE d'abord, le TEMPS
    /// en dernier — pour la même raison : un jeton qui apparaît ne doit pas
    /// déplacer ses voisins sous le doigt.
    static func chips(for media: StoryMediaObject,
                      locale: Locale = .current,
                      openableBands: Set<ComposerSceneBand> = []) -> [Chip] {
        var jetons: [Chip] = [sizeChip(scale: media.scale, locale: locale)]
        if let rotation = rotationChip(media.rotation, locale: locale) {
            jetons.append(rotation)
        }
        // Le SON ne se dit que s'il existe et qu'il a été touché : une vidéo au
        // volume nominal n'a rien à annoncer, et une image n'a pas de son du
        // tout. Annoncer « SON 100 % » sur une photo enseignerait moins que rien.
        if media.kind == .video, abs(Double(media.volume) - 1) > 0.001 {
            jetons.append(Chip(id: "volume",
                               label: "SON \(LocalizedNumber.percent(Int((Double(media.volume) * 100).rounded()), locale: locale))"))
        }
        if let fenetre = window(start: media.startTime,
                                duration: media.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timeline, parmi: openableBands)))
        }
        return jetons
    }

    static func chips(for sticker: StorySticker,
                      locale: Locale = .current,
                      openableBands: Set<ComposerSceneBand> = []) -> [Chip] {
        var jetons: [Chip] = [sizeChip(scale: sticker.scale, locale: locale)]
        if let rotation = rotationChip(sticker.rotation, locale: locale) {
            jetons.append(rotation)
        }
        if let fenetre = window(start: sticker.startTime,
                                duration: sticker.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timeline, parmi: openableBands)))
        }
        return jetons
    }

    /// **La taille ne manque JAMAIS**, quel que soit le kind — `fontSize` et
    /// `scale` sont non-optionnelles et portent une valeur par défaut. C'est ce
    /// qui garantit qu'un objet sélectionné a toujours au moins un jeton : une
    /// rangée vide ne dirait pas « rien à régler », elle aurait l'air cassée.
    ///
    /// L'échelle se dit en POURCENTAGE et non en « ×1,4 » : c'est la forme que
    /// `LocalizedNumber.percent` sait rendre dans les sept langues, glyphe et
    /// espacement compris — « 140 % » en français, « 140% » en anglais.
    private static func sizeChip(scale: Double, locale: Locale) -> Chip {
        Chip(id: "size",
             label: "TAILLE \(LocalizedNumber.percent(Int((scale * 100).rounded()), locale: locale))")
    }

    /// `nil` ⇒ l'objet est DROIT, et « ROTATION 0° » occuperait la place pour
    /// annoncer l'absence de rotation (loi 8).
    private static func rotationChip(_ degres: Double, locale: Locale) -> Chip? {
        let arrondi = Int(degres.rounded())
        guard arrondi != 0 else { return nil }
        return Chip(id: "rotation", label: "ROTATION \(LocalizedNumber.exact(arrondi, locale: locale))°")
    }

    static func alignName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "left": return "GAUCHE"
        case "center": return "CENTRÉ"
        case "right": return "DROITE"
        default: return raw.uppercased()
        }
    }
}