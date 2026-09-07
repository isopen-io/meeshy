/**
 * @jest-environment node
 */

import { DESTINATION_PAR_DEFAUT, destination } from '@/app/authentification/remise';

const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const NUL = String.fromCharCode(0);

/**
 * LA REDIRECTION OUVERTE DE LA REMISE.
 *
 * Cette page est rendue juste apres que l'utilisateur a saisi son mot de passe,
 * et son script termine par `location.replace(vers)`. Une destination hors
 * origine y est donc un hameconnage de premiere qualite : l'utilisateur vient
 * de s'authentifier, il fait confiance a l'ecran, et la page d'arrivee peut
 * copier la notre.
 *
 * Le temoin s'ecrit sur les formes que `startsWith('//')` NE VOIT PAS. Les deux
 * cas evidents (`//hote` et `https://hote`) etaient deja refuses : les tester
 * seuls aurait rendu un vert qui ne prouve rien.
 */
describe('destination — seul un chemin de NOTRE origine est suivi', () => {
  it.each([
    ['un chemin simple', '/dashboard', '/dashboard'],
    ['une requete et une ancre, qui survivent', '/conversations?fil=3#bas', '/conversations?fil=3#bas'],
    ['la racine', '/', '/'],
  ])('%s', (_nom, entree, attendu) => {
    expect(destination(entree)).toBe(attendu);
  });

  it.each([
    ['protocole-relatif', '//attaquant.example'],
    ['absolu', 'https://attaquant.example/connexion'],
    ['un schema qui n est pas http', 'javascript:alert(1)'],
    ['relatif sans barre initiale', 'attaquant.example'],
    ['vide', ''],
  ])('refuse %s', (_nom, entree) => {
    expect(destination(entree)).toBe(DESTINATION_PAR_DEFAUT);
  });

  /**
   * LES FORMES QUE LA GARDE D'ORIGINE LAISSAIT PASSER. Toutes commencent par
   * une seule barre : `startsWith('//')` rend `false`, et le chemin partait tel
   * quel dans `location.replace`.
   */
  it.each([
    ['une barre INVERSE, que le navigateur normalise en barre', '/' + '\\' + 'attaquant.example'],
    ['barre puis barre inverse', '/' + '\\' + '/attaquant.example'],
    ['une tabulation, retiree par l analyseur d URL', '/' + TAB + '/attaquant.example'],
    ['un retour chariot', '/a' + CR + 'b'],
    ['un octet nul', '/' + NUL + 'x'],
  ])('refuse %s', (_nom, entree) => {
    expect(destination(entree)).toBe(DESTINATION_PAR_DEFAUT);
  });

  it('refuse null — aucune destination demandee', () => {
    expect(destination(null)).toBe(DESTINATION_PAR_DEFAUT);
  });

  /**
   * Une sequence PERCENT-ENCODEE n'est pas un separateur : `%2f%2f` reste un
   * segment de chemin de notre origine, et le refuser priverait d'un retour
   * legitime. Le temoin le dit pour qu'un durcissement futur ne l'emporte pas
   * par excès de zele.
   */
  it('laisse passer une sequence encodee, qui ne sort pas de l origine', () => {
    expect(destination('/%2f%2fattaquant.example')).toBe('/%2f%2fattaquant.example');
  });
});
