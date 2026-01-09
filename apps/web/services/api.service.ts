import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';
import { authService } from './auth.service';
import type { ApiResponse, ApiError } from '@meeshy/shared/types';

interface ApiConfig {
  timeout: number;
  headers: Record<string, string>;
}

class ApiServiceError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiServiceError';
    this.status = status;
    this.code = code;
  }
}

class ApiService {
  private config: ApiConfig;
  private refreshPromise: Promise<boolean> | null = null;
  private isRefreshing = false;

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      timeout: 15000, // 15 seconds - augmenté pour les requêtes complexes (conversations, traductions)
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
  }

  /**
   * Vérifie si le token est proche de l'expiration (dans les 5 minutes)
   * et le rafraîchit préventivement si nécessaire
   */
  private async ensureTokenFresh(): Promise<void> {
    const token = authManager.getAuthToken();
    if (!token) return;

    // Vérifier si le token expire bientôt (dans les 5 minutes)
    const payload = authManager.decodeJWT(token);
    if (!payload || !payload.exp) return;

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;

    // Si le token expire dans moins de 5 minutes, le rafraîchir
    if (expiresIn < 300) {
      console.log('[API_SERVICE] Token expires soon, refreshing...');
      await this.refreshAuthToken();
    }
  }

  /**
   * Rafraîchit le token d'authentification
   * Utilise un pattern pour éviter les refreshs multiples simultanés
   */
  private async refreshAuthToken(): Promise<boolean> {
    // Si un refresh est déjà en cours, attendre sa fin
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await authService.refreshToken();

        if (response.success) {
          console.log('[API_SERVICE] Token refreshed successfully');
          return true;
        }

        console.warn('[API_SERVICE] Token refresh failed, logging out...');
        // Si le refresh échoue, déconnecter l'utilisateur
        authManager.clearAllSessions();

        // Rediriger vers la page de connexion
        if (typeof window !== 'undefined') {
          window.location.href = '/login?expired=true';
        }

        return false;
      } catch (error) {
        console.error('[API_SERVICE] Token refresh error:', error);
        // En cas d'erreur, déconnecter l'utilisateur
        authManager.clearAllSessions();

        if (typeof window !== 'undefined') {
          window.location.href = '/login?expired=true';
        }

        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    // Vérifier et rafraîchir le token si nécessaire (sauf pour les endpoints d'auth)
    if (!endpoint.includes('/auth/') && !endpoint.includes('/anonymous/')) {
      await this.ensureTokenFresh();
    }

    const url = buildApiUrl(endpoint);

    // Get token from AuthManager (source unique de vérité)
    const token = authManager.getAuthToken();

    // Pour les requêtes DELETE/POST/PUT/PATCH sans body, ne pas inclure Content-Type
    const shouldExcludeContentType = (options.method === 'DELETE' || options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH') && !options.body;
    let defaultHeaders = { ...this.config.headers };

    // Supprimer complètement le Content-Type pour les requêtes sans body
    if (shouldExcludeContentType) {
      delete defaultHeaders['Content-Type'];
    }

    const headers = {
      ...defaultHeaders,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

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
        // Si la réponse n'est pas du JSON valide, utiliser le texte brut
        const text = await response.text();
        throw new ApiServiceError(
          `Erreur serveur (${response.status}): ${text || 'Réponse invalide'}`,
          response.status,
          'PARSE_ERROR'
        );
      }

      // Intercepter les erreurs 401 (Unauthorized) et tenter un refresh
      if (response.status === 401 && !isRetry && !endpoint.includes('/auth/')) {
        console.log('[API_SERVICE] 401 Unauthorized, attempting token refresh...');

        const refreshed = await this.refreshAuthToken();

        if (refreshed) {
          // Réessayer la requête avec le nouveau token
          console.log('[API_SERVICE] Token refreshed, retrying request...');
          return this.request<T>(endpoint, options, true);
        }

        // Si le refresh échoue, laisser l'erreur se propager
        throw new ApiServiceError(
          'Session expirée, veuillez vous reconnecter',
          401,
          'TOKEN_EXPIRED'
        );
      }

      if (!response.ok) {
        throw new ApiServiceError(
          data.message || data.error || `Erreur serveur (${response.status})`,
          response.status,
          data.code
        );
      }

      // Return shared ApiResponse format
      return {
        success: true,
        data,
        message: data.message,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiServiceError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        console.error('❌ [API-SERVICE] Timeout de la requête:', { endpoint: url, timeout: this.config.timeout });
        throw new ApiServiceError(`Timeout de la requête (${this.config.timeout}ms) - ${endpoint}`, 408, 'TIMEOUT');
      }

      throw new ApiServiceError(
        'Erreur de connexion au serveur',
        0,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Perform a GET request with optional query parameters
   *
   * @param endpoint - API endpoint path (e.g., '/admin/users')
   * @param params - Query string parameters as a flat key-value object (NOT wrapped in {params: ...})
   * @param options - Additional options (abort signal, custom headers)
   *
   * @example
   * // Correct usage:
   * apiService.get('/users', { page: 1, limit: 20, search: 'john' })
   * // → GET /users?page=1&limit=20&search=john
   *
   * @example
   * // WRONG - Do NOT wrap in {params: ...}:
   * apiService.get('/users', { params: { page: 1 } }) // ✗ This will NOT work
   *
   * @returns Promise resolving to ApiResponse<T>
   */
  async get<T>(endpoint: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      url += `?${searchParams.toString()}`;
    }

    return this.request<T>(url, {
      method: 'GET',
      signal: options?.signal,
      headers: options?.headers
    });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Méthode pour uploader des fichiers
  async uploadFile<T>(endpoint: string, file: File, additionalData?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    const token = authManager.getAuthToken();

    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        // Ne pas spécifier Content-Type pour FormData
      },
    });
  }

  /**
   * Fetch binary data (audio, images, etc.) as Blob
   * Returns blob data that can be used to create object URLs
   *
   * @param endpoint - API endpoint path (e.g., '/attachments/file/...')
   * @param options - Additional options (abort signal, custom headers)
   * @returns Promise resolving to Blob
   *
   * @example
   * const blob = await apiService.getBlob('/attachments/file/2025/11/audio.m4a')
   * const objectUrl = URL.createObjectURL(blob)
   */
  async getBlob(endpoint: string, options?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<Blob> {
    const url = buildApiUrl(endpoint);
    const token = authManager.getAuthToken();

    const headers = {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: options?.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `Erreur serveur (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If not JSON, use default message
        }

        throw new ApiServiceError(
          errorMessage,
          response.status,
          'BLOB_FETCH_ERROR'
        );
      }

      const blob = await response.blob();
      return blob;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiServiceError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        console.error('❌ [API-SERVICE] Timeout de la requête blob:', { endpoint: url, timeout: this.config.timeout });
        throw new ApiServiceError(`Timeout de la requête blob (${this.config.timeout}ms) - ${endpoint}`, 408, 'TIMEOUT');
      }

      throw new ApiServiceError(
        'Erreur de connexion au serveur',
        0,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * @deprecated Utiliser authManager.setCredentials() à la place
   * Conservé pour compatibilité legacy
   */
  setAuthToken(token: string | null) {
    console.warn('[API_SERVICE] setAuthToken is deprecated. Use authManager.setCredentials() instead');
    // Legacy: Ne rien faire, authManager gère maintenant
  }

  /**
   * @deprecated Utiliser authManager.getAuthToken() à la place
   * Conservé pour compatibilité legacy
   */
  getAuthToken(): string | null {
    return authManager.getAuthToken();
  }
}

// Instance singleton
export const apiService = new ApiService();
export { ApiService, ApiServiceError };
export type { ApiResponse, ApiError, ApiConfig };

// Re-export shared types for convenience
export type { PaginationMeta } from '@meeshy/shared/types';
