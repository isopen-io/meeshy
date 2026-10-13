import { QueryClientProvider } from '@tanstack/react-query';
import { Fragment, StrictMode, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand/react';

import './styles/app.css';
import './styles/sealed-exit.css';

import Shell from '@/components/shell';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { currentInterfaceLanguage, interfaceLanguageChoice, subscribeInterfaceLanguage } from '@/lib/interface-language';
import { syncShellLocaleAtStart } from '@/lib/shell-locale';
import { useRoute } from '@/lib/router';
import { followSystem } from '@/lib/scheme';
import { landingAfterSession, resolveRouteAccess } from '@/lib/session-guard';
import { useAnonymousScope } from '@/lib/view/use-anonymous-scope';
import { installSealedExitGuard } from '@/lib/view/sealed-exit-guard';
import { shellStartHref } from '@/lib/links/shell-start';
import { Router, href, navigate } from '@/routes/route-table';

/**
 * Defaut 3c (recette 2026-09-07, #5604) : la bascule clair/sombre du systeme
 * ne prenait qu'au relancement — cette fonction existait (`scheme.ts`) mais
 * n'etait jamais appelee. Voir `scheme.test.ts` (T1) pour le comportement,
 * et la recette simulateur R4 pour la preuve qu'elle est bien montee ici.
 */
followSystem();

/**
 * LA SESSION EST TENUE (#5605, § 7.3) — lecture `localStorage` seule, aucun
 * appel réseau : le coût est celui du module lui-même (`session.ts`
 * n'importe jamais `http.ts`), mesuré avec le reste du socle.
 */
sessionStore.getState().restoreSession();

/**
 * LE HARNAIS DE RECETTE — DEV UNIQUEMENT. `import.meta.env.DEV` est un
 * littéral de construction : cette branche entière, `import()` compris, est
 * éliminée du bundle de production (voir `dev-harness.ts`).
 */
if (import.meta.env.DEV) void import('@/lib/api/dev-harness');

/**
 * CACHE-FIRST, RESEAU-ENSUITE — les « Instant App Principles » du depot,
 * exprimes en configuration plutot qu'en discipline.
 *
 * `staleTime` non nul est ce qui distingue « je reaffiche instantanement ce que
 * j'ai, puis je rafraichis en silence » de « je remets un spinner ». Sur la 3G
 * visee, c'est la difference entre une application et une page web.
 *
 * `appQueryClient` (#5650, F5/F9) REMPLACE le `new QueryClient` qui vivait
 * ici : c'est l'instance UNIQUE, persistée par `dehydrate`/`hydrate` et
 * purgée par la session — `performRowAction`
 * (`lib/api/conversation-actions.ts`) et tout hook de `lib/api/query.ts`
 * lisent et écrivent le MÊME client que celui fourni au contexte React ;
 * deux instances distinctes rendraient chaque mutation optimiste invisible
 * à la liste (défaut mesuré et corrigé pendant ce lot, `check-list-actions.mjs`).
 */

/**
 * LA GARDE DE SESSION (#5555, E6) — branche `resolveRouteAccess` (pure) sur
 * la route COURANTE et le magasin de session PARTAGÉ. Elle rend le squelette
 * pendant qu'elle redirige plutôt que de laisser passer un flash du contenu
 * privé (D-6) — même si, `apiConfig.source` valant `'fixtures'` tant que le
 * transport réel n'est câblé nulle part (#5493), elle ne mord encore sur
 * AUCUN écran : le jour où un écran passe en source `'gateway'`, la garde
 * est déjà là, pas à ajouter.
 */
function SessionGate({ children }: { children: ReactNode }) {
  const route = useRoute();
  /* L'IDENTITÉ SUIT LA CONVERSATION LUE (#8816) — posée AVANT la décision
     d'accès : sous l'identité anonyme d'un compte, la liste redirigerait
     sinon vers la connexion au lieu de rendre le compte. */
  return useAnonymousScope(route) ? <RouteAccessGate>{children}</RouteAccessGate> : <Skeleton />;
}

function RouteAccessGate({ children }: { children: ReactNode }) {
  const { key, search } = useRoute();
  const status = useStore(sessionStore, (s) => s.session.status);
  const decision = resolveRouteAccess({ sessionStatus: status, source: apiDeps.source, routeKey: key });
  /* `next` (#5561) — une session qui s'ouvre sur `/login?next=/chat/<lien>`
     fait naviguer l'écran ET cette garde, dans le MÊME rendu. L'effet du
     parent s'exécute APRÈS celui de l'enfant : si la garde ne lisait pas
     `next`, son `/` recouvrirait le retour à l'invitation. */
  const next = search.get('next');

  useEffect(() => {
    if (decision === 'redirect-login') navigate(href('login'), true);
    if (decision === 'redirect-home') navigate(landingAfterSession(next, href('list')), true);
  }, [decision, next]);

  /* L'ACCUEIL POST-INSCRIPTION (#7729) — proposé à l'ARRIVÉE sur `/` d'une
     session, une fois par lancement (`lib/onboarding/landing.ts`). En
     `import()` : sa lecture et sa loi restent hors de la première peinture,
     et rien ne se charge pour qui n'arrive pas connecté sur l'accueil. */
  const viewerId = useStore(sessionStore, (s) => (s.session.status === 'authenticated' ? s.session.user.id : null));
  useEffect(() => {
    if (status !== 'authenticated' || apiDeps.source !== 'gateway' || key !== 'list') return;
    void import('@/lib/onboarding/landing-entry').then(({ onboardingLanding }) =>
      onboardingLanding.offer({ source: apiDeps.source, sessionStatus: status, routeKey: key, viewerId }),
    );
  }, [status, key, viewerId]);

  return decision === 'allow' ? children : <Skeleton />;
}

/** Le squelette d'attente d'un ecran decoupe — statique, jamais un spinner. */
function Skeleton() {
  return (
    <div className="grid gap-2 p-4" aria-busy="true">
      <p className="text-meta" style={{ color: 'var(--color-ios-ink-2)' }}>
        L’écran arrive…
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      ))}
    </div>
  );
}

