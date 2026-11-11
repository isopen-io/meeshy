import { useId, useState, type ReactNode } from 'react';

import { SECTION_INK_2 } from '@/components/grouped-section';

/**
 * **L'ESSENTIEL AU REPOS, LE RARE DERRIÈRE « PLUS »** (épure #17584, règle 6) —
 * la fiche d'une session ou d'un appareil chiffré. Au repos, seuls les champs
 * de `rest` ; « Plus » (un bouton, `aria-expanded`, `aria-controls`) déroule les
 * autres. Rien n'est retiré : tout champ servi reste atteignable en un geste.
 */
export function MoreFields<F extends { readonly key: string }>({
  fields,
  rest,
  moreLabel,
  subjectId,
  rowOf,
}: {
  readonly fields: readonly F[];
  readonly rest: ReadonlySet<string>;
  readonly moreLabel: string;
  /** L'identifiant du titre de la fiche : chaque « Plus » d'une liste dit au lecteur d'écran de QUOI il parle. */
  readonly subjectId: string;
  readonly rowOf: (field: F) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = fields.filter((field) => rest.has(field.key));
  const hidden = fields.filter((field) => !rest.has(field.key));
  return (
    <>
      <dl id={id} className="grid gap-1 text-caption" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
        {shown.map(rowOf)}
        {open ? hidden.map(rowOf) : null}
      </dl>
      {hidden.length === 0 ? null : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-describedby={subjectId}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2"
          style={{ minHeight: 44, justifySelf: 'start', color: SECTION_INK_2, outlineColor: 'var(--color-ios-brand)' }}
        >
          {moreLabel}
        </button>
      )}
    </>
  );
}
