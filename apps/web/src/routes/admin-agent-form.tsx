import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE } from '@/components/admin/tone';
import {
  changesOf,
  draftOf,
  type AgentDraft,
  type AgentDraftValue,
  type AgentFieldProblem,
  type AgentFieldSection,
  type AgentFieldSpec,
  type AgentServed,
} from '@/lib/admin/agent-settings-form';
import { AGENT_ROOT_KEY } from '@/lib/api/admin-agent';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, translateAdminMaybe, type AdminLanguage } from '@/lib/i18n-admin-catalog';
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

/** Un refus que le geste sait dire lui-même (`null` : la phrase générique). */
export type AgentFailureDescriber = (failure: { readonly status: number; readonly error: string }) => string | null;

export type AgentGesture = {
  readonly busy: string | null;
  readonly error: string | null;
  /** Le refus du geste `id`, s'il est le dernier à avoir échoué — un bloc ne peint pas l'échec d'un autre. */
  readonly errorOf: (id: string) => string | null;
  readonly clear: () => void;
  /**
   * Lance le geste ; annonce son issue ; relit l'agent ; rend `true` s'il a réussi.
   * `describe` dit un refus que le geste sait nommer mieux que la phrase générique.
   */
  readonly run: (id: string, act: () => Promise<ApiResult<unknown>>, success: string, describe?: AgentFailureDescriber) => Promise<boolean>;
  readonly announce: (message: string, tone?: 'neutral' | 'error') => void;
  /** La région vivante de la modale, à poser une fois dedans. */
  readonly announcement: ReactNode;
};

