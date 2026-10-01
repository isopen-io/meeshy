import { useEffect, useRef, useState } from 'react';

import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { localDayOf } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';

import { Glyph } from './glyph';

import '@/styles/header-flame.css';

/**
 * L'instant où la lueur rejoint la flamme, au plus fort de sa croissance :
 * 80 % des 1,6 s de l'effet (`styles/header-flame.css`, miroir de
 * `HeaderFlameOrbit.valueRelease` côté iOS).
 */
export const FLAME_VALUE_RELEASE_MS = 1280;

/**
 * **LA FLAMME DU JOUR SOUS L'AVATAR DE L'EN-TÊTE** (#9031, #9044) — miroir de
 * `HeaderFlameDecoration` (iOS). « 🔥 M » : les points que la conversation a
 * rapportés au lecteur AUJOURD'HUI, relus au jour du lecteur (minuit les
 * remet à 0 sans attendre le serveur). Elle se pose JUSTE SOUS le cercle de
 * l'avatar, jamais par-dessus, et ne bouge pas de sa place.
 *
 * `replay` compte les messages envoyés : chaque valeur > 0 remonte le calque
 * (`key`) et rejoue l'effet — une lueur fait le tour de l'avatar et rejoint la
 * flamme, qui grossit ; à ce moment seulement, le compte passe à sa nouvelle
 * valeur. En CSS, sur `transform`/`opacity` seulement
 * (`styles/header-flame.css`). Le toucher la masque ; l'hôte décide quand elle
 * revient.
 *
 * Posée en `absolute` sur la boîte de l'avatar : elle ne déplace rien.
 */
export function HeaderFlame({
  snapshot,
  replay,
  onDismiss,
  language,
  now,
  releaseAfterMs = FLAME_VALUE_RELEASE_MS,
}: {
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  readonly replay: number;
  readonly onDismiss: () => void;
  readonly language?: InterfaceLanguage;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  readonly now?: () => number;
  /** Délai avant que la nouvelle valeur paraisse — injectable pour les témoins. */
  readonly releaseAfterMs?: number;
}) {
  const minute = useMinute();
  const today =
    snapshot === undefined ? 0 : conversationEngagementForDay(snapshot, localDayOf(now === undefined ? minute * 60_000 : now())).todayPoints;
  const latest = useRef(today);
  latest.current = today;
  const [held, setHeld] = useState<number | null>(null);

  useEffect(() => {
    if (replay <= 0) return undefined;
    setHeld((current) => current ?? latest.current);
    const timer = setTimeout(() => setHeld(null), releaseAfterMs);
    return () => clearTimeout(timer);
  }, [replay, releaseAfterMs]);

  if (snapshot === undefined || snapshot.totalPoints <= 0) return null;
  const shown = held ?? today;
  const label = translate(language ?? currentInterfaceLanguage(), 'engagement.flame.label', { count: String(shown) });

  return (
    <span
      key={replay}
      data-header-flame={shown}
      className={`pointer-events-none absolute inset-0${replay > 0 ? ' header-flame-playing' : ''}`}
    >
      <span className="header-flame-glow" aria-hidden="true" />
      <span className="header-flame-seat">
        <button
          type="button"
          onClick={onDismiss}
          aria-label={label}
          className="header-flame-mark pointer-events-auto text-mini"
        >
          <Glyph name="flameFill" size={11} style={{ color: 'var(--ios-warning)' }} />
          <span key={shown} aria-hidden="true" className={replay > 0 ? 'header-flame-count' : undefined}>
            {shown}
          </span>
        </button>
      </span>
    </span>
  );
}