/**
 * LA LANGUE D'INTERFACE CHANGE À CHAUD (#5563). Chaque libellé lit le catalogue
 * de façon SYNCHRONE au rendu (`translate`, #6206) : un changement de langue ne
 * se voit donc qu'au prochain rendu de chaque écran. La racine s'abonne au
 * changement et REMONTE l'arbre sous une nouvelle clé — l'adresse, le cache de
 * requêtes et la session vivent hors de l'arbre et restent intacts, et le
 * catalogue est déjà chargé quand la notification part
 * (`setInterfaceLanguage`, `followBrowserInterfaceLanguage`). Aucun rechargement,
 * là où iOS attend le relancement.
 */
function InterfaceLanguageRoot({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeInterfaceLanguage, currentInterfaceLanguage, currentInterfaceLanguage);
  return <Fragment key={language}>{children}</Fragment>;
}

/* LA COQUE DÉMARRE SUR LA LISTE (#10353) — `navigate`, pas un `replaceState`
   nu : le routeur a lu l'adresse à l'import et ne verrait pas la réécriture. */
if (__SHELL__) {
  const start = shellStartHref(window.location, href('list'));
  if (start !== null) navigate(start, true);
}

const root = document.getElementById('root');
if (!root) throw new Error('#root absent du document');

/* Les sorties natives du navigateur sont annulées sur toute surface scellée
   (#9573) — installée SYNCHRONEMENT avant le premier rendu : aucune peinture
   sans garde, et aucun chunk à la demande dont l'échec la laisserait absente. */
installSealedExitGuard(document);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <InterfaceLanguageRoot>
        <Router wrap={(screen) => <Shell><SessionGate>{screen}</SessionGate></Shell>} skeleton={<Skeleton />} />
      </InterfaceLanguageRoot>
    </QueryClientProvider>
  </StrictMode>,
);

/**
 * LE CONSENTEMENT D'ANALYSE QUE LA TÉLÉMÉTRIE DÉCLARE (#10502) — la bascule
 * « Analytique » des réglages et le consentement que la passerelle a
 * enregistré, relus à chaque connexion, changement de compte et écriture du
 * cache ; déconnecté ⇒ `unknown`, sans aucune requête. Hors du premier rendu :
 * le contexte de lot n'est lu qu'à l'envoi d'un lot.
 */
void Promise.all([
  import('@/lib/telemetry/analytics-consent'),
  import('@/lib/view/telemetry-context'),
  import('@/lib/api/app-preferences'),
  import('@/lib/api/consents'),
]).then(([{ refreshAnalyticsConsentSources, syncAnalyticsConsent }, { noteAnalyticsConsent }, { appPreferencesQueryOptions }, { consentsQueryOptions }]) =>
  syncAnalyticsConsent({
    sessionStore,
    queryClient: appQueryClient,
    note: noteAnalyticsConsent,
    refresh: () => {
      if (apiDeps.source !== 'gateway') return;
      refreshAnalyticsConsentSources({
        queryClient: appQueryClient,
        preferences: appPreferencesQueryOptions(apiDeps),
        consents: consentsQueryOptions(apiDeps),
      });
    },
  }),
);

