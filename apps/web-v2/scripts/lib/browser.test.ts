import { describe, expect, it } from 'vitest';

import { pageDiagnostics, watchPage } from './browser.mjs';

/**
 * UN GATE DE PEAU QUI EXPIRE DOIT DIRE POURQUOI (#6971).
 *
 * Les dix-huit gates de peau collectent tous les erreurs de page
 * (`page.on('pageerror', …)`) et les LISENT tous à la dernière ligne de leur
 * boucle — de 50 à 280 lignes plus loin. Entre les deux, le moindre
 * `waitForSelector` qui expire lève, l'exception saute par-dessus la lecture,
 * remonte au `finally` et tue le processus : le journal d'intégration continue
 * ne montre que « Timeout 10000ms exceeded », et les erreurs de page qui
 * l'EXPLIQUENT sont jetées alors qu'elles étaient en mémoire.
 *
 * Mesuré sur le run `35303238441` : `[data-link-submit]` jamais visible, et
 * rien pour trancher entre « l'écran a levé » et « le chunk était lent ». Le
 * même gate rendait 268 témoins verts en local, `aucune erreur de page — []`.
 *
 * La collecte vit donc au point d'entrée PARTAGÉ (38 gates l'importent) et non
 * dans chaque boucle : c'est ce que `browser.mjs` dit déjà de lui-même — une
 * chose écrite à plusieurs endroits finit par être écrite de plusieurs façons.
 */

type Listener = (payload: unknown) => void;

const fakePage = (url: string) => {
  const listeners = new Map<string, Listener[]>();
  return {
    url: () => url,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return this;
    },
    emit(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
};

describe("le diagnostic d'un gate de peau", () => {
  it('ne dit rien quand aucune page ne fut ouverte', () => {
    expect(pageDiagnostics([])).toBe('');
  });

  it("nomme l'URL de la page ouverte, même sans erreur — c'est elle qui situe le timeout", () => {
    const page = fakePage('http://127.0.0.1:4173/links/share/new');
    const watched = watchPage(page as never);

    expect(pageDiagnostics([watched])).toContain('/links/share/new');
  });

  it("rend les erreurs de page collectées, dans l'ordre d'arrivée", () => {
    const page = fakePage('http://127.0.0.1:4173/links/share/new');
    const watched = watchPage(page as never);

    page.emit('pageerror', new Error("Failed to fetch dynamically imported module: share-link-new.js"));
    page.emit('pageerror', new Error('Missing initialPageParam'));

    const report = pageDiagnostics([watched]);
    expect(report).toContain('Failed to fetch dynamically imported module');
    expect(report).toContain('Missing initialPageParam');
    expect(report.indexOf('Failed to fetch')).toBeLessThan(report.indexOf('Missing initialPageParam'));
  });

  it("dit explicitement qu'aucune erreur de page n'est arrivée — l'absence est une INFORMATION, pas un silence", () => {
    const page = fakePage('http://127.0.0.1:4173/links/share');
    const watched = watchPage(page as never);

    expect(pageDiagnostics([watched])).toMatch(/aucune erreur de page/i);
  });

  it('rend les messages de console de niveau erreur, qu\'un `pageerror` ne porte pas', () => {
    const page = fakePage('http://127.0.0.1:4173/links/share/new');
    const watched = watchPage(page as never);

    page.emit('console', { type: () => 'error', text: () => 'GET /assets/chunk.js 404' });
    page.emit('console', { type: () => 'log', text: () => 'un journal ordinaire, à ne PAS remonter' });

    const report = pageDiagnostics([watched]);
    expect(report).toContain('404');
    expect(report).not.toContain('un journal ordinaire');
  });

  it('sépare les pages, pour que deux gabarits ne mélangent pas leurs causes', () => {
    const grand = fakePage('http://127.0.0.1:4173/links/share/new');
    const petit = fakePage('http://127.0.0.1:4173/links');
    const a = watchPage(grand as never);
    const b = watchPage(petit as never);

    grand.emit('pageerror', new Error('la cause du grand gabarit'));

    const report = pageDiagnostics([a, b]);
    expect(report).toContain('la cause du grand gabarit');
    expect(report).toContain('/links/share/new');
    expect(report).toContain('/links');
  });
});
