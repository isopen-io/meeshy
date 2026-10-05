import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { changesOf, draftOf, type AgentDraft, type AgentFieldSpec, type AgentServed } from '@/lib/admin/agent-settings-form';
import { AGENT_ROOT_KEY } from '@/lib/api/admin-agent';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

/**
 * **LES PIÈCES COMMUNES DES GESTES DE L'AGENT** (lot Agent complet) — un champ
 * de réglage dessiné d'après sa table (`agent-settings-form.ts`), le formulaire
 * qui n'envoie que ce qui change, et le geste écrit : annonce accessible du
 * résultat, relecture de TOUT l'état de l'agent (`AGENT_ROOT_KEY`), et
 * confirmation (`AdminConfirmSheet`) pour ce qui détruit.
 *
 * ## L'annonce vit DANS la modale
 *
 * Une modale (`<dialog>.showModal()`) rend l'arrière-plan inerte : une région
 * vivante restée derrière elle ne serait pas lue. Chaque modale porte donc la
 * sienne — `useAgentGesture().announcement`.
 *
 * ## Un refus se dit avec les mots de la passerelle
 *
 * Un 400 de la passerelle NOMME ce qui ne va pas (un motif de sujet dangereux,
 * des bornes) : il est rendu tel quel sous le formulaire et annoncé. Un échec
 * sans message (réseau) retombe sur la phrase neutre `admin.agent.failed`.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const FIELD_STYLE = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND } as const;
const FIELD_CLASS = `w-full rounded-chip px-3 text-body ${FOCUS}`;

/** Les fournisseurs sont des NOMS PROPRES : ils ne se traduisent pas. */
const PROVIDER_NAMES: Readonly<Record<string, string>> = { openai: 'OpenAI', anthropic: 'Anthropic' };

export const providerName = (code: string): string => PROVIDER_NAMES[code] ?? code;

export function failureMessage(language: AdminLanguage, failure: { readonly status: number; readonly error: string }): string {
  return failure.status > 0 && failure.error.trim() !== ''
    ? translateAdmin(language, 'admin.agentPanel.form.failed', { error: failure.error })
    : translateAdmin(language, 'admin.agent.failed');
}

export type AgentGesture = {
  readonly busy: string | null;
  readonly error: string | null;
  /** Le refus du geste `id`, s'il est le dernier à avoir échoué — un bloc ne peint pas l'échec d'un autre. */
  readonly errorOf: (id: string) => string | null;
  readonly clear: () => void;
  /** Lance le geste ; annonce son issue ; relit l'agent ; rend `true` s'il a réussi. */
  readonly run: (id: string, act: () => Promise<ApiResult<unknown>>, success: string) => Promise<boolean>;
  readonly announce: (message: string, tone?: 'neutral' | 'error') => void;
  /** La région vivante de la modale, à poser une fois dedans. */
  readonly announcement: ReactNode;
};

export function useAgentGesture(language: AdminLanguage): AgentGesture {
  const queryClient = useQueryClient();
  const announcer = useLiveAnnouncer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ readonly id: string; readonly message: string } | null>(null);

  const run = async (id: string, act: () => Promise<ApiResult<unknown>>, success: string): Promise<boolean> => {
    setBusy(id);
    setError(null);
    const outcome = await act();
    setBusy(null);
    if (!outcome.ok) {
      const message = failureMessage(language, outcome);
      setError({ id, message });
      announcer.announce(message, 'error');
      return false;
    }
    announcer.announce(success);
    await queryClient.invalidateQueries({ queryKey: AGENT_ROOT_KEY });
    return true;
  };

  return {
    busy,
    error: error?.message ?? null,
    errorOf: (id) => (error?.id === id ? error.message : null),
    clear: () => setError(null),
    run,
    announce: announcer.announce,
    announcement: <AdminAnnouncement text={announcer.text} />,
  };
}

/** Une demande de confirmation : ce qui va se passer, le verbe exact, et le geste à lancer. */
export type AgentConfirmRequest = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly tone: 'danger' | 'primary';
  /** La route accepte un motif (`PUT /llm`, `DELETE /reset`) : facultatif, et le rang souverain ne l'écrit pas. */
  readonly withMotive?: boolean;
  readonly act: (motive: string | null) => Promise<ApiResult<unknown>>;
  readonly success: string;
  readonly after?: () => void;
};

export function useAgentConfirm(language: AdminLanguage, gesture: AgentGesture) {
  const [request, setRequest] = useState<AgentConfirmRequest | null>(null);

  const node =
    request === null ? null : (
      <AdminConfirmSheet
        language={language}
        title={request.title}
        body={request.body}
        confirmLabel={request.confirmLabel}
        tone={request.tone}
        {...(request.withMotive === true
          ? { motive: { label: translateAdmin(language, 'admin.agentPanel.motive'), minLength: 10, required: false } }
          : {})}
        busy={gesture.busy === request.id}
        error={gesture.error}
        onConfirm={(motive) =>
          void gesture.run(request.id, () => request.act(motive), request.success).then((done) => {
            if (!done) return;
            setRequest(null);
            request.after?.();
          })
        }
        onCancel={() => {
          gesture.clear();
          setRequest(null);
        }}
      />
    );

  return { node, ask: (next: AgentConfirmRequest) => (gesture.clear(), setRequest(next)) };
}

