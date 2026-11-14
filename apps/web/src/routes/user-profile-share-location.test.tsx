import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createSharedLocationSharingCenter, type SharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileShareLocationRow, ProfileShareLocationRowView } from './user-profile-share-location';

/**
 * **PARTAGER MA POSITION DEPUIS LA FICHE D'UN AMI** (#18345, iso `ProfileShareLocationRow.swift`)
 * — offerte dès Ami, la feuille choisit durée et précision (la ville par défaut), puis
 * « X voit votre position (…) jusqu'à HH:MM » et « Arrêter », gardés même sous Ami.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const ADA_ID = 'a'.repeat(24);
const ADA = { id: ADA_ID, username: 'ada', displayName: 'Ada', avatar: null };
const OWNER = 'c'.repeat(24);
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const noop = () => undefined;

function makeCenter(): { center: SharedLocationSharingCenter; starts: unknown[]; stops: () => number } {
  const starts: unknown[] = [];
  let stops = 0;
  const memory = new Map<string, string>();
  const center = createSharedLocationSharingCenter({
    emitter: {
      start: async (payload) => {
        starts.push(payload);
        return { kind: 'started', expiresAt: Date.now() + 3_600_000 };
      },
      update: async () => ({ kind: 'started', expiresAt: Date.now() + 3_600_000 }),
      stop: async () => {
        stops += 1;
        return true;
      },
    },
    fixes: { isGranted: async () => true, currentFix: async () => ({ kind: 'fix', fix: PARIS }), follow: () => () => undefined },
    storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) },
    storageKey: 'roster',
    schedule: () => () => undefined,
    owner: OWNER,
    currentAccount: () => OWNER,
  });
  return { center, starts, stops: () => stops };
}

describe('la vue', () => {
  test('sans partage : « Partager ma position », nommé pour la personne', () => {
    const html = renderToStaticMarkup(<ProfileShareLocationRowView language="fr" name="Ada" entry={null} busy={false} onShare={noop} onStop={noop} />);
    expect(html).toContain('Partager ma position');
    expect(html).toContain('aria-label="Partager ma position avec Ada"');
  });

  test('pendant un partage : la précision, l’échéance et « Arrêter »', () => {
    const until = new Date(2026, 10, 14, 9, 30).getTime();
    const html = renderToStaticMarkup(<ProfileShareLocationRowView language="fr" name="Ada" entry={{ precision: 'neighborhood', until }} busy={false} onShare={noop} onStop={noop} />);
    expect(html).toContain('Ada voit votre position (au quartier près) jusqu’à 09:30');
    expect(html).toContain('data-share-location-stop');
  });
});

describe('la ligne branchée', () => {
  test('sous Ami et sans partage : rien', async () => {
    const { center } = makeCenter();
    const host = await mount(<ProfileShareLocationRow language="fr" person={ADA} offered={false} onNotice={noop} center={center} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });

  test('sans compte connecté : rien', async () => {
    const host = await mount(<ProfileShareLocationRow language="fr" person={ADA} offered onNotice={noop} center={null} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });

  test('partager à la ville pendant 1 h, par défaut, puis arrêter d’un geste', async () => {
    const { center, starts, stops } = makeCenter();
    const host = await mount(<ProfileShareLocationRow language="fr" person={ADA} offered onNotice={noop} center={center} />);
    await settle();
    await click(host.querySelector<HTMLButtonElement>('[data-share-location]'));
    await settle();
    await click(document.querySelector<HTMLButtonElement>('[data-share-location-confirm]'));
    await settle();
    expect(starts).toEqual([{ recipients: [{ userId: ADA_ID, precision: 'city' }], durationMinutes: 60, position: PARIS }]);
    expect(host.querySelector('[data-share-location-active]')?.textContent).toContain('à la ville près');
    await click(host.querySelector<HTMLButtonElement>('[data-share-location-stop]'));
    await settle();
    expect(stops()).toBe(1);
    expect(host.querySelector<HTMLButtonElement>('[data-share-location]')).not.toBeNull();
  });

  test('un partage en cours garde la ligne même descendu sous Ami', async () => {
    const { center } = makeCenter();
    await center.share({ userId: ADA_ID, precision: 'exact', durationMinutes: 480 });
    const host = await mount(<ProfileShareLocationRow language="fr" person={ADA} offered={false} onNotice={noop} center={center} />);
    await settle();
    expect(host.querySelector<HTMLButtonElement>('[data-share-location-stop]')).not.toBeNull();
  });

  test('un refus se dit, sans rien adopter', async () => {
    const { center } = makeCenter();
    const notices: string[] = [];
    const refusing = { ...center, share: async () => 'location-denied' as const };
    const host = await mount(<ProfileShareLocationRow language="fr" person={ADA} offered onNotice={(m) => notices.push(m)} center={refusing} />);
    await settle();
    await click(host.querySelector<HTMLButtonElement>('[data-share-location]'));
    await settle();
    await click(document.querySelector<HTMLButtonElement>('[data-share-location-confirm]'));
    await settle();
    expect(notices).toEqual(['Autorisez la localisation pour Meeshy dans votre navigateur pour partager votre position.']);
  });
});
