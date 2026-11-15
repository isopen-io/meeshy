import type { DataExportResult } from './data-export';

/**
 * **LE LECTEUR DE RECETTE, SON EXPORT** (#6725) — servi par le MÊME chemin
 * que la passerelle (`data-export.ts`, garde `__FIXTURES__ && source ===
 * 'fixtures'`), élagué de tout build `VITE_DATA_SOURCE=gateway`. Une charge
 * minimale, représentative des sections que la route sert réellement — assez
 * pour que le fichier téléchargé en recette ne soit pas vide.
 */

const FIXTURE_EXPORT_DATE = '2026-09-16T08:00:00.000Z';

export function fixtureDataExport(): DataExportResult {
  return {
    exportDate: FIXTURE_EXPORT_DATE,
    raw: {
      exportDate: FIXTURE_EXPORT_DATE,
      format: 'json',
      requestedTypes: ['profile', 'messages', 'contacts'],
      profile: { id: 'demo-user', username: 'awa', displayName: 'Awa Diallo', email: 'awa@meeshy.example' },
      messages: [],
      messagesCount: 0,
      contacts: [],
      contactsCount: 0,
    },
  };
}
