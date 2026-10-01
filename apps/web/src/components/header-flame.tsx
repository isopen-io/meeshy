import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { localDayOf } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';

import { Glyph } from './glyph';

import '@/styles/header-flame.css';

/**
 * **LA FLAMME DU JOUR SOUS L'AVATAR DE L'EN-TÊTE** (#9031) — miroir de
 * `HeaderFlameDecoration` (iOS). « 🔥 M » : les points que la conversation a
 * rapportés au lecteur AUJOURD'HUI, relus au jour du lecteur (minuit les
 * remet à 0 sans attendre le serveur).
 *
 * `replay` compte les messages envoyés : chaque valeur > 0 remonte le calque
 * (`key`), donc rejoue la lueur, le tour et la pulsation — en CSS, sur
 * `transform`/`opacity` seulement (`styles/header-flame.css`). Le toucher la
 * masque ; l'hôte décide quand elle revient.
 *
 * Posée en `absolute` sur la boîte de l'avatar : elle ne déplace rien.
 */
export function HeaderFlame({
  snapshot,
  replay,
  onDismiss,
  language,
  now,
}: {
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  readonly replay: number;
  readonly onDismiss: () => void;
  readonly language?: InterfaceLanguage;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  readonly now?: () => number;
}) {
  const minute = useMinute();
  if (snapshot === undefined || snapshot.totalPoints <= 0) return null;
  const today = conversationEngagementForDay(snapshot, localDayOf(now === undefined ? minute * 60_000 : now())).todayPoints;
  const label = translate(language ?? currentInterfaceLanguage(), 'engagement.flame.label', { count: String(today) });

  return (
    <span
      key={replay}
      data-header-flame={today}
      className={`pointer-events-none absolute inset-0${replay > 0 ? ' header-flame-playing' : ''}`}
    >
      <span className="header-flame-glow" aria-hidden="true" />
      <span className="header-flame-orbit">
        <span className="header-flame-seat">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={label}
            className="header-flame-mark pointer-events-auto text-mini"
          >
            <Glyph name="flameFill" size={11} style={{ color: 'var(--ios-warning)' }} />
            <span aria-hidden="true">{today}</span>
          </button>
        </span>
      </span>
    </span>
  );
}
