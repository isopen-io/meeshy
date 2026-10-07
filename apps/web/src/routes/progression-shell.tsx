import type { ReactNode } from 'react';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import { CollapsingHeader } from '@/components/collapsing-header';
import { PRESS } from '@/components/game-press';
import { GlassBack } from '@/components/glass-surface';
import { Glyph } from '@/components/glyph';
import { Link } from '@/routes/route-table';

/**
 * LA COQUILLE D'UNE PAGE DE « PROGRESSION » (#9563, amendements n° 2 et 3) — la
 * première page, les fiches, le tableau de bord, les sous-pages, le carnet des
 * règles et le carnet de progression la partagent : le conteneur qui défile, son
 * verrou horizontal, et l'en-tête qui se réduit posé DEDANS, pour que le contenu
 * passe sous le verre.
 *
 * Aucune route n'écrit plus son `<header>` ni son `<main>` : un en-tête statique
 * au-dessus du défilement est le défaut que le porteur a relevé, et quinze pages
 * qui le réécrivent le feraient revenir une par une.
 *
 * `back` dit où mène le retour : l'accueil pour la première page, la première
 * page pour une fiche, la FICHE de son concept pour une sous-page.
 */
export type ShellBack =
  | { readonly to: 'list'; readonly label: string }
  | { readonly to: 'progression'; readonly label: string }
  | { readonly to: 'progressionConcept'; readonly concept: ProgressionConcept; readonly label: string };

const BACK = `${PRESS} grid size-11 shrink-0 place-items-center`;
const BRAND = 'var(--color-ios-brand)';

function BackLink({ back }: { readonly back: ShellBack }) {
  const disc = (
    <GlassBack label={back.label}>
      <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
    </GlassBack>
  );
  return back.to === 'progressionConcept' ? (
    <Link to="progressionConcept" params={{ concept: back.concept }} className={BACK} style={{ color: BRAND }} aria-label={back.label} data-page-back={back.concept}>
      {disc}
    </Link>
  ) : (
    <Link to={back.to} className={BACK} style={{ color: BRAND }} aria-label={back.label} data-page-back={back.to}>
      {disc}
    </Link>
  );
}

export function ProgressionShell({
  title,
  back,
  trailing,
  notice,
  children,
}: {
  readonly title: string;
  readonly back: ShellBack;
  readonly trailing?: ReactNode;
  readonly notice?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <main id="contenu" className="relative flex-1 overflow-y-auto overflow-x-clip overscroll-x-none break-words pb-safe">
        <CollapsingHeader title={title} back={<BackLink back={back} />} trailing={trailing} notice={notice} />
        {children}
      </main>
    </div>
  );
}

/** La bande « Hors ligne », collée sous la barre. */
export function OfflineNotice({ children }: { readonly children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, var(--color-ios-surface))', color: 'var(--color-ios-ink)' }}
    >
      <Glyph name="warningCircle" size={11} />
      {children}
    </p>
  );
}
