import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PACK_DOMAINS, type PackDomain } from '@meeshy/shared/types/content-pack';
import type { PackRegistryOverride } from '@meeshy/shared/types/pack-registry-override';

import { AdminSkeleton } from '@/components/admin/states';
import { formOfRow, patchOfForm, type RegistryForm } from '@/lib/admin/packs-registry-form';
import { registryDomainText, registryFailureText, registryText } from '@/lib/admin/packs-registry-texts';
import {
  ADMIN_PACKS_REGISTRY_QUERY_KEY,
  loadPacksRegistry,
  registryFailureOf,
  resetPackRegistry,
  updatePackRegistry,
  type RegistryFailure,
  type RegistryRow,
} from '@/lib/api/admin-packs-registry';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LE REGISTRE DES PACKS, BLOC DU BARÈME** (W17, #11323) — publier, retirer,
 * ordonner, mettre à prix, dater et cibler un pack du dépôt, sans déploiement,
 * sur les routes de S20 (`lib/api/admin-packs-registry.ts`). L'écran du barème
 * le monte sous `canManageGame` (BIGBOSS, ADMIN), comme le calendrier des
 * saisons, et le charge par `lazy(import())`. Chaque geste porte la révision
 * lue ; un refus a son mot ; une révision périmée recharge le registre. La
 * piste d'audit se voit sur chaque ligne (« Surchargé · révision n ») et, pour
 * qui lit le journal (`canViewAuditLogs`), par un lien vers la famille « Packs ».
 *
 * La modération d'un pack COMMUNAUTAIRE garde ses routes de revue par domaine :
 * hors de ce bloc (S20 ne la porte pas).
 */
const INK2 = 'var(--color-ios-ink-2)';

const dateText = (language: AdminLanguage, iso: string): string =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

function facts(language: AdminLanguage, row: RegistryRow): readonly string[] {
  const { effective } = row;
  return [
    registryText(language, effective.hidden ? 'withdrawn' : 'published'),
    effective.price === null ? registryText(language, 'free') : registryText(language, 'price', { price: String(effective.price) }),
    registryText(language, 'order', { order: String(effective.order) }),
    ...(effective.availability?.startsAt === undefined ? [] : [registryText(language, 'from', { date: dateText(language, effective.availability.startsAt) })]),
    ...(effective.availability?.endsAt === undefined ? [] : [registryText(language, 'until', { date: dateText(language, effective.availability.endsAt) })]),
    ...(effective.targeting === null ? [] : [registryText(language, 'targeted')]),
    ...(row.overridden ? [registryText(language, 'overridden', { revision: String(row.revision) })] : []),
  ];
}

const FIELDS: readonly (keyof RegistryForm)[] = ['order', 'price', 'startsAt', 'endsAt', 'communities', 'countries', 'languages'];

const inputTypeOf = (field: keyof RegistryForm): string => (field === 'startsAt' || field === 'endsAt' ? 'datetime-local' : field === 'order' || field === 'price' ? 'number' : 'text');

function RegistryEditor({
  language,
  row,
  busy,
  onSave,
  onCancel,
}: {
  readonly language: AdminLanguage;
  readonly row: RegistryRow;
  readonly busy: boolean;
  readonly onSave: (patch: PackRegistryOverride) => void;
  readonly onCancel: () => void;
}) {
  const [form, setForm] = useState<RegistryForm>(() => formOfRow(row));
  const [invalid, setInvalid] = useState(false);
  const submit = (): void => {
    const outcome = patchOfForm(form);
    setInvalid(!outcome.ok);
    if (outcome.ok) onSave(outcome.patch);
  };
  return (
    <form
      data-packs-registry-editor={`${row.domain}:${row.slug}`}
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {FIELDS.map((field) => (
        <label key={field} className="grid gap-1 text-caption">
          <span style={{ color: INK2 }}>{registryText(language, `field.${field}`)}</span>
          <input
            name={field}
            type={inputTypeOf(field)}
            value={form[field]}
            onChange={(event) => setForm({ ...form, [field]: event.currentTarget.value })}
            className="min-h-11 rounded-lg px-3"
            style={{ backgroundColor: 'var(--color-ios-fill)' }}
          />
        </label>
      ))}
      {invalid ? (
        <p role="alert" data-packs-registry-invalid className="text-caption" style={{ color: 'var(--color-error)' }}>
          {registryText(language, 'field.invalid')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-11 rounded-full px-4 font-semibold" style={{ backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }}>
          {registryText(language, 'save')}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
          {registryText(language, 'cancel')}
        </button>
      </div>
    </form>
  );
}

type Gesture = { readonly key: string; readonly failure: RegistryFailure | null };

export function AdminPacksRegistryPanel({ language, deps, auditHref }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly auditHref: string | null }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ADMIN_PACKS_REGISTRY_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadPacksRegistry(deps, signal);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  const keyOf = (row: RegistryRow): string => `${row.domain}:${row.slug}`;

  const replace = (next: RegistryRow): void => {
    queryClient.setQueryData<readonly RegistryRow[]>(ADMIN_PACKS_REGISTRY_QUERY_KEY, (rows) => (rows ?? []).map((row) => (keyOf(row) === keyOf(next) ? next : row)));
  };

  const reload = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ADMIN_PACKS_REGISTRY_QUERY_KEY });

  /* Une réponse écrite remplace sa ligne ; un retour au dépôt relit le registre ; une révision périmée aussi. */
  const settle = async (row: RegistryRow, run: () => Promise<{ readonly ok: true; readonly row?: RegistryRow } | { readonly ok: false; readonly failure: RegistryFailure }>): Promise<void> => {
    const key = keyOf(row);
    setBusy(key);
    const outcome = await run();
    setBusy(null);
    if (!outcome.ok) {
      setGesture({ key, failure: outcome.failure });
      if (outcome.failure === 'conflict') await reload();
      return;
    }
    setGesture(null);
    setEditing(null);
    if (outcome.row === undefined) await reload();
    else replace(outcome.row);
  };

  const update = (row: RegistryRow, patch: PackRegistryOverride): Promise<void> =>
    settle(row, async () => {
      const result = await updatePackRegistry(deps, { domain: row.domain, slug: row.slug, expectedRevision: row.revision, patch });
      return result.ok ? { ok: true, row: result.data } : { ok: false, failure: registryFailureOf(result) };
    });

  const reset = (row: RegistryRow): Promise<void> =>
    settle(row, async () => {
      const result = await resetPackRegistry(deps, { domain: row.domain, slug: row.slug, expectedRevision: row.revision });
      return result.ok ? { ok: true } : { ok: false, failure: registryFailureOf(result) };
    });

  if (query.isPending) return <AdminSkeleton rows={4} language={language} />;
  if (query.isError) {
    return (
      <div role="alert" data-packs-registry-error className="grid gap-2">
        <p>{registryText(language, 'load.failed')}</p>
        <button type="button" onClick={() => void query.refetch()} className="min-h-11 justify-self-start rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
          {registryText(language, 'retry')}
        </button>
      </div>
    );
  }

  const rows = query.data;
  const domains = PACK_DOMAINS.filter((domain) => rows.some((row) => row.domain === domain));

  return (
    <div className="grid gap-4" data-packs-registry>
      {auditHref !== null ? (
        <a data-packs-registry-audit href={auditHref} className="text-caption font-semibold underline" style={{ color: 'var(--accent, var(--color-ios-brand))' }}>
          {registryText(language, 'audit')}
        </a>
      ) : null}
      {rows.length === 0 ? <p style={{ color: INK2 }}>{registryText(language, 'empty')}</p> : null}
      {domains.map((domain: PackDomain) => (
        <section key={domain} aria-label={registryDomainText(language, domain)} className="grid gap-2">
          <h3 className="text-body font-semibold">{registryDomainText(language, domain)}</h3>
          <ul className="grid gap-2">
            {rows
              .filter((row) => row.domain === domain)
              .map((row) => {
                const key = keyOf(row);
                const failure = gesture?.key === key ? gesture.failure : null;
                return (
                  <li key={key} data-packs-registry-row={key} data-packs-registry-hidden={String(row.effective.hidden)} className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{row.slug}</span>
                      <span className="text-caption" style={{ color: INK2 }}>
                        {facts(language, row).join(' · ')}
                      </span>
                    </div>
                    {failure === null ? null : (
                      <p role="alert" data-packs-registry-failure={failure} className="text-caption" style={{ color: 'var(--color-error)' }}>
                        {registryFailureText(language, failure)}
                      </p>
                    )}
                    {editing === key ? (
                      <RegistryEditor language={language} row={row} busy={busy === key} onSave={(patch) => void update(row, patch)} onCancel={() => setEditing(null)} />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-packs-registry-toggle={key}
                          disabled={busy === key}
                          aria-busy={busy === key}
                          onClick={() => void update(row, { hidden: !row.effective.hidden })}
                          className="min-h-11 rounded-full px-4 font-semibold"
                          style={{ backgroundColor: 'var(--color-ios-fill)' }}
                        >
                          {registryText(language, row.effective.hidden ? 'publish' : 'withdraw')}
                        </button>
                        <button type="button" data-packs-registry-edit={key} onClick={() => setEditing(key)} className="min-h-11 rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
                          {registryText(language, 'edit')}
                        </button>
                        {row.overridden ? (
                          <button type="button" data-packs-registry-reset={key} disabled={busy === key} onClick={() => void reset(row)} className="min-h-11 rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
                            {registryText(language, 'reset')}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function AdminPacksRegistryBlock({ language, auditHref }: { readonly language: AdminLanguage; readonly auditHref: string | null }) {
  return (
    <section aria-labelledby="packs-registry-title" className="grid gap-4" data-admin-packs-registry-block>
      <div className="grid gap-1">
        <h2 id="packs-registry-title" className="text-title font-semibold">
          {registryText(language, 'title')}
        </h2>
        <p className="text-caption" style={{ color: INK2 }}>
          {registryText(language, 'hint')}
        </p>
      </div>
      <AdminPacksRegistryPanel language={language} deps={apiDeps} auditHref={auditHref} />
    </section>
  );
}
