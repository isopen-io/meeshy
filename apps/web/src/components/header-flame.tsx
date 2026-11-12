import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';

import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';
import { engagementPillModel, localDayOf } from '@/lib/view/engagement-pill';
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
 * La carte n'existe qu'après un toucher : elle vit dans son propre chunk
 * (`header-flame-card.tsx`), hors du chunk « thread » que chaque ouverture de
 * conversation paie (`budgets.json`).
 */
export const loadFlameCard = () => import('./header-flame-card');
const FlameCard = lazy(() => loadFlameCard().then((m) => ({ default: m.FlameCard })));

/**
 * **LA FLAMME DU JOUR SOUS L'AVATAR DE L'EN-TÊTE** (#9031, #9044) — miroir de
 * `HeaderFlameDecoration` (iOS). « 🔥 M » : les points que la conversation a
 * rapportés au lecteur AUJOURD'HUI, précédés de la série en jours (« 🔥 3 · 42 »), abrégés et relus au jour du lecteur
 * (minuit les remet à 0 sans attendre le serveur). L'en-tête déplié porte la
 * même série et, à la place de M, le TOTAL gagné dans la conversation. Elle ne se montre que
 * tant qu'une série COURT. Posée JUSTE SOUS le cercle de l'avatar, sans le
 * toucher, sans capsule : la flamme et son compte détouré.
 *
 * `replay` compte les messages envoyés : chaque valeur > 0 remonte le calque
 * (`key`) et rejoue l'effet — la flamme baisse, une lueur fait le tour de
 * l'avatar et la rejoint, la flamme S'ALLUME (elle grossit en vacillant, des
 * mèches montent d'elle), puis le compte passe à sa nouvelle valeur. En CSS,
 * sur `transform`/`opacity` seulement (`styles/header-flame.css`). Le toucher
 * ouvre la carte de la série (`FlameCard`, #17770) : série, étincelles du
 * jour, total, un lien vers le Jeu et le masquage — qui ne se fait plus au
 * premier toucher. L'hôte décide quand une flamme masquée revient.
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
  const interfaceLanguage = language ?? currentInterfaceLanguage();
  const day = localDayOf(now === undefined ? minute * 60_000 : now());
  const model = engagementPillModel(snapshot, day, interfaceLanguage);
  const today = snapshot === undefined ? 0 : conversationEngagementForDay(snapshot, day).todayPoints;
  const [cardOpen, setCardOpen] = useState(false);
  const cardId = useId();
  const latest = useRef(today);
  latest.current = today;
  const [held, setHeld] = useState<number | null>(null);

  useEffect(() => {
    if (replay <= 0) return undefined;
    setHeld((current) => current ?? latest.current);
    const timer = setTimeout(() => setHeld(null), releaseAfterMs);
    return () => clearTimeout(timer);
  }, [replay, releaseAfterMs]);

  if (model?.kind !== 'streak') return null;
  const shown = held ?? today;
  const streakDays = model.streakDays;
  const label = model.label;

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
          onClick={() => setCardOpen((open) => !open)}
          aria-label={label}
          aria-expanded={cardOpen}
          aria-controls={cardOpen ? cardId : undefined}
          className="header-flame-mark pointer-events-auto text-mini"
        >
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
          <span aria-hidden="true" data-header-flame-streak={streakDays} className="header-flame-count-digits">
            {`${streakDays} ·`}
          </span>
          <span key={shown} aria-hidden="true" className={`header-flame-count-digits${replay > 0 ? ' header-flame-count' : ''}`}>
            {compactCount(shown, interfaceLanguage)}
          </span>
        </button>
        {cardOpen ? (
          <Suspense fallback={null}>
            <FlameCard
              id={cardId}
              snapshot={snapshot}
              day={day}
              language={interfaceLanguage}
              onClose={() => setCardOpen(false)}
              onHide={() => {
                setCardOpen(false);
                onDismiss();
              }}
            />
          </Suspense>
        ) : null}
      </span>
    </span>
  );
}
