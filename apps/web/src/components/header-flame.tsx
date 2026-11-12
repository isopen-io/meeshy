import { useEffect, useId, useRef, useState } from 'react';

import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';
import { engagementPillModel, flameCardModel, localDayOf, type FlameCardModel } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';
import { Link } from '@/routes/route-table';

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
  const card = flameCardModel(snapshot, day, interfaceLanguage);
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
        {cardOpen && card !== null ? (
          <FlameCard
            id={cardId}
            model={card}
            language={interfaceLanguage}
            onClose={() => setCardOpen(false)}
            onHide={() => {
              setCardOpen(false);
              onDismiss();
            }}
          />
        ) : null}
      </span>
    </span>
  );
}

/**
 * **LA CARTE DE LA SÉRIE** (#17770) — ce que le toucher sur la flamme ouvre :
 * la série en grand, les étincelles du jour, le total gagné ici, puis « Voir
 * le jeu » (`/me/progression`, la même destination que la pastille dépliée)
 * et « Masquer la flamme ». Échap ou un toucher hors de la carte la referme.
 * Les nombres sont lus depuis l'instantané déjà en main : aucune attente.
 */
function FlameCard({
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
  readonly onHide: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    const onPointer = (event: PointerEvent) => {
      const card = ref.current;
      const target = event.target;
      if (card === null || !(target instanceof Node)) return;
      if (card.contains(target) || card.parentElement?.contains(target)) return;
      close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
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
        <span data-flame-card-streak className="text-title2 font-bold tabular-nums">
          {model.streakDays}
        </span>
        <span className="text-footnote font-semibold">{model.streakText}</span>
      </div>
      <dl className="flex flex-col gap-1 text-footnote">
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
        <Link to="progression" className="header-flame-card-primary min-h-11 flex-1">
          {translate(language, 'engagement.card.open')}
        </Link>
        <button type="button" data-flame-card-hide onClick={onHide} className="header-flame-card-secondary min-h-11">
          {translate(language, 'engagement.card.hide')}
        </button>
      </div>
    </div>
  );
}
