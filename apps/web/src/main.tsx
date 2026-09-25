import { QueryClientProvider } from '@tanstack/react-query';
import { Fragment, StrictMode, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand/react';

import './styles/app.css';

import Shell from '@/components/shell';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { currentInterfaceLanguage, subscribeInterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { followSystem } from '@/lib/scheme';
import { landingAfterSession, resolveRouteAccess } from '@/lib/session-guard';
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

const root = document.getElementById('root');
if (!root) throw new Error('#root absent du document');

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
 * c'est la passerelle qui le lui dit (`GET /api/v1/app/shell-version`), au
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
