import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { FocusStamp } from './focal-focus-overlays';

/* LE TAMPON DE L'ÉLUE EN FOCAL (#9710) — recette du 2026-10-08 : un fil lu en
   anglais disait « Aujourd'hui 12:45 ». `focusStampLabel` attend ses trois
   mots de l'APPELANT ; le seul appelant n'en passait aucun, donc le défaut
   français parlait sous toute locale. */

const textOf = (html: string): string => html.replace(/<[^>]+>/gu, '').replace(/&#x27;|&#39;/gu, "'").trim();

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

const now = new Date(2026, 9, 8, 15, 0);

describe('FocusStamp — les mots relatifs suivent la locale du lecteur (#9710)', () => {
  test('en : Today, Yesterday ; fr : Aujourd’hui', () => {
    const stamp = (sentAt: Date, locale: string) =>
      textOf(renderToStaticMarkup(<FocusStamp sentAt={sentAt} now={now} timeString="12:45" locale={locale} delivery={null} isMine={false} />));
    expect(stamp(new Date(2026, 9, 8, 12, 45), 'en')).toBe('Today 12:45');
    expect(stamp(new Date(2026, 9, 7, 12, 45), 'en')).toBe('Yesterday 12:45');
    expect(stamp(new Date(2026, 9, 8, 12, 45), 'fr')).toBe("Aujourd'hui 12:45");
  });
});
