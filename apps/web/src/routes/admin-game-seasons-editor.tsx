import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminFormActions, AdminFormError, AdminFormStatus, AdminTextArea } from '@/components/admin/form';
import { AdminFicheSection } from '@/components/admin/fiche';
import { hasIssues, draftOfRow, editBody, validateDraft, type DraftIssues, type SeasonDraft, ADMIN_SEASON_CALENDAR_QUERY_KEY } from '@/lib/admin/game-season-form';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_GAME_SEASONS_QUERY_KEY,
  proposeSeason,
  saveAdminSeason,
  type AdminSeasonList,
  type AdminSeasonRow,
} from '@/lib/api/admin-game-seasons';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { SeasonFields } from '@/routes/admin-game-seasons-fields';
import { seasonFailureText } from '@/routes/admin-game-seasons-errors';

/**
 * **MODIFIER UNE SAISON À VENIR** (#10232) — programmer (un lundi), décaler, mettre en pause ou reprendre, régler le
 * thème, les points d'étape et les textes en sept langues. Le brouillon est jugé par la loi partagée AVANT l'envoi ;
 * l'envoi porte la révision lue et les seuls champs changés ; un refus (409 la révision a bougé, 422 la loi refuse) se
 * lit en clair sous le formulaire.
 *
 * « Proposer avec l'IA » demande une proposition : elle revient EN ATTENTE, dans la section des propositions, et rien
 * n'est appliqué à la saison avant la validation d'un humain.
 */

const NO_ISSUES: DraftIssues = { copyFields: [] };

function AiBox({ language, deps, number }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly number: number }) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState('');
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [text, setText] = useState('');

  const ask = async (): Promise<void> => {
    setPhase('saving');
    setText(translateAdmin(language, 'admin.gameSeasons.ai.asking'));
    const result = await proposeSeason({ ...deps, number, brief });
    if (!result.ok) {
      setPhase('error');
      setText(seasonFailureText(language, result));
      return;
    }
    setPhase('saved');
    setText(translateAdmin(language, 'admin.gameSeasons.ai.done'));
    await queryClient.invalidateQueries({ queryKey: ADMIN_GAME_SEASONS_QUERY_KEY });
  };

  return (
    <section aria-labelledby="gameseasons-ai-title" data-gameseasons-ai className="grid gap-3 rounded-card p-4" style={{ border: '1px solid var(--color-edge)' }}>
      <h3 id="gameseasons-ai-title" className="text-body font-semibold">
        {translateAdmin(language, 'admin.gameSeasons.ai.title')}
      </h3>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateAdmin(language, 'admin.gameSeasons.ai.hint')}
      </p>
      <AdminTextArea
        id="gameseasons-ai-brief"
        label={translateAdmin(language, 'admin.gameSeasons.ai.brief')}
        value={brief}
        maxLength={500}
        onValue={setBrief}
        rows={2}
        note={translateAdmin(language, 'admin.gameSeasons.ai.briefNote', { count: String([...brief].length) })}
        data={{ 'data-gameseasons-ai-brief': '' }}
      />
      <AdminFormActions
        language={language}
        primary={{
          label: translateAdmin(language, phase === 'saving' ? 'admin.gameSeasons.ai.asking' : 'admin.gameSeasons.ai.ask'),
          busy: phase === 'saving',
          onClick: () => void ask(),
          data: { 'data-gameseasons-ai-ask': '' },
        }}
      />
      <AdminFormStatus phase={phase} text={text} data={{ 'data-gameseasons-ai-status': phase }} />
    </section>
  );
}

export function SeasonEditor({
  language,
  deps,
  list,
  row,
  onClose,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly list: AdminSeasonList;
  readonly row: AdminSeasonRow;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [resetToken, setResetToken] = useState(0);
  const [draft, setDraft] = useState<SeasonDraft>(() => draftOfRow(row));
  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);

  const issues = shown ? validateDraft(draft, list.now) : NO_ISSUES;

  const edit = (next: SeasonDraft): void => {
    setDraft(next);
    if (phase !== 'saving') {
      setPhase('idle');
      setMessage('');
      setConflict(false);
    }
  };

  const reload = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_GAME_SEASONS_QUERY_KEY });
    setResetToken((token) => token + 1);
    setConflict(false);
    setPhase('idle');
    setMessage('');
    setShown(false);
  };

  const save = async (): Promise<void> => {
    setShown(true);
    if (hasIssues(validateDraft(draft, list.now))) {
      setPhase('error');
      setMessage(translateAdmin(language, 'admin.gameSeasons.fixIssues'));
      return;
    }
    const body = editBody(row, draft, list.revision);
    if (Object.keys(body).length === 1) {
      setPhase('idle');
      setMessage(translateAdmin(language, 'admin.gameSeasons.nothingToSave'));
      return;
    }
    setPhase('saving');
    setMessage(translateAdmin(language, 'admin.gameSeasons.saving'));
    const result = await saveAdminSeason({ ...deps, number: row.number, body });
    if (!result.ok) {
      setPhase('error');
      setMessage(seasonFailureText(language, result));
      setConflict(result.error === 'revision-conflict');
      return;
    }
    setPhase('saved');
    setMessage(translateAdmin(language, 'admin.gameSeasons.saved', { number: String(row.number), revision: String(result.data.revision) }));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_GAME_SEASONS_QUERY_KEY }),
      /* Le calendrier que LES JOUEURS lisent : sur ce poste, la copie gardée se relit dès maintenant. */
      queryClient.invalidateQueries({ queryKey: ADMIN_SEASON_CALENDAR_QUERY_KEY }),
    ]);
  };

  return (
    <AdminFicheSection id="gameseasons-editor" title={translateAdmin(language, 'admin.gameSeasons.editor.title', { number: String(row.number) })}>
      <form
        key={`${row.number}:${resetToken}`}
        className="grid gap-4"
        data-gameseasons-editor={row.number}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateAdmin(language, 'admin.gameSeasons.editor.hint')}
        </p>
        <SeasonFields language={language} draft={draft} onDraft={edit} issues={issues} now={list.now} showStatus idPrefix="gameseasons-edit" />
        <AdminFormError text={phase === 'error' ? message : ''} data={{ 'data-gameseasons-error': '' }} />
        <AdminFormError text={phase === 'idle' ? message : ''} tone="neutral" data={{ 'data-gameseasons-notice': '' }} />
        <AdminFormStatus phase={phase === 'error' ? 'idle' : phase} text={message} data={{ 'data-gameseasons-status': phase }} />
        <AdminFormActions
          language={language}
          onCancel={onClose}
          secondary={conflict ? [{ id: 'reload', label: translateAdmin(language, 'admin.gameSeasons.reload'), onClick: () => void reload(), data: { 'data-gameseasons-reload': '' } }] : []}
          primary={{
            label: translateAdmin(language, phase === 'saving' ? 'admin.gameSeasons.saving' : 'admin.gameSeasons.save'),
            type: 'submit',
            busy: phase === 'saving',
            data: { 'data-gameseasons-save': '' },
          }}
        />
      </form>
      <AiBox language={language} deps={deps} number={row.number} />
    </AdminFicheSection>
  );
}
