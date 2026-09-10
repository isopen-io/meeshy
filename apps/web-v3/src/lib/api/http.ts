import type { CursorPaginationMeta, PaginationMeta } from '@meeshy/shared/types/api-responses';

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
  /** Le champ de formulaire que ce refus vise — `details.field` de
   * `sendError()` (`services/gateway/src/utils/response.ts`), étalé à la
   * RACINE de l'enveloppe (`register.ts:401-407`, `409` § champ conflit). Sans
   * lui, aucun refus d'inscription ne peut se poser SOUS son champ (#5555, T1). */
  readonly field?: string;
  /** Le délai RÉEL, en secondes, avant qu'un 429 ne se rouvre — posé par
   * `RateLimiter.middleware()` (`rate-limiter.ts:307`) à la racine de
   * l'enveloppe. Sans lui, un texte de refus ne peut que MENTIR un délai en
   * dur ou rester vague (#5912) : la fenêtre d'un limiteur est une donnée du
   * serveur, jamais une constante du client. */
  readonly retryAfter?: number;
};

export type ApiSuccess<T> = {
  readonly ok: true;
  readonly data: T;
  /**
   * LE CODE HTTP DU SUCCÈS (#5814) — optionnel : un appelant qui construit
   * un `ApiResult` à la main (un témoin, `fixtures-reactions.ts`) n'a rien à
   * fournir qu'il n'a pas. `createHttpTransport` le pose TOUJOURS
   * (`response.status`, connu à cet instant). Le SEUL consommateur qui en a
   * besoin aujourd'hui : `reactionOutcome` (`api/reactions.ts`) distingue
   * 201 (créée) de 200 (`addResult.unchanged`,
   * `services/gateway/src/routes/reactions.ts:181-187`) — une distinction
   * que ni `data` ni `pagination` ne portent.
   */
  readonly status?: number;
  readonly pagination?: PaginationMeta;
  /**
   * #5650 (F2/§3.3) — la pagination CURSEUR d'une route qui la sert à côté de
   * `pagination` (`GET /conversations/:id/messages`,
   * `services/gateway/src/routes/conversations/messages-list.ts:743-756` :
   * `{ data, cursorPagination, meta, pagination? }` — DEUX champs de
   * pagination SIBLINGS de `data`, jamais imbriqués dedans). Sans ce champ,
   * `hasOlder` (§ `messages.ts`) était irrécupérable depuis ce pont UNIQUE : le
   * SEUL autre choix était un second chemin réseau pour le fil, exactement la
   * jumelle divergente que ce transport existe pour éviter.
   */
  readonly cursorPagination?: CursorPaginationMeta;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type HttpRequest = {
  readonly method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  /** Transmis tel quel à `fetch` — l'appelant (TanStack Query, un effet de
   * vue) reste le seul à décider quand abandonner. */
  readonly signal?: AbortSignal;
  /** Gagne sur les en-têtes par défaut (crédential, locale) — motif
   * `APIClient.swift`, réservé aux appels qui doivent nommer une identité
   * hors du crédential courant (`logout()` § `X-Session-Token`). */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * REMPLACE le délai de garde du transport POUR CET APPEL (revue-correction
   * #5668). `DEFAULT_TIMEOUT_MS` est arbitré contre le p95 d'un appel JSON
   * (voir son doc-comment) : il ne dit RIEN d'un téléversement, dont la durée
   * est proportionnelle aux OCTETS et non à la latence. Une photo de 4 Mo sur
   * le profil Fast 3G que ce dépôt budgète (`budgets.json § network_note`,
   * ~400 kbit/s en montée) demande plus de quatre-vingts secondes : avec les
   * 15 s du défaut, AUCUN envoi de photo n'aboutissait sur ce profil, et
   * l'échec se lisait « la passerelle n'a pas répondu ». `0` ou négatif
   * DÉSACTIVE le délai — seul le signal de l'appelant tranche alors.
   */
  readonly timeoutMs?: number;
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
 * Valeur CONSERVATRICE, ARBITRÉE contre le p95 MESURÉ (#5650, §7.3) —
 * `GET /conversations` (5 tirs sur `gate.staging.meeshy.me`, compte
 * `cible-web-trois`) : 1.662 / 1.668 / 1.857 / 1.634 / 1.516 s — p95 (5e
 * tir) ≈ 1,52 s, pire cas observé 1,86 s. `GET /conversations/:id` :
 * ~0,30-0,32 s. `GET …/messages?limit=50` : ~0,60-0,69 s. Règle retenue
 * (§7.3 de la spécification) : `p95 × 3 < 15 s` ⇒ la valeur reste — ici
 * 1,86 × 3 ≈ 5,6 s, largement sous le plafond. `15_000` n'est donc plus
 * PROVISOIRE : c'est une garde large, mesurée, pas une estimation.
 *
 * CE N'EST PAS LA SEULE HORLOGE SUR CE CHEMIN (revue-correction) : dans la
 * VARIANTE A (PWA), le service worker route `/api/**` en NetworkFirst avec
 * `networkTimeoutSeconds: 3` (`vite.config.ts` § runtimeCaching). C'est LUI
 * qui tranche le premier — au-delà de trois secondes il sert le cache
 * disque au lieu d'attendre, ce qui est la dégradation hors-ligne VOULUE,
 * pas une panne. Ce délai-ci reste la garde du chemin sans service worker
 * (variante B Capacitor, `bunx vite` en développement, et tout témoin).
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
 * Le champ visé par un refus — sous DEUX formes, mesurées en direct sur le
 * staging réel (#5555, recette) :
 *
 *  1. `envelope.field` — une CHAÎNE À LA RACINE, posée par `sendError()`
 *     (`services/gateway/src/utils/response.ts`, `details` étalé) : la forme
 *     des refus APPLICATIFS (`register.ts` catch, `isRegistrationRefusal`).
 *  2. `envelope.details` — un TABLEAU `{ field, message }[]`, posé par
 *     `schemaValidationErrorResponse()` (`services/gateway/src/utils/schema-validation-error.ts`) :
 *     la forme des refus AJV (le body ne respecte même pas le schéma JSON de
 *     la route, avant que le handler ne s'exécute — `server.ts`, « Refus de
 *     SCHÉMA »). Vérifié en direct : `POST /auth/register` avec un mot de
 *     passe de 5 caractères contre `gate.staging.meeshy.me` rend
 *     `{ details: [{ field: 'password', message: '…' }] }`, SANS `field` à
 *     la racine — la première forme seule aurait laissé ce refus tomber au
 *     bandeau générique plutôt que sous le champ mot de passe.
 *
 * Le PREMIER élément du tableau gagne — même règle que
 * `SignupViewModel.applyRejection` (iOS) : « le premier message qui vise un
 * champ gagne ».
 */
function fieldOf(envelope: Record<string, unknown>): string | undefined {
  if (typeof envelope.field === 'string') return envelope.field;
  if (Array.isArray(envelope.details)) {
    const first = envelope.details[0];
    if (first !== null && typeof first === 'object' && typeof (first as { field?: unknown }).field === 'string') {
      return (first as { field: string }).field;
    }
  }
  return undefined;
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
    /**
     * UN CORPS `FormData` (#5668, upload multipart) NE POSE JAMAIS SON PROPRE
     * `Content-Type` : c'est le NAVIGATEUR qui doit l'écrire, `boundary`
     * compris — un en-tête posé ICI le fige SANS le `boundary`, et la
     * passerelle (`@fastify/multipart`) ne peut alors plus découper les
     * parties (`upload.ts:59-207`, `consumes: ['multipart/form-data']`).
     */
    const formBody = req.body instanceof FormData ? req.body : undefined;
    const headers: Record<string, string> = {
      ...credentialHeaders(credential),
      ...(locale ? { 'X-Device-Locale': locale } : {}),
      ...(req.body !== undefined && formBody === undefined ? { 'Content-Type': 'application/json' } : {}),
      ...req.headers,
    };

    const { signal, timeoutSignal } = composeSignal(req.signal, req.timeoutMs ?? timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: req.method,
        headers,
        ...(signal !== undefined ? { signal } : {}),
        ...(req.body !== undefined ? { body: formBody ?? JSON.stringify(req.body) } : {}),
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
        status: response.status,
        ...(envelope.pagination !== undefined ? { pagination: envelope.pagination as PaginationMeta } : {}),
        ...(envelope.cursorPagination !== undefined
          ? { cursorPagination: envelope.cursorPagination as CursorPaginationMeta }
          : {}),
      };
    }

    const field = fieldOf(envelope);
    return {
      ok: false,
      status: response.status,
      error: typeof envelope.error === 'string' ? envelope.error : GENERIC_ERROR(response.status),
      ...(typeof envelope.code === 'string' ? { code: envelope.code } : {}),
      ...(field !== undefined ? { field } : {}),
      ...(typeof envelope.retryAfter === 'number' ? { retryAfter: envelope.retryAfter } : {}),
    };
  }

  const transport = (({ method, path, body }) => request({ method, path, body })) as HttpTransport;
  transport.request = request;
  return transport;
}
