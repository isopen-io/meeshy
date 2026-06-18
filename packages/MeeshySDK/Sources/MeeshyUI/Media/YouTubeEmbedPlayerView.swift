import SwiftUI
import WebKit

/// Contrôleur impératif d'un player YouTube hébergé en WKWebView.
/// Atome agnostique : l'app décide QUAND appeler play/pause.
@MainActor
public final class YouTubeEmbedController {
    fileprivate weak var webView: WKWebView?
    public init() {}

    public func play() { webView?.evaluateJavaScript("ytPlay();", completionHandler: nil) }
    public func pause() { webView?.evaluateJavaScript("ytPause();", completionHandler: nil) }

    /// Lit le temps courant (secondes) puis appelle le completion sur le main actor.
    public func currentTime(_ completion: @escaping @MainActor (Int) -> Void) {
        webView?.evaluateJavaScript("ytCurrentTime();") { value, _ in
            let seconds: Int
            if let i = value as? Int { seconds = i }
            else if let d = value as? Double { seconds = Int(d) }
            else { seconds = 0 }
            MainActor.assumeIsolated { completion(seconds) }
        }
    }
}

/// Player YouTube inline via l'IFrame Player API officielle (conforme CGU).
public struct YouTubeEmbedPlayerView: UIViewRepresentable {

    public enum State: String, Sendable {
        case ready, playing, paused, ended
    }

    public let videoId: String
    public let startSeconds: Int
    public let controller: YouTubeEmbedController
    public let onStateChange: (State) -> Void

    public init(videoId: String,
                startSeconds: Int = 0,
                controller: YouTubeEmbedController,
                onStateChange: @escaping (State) -> Void) {
        self.videoId = videoId
        self.startSeconds = startSeconds
        self.controller = controller
        self.onStateChange = onStateChange
    }

    public func makeCoordinator() -> Coordinator { Coordinator(onStateChange: onStateChange) }

    public func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let ucc = WKUserContentController()
        ucc.add(context.coordinator, name: "ytbridge")
        config.userContentController = ucc

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        controller.webView = webView
        webView.loadHTMLString(Self.html(videoId: videoId, start: startSeconds),
                               baseURL: URL(string: "https://www.youtube.com"))
        return webView
    }

    public func updateUIView(_ uiView: WKWebView, context: Context) {}

    public static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "ytbridge")
        uiView.stopLoading()
        uiView.loadHTMLString("", baseURL: nil)
    }

    // NOTE sécurité : ne PAS ajouter d'attribut integrity (SRI) sur le tag iframe_api.
    // C'est un loader bootstrap que YouTube met à jour et qui charge dynamiquement
    // www-widgetapi.js ; un hash SRI le casserait et YouTube n'en publie pas.
    private static func html(videoId: String, start: Int) -> String {
        // Défense en profondeur : neutralise toute injection JS via videoId, même si un
        // appelant futur passe une valeur non validée (le resolver garantit déjà le charset).
        let safeId = sanitizedId(videoId)
        return """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}#player{width:100%;height:100%}</style>
        </head><body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
        var ytp;
        function onYouTubeIframeAPIReady(){
          ytp=new YT.Player('player',{width:'100%',height:'100%',videoId:'\(safeId)',
            playerVars:{playsinline:1,modestbranding:1,rel:0,start:\(start)},
            events:{
              'onReady':function(e){post('ready');},
              'onStateChange':function(e){
                if(e.data===YT.PlayerState.PLAYING)post('playing');
                else if(e.data===YT.PlayerState.PAUSED)post('paused');
                else if(e.data===YT.PlayerState.ENDED)post('ended');
              }
            }});
        }
        function post(s){window.webkit.messageHandlers.ytbridge.postMessage(s);}
        function ytPlay(){if(ytp&&ytp.playVideo)ytp.playVideo();}
        function ytPause(){if(ytp&&ytp.pauseVideo)ytp.pauseVideo();}
        function ytCurrentTime(){return (ytp&&ytp.getCurrentTime)?Math.floor(ytp.getCurrentTime()):0;}
        </script>
        </body></html>
        """
    }

    private static func sanitizedId(_ raw: String) -> String {
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
        return String(raw.filter { allowed.contains($0) }.prefix(20))
    }

    public final class Coordinator: NSObject, WKScriptMessageHandler {
        let onStateChange: (State) -> Void
        init(onStateChange: @escaping (State) -> Void) { self.onStateChange = onStateChange }

        public nonisolated func userContentController(_ userContentController: WKUserContentController,
                                                      didReceive message: WKScriptMessage) {
            let body = (message.body as? String) ?? ""
            guard let state = State(rawValue: body) else { return }
            MainActor.assumeIsolated { onStateChange(state) }
        }
    }
}
