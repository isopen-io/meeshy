import { useSyncExternalStore, type ReactElement } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { sendProgressStore } from '@/lib/send/send-progress';

const RADIUS = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * LA PASTILLE D'ENVOI QUI PROGRESSE (#16134, jumelle de #14702) — un anneau et
 * le pourcentage, à la place de l'horloge, tant que le téléversement de CE
 * message avance. Composant FEUILLE : seul lui s'abonne à sa fraction (entière,
 * en %), donc un point gagné ne redessine que cette pastille. Sans fraction
 * connue, c'est `fallback` (l'horloge) qui se rend.
 */
export function SendProgressMark({ progressKey, fallback }: { progressKey: string; fallback: ReactElement }) {
  const read = (): number | undefined => {
    const fraction = sendProgressStore.getState().fractions[progressKey];
    return fraction === undefined ? undefined : Math.round(fraction * 100);
  };
  const percent = useSyncExternalStore(sendProgressStore.subscribe, read, read);
  if (percent === undefined) return fallback;
  return (
    <span
      role="progressbar"
      aria-label={translate(currentInterfaceLanguage(), 'message.status.sending')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="inline-flex items-center gap-1"
      style={{ fontSize: 10, lineHeight: 1 }}
    >
      <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <circle cx={7} cy={7} r={RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
        <circle
          cx={7}
          cy={7}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          transform="rotate(-90 7 7)"
        />
      </svg>
      <span aria-hidden="true">{percent}%</span>
    </span>
  );
}
