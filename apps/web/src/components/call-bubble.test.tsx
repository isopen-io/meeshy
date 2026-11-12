import { beforeAll, describe, expect, test } from 'bun:test';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';

import { CallBubble } from './call-bubble';
import { ActiveCallView } from './call-overlay';
import { CallScreen, loadColdCallViews } from './call-screen';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

/**
 * **CONTINUER À DISCUTER PENDANT L'APPEL, DESSINÉ** (#8046) — la pastille se
 * replie en bulle, la bulle garde ses trois gestes (revenir, micro,
 * raccrocher), et ni l'une ni l'autre n'est une boîte modale : l'application
 * reste utilisable dessous. L'écran d'appel porte les périphériques.
 */

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const overlay = (active: ActiveCall) => renderToStaticMarkup(<ActiveCallView call={active} />);

/* La pastille vit dans son chunk (`call-floating-pill.tsx`), que l'appel vivant charge : le rendu sans geste la trouve chargée, comme l'écran la trouve. */
beforeAll(async () => {
  overlay(call({ display: 'pill' }));
  await import('./call-floating-pill');
  await loadCallControlsCatalog('fr');
  await loadColdCallViews();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('la pastille', () => {
  test('propose de se replier en bulle, sans bloquer l’application', () => {
    const html = overlay(call({ display: 'pill' }));
    expect(html).toContain('data-call-pill-bar');
    expect(html).toContain('aria-label="Réduire en bulle"');
    expect(html).not.toContain('aria-modal');
  });
});

describe('je partage mon écran : l’appel réduit en capsule (#16664)', () => {
  test('la capsule rougit, montre l’écran et offre « Arrêter » ; le micro et la bulle cèdent la place', () => {
    const html = overlay(call({ display: 'pill', screenSharing: true }));
    expect(html).toContain('data-call-pill-sharing=""');
    expect(html).toMatch(/aria-label="Arrêter le partage d’écran"[^>]*data-call-pill-stop-share=""[^>]*>Arrêter</);
    expect(html).not.toContain('data-call-pill-collapse');
  });

  test('sans partage, la pastille reste celle de toujours', () => {
    const html = overlay(call({ display: 'pill' }));
    expect(html).not.toContain('data-call-pill-sharing');
    expect(html).not.toContain('data-call-pill-stop-share');
  });
});

describe('la bulle', () => {
  test('remplace la pastille : revenir, micro, raccrocher — et la consigne clavier pour la déplacer', () => {
    expect(overlay(call({ display: 'bubble' }))).toBe('');
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />);
    expect(html).toContain('data-call-bubble="right"');
    expect(html).toContain('aria-label="Revenir à l’appel"');
    expect(html).toContain('data-call-bubble-control="mic"');
    expect(html).toContain('data-call-bubble-control="hangup"');
    expect(html).toContain('Les flèches déplacent la bulle');
    expect(html).not.toContain('data-call-screen');
    expect(html).not.toContain('aria-modal');
  });

  test('la sonnerie et la fin reprennent l’écran plein, même réduites', () => {
    expect(overlay(call({ display: 'bubble', phase: { kind: 'incoming' }, direction: 'incoming' }))).toContain('data-call-screen="incoming"');
    expect(overlay(call({ display: 'bubble', phase: { kind: 'ended', reason: 'remote', detail: null } }))).toContain('data-call-screen="ended"');
  });

  test('sans vidéo, le navigateur n’a rien à faire flotter : pas de bouton image dans l’image', () => {
    expect(renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />)).not.toContain('data-call-bubble-control="pip"');
  });
});

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

const peer = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-a', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const withSinks = (sinks: boolean, render: () => string): string => {
  const scope = globalThis as { HTMLMediaElement?: unknown };
  const saved = scope.HTMLMediaElement;
  scope.HTMLMediaElement = sinks ? { prototype: { setSinkId: () => undefined } } : { prototype: {} };
  try {
    return render();
  } finally {
    scope.HTMLMediaElement = saved;
  }
};

describe('la bulle, en grand ou en petit (#8145)', () => {
  test('elle dit sa taille et comment la changer', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />);
    expect(html).toContain('data-call-bubble-size="small"');
    expect(html).toContain('+ et − changent sa taille');
  });
});

describe('un écran partagé dans la bulle (#8164)', () => {
  test('il s’y voit ENTIER, une caméra y reste recadrée', () => {
    const sharing = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', members: { 'u-a': peer({ screenSharing: true }) }, remoteStreams: { 'u-a': liveVideo } })} />);
    expect(sharing).toContain('data-call-stream="contain"');
    const camera = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', members: { 'u-a': peer({ cameraOn: true }) }, remoteStreams: { 'u-a': liveVideo } })} />);
    expect(camera).toContain('data-call-stream="cover"');
  });
});

describe('la sortie audio depuis la bulle (#9097)', () => {
  test('« Sortie audio » est dans la bulle là où le navigateur choisit la sortie ; absent sinon', () => {
    const offered = withSinks(true, () => renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />));
    expect(offered).toContain('data-call-bubble-control="output"');
    expect(offered).toContain('aria-label="Sortie audio"');
    expect(offered).toContain('aria-haspopup="dialog"');
    expect(withSinks(false, () => renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />))).not.toContain('data-call-bubble-control="output"');
  });
});

