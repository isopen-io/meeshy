import { useCallback, useState } from 'react';

/**
 * **POURQUOI UN MÉDIA NE S'EST PAS CHARGÉ (#8141).**
 *
 * `<img onError>` et `<video onError>` ne portent aucun statut. Or l'état
 * dessiné de la visionneuse n'offre « Réessayer » que si réessayer a un effet
 * (loi 4) : un fichier purgé, expiré ou refusé (401/403/404/410) ne reviendra
 * pas ; une coupure réseau, une passerelle en panne ou saturée (5xx, 429), si.
 * La sonde rejoue la MÊME adresse en `HEAD` — aucun octet de média — et
 * tranche. Une réponse 200 sur un média qui a échoué est un fichier
 * ILLISIBLE : réessayer rendrait le même fichier, donc définitif aussi.
 */
export type MediaFailureKind = 'gone' | 'transient';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const GONE_STATUSES: ReadonlySet<number> = new Set([401, 403, 404, 410]);

export async function classifyMediaFailure(params: {
  readonly url: string;
  readonly fetch: Fetcher;
  readonly online: boolean;
}): Promise<MediaFailureKind> {
  if (!params.online) return 'transient';
  try {
    const response = await params.fetch(params.url, { method: 'HEAD', mode: 'cors', credentials: 'omit' });
    if (GONE_STATUSES.has(response.status) || response.ok) return 'gone';
    return 'transient';
  } catch {
    return 'transient';
  }
}

const browserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

const browserFetch: Fetcher = (url, init) => fetch(url, init);

export type MediaLoadFailure = {
  /** La page a échoué pour SON adresse courante. */
  readonly failed: boolean;
  /** « Réessayer » a un sens — `false` tant que la sonde n'a pas répondu. */
  readonly retryable: boolean;
  /** Change à chaque « Réessayer » : la clé qui remonte l'élément média. */
  readonly attempt: number;
  readonly onError: () => void;
  readonly retry: () => void;
};

/**
 * L'échec d'UNE adresse de média. Retenu PAR adresse : une page recyclée sur
 * une autre pièce repart sans échec.
 */
export function useMediaLoadFailure(src: string, deps: { readonly fetch?: Fetcher } = {}): MediaLoadFailure {
  const [failure, setFailure] = useState<{ readonly src: string; readonly kind: MediaFailureKind | 'probing' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fetcher = deps.fetch ?? browserFetch;

  const onError = useCallback(() => {
    setFailure({ src, kind: 'probing' });
    void classifyMediaFailure({ url: src, fetch: fetcher, online: browserOnline() }).then((kind) =>
      setFailure((current) => (current?.src === src ? { src, kind } : current)),
    );
  }, [src, fetcher]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((value) => value + 1);
  }, []);

  const failed = failure !== null && failure.src === src;
  return { failed, retryable: failed && failure.kind === 'transient', attempt, onError, retry };
}
