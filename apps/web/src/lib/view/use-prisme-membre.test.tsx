import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { prismeDuMembre } from '@/lib/admin/prisme-membre';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { usePrismeDuMembre } from './use-prisme-membre';

/**
 * **L'IDENTITÉ DU PRISME, MESURÉE** (#6862, revue-correction) — pas déduite du
 * code, ni affirmée par un commentaire : un `useMemo` oublié ne casse RIEN
 * d'observable, il rend seulement le fil moins fluide, et aucun témoin de DOM
 * ne peut le voir.
 *
 * On mesure donc ce que React remet d'un rendu à l'autre, par `Object.is`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
});

const MEMBRE = { systemLanguage: 'de', regionalLanguage: 'es', customDestinationLanguage: 'it' };

const vus: unknown[] = [];

function Sonde({ membre }: { readonly membre: typeof MEMBRE }) {
  const [, redessine] = useState(0);
  const prisme = usePrismeDuMembre(membre);
  vus.push(prisme.languages);

  return (
    <button type="button" data-redessine onClick={() => redessine((n) => n + 1)}>
      {prisme.languages.join(' › ')}
    </button>
  );
}

describe('le prisme du membre garde son identité entre deux rendus', () => {
  test('un rendu de plus ne fabrique PAS un nouveau tableau', async () => {
    vus.length = 0;
    const host = await mounter.mount(<Sonde membre={MEMBRE} />);

    await mounter.click(host.querySelector('[data-redessine]') as HTMLElement | null);

    expect(vus.length).toBeGreaterThan(1);
    expect(Object.is(vus[0], vus[vus.length - 1])).toBe(true);
    expect(host.textContent).toBe('de › es › it');
  });

  test('un OBJET `membre` neuf au contenu IDENTIQUE non plus — la clé est faite des trois rangs', async () => {
    vus.length = 0;
    const host = await mounter.mount(<Sonde membre={MEMBRE} />);
    await mounter.rerender(host, <Sonde membre={{ ...MEMBRE }} />);

    expect(vus.length).toBeGreaterThan(1);
    expect(Object.is(vus[0], vus[vus.length - 1])).toBe(true);
  });

  test('CONTRASTE — la fonction PURE, elle, rend bien un tableau neuf à chaque appel', () => {
    // Sans ce contraste, les deux témoins ci-dessus verdiraient aussi si
    // `prismeDuMembre` renvoyait une constante partagée : ils mesureraient
    // alors la fonction, et non le `useMemo` qu'ils prétendent garder.
    expect(Object.is(prismeDuMembre(MEMBRE).languages, prismeDuMembre(MEMBRE).languages)).toBe(false);
  });

  test('un rang CHANGÉ rend bien un prisme neuf — la mémoïsation n’est pas un gel', async () => {
    vus.length = 0;
    const host = await mounter.mount(<Sonde membre={MEMBRE} />);
    await mounter.rerender(host, <Sonde membre={{ ...MEMBRE, systemLanguage: 'pt' }} />);

    expect(host.textContent).toBe('pt › es › it');
  });
});
