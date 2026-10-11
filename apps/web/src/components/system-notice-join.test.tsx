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

/** Le nom accessible de la rangée : l'`aria-label` de son conteneur. */
const accessibleNameOf = (html: string): string | undefined =>
  /aria-label="([^"]*)"/u.exec(html)?.[1]?.replace(/&#x27;|&#39;/gu, "'");

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

    /* LE MASQUE SUFFIT (#10101, retour porteur 2026-10-11) — « les utilisateurs
       avec un masque = anonyme, pourquoi afficher encore “sans compte” ? » :
       la pastille visible quitte la rangée, le masque reste ; « sans compte »
       passe dans le NOM ACCESSIBLE, dans la langue de l'interface, puisque le
       lecteur d'écran ne voit pas le masque. */
    test(`peau ${surface} : un invité porte le masque, sans la mention « sans compte » à côté de son nom`, () => {
      const row = { kind: 'join', displayName: 'Emma', handle: null, isAnonymous: true } as const;
      const fr = renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="fr" />);
      expect(textOf(fr)).toBe('Emma a rejoint la conversation');
      expect(fr).toContain('data-join-guest');
      const en = renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="en" />);
      expect(textOf(en)).toBe('Emma joined the conversation');
    });

    test(`peau ${surface} : « sans compte » reste dit au lecteur d’écran, dans la langue de l’interface`, () => {
      const row = { kind: 'join', displayName: 'Emma', handle: null, isAnonymous: true } as const;
      expect(accessibleNameOf(renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="fr" />))).toBe(
        'Emma a rejoint la conversation, sans compte',
      );
      expect(accessibleNameOf(renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="en" />))).toBe(
        'Emma joined the conversation, no account',
      );
    });

    test(`peau ${surface} : le glyphe et la phrase ne se collent pas`, () => {
      for (const isAnonymous of [true, false]) {
        const html = renderToStaticMarkup(
          <SystemNotice row={{ kind: 'join', displayName: 'Emma', handle: null, isAnonymous }} timeString="10:04" surface={surface} language="fr" />,
        );
        expect(html).toMatch(/<\/(?:svg|span)> <span>Emma a rejoint la conversation<\/span>/);
      }
    });

    test(`peau ${surface} : un arrivant AVEC compte n'a ni masque ni mention`, () => {
      const row = { kind: 'join', displayName: 'Bob Martin', handle: '@bob', isAnonymous: false } as const;
      const html = renderToStaticMarkup(<SystemNotice row={row} timeString="10:04" surface={surface} language="fr" />);
      expect(html).not.toContain('data-join-guest');
      expect(accessibleNameOf(html)).toBe('Bob Martin a rejoint la conversation');
    });
  }
});
