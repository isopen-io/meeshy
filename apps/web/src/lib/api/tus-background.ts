/**
 * **L'ENVOI DE FOND** (#11311, W5) — quand la page passe à l'arrière-plan en
 * plein envoi, le RESTE du fichier part dans le navigateur lui-même
 * (Background Fetch), qui le poursuit page suspendue, voire fermée.
 *
 * Décision DEC-WEB (#11253) : Chrome et les PWA Chromium l'offrent ; la WebView
 * Android de la coque et Safari non — là, `backgroundUploadPort` rend `null` et
 * l'envoi reste au premier plan, protégé par le seul checkpoint
 * (`tus-checkpoint.ts`). Rien ici ne suppose la capacité : tout est derrière un
 * port que la détection peut ne pas rendre.
 *
 * Le navigateur envoie UN `PATCH` (le reste du fichier, `Upload-Offset` à
 * l'offset relu côté serveur). Le service worker (`public/sw-background-upload.js`,
 * son jumeau) range l'accusé sur le checkpoint et prévient les pages ouvertes ;
 * la page qui revient — la même ou une autre — rend ce média sans réseau.
 *
 * **Aucune méthode ne rejette** : un refus du navigateur est une valeur, et
 * l'envoi continue au premier plan.
 */

/** Le préfixe de l'identifiant d'un envoi de fond — LITTÉRAL du worker (script classique, aucun import). */
export const TUS_BACKGROUND_ID_PREFIX = 'meeshy-tus:';
/** Le type du message que le worker adresse aux pages — LITTÉRAL du worker. */
export const TUS_BACKGROUND_MESSAGE = 'meeshy:tus-background';

export const backgroundFetchIdOf = (fingerprint: string): string => `${TUS_BACKGROUND_ID_PREFIX}${fingerprint}`;

type BackgroundFetchHandle = { readonly result?: string };

/** La part de `ServiceWorkerRegistration.backgroundFetch` que ce module utilise (absente de `lib.dom`). */
export type BackgroundRegistration = {
  /** La portée du worker — une URL de l'origine de la page, celle qui émettrait l'envoi de fond. */
  readonly scope?: string;
  readonly backgroundFetch?:
    | {
        fetch(id: string, request: Request, options: { readonly title: string }): Promise<unknown>;
        get(id: string): Promise<BackgroundFetchHandle | undefined>;
      }
    | undefined;
};

export type BackgroundContainer = {
  getRegistration(): Promise<BackgroundRegistration | undefined>;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
};

export type BackgroundUploadStart = {
  readonly fingerprint: string;
  readonly location: string;
  /** L'offset relu côté serveur : le navigateur envoie les octets de là à la fin. */
  readonly offset: number;
  readonly file: File;
  readonly headers: Readonly<Record<string, string>>;
  /** Le libellé que le navigateur affiche pour l'envoi de fond — un nom de fichier, jamais un texte traduit. */
  readonly title: string;
};

export type BackgroundUploadPort = {
  /** Le navigateur peut-il envoyer à cette adresse ? Chromium refuse toute requête Background Fetch qui exige un
   * pré-vol CORS (`background_fetch_manager.cc`, crbug.com/40515511) — et un `PATCH` TUS en exige toujours un hors
   * de l'origine de la page (méthode, `Authorization`, `Content-Type`). Faux : la page cachée n'annule rien, l'envoi
   * reste au premier plan comme sans Background Fetch. */
  readonly reaches: (location: string) => boolean;
  /** Confie le reste du fichier au navigateur. `false` : refusé (identifiant déjà pris, quota) — rester au premier plan. */
  readonly start: (start: BackgroundUploadStart) => Promise<boolean>;
  /** Un envoi de fond de cette empreinte est-il encore en cours ? */
  readonly isRunning: (fingerprint: string) => Promise<boolean>;
  /** Rend la main quand le worker a rangé l'issue de cet envoi (ou tout de suite si rien ne tourne, ou à l'annulation). */
  readonly settled: (fingerprint: string, signal?: AbortSignal) => Promise<void>;
};

export type PageVisibility = {
  /** Prévient quand la page passe à l'arrière-plan ; rend le désabonnement. */
  readonly onHidden: (listener: () => void) => () => void;
};

type VisibilitySource = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;

export const visibilityOf = (source: () => VisibilitySource | undefined): PageVisibility => ({
  onHidden: (listener) => {
    const page = source();
    if (page === undefined) return () => undefined;
    const onChange = (): void => {
      if (page.visibilityState === 'hidden') listener();
    };
    page.addEventListener('visibilitychange', onChange);
    return () => page.removeEventListener('visibilitychange', onChange);
  },
});

export const documentVisibility: PageVisibility = visibilityOf(() => (typeof document === 'undefined' ? undefined : document));

const isSettledMessage = (data: unknown, fingerprint: string): boolean => {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;
  return message['type'] === TUS_BACKGROUND_MESSAGE && message['fingerprint'] === fingerprint;
};

const originOf = (location: string): string | null => {
  try {
    return new URL(location).origin;
  } catch {
    return null;
  }
};

export async function backgroundUploadPort(container: BackgroundContainer | undefined): Promise<BackgroundUploadPort | null> {
  if (container === undefined) return null;
  const registration = await container.getRegistration().catch((): undefined => undefined);
  const backgroundFetch = registration?.backgroundFetch;
  if (backgroundFetch === undefined) return null;
  const pageOrigin = registration?.scope === undefined ? null : originOf(registration.scope);

  const isRunning = async (fingerprint: string): Promise<boolean> => {
    try {
      const handle = await backgroundFetch.get(backgroundFetchIdOf(fingerprint));
      return handle !== undefined && (handle.result ?? '') === '';
    } catch {
      return false;
    }
  };

  return {
    reaches: (location) => pageOrigin !== null && originOf(location) === pageOrigin,
    start: async ({ fingerprint, location, offset, file, headers, title }) => {
      try {
        const request = new Request(location, { method: 'PATCH', headers: { ...headers }, body: file.slice(offset) });
        await backgroundFetch.fetch(backgroundFetchIdOf(fingerprint), request, { title });
        return true;
      } catch {
        return false;
      }
    },
    isRunning,
    settled: (fingerprint, signal) =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          container.removeEventListener('message', onMessage);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const onMessage = (event: { readonly data: unknown }): void => {
          if (isSettledMessage(event.data, fingerprint)) done();
        };
        // L'écoute AVANT la question : un message arrivé entre les deux ne se perd pas.
        container.addEventListener('message', onMessage);
        signal?.addEventListener('abort', done, { once: true });
        if (signal?.aborted === true) return done();
        void isRunning(fingerprint).then((running) => {
          if (!running) done();
        });
      }),
  };
}

let defaultPort: Promise<BackgroundUploadPort | null> | undefined;

/** Le port du navigateur courant, résolu UNE fois : `null` partout où Background Fetch n'existe pas. */
export function defaultBackgroundUploadPort(): Promise<BackgroundUploadPort | null> {
  defaultPort ??= backgroundUploadPort(typeof navigator === 'undefined' ? undefined : (navigator.serviceWorker as unknown as BackgroundContainer | undefined));
  return defaultPort;
}
