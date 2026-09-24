import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import * as storySaveStore from '@/lib/stories/save-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryOwnerRail, type StoryOwnerRail } from './use-story-owner-rail';

/**
 * `useStoryOwnerRail` (#7116) — l'hôte du plan AUTEUR, mesuré par son API
 * publique. Les lois qu'il COMPOSE (`storyDownloadableMedia`, `downloadFile`,
 * `fileDeliveryPortal`, `storySaveStore`, `sharePublicationLink`) ont chacune
 * leurs témoins.
 *
 * **REVUE** — les vecteurs que le premier jet ne pouvait pas passer :
 * la paire Partager/Enregistrer offerte sur une story SANS média (bouton
 * inerte, mesuré au navigateur) ou dans une coque sans porte de livraison ;
 * l'anneau perdu en revenant sur une story dont l'export tournait ; une seule
 * phrase pour quatre issues ; la story qui avançait sous la feuille de partage.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; fetch: typeof fetch };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  /* `downloadFile` refuse SANS identité : une session suffit — c'est le
     crédential que le port lit, jamais le rôle qu'il présente. */
  sessionStore.getState().establishGuest({
    sessionToken: 'st-owner-rail-test',
    guest: { participantId: null, nickname: 'Auteur', conversationId: 'c1', link: 'l1', mayWrite: true },
  });
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const MEDIA_URL = 'https://cdn.example/story-m4.jpg';

function storyOf(id: string, withMedia = true): StoryPlaybackStory {
  return {
    id,
    createdAt: new Date().toISOString(),
    ...(withMedia ? { media: [{ id: `m-${id}`, url: MEDIA_URL, mimeType: 'image/jpeg' }] } : {}),
  };
}

type Probe = {
  readonly rail: () => StoryOwnerRail;
  readonly pauses: string[];
  readonly resumes: string[];
  readonly announced: string[];
  readonly delivered: string[];
  readonly render: (story: StoryPlaybackStory | undefined, online?: boolean) => void;
  readonly unmount: () => void;
};

/** Un hôte de livraison NAVIGATEUR (l'ancre), dont le clic est COMPTÉ. */
function anchorHost(delivered: string[]): FileDeliveryHost {
  return {
    document: {
      createElement: () => {
        const anchor = { href: '', download: '', click: () => delivered.push(anchor.download) };
        return anchor as unknown as HTMLElement;
      },
      body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el },
    } as never,
    createObjectURL: () => 'blob:story',
    revokeObjectURL: () => undefined,
  };
}

function mountProbe(host?: FileDeliveryHost): Probe {
  const pauses: string[] = [];
  const resumes: string[] = [];
  const announced: string[] = [];
  const delivered: string[] = [];
  const deliveryHost = host ?? anchorHost(delivered);
  const seen: StoryOwnerRail[] = [];
  const pause = () => pauses.push('pause');
  const resume = () => resumes.push('resume');
  const announce = (message: string) => announced.push(message);

  function Harness({ story, online }: { readonly story: StoryPlaybackStory | undefined; readonly online: boolean }) {
    seen.push(useStoryOwnerRail({ story, online, pause, resume, announce, language: 'fr', deliveryHost }));
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    rail: () => seen[seen.length - 1] as StoryOwnerRail,
    pauses,
    resumes,
    announced,
    delivered,
    render: (story, online = true) => act(() => root.render(<Harness story={story} online={online} />)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const settle = (ms = 30) => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ms)));

let originalFetch: typeof fetch;
let probe: Probe | undefined;
beforeEach(() => {
  originalFetch = globals.fetch;
});
afterEach(() => {
  globals.fetch = originalFetch;
  probe?.unmount();
  probe = undefined;
  for (const id of ['st-a', 'st-b', 'st-texte']) storySaveStore.cancel(id);
});

