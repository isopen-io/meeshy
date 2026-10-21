import type { CSSProperties, ReactNode } from 'react';

import { requirementPreview, spendPreview } from '@meeshy/shared/utils/game/spend';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { GameDetailFact } from '@/lib/game/detail-families';
import { detailStore } from '@/lib/view/detail-store';
import { factDetail, type ElementDetail } from '@/lib/view/game-detail';
import { formatCount, gameText, levelsLabel } from '@/lib/view/game-copy';

import { PRESS } from './game-press';
import { GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * UN ÉLÉMENT QUI SE TOUCHE (#9563, amendement n° 2) — un badge, un trophée, une
 * pastille, une ligne de donnée, le blason de l'en-tête. Un vrai `<button>` :
 * le doigt, la souris, Entrée et Espace l'ouvrent pareil, et le rebond est celui
 * de tout le jeu (`.game-press`, `styles/game.css`).
 *
 * Il ne sait rien de la modale : il dépose les précisions de SON élément dans le
 * magasin de la page (`detailStore`), avec lui-même pour que le focus lui
 * revienne. `detail` absent (la passerelle ne sert pas l'élément) : rien à
 * ouvrir, donc pas de bouton — le contenu se rend tel quel.
 *
 * `named` : le contenu est un dessin (décoratif) ; le bouton porte alors le nom
 * de l'élément. Sans `named`, le contenu est du texte et se lit tel quel.
 */
export { PRESS };

export function GameTouch({
  detail,
  named = false,
  className = '',
  style,
  marker,
  children,
}: {
  readonly detail: ElementDetail | null;
  readonly named?: boolean;
  /** Des attributs `data-*` de plus, pour qui cherche CE bouton (l'en-tête, un témoin). */
  readonly marker?: Readonly<Record<`data-${string}`, string>>;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
}) {
  if (detail === null) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-detail={detail.id}
      data-detail-name={detail.name}
      aria-haspopup="dialog"
      {...marker}
      {...(named ? { 'aria-label': gameText('game.detail.open', { name: detail.name }) } : {})}
      onClick={(event) => detailStore.open(detail, event.currentTarget)}
      className={`${PRESS} text-start ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Ce qu'un bouton DÉJÀ ÉCRIT (une étape de saison, qui se réclame quand elle est
 * prête) reçoit pour ouvrir les précisions de son élément : les mêmes marques et
 * le même toucher que `GameTouch`, à étaler sur lui.
 */
export function touchProps(detail: ElementDetail) {
  return {
    'data-detail': detail.id,
    'data-detail-name': detail.name,
    'aria-haspopup': 'dialog' as const,
    onClick: (event: { readonly currentTarget: HTMLElement }) => detailStore.open(detail, event.currentTarget),
  };
}

/**
 * CE QU'UN GESTE DÉPENSE OU EXIGE, AVANT LE GESTE (#9705) — une ligne de
 * pastilles posée au-dessus du bouton : ce qu'on a, ce que le geste coûte, ce
 * qui restera ; ou, quand le solde ne suffit pas, combien il manque. Une
 * exigence (un niveau requis) se lit pareil : où l'on en est, le seuil, l'écart.
 *
 * Les chiffres viennent de la loi (`spendPreview`, `requirementPreview`) et
 * du bloc servi, jamais d'une valeur recopiée. Chaque pastille se touche :
 * elle rebondit et ouvre la modale de SES précisions (#9563).
 *
 * Elles vivent ICI, avec l'élément qui se touche, et lisent la loi elles-mêmes :
 * un module à part, partagé par sept écrans, devenait un chunk de plus que le
 * document nomme — la première peinture grossissait de son seul nom.
 */

export type GameFactChip = {
  readonly fact: GameDetailFact;
  readonly label: string;
  readonly value: string;
  /** Les précisions d'un ÉLÉMENT (une étoile de Prestige) plutôt que la phrase de la donnée. */
  readonly detail?: ElementDetail;
};

/** Une rangée de données qui se touchent : chacune rebondit et ouvre SES précisions. */
export function GameFactChips({ concept, chips, marker }: { readonly concept: ProgressionConcept; readonly chips: readonly GameFactChip[]; readonly marker: string }) {
  const attributes = { [marker]: '' };
  return (
    <ul {...attributes} className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip.label} data-chip={chip.fact} className="max-w-full whitespace-nowrap">
          <GameTouch
            detail={chip.detail ?? factDetail(concept, chip.fact, chip.label, chip.value)}
            className="flex min-h-[44px] max-w-full items-baseline gap-1 rounded-chip px-2.5 py-1"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
          >
            <span className="text-check font-semibold" style={{ color: GAME_INK_2 }}>
              {chip.label}
            </span>{' '}
            <span className="truncate text-check font-bold" style={{ color: GAME_INK }}>
              {chip.value}
            </span>
          </GameTouch>
        </li>
      ))}
    </ul>
  );
}

/**
 * CE QU'IL MANQUE EST UNE PHRASE QUI NOMME SON BUT (#10540) — « Il manque 1 Meesh pour acheter un
 * gel. », jamais « Il manque 1 Meesh » : un manque sans cible se lisait à côté de trois autres chiffres
 * sans dire lequel il visait. La phrase se touche comme une pastille et ouvre les précisions de SA donnée.
 */
export type GameMissingLine = {
  readonly fact: GameDetailFact;
  /** Le manque déjà dit dans son unité ; rend la phrase entière, cible comprise. */
  readonly line: (missing: string) => string;
};

function MissingLine({ concept, fact, line, amount }: { readonly concept: ProgressionConcept; readonly fact: GameDetailFact; readonly line: string; readonly amount: string }) {
  return (
    <GameTouch
      detail={factDetail(concept, fact, line, amount)}
      marker={{ 'data-game-missing': fact }}
      className="flex min-h-[44px] items-center rounded-chip px-2.5 py-1 text-caption font-semibold"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 14%, transparent)', color: GAME_INK }}
    >
      {line}
    </GameTouch>
  );
}

export type GameSpendLineProps = {
  readonly concept: ProgressionConcept;
  /** Ce qu'on a ; `spendable` : la part qui paie, quand elle est plus petite (`spendPreview`). */
  readonly held: number;
  readonly cost: number;
  readonly spendable?: number;
  /** Le solde, le prix et le reste dans leur unité (points, Meeshes). */
  readonly format: (count: number) => string;
  /** Le manque, quand il ne se dit pas dans l'unité du solde (les points À CONVERTIR d'une frappe). */
  readonly formatMissing?: (count: number) => string;
  /** La phrase de la pastille du solde, quand le concept en a une plus juste que la générique. */
  readonly heldFact?: GameDetailFact;
  /** Une donnée de plus entre le solde et le prix : la part du solde qui paie (les points à convertir). */
  readonly between?: GameFactChip;
  /** Ce qu'il manque, dit avec son but : aucun geste ne dit « Il manque » sans dire pour quoi. */
  readonly missing: GameMissingLine;
};

/**
 * CE QU'UN GESTE DÉPENSE : ce qu'on a, ce qu'il faut, et ce qu'il manque quand il manque. Jamais ce qui RESTERA
 * (#11178, épopée § 3.3) : une soustraction n'est pas un fait de la fiche, et le solde d'après se lit, après le
 * geste, à sa place.
 */
export function GameSpendLine({ concept, held, cost, spendable, format, formatMissing = format, heldFact = 'spend_held', between, missing }: GameSpendLineProps) {
  const spend = spendPreview(spendable === undefined ? { held, cost } : { held, cost, spendable });
  const chips: readonly GameFactChip[] = [
    { fact: heldFact, label: gameText('game.fact.balance'), value: format(spend.held) },
    ...(between === undefined ? [] : [between]),
    { fact: 'spend_cost', label: gameText('game.fact.cost'), value: format(spend.cost) },
  ];
  return (
    <>
      <GameFactChips concept={concept} chips={chips} marker="data-game-spend" />
      {spend.affordable ? null : <MissingLine concept={concept} fact={missing.fact} line={missing.line(formatMissing(spend.missing))} amount={formatMissing(spend.missing)} />}
    </>
  );
}

export type GameRequirementLineProps = {
  readonly concept: ProgressionConcept;
  readonly current: number;
  readonly required: number;
  /** Le niveau compté est le RECORD (la ligue, le duo), pas le niveau du moment. */
  readonly record?: boolean;
};

export function GameRequirementLine({ concept, current, required, record = false }: GameRequirementLineProps) {
  const requirement = requirementPreview({ current, required });
  const chips: readonly GameFactChip[] = [
    record
      ? { fact: 'level_record', label: gameText('game.fact.record'), value: formatCount(requirement.current) }
      : { fact: 'level_now', label: gameText('game.mint.row.level'), value: formatCount(requirement.current) },
    { fact: 'level_required', label: gameText('game.fact.required'), value: formatCount(requirement.required) },
  ];
  return (
    <>
      <GameFactChips concept={concept} chips={chips} marker="data-game-requirement" />
      {requirement.met ? null : (
        <MissingLine
          concept={concept}
          fact="spend_missing"
          line={gameText('game.spend.missing.unlock', { missing: levelsLabel(requirement.missing) })}
          amount={levelsLabel(requirement.missing)}
        />
      )}
    </>
  );
}