describe('l’écran d’appel', () => {
  test('en appel, l’en-tête ouvre les périphériques ; pendant la sonnerie, non', () => {
    expect(renderToStaticMarkup(<CallScreen call={call()} />)).toContain('aria-label="Sortie audio"');
    expect(renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming' })} />)).not.toContain('Sortie audio');
  });
});

describe('la bulle ne déplace que son `translate` (#11314)', () => {
  test('ancrée en haut à gauche, posée par `translate`, avec la seule transition de `translate`', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />);
    expect(html).toContain('left:0');
    expect(html).toContain('top:0');
    expect(html).toContain('translate:');
    expect(html).toContain('transition:translate 180ms ease-out');
    expect(html).not.toMatch(/transition:[^;"]*(left|top|width|height)/);
  });
});

const tagOf = (html: string, marker: string): string => html.match(new RegExp(`<[^>]*${marker}[^>]*>`))?.[0] ?? '';

const knowConversation = (customName?: string) =>
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pageParams: [],
    pages: [{ conversations: [{ id: 'c-1', type: 'direct', title: 'Amina Diallo', userPreferences: customName === undefined ? [] : [{ customName }] }] }],
  });

describe('la bulle montre l’autre, pas moi (P18.3)', () => {
  const mineOnly = call({ display: 'bubble', peerKey: 'u-peer', cameraOn: true, localStream: liveVideo, members: { 'u-peer': peer({ userId: 'u-peer', cameraOn: false }) } });

  test('sa caméra coupée et la mienne allumée : son avatar, aucune vidéo — la bulle n’affiche jamais ma caméra', () => {
    const html = renderToStaticMarkup(<CallBubble call={mineOnly} />);
    expect(html).not.toContain('data-call-stream');
    expect(html).toContain('data-call-bubble-caption');
  });

  test('sa caméra allumée : sa vidéo', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', peerKey: 'u-peer', members: { 'u-peer': peer({ userId: 'u-peer', cameraOn: true }) }, remoteStreams: { 'u-peer': liveVideo } })} />);
    expect(html).toContain('data-call-stream="cover"');
  });
});

describe('le liseré de la bulle (P18.4)', () => {
  test('il porte la couleur partagée de l’autre — celle de son id et de son nom, jamais celle du titre seul', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', peerKey: 'u-peer', title: 'Amina Diallo' })} />);
    const ring = tagOf(html, 'data-call-bubble-ring');
    expect(ring).not.toBe('');
    expect(ring.toLowerCase()).toContain(authorAccentColor('u-peer', 'Amina Diallo').toLowerCase());
  });

  test('la teinte de l’avatar est la même', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', peerKey: 'u-peer', title: 'Amina Diallo' })} />).toLowerCase();
    expect(html.split(authorAccentColor('u-peer', 'Amina Diallo').toLowerCase()).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('l’étiquette « nom · durée » de la bulle (P18.5)', () => {
  test('sur un verre, avec le nom d’affichage et la durée', () => {
    appQueryClient.removeQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', connectedAt: Date.now() - 252_000 })} />);
    const tag = tagOf(html, 'data-call-bubble-caption');
    expect(tag).toContain('glass-call');
    expect(html).toMatch(/data-call-bubble-caption[^>]*>Amina Diallo · \d+:\d{2}</);
  });

  test('le nom que j’ai donné à la personne passe avant son nom d’affichage (#17341)', () => {
    knowConversation('Awa');
    try {
      expect(renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />)).toMatch(/data-call-bubble-caption[^>]*>Awa · /);
    } finally {
      appQueryClient.removeQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    }
  });

  test('en vidéo aussi, l’étiquette est en bas à gauche de l’image', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', members: { 'u-a': peer({ cameraOn: true }) }, remoteStreams: { 'u-a': liveVideo } })} />);
    expect(html).toMatch(/data-call-bubble-caption[^>]*>Amina Diallo · /);
  });
});

describe('la bulle et la capsule s’effacent pendant l’image dans l’image (P18.9)', () => {
  test('la bulle s’efface en fondu, retirée du toucher et du lecteur d’écran ; elle revient avec la fenêtre fermée', () => {
    const away = tagOf(renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} away />), 'data-call-bubble="');
    expect(away).toContain('aria-hidden="true"');
    expect(away).toContain('inert');
    expect(away).toContain('opacity:0');
    const here = tagOf(renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />), 'data-call-bubble="');
    expect(here).not.toContain('aria-hidden');
    expect(here).not.toContain('opacity:0');
  });

  test('la capsule de même', async () => {
    const { CallPillBar } = await import('./call-floating-pill');
    const away = tagOf(renderToStaticMarkup(<CallPillBar call={call({ display: 'pill' })} away />), 'data-call-pill-bar');
    expect(away).toContain('aria-hidden="true"');
    expect(away).toContain('opacity:0');
    expect(tagOf(renderToStaticMarkup(<CallPillBar call={call({ display: 'pill' })} away={false} />), 'data-call-pill-bar')).not.toContain('aria-hidden');
  });
});

describe('pendant MON partage, la capsule dit le nom donné et ne se replie pas (P18.10)', () => {
  test('« nom donné · durée » au lieu du titre de l’appel ; Arrêter reste', async () => {
    knowConversation('Awa');
    try {
      const { CallPillBar } = await import('./call-floating-pill');
      const html = renderToStaticMarkup(<CallPillBar call={call({ display: 'pill', screenSharing: true })} away={false} />);
      expect(html).toMatch(/Awa · \d+:\d{2}/);
      expect(html).not.toContain('Amina Diallo');
      expect(html).toContain('data-call-pill-stop-share');
    } finally {
      appQueryClient.removeQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    }
  });

  test('hors partage, la capsule garde le titre de l’appel puis la durée', async () => {
    const { CallPillBar } = await import('./call-floating-pill');
    const html = renderToStaticMarkup(<CallPillBar call={call({ display: 'pill' })} away={false} />);
    expect(html).toContain('Amina Diallo');
    expect(html).not.toContain('Amina Diallo ·');
  });
});
