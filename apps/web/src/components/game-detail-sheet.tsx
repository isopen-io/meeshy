import { useEffect } from 'react';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import { AtlasStamp, Chest, ConceptMark, Flame, GameBadge, LeagueGem, LevelRing, MeeshCoin, RankBlason, Trophy } from '@/components/game';
import { BadgeLadder, BadgeStars } from '@/components/game/badge-ladder';
import { GameMedal } from '@/components/game/medal';
import { SealMark } from '@/components/game/seal-mark';
import { ProgressBar } from '@/components/progress-bar';
import { ConceptEmblem, ConceptFacts } from '@/components/progression-concept';
import { Sheet } from '@/components/sheet';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { medalOfAxis } from '@/lib/game/medal';
import { BADGES_GUIDE_LINK } from '@/lib/game/badge-guide-link';
import { detailStore, useOpenDetail } from '@/lib/view/detail-store';
import { gameText } from '@/lib/view/game-copy';
import type { DetailEmblem, DetailState, ElementDetail } from '@/lib/view/game-detail';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM } from './game-surface';
import { PRESS } from './game-touch';

import '@/styles/game.css';

/**
 * LA MODALE DE PRÉCISIONS (#9563, amendement n° 2) — UNE pour tous les éléments
 * du jeu. Elle ne sait rien d'un badge ni d'un trophée : elle rend un
 * `ElementDetail` (`lib/view/game-detail.ts`), dans cet ordre —
 *
 *   l'emblème en grand, qui entre avec le ressort du jeu ; le nom (le titre de la
 *   feuille) ; l'état (obtenu et sa date, verrouillé et ce qu'il manque, sa
 *   jauge) ; la rareté quand elle est servie ; « C'est quoi ? » ; « Comment
 *   l'obtenir » ou « Ce que ça donne » ; les lignes en plus ; « Voir la fiche »
 *   hors de la fiche du concept.
 *
 * Elle vit sur la feuille partagée (`components/sheet.tsx`, présentation basse) :
 * un `<dialog>` modal, donc le focus piégé, Échap, le retour matériel ; un
 * toucher sur le voile la ferme, et le focus revient à l'élément touché.
 */

const EMBLEM = 112;

function Emblem({ emblem, view }: { readonly emblem: DetailEmblem; readonly view: EngagementWithGame }) {
  switch (emblem.kind) {
    case 'concept':
      return <ConceptEmblem concept={emblem.concept} view={view} size={EMBLEM} />;
    case 'medal': {
      const medal = medalOfAxis(emblem.axis);
      return (
        <GameMedal
          size={EMBLEM}
          family={medal.family}
          pictogram={medal.pictogram}
          tier={medal.tier}
          progress={medal.progress}
          {...(medal.threshold === null ? {} : { threshold: String(medal.threshold) })}
          {...(medal.missing === null ? {} : { missing: `−${medal.missing}` })}
        />
      );
    }
    case 'badge':
      return <GameBadge shape={emblem.shape} size={EMBLEM} imprint={emblem.imprint} />;
    case 'trophy':
      return <Trophy kind={emblem.trophy} size={EMBLEM} {...(emblem.material === null ? {} : { material: emblem.material })} />;
    case 'stamp':
      return <AtlasStamp code={emblem.language} size={EMBLEM} />;
    case 'seal':
      return <SealMark owned={emblem.owned} reached size={EMBLEM} />;
    case 'gem':
      return <LeagueGem league={emblem.league} size={EMBLEM} />;
    case 'ring':
      return <LevelRing level={emblem.level} tier={emblem.tier} progress={emblem.progress} size={EMBLEM} prestige={emblem.prestige} showTier />;
    case 'rank':
      return <RankBlason rank={emblem.rank} division={emblem.division} size={EMBLEM} />;
    case 'flame':
      return <Flame form={emblem.form} size={EMBLEM} out={emblem.out} />;
    case 'chest':
      return <Chest state={emblem.open ? 'open' : 'closed'} size={EMBLEM} />;
    case 'coin':
      return <MeeshCoin side="obverse" size={EMBLEM} edition={emblem.edition} />;
    case 'mark':
      return <ConceptMark kind={emblem.mark} size={EMBLEM} />;
  }
}

const STATE_TINT: Readonly<Record<DetailState['kind'], string>> = { earned: GAME_GOOD, locked: GAME_INK_2, value: GAME_INK };

