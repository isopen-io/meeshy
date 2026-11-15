import { Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { once, preloadedView } from './preloaded-view';

/**
 * UNE VUE CHARGÉE À PART, PEINTE SANS DÉTOUR UNE FOIS LÀ (#17650) — le code
 * froid de l'écran d'appel (la réponse à un appel entrant, la grille d'un
 * groupe) quitte `call_overlay` ; préchargé, il se rend dans le MÊME rendu,
 * comme s'il n'était jamais parti.
 */

const Hello = ({ name }: { readonly name: string }) => <p data-hello="">Bonjour {name}</p>;

describe('preloadedView', () => {
  test('préchargée, la vue se rend synchroniquement, sans repli', async () => {
    const view = preloadedView(() => Promise.resolve(Hello));
    await view.load();
    expect(renderToStaticMarkup(<view.View name="Amina" />)).toBe('<p data-hello="">Bonjour Amina</p>');
  });

  test('pas encore là, elle suspend jusqu’au repli le plus proche, puis se rend', async () => {
    const view = preloadedView(() => Promise.resolve(Hello));
    const fallback = renderToStaticMarkup(
      <Suspense fallback={<i data-pending="" />}>
        <view.View name="Amina" />
      </Suspense>,
    );
    expect(fallback).toContain('data-pending');
    await view.load();
    expect(renderToStaticMarkup(<view.View name="Amina" />)).toContain('Bonjour Amina');
  });

  test('le chargement ne part qu’une fois, quel que soit le nombre de demandes', async () => {
    const calls: string[] = [];
    const view = preloadedView(() => {
      calls.push('load');
      return Promise.resolve(Hello);
    });
    await Promise.all([view.load(), view.load(), view.load()]);
    expect(calls).toEqual(['load']);
  });

  test('un échec ne condamne pas la demande suivante', async () => {
    const attempts: string[] = [];
    const view = preloadedView(() => {
      attempts.push('try');
      return attempts.length === 1 ? Promise.reject(new Error('réseau coupé')) : Promise.resolve(Hello);
    });
    expect(await view.load().then(() => null, (error: unknown) => (error instanceof Error ? error.message : null))).toBe('réseau coupé');
    await view.load();
    expect(attempts).toEqual(['try', 'try']);
    expect(renderToStaticMarkup(<view.View name="Amina" />)).toContain('Bonjour Amina');
  });

  test('un chargement raté se dit à la frontière d’erreur au lieu de suspendre en boucle', async () => {
    const view = preloadedView<{ readonly name: string }>(() => Promise.reject(new Error('module absent')));
    const bounded = () =>
      renderToStaticMarkup(
        <Suspense fallback={<i data-pending="" />}>
          <view.View name="Amina" />
        </Suspense>,
      );
    expect(bounded()).toContain('data-pending');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => renderToStaticMarkup(<view.View name="Amina" />)).toThrow('module absent');
    expect(bounded()).toContain('data-pending');
  });
});

describe('once', () => {
  test('mémoïse la promesse, et la relâche après un échec', async () => {
    const seen: number[] = [];
    const load = once(() => {
      seen.push(seen.length);
      return seen.length === 1 ? Promise.reject(new Error('x')) : Promise.resolve(seen.length);
    });
    expect(await load().then(() => null, (error: unknown) => (error instanceof Error ? error.message : null))).toBe('x');
    expect(await load()).toBe(2);
    expect(await load()).toBe(2);
    expect(seen).toEqual([0, 1]);
  });
});
