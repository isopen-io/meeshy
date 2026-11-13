import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RelationRequestLevel } from '@meeshy/shared/types/relation';

import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { RELATION_LINKS_QUERY_KEY, type RelationLink } from '@/lib/api/relations';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { INITIAL_RITUAL, reduceRitual, type RitualEvent, type RitualState } from '@/lib/relations/blood-ritual';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BloodRitualBody, BloodRitualDialog, ritualEventOf } from './blood-ritual-dialog';
import { CirclesPanel } from './discover-circles';
import { progressText } from '@/lib/relations/progress-text';

import { CircleLinkRow, CircleLinkSheet, CircleRequestRow, CircleSectionHeader, type CircleRequestHandlers } from './discover-circles-parts';

/**
 * « MES CERCLES » DESSINÉ (#13938) — iso `CirclesTab`, `CircleRowView`,
 * `CircleRequestRow`, `CircleLinkSheet` et `BloodRitualView` : ce que chaque
 * ligne DIT de sa progression, le geste qu'elle offre selon la loi de demande,
 * la demande de Sang qui ouvre le rituel au lieu d'« accepter », les réglages
 * du jalon 2 montrés désactivés et dits, et le rituel qui part des
 * consentements tous refusés.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadCirclesCatalog('fr'), loadCirclesCatalog('en'), loadCirclesCatalog('ar')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const NOW = new Date('2026-11-02T12:00:00.000Z');
const noop = () => undefined;
const ada: PersonSummary = { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: null };

const link = (overrides: Partial<RelationLink> = {}): RelationLink => ({
  userId: 'u-ada',
  effectiveLevel: 'FRIEND',
  grantedByMe: 'FRIEND',
  since: null,
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
  ...overrides,
});

const request = (overrides: Partial<FriendRequestRecord> = {}): FriendRequestRecord => ({
  id: 'f-1',
  senderId: 'u-ada',
  receiverId: 'u-me',
  status: 'pending',
  message: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  sender: ada,
  receiver: null,
  ...overrides,
});

const handlers: CircleRequestHandlers = { onAccept: noop, onDecline: noop, onCancel: noop, onRitual: noop };

const row = (props: { readonly link?: RelationLink; readonly pendingLevel?: RelationRequestLevel | null }) =>
  renderToStaticMarkup(
    <CircleLinkRow language="fr" link={props.link ?? link()} person={ada} pendingLevel={props.pendingLevel ?? null} now={NOW} onOpen={noop} onRaise={noop} />,
  );

describe('la ligne d’un lien', () => {
  test('elle dit où en est la série, sans pluriel, et ne propose pas un cran que le serveur refuserait', () => {
    const html = row({});
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Semaines d’affilée : 3 sur 4');
    expect(html).not.toContain('data-circle-raise');
    expect(html).not.toContain('data-presence');
  });

  test('éligible : « Demander Proche », un bouton qui nomme le cran ET la personne', () => {
    const html = row({ link: link({ eligibleFor: 'CLOSE', progress: { activeWeeks: 4, needed: 4, missing: [] } }) });
    expect(html).toContain('data-circle-raise="CLOSE"');
    expect(html).toContain('Demander Proche');
    expect(html).toContain('aria-label="Demander le niveau Proche à Ada Lovelace"');
    expect(html).toContain('Prêt pour le niveau Proche');
  });

  test('une demande en attente remplace le bouton : « Demande envoyée · Proche »', () => {
    const html = row({ link: link({ eligibleFor: 'CLOSE' }), pendingLevel: 'CLOSE' });
    expect(html).toContain('Demande envoyée · Proche');
    expect(html).not.toContain('data-circle-raise');
  });

  test('ce qui manque se dit avec la conjonction de la langue', () => {
    expect(progressText('fr', { kind: 'missing', pieces: ['audio', 'message'] })).toBe('Il manque : un message audio et un message');
    expect(progressText('en', { kind: 'missing', pieces: ['audio'] })).toBe('Still missing: a voice message');
    expect(progressText('fr', { kind: 'none' })).toBeNull();
  });

  test('l’en-tête de section se lit « Sang, 2 » et le niveau garde son nom partagé dans chaque langue', () => {
    expect(renderToStaticMarkup(<CircleSectionHeader language="fr" level="BLOOD" count={2} />)).toContain('aria-label="Sang, 2"');
    expect(renderToStaticMarkup(<CircleSectionHeader language="ar" level="CLOSE" count={1} />)).toContain('مقرّب');
  });
});

describe('les demandes de montée', () => {
  const rowOf = (r: FriendRequestRecord, direction: 'incoming' | 'outgoing') =>
    renderToStaticMarkup(<CircleRequestRow language="fr" request={r} direction={direction} person={ada} handlers={handlers} />);

  test('reçue pour Proche : refuser et accepter, chacun nommé', () => {
    const html = rowOf(request({ targetLevel: 'CLOSE' }), 'incoming');
    expect(html).toContain('Demande le niveau Proche');
    expect(html).toContain('data-circle-request-action="decline"');
    expect(html).toContain('data-circle-request-action="accept"');
    expect(html).toContain('aria-label="Accepter la demande de Ada Lovelace"');
  });

  test('reçue pour Sang : pas d’« accepter » — c’est le rituel qui la scelle', () => {
    const html = rowOf(request({ targetLevel: 'BLOOD' }), 'incoming');
    expect(html).not.toContain('data-circle-request-action="accept"');
    expect(html).toContain('data-circle-request-action="ritual"');
    expect(html).toContain('aria-label="Ouvrir le rituel du Sang avec Ada Lovelace"');
  });

  test('envoyée pour Sang : le rituel et l’annulation ; envoyée pour Proche : l’annulation seule', () => {
    const blood = rowOf(request({ senderId: 'u-me', receiverId: 'u-ada', targetLevel: 'BLOOD' }), 'outgoing');
    expect(blood).toContain('En attente · Sang');
    expect(blood).toContain('data-circle-request-action="ritual"');
    expect(blood).toContain('data-circle-request-action="cancel"');
    expect(rowOf(request({ senderId: 'u-me', receiverId: 'u-ada', targetLevel: 'CLOSE' }), 'outgoing')).not.toContain('data-circle-request-action="ritual"');
  });
});

describe('la fiche d’un lien', () => {
  test('« Bloquer ses Bring » est ACTIF ; les réglages encore à venir sont MONTRÉS, désactivés, et l’écran dit pourquoi', async () => {
    await mount(<CircleLinkSheet language="fr" link={link()} person={ada} now={NOW} onClose={noop} />);
    const switches = [...document.querySelectorAll<HTMLInputElement>('[data-circle-setting]')];
    expect(switches.map((s) => s.getAttribute('data-circle-setting'))).toEqual([
      'circles.settings.blockBring',
      'circles.settings.location',
    ]);
    const [bring, ...upcoming] = switches;
    expect(bring?.disabled).toBe(false);
    expect(upcoming.every((s) => s.disabled && !s.checked)).toBe(true);
    expect(document.body.textContent).toContain('Ces réglages arrivent avec la prochaine étape de Meeshy');
    expect(document.body.textContent).toContain('Ami');
  });

  test('dès Proche, « Couper son talkie » (#16638) et « Ce que j’écoute » (#16831) sont ACTIFS à côté du Bring', async () => {
    await mount(<CircleLinkSheet language="fr" link={link({ effectiveLevel: 'CLOSE' })} person={ada} now={NOW} onClose={noop} />);
    const active = [...document.querySelectorAll<HTMLInputElement>('[data-circle-setting]')].filter((s) => !s.disabled);
    expect(active.map((s) => s.getAttribute('data-circle-setting'))).toEqual(['circles.settings.blockBring', 'circles.settings.blockTalkie', 'circles.settings.blockTogether', 'circles.settings.listening']);
    const upcoming = [...document.querySelectorAll<HTMLInputElement>('[data-circle-setting]')].filter((s) => s.disabled);
    expect(upcoming.map((s) => s.getAttribute('data-circle-setting'))).toEqual(['circles.settings.location']);
  });
});

describe('l’onglet « Cercles », câblé', () => {
  const accepted = [request({ id: 'a-1', status: 'accepted', senderId: 'u-ada', receiverId: 'u-me', sender: ada })];

  const panel = (raised: Array<readonly [string, RelationRequestLevel]>, found: string[] = []) => (
    <CirclesPanel
      language="fr"
      enabled
      online
      now={NOW}
      received={[]}
      sent={[]}
      accepted={accepted}
      requestHandlers={handlers}
      onRaise={(person, target) => raised.push([person.id, target])}
      onFindContacts={() => found.push('find')}
    />
  );

  test('le cache se peint tout de suite, par section, nommé par le panier des contacts ; « Demander » part au tap', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link({ eligibleFor: 'CLOSE' }), link({ userId: 'u-pub', effectiveLevel: 'PUBLIC' })]);
    const raised: Array<readonly [string, RelationRequestLevel]> = [];
    const host = await mount(panel(raised));
    expect(host.querySelector('[data-discover-skeleton]')).toBeNull();
    expect([...host.querySelectorAll('[data-circle-list]')].map((l) => l.getAttribute('data-circle-list'))).toEqual(['FRIEND']);
    expect(host.querySelector('[data-circle-link="u-pub"]')).toBeNull();
    expect(host.textContent).toContain('Ada Lovelace');
    await click(host.querySelector<HTMLButtonElement>('[data-circle-raise="CLOSE"]'));
    expect(raised).toEqual([['u-ada', 'CLOSE']]);
  });

  test('aucun lien : l’état vide dit pourquoi et mène à la découverte', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, []);
    const found: string[] = [];
    const host = await mount(panel([], found));
    expect(host.textContent).toContain('Vos liens apparaîtront ici');
    await click(host.querySelector<HTMLButtonElement>('[data-circles-find]'));
    expect(found).toEqual(['find']);
  });

  test('toucher la ligne ouvre la fiche du lien', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link()]);
    const host = await mount(panel([]));
    await click(host.querySelector<HTMLButtonElement>('[data-circle-open]'));
    expect(document.querySelector('[data-circle-sheet="u-ada"]')).not.toBeNull();
  });
});

describe('le rituel du Sang', () => {
  const play = (...events: readonly RitualEvent[]): RitualState => events.reduce(reduceRitual, INITIAL_RITUAL);
  const body = (state: RitualState) => renderToStaticMarkup(<BloodRitualBody language="fr" name="Ada" state={state} dispatch={noop} onClose={noop} />);

  test('les quatre partages d’abord, un à un, tous refusés, chacun avec son dépliant', () => {
    const html = body(INITIAL_RITUAL);
    expect([...html.matchAll(/data-ritual-consent="(\w+)"/g)].map((m) => m[1])).toEqual(['listeningTitle', 'locationLive', 'locationHistory', 'locationProximity']);
    expect(html).not.toContain('checked');
    expect(html).toContain('L’historique de ma position (30 jours)');
    expect(html).toContain('je peux les effacer quand je veux');
  });

  test('tenir l’écran : un bouton pressé, et l’aide dit le clavier', () => {
    const html = body(play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'opened', token: 't', holdWindowMs: null }, { type: 'hold-began' }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('En attente de Ada…');
    expect(html).toContain('maintenez Espace');
  });

  test('l’autre a lâché : calme, et l’on peut recommencer ; hors ligne : le rituel le dit', () => {
    expect(body(play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'opened', token: 't', holdWindowMs: null }, { type: 'other-progress', token: 't', stage: 'lapsed' }))).toContain(
      'data-ritual-outcome-action="retry"',
    );
    expect(body(play({ type: 'proceed' }, { type: 'open-requested', online: false }))).toContain('Le rituel est indisponible hors ligne.');
  });

  test('les événements ne valent que pour CETTE personne et CE rituel', () => {
    expect(ritualEventOf('relation:ritual-progress', { userId: 'u-ada', token: 't', stage: 'held' }, 'u-ada')).toEqual({ type: 'other-progress', token: 't', stage: 'held' });
    expect(ritualEventOf('relation:ritual-progress', { userId: 'u-bob', token: 't', stage: 'held' }, 'u-ada')).toBeNull();
    expect(ritualEventOf('relation:ritual-progress', { userId: 'u-ada', token: 't', stage: 'oops' }, 'u-ada')).toBeNull();
    expect(ritualEventOf('relation:ritual-started', { userId: 'u-ada' }, 'u-ada')).toEqual({ type: 'other-started' });
    expect(ritualEventOf('relation:ritual-completed', { userId: 'u-ada', token: 't' }, 'u-ada')).toEqual({ type: 'other-completed', token: 't' });
  });

  test('câblé : « Continuer » puis « Ouvrir » démarrent le rituel, et tenir l’écran rejoue la tenue avec le jeton servi', async () => {
    const requests: HttpRequest[] = [];
    const replies: Readonly<Record<string, ApiResult<unknown>>> = {
      start: { ok: true, data: { token: 'jeton', holdWindowMs: 15000 } },
      hold: { ok: true, data: { held: true, holdWindowMs: 15000 } },
    };
    const transport = (async () => replies.start) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      requests.push(req);
      const phase = (req.body as { readonly phase: string }).phase;
      return replies[phase] ?? { ok: false, status: 500, error: 'x' };
    }) as HttpTransport['request'];
    await mount(<BloodRitualDialog language="fr" userId="u-ada" name="Ada" onFinished={noop} deps={{ source: 'gateway', transport }} />);
    await click(document.querySelector<HTMLButtonElement>('[data-ritual-continue]'));
    await click(document.querySelector<HTMLButtonElement>('[data-ritual-open]'));
    await settle();
    expect(requests.map((r) => [r.path, r.body])).toEqual([['/api/v1/relations/u-ada/ritual', { phase: 'start' }]]);
    const ring = document.querySelector<HTMLButtonElement>('[data-ritual-ring]');
    expect(ring).not.toBeNull();
    ring?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await settle();
    expect(requests.at(-1)?.body).toEqual({ phase: 'hold', token: 'jeton' });
    expect(ring?.getAttribute('aria-pressed')).toBe('true');
    ring?.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    await settle();
    expect(ring?.getAttribute('aria-pressed')).toBe('false');
  });
});
