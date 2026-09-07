import { montreLeBandeau } from '@/lib/realtime/bandeau';

/**
 * `lib/realtime/bandeau.ts` — L'ATOME PARTAGÉ (défaut relevé en revue,
 * #4899) : le geste `hidden = !visible` d'un bandeau différé, site UNIQUE
 * depuis son extraction de `participate.ts`. `lib/realtime/prefs.ts` en est
 * le second appelant — ce témoin garde le CONTRAT que les deux tiennent,
 * indépendamment de qui l'appelle.
 */
describe('montreLeBandeau', () => {
  it('révèle le nœud dont l’identifiant correspond', () => {
    document.body.innerHTML = '<main><div id="bandeau-session-expiree" hidden></div></main>';
    const main = document.querySelector('main') as HTMLElement;

    montreLeBandeau(main, 'bandeau-session-expiree', true);

    expect(document.getElementById('bandeau-session-expiree')?.hidden).toBe(false);
  });

  it('recache le nœud quand on lui redemande', () => {
    document.body.innerHTML = '<main><div id="bandeau-hors-ligne"></div></main>';
    const main = document.querySelector('main') as HTMLElement;

    montreLeBandeau(main, 'bandeau-hors-ligne', false);

    expect(document.getElementById('bandeau-hors-ligne')?.hidden).toBe(true);
  });

  it('ne jette pas quand aucun nœud ne porte cet identifiant — un bandeau non servi n’est pas une erreur', () => {
    document.body.innerHTML = '<main></main>';
    const main = document.querySelector('main') as HTMLElement;

    expect(() => montreLeBandeau(main, 'bandeau-absent', true)).not.toThrow();
  });
});
