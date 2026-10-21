import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leagueWeekLinkPath, seasonLinkPath } from '@meeshy/shared/utils/game/game-links';
import { seasonCalendar } from '@meeshy/shared/utils/game/season';
import { match, compile } from '@/lib/router';
import { gameScreenOf } from '@/lib/game/progression-nav';
import { isAppPath } from '@/routes/app-paths';
import { ROUTES } from '@/routes/route-table';

import { cheminDuLienEntrant } from './shell-deep-links';

/**
 * UNE SAISON OU UNE LIGUE, PASSÉE OU FUTURE, S'OUVRE PAR UN LIEN (#9947).
 *
 * La carte d'un événement in-app de l'App Store (saison `NEW_SEASON`, ligue
 * `COMPETITION`) porte un lien `https://meeshy.me/me/progression/saison/{n}` ou
 * `…/ligue/{weekKey}`. iOS ne l'ouvre dans l'app que si l'AASA le réclame ; la
 * coque Android, que si son manifeste le réclame ; le web, que si une route le
 * sert. Ce témoin lit les fichiers LIVRÉS.
 */
const here = dirname(fileURLToPath(import.meta.url));
const AASA = JSON.parse(readFileSync(join(here, '../../../public/.well-known/apple-app-site-association'), 'utf8')) as {
  readonly applinks: { readonly details: readonly { readonly components: readonly { readonly '/': string; readonly exclude?: boolean }[] }[] };
};
const MANIFEST = readFileSync(join(here, '../../../android/app/src/main/AndroidManifest.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const aasaPatterns = AASA.applinks.details.flatMap((detail) => detail.components.filter((c) => c.exclude !== true).map((c) => c['/']));

/** Le motif AASA (`*` = toute suite de caractères) d'un chemin. */
const claimedByAasa = (path: string): boolean =>
  aasaPatterns.some((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(path));

const claimedByAndroid = (path: string): boolean =>
  [...MANIFEST.matchAll(/android:pathPrefix="([^"]*)"/g)].some(([, prefix]) => path.startsWith(prefix ?? '\u0000')) ||
  [...MANIFEST.matchAll(/android:path="([^"]*)"/g)].some(([, exact]) => path === exact);

const S1 = seasonCalendar(1)!;
const SAMPLES = [seasonLinkPath(null), seasonLinkPath(1), seasonLinkPath(12), leagueWeekLinkPath(null), leagueWeekLinkPath(S1.weekKeys[0]!), leagueWeekLinkPath(S1.weekKeys[7]!)];

describe('les liens du Jeu', () => {
  test('l’AASA réclame chaque saison et chaque semaine de ligue, avec et sans paramètre', () => {
    expect(SAMPLES.filter((path) => !claimedByAasa(path))).toEqual([]);
  });

  test('la coque Android les réclame aussi', () => {
    expect(SAMPLES.filter((path) => !claimedByAndroid(path))).toEqual([]);
  });

  test('le routeur web les sert, le paramètre compris', () => {
    expect(SAMPLES.filter((path) => !isAppPath(path))).toEqual([]);
    expect(match(compile(ROUTES.progressionSaisonNumero.pattern), seasonLinkPath(3))).toEqual({ saison: '3' });
    expect(match(compile(ROUTES.progressionLigueSemaine.pattern), leagueWeekLinkPath(S1.weekKeys[2]!))).toEqual({ semaine: S1.weekKeys[2]! });
  });

  test('reçus par la coque, https et meeshy:// arrivent au même écran', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/me/progression/saison/2', isAppPath)).toBe('/me/progression/saison/2');
    expect(cheminDuLienEntrant('meeshy://me/progression/saison/2', isAppPath)).toBe('/me/progression/saison/2');
    expect(cheminDuLienEntrant(`meeshy://me/progression/ligue/${S1.weekKeys[0]!}`, isAppPath)).toBe(`/me/progression/ligue/${S1.weekKeys[0]!}`);
  });

  test('l’AASA ne réclame pas le reste de /me/progression', () => {
    expect(claimedByAasa('/me/progression/reglages')).toBe(false);
  });
});

describe('la carte de navigation', () => {
  test('une saison ou une semaine nommée est la sous-page de sa fiche, comme sa forme nue (#9947)', () => {
    expect(gameScreenOf({ key: 'progressionSaisonNumero', params: { saison: '3' } })).toEqual({ kind: 'subpage', route: 'progressionSaison', concept: 'season' });
    expect(gameScreenOf({ key: 'progressionLigueSemaine', params: { semaine: '2026-10-12' } })).toEqual({ kind: 'subpage', route: 'progressionLigue', concept: 'league' });
  });
});
