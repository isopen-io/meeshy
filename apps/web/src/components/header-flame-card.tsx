import { useEffect, useRef } from 'react';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { flameCardModel, type FlameCardModel } from '@/lib/view/engagement-pill';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { Link } from '@/routes/route-table';

/**
 * **LA CARTE DE LA SÉRIE** (#17770) — ce que le toucher sur la flamme ouvre :
 * la série en grand, les étincelles du jour, le total gagné ici, puis « Voir
 * le jeu » (`/me/progression`, « Ma Légende ») et « Masquer la flamme ». La
 * pastille de l'en-tête déplié ouvre la même carte (#17987). Échap, le retour
 * Android, Précédent ou un toucher hors de la carte la referment, elle seule
 * (#18326) : la carte est la couche du dessus.
 * Les nombres sont lus depuis l'instantané déjà en main : aucune attente.
 */
export function FlameCard({
  id,
  snapshot,
  day,
  language,
  onClose,
  onHide,
}: {
  readonly id: string;
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  readonly day: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  /** Absent : la carte ne propose pas « Masquer la flamme ». */
  readonly onHide?: () => void;
}) {
  const model = flameCardModel(snapshot, day, language);
  if (model === null) return null;
  return <FlameCardLayer id={id} model={model} language={language} onClose={onClose} {...(onHide === undefined ? {} : { onHide })} />;
}

function FlameCardLayer({
  id,
  model,
  language,
  onClose,
  onHide,
}: {
  readonly id: string;
  readonly model: FlameCardModel;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onHide?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useBackDismiss(onClose, { escape: true });

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const card = ref.current;
      const target = event.target;
      if (card === null || !(target instanceof Node)) return;
      if (card.contains(target) || card.parentElement?.contains(target)) return;
      close.current();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={translate(language, 'engagement.card.title')}
      data-flame-card=""
      className="header-flame-card pointer-events-auto"
    >
      <div className="flex items-baseline gap-2">
        <span data-flame-card-streak className="text-title font-bold tabular-nums">
          {model.streakDays}
        </span>
        <span className="text-mini font-semibold">{model.streakText}</span>
      </div>
      <dl className="flex flex-col gap-1 text-mini">
        <div className="flex justify-between gap-4">
          <dt>{translate(language, 'engagement.card.today')}</dt>
          <dd data-flame-card-today className="font-bold tabular-nums" style={{ color: 'var(--ios-warning)' }}>
            {model.todayText}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{translate(language, 'engagement.card.total')}</dt>
          <dd data-flame-card-total className="font-bold tabular-nums">
            {model.totalText}
          </dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <Link to="progression" className="btn-press header-flame-card-primary min-h-11 flex-1">
          {translate(language, 'engagement.card.open')}
        </Link>
        {onHide === undefined ? null : (
          <button type="button" data-flame-card-hide onClick={onHide} className="btn-press header-flame-card-secondary min-h-11">
            {translate(language, 'engagement.card.hide')}
          </button>
        )}
      </div>
    </div>
  );
}