/* Le clavier virtuel posé sur `<html>` (#10005) : Safari iOS le fait
   RECOUVRIR la page, `h-app` le retire des écrans d'application. Aucun clavier
   ne s'ouvre avant la première peinture : `import()` le tient hors d'elle. */
void import('@/lib/view/keyboard-viewport').then(({ installKeyboardViewport }) => installKeyboardViewport(window));

/**
 * LE TEMPS RÉEL S'AMORCE APRÈS LA PREMIÈRE PEINTURE (#5793) — `import()`,
 * motif `dev-harness.ts` ci-dessus, mais SANS garde `DEV` : le fil et la
 * liste reçoivent `message:new`/`typing:*` en PRODUCTION comme en
 * développement. Placé APRÈS `createRoot(...).render(...)` : le rendu
 * initial est déjà planifié quand `socket.io-client` (chargé par ce module,
 * `lib/net/socket-io-factory.ts`) commence seulement à se télécharger —
 * c'est ce qui le tient hors de `first_paint` (`budgets.json`,
 * `scripts/measure-weight.mjs`).
 */
void import('@/lib/api/realtime');

/**
 * L'APPAREIL FINIT CE QU'UN RETRAIT RATÉ A LAISSÉ (audit #10237) — un compte
 * supprimé noté mais pas retiré (module de retrait non chargé), un carnet de
 * jeu dont la suppression n'a pas abouti. Quelques secondes après la
 * première peinture : rien ici ne la retarde.
 */
setTimeout(() => void import('@/lib/api/account-deleted-retire').then(({ tidyDeviceAfterBoot }) => tidyDeviceAfterBoot()).catch(() => undefined), 4_000);


/**
 * UN LIEN MEESHY OUVERT PAR LE SYSTÈME MÈNE À SON ÉCRAN (#5819) — la coque
 * Android reçoit les App Links de `meeshy.me` et `meeshy://` ; le lien d'un
 * lancement à froid attend, retenu par le pont natif, que cet écouteur
 * s'abonne. Hors coque, rien ne se charge.
 */
if (__SHELL__) {
  void Promise.all([import('@/lib/links/shell-deep-links'), import('@/lib/native-shell'), import('@/routes/app-paths')]).then(
    ([{ ecouterLiensEntrants }, { coqueCourante }, { isAppPath }]) =>
      ecouterLiensEntrants(coqueCourante(), { isAppPath, navigate: (chemin) => navigate(chemin) }),
  );
}

/**
 * UNE IMAGE, UNE VIDÉO OU UN LIEN PARTAGÉ DEPUIS UNE AUTRE APPLICATION OUVRE LA
 * FEUILLE D'ENVOI (#8884) — l'intent `SEND` de la coque Android est copié par
 * `MeeshyShareIntentPlugin`, lu ici ; le partage d'un lancement à froid attend
 * côté natif, celui d'un utilisateur pas encore connecté attend la connexion.
 * Le web reçoit le même partage par le `share_target` de la PWA (`/share`).
 */
if (__SHELL__) {
  void import('@/lib/share-incoming/native-start').then(({ startNativeShareInboxInShell }) => startNativeShareInboxInShell());
}

/**
 * LA LANGUE CHOISIE DANS MEESHY REJOINT LES TEXTES NATIFS DE LA COQUE (#9749)
 * — un choix fait avant cette version, ou qu'un Android antérieur au 13 a
 * oublié, sans jamais écraser la langue posée depuis les réglages d'Android.
 */
if (__SHELL__) {
  void syncShellLocaleAtStart(interfaceLanguageChoice());
}

/**
 * UN VOCAL CONTINUE DE JOUER QUAND ON QUITTE L'APP (#9257) — la coque Android
 * tient un service au premier plan tant qu'un `<audio>` de la page joue ;
 * sans lui, Android gèle le processus mis en cache au milieu du vocal. Un
 * navigateur tient lui-même la lecture : hors coque, rien ne se charge.
 */
if (__SHELL__) {
  void import('@/lib/view/shell-playback').then(({ holdWhileAudioPlays, pauseVideosWhenNoisy, shellNoisy, shellPlaybackHold }) => {
    holdWhileAudioPlays(document, shellPlaybackHold());
    pauseVideosWhenNoisy(document, shellNoisy());
  });
}

