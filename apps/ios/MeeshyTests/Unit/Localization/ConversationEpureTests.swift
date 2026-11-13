import XCTest
import MeeshyUI
@testable import Meeshy

/// L'épure de la liste et du fil (#17584, lot iOS 1/3 « la liste et le fil gardent leurs gestes rares derrière Plus »,
/// #18078) : clés `conversation.*`, `message.*`, `share.*`, `voice.*` et `talkie.*`. Un libellé NOMME, une phrase ne redit
/// ni le titre ni le contrôle voisin, le détail secondaire passe derrière un (i) dont le nom est la QUESTION, le rare se
/// range derrière « Plus », et les repères propres à Meeshy (lien de partage, talkie, chiffrement de bout en bout, voix
/// clonée) restent LISIBLES AU REPOS (règle 7). La conséquence d'un geste irréversible (le bout en bout ne se désactive
/// jamais) reste dite ENTIÈRE.
///
/// Les textes se testent dans les catalogues (ce sont eux qui s'affichent, jamais le `defaultValue`), les vues par leur
/// source (elles ne se construisent pas hors environnement), les modèles par leur comportement.
@MainActor
final class ConversationEpureTests: XCTestCase {

    // MARK: - Lecture des catalogues et des sources

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let uiCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    private static func catalog(_ path: String) throws -> Catalog {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent(path))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.reduce(into: Catalog()) { result, entry in
            let localizations = ((entry.value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            result[entry.key] = localizations.reduce(into: [String: String]()) { values, locale in
                if let unit = (locale.value as? [String: Any])?["stringUnit"] as? [String: Any], let value = unit["value"] as? String {
                    values[locale.key] = value
                }
            }
        }
    }

    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private func uiCode(_ relativePath: String) throws -> String {
        let url = Self.repoRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/\(relativePath)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func specifiers(in text: String) -> [String] {
        let regex = try? NSRegularExpression(pattern: #"%(\d+\$)?(@|lld|d|ld)"#)
        let range = NSRange(text.startIndex..., in: text)
        return (regex?.matches(in: text, range: range) ?? []).compactMap { Range($0.range, in: text).map { String(text[$0]) } }.sorted()
    }

    // MARK: - Le nouveau français de chaque libellé raccourci ou rendu visible

    private static let appFrench: [String: String] = [
        "conversation.encryption.create.footer": "Le chiffrement de bout en bout ne se désactive jamais.",
        "conversation.encryption.detail.activationFooterFinal": "Le chiffrement ne se désactive jamais, de bout en bout comme sur nos serveurs.",
        "conversation.encryption.detail.directAlreadyEndToEnd": "Une conversation chiffrée de bout en bout existe déjà avec cette personne : ouvrez-la.",
        "conversation.encryption.detail.inactiveSubtitle": "Créée avant le chiffrement systématique.",
        "conversation.encryption.detail.plaintextDirectFailed": "Ouverture impossible. Réessayez.",
        "conversation.encryption.detail.plaintextDirectOffline": "Hors connexion : reconnectez-vous pour l’ouvrir.",
        "conversation.encryption.detail.plaintextDirectServedGap": "Rétablissez d’abord le chiffrement ici, puis ouvrez l’autre conversation.",
        "conversation.encryption.detail.servedGap": "Vue chiffrée de bout en bout ici : elle le reste, quoi que présente le serveur.",
        "conversation.encryption.fact.endToEndNeverTurnedOff": "Le chiffrement de bout en bout ne se désactive jamais.",
        "conversation.encryption.fact.endToEndNeverTurnedOffDirect": "Le chiffrement de bout en bout ne se désactive jamais : ce tête-à-tête le reste.",
        "conversation.encryption.fact.hybridIsServerToday": "Le mode hybride n’est pas du bout en bout : nos serveurs lisent les messages pour la traduction et la recherche.",
        "conversation.encryption.fact.serverCannotTurnItOff": "Vue chiffrée de bout en bout, elle ne s’écrit plus jamais en clair ici.",
        "conversation.encryption.fact.storedWithoutEncryption": "Ses messages sont stockés sans chiffrement.",
        "conversation.encryption.mode.e2ee.description": "Seuls les appareils des participants lisent ; traduction sur l’appareil.",
        "conversation.encryption.mode.hybrid.description": "Chiffré sur nos serveurs ; intégrité vérifiée entre appareils compatibles.",
        "conversation.encryption.mode.server.description": "Chiffré sur nos serveurs, lisible par eux : traduction et recherche fonctionnent.",
        "conversation.encryption.note.devices.question": "Que devient un appareil retiré ou réinstallé ?",
        "conversation.encryption.note.hybridLayer.question": "Que vérifie la seconde couche ?",
        "conversation.encryption.note.hybridLayer.text": "Entre deux appareils compatibles, une seconde couche permet en plus de vérifier qu’un message texte n’a pas été modifié en chemin ; quand elle manque, rien n’est présenté comme vérifié.",
        "conversation.encryption.note.revert.question": "Et si je veux revenir sans chiffrement ?",
        "conversation.encryption.note.revert.text": "Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes.",
        "conversation.encryption.note.revertDirect.text": "Vous pourrez toujours ouvrir à côté une autre conversation, sans chiffrement de bout en bout, avec cette personne : les deux sont dans la liste, celle-ci marquée d’un cadenas.",
        "conversation.encryption.note.serverSays.question": "Et si le serveur dit le contraire ?",
        "conversation.encryption.note.serverSays.text": "Même si le serveur la présentait ensuite autrement, votre compte n’y écrit plus sans chiffrement de bout en bout depuis cet appareil.",
        "conversation.encryption.note.whoMayToggle.question": "Qui peut changer de mode ?",
        "conversation.encryption.summary.endToEnd": "Chiffrée de bout en bout",
        "conversation.encryption.summary.none": "Non chiffrée",
        "conversation.info.block.message": "Plus aucun message de %@ ; débloquable dans les réglages.",
        "conversation.info.leave.message": "Vous ne recevrez plus de messages ; votre historique reste lisible.",
        "conversation.list.master_pin_required.message": "Définissez-le dans les réglages.",
        "conversation.lock.subtitle.enterMasterPin": "Saisissez votre master PIN",
        "conversation.new.group.solo-hint": "Vous pouvez le créer seul et inviter plus tard.",
        "conversation.obsolete.refused_pending_request": "Seul le destinataire de la demande peut la rendre obsolète.",
        "conversation.prefs.delete.message": "Retirée définitivement de votre liste ; les autres membres ne sont pas affectés.",
        "conversation.prefs.more": "Plus",
        "conversation.send.e2ee.contentUnsealable": "Chiffrée : pas encore de pièces jointes, lieux ni stickers.",
        "conversation.send.e2ee.deviceLimitReached": "Trop d’appareils chiffrés : retirez-en un pour écrire d’ici.",
        "conversation.send.e2ee.recipientWithoutEncryptedDevice": "Votre correspondant doit mettre Meeshy à jour : message non parti.",
        "conversation.send.e2ee.regimeChanged": "Le chiffrement a changé : message non parti. Touchez pour le renvoyer.",
        "conversation.send.e2ee.sealedOnlyInConversation": "Message chiffré non parti : ouvrez la conversation et touchez-le pour l’envoyer.",
        "conversation.send.e2ee.servedWithoutEndToEnd": "Le serveur la dit non chiffrée : message non parti. Voir la fiche Chiffrement.",
        "conversation.send.e2ee.unkeptOutsideConversation": "Message chiffré non gardé : ouvrez la conversation pour le réécrire.",
        "conversation.view.delete_for_everyone.hint": "Pour tout le monde : jusqu’à 2 h après l’envoi.",
        "message.translation.e2ee.serverRefused": "Chiffrée de bout en bout : traduite sur votre appareil, jamais par le serveur.",
        "share.link.create.access.account_required": "Compte Meeshy",
        "share.link.create.access.birthday_required": "Date de naissance",
        "share.link.create.access.birthday_required.note": "Permet le contrôle d'âge",
        "share.link.create.access.birthday_required.question": "Pourquoi demander la date de naissance ?",
        "share.link.create.access.email_required": "E-mail",
        "share.link.create.access.nickname_required": "Pseudo",
        "share.link.create.field.description": "Description",
        "share.link.create.field.description.placeholder": "Optionnel",
        "share.link.create.permission.send_files": "Fichiers",
        "share.link.create.permission.send_images": "Images",
        "share.link.create.permission.send_messages": "Messages",
        "share.link.create.permission.view_history": "Historique",
        "share.link.create.picker.empty.title": "Aucun groupe : créez-en un pour partager un lien.",
        "share.link.create.section.access": "Demander aux invités",
        "share.link.create.section.permissions": "Autoriser",
        "share.links.createdOn": "Créé le %@",
        "share.links.intro": "Un lien invite dans une conversation : vous fixez ce que les invités peuvent faire et jusqu’à quand.",
        "share.sheet.blocked.after-read": "Éphémère : il reste dans la conversation jusqu’à sa disparition.",
        "share.sheet.blocked.view-once": "À vue unique : il reste dans la conversation, le temps d’être vu.",
        "share.sheet.content.refused-source": "Cette app n’a remis qu’un chemin de fichier : partagez le fichier lui-même.",
        "share.sheet.offline": "Hors ligne : l’envoi repartira au retour du réseau.",
        "share.sheet.sign-in.body": "Votre partage est gardé : il vous attend dans Meeshy.",
        "talkie.info.a11y": "Quand utiliser le talkie ?",
        "share.sheet.withheld.flame": "Une flamme ne se publie pas, ne s’enregistre pas, ne se copie pas.",
        "share.sheet.withheld.flame.note": "Sa copie disparaît aussi et ne se retransfère pas.",
        "share.sheet.withheld.flame.question": "Que devient la copie d’une flamme ?",
        "talkie.info.text": "À utiliser en cas d’extrême urgence : votre voix sort chez eux même si Meeshy est en arrière-plan.",
        "talkie.send.e2ee": "Pas de talkie dans une conversation chiffrée : il ne l’est pas de bout en bout.",
        "talkie.send.explain": "Talkie d’urgence, pour vos très proches : maintenez et parlez, votre voix sort chez %@ sans décrocher.",
        "voice.profile.empty.description": "Vos vocaux traduits garderont votre voix.",
    ]

    private static let uiFrench: [String: String] = [
        "conversation.settings.deleteForMe.confirm.message": "Retirée définitivement de votre liste ; les autres membres ne sont pas affectés.",
        "conversation.settings.leave.confirm.message": "Vous ne recevrez plus de messages ; votre historique reste lisible.",
        "conversation.settings.more": "Plus",
        "conversation.settings.permissions.autoTranslate.subtitle": "Chacun lit les messages dans sa langue.",
        "conversation.settings.permissions.announcement.note": "Seuls les admins peuvent écrire : « Qui peut écrire » est alors verrouillé.",
        "conversation.settings.permissions.announcement.question": "Que change le mode annonce ?",
        "conversation.settings.permissions.slowMode.note": "Un délai entre deux messages d’un même membre.",
        "conversation.settings.permissions.slowMode.question": "Que fait le mode lent ?",
    ]

    /// Une clé dont un libellé quitte l'écran sans plus aucun lecteur est supprimée de TOUTES les langues.
    private static let deletedFromApp: [String] = [
        "conversation.lock.subtitle.confirmNewMasterPin",
        "conversation.lock.subtitle.enableBiometric",
        "conversation.lock.subtitle.reenterMasterPin",
        "conversation.lock.subtitle.unlockAll",
        "conversation.prefs.leave.message",
        "conversation.prefs.section.actions",
        "share.link.create.access.account_required.subtitle",
        "share.link.create.access.birthday_required.subtitle",
        "share.link.create.access.email_required.subtitle",
        "share.link.create.access.nickname_required.subtitle",
        "share.link.create.permission.send_files.subtitle",
        "share.link.create.permission.send_images.subtitle",
        "share.link.create.permission.send_messages.subtitle",
        "share.link.create.permission.view_history.subtitle",
        "share.link.create.picker.empty.description",
        "share.links.empty.subtitle",
        "talkie.send.voiceCopy",
        "voice.profile.status.ready.description",
    ]

    private static let deletedFromUI: [String] = [
        "conversation.settings.permissions.announcement.subtitle",
        "conversation.settings.permissions.slowMode.subtitle",
        "conversation.settings.section.danger",
    ]

    /// Des mots communs à plusieurs langues (« Messages », « Images », « Description »…) : identiques au français sans être copiés.
    private static let sameInSomeLanguage: Set<String> = [
        "share.link.create.access.email_required",
        "share.link.create.field.description",
        "share.link.create.permission.send_images",
        "share.link.create.permission.send_messages",
    ]

    /// Un libellé qui sort de l'écran tient en une ligne : sous 80 caractères, et ne remonte jamais au-delà.
    private static let oneLine: [String] = [
        "conversation.encryption.create.footer",
        "conversation.encryption.detail.activationFooterFinal",
        "conversation.encryption.detail.inactiveSubtitle",
        "conversation.encryption.detail.plaintextDirectFailed",
        "conversation.encryption.detail.plaintextDirectOffline",
        "conversation.encryption.detail.plaintextDirectServedGap",
        "conversation.encryption.detail.servedGap",
        "conversation.encryption.fact.endToEndNeverTurnedOff",
        "conversation.encryption.fact.endToEndNeverTurnedOffDirect",
        "conversation.encryption.fact.serverCannotTurnItOff",
        "conversation.encryption.fact.storedWithoutEncryption",
        "conversation.encryption.mode.e2ee.description",
        "conversation.encryption.mode.hybrid.description",
        "conversation.encryption.summary.endToEnd",
        "conversation.encryption.summary.none",
        "conversation.info.block.message",
        "conversation.info.leave.message",
        "conversation.list.master_pin_required.message",
        "conversation.lock.subtitle.enterMasterPin",
        "conversation.new.group.solo-hint",
        "conversation.obsolete.refused_pending_request",
        "conversation.prefs.delete.message",
        "conversation.prefs.more",
        "conversation.send.e2ee.contentUnsealable",
        "conversation.send.e2ee.deviceLimitReached",
        "conversation.send.e2ee.recipientWithoutEncryptedDevice",
        "conversation.send.e2ee.regimeChanged",
        "conversation.send.e2ee.sealedOnlyInConversation",
        "conversation.send.e2ee.servedWithoutEndToEnd",
        "conversation.send.e2ee.unkeptOutsideConversation",
        "conversation.settings.deleteForMe.confirm.message",
        "conversation.settings.leave.confirm.message",
        "conversation.settings.more",
        "conversation.settings.permissions.autoTranslate.subtitle",
        "conversation.settings.permissions.announcement.note",
        "conversation.settings.permissions.announcement.question",
        "conversation.settings.permissions.slowMode.note",
        "conversation.settings.permissions.slowMode.question",
        "conversation.view.delete_for_everyone.hint",
        "message.translation.e2ee.serverRefused",
        "share.link.create.access.account_required",
        "share.link.create.access.birthday_required",
        "share.link.create.access.birthday_required.note",
        "share.link.create.access.birthday_required.question",
        "share.link.create.access.email_required",
        "share.link.create.access.nickname_required",
        "share.link.create.field.description",
        "share.link.create.field.description.placeholder",
        "share.link.create.permission.send_files",
        "share.link.create.permission.send_images",
        "share.link.create.permission.send_messages",
        "share.link.create.permission.view_history",
        "share.link.create.picker.empty.title",
        "share.link.create.section.access",
        "share.link.create.section.permissions",
        "share.links.createdOn",
        "share.sheet.blocked.after-read",
        "share.sheet.blocked.view-once",
        "share.sheet.content.refused-source",
        "share.sheet.offline",
        "share.sheet.sign-in.body",
        "share.sheet.withheld.flame",
        "share.sheet.withheld.flame.question",
        "talkie.info.a11y",
        "talkie.send.e2ee",
        "voice.profile.empty.description",
    ]

    func test_catalog_epuredTexts_sayTheirNewFrench() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for (key, expected) in Self.appFrench { XCTAssertEqual(app[key]?["fr"], expected, key) }
        let ui = try Self.catalog(Self.uiCatalogPath)
        for (key, expected) in Self.uiFrench { XCTAssertEqual(ui[key]?["fr"], expected, key) }
    }

    func test_catalog_epuredTexts_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let catalogs = [(try Self.catalog(Self.appCatalogPath), Array(Self.appFrench.keys)), (try Self.catalog(Self.uiCatalogPath), Array(Self.uiFrench.keys))]
        for (catalog, keys) in catalogs {
            for key in keys {
                let values = catalog[key] ?? [:]
                let french = try XCTUnwrap(values["fr"], key)
                for language in Self.otherLanguages {
                    let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                    XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                    if !Self.sameInSomeLanguage.contains(key) {
                        XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                    }
                    XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
                }
            }
        }
    }

    func test_catalog_shortenedTexts_holdInOneLine() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let ui = try Self.catalog(Self.uiCatalogPath)
        for key in Self.oneLine {
            let value = try XCTUnwrap(app[key]?["fr"] ?? ui[key]?["fr"], key)
            XCTAssertLessThanOrEqual(value.count, 80, "\(key) : \(value)")
        }
    }

