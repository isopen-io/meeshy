import * as z from 'zod/mini';

import type { DeliverFileOutcome } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost, type FileDeliveryHost } from '@/lib/media/file-delivery-host';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **LE PORT DE L'EXPORT DE DONNÉES** (#6725, section « Données ») —
 * `GET /api/v1/me/export`, la route RGPD déjà servie et testée côté gateway
 * (`services/gateway/src/routes/me/export.ts`, #3633). La v2 ne demande que le
 * JSON complet (`format=json`, le défaut de la route) : c'est la forme la plus
 * fidèle, et un CSV par section n'a pas de consommateur ici — le proposer
 * comme second bouton sans que rien ne le distingue du premier serait un
 * contrôle sans effet propre (loi 4).
 *
 * **La charge n'est PAS reconstruite depuis un schéma détaillé.** La route
 * sert dix sections polymorphes (profil, messages, contacts, posts, stories,
 * commentaires, réactions, médias, profil vocal, sessions) dont la forme
 * évolue à son propre rythme (#3633 l'a étendue trois fois déjà). Revalider
 * chaque champ ici dupliquerait le contrat de la route et le ferait dériver
 * au premier champ qu'elle ajoute sans qu'on y pense. Le port ne vérifie que
 * ce dont l'écran a besoin — une date d'export lisible — et RESTITUE le reste
 * tel que servi : c'est le fichier téléchargé qui doit être complet, jamais
 * une projection.
 */

export type DataExportDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type DataExportResult = {
  /** La réponse SERVIE, telle quelle — c'est elle qui part dans le fichier téléchargé. */
  readonly raw: Readonly<Record<string, unknown>>;
  readonly exportDate: string;
};

const Envelope = z.object({ exportDate: z.string() });

export async function requestDataExport(deps: DataExportDeps): Promise<ApiResult<DataExportResult>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDataExport } = await import('./fixtures-data-export');
    return { ok: true, data: fixtureDataExport() };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: '/api/v1/me/export?format=json' });
  if (!result.ok) return result;
  const parsed = Envelope.safeParse(result.data);
  if (!parsed.success || result.data === null || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return unreadableFailure('Export de données');
  }
  return { ok: true, data: { raw: result.data as Readonly<Record<string, unknown>>, exportDate: parsed.data.exportDate } };
}

/**
 * Le nom de fichier — daté du jour de l'export, jamais d'un identifiant
 * opaque : c'est ce qui permet à quelqu'un qui exporte deux fois de distinguer
 * les deux fichiers dans son dossier de téléchargements sans les ouvrir.
 */
export function exportFileName(exportDate: string): string {
  const parsed = new Date(exportDate);
  const day = Number.isNaN(parsed.getTime()) ? exportDate.slice(0, 10) : parsed.toISOString().slice(0, 10);
  return `meeshy-export-${day}.json`;
}

const JSON_TYPE = 'application/json';

/**
 * La livraison du fichier (#7864) — par le PORTAIL, jamais par une ancre en
 * dur : ni `@capacitor/android` ni `@capacitor/ios` 8.5.1 ne branchent le
 * téléchargement de leur WebView, et l'ancre y était un clic sans effet
 * suivi d'un « Export terminé ». Le portail tente le partage de fichier
 * (feuille du système, pont `MeeshyShare.shareFile` sur Android), puis
 * l'ancre quand l'hôte en a une, et dit ce qui s'est réellement passé.
 * Le portail vit dans le chunk à la demande `story_export` : il se charge au
 * geste, jamais avec l'écran. Séparée de l'écran pour rester injectable
 * (`DataExportPageDeps.download`).
 */
export async function deliverJsonFile(
  fileName: string,
  jsonText: string,
  host: FileDeliveryHost = browserFileDeliveryHost(),
): Promise<DeliverFileOutcome> {
  const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
  const portal = fileDeliveryPortal(host);
  if (portal === null) return 'unavailable';
  return portal.deliver(new Blob([jsonText], { type: JSON_TYPE }), fileName, JSON_TYPE);
}