/**
 * LA COQUE ANDROID REÇOIT SES PUSHS PAR FCM NATIF (#7307). La WebView n'a ni
 * Push API ni service worker : le jeton vient de `@capacitor/push-notifications`
 * et s'enregistre par le même port qu'iOS. Derrière `__SHELL__`, ce module et
 * le plugin quittent le build web ; `import()` le tient hors de `first_paint`.
 */
if (__SHELL__) {
  void import('@/lib/push/shell-push-runtime').then(({ startShellPushInShell }) => startShellPushInShell());
}

/**
 * LE SERVICE WORKER S'INSCRIT APRÈS LA PREMIÈRE PEINTURE, ET SUR LE `load`
 * (#6936) — l'installation précache tout le bundle : la lancer pendant le
 * premier rendu ferait concurrence, sur la 3G visée, au rendu lui-même. C'est
 * la même horloge que `registerSW.js` de `vite-plugin-pwa`, qu'on remplace
 * (`vite.config.ts` § `injectRegister`), et que le legacy
 * (`ServiceWorkerInitializer`, monté dans son layout).
 *
 * `__SHELL__` : la coque Capacitor n'émet AUCUN service worker
 * (`scripts/check-shell-dist.mjs`) — elle embarque ses actifs et reçoit une
 * version neuve par son magasin d'applications. `import.meta.env.PROD` : en
 * développement, `vite` ne sert pas de `/sw.js` (les `devOptions` de VitePWA
 * sont désactivées), et l'inscription échouerait à chaque rechargement.
 */
if (!__SHELL__ && import.meta.env.PROD && 'serviceWorker' in navigator) {
  const inscrire = (): void => {
    void import('@/lib/app-update/service-worker').then(({ appUpdateController }) =>
      appUpdateController().register(),
    );
    /**
     * ET LE WORKER ZOMBIE DU PUSH LEGACY SE DÉSINSCRIT (#7305). `meeshy.me`
     * sert la v2 depuis le 2026-09-15 ; tout navigateur qui a connu le legacy
     * garde une inscription VIVANTE de `/firebase-messaging-sw.js` sous sa
     * PROPRE portée, que la substitution de `/sw.js` ne touche pas. Sans ce
     * retrait, le même message lèverait DEUX bannières — dont une composée
     * avec des routes qui n'existent plus (D-11). Idempotent et silencieux :
     * rien ici ne conditionne le démarrage de l'application, d'où l'absence
     * de `then`.
     */
    void import('@/lib/app-update/legacy-push-worker').then(({ purgeLegacyPushWorkers }) => purgeLegacyPushWorkers());
    /**
     * ET LE TAP D'UNE BANNIÈRE ABOUTIT (#7305). `sw-push.js` focalise un
     * client déjà ouvert plutôt que d'ouvrir un second onglet, puis lui remet
     * l'adresse : sans cet écouteur, le tap ramènerait l'onglet au premier
     * plan et l'y laisserait — un contrôle qui ment (loi 4).
     */
    void import('@/lib/notifications/tap-navigation').then(({ listenNotificationTapsInBrowser }) =>
      listenNotificationTapsInBrowser(),
    );
    /**
     * ET « RÉPONDRE » SUR LA NOTIFICATION D'APPEL DÉCROCHE (#8043) : le fil
     * ouvert par le worker décroche l'appel désigné dès qu'il sonne, et la
     * notification disparaît quand l'appel quitte la sonnerie.
     */
    void import('@/lib/calls/call-answer-intent').then(({ listenCallAnswerIntentsInBrowser }) =>
      listenCallAnswerIntentsInBrowser(),
    );
    void import('@/lib/calls/call-back-intent').then(({ listenCallBackIntentsInBrowser }) =>
      listenCallBackIntentsInBrowser(),
    );
    /** ET « RÉPONDRE » SUR UNE NOTIFICATION DE MESSAGE MET LE CURSEUR DANS LE COMPOSEUR (#8860). */
    void import('@/lib/notifications/composer-focus-intent').then(({ listenComposerFocusIntentsInBrowser }) =>
      listenComposerFocusIntentsInBrowser(),
    );
    /**
     * ET LE WORKER PEUT ACCUSER LA REMISE D'UN PUSH, ONGLET FERMÉ (#7368,
     * W4). `sw-push.js` (script classique) ne lit ni `localStorage` ni aucun
     * module de `src/` : sans ce pont IndexedDB, posé dès que la session est
     * connue, un push reçu avant la première ouverture de CETTE session
     * trouverait le magasin vide et resterait « envoyé » jusqu'à
     * reconnexion — exactement le symptôme du relevé.
     */
    void import('@/lib/notifications/delivery-receipt-credential').then(({ startDeliveryReceiptCredentialSync }) =>
      startDeliveryReceiptCredentialSync(),
    );
  };
  if (document.readyState === 'complete') inscrire();
  else window.addEventListener('load', inscrire, { once: true });
}

