/**
 * W2 — l'éventail web. Deux lois, tenues littéralement.
 *
 * **Loi 4 (doctrine des planches, non négociable) : un format absent de
 * l'éventail n'est pas GRISÉ, il n'est PAS AFFICHÉ.** Un `disabled` ou un
 * `aria-disabled` serait une régression, pas une politesse : il promet une
 * affordance que la composition courante ne porte pas. Corollaire tenu ici :
 * un éventail à UNE entrée n'affiche AUCUN sélecteur — il n'y a rien à
 * choisir.
 *
 * **Loi 5 — l'éventail du repost est CONSOMMÉ, jamais rejoué.** Les vecteurs
 * de repost de cette suite passent par `webComposerOpening` (donc par
 * `repostFormats()` du contrat partagé) : ce fichier n'écrit nulle part que
 * reposter un post n'offre pas l'ancrage deux fois — il le LIT.
 *
 * **Le repli, et son asymétrie.** Une sélection qui quitte l'éventail
 * rebascule sur le premier format offert. L'inverse n'est PAS vrai :
 * re-qualifier ne repousse personne vers RÉEL — y revenir reste un geste
 * explicite de l'auteur.
 *
 * La politique d'éventail vit ICI, côté web, et pas dans `packages/shared` :
 * la loi 1 interdit de descendre des affordances dans le contrat partagé. Le
 * plan du lot 6 nomme un jumeau iOS (`ComposerFormatFan.swift`) ; cette suite
 * ne l'a ni lu ni exécuté et n'affirme rien de son état — elle est la seule
 * preuve que la politique tient côté web.
 *
 * Le mock de `useI18n` rend la CLÉ quand aucun repli n'est passé, et le REPLI
 * quand il l'est. Asserter que le libellé rendu est exactement la clé prouve
 * donc les deux moitiés du piège n°3 : la chaîne passe par `t()`, ET aucun
 * repli anglais en dur ne la double.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ComposerFormatFan, resolveFanFormat } from '@/components/composer/ComposerFormatFan';
import { webComposerOpening } from '@/lib/composer-door';
import { COMPOSER_DOORS, COMPOSER_FORMATS, type ComposerDoor } from '@meeshy/shared/utils/composer-contract';
import type { ReelMediaLike } from '@meeshy/shared/utils/reel-composition';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

const NOTHING: ReadonlyArray<ReelMediaLike> = [];
const TWO_IMAGES: ReadonlyArray<ReelMediaLike> = [
  { mimeType: 'image/jpeg' },
  { mimeType: 'image/png' },
];

const radioNames = (): string[] =>
  screen.queryAllByRole('radio').map((node) => node.textContent?.trim() ?? '');

describe("W2 — loi 4 : un éventail sans choix n'affiche RIEN", () => {
  it('un éventail à une seule entrée ne peint aucun sélecteur', () => {
    const { container } = render(
      <ComposerFormatFan offered={['status']} selected="status" onSelect={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it("un éventail VIDE ne peint rien et ne fabrique aucun format", () => {
    const onSelect = jest.fn();
    const { container } = render(
      <ComposerFormatFan offered={[]} selected="post" onSelect={onSelect} />,
    );

    expect(container.firstChild).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("le repost d'un POST ne peint rien — l'ancrage n'est pas offert deux fois (loi 5, LUE du contrat)", () => {
    const opening = webComposerOpening({ kind: 'repost', sourceFormat: 'post' }, NOTHING);
    const { container } = render(
      <ComposerFormatFan
        offered={opening.offeredFormats}
        selected={opening.initialFormat}
        onSelect={jest.fn()}
      />,
    );

    expect(opening.offeredFormats).toEqual(['post']);
    expect(container.firstChild).toBeNull();
  });
});

describe("W2 — loi 4 : un format non offert n'a AUCUN nœud dans le DOM", () => {
  it("RÉEL est absent — pas grisé — quand la composition ne qualifie pas", () => {
    const opening = webComposerOpening({ kind: 'feedComposer' }, NOTHING);
    const { container } = render(
      <ComposerFormatFan
        offered={opening.offeredFormats}
        selected={opening.initialFormat}
        onSelect={jest.fn()}
      />,
    );

    expect(radioNames()).toEqual(['composer.format.post', 'composer.format.story']);
    expect(screen.queryByRole('radio', { name: 'composer.format.reel' })).toBeNull();
    expect(screen.queryByText('composer.format.reel')).toBeNull();
  });

  it("aucun nœud de l'éventail ne porte `disabled` ni `aria-disabled`", () => {
    const { container } = render(
      <ComposerFormatFan offered={['post', 'story']} selected="post" onSelect={jest.fn()} />,
    );

    expect(container.querySelectorAll('[disabled]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-disabled]')).toHaveLength(0);
  });

  it('RÉEL apparaît dès que la composition qualifie', () => {
    const opening = webComposerOpening({ kind: 'feedComposer' }, TWO_IMAGES);
    render(
      <ComposerFormatFan
        offered={opening.offeredFormats}
        selected={opening.initialFormat}
        onSelect={jest.fn()}
      />,
    );

    expect(radioNames()).toEqual([
      'composer.format.post',
      'composer.format.story',
      'composer.format.reel',
    ]);
  });

  it("le repost d'un RÉEL offre enfin l'ancrage — deux entrées, dans l'ordre du contrat (loi 5, LUE)", () => {
    const opening = webComposerOpening({ kind: 'repost', sourceFormat: 'reel' }, NOTHING);
    render(
      <ComposerFormatFan
        offered={opening.offeredFormats}
        selected={opening.initialFormat}
        onSelect={jest.fn()}
      />,
    );

    expect(radioNames()).toEqual(['composer.format.reel', 'composer.format.post']);
  });

  it("l'éventail peint EXACTEMENT ce que la porte offre, pour les neuf portes", () => {
    const doorFor = (kind: (typeof COMPOSER_DOORS)[number]): ComposerDoor =>
      kind === 'repost'
        ? { kind, sourceFormat: 'story' }
        : kind === 'edit'
          ? { kind, documentFormat: 'reel' }
          : ({ kind } as ComposerDoor);

    COMPOSER_DOORS.forEach((kind) => {
      const opening = webComposerOpening(doorFor(kind), TWO_IMAGES);
      const view = render(
        <ComposerFormatFan
          offered={opening.offeredFormats}
          selected={opening.initialFormat}
          onSelect={jest.fn()}
        />,
      );

      const expected =
        opening.offeredFormats.length <= 1
          ? []
          : opening.offeredFormats.map((format) => `composer.format.${format}`);
      expect(radioNames()).toEqual(expected);

      view.unmount();
    });
  });
});

describe('W2 — le repli, et son asymétrie délibérée', () => {
  it('une sélection qui QUITTE l\'éventail rebascule sur le premier format offert', () => {
    const onSelect = jest.fn();
    render(<ComposerFormatFan offered={['post', 'story']} selected="reel" onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('post');
    expect(screen.getByRole('radio', { name: 'composer.format.post' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it("le repli tient MÊME quand l'éventail n'a plus rien à peindre — un RÉEL non qualifiant ne peut pas fuir", () => {
    const onSelect = jest.fn();
    const { container } = render(
      <ComposerFormatFan offered={['post']} selected="reel" onSelect={onSelect} />,
    );

    expect(container.firstChild).toBeNull();
    expect(onSelect).toHaveBeenCalledWith('post');
  });

  it('re-qualifier ne rebascule PAS vers RÉEL — y revenir reste un geste de l\'auteur', () => {
    const onSelect = jest.fn();
    const view = render(
      <ComposerFormatFan offered={['post', 'story']} selected="post" onSelect={onSelect} />,
    );

    view.rerender(
      <ComposerFormatFan offered={['post', 'story', 'reel']} selected="post" onSelect={onSelect} />,
    );

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'composer.format.post' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it("une sélection déjà offerte n'est jamais corrigée, et ne rappelle pas l'appelant", () => {
    const onSelect = jest.fn();
    const view = render(
      <ComposerFormatFan offered={['post', 'story']} selected="story" onSelect={onSelect} />,
    );

    view.rerender(
      <ComposerFormatFan offered={['post', 'story']} selected="story" onSelect={onSelect} />,
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("le repli ne se rejoue pas une fois que l'appelant a convergé", () => {
    const onSelect = jest.fn();
    const view = render(
      <ComposerFormatFan offered={['post', 'story']} selected="reel" onSelect={onSelect} />,
    );
    expect(onSelect).toHaveBeenCalledTimes(1);

    view.rerender(
      <ComposerFormatFan offered={['post', 'story']} selected="post" onSelect={onSelect} />,
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('W2 — `resolveFanFormat`, la politique nue', () => {
  it('rend la sélection courante quand elle est offerte', () => {
    expect(resolveFanFormat(['post', 'story', 'reel'], 'reel')).toBe('reel');
  });

  it('rend le PREMIER format offert quand la sélection en est sortie', () => {
    expect(resolveFanFormat(['story', 'post'], 'reel')).toBe('story');
  });

  it("ne fabrique aucun format quand l'éventail est vide", () => {
    expect(resolveFanFormat([], 'reel')).toBe('reel');
  });

  it("ne corrige JAMAIS le format initial d'une porte, pour les neuf portes", () => {
    const doors: ComposerDoor[] = [
      { kind: 'storyTray' },
      { kind: 'feedComposer' },
      { kind: 'reelTab' },
      { kind: 'moodChip' },
      { kind: 'repost', sourceFormat: 'story' },
      { kind: 'edit', documentFormat: 'post' },
      { kind: 'draft' },
      { kind: 'share' },
      { kind: 'conversationMedia' },
    ];

    expect(doors).toHaveLength(COMPOSER_DOORS.length);

    [NOTHING, TWO_IMAGES].forEach((composition) => {
      doors.forEach((door) => {
        const opening = webComposerOpening(door, composition);
        expect(resolveFanFormat(opening.offeredFormats, opening.initialFormat)).toBe(
          opening.initialFormat,
        );
      });
    });
  });
});

describe('W2 — les libellés viennent du catalogue, aucun anglais en dur', () => {
  // Les formats sont LUS du contrat partagé : une liste réécrite ici ne
  // rougirait pas le jour où un cinquième format entre dans l'union — elle
  // n'aurait simplement jamais peint le nouveau membre.
  const ALL_FOUR = COMPOSER_FORMATS;

  it('chaque format du contrat porte un libellé qui est exactement sa clé — donc aucun repli inline', () => {
    render(<ComposerFormatFan offered={ALL_FOUR} selected="post" onSelect={jest.fn()} />);

    ALL_FOUR.forEach((format) => {
      expect(screen.getByRole('radio', { name: `composer.format.${format}` })).toBeInTheDocument();
    });
  });

  /**
   * La table d'icônes est un `Record<ComposerFormat, …>` : seul `tsc` la tient
   * exhaustive, et AUCUN gate de ce dépôt ne type-vérifie `apps/web`
   * (jest passe par SWC, `next.config.js` porte `ignoreBuildErrors: true`).
   * Ce test est donc la seule preuve EXÉCUTÉE qu'aucun format du contrat
   * n'arrive sans son icône — sans lui, `FORMAT_ICON[format]` rendrait
   * `undefined` et le rendu jetterait « Element type is invalid » à l'écran.
   */
  it('chaque format du contrat porte une icône — aucun ne rend `undefined`', () => {
    const { container } = render(
      <ComposerFormatFan offered={ALL_FOUR} selected="post" onSelect={jest.fn()} />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(COMPOSER_FORMATS.length);
    expect(container.querySelectorAll('[role="radio"] svg')).toHaveLength(COMPOSER_FORMATS.length);
  });

  it("le groupe porte un nom accessible, lui aussi pris au catalogue", () => {
    render(<ComposerFormatFan offered={ALL_FOUR} selected="post" onSelect={jest.fn()} />);

    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-label',
      'composer.format.groupLabel',
    );
  });

  it("aucun mot anglais de format n'apparaît dans le rendu", () => {
    const { container } = render(
      <ComposerFormatFan offered={ALL_FOUR} selected="post" onSelect={jest.fn()} />,
    );

    expect(container.innerHTML).not.toMatch(/\b(Post|Story|Reel|Status|Mood)\b/);
  });
});

describe('W2 — la sélection', () => {
  it("un clic rend le format choisi à l'appelant", () => {
    const onSelect = jest.fn();
    render(<ComposerFormatFan offered={['post', 'story']} selected="post" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('radio', { name: 'composer.format.story' }));

    expect(onSelect).toHaveBeenCalledWith('story');
  });

  it('une seule entrée est cochée à la fois', () => {
    render(
      <ComposerFormatFan offered={['post', 'story', 'reel']} selected="story" onSelect={jest.fn()} />,
    );

    const checked = screen
      .getAllByRole('radio')
      .filter((node) => node.getAttribute('aria-checked') === 'true');

    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent('composer.format.story');
  });
});
