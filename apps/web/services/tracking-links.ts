/**
 * Service API pour la gestion des liens trackés
 */

import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import type {
  TrackingLink,
  TrackingLinkStatsResponse,
  CreateTrackingLinkRequest,
  CreateTrackingLinkResponse,
  RecordClickRequest,
  RecordClickResponse
} from '@meeshy/shared/types/tracking-link';

/**
 * Interface pour la réponse de récupération des liens d'un utilisateur
 */
interface GetUserTrackingLinksResponse {
  success: boolean;
  data?: {
    trackingLinks: TrackingLink[];
  };
  error?: string;
}

/**
 * Récupérer tous les liens trackés de l'utilisateur connecté
 */
export async function getUserTrackingLinks(): Promise<TrackingLink[]> {
  const token = authManager.getAuthToken();
  
  if (!token) {
    throw new Error('Non authentifié');
  }

  const response = await fetch(buildApiUrl('/api/tracking-links/user/me'), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data: GetUserTrackingLinksResponse = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Erreur lors de la récupération des liens');
  }

  return data.data.trackingLinks;
}

/**
 * Récupérer les statistiques d'un lien tracké
 */
export async function getTrackingLinkStats(
  token: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<TrackingLinkStatsResponse['data']> {
  const authToken = authManager.getAuthToken();
  
  if (!authToken) {
    throw new Error('Non authentifié');
  }

  const queryParams = new URLSearchParams();
  if (options?.startDate) {
    queryParams.append('startDate', options.startDate.toISOString());
  }
  if (options?.endDate) {
    queryParams.append('endDate', options.endDate.toISOString());
  }

  const url = buildApiUrl(`/api/tracking-links/${token}/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data: TrackingLinkStatsResponse = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Erreur lors de la récupération des statistiques');
  }

  return data.data;
}

/**
 * Créer un nouveau lien tracké
 */
export async function createTrackingLink(
  request: CreateTrackingLinkRequest
): Promise<TrackingLink> {
  const token = authManager.getAuthToken();
  
  // Pas besoin d'être authentifié pour créer un lien tracké (peut être anonyme)

  const response = await fetch(buildApiUrl('/api/tracking-links'), {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data: CreateTrackingLinkResponse = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Erreur lors de la création du lien');
  }

  return data.data.trackingLink;
}

/**
 * Enregistrer un clic sur un lien tracké
 */
export async function recordTrackingLinkClick(
  request: RecordClickRequest
): Promise<string> {
  const token = authManager.getAuthToken();

  const response = await fetch(buildApiUrl(`/api/tracking-links/${request.token}/click`), {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data: RecordClickResponse = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Erreur lors de l\'enregistrement du clic');
  }

  return data.data.originalUrl;
}

/**
 * Désactiver un lien tracké
 */
export async function deactivateTrackingLink(token: string): Promise<TrackingLink> {
  const authToken = authManager.getAuthToken();
  
  if (!authToken) {
    throw new Error('Non authentifié');
  }

  const response = await fetch(buildApiUrl(`/api/tracking-links/${token}/deactivate`), {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Erreur lors de la désactivation du lien');
  }

  return data.data.trackingLink;
}

/**
 * Supprimer un lien tracké
 */
export async function deleteTrackingLink(token: string): Promise<void> {
  const authToken = authManager.getAuthToken();
  
  if (!authToken) {
    throw new Error('Non authentifié');
  }

  const response = await fetch(buildApiUrl(`/api/tracking-links/${token}`), {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Erreur lors de la suppression du lien');
  }
}

/**
 * Copier l'URL d'un lien tracké dans le presse-papiers
 */
export async function copyTrackingLinkToClipboard(shortUrl: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(shortUrl);
    return true;
  } catch (error) {
    console.error('Erreur lors de la copie dans le presse-papiers:', error);
    return false;
  }
}