    func test_catalog_textsThatLeftTheScreen_areGone_inEveryLanguage_andNoSourceReadsThem() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let ui = try Self.catalog(Self.uiCatalogPath)
        for key in Self.deletedFromApp { XCTAssertNil(app[key], "\(key) n'a plus de lecteur : elle quitte les sept langues") }
        for key in Self.deletedFromUI { XCTAssertNil(ui[key], "\(key) n'a plus de lecteur : elle quitte les sept langues") }
        let sources = try Self.swiftSources(under: ["apps/ios/Meeshy", "packages/MeeshySDK/Sources/MeeshyUI"])
        for key in Self.deletedFromApp + Self.deletedFromUI {
            XCTAssertFalse(sources.contains { $0.contains("\"\(key)\"") }, "\(key) est encore lue par une source")
        }
    }

    private static func swiftSources(under roots: [String]) throws -> [String] {
        try roots.flatMap { root -> [String] in
            let enumerator = FileManager.default.enumerator(at: repoRoot.appendingPathComponent(root), includingPropertiesForKeys: nil)
            let urls = (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
            return try urls.map { try String(contentsOf: $0, encoding: .utf8) }
        }
    }

    // MARK: - Les liens de partage : un nom par rangée, la phrase d'orientation reste (règles 2, 3 et 7)

    func test_createShareLink_rowsNameThemselves_withoutTheirSubtitle() throws {
        let view = try code("Meeshy/Features/Links/Views/CreateShareLinkView.swift")
        for removed in ["account_required.subtitle", "nickname_required.subtitle", "email_required.subtitle", "birthday_required.subtitle",
                        "send_messages.subtitle", "send_images.subtitle", "send_files.subtitle", "view_history.subtitle", "picker.empty.description"] {
            XCTAssertFalse(view.contains(removed), "\(removed) : la rangée se comprend seule")
        }
        XCTAssertTrue(view.contains("share.link.create.section.access.subtitle"), "la phrase d'orientation du bloc reste visible (règle 7)")
        XCTAssertTrue(view.contains("share.link.create.section.permissions.subtitle"), "la phrase d'orientation du bloc reste visible (règle 7)")
    }

    func test_createShareLink_birthDate_explainsItself_behindAnInfoWhoseNameIsTheQuestion() throws {
        let view = try code("Meeshy/Features/Links/Views/CreateShareLinkView.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNote("))
        XCTAssertTrue(view.contains("share.link.create.access.birthday_required.question"))
        XCTAssertTrue(view.contains("share.link.create.access.birthday_required.note"))
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: note, openNoteID: $openNoteID"))
        XCTAssertFalse(view.contains("Toggle(isOn: isOn) {"), "un (i) posé DANS le libellé d'un Toggle se fond dans l'élément VoiceOver de l'interrupteur et n'est plus atteignable")
        XCTAssertTrue(view.contains("Toggle(title, isOn: isOn)"), "l'interrupteur garde son nom accessible")
        let app = try Self.catalog(Self.appCatalogPath)
        for language in ["fr"] + Self.otherLanguages {
            let question = try XCTUnwrap(app["share.link.create.access.birthday_required.question"]?[language], language)
            XCTAssertTrue(question.contains("?") || question.contains("؟"), "\(language) : le nom du (i) est une question")
        }
    }

    func test_createShareLink_optionalField_isReadFromItsPlaceholder_neverFromItsLabel() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertEqual(app["share.link.create.field.description"]?["fr"], "Description")
        XCTAssertEqual(app["share.link.create.field.description.placeholder"]?["fr"], "Optionnel")
    }

    func test_shareLinks_everyRowKeepsItsCreationDate_andTheScreenSaysWhatALinkIs() throws {
        let view = try code("Meeshy/Features/Links/Views/ShareLinksView.swift")
        XCTAssertTrue(view.contains("share.links.createdOn"), "chaque rangée dit « Créé le … » (règle 7 : liste d'objets à surveiller)")
        XCTAssertTrue(view.contains("createdOnLabel(link)"))
        XCTAssertTrue(view.contains("share.links.intro"), "la phrase d'orientation est rendue visible sous le titre")
        XCTAssertFalse(view.contains("share.links.empty.subtitle"), "l'état vide tient en une ligne : la phrase d'orientation le remplace")
    }

    // MARK: - Le talkie : la phrase qui le dit est visible, le (i) répond à une question

    /// Un consentement ne se raccourcit pas au point de taire ce qu'il autorise (revue #18078) : la transcription,
    /// la traduction dans la langue de chaque destinataire ET la voix clonée, dans les sept langues.
    func test_voiceConsent_saysEverythingItAuthorizes_inEveryLanguage() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let consent = try XCTUnwrap(app["conversation.voiceConsent.message"])
        let french = try XCTUnwrap(consent["fr"])
        for clause in ["transcrits", "traduits", "la langue de chaque destinataire", "avec votre voix"] {
            XCTAssertTrue(french.contains(clause), "le consentement tait « \(clause) » : \(french)")
        }
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(consent[language], language)
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
            XCTAssertGreaterThan(value.count, 80, "\(language) : le consentement a été raccourci : \(value)")
        }
    }

    /// La voix clonée est propre à Meeshy (règle 7) : l'écran qui l'active dit, au repos, ce qu'elle FAIT (revue #18078).
    func test_voiceWizard_intro_saysWhatVoiceCloningDoes_inEveryLanguage() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let intro = try XCTUnwrap(app["voice.profile.wizard.intro"])
        XCTAssertEqual(intro["fr"], "Enregistrez votre voix pour activer le clonage vocal personnalisé. Vos messages audio traduits garderont votre voix naturelle.")
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(intro[language], language)
            XCTAssertNotEqual(value, intro["fr"], "\(language) : copié du français")
        }
    }

    func test_talkie_theInfoIsNamedByItsQuestion_andTheVisibleSentenceSaysWhatItIs() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for language in ["fr"] + Self.otherLanguages {
            let question = try XCTUnwrap(app["talkie.info.a11y"]?[language], language)
            XCTAssertTrue(question.contains("?") || question.contains("؟"), "\(language) : « \(question) » n'est pas une question")
        }
        let row = try code("Meeshy/Features/Talkie/ProfileTalkieRow.swift")
        XCTAssertTrue(row.contains("Text(ProfileTalkieWording.explain(name: displayName))"), "la phrase propre à Meeshy reste lisible au repos")
        XCTAssertFalse(row.contains("talkie.send.voiceCopy"), "le repli réutilise « Le talkie ne passe pas… »")
        XCTAssertTrue(row.contains("talkie.header.announce.recorded"))
        XCTAssertEqual(ProfileTalkieWording.notice(.voice), String(localized: "talkie.header.announce.recorded", bundle: .main))
        XCTAssertFalse(TalkieInfoWording.text.isEmpty)
        let note = try XCTUnwrap(app["talkie.info.text"]?["fr"])
        XCTAssertEqual(app["talkie.info.a11y"]?["fr"], "Quand utiliser le talkie ?")
        XCTAssertTrue(note.contains("extrême urgence"), "la note répond à « Quand utiliser le talkie ? » : \(note)")
    }

    // MARK: - Le chiffrement : l'irréversibilité reste ENTIÈRE et visible, le détail secondaire derrière un (i)

    private let factsWithANote: Set<ConversationEncryptionExplanation.Fact> = [
        .hybridIsServerToday, .endToEndNeverTurnedOff, .endToEndNeverTurnedOffDirect, .serverCannotTurnItOff, .oneKeyPerDevice, .switchKeepsHistory,
    ]

    func test_encryptionFacts_onlyTheSecondaryDetailHidesBehindAnInfo() {
        let withNote = Set(ConversationEncryptionExplanation.Fact.allCases.filter { $0.note != nil })
        XCTAssertEqual(withNote, factsWithANote)
        for fact in factsWithANote {
            let note = fact.note
            XCTAssertFalse(fact.text.isEmpty, "\(fact) garde sa phrase visible")
            XCTAssertNotEqual(note?.text, fact.text, "\(fact) : la note dit autre chose que la phrase")
            let question = note?.question ?? ""
            XCTAssertTrue(question.contains("?") || question.contains("؟"), "\(fact) : « \(question) » n'est pas une question")
            XCTAssertNotEqual(question, note?.text)
        }
    }

    func test_encryptionNotes_fiveDistinctQuestions_oneSharedByTheTwoPermanenceFacts() {
        let questions = factsWithANote.compactMap { $0.note?.question }
        XCTAssertEqual(Set(questions).count, 5, "le (i) « revenir sans chiffrement » est commun au tête-à-tête et au groupe, les quatre autres se distinguent à l'oreille")
        XCTAssertEqual(ConversationEncryptionExplanation.Fact.endToEndNeverTurnedOff.note?.question, ConversationEncryptionRevertNote.question)
        XCTAssertNotEqual(ConversationEncryptionRevertNote.note(direct: true).text, ConversationEncryptionRevertNote.note().text)
    }

    func test_encryptionDevices_theNoteCarriesBothDetails_theRowCarriesNeither() {
        let note = ConversationEncryptionExplanation.Fact.oneKeyPerDevice.note
        XCTAssertTrue(note?.text.contains(ConversationEncryptionExplanation.Fact.deviceLimit.text) == true)
        XCTAssertTrue(note?.text.contains(ConversationEncryptionExplanation.Fact.restoredDeviceIsNew.text) == true)
        let sections = ConversationEncryptionExplanation(mode: "e2ee", isDirect: true).sections
        let devices = sections.first { $0.topic == .devices }
        XCTAssertEqual(devices?.facts, [.oneKeyPerDevice])
    }

    func test_encryptionSwitching_whoMayToggleAndTheThreadNoticeSitBehindOneInfo_theHistoryRuleStaysVisible() {
        for mode in [nil, "server", "hybrid"] {
            let sections = ConversationEncryptionExplanation(mode: mode, isDirect: true).sections
            let switching = sections.first { $0.topic == .switching }
            XCTAssertEqual(switching?.facts, [.switchKeepsHistory, .endToEndIsFinal], "\(String(describing: mode))")
        }
        let note = ConversationEncryptionExplanation.Fact.switchKeepsHistory.note
        XCTAssertTrue(note?.text.contains(ConversationEncryptionExplanation.Fact.whoMayToggle.text) == true)
        XCTAssertTrue(note?.text.contains(ConversationEncryptionExplanation.Fact.switchIsShownInThread.text) == true)
    }

    func test_encryptionIrreversibility_staysWhole_inTheFooter_theCreationScreen_andTheConfirmation() throws {
        let sheet = try code("Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift")
        XCTAssertTrue(sheet.contains("finalFooter(String(localized: \"conversation.encryption.create.footer\""), "le pied « Changer de mode » dit la phrase entière")
        XCTAssertTrue(sheet.contains("finalFooter(String(localized: \"conversation.encryption.detail.activationFooterFinal\""))
        XCTAssertTrue(sheet.contains("MeeshyInfoNoted(note: ConversationEncryptionRevertNote.note(), openNoteID: $openNoteID)"))
        let creation = try code("Meeshy/Features/Main/Views/NewConversationEncryptionSection.swift")
        XCTAssertTrue(creation.contains("ConversationEncryptionRevertNote.note()"))
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["conversation.encryption.create.footer", "conversation.encryption.fact.endToEndNeverTurnedOff"] {
            XCTAssertEqual(app[key]?["fr"], "Le chiffrement de bout en bout ne se désactive jamais.", key)
        }
        XCTAssertEqual(app["conversation.encryption.fact.endToEndIsFinal"]?["fr"], "Une fois activé, le chiffrement de bout en bout ne se désactive plus.",
                       "là où l'on bascule, même sans le droit de basculer, « définitif » reste visible (revue #18078)")
        XCTAssertFalse(ConversationEncryptionExplanation.Fact.allCases.map(\.text).contains(""))
    }

    func test_encryptionSummary_isAValue_theRowAlreadyCarriesTheTitle() throws {
        XCTAssertEqual(ConversationEncryptionRegime.none.summary, String(localized: "conversation.encryption.summary.none", bundle: .main))
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertEqual(app["conversation.encryption.summary.none"]?["fr"], "Non chiffrée")
        XCTAssertEqual(app["conversation.encryption.summary.endToEnd"]?["fr"], "Chiffrée de bout en bout")
    }

    // MARK: - Le rare derrière « Plus », toujours atteignable

    func test_conversationOptions_rareActionsSitBehindMore_andStayReachable() throws {
        let tab = try code("Meeshy/Features/Main/Components/ConversationPreferencesTab.swift")
        XCTAssertTrue(tab.contains("@State private var showMoreActions"))
        XCTAssertTrue(tab.contains("conversation.prefs.more"))
        XCTAssertTrue(tab.contains("if showMoreActions {"))
        let more = try XCTUnwrap(tab.components(separatedBy: "private var moreActions: some View {").last)
        for action in ["showArchiveConfirm = true", "showLeaveConfirm = true", "showDeleteConfirm = true", "showObsoleteConfirm = true"] {
            XCTAssertTrue(more.contains(action), "\(action) reste atteignable une fois « Plus » ouvert")
        }
        let before = try XCTUnwrap(tab.components(separatedBy: "private var actionsSection: some View {").first)
        XCTAssertTrue(before.contains("notificationsSection"), "Muet et Mentions restent visibles au repos")
        XCTAssertFalse(tab.contains("conversation.prefs.section.actions"))
    }

    func test_conversationSettings_dangerZoneIsGone_itsButtonsSitBehindMore() throws {
        let view = try uiCode("Conversation/ConversationSettingsView.swift")
        XCTAssertTrue(view.contains("@State private var showMoreActions"))
        XCTAssertFalse(view.contains("conversation.settings.section.danger"), "le titre « Zone dangereuse » est supprimé")
        let more = try XCTUnwrap(view.components(separatedBy: "private var moreActions: some View {").last)
        for action in ["showDeleteForMeAlert = true", "viewModel.showDeleteConversation = true", "viewModel.showLeaveConfirm = true"] {
            XCTAssertTrue(more.contains(action), "\(action) reste atteignable une fois « Plus » ouvert")
        }
    }

    func test_conversationSettings_autoTranslate_saysWhatItDoes() throws {
        let ui = try Self.catalog(Self.uiCatalogPath)
        XCTAssertEqual(ui["conversation.settings.permissions.autoTranslate.subtitle"]?["fr"], "Chacun lit les messages dans sa langue.")
    }

    func test_conversationSettings_slowModeAndAnnouncement_nameThemselves_theNoteSitsBehindAnInfoNamedByItsQuestion() throws {
        let slow = ConversationSettingsNotes.slowMode
        let announcement = ConversationSettingsNotes.announcement
        for note in [slow, announcement] {
            XCTAssertTrue(Self.endsAsQuestion(note.question), "le nom accessible du (i) est une question : \(note.question)")
            XCTAssertFalse(note.text.isEmpty)
            XCTAssertNotEqual(note.question, note.text)
        }
        XCTAssertNotEqual(slow.id, announcement.id, "deux (i) d'un même écran se distinguent à l'oreille")
        let view = try uiCode("Conversation/ConversationSettingsView.swift")
        XCTAssertFalse(view.contains("slowMode.subtitle"), "le sous-titre du mode lent a quitté l'écran")
        XCTAssertFalse(view.contains("announcement.subtitle"), "le sous-titre du mode annonce redisait le sélecteur « Qui peut écrire »")
        XCTAssertTrue(view.contains("note: ConversationSettingsNotes.slowMode"))
        XCTAssertTrue(view.contains("note: ConversationSettingsNotes.announcement"))
        XCTAssertTrue(view.contains("conversation.settings.permissions.slowMode\", defaultValue: \"Mode lent\""), "la rangée garde « Mode lent »")
        XCTAssertTrue(view.contains("\"10s\""), "le sélecteur du mode lent reste atteignable")
        XCTAssertFalse(view.contains("Toggle(\"\", isOn: $viewModel.isAnnouncementChannel)"), "l'interrupteur du mode annonce, détaché de son (i), garde son nom accessible")
    }

    private static func endsAsQuestion(_ text: String) -> Bool {
        ["?", "؟", "？"].contains { text.hasSuffix($0) }
    }

    // MARK: - Confirmations : une phrase, une clé

    func test_confirmations_leaveAndDeleteForMe_shareOneKeyPerBundle() throws {
        let tab = try code("Meeshy/Features/Main/Components/ConversationPreferencesTab.swift")
        XCTAssertTrue(tab.contains("conversation.info.leave.message"))
        XCTAssertFalse(tab.contains("conversation.prefs.leave.message"))
        let app = try Self.catalog(Self.appCatalogPath)
        let ui = try Self.catalog(Self.uiCatalogPath)
        XCTAssertEqual(app["conversation.info.leave.message"]?["fr"], ui["conversation.settings.leave.confirm.message"]?["fr"])
        XCTAssertEqual(app["conversation.prefs.delete.message"]?["fr"], ui["conversation.settings.deleteForMe.confirm.message"]?["fr"])
    }

    func test_deleteForEveryoneHint_isShownOnlyWhenTheButtonIsOffered() {
        XCTAssertEqual(MessageDeleteConfirmation.hint(offered: false), "")
        XCTAssertFalse(MessageDeleteConfirmation.hint(offered: true).isEmpty)
    }

    // MARK: - Le verrou : un sous-titre qui répète le titre n'existe pas

    func test_lockSheet_dropsTheSubtitlesThatRepeatTheTitle_andSharesTheMasterPinPrompt() throws {
        let sheet = try code("Meeshy/Features/Main/Components/ConversationLockSheet.swift")
        XCTAssertTrue(sheet.contains("private var subtitleText: String?"))
        XCTAssertTrue(sheet.contains("if let subtitleText"))
        XCTAssertEqual(sheet.components(separatedBy: "conversation.lock.subtitle.enterMasterPin").count - 1, 2, "déverrouiller tout et déverrouillage biométrique disent la même chose")
        XCTAssertFalse(sheet.contains("reenterMasterPin"))
        XCTAssertFalse(sheet.contains("confirmNewMasterPin"))
        XCTAssertTrue(sheet.contains("conversation.lock.subtitle.chooseMasterPin"), "les sous-titres qui apprennent quelque chose (6 chiffres) restent")
        XCTAssertTrue(sheet.contains("conversation.lock.subtitle.chooseCode"), "le sous-titre « 4 chiffres » reste")
    }

    // MARK: - La voix et le partage

    func test_voiceProfile_readyStateSaysItsLabelOnce_theOthersKeepTellingWhatToDo() throws {
        let manage = try code("Meeshy/Features/Settings/Views/VoiceProfileManageView.swift")
        XCTAssertTrue(manage.contains("case .ready: return nil"))
        XCTAssertFalse(manage.contains("voice.profile.status.ready.description"))
        for dropped in ["pending", "processing"] {
            XCTAssertTrue(manage.contains("case .pending, .processing: return nil"), "le sous-titre redisait « \(dropped) »")
            XCTAssertFalse(manage.contains("voice.profile.status.\(dropped).description"), dropped)
        }
        for kept in ["failed", "expired"] {
            XCTAssertTrue(manage.contains("voice.profile.status.\(kept).description"), "dit quoi faire : \(kept)")
        }
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertNil(app["voice.profile.status.pending.description"])
        XCTAssertNil(app["voice.profile.status.processing.description"])
        let wizard = try code("Meeshy/Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertTrue(wizard.contains("voice.profile.wizard.intro"), "le consentement et ses quatre lignes restent")
    }

    func test_shareSheet_emptyState_isOneLine_theSearchFieldAboveSaysWhatToDo() throws {
        let view = try code("Meeshy/Features/Share/ShareSheetView.swift")
        XCTAssertTrue(view.contains("ShareSheetCopy.emptyTitle"))
        XCTAssertFalse(view.contains("emptyBody"))
        XCTAssertFalse(try code("Meeshy/Features/Share/ShareSheetCopy.swift").contains("emptyBody"))
        XCTAssertNil(try Self.catalog(Self.appCatalogPath)["share.sheet.empty.body"])
    }

    func test_blockedComposerZone_saysTheStateAndTheAction_notASentenceThatRepeatsBoth() throws {
        let banners = try code("Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift")
        XCTAssertTrue(banners.contains("conversation.composer.blocked.title"))
        XCTAssertTrue(banners.contains("conversation.composer.blocked.unblock"))
        XCTAssertFalse(banners.contains("conversation.composer.blocked.subtitle"))
        XCTAssertNil(try Self.catalog(Self.appCatalogPath)["conversation.composer.blocked.subtitle"])
        XCTAssertNotNil(try Self.catalog(Self.appCatalogPath)["conversation.info.block.message"], "la conséquence reste dite au geste")
    }

    func test_shareSheet_everyProtectionStaysSaid_inOneSentence() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertEqual(app["share.sheet.blocked.view-once"]?["fr"], "À vue unique : il reste dans la conversation, le temps d’être vu.")
        XCTAssertEqual(app["share.sheet.blocked.after-read"]?["fr"], "Éphémère : il reste dans la conversation jusqu’à sa disparition.")
        XCTAssertEqual(ShareSheetCopy.blockedBody(.viewOnce), String(localized: "share.sheet.blocked.view-once", bundle: .meeshyShare))
    }

    func test_shareSheet_flame_keepsItsProtectionVisibleInOneSentence_theFateOfTheCopyIsBehindAnInfo() throws {
        let sentence = ShareSheetCopy.withheld(.flame)
        XCTAssertEqual(sentence, String(localized: "share.sheet.withheld.flame", bundle: .meeshyShare))
        XCTAssertLessThanOrEqual(sentence.count, 80)
        let note = try XCTUnwrap(ShareSheetCopy.withheldNote(.flame))
        XCTAssertEqual(note.question, String(localized: "share.sheet.withheld.flame.question", bundle: .meeshyShare))
        XCTAssertEqual(note.text, String(localized: "share.sheet.withheld.flame.note", bundle: .meeshyShare))
        XCTAssertTrue(Self.endsAsQuestion(note.question))
        XCTAssertFalse(sentence.contains(note.text), "la seconde phrase n'est plus au repos")
        for other in [ShareWithheldReason.blurred, .encrypted, .citesProtected, .tooManyForPublication, .singlePhotoNotAReel, .notAReel] {
            XCTAssertNil(ShareSheetCopy.withheldNote(other), "un libellé qui se comprend seul ne reçoit pas de (i)")
        }
        let actions = try code("Meeshy/Features/Share/ShareSheetView+Actions.swift")
        XCTAssertTrue(actions.contains("Label(reason"), "la phrase de protection reste lisible sans clic")
        XCTAssertTrue(actions.contains("MeeshyInfoNoted"))
    }
}
