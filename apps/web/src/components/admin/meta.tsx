import { useState, type ReactNode } from 'react';

import type { AdminMoment } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { copyPlainText } from '@/lib/view/copy-text';

import { AdminGlyph } from './admin-glyph';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE } from './tone';

/** Le panneau « Métadonnées » d'une fiche : une carte, un titre, une liste de définitions. */
export function AdminMetaPanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      <h2 className="text-title font-semibold" style={{ color: INK }}>
        {title}
      </h2>
      <dl className="grid gap-3">{children}</dl>
    </section>
  );
}

/**
 * UNE MÉTADONNÉE, INTERPRÉTÉE (#8876) — le libellé traduit, la valeur humaine
 * (qui REVIENT à la ligne, jamais tronquée) et, quand le sens n'est pas
 * évident, une phrase dessous.
 */
export function AdminMetaRow({
  label,
  value,
  explain,
  anchor,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly explain?: string | null;
  readonly anchor?: string;
}) {
  return (
    <div {...(anchor === undefined ? {} : { 'data-admin-meta': anchor })} className="grid gap-0.5">
      <dt className="text-caption" style={{ color: INK2 }}>
        {label}
      </dt>
      <dd className="min-w-0 break-words text-body" style={{ color: INK }}>
        {value}
      </dd>
      {explain === undefined || explain === null ? null : (
        <dd className="text-caption" style={{ color: INK3 }}>
          {explain}
        </dd>
      )}
    </div>
  );
}

/**
 * LA LIGNE « IDENTIFIANT TECHNIQUE » (#8876) — le SEUL endroit où un
 * identifiant s'écrit. Il est copiable, et la copie s'ANNONCE (réussie ou non) :
 * un geste sans retour ne se tait pas.
 */
export function AdminTechnicalId({
  language,
  id,
  label,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly label?: string;
  readonly onAnnounce?: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const outcome = await copyPlainText(id);
    setCopied(outcome === 'copied');
    onAnnounce?.(translateAdmin(language, outcome === 'copied' ? 'admin.kit.copied' : 'admin.kit.copyFailed'));
  };

  return (
    <AdminMetaRow
      anchor="technicalId"
      label={label ?? translateAdmin(language, 'admin.kit.techId')}
      value={
        <span className="flex flex-wrap items-center gap-2">
          <code data-admin-technical-id className="font-mono text-caption" style={{ color: INK2, overflowWrap: 'anywhere' }}>
            {id}
          </code>
          <button
            type="button"
            data-admin-action="copy-technical-id"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
          >
            <AdminGlyph name={copied ? 'check' : 'copy'} size={14} />
            {translateAdmin(language, 'admin.kit.copy')}
          </button>
        </span>
      }
    />
  );
}

/** Un instant : `<time>` — le relatif (« il y a 3 min ») lu, l'absolu en infobulle, ou les deux. `null` se dit « — ». */
export function AdminMomentText({
  moment,
  variant = 'relative',
}: {
  readonly moment: AdminMoment | null;
  readonly variant?: 'relative' | 'absolute' | 'both';
}) {
  if (moment === null) return <span aria-label="—">—</span>;
  const text =
    variant === 'absolute' ? moment.absolute : variant === 'both' ? `${moment.absolute} · ${moment.relative}` : moment.relative;
  return (
    <time dateTime={moment.iso} title={moment.absolute}>
      {text}
    </time>
  );
}