/**
 * ET LA COQUE APPREND QU'UNE VERSION EST PUBLIÉE (#6937). Sans service worker,
 * c'est la passerelle qui le lui dit (`GET app.shellVersion`), au
 * démarrage et à chaque retour au premier plan ; la bannière ouvre alors la
 * fiche du magasin au lieu de recharger. Même horloge que l'inscription du
 * worker ci-dessus : après la première peinture, sur le `load`.
 */
if (__SHELL__) {
  const guetter = (): void => {
    void Promise.all([
      import('@/lib/app-update/shell-update'),
      import('@/lib/api/client'),
      import('@/lib/native-shell'),
    ]).then(([{ watchShellUpdates }, { httpTransport }, { coqueCourante }]) =>
      watchShellUpdates({ transport: httpTransport, installed: __APP_VERSION__, bridge: coqueCourante(), host: document }),
    );
  };
  if (document.readyState === 'complete') guetter();
  else window.addEventListener('load', guetter, { once: true });
}

/**
 * LA CAPTURE D'UN CONTENU (#10508) — dans la coque seulement : un navigateur
 * ne détecte aucune capture. L'écoute se charge après la première peinture ;
 * elle déclare à la télémétrie ce que la coque détecte réellement, puis émet
 * `screen_capture` avec ce qui était à l'écran — jamais l'image.
 */
if (__SHELL__) {
  const ecouterCaptures = (): void => {
    void Promise.all([
      import('@/lib/telemetry/content-capture'),
      import('@/lib/view/reading-telemetry'),
      import('@/lib/view/viewability'),
      import('@/lib/view/telemetry-context'),
      import('@/lib/native-shell'),
    ]).then(([{ startContentCaptureReports, captureSurfaceOf }, { readingTelemetry }, { visibleTargets }, { noteCaptureDetection }, { coqueCourante }]) =>
      startContentCaptureReports({
        coque: coqueCourante(),
        record: (event) => readingTelemetry.recordV2(event),
        collect: () => ({ surface: captureSurfaceOf(window.location.pathname), visibleTargets: visibleTargets() }),
        now: () => Date.now(),
        onDetection: noteCaptureDetection,
      }),
    );
  };
  if (document.readyState === 'complete') ecouterCaptures();
  else window.addEventListener('load', ecouterCaptures, { once: true });
}

/**
 * LE CLIC D'UN LIEN DANS UN CONTENU (#10505) — une écoute déléguée unique,
 * posée après la première peinture : le domaine enregistrable seul, jamais
 * l'adresse, et aucune adresse décorée.
 */
{
  const ecouterLiens = (): void => {
    void Promise.all([import('@/lib/telemetry/link-clicks'), import('@/lib/view/reading-telemetry'), import('@/lib/links/public-origin')]).then(
      ([{ bindLinkClicks }, { readingTelemetry }, { publicWebOrigin }]) =>
        bindLinkClicks(document, (event) => readingTelemetry.recordV2(event), () => ({
          ownOrigins: [window.location.origin, publicWebOrigin(window.location.origin)],
          pathname: window.location.pathname,
        })),
    );
  };
  if (document.readyState === 'complete') ecouterLiens();
  else window.addEventListener('load', ecouterLiens, { once: true });
}

/**
 * L'ENTONNOIR DES NOTIFICATIONS (#10507) — ce que le service worker a noté
 * (reçue, affichée, ouverte, écartée) passe dans la file v2 au chargement.
 */
{
  const viderNotifications = (): void => {
    void Promise.all([import('@/lib/notifications/notification-telemetry'), import('@/lib/view/reading-telemetry')]).then(
      ([{ drainNotificationTelemetry }, { readingTelemetry }]) =>
        drainNotificationTelemetry(typeof indexedDB === 'undefined' ? undefined : indexedDB, (event) => readingTelemetry.recordV2(event)),
    );
  };
  if (document.readyState === 'complete') viderNotifications();
  else window.addEventListener('load', viderNotifications, { once: true });
}
