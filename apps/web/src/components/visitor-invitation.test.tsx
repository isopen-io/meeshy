import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadVisitorCatalog } from '@/lib/i18n-visitor-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { invitationOpen, VisitorInvitationDialog, visitorReturnPath, viaTokenOf } from './visitor-invitation';

/**
 * **UN VISITEUR SANS COMPTE VOIT LE CONTENU PARTAGÉ** (#9149) — et, par-dessus,
 * l'invitation : qui le lui a partagé (si le lien le dit), « Créer un compte »
 * et « Se connecter » qui RAMÈNENT à la même adresse, et « Continuer à
 * regarder » qui rend le contenu. Un contenu refusé n'a rien derrière : la
 * modale le dit, sans sortie vers un contenu absent.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
  await loadVisitorCatalog('fr');
  await loadVisitorCatalog('en');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const RETURN = '/reel/6abfd6cb9fa9a97766e6bf7a?via=abc123';
const ALICE = { displayName: 'Alice Martin', username: 'alice', avatar: null };

const hrefOf = (host: HTMLElement, text: string): string | null =>
  [...host.querySelectorAll('a')].find((a) => a.textContent?.trim() === text)?.getAttribute('href') ?? null;

describe('l’invitation par-dessus un contenu servi', () => {
  test('dit qui a partagé, et les deux portes ramènent à la même adresse', async () => {
    const host = await mounter.mount(
      <VisitorInvitationDialog language="fr" kind="reel" state="served" sharer={ALICE} returnTo={RETURN} onDismiss={() => {}} />,
    );
    expect(host.textContent).toContain('Alice Martin vous a partagé ce réel');
    const next = encodeURIComponent(RETURN);
    expect(hrefOf(host, 'Créer un compte')).toBe(`/signup?next=${next}`);
    expect(hrefOf(host, 'Se connecter')).toBe(`/login?next=${next}`);
  });

  test('sans nom affiché, le pseudo nomme le partageur', async () => {
    const host = await mounter.mount(
      <VisitorInvitationDialog language="fr" kind="post" state="served" sharer={{ ...ALICE, displayName: null }} returnTo={RETURN} onDismiss={() => {}} />,
    );
    expect(host.textContent).toContain('alice vous a partagé cette publication');
  });

  test('sans partageur résolu, l’invitation ne nomme personne', async () => {
    const host = await mounter.mount(
      <VisitorInvitationDialog language="fr" kind="story" state="served" sharer={null} returnTo={RETURN} onDismiss={() => {}} />,
    );
    expect(host.textContent).toContain('Rejoignez Meeshy');
    expect(host.textContent).not.toContain('vous a partagé');
  });

  test('« Continuer à regarder » rend le contenu', async () => {
    const dismissed: string[] = [];
    const host = await mounter.mount(
      <VisitorInvitationDialog language="fr" kind="reel" state="served" sharer={ALICE} returnTo={RETURN} onDismiss={() => dismissed.push('x')} />,
    );
    await mounter.click(buttonNamed(host, 'Continuer à regarder'));
    expect(dismissed).toEqual(['x']);
  });

  test('parle la langue de l’interface', async () => {
    const host = await mounter.mount(
      <VisitorInvitationDialog language="en" kind="reel" state="served" sharer={ALICE} returnTo={RETURN} onDismiss={() => {}} />,
    );
    expect(host.textContent).toContain('Alice Martin shared this reel with you');
    expect(host.textContent).toContain('Create an account');
  });
});

describe('l’invitation sur un contenu refusé', () => {
  test('dit que le contenu n’est pas accessible, sans nom ni sortie vers un contenu absent', async () => {
    const host = await mounter.mount(
      <VisitorInvitationDialog language="fr" kind="reel" state="refused" sharer={ALICE} returnTo={RETURN} onDismiss={() => {}} />,
    );
    expect(host.textContent).toContain('Ce contenu n’est pas accessible');
    expect(host.textContent).not.toContain('Alice');
    expect(host.textContent).not.toContain('Continuer à regarder');
    expect(host.textContent).not.toContain('could not load');
    expect(hrefOf(host, 'Se connecter')).toBe(`/login?next=${encodeURIComponent(RETURN)}`);
  });
});

describe('les lois pures de l’invitation', () => {
  test('le retour garde le chemin et la requête, et refuse une autre origine', () => {
    expect(visitorReturnPath('/reel/r1', '?via=abc123')).toBe('/reel/r1?via=abc123');
    expect(visitorReturnPath('/post/p1', '')).toBe('/post/p1');
    expect(visitorReturnPath('//evil.com', '')).toBeNull();
  });

  test('`via` n’est lu que s’il a la forme d’un jeton de lien suivi', () => {
    expect(viaTokenOf(new URLSearchParams('via=abc123'))).toBe('abc123');
    expect(viaTokenOf(new URLSearchParams('via=../x'))).toBeNull();
    expect(viaTokenOf(new URLSearchParams(''))).toBeNull();
  });

  test('ouverte pour un visiteur, une fois le contenu jugé ; un refus ne se ferme pas', () => {
    expect(invitationOpen({ visitor: false, state: 'served', dismissed: false })).toBe(false);
    expect(invitationOpen({ visitor: true, state: 'pending', dismissed: false })).toBe(false);
    expect(invitationOpen({ visitor: true, state: 'served', dismissed: false })).toBe(true);
    expect(invitationOpen({ visitor: true, state: 'served', dismissed: true })).toBe(false);
    expect(invitationOpen({ visitor: true, state: 'refused', dismissed: true })).toBe(true);
  });
});
