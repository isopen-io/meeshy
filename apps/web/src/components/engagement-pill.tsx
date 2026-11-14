import { lazy, Suspense, useId, useState } from 'react';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { engagementPillModel, localDayOf } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';
import { Link } from '@/routes/route-table';

import { Glyph } from './glyph';
import { loadFlameCard } from './header-flame';

import '@/styles/header-flame.css';

const FlameCard = lazy(() => loadFlameCard().then((m) => ({ default: m.FlameCard })));

/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906, #9044) — « 🔥 4 · 1,2 k ».
 *
 * La flamme, la série en jours, un point central, puis les points que cette
 * conversation a rapportés au LECTEUR depuis toujours, abrégés. Sans série en
 * cours, le cumul SEUL, sans flamme, à l'encre tertiaire — le rouge reste la
 * couleur de la série ; cumul nul, rien (#9570). Posée sous le titre de
 * l'en-tête DÉPLIÉ ; replié, c'est la flamme du
 * jour sous l'avatar (`HeaderFlame`) qui parle. La liste porte la série en
 * rouge à côté de l'heure (`ConversationStreakMark`, 2026-10-01).
 *
 * TOUCHABLE dans l'en-tête déplié (`interactive`, #17987) : une série en cours
 * ouvre LA MÊME carte que la flamme repliée (`FlameCard`, #17770) — même objet,
 * même geste, même effet sur les trois plateformes ; le cumul seul, sans
 * flamme donc sans carte, mène à « Ma Légende ».
 *
 * Même rendu que la flamme sous l'avatar replié, sans capsule ni fond : la
 * flamme, puis « série · total » en chiffres rouges cerclés de blanc
 * (`.header-flame-count-digits`, `styles/header-flame.css`).
 *
 * Le texte visible est masqué au lecteur d'écran, qui lit la phrase entière
 * (« Série de 4 jours, 120 points dont 12 aujourd'hui »).
 *
 * Le jour est relu à la MINUTE (`useMinute`, l'horloge partagée) : passé
 * minuit, la série tombe — et la pastille avec elle — sans attendre le serveur.
 */
export function EngagementPill({
  snapshot,
  interactive = false,
  onHideFlame,
  language,
  now,
}: {
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  /** `true` ⇒ la série ouvre la carte de la Flamme, le cumul seul mène à `/me/progression`. */
  readonly interactive?: boolean;
  /** « Masquer la flamme » de la carte — absent, la carte ne le propose pas. */
  readonly onHideFlame?: () => void;
  readonly language?: InterfaceLanguage;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  readonly now?: () => number;
}) {
  const minute = useMinute();
  const [cardOpen, setCardOpen] = useState(false);
  const cardId = useId();
  const interfaceLanguage = language ?? currentInterfaceLanguage();
  const today = localDayOf(now === undefined ? minute * 60_000 : now());
  const model = engagementPillModel(snapshot, today, interfaceLanguage);
  if (model === null) return null;

  const body =
    model.kind === 'streak' ? (
      <>
        <span aria-hidden="true" className="flex items-center gap-0.5 whitespace-nowrap">
          <Glyph name="flameFill" size={13} style={{ color: 'var(--ios-warning)' }} />
          <span className="header-flame-count-digits">
            <span data-engagement-streak={model.streakDays}>{model.streakDays}</span>
            <span> · </span>
            <span data-engagement-points>{model.totalText}</span>
          </span>
        </span>
        <span className="sr-only">{model.label}</span>
      </>
    ) : (
      <>
        <span aria-hidden="true" data-engagement-points className="whitespace-nowrap font-bold" style={{ color: 'var(--color-ios-ink-3)' }}>
          {model.totalText}
        </span>
        <span className="sr-only">{model.label}</span>
      </>
    );
  const className = 'inline-flex shrink-0 items-center text-check tabular-nums';

  if (interactive && model.kind === 'streak') {
    return (
      <span data-engagement-pill={model.kind} className="relative inline-flex shrink-0">
        <button
          type="button"
          onClick={() => setCardOpen((open) => !open)}
          aria-expanded={cardOpen}
          aria-controls={cardOpen ? cardId : undefined}
          className="inline-flex min-h-11 shrink-0 items-center"
        >
          <span className={className}>{body}</span>
        </button>
        {cardOpen ? (
          <Suspense fallback={null}>
            <FlameCard
              id={cardId}
              snapshot={snapshot}
              day={today}
              language={interfaceLanguage}
              onClose={() => setCardOpen(false)}
              {...(onHideFlame === undefined
                ? {}
                : {
                    onHide: () => {
                      setCardOpen(false);
                      onHideFlame();
                    },
                  })}
            />
          </Suspense>
        ) : null}
      </span>
    );
  }

  return interactive ? (
    <Link to="progression" data-engagement-pill={model.kind} className="inline-flex min-h-11 shrink-0 items-center">
      <span className={className}>{body}</span>
    </Link>
  ) : (
    <span data-engagement-pill={model.kind} className={className}>
      {body}
    </span>
  );
}
