import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CONCEPT_EMBLEMS, CONCEPT_EMBLEM_BOX } from '@/lib/game/concept-emblems';

import { ConceptMark } from './concept-emblem';

/**
 * LES TROIS EMBLÈMES NEUFS (#9563, amendement n° 2) — Points, Élans et Tableau
 * de bord n'avaient pas de dessin : une Signature dans une pastille teintée,
 * trois fois la même. Chacun reçoit le sien, dans le langage du jeu (une
 * matière de `paint-defs`, la Signature gravée dedans) :
 *
 *   · Points          — un jeton rond indigo, une étincelle d'or en haut à droite ;
 *   · Élans           — un carré arrondi couleur de flamme, un chevron qui monte ;
 *   · Tableau de bord — un panneau d'argent, trois barres qui grandissent.
 *
 * La GÉOMÉTRIE est une table (`lib/game/concept-emblems.ts`), pas du JSX : c'est
 * elle que l'app iOS recopie, forme pour forme.
 */
const render = (kind: Parameters<typeof ConceptMark>[0]['kind'], size = 64): string => renderToStaticMarkup(<ConceptMark kind={kind} size={size} />);

describe('ConceptMark — trois dessins', () => {
  for (const kind of ['points', 'elans', 'dashboard'] as const) {
    test(`${kind} : un dessin décoratif de ${CONCEPT_EMBLEM_BOX} de côté, à la Signature gravée`, () => {
      const html = render(kind);
      expect(html).toContain(`viewBox="0 0 ${CONCEPT_EMBLEM_BOX} ${CONCEPT_EMBLEM_BOX}"`);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-game-emblem="${kind}"`);
      expect(html).toContain('data-game-signature="engraved"');
      expect(html).toContain('width="64"');
    });

    test(`${kind} : sa matière vient des peintures du jeu, aucune couleur écrite en dur`, () => {
      const html = render(kind);
      expect(html).toContain(`-p-${CONCEPT_EMBLEMS[kind].paint}`);
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });
  }

  test('les trois silhouettes diffèrent : un rond, un carré arrondi, un panneau', () => {
    expect(CONCEPT_EMBLEMS.points.body.shape).toBe('circle');
    expect(CONCEPT_EMBLEMS.elans.body.shape).toBe('rect');
    expect(CONCEPT_EMBLEMS.dashboard.body.shape).toBe('rect');
    expect(CONCEPT_EMBLEMS.elans.body).not.toEqual(CONCEPT_EMBLEMS.dashboard.body);
    const marks = (['points', 'elans', 'dashboard'] as const).map((kind) => JSON.stringify(CONCEPT_EMBLEMS[kind].accents));
    expect(new Set(marks).size).toBe(3);
  });

  test('Points porte une étincelle, Élans un chevron, le tableau de bord trois barres', () => {
    expect(render('points')).toContain('data-game-emblem-accent="spark"');
    expect(render('elans')).toContain('data-game-emblem-accent="chevron"');
    expect(render('dashboard').match(/data-game-emblem-accent="bar"/g)).toHaveLength(3);
  });

  test('deux emblèmes sur la même page ne partagent pas leurs dégradés', () => {
    const html = renderToStaticMarkup(
      <>
        <ConceptMark kind="points" size={36} />
        <ConceptMark kind="points" size={36} />
      </>,
    );
    const ids = [...html.matchAll(/id="([^"]+-p-indigo)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
