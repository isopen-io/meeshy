import type { ReactNode } from 'react';

import type { PackAction } from './pack-shop';
import { Sheet } from './sheet';

/**
 * **LA FICHE D'UN PACK SANS ÉDITEUR PROPRE** (épure #17584, règles 5 et 6) — ce
 * que la rangée de la boutique ne dit plus : la description ENTIÈRE (elle y
 * était tronquée sur deux lignes), l'auteur et les genres. La rangée garde le
 * nom et la valeur ; toucher la rangée ouvre cette fiche, avec le même geste
 * Installer / Retirer / Acheter. Les packs de décor ont la leur (`PackSheet`).
 */
export function PackDetailsSheet({
  slug,
  title,
  cover,
  description,
  facts,
  unlock,
  action,
  busy,
  pressed,
  notice,
  onAction,
  onClose,
}: {
  readonly slug: string;
  readonly title: string;
  readonly cover: ReactNode;
  readonly description: string;
  readonly facts: readonly string[];
  readonly unlock: string | null;
  readonly action: PackAction;
  readonly busy: boolean;
  readonly pressed: boolean;
  readonly notice: string;
  readonly onAction: () => void;
  readonly onClose: () => void;
}) {
  const primary = action.kind === 'buy' || (action.kind === 'toggle' && !pressed);
  return (
    <Sheet title={title} bodyAs="div" dialogData={{ 'data-pack-details': slug }} onClose={onClose}>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="shrink-0">
            {cover}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {description === '' ? null : (
              <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
                {description}
              </p>
            )}
            <p data-pack-details-facts className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {facts.join(' · ')}
            </p>
            {unlock === null ? null : (
              <p className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                {unlock}
              </p>
            )}
          </div>
        </div>
        {action.kind === 'locked' || action.kind === 'included' ? (
          <p data-pack-details-action={action.kind} className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
            {action.label}
          </p>
        ) : (
          <button
            type="button"
            data-pack-details-action={action.kind}
            aria-busy={busy}
            {...(action.kind === 'toggle' ? { 'aria-pressed': pressed } : {})}
            onClick={action.kind === 'swap' ? action.run : onAction}
            className="min-h-11 rounded-full px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={
              primary
                ? { backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' }
                : { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }
            }
          >
            {action.label}
          </button>
        )}
        <p role="status" aria-live="polite" className="text-caption empty:hidden" style={{ color: 'var(--ios-error)' }}>
          {notice}
        </p>
      </div>
    </Sheet>
  );
}
