import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { InfoDuration } from '@/lib/view/media-transport';
import { kindOf } from '@/lib/view/message';

import { Glyph } from './glyph';
import { GLYPH_SIZE } from './ui-chrome';

/**
 * LA LIGNE D'INFORMATIONS DE LA VISIONNEUSE (#9577) — « largeur × hauteur ·
 * poids · durée », sous la barre de progression et au-dessus de la pellicule.
 *
 * `facts` : les cotes et le poids ne s'affichent qu'avec un porteur (la règle
 * du pied, inchangée) — jamais sur une scène, qui n'a ni format, ni
 * dimensions, ni poids. La DURÉE, elle, est celle de la lecture : la page
 * vidéo la remet à chaque seconde (temps restant en lecture, durée totale à
 * l'arrêt), et elle s'affiche même sans porteur — c'est le seul temps que la
 * visionneuse montre.
 *
 * Le décompte n'est PAS une région vivante : un lecteur d'écran qui lirait
 * chaque seconde couvrirait la vidéo. Il le lit en y passant, précédé de ce
 * qu'il mesure (« Temps restant », « Durée »).
 */
export function ViewerInfoLine({
  attachment,
  facts,
  duration,
  language,
}: {
  readonly attachment: Attachment;
  readonly facts: boolean;
  readonly duration: InfoDuration | null;
  readonly language: InterfaceLanguage;
}) {
  const kind = kindOf(attachment);
  const sizeLabel = facts && attachment.width !== undefined && attachment.height !== undefined ? `${attachment.width} × ${attachment.height}` : null;
  const weightLabel = facts ? `${Math.max(1, Math.round(attachment.fileSize / 1024))} Ko` : null;
  const parts = [
    sizeLabel === null ? null : { key: 'size', node: sizeLabel },
    weightLabel === null ? null : { key: 'weight', node: weightLabel },
    duration === null
      ? null
      : {
          key: 'duration',
          node: (
            <span data-viewer-duration={duration.remaining ? 'remaining' : 'total'} className="tabular-nums">
              <span className="sr-only">{translate(language, duration.remaining ? 'media.video.remaining' : 'media.video.duration')} </span>
              {duration.label}
            </span>
          ),
        },
  ].filter((part) => part !== null);
  if (parts.length === 0) return null;

  return (
    <div data-viewer-meta="" className="viewer-ink-muted flex items-center gap-1.5 px-4 text-mini">
      {facts ? <Glyph name={kind === 'video' ? 'fillPlay' : kind === 'audio' ? 'microphone' : 'image'} size={GLYPH_SIZE.xs} /> : null}
      {parts.flatMap((part, at) => [
        ...(at === 0
          ? []
          : [
              <span key={`sep:${part.key}`} aria-hidden="true">
                ·
              </span>,
            ]),
        <span key={part.key}>{part.node}</span>,
      ])}
    </div>
  );
}
