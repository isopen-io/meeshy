import { resolveRequestCredential, type RequestCredential } from './api-credential';
import { buildApiUrl } from '@/lib/config';
import { getDeviceLocaleHeaders } from '@/lib/device-locale';
import { getGeolocationHeaders } from '@/lib/geolocation';
import { isJWTExpired } from '@/utils/auth';
import { authManager } from './auth-manager.service';
import { authService } from './auth.service';
import type { ApiResponse, ApiError } from '@meeshy/shared/types';

// ═══════════════════════════════════════════════════════════════════════════
// TIMEOUT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const TIMEOUT_DEFAULT = 40000;        // 40 seconds - standard requests
const TIMEOUT_SLOW_CONNECTION = 60000; // 1 minute - slow network detected
const TIMEOUT_VOICE_PROFILE = 300000;  // 5 minutes - voice profile creation (Whisper + cloning)

interface ApiConfig {
  timeout: number;
  headers: Record<string, string>;
}

// Network Information API types
interface NetworkInformation {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

class ApiServiceError extends Error {
  status: number;
  code?: string;
  /**
   * Le corps SERVI, tel quel.
   *
   * #4487 — les champs d'appoint d'un refus vivent à la racine de l'enveloppe
   * (`expectedPolicyVersion` sur un 409 de consentement, `suggestedNickname` sur
   * un 409 d'admission, `issues` / `allowedPurposes` sur un 400). Ils étaient
   * lus, puis JETÉS ici : seuls `message`, `status` et `code` survivaient, si
   * bien qu'aucun appelant web ne pouvait s'en servir. Une passerelle qui prend
   * la peine de dire QUELLE version elle attendait n'a corrigé personne tant
   * que le client jette la réponse.
   */
  body?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, body?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiServiceError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

class ApiService {
  private config: ApiConfig;
  private refreshPromise: Promise<boolean> | null = null;
  private isRefreshing = false;

  private slowConnectionCache: { value: boolean; timestamp: number } | null = null;
  private readonly SLOW_CONNECTION_CACHE_TTL = 30000;

  private headersCache = new Map<string, Record<string, string>>();

  private static readonly METHODS_WITH_OPTIONAL_BODY = new Set(['DELETE', 'POST', 'PUT', 'PATCH']);

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      timeout: TIMEOUT_DEFAULT,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
  }

  private isSlowConnection(): boolean {
    const now = Date.now();
    if (this.slowConnectionCache && (now - this.slowConnectionCache.timestamp) < this.SLOW_CONNECTION_CACHE_TTL) {
      return this.slowConnectionCache.value;
    }

    if (typeof navigator === 'undefined') {
      this.slowConnectionCache = { value: false, timestamp: now };
      return false;
    }

    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    let isSlow = false;
    if (connection) {
      isSlow = connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g';
    }

    this.slowConnectionCache = { value: isSlow, timestamp: now };
    return isSlow;
  }

  /**
   * `credential` porte l'en-tête ET la valeur, jamais un jeton nu : un visiteur
   * sans compte s'annonce par `X-Session-Token`, pas par `Bearer`. Recevoir un
   * `string` obligeait ce niveau à SUPPOSER le protocole, et il supposait
   * toujours le mauvais pour les anonymes.
   *
   * La clé de cache porte le NOM de l'en-tête pour la même raison : deux
   * identités différentes ne doivent jamais partager une entrée.
   */
  private buildHeaders(
    method: string,
    hasBody: boolean,
    credential: RequestCredential | null,
    customHeaders?: Record<string, string>
  ): Record<string, string> {
    const cacheKey = `${method}-${hasBody}-${credential?.header ?? 'none'}-${JSON.stringify(customHeaders || {})}`;
    if (this.headersCache.has(cacheKey)) {
      return this.headersCache.get(cacheKey)!;
    }

    const headers: Record<string, string> = {
      ...this.config.headers,
      'X-Canvas-Caps': '3',
      ...getDeviceLocaleHeaders(),
      ...getGeolocationHeaders(),
      ...customHeaders,
    };

    if (!hasBody) {
      delete headers['Content-Type'];
    }

    if (credential) {
      headers[credential.header] = credential.value;
    }

    this.headersCache.set(cacheKey, headers);
    if (this.headersCache.size > 50) {
      const firstKey = this.headersCache.keys().next().value;
      if (firstKey) this.headersCache.delete(firstKey);
    }

    return headers;
  }

