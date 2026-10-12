import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RefusedContentBackdrop, RefusedContentNotice, refusalViewOf } from './refused-content';

/**
 * **UN CONTENU REFUSÉ SE PRÉSENTE COMME UN RÉEL REFUSÉ** (#10314, #10318) — le
 * noir de média, et par-dessus l'invitation (visiteur) ou la notice du lecteur
 * de réels iOS (membre) : les mêmes mots, « Retour », jamais « Réessayer ».
 * Ni le fond ni la notice ne reçoivent une donnée du contenu refusé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const CONTENT_CARRIERS = 'img, video, audio, a, [style*="url("]';

describe('le fond d’un contenu refusé', () => {
  test('sombre, plein écran, muet pour le lecteur d’écran', async () => {
    const host = await mounter.mount(<RefusedContentBackdrop />);
    const backdrop = host.querySelector('[data-refused-backdrop]');
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop?.className).toContain('bg-media-backdrop');
    expect(backdrop?.className).toContain('fixed inset-0');
  });

  test('ne porte rien du contenu : aucune propriété, aucun texte, aucun média, aucun lien', async () => {
    expect(RefusedContentBackdrop.length).toBe(0);
    const host = await mounter.mount(<RefusedContentBackdrop />);
    const backdrop = host.querySelector('[data-refused-backdrop]');
    expect(backdrop?.textContent).toBe('');
    expect(backdrop?.children.length).toBe(0);
    expect(host.querySelectorAll(CONTENT_CARRIERS).length).toBe(0);
  });
});

describe('la notice d’un membre refusé', () => {
  test('dit les mots du réel refusé d’iOS, sur le même noir, sans « Réessayer »', async () => {
    const host = await mounter.mount(<RefusedContentNotice language="fr" onBack={() => {}} />);
    expect(host.querySelector('[data-refused-backdrop]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain('Ce contenu n’est plus disponible');
    expect(host.textContent).toContain('Il a peut-être expiré ou été retiré par son auteur.');
    expect(host.textContent).not.toContain('Réessayer');
    expect(host.querySelectorAll('button').length).toBe(1);
  });

  test('« Retour » quitte le contenu refusé', async () => {
    const calls: string[] = [];
    const host = await mounter.mount(<RefusedContentNotice language="fr" onBack={() => calls.push('back')} />);
    buttonNamed(host, 'Retour')?.click();
    expect(calls).toEqual(['back']);
  });

  test('parle la langue de l’interface', async () => {
    const host = await mounter.mount(<RefusedContentNotice language="en" onBack={() => {}} />);
    expect(host.textContent).toContain('This content is no longer available');
    expect(buttonNamed(host, 'Back')).not.toBeNull();
  });

  test('ne reçoit que la langue et le retour : aucun champ du contenu ne peut y passer', async () => {
    const host = await mounter.mount(<RefusedContentNotice language="fr" onBack={() => {}} />);
    expect(host.querySelectorAll(CONTENT_CARRIERS).length).toBe(0);
  });
});

describe('qui voit quoi devant un refus', () => {
  test('le visiteur, l’invitation ; le membre, la notice', () => {
    expect(refusalViewOf({ visitor: true })).toBe('invitation');
    expect(refusalViewOf({ visitor: false })).toBe('notice');
  });
});
