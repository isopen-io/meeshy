import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { SystemNotice } from './system-notice';

/* L'AVIS D'ARRIVÉE (#9710) — recette du 2026-10-08 : « Emma joined the
   conversation@ano_Emma ». Sur la peau `row`, le texte n'est pas dans une
   boîte flexible : sans espace écrite, le nom, le handle et la pastille se
   collent. Et la pastille « sans compte » était en dur, en français, sous un
   fil servi en anglais. */

const textOf = (html: string): string =>
  html
    .replace(/<time[^>]*>.*?<\/time>/gu, '')
    .replace(/<[^>]+>/gu, '')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

describe('SystemNotice — avis d’arrivée (#9710)', () => {
  for (const surface of ['row', 'bubble'] as const) {
    test(`peau ${surface} : la phrase, le handle et la pastille sont séparés par une espace`, () => {
      const html = renderToStaticMarkup(
        <SystemNotice row={{ kind: 'join', displayName: 'Bob Martin', handle: '@bob', isAnonymous: false }} timeString="10:04" surface={surface} language="en" />,
      );
      expect(textOf(html)).toBe('Bob Martin joined the conversation @bob');
    });

    test(`peau ${surface} : la pastille « sans compte » parle la langue de l’interface`, () => {
      const row = { kind: 'join', displayName: 'Emma', handle: null, isAnonymous: true } as const;
      expect(textOf(renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="en" />))).toBe(
        'Emma joined the conversation no account',
      );
      expect(textOf(renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="fr" />))).toBe(
        'Emma a rejoint la conversation sans compte',
      );
    });
  }
});