/** Un réglage, dessiné d'après sa table : case, nombre, texte (une ou plusieurs lignes) ou liste de choix. */
export function AgentField({
  language,
  spec,
  label,
  value,
  invalid,
  onChange,
}: {
  readonly language: AdminLanguage;
  readonly spec: AgentFieldSpec;
  readonly label: string;
  readonly value: string | boolean;
  readonly invalid: boolean;
  readonly onChange: (value: string | boolean) => void;
}) {
  const id = useId();
  const anchor = { 'data-agent-field': spec.key };
  const border = invalid ? { ...FIELD_STYLE, border: '1px solid var(--color-danger)' } : FIELD_STYLE;

  if (spec.kind === 'bool') {
    return (
      <label className="flex items-center gap-3 text-body" style={{ minHeight: 44, color: INK }}>
        <input
          {...anchor}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className={`size-5 shrink-0 ${FOCUS}`}
          style={{ accentColor: BRAND, outlineColor: BRAND }}
        />
        <span className="min-w-0 break-words">{label}</span>
      </label>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const control =
    spec.kind === 'choice' ? (
      <select {...anchor} id={id} value={text} aria-invalid={invalid} onChange={(event) => onChange(event.currentTarget.value)} className={FIELD_CLASS} style={border}>
        <option value="">{translateAdmin(language, 'admin.agentPanel.form.notProvided')}</option>
        {spec.options.map((option) => (
          <option key={option} value={option}>
            {providerName(option)}
          </option>
        ))}
      </select>
    ) : spec.kind === 'text' && spec.multiline === true ? (
      <textarea
        {...anchor}
        id={id}
        rows={4}
        value={text}
        maxLength={spec.max}
        aria-invalid={invalid}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} py-2`}
        style={border}
      />
    ) : (
      <input
        {...anchor}
        id={id}
        type="text"
        {...(spec.kind === 'text' ? { maxLength: spec.max } : { inputMode: 'decimal' as const })}
        value={text}
        aria-invalid={invalid}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} ${spec.kind === 'text' ? '' : 'tabular-nums'}`.trim()}
        style={border}
      />
    );

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-caption font-medium" style={{ color: INK2 }}>
        {label}
      </label>
      {control}
    </div>
  );
}

/**
 * LE FORMULAIRE D'UNE TABLE DE RÉGLAGES — le brouillon part du servi, « Enregistrer »
 * calcule les changements (`changesOf`), refuse en nommant les champs hors bornes, et
 * dit « aucun changement » plutôt qu'envoyer un corps vide. `extra` porte un champ hors
 * table (la clé API) ; `extraDirty` le compte comme un changement.
 */
export function AgentSettingsForm({
  id,
  language,
  specs,
  served,
  labelOf,
  saveLabel,
  busy,
  error,
  onSubmit,
  extra,
  extraDirty = false,
  disabled = false,
}: {
  readonly id: string;
  readonly language: AdminLanguage;
  readonly specs: readonly AgentFieldSpec[];
  readonly served: AgentServed;
  readonly labelOf: (key: string) => string;
  readonly saveLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (changes: Readonly<Record<string, unknown>>) => void;
  readonly extra?: ReactNode;
  readonly extraDirty?: boolean;
  readonly disabled?: boolean;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() => draftOf(specs, served));
  const [invalid, setInvalid] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = () => {
    const verdict = changesOf(specs, served, draft);
    if (!verdict.ok) {
      setInvalid(verdict.invalid);
      setNotice(translateAdmin(language, 'admin.agentPanel.form.invalid', { fields: verdict.invalid.map(labelOf).join(', ') }));
      return;
    }
    setInvalid([]);
    if (Object.keys(verdict.changes).length === 0 && !extraDirty) {
      setNotice(translateAdmin(language, 'admin.agentPanel.form.unchanged'));
      return;
    }
    setNotice(null);
    onSubmit(verdict.changes);
  };

  const message = notice ?? error;

  return (
    <form
      data-agent-form={id}
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 @lg:grid-cols-2">
        {specs.map((spec) => (
          <AgentField
            key={spec.key}
            language={language}
            spec={spec}
            label={labelOf(spec.key)}
            value={draft[spec.key] ?? ''}
            invalid={invalid.includes(spec.key)}
            onChange={(value) => setDraft((current) => ({ ...current, [spec.key]: value }))}
          />
        ))}
      </div>
      {extra}
      {message === null ? null : (
        <p role="alert" data-agent-form-error className="text-caption font-medium" style={{ color: notice !== null && invalid.length === 0 ? INK2 : 'var(--color-danger)' }}>
          {message}
        </p>
      )}
      <div className="flex justify-end">
        <AdminButton type="submit" tone="primary" busy={busy} disabled={disabled} data={{ 'data-agent-save': id }}>
          {saveLabel}
        </AdminButton>
      </div>
    </form>
  );
}