  /**
   * Rafraîchit le jeton d'authentification, en coalesçant les appels
   * concurrents sur une seule requête réseau. Public : c'est l'UNIQUE point
   * de rafraîchissement du dépôt web — les chemins qui contournent `request()`
   * (upload XHR brut, etc.) doivent l'appeler plutôt que de réimplémenter la
   * logique de rafraîchissement.
   */
  async refreshAuthToken(): Promise<boolean> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await authService.refreshToken();
        return !!response.success;
      } catch {
        // Session persists across refresh failures. Only an explicit
        // user-initiated logout may clear credentials. Cached data keeps
        // the UI alive and the next 401 will retry the refresh silently.
        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit & { timeout?: number } = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const url = buildApiUrl(endpoint);
    const requestTimeout = options.timeout || (this.isSlowConnection() ? TIMEOUT_SLOW_CONNECTION : this.config.timeout);
    let token = authManager.getAuthToken();

    if (token && isJWTExpired(token) && !isRetry && !endpoint.includes('/auth/')) {
      const refreshed = await this.refreshAuthToken();
      if (refreshed) {
        token = authManager.getAuthToken();
      } else {
        throw new ApiServiceError('Session expirée, veuillez vous reconnecter', 401, 'TOKEN_EXPIRED');
      }
    }

    const shouldExcludeContentType = ApiService.METHODS_WITH_OPTIONAL_BODY.has(options.method || '') && !options.body;

    // Un jeton de compte présent l'emporte ; sinon on retombe sur la session
    // anonyme, avec SON en-tête. Sans cette résolution, tout appel d'un
    // visiteur sans compte partait sans identifiant.
    const credential: RequestCredential | null = token
      ? { header: 'Authorization', value: `Bearer ${token}` }
      : resolveRequestCredential();

    const headers = this.buildHeaders(
      options.method || 'GET',
      !shouldExcludeContentType,
      credential,
      options.headers as Record<string, string> | undefined
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text();
        throw new ApiServiceError(`Erreur serveur (${response.status}): ${text || 'Réponse invalide'}`, response.status, 'PARSE_ERROR');
      }

      if (response.status === 401 && !isRetry && !endpoint.includes('/auth/')) {
        const refreshed = await this.refreshAuthToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }
        throw new ApiServiceError('Session expirée, veuillez vous reconnecter', 401, 'TOKEN_EXPIRED');
      }

      if (!response.ok) {
        if (response.status === 403 && endpoint.match(/\/conversations\/[a-f0-9]{24}(?:\/|$)/)) {
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              window.location.href = '/';
            }, 100);
          }
        }
        throw new ApiServiceError(data.message || data.error || `Erreur serveur (${response.status})`, response.status, data.code, data);
      }

      return {
        success: true,
        data,
        message: data.message,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiServiceError(`Timeout (${requestTimeout}ms) - ${endpoint}`, 408, 'TIMEOUT');
      }
      throw new ApiServiceError('Erreur de connexion au serveur', 0, 'NETWORK_ERROR');
    }
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (params) {
      const validEntries = Object.entries(params).filter(([_, value]) => value !== undefined && value !== null);
      if (validEntries.length > 0) {
        const searchParams = new URLSearchParams(validEntries.map(([key, value]) => [key, String(value)]));
        url += `?${searchParams.toString()}`;
      }
    }
    return this.request<T>(url, { method: 'GET', signal: options?.signal, headers: options?.headers });
  }

  async post<T>(endpoint: string, data?: unknown, options?: { timeout?: number }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined, timeout: options?.timeout });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body: data ? JSON.stringify(data) : undefined });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async uploadFile<T>(endpoint: string, file: File, additionalData?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }
    // Même règle que `request` : un visiteur sans compte s'annonce par
    // `X-Session-Token`. Poser un `Bearer` en dur ici lui refusait tout envoi.
    const credential = resolveRequestCredential();
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        ...getDeviceLocaleHeaders(),
        ...(credential && { [credential.header]: credential.value }),
      },
    });
  }

  async getBlob(endpoint: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<Blob> {
    const url = buildApiUrl(endpoint);
    const blobCredential = resolveRequestCredential();
    const headers = {
      ...getDeviceLocaleHeaders(),
      ...(blobCredential && { [blobCredential.header]: blobCredential.value }),
      ...options?.headers,
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, { method: 'GET', headers, signal: options?.signal || controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorMessage = `Erreur serveur (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {}
        throw new ApiServiceError(errorMessage, response.status, 'BLOB_FETCH_ERROR');
      }
      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiServiceError(`Timeout (${this.config.timeout}ms) - ${endpoint}`, 408, 'TIMEOUT');
      }
      throw new ApiServiceError('Erreur de connexion au serveur', 0, 'NETWORK_ERROR');
    }
  }

  setAuthToken(token: string | null) {}
  getAuthToken(): string | null { return authManager.getAuthToken(); }
}

export const apiService = new ApiService();
export { ApiService, ApiServiceError };
export type { ApiResponse, ApiError, ApiConfig };
export { TIMEOUT_VOICE_PROFILE };
