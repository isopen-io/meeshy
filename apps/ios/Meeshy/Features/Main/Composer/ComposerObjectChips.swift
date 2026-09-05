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
        /// **La destination est une SECTION DE L'ÉDITEUR** depuis la directive
        /// porteur 2026-09-05 — plus une bande du bas de scène.
        ///
        /// Elle a été une `ComposerSceneBand` tant que la première vue portait
        /// ses propres ateliers ; elle ne peut plus l'être, la première vue
        /// n'éditant plus rien (`ComposerFirstView`). Le jeton reste ce qu'il
        /// était — une LECTURE — et ce qu'il ouvre a changé de place : l'écran
        /// plein, sur la section où cette valeur-là se change.
        ///
        /// > Retirer la destination aurait été plus simple et pire : la rangée
        /// > serait devenue six capsules muettes, et la seule porte vers
        /// > l'éditeur serait restée l'appui long — un geste qu'on ne découvre
        /// > pas. Un jeton qui DIT « ALIGN ▭ » et ouvre l'alignement est la
        /// > forme la plus courte du chemin nominal (loi 7).
        var destination: ComposerObjectEditorSection?
    }

    /// **Une destination n'est attachée que si la FAMILLE la sert.**
    ///
    /// Le jeu servi ne dépend plus d'un état d'écran — l'éditeur est toujours
    /// ouvrable — mais de ce que l'éditeur MONTRE pour cette famille :
    /// `ComposerObjectEditorRail.entries(for:)` en est le juge unique. Un
    /// sticker n'a pas de panneau d'options, donc un jeton qui pointerait sur
    /// `.tool(.style)` s'illuminerait, vibrerait, et ouvrirait un écran où la
    /// section n'existe pas — `selection(forFamily:keeping:)` retomberait
    /// silencieusement sur la première servie.
    ///
    /// > C'est la même loi qu'avant, posée sur la question qui a remplacé
    /// > l'ancienne : ce n'est plus « cette bande est-elle ouvrable ? » mais
    /// > « cette famille règle-t-elle cela ? ».
    private static func porte(_ section: ComposerObjectEditorSection,
                              pour famille: MeeshySceneObject.Kind) -> ComposerObjectEditorSection? {
        ComposerObjectEditorRail.entries(for: famille).contains(section) ? section : nil
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
                      locale: Locale = .current) -> [Chip] {
        var jetons: [Chip] = []
        if let style = text.textStyle, !style.isEmpty {
            jetons.append(Chip(id: "style", label: ComposerObjectChipsCopy.style(styleName(style)),
                               destination: porte(.tool(.style), pour: .text)))
        }
        let taille = LocalizedNumber.exact(Int(text.fontSize.rounded()), locale: locale)
        // La TAILLE se règle au curseur du panneau POLICE — la même section que
        // le style, parce que c'est la même décision typographique.
        jetons.append(Chip(id: "size", label: ComposerObjectChipsCopy.size(taille),
                           destination: porte(.tool(.style), pour: .text)))
        if let align = text.textAlign, !align.isEmpty {
            jetons.append(Chip(id: "align", label: ComposerObjectChipsCopy.align(alignName(align)),
                               destination: porte(.tool(.align), pour: .text)))
        }
        if let fenetre = window(start: text.startTime,
                                duration: text.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timing, pour: .text)))
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
        ComposerObjectChipsCopy.styleName(raw)
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
    ///
    /// **La moitié « un outil est ouvert » a déménagé au #5010.** Elle vivait
    /// ici en `!toolIsOpen`, et deux autres rangées du bas portaient — ou ne
    /// portaient pas — leur propre copie de la même condition. Elle vit
    /// désormais dans `ComposerCanonicalZone`, qui tient l'INVENTAIRE de ce que
    /// la zone basse peint et de ce qui cède la place.
    ///
    /// Ce qui RESTE ici est ce qui n'appartient qu'aux jetons : une rangée
    /// vide ne se peint pas. Composer les deux plutôt que de tout déplacer est
    /// délibéré — la règle partagée ne connaît pas les jetons, et lui apprendre
    /// `chips.isEmpty` la ferait connaître chaque élément qu'elle gouverne.
    static func isServed(toolIsOpen: Bool, chips: [Chip]) -> Bool {
        ComposerCanonicalZone.isServed(.objectChips, toolIsOpen: toolIsOpen) && !chips.isEmpty
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
                      locale: Locale = .current) -> [Chip] {
        guard let id, let objet = slide.sceneObject(id: id) else { return [] }
        // **La cascade est fermée** (#4591) : `sceneObject(id:)` la porte UNE
        // fois, dans le modèle. Ce qui reste ici est le dispatch par kind — la
        // seule chose que cette règle avait à décider.
        //
        // Le `switch` est EXHAUSTIF, et c'est le gain réel : l'ancienne cascade
        // de trois `if let` rendait `[]` en silence pour un lieu ou un son. Une
        // sixième famille ne compilera pas tant qu'elle n'aura pas dit ce
        // qu'elle inspecte.
        switch objet {
        case .text(let o):    return chips(for: o, locale: locale)
        case .media(let o):   return chips(for: o, locale: locale)
        case .sticker(let o): return chips(for: o, locale: locale)
        case .audio(let o):   return chips(for: o, locale: locale)
        case .place:
            // Le lieu ne porte que son nom, et il est déjà dit par l'en-tête de
            // la scène (#4034) : un jeton le répéterait sans rien offrir à
            // régler. Ce `return []` est ÉCRIT, jamais un défaut de cascade.
            return []
        }
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
    /// - Parameter preUpload: l'état de la pré-montée de CET objet, quand il en
    ///   a une (#5086, vue `4c`). Il s'ajoute au badge plutôt que d'occuper une
    ///   surface neuve : la vue `4c` dit l'état de l'asset À CÔTÉ de ce qui le
    ///   décrit — « porteur · plan content » puis « MONTÉE EN COURS · 34 % » —,
    ///   et c'est déjà exactement ce que ce badge est.
    ///
    ///   `.idle` par défaut : la très grande majorité des objets n'a rien qui
    ///   monte, et les quatre autres familles n'ont pas d'asset du tout.
    static func badge(forSelected id: String?,
                      in slide: StorySlide,
                      preUpload: ComposerPreUploadState = .idle,
                      locale: Locale = .current) -> String? {
        guard let id, let objet = slide.sceneObject(id: id) else { return nil }
        // Le PLAN et le RANG viennent de la somme, qui les résout pour les cinq
        // familles — y compris l'asymétrie du `zIndex` optionnel de l'audio.
        // Seul le MOT reste à décider ici : c'est du vocabulaire produit.
        // **Plus de `guard let` ici** : `badgeKind` est TOTAL depuis que les
        // cinq familles ont leur mot. Le seul `nil` qui subsiste est celui du
        // dessus — l'id qui ne désigne plus rien, un objet supprimé pendant que
        // la sélection le tenait encore. Un état NOMINAL, pas une lacune.
        let socle = badge(kind: badgeKind(objet.kind), isBackground: objet.isBackground,
                          zIndex: objet.zIndex, locale: locale)
        // **La MONTÉE ne se dit que si elle a quelque chose à dire.** `nil`
        // plutôt qu'une chaîne vide chez `ComposerPreUploadCopy` : une chaîne
        // vide se concaténerait en silence et laisserait un séparateur
        // orphelin — le défaut exact du « Texte : » de VoiceOver.
        guard let montee = ComposerPreUploadCopy.label(for: preUpload, locale: locale) else {
            return socle
        }
        return "\(socle) · \(montee)"
    }

    /// **Le mot d'un kind — TOTAL, plus aucun `nil`.**
    ///
    /// **Les CINQ familles ont leur mot depuis le 2026-09-02.**
    ///
    /// Le lieu et le son rendaient `nil`, et la raison écrite était vraie : leur
    /// mot n'existait pas au catalogue, et en inventer un ici l'aurait mis hors
    /// de portée du cliquet de localisation. Les deux clés sont désormais
    /// posées en sept langues (`composer.chip.kind.audio` / `.location`), donc
    /// la raison est levée et l'absence n'a plus de fondement.
    ///
    /// > Une absence JUSTIFIÉE par un manque réparable est une dette, pas une
    /// > décision. Celle-ci se lisait comme une décision parce qu'elle était
    /// > bien écrite — et le seul moyen de la distinguer était de relire ce
    /// > qu'elle invoquait, puis d'aller voir si c'était encore vrai.
    ///
    /// Ce que le badge coûtait de ne pas exister : un son sélectionné affichait
    /// ses jetons sans que le canvas dise ce qui était sélectionné. L'auteur
    /// réglait une taille sans savoir la taille de QUOI.
    ///
    /// Le rendu est désormais TOTAL — plus aucun `nil`, donc plus aucune
    /// famille silencieuse.
    private static func badgeKind(_ kind: MeeshySceneObject.Kind) -> String {
        switch kind {
        case .text:     return ComposerObjectChipsCopy.kindText
        case .media:    return ComposerObjectChipsCopy.kindMedia
        case .sticker:  return ComposerObjectChipsCopy.kindSticker
        case .audio:    return ComposerObjectChipsCopy.kindAudio
        case .place: return ComposerObjectChipsCopy.kindLocation
        }
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
        let plan = isBackground ? ComposerObjectChipsCopy.planeBackground : ComposerObjectChipsCopy.planeForeground
        return ComposerObjectChipsCopy.badge(kind: kind, plane: plan,
                                             zIndex: LocalizedNumber.exact(zIndex, locale: locale))
    }

    // MARK: - Ce qu'un jeton OUVRE

    /// **La section de l'éditeur qu'un jeton ouvre — `nil` ⇒ il ne fait que
    /// dire.**
    ///
    /// Elle a remplacé le couple `activeChipId` / `toggled` (directive porteur
    /// 2026-09-05). Les deux répondaient à une question qui n'existe plus : la
    /// destination était une BANDE, montée SOUS la scène, donc simultanément
    /// visible avec son jeton — d'où un état ENCADRÉ à tenir, et une bascule
    /// pour la refermer depuis le même doigt.
    ///
    /// L'éditeur est MODAL. Rien de la première vue n'est visible pendant
    /// qu'il est ouvert, donc aucun jeton n'y est « actif » ; et il se referme
    /// par son propre en-tête, jamais par le jeton qui l'a ouvert — lequel est
    /// hors de l'écran. Garder la bascule aurait laissé un aller-retour
    /// possible dans le modèle et impossible sous le doigt.
    ///
    /// > Un état qui n'a plus de surface où se montrer n'est pas un état à
    /// > conserver « au cas où » : c'est du modèle que plus rien ne peut
    /// > contredire.
    static func destination(of chipId: String, in chips: [Chip]) -> ComposerObjectEditorSection? {
        chips.first(where: { $0.id == chipId })?.destination
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
                      locale: Locale = .current) -> [Chip] {
        var jetons: [Chip] = [sizeChip(scale: media.scale, locale: locale)]
        if let rotation = rotationChip(media.rotation, locale: locale) {
            jetons.append(rotation)
        }
        // Le SON ne se dit que s'il existe et qu'il a été touché : une vidéo au
        // volume nominal n'a rien à annoncer, et une image n'a pas de son du
        // tout. Annoncer « SON 100 % » sur une photo enseignerait moins que rien.
        if media.kind == .video, abs(Double(media.volume) - 1) > 0.001 {
            jetons.append(Chip(id: "volume",
                               label: ComposerObjectChipsCopy.sound(LocalizedNumber.percent(Int((Double(media.volume) * 100).rounded()), locale: locale))))
        }
        if let fenetre = window(start: media.startTime,
                                duration: media.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timing, pour: .media)))
        }
        return jetons
    }

    /// **Les jetons d'une CHIP DE SON** (#4579, retour porteur 2026-09-02 :
    /// « l'affichage des détails des outils qui manquent »).
    ///
    /// Le son rendait `[]`, sous un commentaire devenu faux : « le son n'a pas
    /// encore de forme sur la scène ». Il en a une depuis `fab725c1d5` —
    /// `AudioForegroundChip`, déplaçable et redimensionnable — et depuis
    /// `7311d42c60` elle a même un RANG manipulable. Un objet qu'on peut poser,
    /// déplacer, redimensionner et ranger en profondeur, mais dont la sélection
    /// n'affiche AUCUN réglage, est le seul de la scène dans ce cas.
    ///
    /// > Un commentaire qui justifie une absence par un état du monde se périme
    /// > quand cet état change — et il continue d'expliquer, avec assurance, une
    /// > décision que plus rien ne fonde. C'est le contraire d'une garde : il
    /// > protège l'absence au lieu de la signaler.
    ///
    /// Quatre jetons, et pas un de plus que ce que l'objet PORTE :
    /// - la TAILLE, comme tout objet de scène — elle ne manque jamais ;
    /// - la ROTATION quand elle a été touchée ;
    /// - le VOLUME, seulement s'il s'écarte du nominal (même règle que la
    ///   vidéo : « SON 100 % » sur une piste jamais réglée enseigne moins que
    ///   rien) ;
    /// - la FENÊTRE de lecture, qui mène à la timeline.
    ///
    /// Un son de FOND n'est pas concerné : il n'a pas de chip sur la scène,
    /// donc pas de sélection, donc jamais de rangée. C'est `isBackground` qui
    /// l'en écarte à la source — et le vérifier ici serait une seconde écriture
    /// de la même règle.
    static func chips(for audio: StoryAudioPlayerObject,
                      locale: Locale = .current) -> [Chip] {
        var jetons: [Chip] = [sizeChip(scale: audio.scale ?? 1, locale: locale)]
        if let rotation = rotationChip(audio.rotation ?? 0, locale: locale) {
            jetons.append(rotation)
        }
        if abs(Double(audio.volume) - 1) > 0.001 {
            jetons.append(Chip(id: "volume",
                               label: ComposerObjectChipsCopy.sound(
                                LocalizedNumber.percent(Int((Double(audio.volume) * 100).rounded()),
                                                        locale: locale))))
        }
        // `startTime`/`duration` sont des `Float?` sur cette famille seule —
        // la conversion est ÉCRITE plutôt que laissée à l'inférence, qui
        // n'existe pas ici : `window` prend des `Double?`.
        if let fenetre = window(start: audio.startTime.map(Double.init),
                                duration: audio.duration.map(Double.init), locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timing, pour: .audio)))
        }
        return jetons
    }

    static func chips(for sticker: StorySticker,
                      locale: Locale = .current) -> [Chip] {
        var jetons: [Chip] = [sizeChip(scale: sticker.scale, locale: locale)]
        if let rotation = rotationChip(sticker.rotation, locale: locale) {
            jetons.append(rotation)
        }
        if let fenetre = window(start: sticker.startTime,
                                duration: sticker.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre,
                               destination: porte(.timing, pour: .sticker)))
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
             label: ComposerObjectChipsCopy.size(LocalizedNumber.percent(Int((scale * 100).rounded()), locale: locale)))
    }

    /// `nil` ⇒ l'objet est DROIT, et « ROTATION 0° » occuperait la place pour
    /// annoncer l'absence de rotation (loi 8).
    private static func rotationChip(_ degres: Double, locale: Locale) -> Chip? {
        let arrondi = Int(degres.rounded())
        guard arrondi != 0 else { return nil }
        return Chip(id: "rotation", label: ComposerObjectChipsCopy.rotation(LocalizedNumber.exact(arrondi, locale: locale)))
    }

    static func alignName(_ raw: String) -> String {
        ComposerObjectChipsCopy.alignName(raw)
    }
}