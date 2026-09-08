import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

import type { Transport } from '../net/transport';

/**
 * LE CLIENT HTTP RÉEL (#5605, T2) — le transport que `apiConfig`/`session.ts`
 * cablent, `fetchImpl` INJECTABLE pour les témoins.
 *
 * DEUX RÉGIMES D'IDENTITÉ, JAMAIS MÉLANGÉS (`APIClient.swift:480-483`) : un
 * utilisateur enregistré parle en `Authorization: Bearer <JWT>`, un invité de
 * lien en `X-Session-Token: <anon_…>`. Présenter le jeton anonyme en Bearer
 * fait répondre « Invalid JWT token » côté passerelle — les deux en-têtes ne
 * partent donc JAMAIS ensemble depuis `credential()`.
 *
 * `X-Device-Locale` part sur CHAQUE appel dès que le résolveur est fourni —
 * c'est le rang 4 du Prisme Linguistique (CLAUDE.md racine, règle 2),
 * consommé par `deviceLocale.ts:147` côté passerelle.
 *
 * ANNULABLE — `signal` est TRANSMIS à `fetch`. Sans lui, aucune requête ne
 * s'annule : quitter un écran laisserait sa requête vivre jusqu'au bout, et
 * TanStack Query n'aurait aucun moyen d'abandonner celle qu'il remplace. Une
 * annulation est rendue comme un échec PORTANT `code: 'ABORTED'` — jamais
 * confondue avec une panne réseau, que l'appelant, lui, doit signaler.
 *
 * DÉLAI DE GARDE (#5605, revue-correction) — `signal` seul ne borne QUE
 * l'annulation VOULUE par l'appelant ; une passerelle qui accepte la
 * connexion puis se tait (redémarrage, réseau qui se dégrade sans se
 * couper) laissait sinon la requête pendue indéfiniment, ce que la
 * dimension 2 (« combien de temps avant que l'utilisateur VOIE quelque
 * chose ») interdit. `timeoutMs` compose un `AbortSignal.timeout()` AVEC le
 * `signal` de l'appelant (`AbortSignal.any`, jamais l'un À LA PLACE de
 * l'autre) et rend l'expiration comme `code: 'TIMEOUT'` — distinct de
 * `'ABORTED'`, pour qu'un écran propose « réessayer » sans le confondre
 * avec un départ volontaire. Distinguer les deux se fait en relisant l'état
 * des DEUX signaux sources après coup, jamais le nom de l'erreur : un
 * `fetchImpl` de test qui n'imite pas la forme exacte de `DOMException`
 * resterait sinon indétectable.
 *
 * LES EN-TÊTES DE L'APPELANT GAGNENT EN DERNIER — motif direct
 * `APIClient.swift` (« Caller-provided headers are applied last so they win
 * over defaults ») : c'est ce qui permet à `auth.ts#logout()` de poser
 * `X-Session-Token` explicitement (l'identité de LA session à invalider,
 * distincte du `Authorization` d'authentification, `login.ts:355-386`) sans
 * que ce module invente un troisième régime de crédential pour un seul appel.
 */

/** Les DEUX régimes, gravés comme un type SOMME plutôt qu'un `String` nu
 * (`APIClient.swift` : « un `String` nu oblige chaque appelant à SUPPOSER le
 * protocole » — défaut déjà payé côté web, fix du 2026-08-18). */
export type Credential =
  | { readonly kind: 'registered'; readonly token: string }
  | { readonly kind: 'anonymous'; readonly sessionToken: string };

export type ApiFailure = {
  readonly ok: false;
  readonly status: number;
  readonly error: string;
  readonly code?: string;
};

