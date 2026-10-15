import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminFormActions, AdminFormError } from '@/components/admin/form';
import { INK2 } from '@/components/admin/tone';
import { copyText, downloadTextFile } from '@/lib/admin/download-text';
import type { AdminDeps } from '@/lib/api/admin';
import { exportSeasonAppEvents, type SeasonAppEventsExport } from '@/lib/api/admin-game-seasons';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { appEventFaultText } from '@/routes/admin-game-seasons-errors';

/**
 * **L'EXPORT `store.app_events`** (#10233) — le bloc YAML que andp pousse à App Store Connect : les prochaines saisons
 * annoncées comme événements in-app (`NEW_SEASON`). Il se télécharge (`app-events.yaml`) ET s'affiche, avec un bouton
 * copier ; les événements en défaut sont nommés avant tout envoi à Apple. Le texte vient du JSON de l'export — la
 * passerelle sert aussi la pièce jointe `app-events.yaml`, mais le même texte n'a pas besoin d'un second appel.
 */

const EXPORT_COUNT = 3;
/** Le nom que la pièce jointe de la passerelle porte (`andp-app-events-r<révision>.yaml`) ; sans révision, un nom neutre. */
const fileNameOf = (revision: number | null): string => (revision === null ? 'app-events.yaml' : `andp-app-events-r${revision}.yaml`);

export function ExportSection({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const [exported, setExported] = useState<SeasonAppEventsExport | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = useMutation({
    mutationFn: async (): Promise<void> => {
      setError('');
      setNote('');
      const result = await exportSeasonAppEvents({ ...deps, count: EXPORT_COUNT });
      if (!result.ok) {
        setExported(null);
        setError(translateAdmin(language, 'admin.gameSeasons.export.failed'));
        return;
      }
      setExported(result.data);
    },
  });

  const faulty = exported === null ? [] : Object.entries(exported.faults).filter(([, list]) => list.length > 0);

  return (
    <AdminFicheSection id="gameseasons-export" title={translateAdmin(language, 'admin.gameSeasons.export.title')}>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.gameSeasons.export.hint')}
      </p>
      <AdminFormActions
        language={language}
        primary={{
          label: translateAdmin(language, run.isPending ? 'admin.gameSeasons.export.running' : 'admin.gameSeasons.export.run'),
          busy: run.isPending,
          onClick: () => run.mutate(),
          data: { 'data-gameseasons-export': '' },
        }}
      />
      <AdminFormError text={error} data={{ 'data-gameseasons-export-error': '' }} />
      {exported === null ? null : (
        <div className="grid gap-3" data-gameseasons-export-result>
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.gameSeasons.export.events', { count: String(exported.events.length) })}
          </p>
          {faulty.length === 0 ? null : (
            <div role="alert" data-gameseasons-export-faults>
              <p className="text-caption font-semibold" style={{ color: 'var(--color-danger)' }}>
                {translateAdmin(language, 'admin.gameSeasons.export.faultsTitle')}
              </p>
              <ul className="list-disc ps-5 text-caption" style={{ color: 'var(--color-danger)' }}>
                {faulty.map(([key, list]) => (
                  <li key={key}>
                    <span dir="ltr" className="font-medium">
                      {key}
                    </span>{' '}
                    — {list.map((fault) => appEventFaultText(language, fault)).join(' ; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <pre
            dir="ltr"
            tabIndex={0}
            aria-label={translateAdmin(language, 'admin.gameSeasons.export.yamlLabel')}
            data-gameseasons-yaml
            className="max-h-96 overflow-auto rounded-card p-3 text-caption"
            style={{ border: '1px solid var(--color-edge)', backgroundColor: 'var(--color-ios-card)', tabSize: 2 }}
          >
            {exported.yaml}
          </pre>
          <AdminFormActions
            language={language}
            secondary={[
              {
                id: 'copy',
                label: translateAdmin(language, 'admin.gameSeasons.export.copy'),
                onClick: () => {
                  void copyText(exported.yaml).then((ok) => setNote(translateAdmin(language, ok ? 'admin.gameSeasons.export.copied' : 'admin.gameSeasons.export.copyFailed')));
                },
                data: { 'data-gameseasons-yaml-copy': '' },
              },
            ]}
            primary={{
              label: translateAdmin(language, 'admin.gameSeasons.export.download'),
              onClick: () => {
                void downloadTextFile({ name: fileNameOf(exported.revision), text: exported.yaml }).then((outcome) =>
                  setNote(outcome === 'cancelled' ? '' : translateAdmin(language, outcome === 'delivered' ? 'admin.gameSeasons.export.downloaded' : 'admin.gameSeasons.export.downloadFailed')),
                );
              },
              data: { 'data-gameseasons-yaml-download': '' },
            }}
          />
          <p role="status" aria-live="polite" className="text-caption" style={{ color: INK2 }} data-gameseasons-export-note>
            {note}
          </p>
        </div>
      )}
    </AdminFicheSection>
  );
}
