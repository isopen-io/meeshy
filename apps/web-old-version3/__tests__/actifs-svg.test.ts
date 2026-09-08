import { svgDuSprite } from '@/app/actifs-inlines';

/**
 * UN GLYPHE SANS TAILLE EST UN GLYPHE GÉANT — mesuré sur staging le 2026-09-06.
 *
 * `svgDuSprite` émettait un `<svg viewBox="0 0 256 256">` sans width ni
 * height : dans tout hôte dont la feuille ne borne pas `svg{...}`, l'icône
 * prenait 100 % du conteneur — la pellicule du lien « réels » de `/feed`
 * remplissait l'écran entier (capture porteur). La taille par défaut est
 * `1em` : le glyphe suit le corps de texte de son hôte, et les feuilles qui
 * posent `svg{width:var(--glyph-inline)}` continuent de gagner — le CSS
 * l'emporte toujours sur un attribut de présentation.
 */
describe('svgDuSprite est borné par construction', () => {
  it('émet width et height à 1em — aucun hôte oublié ne peut rendre un glyphe géant', () => {
    const svg = svgDuSprite('ph-film-strip');
    expect(svg).toContain('width="1em"');
    expect(svg).toContain('height="1em"');
    expect(svg).toContain('aria-hidden="true"');
  });
});
