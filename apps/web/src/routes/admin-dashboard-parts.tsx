import { useId, type ReactNode } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminLink } from '@/components/admin/entity-chip';
import type { AdminChartState } from '@/components/admin/charts/chart-card';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminDeniedInline, AdminErrorState } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { sectionOfEntity, type AdminTarget } from '@/lib/admin/admin-routes';
import type { DashStat } from '@/lib/admin/dashboard-cards';
import type { DashBlock } from '@/lib/admin/dashboard-block';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES PIÈCES COMMUNES DU TABLEAU DE BORD** (#8876, § 4) — une ZONE (un titre,
 * une phrase d'aide, ses blocs), un BLOC de cartes, un bloc de liste, et les
 * quatre états qu'ils partagent (squelette, vide, erreur avec « Réessayer »,
 * refus). Chaque bloc se rend seul : une erreur ici ne retient jamais la zone
 * d'à côté.
 */
export type DashContext = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now: Date;
};

const SKELETON = 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)';

export function DashZone({ id, title, hint, children }: { readonly id: string; readonly title: string; readonly hint?: string; readonly children: ReactNode }) {
  const heading = useId();
  return (
    <section data-admin-zone={id} aria-labelledby={heading} className="grid content-start gap-3">
      <div className="grid gap-1">
        <h2 id={heading} className="text-title font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        {hint === undefined ? null : (
          <p className="text-caption" style={{ color: INK2 }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Un bloc nommé d'une zone : son titre (niveau 3) puis son contenu. `aria-busy` tant que rien n'est arrivé. */
export function DashSection({ id, title, busy = false, children }: { readonly id: string; readonly title: string; readonly busy?: boolean; readonly children: ReactNode }) {
  const heading = useId();
  return (
    <section data-admin-block={id} aria-labelledby={heading} aria-busy={busy} className="grid content-start gap-3">
      <h3 id={heading} className="text-body font-semibold" style={{ color: INK }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Le bloc de cartes : squelettes de même taille, cartes, ou l'état d'erreur / de refus à leur place. */
export function DashStats({
  language,
  id,
  block,
  stats,
  columns = 4,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly block: DashBlock<unknown>;
  readonly stats: readonly DashStat[];
  readonly columns?: 2 | 3 | 4;
}) {
  return (
    <div data-admin-block={id} data-admin-block-state={block.status}>
      {block.status === 'denied' ? (
        <AdminDeniedInline language={language} />
      ) : block.status === 'error' ? (
        <AdminErrorState language={language} onRetry={block.retry} />
      ) : (
        <AdminStatGrid columns={columns}>
          {stats.map((stat) => (
            <AdminStatCard
              key={stat.anchor}
              language={language}
              anchor={stat.anchor}
              label={stat.label}
              value={stat.value}
              {...(stat.caption === undefined ? {} : { caption: stat.caption })}
              target={stat.target}
              state={block.status === 'loading' ? 'loading' : 'ready'}
            />
          ))}
        </AdminStatGrid>
      )}
    </div>
  );
}

/** Le corps d'un bloc de liste : refus, erreur (avec le nom du bloc, sans quoi elle ne dit pas ce qui manque), squelette, ou ses données. */
export function DashBody<T>({
  language,
  title,
  block,
  rows = 3,
  children,
}: {
  readonly language: AdminLanguage;
  readonly title: string;
  readonly block: DashBlock<T>;
  readonly rows?: number;
  readonly children: (data: T) => ReactNode;
}) {
  switch (block.status) {
    case 'denied':
      return <AdminDeniedInline language={language} />;
    case 'error':
      return <AdminErrorState language={language} message={`${title} — ${translateAdmin(language, 'admin.kit.error')}`} onRetry={block.retry} />;
    case 'loading':
      return (
        <div aria-hidden="true" data-admin-block-skeleton className="grid gap-3 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
          {Array.from({ length: rows }, (_, index) => (
            <span key={index} className="h-9 rounded-chip" style={{ backgroundColor: SKELETON }} />
          ))}
        </div>
      );
    case 'ready':
      return <>{children(block.data)}</>;
  }
}

/** La carte d'une liste : surface, bord, padding du kit. */
export function DashListCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      {children}
    </div>
  );
}

/** Une phrase dans une carte de liste : « Aucun signalement… » — l'état VIDE dit en mots, jamais une carte vide. */
export function DashEmptyLine({ text }: { readonly text: string }) {
  return (
    <p data-admin-block-empty className="text-caption" style={{ color: INK2 }}>
      {text}
    </p>
  );
}

export const chartStateOf = (block: DashBlock<unknown>): AdminChartState => (block.status === 'loading' ? 'loading' : block.status === 'ready' ? 'ready' : 'error');

export const retryOf = (block: DashBlock<unknown>): (() => void) | undefined => (block.status === 'error' ? block.retry : undefined);

/**
 * Le cadre d'un graphique du tableau de bord : un refus (403) remplace le
 * graphique par sa ligne de refus ; sinon le graphique (qui porte SES états —
 * squelette de même hauteur, erreur avec « Réessayer ») et, une fois les
 * données là, « Voir le détail » vers la section visée.
 */
export function DashChartFrame({
  language,
  block,
  more,
  children,
}: {
  readonly language: AdminLanguage;
  readonly block: DashBlock<unknown>;
  readonly more: AdminTarget;
  readonly children: ReactNode;
}) {
  if (block.status === 'denied') return <AdminDeniedInline language={language} />;
  return (
    <div className="grid content-start gap-1">
      {children}
      {block.status === 'ready' ? <DashMore language={language} target={more} /> : null}
    </div>
  );
}

/** « Voir le détail » — rendu SEULEMENT si le lecteur peut ouvrir la section visée : jamais un lien vers un refus ni vers un écran d'attente. */
export function DashMore({ language, target }: { readonly language: AdminLanguage; readonly target: AdminTarget }) {
  const reach = useAdminReach();
  const section = target.kind === 'section' ? target.section : sectionOfEntity(target.entity);
  if (!reach.opens(section)) return null;

  return (
    <AdminLink target={target} anchor="dash-more" className="inline-flex w-fit items-center gap-1 text-caption font-medium" style={{ minHeight: 44, color: BRAND }}>
      {translateAdmin(language, 'admin.dash.more')}
      <AdminGlyph name="caretRight" size={14} />
    </AdminLink>
  );
}
