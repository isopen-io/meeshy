'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/v2/Button';
import { ComposerFormatFan } from '@/components/composer/ComposerFormatFan';
import { postTypeOf, webComposerOpening, type ComposerDoor, type ComposerFormat } from '@/lib/composer-door';
import type { ComposerRepostPayload } from '@/components/composer/payload';

/**
 * La surface REPOST — W8, loi 5 (« le repost miroite ; changer de format est
 * l'ANCRAGE »).
 *
 * Elle remplace `components/v2/RepostModal.tsx`, qui n'offrait AUCUN choix de
 * format : le repost partait toujours dans le format de sa SOURCE, et
 * l'ancrage vers POST n'existait que par un bouton séparé, hors dialogue
 * (`onRepostAsPost` sur `StoryViewer`/`PostDetail` — CONSERVÉ tel quel, voir
 * la note de fichier de `MeeshyComposer.tsx`). Cette surface donne enfin à
 * l'éventail SA place dans le dialogue : reposter un RÉEL ou une STORY peut
 * désormais choisir l'ancrage `post` **et** porter une citation dans le même
 * geste — combinaison qu'aucun chemin existant n'offrait.
 *
 * Ce que cette surface ne fait PAS : elle ne résout aucune cible. `onRepost`
 * rend `{ targetType, isQuote, content? }` ; c'est l'appelant qui connaît
 * `targetId` (`repostTargetId()`, le résolveur UNIQUE) et qui le referme sur
 * `useComposerRepost().repost(...)`.
 */

export interface ComposerRepostSurfaceProps {
  readonly door: Extract<ComposerDoor, { kind: 'repost' }>;
  readonly original?: { author?: string; content?: string };
  readonly onRepost: (payload: ComposerRepostPayload) => void;
  readonly disabled?: boolean;
  readonly saving?: boolean;
  readonly className?: string;
}

const NO_COMPOSITION = [] as const;

export function ComposerRepostSurface({
  door,
  original,
  onRepost,
  disabled = false,
  saving = false,
  className,
}: ComposerRepostSurfaceProps) {
  const { t } = useI18n('common');
  const [mode, setMode] = useState<'repost' | 'quote'>('repost');
  const [quoteContent, setQuoteContent] = useState('');
  const [format, setFormat] = useState<ComposerFormat>(door.sourceFormat);

  // La composition n'entre jamais en jeu ici : un repost ne joint aucun média
  // frais, donc `qualifiesAsReel` ne peut rien y ajouter que la table n'offre
  // déjà via `repostFormats(sourceFormat)`.
  const { offeredFormats } = webComposerOpening(door, NO_COMPOSITION);

  const isValid = mode === 'repost' || quoteContent.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!isValid || disabled || saving) return;
    onRepost({
      targetType: postTypeOf(format),
      isQuote: mode === 'quote',
      ...(mode === 'quote' ? { content: quoteContent.trim() } : {}),
    });
  }, [isValid, disabled, saving, onRepost, format, mode, quoteContent]);

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="composer-repost-surface">
      <div className="flex gap-2" role="tablist" aria-label={t('composer.repost.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'repost'}
          onClick={() => setMode('repost')}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'repost'
              ? 'bg-[var(--gp-terracotta)] text-white'
              : 'bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]',
          )}
        >
          {t('repost')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'quote'}
          onClick={() => setMode('quote')}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'quote'
              ? 'bg-[var(--gp-terracotta)] text-white'
              : 'bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]',
          )}
        >
          {t('composer.repost.quote')}
        </button>
      </div>

      {mode === 'quote' && (
        <textarea
          value={quoteContent}
          onChange={(e) => setQuoteContent(e.target.value)}
          placeholder={t('quotePlaceholder')}
          rows={3}
          maxLength={5000}
          disabled={disabled}
          className={cn(
            'w-full resize-none rounded-xl border px-4 py-3 text-base outline-none transition-colors',
            'bg-[var(--gp-parchment)] border-[var(--gp-border)]',
            'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
            'focus:border-[var(--gp-terracotta)]',
          )}
          aria-label={t('composer.repost.contentLabel')}
        />
      )}

      <ComposerFormatFan offered={offeredFormats} selected={format} onSelect={setFormat} />

      {original?.content && (
        <div className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-parchment)] p-3">
          {original.author && (
            <p className="text-xs font-medium text-[var(--gp-text-muted)] mb-1">{original.author}</p>
          )}
          <p className="text-sm text-[var(--gp-text-secondary)] line-clamp-3">{original.content}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          data-testid="composer-repost-submit"
          onClick={handleSubmit}
          disabled={!isValid || disabled || saving}
        >
          {saving ? t('composer.repost.posting') : mode === 'quote' ? t('composer.repost.quote') : t('repost')}
        </Button>
      </div>
    </div>
  );
}

ComposerRepostSurface.displayName = 'ComposerRepostSurface';