function serveImage(): void {
  globals.fetch = (async () =>
    new Response(new Blob(['octets'], { type: 'image/jpeg' }), { status: 200, headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
}

function hangingFetch(): { readonly calls: () => number } {
  let calls = 0;
  globals.fetch = ((_url: string, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (init?.signal?.aborted === true) abort();
      else init?.signal?.addEventListener('abort', abort);
    });
  }) as unknown as typeof fetch;
  return { calls: () => calls };
}

describe('useStoryOwnerRail — ce que le plan auteur OFFRE', () => {
  test('story AVEC média exportable ⇒ Vues, Partager et Enregistrer', () => {
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    expect(Object.keys(probe.rail().handlers).sort()).toEqual(['save', 'share', 'views']);
  });

  test('story SANS média ⇒ « Vues » seule : Partager et Enregistrer disparaissent ENSEMBLE (Q1)', () => {
    probe = mountProbe();
    probe.render(storyOf('st-texte', false));
    expect(Object.keys(probe.rail().handlers)).toEqual(['views']);
  });

  test('un hôte SANS porte de livraison (coque Android) ⇒ « Vues » seule — aucun bouton sans effet', () => {
    probe = mountProbe({});
    probe.render(storyOf('st-a'));
    expect(Object.keys(probe.rail().handlers)).toEqual(['views']);
  });
});

describe('useStoryOwnerRail — « Vues » et « Partager » mettent la lecture EN PAUSE', () => {
  test('ouvrir « Vues » met en pause et ouvre la feuille de CETTE story ; fermer reprend', () => {
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.views?.());
    expect(probe.rail().viewers.postId).toBe('st-a');
    expect(probe.pauses).toEqual(['pause']);
    act(() => probe?.rail().viewers.close());
    expect(probe.resumes).toEqual(['resume']);
  });

  test('« Partager » met en pause AVANT la feuille du système et reprend quand elle se referme (iOS `:744-755`)', async () => {
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.share?.());
    expect(probe.pauses).toEqual(['pause']);
    await settle();
    expect(probe.resumes).toEqual(['resume']);
  });
});

describe('useStoryOwnerRail — « Enregistrer » : un job, un anneau, une issue DITE', () => {
  test('un export réussi LIVRE le fichier nommé, l’ANNONCE, et libère le job', async () => {
    serveImage();
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(probe.delivered).toEqual(['meeshy-m-st-a.jpg']);
    expect(probe.announced).toEqual(['Story enregistrée']);
    expect(probe.rail().saving).toBeNull();
  });

  test('HORS LIGNE ⇒ aucun job, l’issue est dite tout de suite', () => {
    probe = mountProbe();
    probe.render(storyOf('st-a'), false);
    act(() => probe?.rail().handlers.save?.());
    expect(probe.rail().saving).toBeNull();
    expect(probe.announced).toEqual(['Hors ligne — réessayez au retour du réseau.']);
  });

  test('un refus de session (401) et un média disparu (404) ne se disent PAS pareil', async () => {
    for (const [status, phrase] of [
      [401, 'Connectez-vous pour enregistrer cette story.'],
      [404, 'Ce média n’est plus disponible.'],
    ] as const) {
      globals.fetch = (async () => new Response('', { status })) as unknown as typeof fetch;
      probe = mountProbe();
      probe.render(storyOf('st-a'));
      act(() => probe?.rail().handlers.save?.());
      await settle();
      expect(probe.announced).toEqual([phrase]);
      probe.unmount();
      probe = undefined;
    }
  });

  test('un SECOND tap pendant l’export est IGNORÉ — un seul téléchargement part', async () => {
    const fetches = hangingFetch();
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => {
      probe?.rail().handlers.save?.();
      probe?.rail().handlers.save?.();
    });
    await settle();
    expect(fetches.calls()).toBe(1);
  });

  test('annuler ANNONCE « Export annulé » et retire l’anneau', async () => {
    hangingFetch();
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    expect(probe.rail().saving).toEqual({ progress: 0, cancellable: true });
    act(() => probe?.rail().cancelSave());
    await settle();
    expect(probe.announced).toEqual(['Export annulé']);
    expect(probe.rail().saving).toBeNull();
  });

  test('L’ANNEAU SURVIT À LA NAVIGATION : il suit SA story, jamais la story affichée', async () => {
    hangingFetch();
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    /* La story suivante n'a PAS d'export : pas d'anneau, et son propre
       « Enregistrer » reste disponible. */
    probe.render(storyOf('st-b'));
    expect(probe.rail().saving).toBeNull();
    /* Retour sur la story dont l'export tourne : l'anneau est LÀ — le premier
       jet rendait « Enregistrer », un bouton que le store refusait. */
    probe.render(storyOf('st-a'));
    expect(probe.rail().saving).not.toBeNull();
  });
});
