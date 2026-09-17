import * as z from 'zod/mini';

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

/**
 * Le déclenchement du téléchargement — la seule partie de ce port qui touche
 * le DOM, séparée pour rester injectable (`DataExportPageDeps.download`) : un
 * témoin de comportement de l'écran n'a pas à fabriquer un vrai `Blob`.
 */
export function downloadJsonFile(fileName: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