function State({ detail }: { readonly detail: ElementDetail }) {
  const { state, rarity } = detail;
  return (
    <div data-detail-state={state.kind} className="flex w-full flex-col items-center gap-2 text-center">
      <p className="text-title font-bold" style={{ color: STATE_TINT[state.kind] }}>
        {state.line}
      </p>
      {state.kind === 'locked' && state.missing !== null ? (
        <p data-detail-missing="" className="text-caption" style={{ color: GAME_INK }}>
          {state.missing}
        </p>
      ) : null}
      {state.kind !== 'earned' && state.gauge !== null ? <ProgressBar progress={state.gauge} tint={GAME_BRAND} label={`${detail.name} — ${state.line}`} /> : null}
      {rarity === null ? null : (
        <p data-detail-rarity="" className="text-caption font-semibold" style={{ color: GAME_INK_2 }}>
          {gameText('game.detail.rarity')} : {rarity.name} · {rarity.share}
        </p>
      )}
    </div>
  );
}

function Explained({ marker, label, text }: { readonly marker: 'what' | 'how'; readonly label: string; readonly text: string }) {
  return (
    <section {...{ [`data-detail-${marker}`]: '' }} className="flex w-full flex-col gap-1">
      <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {label}
      </h3>
      <p className="text-body" style={{ color: GAME_INK }}>
        {text}
      </p>
    </section>
  );
}

export function GameDetailSheet({
  detail,
  view,
  fiche,
  opener,
  onClose,
}: {
  readonly detail: ElementDetail;
  readonly view: EngagementWithGame;
  /** La fiche déjà ouverte derrière la modale : « Voir la fiche » ne s'y propose pas. */
  readonly fiche?: ProgressionConcept | undefined;
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
}) {
  const concept = detail.concept;
  return (
    <Sheet
      title={detail.name}
      presentation="bottom"
      bodyAs="div"
      backEntry
      restoreFocusTo={opener}
      dialogData={{ 'data-game-detail': detail.id }}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-4 break-words px-5 pb-5 pt-1">
        <span data-detail-emblem="" aria-hidden="true" className="game-pop grid place-items-center" style={{ minHeight: EMBLEM }}>
          <Emblem emblem={detail.emblem} view={view} />
        </span>
        <State detail={detail} />
        {detail.badge === undefined ? null : (
          <>
            <BadgeStars stars={detail.badge.stars} />
            <p data-badge-reason="" className="text-body text-center" style={{ color: GAME_INK }}>
              {detail.badge.reason}
            </p>
          </>
        )}
        <Explained marker="what" label={detail.whatLabel ?? gameText('game.fiche.what')} text={detail.what} />
        {detail.how === null ? null : (
          <Explained marker="how" label={gameText(detail.how.label === 'obtain' ? 'game.detail.obtain_label' : 'game.detail.gives_label')} text={detail.how.text} />
        )}
        {detail.badge === undefined ? null : <BadgeLadder view={detail.badge} />}
        {detail.facts.length === 0 ? null : (
          <div className="w-full">
            <ConceptFacts facts={detail.facts} />
          </div>
        )}
        {detail.badge === undefined ? null : (
          <Link
            to={BADGES_GUIDE_LINK.to}
            search={BADGES_GUIDE_LINK.search}
            data-badge-guide-link=""
            onClick={onClose}
            className={`${PRESS} flex w-full items-center justify-center rounded-chip px-4 text-body font-semibold`}
            style={{ minHeight: 44, color: GAME_BRAND }}
          >
            {gameText('game.badge.guide_link')}
          </Link>
        )}
        {concept === null || concept === fiche ? null : (
          <Link
            to="progressionConcept"
            params={{ concept }}
            data-detail-fiche={concept}
            onClick={onClose}
            className={`${PRESS} flex w-full items-center justify-center rounded-chip px-4 text-body font-bold`}
            style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
          >
            {gameText('game.detail.see_fiche')}
          </Link>
        )}
      </div>
    </Sheet>
  );
}

/**
 * L'HÔTE de la modale : un par page de Progression. Il rend ce que le magasin
 * porte, et le vide en partant — une modale ouverte ne suit pas son lecteur sur
 * la page suivante.
 */
export function GameDetailHost({ progress, fiche }: { readonly progress: EngagementWithGame; readonly fiche?: ProgressionConcept | undefined }) {
  const open = useOpenDetail();
  useEffect(() => () => detailStore.close(), []);
  if (open === null) return null;
  return <GameDetailSheet key={open.detail.id} detail={open.detail} view={progress} fiche={fiche} opener={open.opener} onClose={detailStore.close} />;
}
