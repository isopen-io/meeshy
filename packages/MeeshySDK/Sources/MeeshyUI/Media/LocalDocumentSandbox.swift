import Foundation
import UniformTypeIdentifiers
import WebKit

/// **Comment un document LOCAL se rend** (#10789, revue de sécurité du
/// 2026-10-25). Le clair d'une pièce chiffrée de bout en bout est un fichier du
/// coffre de l'app, fabriqué par un pair, sous l'extension que SON type annonce.
/// Un document qui charge `http://…/beacon.png` à l'ouverture enverrait un
/// accusé de lecture et l'adresse IP du lecteur. Seule une liste fermée de
/// formats, comparés à l'identifiant EXACT (PDF, bureautique nommée, RTF, images
/// matricielles), se rend en page, et encore sous la cage de
/// `DocumentWebView.makeLocalWebView`. Tout le reste — balisage (HTML, SVG,
/// XML), texte, code, listes de lecture (`.m3u`), type inconnu — se lit en
/// TEXTE BRUT : WebKit ne choisit aucun rendu d'après une extension du pair.
public enum LocalDocumentRendering: Equatable, Sendable {
    case plainText
    case page

    static let renderedAsPage: Set<String> = [
        "com.adobe.pdf", "public.rtf",
        "public.png", "public.jpeg", "public.heic", "com.compuserve.gif", "public.tiff", "com.microsoft.bmp", "org.webmproject.webp",
        "org.openxmlformats.wordprocessingml.document", "com.microsoft.word.doc",
        "org.openxmlformats.spreadsheetml.sheet", "com.microsoft.excel.xls",
        "org.openxmlformats.presentationml.presentation", "com.microsoft.powerpoint.ppt",
        "com.apple.iwork.pages.sffpages", "com.apple.iwork.numbers.sffnumbers", "com.apple.iwork.keynote.sffkey",
    ]

    public init(fileURL: URL) {
        let identifier = UTType(filenameExtension: fileURL.pathExtension.lowercased())?.identifier
        self = identifier.map(Self.renderedAsPage.contains) == true ? .page : .plainText
    }
}

/// La vue web d'un document local n'ouvre que CE document : un lien touché,
/// une redirection, un cadre ou un formulaire vers une autre adresse sont
/// refusés avant toute requête.
public final class LocalDocumentNavigationGuard: NSObject, WKNavigationDelegate {
    public let document: URL

    public init(document: URL) {
        self.document = document
    }

    public static func allows(_ url: URL?, document: URL) -> Bool {
        guard let url, url.isFileURL else { return false }
        return url.standardizedFileURL == document.standardizedFileURL
    }

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        Self.allows(navigationAction.request.url, document: document) ? .allow : .cancel
    }
}

extension DocumentWebView {
    /// Tout chargement qui n'est pas `file:` (ou une image interne d'un document
    /// bureautique converti, `x-apple-ql-id:`) est bloqué par WebKit lui-même,
    /// sous-ressources, cadres, médias et polices compris.
    static let localOnlyRules = """
    [{"trigger":{"url-filter":".*"},"action":{"type":"block"}},
     {"trigger":{"url-filter":"^file:"},"action":{"type":"ignore-previous-rules"}},
     {"trigger":{"url-filter":"^x-apple-ql-id:"},"action":{"type":"ignore-previous-rules"}}]
    """

    /// La vue web d'un document local : sans script, sans magasin de données
    /// persistant (ni cookie, ni cache, ni stockage), sans ouverture de fenêtre,
    /// sans aperçu de lien (l'aperçu chargerait l'adresse du pair hors de la cage).
    public static func makeLocalWebView(mayLeave: Bool) -> WKWebView {
        let webView = makeWebView(mayLeave: mayLeave, runsScripts: false, websiteDataStore: .nonPersistent())
        webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView.allowsLinkPreview = false
        return webView
    }

    /// Pose la cage puis charge le document ; `false` quand la cage n'a pas pu
    /// se poser, et RIEN n'est alors chargé (fail-closed).
    @discardableResult
    public static func loadLocal(_ url: URL, rendering: LocalDocumentRendering? = nil, into webView: WKWebView) async -> Bool {
        guard let rules = try? await WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "me.meeshy.local-document.no-network", encodedContentRuleList: localOnlyRules
        ) else { return false }
        webView.configuration.userContentController.add(rules)
        switch rendering ?? LocalDocumentRendering(fileURL: url) {
        case .page:
            webView.loadFileURL(url, allowingReadAccessTo: url)
        case .plainText:
            guard let text = try? Data(contentsOf: url, options: .uncached) else { return false }
            webView.load(text, mimeType: "text/plain", characterEncodingName: "utf-8", baseURL: url)
        }
        return true
    }
}
