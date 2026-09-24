import type { PortailPartage } from '@/lib/view/invitation';

/**
 * **COPIER UNE ADRESSE, ET DIRE L'ISSUE** (#6361, #7796) — module SANS
 * dépendance lourde : la page d'accueil d'invitation (`/chat/:link`) et « Mes
 * liens » copient par le même geste, sans que la première emporte le port des
 * liens de partage. Un presse-papiers indisponible ou refusé se DIT : un geste
 * sans effet ne se tait pas.
 */

export const LINK_ANNOUNCE_MS = 4000;

export type CopyOutcome = 'copied' | 'unavailable' | 'failed';

export async function copyLinkText(url: string, portail: PortailPartage): Promise<CopyOutcome> {
  if (portail.copier === undefined) return 'unavailable';
  try {
    await portail.copier(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

