import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { callNoticeStore, callReactionStore } from '@/lib/calls/call-control-state';
import type { CallModeration } from '@/lib/calls/call-moderation';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallModerationMenu } from './call-moderation-menu';
import { CallRecordChoice, CallReactionPalette } from './call-control-panels';
import { CallScreen } from './call-screen';

/**
 * LES CONTRÔLES D'UN APPEL EN COURS, À L'ÉCRAN (#8433, #8438, #8439, #8437) —
 * « Ajouter » et « Réagir » dans les actions, le choix de ce qu'on enregistre,
 * le menu de modération, les réactions qui montent et le mot d'un contrôle.
 * Chaque bouton a un effet : ces témoins le vérifient par ce qui s'ouvre ou
 * part, jamais par la seule présence.
 */

const GLYPHS = { more: '…', mute: 'm', remove: 'r' };

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  callReactionStore.setState({ bursts: [] });
  callNoticeStore.setState({ notice: null, seq: 0 });
});

const member = (userId: string, name: string, overrides: Partial<CallMember> = {}): CallMember => ({
  userId,
  name,
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...overrides,
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: { 'u-nadia': member('u-nadia', 'Nadia') },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const mount = (node: React.ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const find = (selector: string) => document.body.querySelector<HTMLElement>(selector);
  const press = (selector: string) => act(() => find(selector)?.click());
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, done };
};

const settle = async (chunk: () => Promise<unknown>) => {
  await act(async () => {
    await chunk();
  });
  await act(async () => {});
};

describe('« Ajouter » et « Réagir » dans les actions de l’appel', () => {
  test('en duo, le rail de l’appel les porte ; en groupe, la rangée de l’appel aussi', () => {
    const duo = mount(<CallScreen call={call()} canShare initiallyExpanded />);
    expect(duo.find('[data-call-rail="call"] [data-call-control="invite"]')?.getAttribute('aria-label')).toBe('Ajouter des personnes à l’appel');
    expect(duo.find('[data-call-rail="call"] [data-call-control="react"]')?.getAttribute('aria-label')).toBe('Envoyer une réaction');
    duo.done();
    const group = mount(<CallScreen call={call({ isGroup: true, members: { 'u-nadia': member('u-nadia', 'Nadia'), 'u-bruno': member('u-bruno', 'Bruno') } })} canShare initiallyExpanded />);
    expect(group.find('[data-call-row="call"] [data-call-control="invite"]')).not.toBeNull();
    expect(group.find('[data-call-row="call"] [data-call-control="react"]')).not.toBeNull();
    group.done();
  });

  test('« Réagir » ouvre la palette des huit réactions, un seul panneau à la fois, et la referme', async () => {
    const view = mount(<CallScreen call={call()} canShare initiallyExpanded />);
    view.press('[data-call-control="react"]');
    await settle(() => import('./call-control-panels'));
    expect(view.find('[data-call-control="react"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.querySelectorAll('[data-call-react-panel] [data-call-react]')).toHaveLength(8);
    view.press('[data-call-record]');
    await settle(() => import('./call-control-panels'));
    expect(view.find('[data-call-react-panel]')).toBeNull();
    expect(view.find('[data-call-record-choice]')).not.toBeNull();
    expect(view.find('[data-call-record]')?.getAttribute('aria-expanded')).toBe('true');
    view.press('[data-call-record]');
    expect(view.find('[data-call-record-choice]')).toBeNull();
    view.done();
  });

  test('« Ajouter » ouvre la liste : moi, chaque participant, et une invitée qui sonne', async () => {
    const view = mount(<CallScreen call={call({ isGroup: true, members: { 'u-nadia': member('u-nadia', 'Nadia'), 'u-bruno': member('u-bruno', 'Bruno', { link: 'ringing' }) } })} canShare initiallyExpanded />);
    view.press('[data-call-control="invite"]');
    await settle(() => import('./call-people-sheet'));
    const sheet = view.find('[data-call-people-sheet]');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('[data-call-person="u-nadia"]')?.textContent).toContain('Nadia');
    expect(sheet?.querySelector('[data-call-person-ringing]')?.textContent).toContain('Sonne…');
    expect(sheet?.querySelector('[data-call-people-search]')).not.toBeNull();
    view.done();
  });

  test('l’invitation d’un appel de groupe dit qui invite', () => {
    const html = renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming', isGroup: true, callerName: 'Nadia', invitedBy: 'u-nadia' })} canShare />);
    expect(html).toContain('Nadia vous invite à un appel de groupe');
  });
});

describe('les panneaux « Réagir » et « Enregistrer »', () => {
  test('chaque réaction part aussitôt, et la palette reste ouverte pour enchaîner', () => {
    const sent: string[] = [];
    const view = mount(<CallReactionPalette id="p" closeGlyph="x" language="fr" onClose={() => undefined} react={(emoji) => sent.push(emoji)} />);
    view.press('[data-call-react="🎉"]');
    view.press('[data-call-react="👍"]');
    expect(sent).toEqual(['🎉', '👍']);
    expect(view.find('[data-call-react-panel]')).not.toBeNull();
    view.done();
  });

  test('« Audio et vidéo » demande un enregistrement vidéo et ferme le choix ; sans canevas filmable, il n’est pas offert', () => {
    const asked: string[] = [];
    const closed: string[] = [];
    const view = mount(<CallRecordChoice id="r" closeGlyph="x" language="fr" onClose={() => closed.push('x')} request={(kind) => asked.push(kind)} videoAvailable />);
    expect(view.find('[data-call-record-kind="audio"]')?.textContent).toContain('Audio seul');
    view.press('[data-call-record-kind="video"]');
    expect(asked).toEqual(['video']);
    expect(closed).toHaveLength(1);
    view.done();
    const bare = mount(<CallRecordChoice id="r" closeGlyph="x" language="fr" onClose={() => undefined} request={(kind) => asked.push(kind)} videoAvailable={false} />);
    expect(bare.find('[data-call-record-kind="video"]')?.hasAttribute('disabled')).toBe(true);
    bare.done();
  });
});

describe('le menu de modération', () => {
  const moderation = (log: string[]): CallModeration => ({ canModerate: () => true, mute: (id) => log.push(`mute:${id}`), remove: (id) => log.push(`remove:${id}`) });

  test('« Couper le micro » part aussitôt ; un micro déjà coupé ne le propose plus', () => {
    const log: string[] = [];
    const view = mount(<CallModerationMenu member={member('u-nadia', 'Nadia')} language="fr" moderation={moderation(log)} glyphs={GLYPHS} />);
    expect(view.find('[data-call-moderate]')?.getAttribute('aria-label')).toBe('Options pour Nadia');
    view.press('[data-call-moderate]');
    expect(view.find('[data-call-moderation-menu] [role="menuitem"]')?.textContent).toContain('Couper le micro');
    view.press('[data-call-mute]');
    expect(log).toEqual(['mute:u-nadia']);
    expect(view.find('[data-call-moderation-menu]')).toBeNull();
    view.done();
    const muted = mount(<CallModerationMenu member={member('u-nadia', 'Nadia', { micMuted: true })} language="fr" moderation={moderation(log)} glyphs={GLYPHS} />);
    muted.press('[data-call-moderate]');
    expect(muted.find('[data-call-mute]')).toBeNull();
    expect(muted.find('[data-call-moderation-menu]')?.textContent).toContain('Micro coupé');
    muted.done();
  });

  test('le menu n’est posé que chez qui modère, et pour les seuls pairs qu’il peut modérer', async () => {
    const peers = { 'u-nadia': member('u-nadia', 'Nadia'), 'u-bruno': member('u-bruno', 'Bruno') };
    const { CallGrid } = await import('./call-grid');
    const only = (id: string): CallModeration => ({ canModerate: (userId) => userId === id, mute: () => undefined, remove: () => undefined });
    const view = mount(<CallGrid members={Object.values(peers)} remoteStreams={{}} self={{ stream: null, cameraOn: false, mirrored: true }} choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={only('u-bruno')} language="fr" />);
    await settle(() => import('./call-moderation-menu'));
    expect(view.find('[data-call-moderate="u-bruno"]')).not.toBeNull();
    expect(view.find('[data-call-moderate="u-nadia"]')).toBeNull();
    expect(view.find('[data-call-moderate="u-bruno"]')?.getAttribute('aria-label')).toBe('Options pour Bruno');
    view.done();
    const spotlight = mount(<CallGrid members={Object.values(peers)} remoteStreams={{}} self={{ stream: null, cameraOn: false, mirrored: true }} choice={{ kind: 'member', userId: 'u-bruno' }} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={only('u-bruno')} language="fr" />);
    await settle(() => import('./call-moderation-menu'));
    expect(spotlight.find('[data-call-spotlight] [data-call-moderate="u-bruno"]')).not.toBeNull();
    spotlight.done();
    const plain = mount(<CallGrid members={Object.values(peers)} remoteStreams={{}} self={{ stream: null, cameraOn: false, mirrored: true }} choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} language="fr" />);
    expect(plain.find('[data-call-moderate]')).toBeNull();
    plain.done();
  });

  test('« Retirer de l’appel » demande confirmation ; Annuler ne retire personne', () => {
    const log: string[] = [];
    const view = mount(<CallModerationMenu member={member('u-nadia', 'Nadia')} language="fr" moderation={moderation(log)} glyphs={GLYPHS} />);
    view.press('[data-call-moderate]');
    view.press('[data-call-remove]');
    expect(view.find('[role="alertdialog"]')?.textContent).toContain('Retirer Nadia de l’appel ?');
    view.press('[data-call-remove-cancel]');
    expect(log).toEqual([]);
    view.press('[data-call-moderate]');
    view.press('[data-call-remove]');
    view.press('[data-call-remove-confirm-do]');
    expect(log).toEqual(['remove:u-nadia']);
    expect(view.find('[role="alertdialog"]')).toBeNull();
    view.done();
  });

  test('Échap referme le menu et rend le focus au bouton', () => {
    const view = mount(<CallModerationMenu member={member('u-nadia', 'Nadia')} language="fr" moderation={moderation([])} glyphs={GLYPHS} />);
    view.press('[data-call-moderate]');
    act(() => view.find('[data-call-moderation-menu]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.find('[data-call-moderation-menu]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-call-moderate')).toBe('u-nadia');
    view.done();
  });
});

describe('les réactions qui montent et le mot d’un contrôle', () => {
  test('une réaction reçue montre son émoji et le nom de qui l’a envoyée, et se dit au lecteur d’écran', async () => {
    const view = mount(<CallScreen call={call()} canShare />);
    await settle(() => import('./call-control-overlays'));
    act(() => callReactionStore.setState({ bursts: [{ id: 1, emoji: '🔥', userId: 'u-nadia', lane: 0.5 }] }));
    expect(view.find('[data-call-reaction="🔥"]')?.textContent).toContain('Nadia');
    expect(view.find('[data-call-reactions] [role="status"]')?.textContent).toBe('Nadia a réagi 🔥');
    act(() => callReactionStore.setState({ bursts: [{ id: 2, emoji: '👏', userId: null, lane: 0.3 }] }));
    expect(view.find('[data-call-reactions] [role="status"]')?.textContent).toBe('Vous avez réagi 👏');
    view.done();
  });

  test('« Nadia a coupé votre micro » s’affiche en statut ; un échec s’annonce en alerte', async () => {
    const view = mount(<CallScreen call={call()} canShare />);
    await settle(() => import('./call-control-overlays'));
    act(() => callNoticeStore.setState({ notice: { kind: 'muted-by', byUserId: 'u-nadia' }, seq: 1 }));
    expect(view.find('[data-call-control-notice="muted-by"]')?.textContent).toBe('Nadia a coupé votre micro');
    expect(view.find('[data-call-control-notice="muted-by"]')?.getAttribute('role')).toBe('status');
    act(() => callNoticeStore.setState({ notice: { kind: 'invite-failed', code: 'NOT_A_CONTACT', name: 'Bruno' }, seq: 2 }));
    expect(view.find('[data-call-control-notice="invite-failed"]')?.getAttribute('role')).toBe('alert');
    view.done();
  });
});
