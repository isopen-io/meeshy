import { useEffect, useRef, useState } from 'react';

import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';
import { localDayOf } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';

import { Glyph } from './glyph';

import '@/styles/header-flame.css';

/**
 * L'instant où le compte du jour prend sa nouvelle valeur : une fois la
 * flamme prise, à 82 % des 2 s de l'effet (`styles/header-flame.css`, miroir
 * de `HeaderFlameOrbit.valueRelease` côté iOS).
 */
export const FLAME_VALUE_RELEASE_MS = 1640;

const TONGUES = [0, 1, 2] as const;

/**
 * **LA FLAMME DU JOUR SOUS L'AVATAR DE L'EN-TÊTE** (#9031, #9044) — miroir de
 * `HeaderFlameDecoration` (iOS). « 🔥 M » : les points que la conversation a
 * rapportés au lecteur AUJOURD'HUI, abrégés et relus au jour du lecteur
 * (minuit les remet à 0 sans attendre le serveur). Elle ne se montre que
 * tant qu'une série COURT. Posée JUSTE SOUS le cercle de l'avatar, sans le
 * toucher, sans capsule : la flamme et son compte détouré.
 *
 * `replay` compte les messages envoyés : chaque valeur > 0 remonte le calque
 * (`key`) et rejoue l'effet — la flamme baisse, une lueur fait le tour de
 * l'avatar et la rejoint, la flamme S'ALLUME (elle grossit en vacillant, des
 * mèches montent d'elle), puis le compte passe à sa nouvelle valeur. En CSS,
 * sur `transform`/`opacity` seulement (`styles/header-flame.css`). Le toucher
 * la masque ; l'hôte décide quand elle revient.
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
  const shownDay =
    snapshot === undefined ? undefined : conversationEngagementForDay(snapshot, localDayOf(now === undefined ? minute * 60_000 : now()));
  const today = shownDay?.todayPoints ?? 0;
  const latest = useRef(today);
  latest.current = today;
  const [held, setHeld] = useState<number | null>(null);

  useEffect(() => {
    if (replay <= 0) return undefined;
    setHeld((current) => current ?? latest.current);
    const timer = setTimeout(() => setHeld(null), releaseAfterMs);
    return () => clearTimeout(timer);
  }, [replay, releaseAfterMs]);

  if (snapshot === undefined || snapshot.totalPoints <= 0 || (shownDay?.streakDays ?? 0) <= 0) return null;
  const shown = held ?? today;
  const interfaceLanguage = language ?? currentInterfaceLanguage();
  const label = translate(interfaceLanguage, 'engagement.flame.label', { count: String(shown) });

  return (
    <span
      key={replay}
      data-header-flame={shown}
      className={`pointer-events-none absolute inset-0${replay > 0 ? ' header-flame-playing' : ''}`}
    >
      <span className="header-flame-glow" aria-hidden="true" />
      <span className="header-flame-seat">
        <button type="button" onClick={onDismiss} aria-label={label} className="header-flame-mark pointer-events-auto text-mini">
          <span className="header-flame-burner" aria-hidden="true">
            <span className="header-flame-glyph">
              <Glyph name="flameFill" size={13} style={{ color: 'var(--ios-warning)' }} />
            </span>
            {TONGUES.map((index) => (
              <span key={index} data-flame-tongue className={`header-flame-tongue header-flame-tongue-${index}`}>
                <Glyph name="flameFill" size={6} style={{ color: 'var(--color-error)' }} />
              </span>
            ))}
          </span>
          <span key={shown} aria-hidden="true" className={`header-flame-count-digits${replay > 0 ? ' header-flame-count' : ''}`}>
            {compactCount(shown, interfaceLanguage)}
          </span>
        </button>
      </span>
    </span>
  );
}