export function useAgentGesture(language: AdminLanguage): AgentGesture {
  const queryClient = useQueryClient();
  const announcer = useLiveAnnouncer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ readonly id: string; readonly message: string } | null>(null);

  const run = async (id: string, act: () => Promise<ApiResult<unknown>>, success: string, describe?: AgentFailureDescriber): Promise<boolean> => {
    setBusy(id);
    setError(null);
    const outcome = await act();
    setBusy(null);
    if (!outcome.ok) {
      const message = describe?.(outcome) ?? failureMessage(language, outcome);
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
  readonly describeFailure?: AgentFailureDescriber;
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
          void gesture.run(request.id, () => request.act(motive), request.success, request.describeFailure).then((done) => {
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

/**
 * LES MOTS D'UNE TABLE DE RÉGLAGES — libellé, phrase d'aide (quand le sens n'est
 * pas évident), titre de section et libellé d'une option. Les clés vivent sous
 * `admin.agentPanel.<préfixe>.` ; un témoin vérifie que chaque champ a son libellé
 * dans les quatre langues.
 */
export type AgentFieldVocabulary = {
  readonly label: (key: string) => string;
  readonly help?: (key: string) => string | null;
  readonly section?: (id: string) => string;
  readonly option?: (key: string, option: string) => string;
};

/** Les options nommées ailleurs : rôles et types de conversation dans le kit (`admin.enum.*`), fournisseurs en noms propres. */
const ENUM_PREFIX: Readonly<Record<string, string>> = {
  excludedRoles: 'admin.enum.role.',
  eligibleConversationTypes: 'admin.enum.conversationType.',
};

export function agentVocabulary(language: AdminLanguage, prefix: 'cfg' | 'global'): AgentFieldVocabulary {
  const root = `admin.agentPanel.${prefix}.`;
  return {
    label: (key) => translateAdminMaybe(language, `${root}${key}`) ?? key,
    help: (key) => translateAdminMaybe(language, `${root}${key}.help`),
    section: (id) => translateAdminMaybe(language, `${root}section.${id}`) ?? id,
    option: (key, option) =>
      translateAdminMaybe(language, `${root}${key}.${option}`) ??
      (ENUM_PREFIX[key] === undefined ? null : translateAdminMaybe(language, `${ENUM_PREFIX[key]}${option}`)) ??
      PROVIDER_NAMES[option] ??
      translateAdmin(language, 'admin.agentPanel.form.unknownOption', { value: option }),
  };
}

const formatBound = (value: number, language: AdminLanguage): string => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);

/** Les bornes d'un nombre, dites : « Entre 1 et 1 440 », « Au moins 0 ». */
function boundsOf(spec: AgentFieldSpec, language: AdminLanguage): string | null {
  if (spec.kind !== 'int' && spec.kind !== 'number') return null;
  const min = formatBound(spec.min, language);
  return spec.max === undefined
    ? translateAdmin(language, 'admin.agentPanel.form.atLeast', { min })
    : translateAdmin(language, 'admin.agentPanel.form.between', { min, max: formatBound(spec.max, language) });
}

/** La consigne de saisie sous le champ : bornes, « vide = défaut », format d'une liste. */
function hintOf(spec: AgentFieldSpec, language: AdminLanguage): string | null {
  const parts: string[] = [];
  const bounds = boundsOf(spec, language);
  if (bounds !== null) parts.push(bounds);
  if ((spec.kind === 'int' || spec.kind === 'number') && spec.nullable === true) parts.push(translateAdmin(language, 'admin.agentPanel.form.emptyDefault'));
  if (spec.kind === 'list') {
    parts.push(
      spec.item === 'objectId'
        ? translateAdmin(language, 'admin.agentPanel.form.idsHint')
        : spec.maxItems !== undefined && spec.itemMax !== undefined
          ? translateAdmin(language, 'admin.agentPanel.form.listHintMax', { max: formatBound(spec.maxItems, language), length: formatBound(spec.itemMax, language) })
          : translateAdmin(language, 'admin.agentPanel.form.listHint'),
    );
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Ce qui ne va pas, dit SOUS le champ fautif. */
export function problemMessage(spec: AgentFieldSpec, problem: AgentFieldProblem, language: AdminLanguage, labelOf: (key: string) => string): string {
  switch (problem.code) {
    case 'range':
      return translateAdmin(language, 'admin.agentPanel.form.problem.range', { bounds: boundsOf(spec, language) ?? '' });
    case 'integer':
      return translateAdmin(language, 'admin.agentPanel.form.problem.integer');
    case 'number':
      return translateAdmin(language, 'admin.agentPanel.form.problem.number');
    case 'required':
      return translateAdmin(language, 'admin.agentPanel.form.problem.required');
    case 'length':
      return translateAdmin(language, 'admin.agentPanel.form.problem.length', { max: formatBound(spec.kind === 'text' ? spec.max : 0, language) });
    case 'choice':
      return translateAdmin(language, 'admin.agentPanel.form.problem.choice');
    case 'count':
      return translateAdmin(language, 'admin.agentPanel.form.problem.count', { max: formatBound(spec.kind === 'list' ? (spec.maxItems ?? 0) : 0, language) });
    case 'item':
      return translateAdmin(language, 'admin.agentPanel.form.problem.item', { value: problem.value });
    case 'order':
      return translateAdmin(language, problem.side === 'low' ? 'admin.agentPanel.form.problem.orderLow' : 'admin.agentPanel.form.problem.orderHigh', {
        other: labelOf(problem.other),
      });
  }
}

/** Les options d'un choix ou d'un ensemble : celles de la table, puis toute valeur servie qu'elles ignorent (gardée, jamais effacée). */
const optionsWith = (options: readonly string[], present: readonly string[]): readonly string[] => [
  ...options,
  ...present.filter((value) => value !== '' && !options.includes(value)),
];

/** Un réglage, dessiné d'après sa table : bascule, nombre, texte, liste nommée, ensemble coché ou mots-clés. */
export function AgentField({
  language,
  spec,
  label,
  help = null,
  optionLabel = (_key, option) => providerName(option),
  value,
  problem = null,
  invalid,
  onChange,
}: {
  readonly language: AdminLanguage;
  readonly spec: AgentFieldSpec;
  readonly label: string;
  readonly help?: string | null;
  readonly optionLabel?: (key: string, option: string) => string;
  readonly value: AgentDraftValue;
  /** Le message à dire sous le champ, s'il est fautif. */
  readonly problem?: string | null;
  readonly invalid: boolean;
  readonly onChange: (value: AgentDraftValue) => void;
}) {
  const id = useId();
  const anchor = { 'data-agent-field': spec.key };
  const border = invalid ? { ...FIELD_STYLE, border: '1px solid var(--color-danger)' } : FIELD_STYLE;
  const hint = hintOf(spec, language);
  const described = [help === null ? null : `${id}-help`, hint === null ? null : `${id}-hint`, problem === null ? null : `${id}-problem`].filter(Boolean).join(' ');
  const describedBy = described === '' ? {} : { 'aria-describedby': described };
  const wide = spec.kind === 'list' || spec.kind === 'set' || (spec.kind === 'text' && spec.multiline === true);

  const notes = (
    <>
      {help === null ? null : (
        <span id={`${id}-help`} className="text-caption" style={{ color: INK2 }}>
          {help}
        </span>
      )}
      {hint === null ? null : (
        <span id={`${id}-hint`} data-agent-field-hint={spec.key} className="text-caption tabular-nums" style={{ color: INK2 }}>
          {hint}
        </span>
      )}
      {problem === null ? null : (
        <span id={`${id}-problem`} data-agent-field-problem={spec.key} className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
          {problem}
        </span>
      )}
    </>
  );

  if (spec.kind === 'bool') {
    const on = value === true;
    return (
      <div className="grid content-start gap-1">
        <div className="flex items-center justify-between gap-3" style={{ minHeight: 44 }}>
          <span id={`${id}-label`} className="min-w-0 break-words text-body" style={{ color: INK }}>
            {label}
          </span>
          <button
            {...anchor}
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={`${id}-label`}
            {...describedBy}
            onClick={() => onChange(!on)}
            className={`relative inline-flex shrink-0 items-center rounded-full ${FOCUS}`}
            style={{ width: 52, height: 32, padding: 3, backgroundColor: on ? BRAND : INK3, outlineColor: BRAND }}
          >
            <span
              aria-hidden
              className="block rounded-full transition-transform motion-reduce:transition-none"
              style={{ width: 26, height: 26, backgroundColor: SURFACE, transform: on ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>
        {notes}
      </div>
    );
  }

  if (spec.kind === 'set') {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <fieldset {...anchor} className="grid gap-1 @lg:col-span-2" {...describedBy}>
        <legend className="text-caption font-medium" style={{ color: INK2 }}>
          {label}
        </legend>
        <div className="flex flex-wrap gap-x-4">
          {optionsWith(spec.options, chosen).map((option) => (
            <label key={option} className="flex items-center gap-2 text-body" style={{ minHeight: 44, color: INK }}>
              <input
                type="checkbox"
                data-agent-field-option={option}
                checked={chosen.includes(option)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  onChange(checked ? [...chosen, option] : chosen.filter((entry) => entry !== option));
                }}
                className={`size-5 shrink-0 ${FOCUS}`}
                style={{ accentColor: BRAND, outlineColor: BRAND }}
              />
              <span className="min-w-0 break-words">{optionLabel(spec.key, option)}</span>
            </label>
          ))}
        </div>
        {notes}
      </fieldset>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const common = { ...anchor, id, 'aria-invalid': invalid, ...describedBy };
  const control =
    spec.kind === 'choice' ? (
      <select {...common} value={text} onChange={(event) => onChange(event.currentTarget.value)} className={FIELD_CLASS} style={border}>
        <option value="">{translateAdmin(language, 'admin.agentPanel.form.notProvided')}</option>
        {optionsWith(spec.options, [text]).map((option) => (
          <option key={option} value={option}>
            {optionLabel(spec.key, option)}
          </option>
        ))}
      </select>
    ) : spec.kind === 'list' || (spec.kind === 'text' && spec.multiline === true) ? (
      <textarea
        {...common}
        rows={spec.kind === 'list' ? 3 : 4}
        value={text}
        {...(spec.kind === 'text' ? { maxLength: spec.max } : { spellCheck: false })}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} py-2`}
        style={border}
      />
    ) : spec.kind === 'int' ? (
      <input
        {...common}
        type="number"
        inputMode="numeric"
        step={1}
        min={spec.min}
        {...(spec.max === undefined ? {} : { max: spec.max })}
        value={text}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} tabular-nums`}
        style={border}
      />
    ) : (
      <input
        {...common}
        type="text"
        {...(spec.kind === 'text' ? { maxLength: spec.max } : { inputMode: 'decimal' as const })}
        value={text}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={() => undefined}
        className={`${FIELD_CLASS} ${spec.kind === 'text' ? '' : 'tabular-nums'}`.trim()}
        style={border}
      />
    );

  return (
    <div className={`grid content-start gap-1 ${wide ? '@lg:col-span-2' : ''}`.trim()}>
      <label htmlFor={id} className="text-caption font-medium" style={{ color: INK2 }}>
        {label}
      </label>
      {control}
      {notes}
    </div>
  );
}

/**
 * LE FORMULAIRE D'UNE TABLE DE RÉGLAGES — le brouillon part du servi, « Enregistrer »
 * calcule les changements (`changesOf`), refuse en nommant les champs fautifs (en
 * tête, et sous chacun avec sa raison), et dit « aucun changement » plutôt
 * qu'envoyer un corps vide. `sections` regroupe les champs sous des titres ; `extra`
 * porte un champ hors table (la clé API) ; `extraDirty` le compte comme un changement.
 */
export function AgentSettingsForm({
  id,
  language,
  specs,
  sections,
  served,
  labelOf,
  vocabulary,
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
  readonly sections?: readonly AgentFieldSection[];
  readonly served: AgentServed;
  readonly labelOf?: (key: string) => string;
  readonly vocabulary?: AgentFieldVocabulary;
  readonly saveLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (changes: Readonly<Record<string, unknown>>) => void;
  readonly extra?: ReactNode;
  readonly extraDirty?: boolean;
  readonly disabled?: boolean;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() => draftOf(specs, served));
  const [problems, setProblems] = useState<Readonly<Record<string, AgentFieldProblem>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const label = vocabulary?.label ?? labelOf ?? ((key: string) => key);
  const invalid = Object.keys(problems);

  const submit = () => {
    const verdict = changesOf(specs, served, draft);
    if (!verdict.ok) {
      setProblems(verdict.problems);
      setNotice(translateAdmin(language, 'admin.agentPanel.form.invalid', { fields: verdict.invalid.map(label).join(', ') }));
      return;
    }
    setProblems({});
    if (Object.keys(verdict.changes).length === 0 && !extraDirty) {
      setNotice(translateAdmin(language, 'admin.agentPanel.form.unchanged'));
      return;
    }
    setNotice(null);
    onSubmit(verdict.changes);
  };

  const message = notice ?? error;
  const field = (spec: AgentFieldSpec) => {
    const problem = problems[spec.key];
    return (
      <AgentField
        key={spec.key}
        language={language}
        spec={spec}
        label={label(spec.key)}
        help={vocabulary?.help?.(spec.key) ?? null}
        {...(vocabulary?.option === undefined ? {} : { optionLabel: vocabulary.option })}
        value={draft[spec.key] ?? ''}
        invalid={problem !== undefined}
        problem={problem === undefined ? null : problemMessage(spec, problem, language, label)}
        onChange={(value) => setDraft((current) => ({ ...current, [spec.key]: value }))}
      />
    );
  };
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));

  return (
    <form
      data-agent-form={id}
      className="grid gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {sections === undefined ? (
        <div className="grid gap-3 @lg:grid-cols-2">{specs.map(field)}</div>
      ) : (
        sections.map((section) => (
          <fieldset key={section.id} data-agent-form-section={section.id} className="grid gap-3 border-t pt-3" style={{ borderColor: EDGE }}>
            <legend className="pe-2 text-body font-semibold" style={{ color: INK }}>
              {vocabulary?.section?.(section.id) ?? section.id}
            </legend>
            <div className="grid gap-3 @lg:grid-cols-2">
              {section.keys.flatMap((key) => {
                const spec = byKey.get(key);
                return spec === undefined ? [] : [field(spec)];
              })}
            </div>
          </fieldset>
        ))
      )}
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
