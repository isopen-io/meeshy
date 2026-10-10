import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { LinkArrival } from '@/lib/api/link-arrivals';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { arrivalsFooterState, arrivalsScreenState, ArrivalsFooter, ArrivalsList, flattenArrivals } from './share-link-arrivals-parts';

/**
 * LA LISTE COMPLÈTE DES ARRIVÉES D'UN LIEN (#7813) — chaque ligne dit qui,
 * avec ou sans compte, d'où, dans quelle langue et quand ; la liste dit
 * chargement, vide, refus et erreur ; le pied de liste charge la suite, la
 * dit en cours, en échec (sans rien effacer) ou finie.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInviteCatalog('fr'), loadInviteCatalog('ar')]);
  ensureHappyDomRegistered({ url: 'http://localhost/links/share/mshy_l1/arrivals' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const plain = (html: string) => html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');

const NOW = new Date('2026-09-24T12:00:00.000Z');

const arrival = (overrides: Partial<LinkArrival> = {}): LinkArrival => ({
  displayName: 'Priya',
  isAnonymous: true,
  country: 'IN',
  language: 'en',
  joinedAt: '2026-09-24T11:58:00.000Z',
  ...overrides,
});

describe('une ligne d’arrivée', () => {
  test('dit le nom, « sans compte », le pays, la langue et l’ancienneté', () => {
    const html = renderToStaticMarkup(<ArrivalsList language="fr" arrivals={[arrival()]} now={NOW} />);
    const text = plain(html);
    expect(text).toContain('Priya');
    expect(text).toContain('sans compte');
    expect(html).toContain('aria-label="Inde"');
    expect(text).toContain('English');
    expect(html).toContain('lang="en"');
    expect(text).toContain('il y a 2 min');
  });

  test('un compte n’a pas de badge ; un pays ou une langue inconnus ne dessinent rien', () => {
    const html = renderToStaticMarkup(<ArrivalsList language="fr" arrivals={[arrival({ isAnonymous: false, country: null, language: null })]} now={NOW} />);
    expect(html).not.toContain('data-link-arrival-anonymous');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('data-link-arrival-language');
  });

  test('deux homonymes arrivés au même instant restent deux lignes', () => {
    const html = renderToStaticMarkup(<ArrivalsList language="fr" arrivals={[arrival(), arrival()]} now={NOW} />);
    expect(html.match(/data-link-arrival=/gu)).toHaveLength(2);
  });
});

describe('l’état de l’écran', () => {
  test('des arrivées en main se montrent, même pendant une erreur de revalidation', () => {
    expect(arrivalsScreenState({ arrivals: [arrival()], isError: true, errorStatus: 500 })).toBe('list');
  });

  test('aucune arrivée lue : chargement, puis vide', () => {
    expect(arrivalsScreenState({ arrivals: undefined, isError: false, errorStatus: null })).toBe('loading');
    expect(arrivalsScreenState({ arrivals: [], isError: false, errorStatus: null })).toBe('empty');
  });

  test('un refus gagne sur ce qui est en main : des droits retirés ne laissent rien lire', () => {
    expect(arrivalsScreenState({ arrivals: [arrival()], isError: true, errorStatus: 403 })).toBe('refused');
  });

  test('un refus (403, 404) n’est pas une panne : il n’offre pas de réessayer', () => {
    expect(arrivalsScreenState({ arrivals: undefined, isError: true, errorStatus: 403 })).toBe('refused');
    expect(arrivalsScreenState({ arrivals: undefined, isError: true, errorStatus: 404 })).toBe('refused');
    expect(arrivalsScreenState({ arrivals: undefined, isError: true, errorStatus: 0 })).toBe('error');
  });

  test('les pages se mettent bout à bout', () => {
    expect(flattenArrivals(undefined)).toBeUndefined();
    expect(flattenArrivals({ pages: [{ arrivals: [arrival()] }, { arrivals: [arrival({ displayName: 'Kwame' })] }] })?.map((a) => a.displayName)).toEqual([
      'Priya',
      'Kwame',
    ]);
  });
});

describe('le pied de liste', () => {
  test('une suite à charger, en cours, en échec, ou rien', () => {
    expect(arrivalsFooterState({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false })).toBe('more');
    expect(arrivalsFooterState({ hasNextPage: true, isFetchingNextPage: true, isFetchNextPageError: false })).toBe('loading');
    expect(arrivalsFooterState({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: true })).toBe('failed');
    expect(arrivalsFooterState({ hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false })).toBe('end');
  });

  test('« Afficher la suite » charge la page suivante', async () => {
    const mounter = createActMounter();
    const calls: string[] = [];
    const host = await mounter.mount(<ArrivalsFooter language="fr" state="more" onMore={() => calls.push('more')} />);
    const button = host.querySelector<HTMLButtonElement>('[data-link-arrivals-more]');
    expect(button?.textContent).toContain('Afficher la suite');
    await mounter.click(button);
    expect(calls).toEqual(['more']);
    mounter.unmountAll();
  });

  test('l’échec de la suite se dit sans effacer la liste, et se réessaie', async () => {
    const mounter = createActMounter();
    const calls: string[] = [];
    const host = await mounter.mount(<ArrivalsFooter language="fr" state="failed" onMore={() => calls.push('retry')} />);
    expect(host.textContent).toContain('La suite n’a pas pu être chargée.');
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-link-arrivals-retry]'));
    expect(calls).toEqual(['retry']);
    mounter.unmountAll();
  });

  test('en cours : occupé, annoncé ; fini : rien', () => {
    expect(renderToStaticMarkup(<ArrivalsFooter language="fr" state="loading" onMore={() => undefined} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<ArrivalsFooter language="fr" state="end" onMore={() => undefined} />)).toBe('');
  });

  test('en arabe, les libellés suivent', () => {
    expect(plain(renderToStaticMarkup(<ArrivalsFooter language="ar" state="more" onMore={() => undefined} />))).toContain('عرض المزيد');
  });
});
