import { expect, test } from 'bun:test';

import { match, compile, routeKey } from './router';

test('un motif sans parametre n apparie que lui-meme', () => {
  const root = compile('/');
  expect(match(root, '/')).toEqual({});
  expect(match(root, '/c/abc')).toBe(null);
});

test('un parametre est capture et decode', () => {
  const thread = compile('/c/$conversation');
  expect(match(thread, '/c/c-equipe')).toEqual({ conversation: 'c-equipe' });
  // Un identifiant qui a voyage dans une URL revient encode : le rendre tel
  // quel ferait chercher une conversation qui n'existe pas.
  expect(match(thread, '/c/Lagos%20%C2%B7%20terrain')).toEqual({ conversation: 'Lagos · terrain' });
});

test('un parametre ne traverse JAMAIS une barre oblique', () => {
  // Le temoin qui compte : `([^/]+)` et non `(.+)`. Avec `(.+)`, « /c/a/b »
  // apparierait « /c/$conversation » en rendant « a/b », et un ecran enfant
  // ne prendrait jamais la main.
  const thread = compile('/c/$conversation');
  expect(match(thread, '/c/a/b')).toBe(null);
});

test('la barre oblique finale est toleree', () => {
  expect(match(compile('/c/$conversation'), '/c/abc/')).toEqual({ conversation: 'abc' });
});

test('les caracteres speciaux du motif sont echappes, pas interpretes', () => {
  // Sans echappement, le point de « /l.json » apparierait n'importe quel
  // caractere — une route qui prend plus large qu'elle ne le dit.
  const route = compile('/l.json');
  expect(match(route, '/l.json')).toEqual({});
  expect(match(route, '/lXjson')).toBe(null);
});

test('plusieurs parametres dans un motif', () => {
  const media = compile('/c/$conversation/m/$message');
  expect(match(media, '/c/eq/m/m4')).toEqual({ conversation: 'eq', message: 'm4' });
});

// --- routeKey (#5566, defaut 8 : un fil -> un autre fil ne remontait pas
// l'ecran, donc n'en reinitialisait aucun useState).
test('routeKey : meme route, memes parametres -> meme cle', () => {
  expect(routeKey({ key: '/c/$conversation', params: { conversation: 'c-a' } })).toBe(
    routeKey({ key: '/c/$conversation', params: { conversation: 'c-a' } }),
  );
});

test('routeKey : meme route, parametre DIFFERENT -> cle DIFFERENTE (le defaut mesure)', () => {
  const a = routeKey({ key: '/c/$conversation', params: { conversation: 'c-a' } });
  const b = routeKey({ key: '/c/$conversation', params: { conversation: 'c-b' } });
  expect(a).not.toBe(b);
});

test('routeKey : route SANS parametre -> juste la cle de route', () => {
  expect(routeKey({ key: '/', params: {} })).toBe('/');
});

test('routeKey : insensible a l ordre des parametres', () => {
  const a = routeKey({ key: '/c/$c/m/$m', params: { c: 'x', m: 'y' } });
  const b = routeKey({ key: '/c/$c/m/$m', params: { m: 'y', c: 'x' } });
  expect(a).toBe(b);
});
