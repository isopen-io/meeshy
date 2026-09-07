import { expect, test } from 'bun:test';

import { apparie, compile } from './routeur';

test('un motif sans parametre n apparie que lui-meme', () => {
  const racine = compile('/');
  expect(apparie(racine, '/')).toEqual({});
  expect(apparie(racine, '/c/abc')).toBe(null);
});

test('un parametre est capture et decode', () => {
  const fil = compile('/c/$conversation');
  expect(apparie(fil, '/c/c-equipe')).toEqual({ conversation: 'c-equipe' });
  // Un identifiant qui a voyage dans une URL revient encode : le rendre tel
  // quel ferait chercher une conversation qui n'existe pas.
  expect(apparie(fil, '/c/Lagos%20%C2%B7%20terrain')).toEqual({ conversation: 'Lagos · terrain' });
});

test('un parametre ne traverse JAMAIS une barre oblique', () => {
  // Le temoin qui compte : `([^/]+)` et non `(.+)`. Avec `(.+)`, « /c/a/b »
  // apparierait « /c/$conversation » en rendant « a/b », et un ecran enfant
  // ne prendrait jamais la main.
  const fil = compile('/c/$conversation');
  expect(apparie(fil, '/c/a/b')).toBe(null);
});

test('la barre oblique finale est toleree', () => {
  expect(apparie(compile('/c/$conversation'), '/c/abc/')).toEqual({ conversation: 'abc' });
});

test('les caracteres speciaux du motif sont echappes, pas interpretes', () => {
  // Sans echappement, le point de « /l.json » apparierait n'importe quel
  // caractere — une route qui prend plus large qu'elle ne le dit.
  const route = compile('/l.json');
  expect(apparie(route, '/l.json')).toEqual({});
  expect(apparie(route, '/lXjson')).toBe(null);
});

test('plusieurs parametres dans un motif', () => {
  const media = compile('/c/$conversation/m/$message');
  expect(apparie(media, '/c/eq/m/m4')).toEqual({ conversation: 'eq', message: 'm4' });
});