export type ApiSuccess<T> = {
  readonly ok: true;
  readonly data: T;
  readonly pagination?: PaginationMeta;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type HttpRequest = {
  readonly method: 'GET' | 'PUT' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  /** Transmis tel quel à `fetch` — l'appelant (TanStack Query, un effet de
   * vue) reste le seul à décider quand abandonner. */
  readonly signal?: AbortSignal;
  /** Gagne sur les en-têtes par défaut (crédential, locale) — motif
   * `APIClient.swift`, réservé aux appels qui doivent nommer une identité
   * hors du crédential courant (`logout()` § `X-Session-Token`). */
  readonly headers?: Readonly<Record<string, string>>;
};

export type HttpTransportOptions = {
  readonly base: string;
  readonly credential?: () => Credential | null;
  readonly deviceLocale?: () => string | null;
  /** Notifié sur un 401 PORTANT un crédential, et seulement là. Un 403
   * (interdit) ou un 500 (panne) ne disent rien du jeton courant — et un 401
   * sur un appel qui n'a présenté AUCUN jeton non plus : `POST /auth/login`
   * refusé (`login.ts:133`, `security: []`) déconnecterait sinon la session
   * en cours pour un mot de passe mal tapé dans un ré-authentifiant. */
  readonly onUnauthorized?: () => void;
  readonly fetchImpl?: typeof fetch;
  /** Délai de garde en ms, `DEFAULT_TIMEOUT_MS` par défaut. `0` ou négatif
   * DÉSACTIVE le délai (utile à un témoin qui veut isoler un autre
   * comportement) — jamais le défaut d'une passerelle réelle. */
  readonly timeoutMs?: number;
};

export type HttpTransport = Transport & {
  request<T>(request: HttpRequest): Promise<ApiResult<T>>;
};

const GENERIC_ERROR = (status: number): string => `Erreur ${status}`;

/**
 * Valeur CONSERVATRICE et PROVISOIRE — aucun écran ne consomme encore ce
 * transport ce tour (#5605 § périmètre), donc aucun p95 réel n'existe pour
 * l'arbitrer. Le premier travail qui câble un écran réel DOIT la
 * reconsidérer contre le p95 MESURÉ de ses routes (dimension 2), jamais la
 * garder par confort — inventer une valeur définitive sans mesure serait
 * exactement l'erreur que la doctrine de poids du dépôt interdit pour un
 * chiffre de performance.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Un appel « porte une identité » s'il présente un crédential OU si
 * l'appelant a nommé lui-même l'un des deux en-têtes d'identité — le cas de
 * `auth.ts#logout()`, qui les pose APRÈS le wipe local. Comparaison
 * insensible à la casse : les noms d'en-têtes HTTP le sont. */
function namesAnIdentity(headers: Readonly<Record<string, string>> | undefined): boolean {
  if (headers === undefined) return false;
  return Object.keys(headers).some((name) => {
    const lower = name.toLowerCase();
    return lower === 'authorization' || lower === 'x-session-token';
  });
}

function credentialHeaders(credential: Credential | null): Record<string, string> {
  if (credential === null) return {};
  if (credential.kind === 'registered') return { Authorization: `Bearer ${credential.token}` };
  return { 'X-Session-Token': credential.sessionToken };
}

/** Narrowing FAIL-CLOSED de l'enveloppe (`ApiResponse<T>`,
 * `@meeshy/shared/types/api-responses.ts:106-115`) : une réponse non-JSON ou
 * sans `success` déclarée rend un échec générique, jamais `undefined`. */
function envelopeOf(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

/**
 * Compose le `signal` de l'appelant AVEC un délai de garde — jamais l'un À
 * LA PLACE de l'autre (motif `APIClient.swift` § en-têtes, appliqué ici aux
 * signaux). `timeoutMs <= 0` désactive le délai : seul le signal de
 * l'appelant, s'il existe, gouverne alors l'annulation.
 */
function composeSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { readonly signal: AbortSignal | undefined; readonly timeoutSignal: AbortSignal | undefined } {
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  if (callerSignal === undefined) return { signal: timeoutSignal, timeoutSignal };
  if (timeoutSignal === undefined) return { signal: callerSignal, timeoutSignal };
  return { signal: AbortSignal.any([callerSignal, timeoutSignal]), timeoutSignal };
}

/**
 * La CAUSE d'une annulation se lit sur l'ÉTAT des signaux SOURCES après
 * coup, jamais sur le NOM de l'erreur qu'a rendu `fetchImpl` : un mock de
 * témoin n'a aucune raison d'imiter la forme exacte d'une `DOMException`
 * (`AbortError` vs `TimeoutError`), et un moteur réel peut nommer la
 * sienne différemment de `fetch`. Le repli sur `error.name === 'AbortError'`
 * couvre le seul cas que l'état des signaux ne peut pas trancher : un appel
 * SANS signal explicite (ni de l'appelant, ni de délai — `timeoutMs <= 0`)
 * dont `fetchImpl` a quand même produit une annulation par un mécanisme qui
 * lui est propre.
 */
function abortCode(
  error: unknown,
  sources: { readonly callerSignal: AbortSignal | undefined; readonly timeoutSignal: AbortSignal | undefined },
): 'ABORTED' | 'TIMEOUT' | undefined {
  const { callerSignal, timeoutSignal } = sources;
  if (timeoutSignal?.aborted === true) return 'TIMEOUT';
  if (callerSignal?.aborted === true) return 'ABORTED';
  if (error instanceof Error && error.name === 'AbortError') return 'ABORTED';
  return undefined;
}

export function createHttpTransport(options: HttpTransportOptions): HttpTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(req: HttpRequest): Promise<ApiResult<T>> {
    const url = `${options.base}${req.path}`;
    const locale = options.deviceLocale?.() ?? null;
    const credential = options.credential?.() ?? null;
    const presentsIdentity = credential !== null || namesAnIdentity(req.headers);
    const headers: Record<string, string> = {
      ...credentialHeaders(credential),
      ...(locale ? { 'X-Device-Locale': locale } : {}),
      ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...req.headers,
    };

    const { signal, timeoutSignal } = composeSignal(req.signal, timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: req.method,
        headers,
        ...(signal !== undefined ? { signal } : {}),
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      });
    } catch (error) {
      const code = abortCode(error, { callerSignal: req.signal, timeoutSignal });
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Réseau indisponible',
        ...(code !== undefined ? { code } : {}),
      };
    }

    if (response.status === 401 && presentsIdentity) options.onUnauthorized?.();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    const envelope = envelopeOf(payload);

    if (envelope.success === true) {
      return {
        ok: true,
        data: envelope.data as T,
        ...(envelope.pagination !== undefined ? { pagination: envelope.pagination as PaginationMeta } : {}),
      };
    }

    return {
      ok: false,
      status: response.status,
      error: typeof envelope.error === 'string' ? envelope.error : GENERIC_ERROR(response.status),
      ...(typeof envelope.code === 'string' ? { code: envelope.code } : {}),
    };
  }

  const transport = (({ method, path, body }) => request({ method, path, body })) as HttpTransport;
  transport.request = request;
  return transport;
}
