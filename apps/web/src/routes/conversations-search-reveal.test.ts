import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'conversations.tsx'), 'utf8');

/**
 * #11036 — la liste branche les deux lois de `lib/view/search-bar-reveal.ts`
 * sur la barre de recherche flottante : elle suit le sens du défilement, et la
 * bande des communautés se replie dès qu'on tape.
 */
describe('Meeshy Chats — la barre de recherche et la bande des communautés', () => {
  test('la barre s’escamote et revient selon le sens du défilement du scrollport de la liste', () => {
    expect(source).toContain('useSearchBarScrolledAway(frame)');
    expect(source).toContain('searchBarHidden({ scrolledAway: searchBarScrolledAway, focused: searchFocused, query: search })');
    expect(source).toContain('inert={searchBarAway}');
  });

  test('la bande des communautés ne vit qu’au focus, champ vide', () => {
    expect(source).toContain('searchCommunitiesShown({ focused: searchFocused, query: search }) ? <SearchCommunitiesBand');
    expect(source).not.toContain('{searchFocused ? <SearchCommunitiesBand');
  });

  test('l’escamotage passe par `transform`, jamais par la hauteur réservée : la liste ne saute pas', () => {
    expect(source).toContain("translateY(calc(100% + 16px))");
    expect(source).toContain('paddingBottom: searchBarHeight');
  });

  test('le cadre de l’écran ROGNE sans défiler : la barre escamotée ne lui donne aucune course (#11090)', () => {
    expect(source).toContain('<div className="relative flex h-app flex-col overflow-clip pt-safe">');
    expect(source).not.toContain('<div className="relative flex h-app flex-col overflow-hidden pt-safe">');
  });
});
