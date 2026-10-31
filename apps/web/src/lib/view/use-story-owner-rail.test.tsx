import type { StoryBrandingContext } from '@/lib/export/scene/scene-export-branding-author';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import type { GallerySaveInput, GallerySaveOutcome, GallerySaver } from '@/lib/gallery/gallery-saver';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import { closeSendSheet } from '@/lib/send/send-sheet-store';
import * as storySaveStore from '@/lib/stories/save-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryOwnerRail, type StoryExportLauncher, type StoryOwnerRail, type StorySceneExporter } from './use-story-owner-rail';

/**
 * `useStoryOwnerRail` (#7116) — l'hôte du plan AUTEUR, mesuré par son API
 * publique. Les lois qu'il COMPOSE (`storyDownloadableMedia`, `downloadFile`,
 * `fileDeliveryPortal`, `storySaveStore`, `openSendSheet`) ont chacune
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

const SCENE = { v: 3, scenes: [{ id: 's', objects: [{ id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, payload: { text: 'Salut' } }] }] };

function storyOf(id: string, withMedia = true): StoryPlaybackStory {
  return {
    id,
    createdAt: new Date().toISOString(),
    ...(withMedia ? { media: [{ id: `m-${id}`, url: MEDIA_URL, mimeType: 'image/jpeg' }] } : {}),
  };
}

type Probe = {
  readonly rail: () => StoryOwnerRail;
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

function mountProbe(host?: FileDeliveryHost, gallerySaver: GallerySaver | null = null, sceneExporter?: StorySceneExporter, exportLauncher?: StoryExportLauncher, branding?: StoryBrandingContext): Probe {
  const announced: string[] = [];
  const delivered: string[] = [];
  const deliveryHost = host ?? anchorHost(delivered);
  const seen: StoryOwnerRail[] = [];
  const announce = (message: string) => announced.push(message);

  function Harness({ story, online }: { readonly story: StoryPlaybackStory | undefined; readonly online: boolean }) {
    seen.push(useStoryOwnerRail({ story, online, announce, language: 'fr', deliveryHost, gallerySaver, preferredLanguages: ['es', 'fr'], ...(sceneExporter !== undefined ? { sceneExporter } : {}), ...(exportLauncher !== undefined ? { exportLauncher } : {}), ...(branding !== undefined ? { branding } : {}) }));
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    rail: () => seen[seen.length - 1] as StoryOwnerRail,
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
  closeSendSheet();
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

  test('un hôte SANS porte de livraison DE FICHIER ⇒ « Vues » seule : Partager livre désormais un FICHIER (#13881)', () => {
    /* « Envoyer » (le rail `forward`, `use-story-send.ts`) garde la feuille
       d'envoi Meeshy, distincte : elle ne lit aucune porte de fichier. */
    probe = mountProbe({});
    probe.render(storyOf('st-a'));
    expect(Object.keys(probe.rail().handlers)).toEqual(['views']);
    expect(probe.rail().imager).toBeUndefined();
  });
});

type Launched = { readonly key: string; readonly fileStem: string; readonly mode: string; readonly media: readonly string[]; readonly gestureContext: boolean };

function launcherSpy(): { readonly launcher: StoryExportLauncher; readonly launched: Launched[] } {
  const launched: Launched[] = [];
  return {
    launched,
    launcher: async ({ subject, mode, audioContext }) => {
      launched.push({ key: subject.key, fileStem: subject.fileStem, mode, media: subject.carrier.media.map((m) => m.src), gestureContext: audioContext !== undefined });
    },
  };
}

describe('useStoryOwnerRail — « Vues » ouvre la feuille de CETTE story ; « Partager » livre le FICHIER composé (#13881)', () => {
  /* La story BOUCLE sous la feuille (#9821) : c'est le lecteur qui le décide
     (`resolveStoryPlaybackHold`), le rail ne la fige plus. */
  test('ouvrir « Vues » ouvre la feuille de CETTE story ; fermer la referme', () => {
    probe = mountProbe();
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.views?.());
    expect(probe.rail().viewers.postId).toBe('st-a');
    act(() => probe?.rail().viewers.close());
    expect(probe.rail().viewers.postId).toBeNull();
  });

  test('« Partager » d’une story à scène lance l’export composé en mode PARTAGE, jamais la feuille d’envoi', async () => {
    const spy = launcherSpy();
    probe = mountProbe(undefined, null, undefined, spy.launcher);
    probe.render({ ...storyOf('st-a'), storyEffects: SCENE });
    act(() => probe?.rail().handlers.share?.());
    await settle(0);
    expect(spy.launched).toEqual([{ key: 'story:st-a', fileStem: 'story-st-a', mode: 'share', media: [MEDIA_URL], gestureContext: true }]);
  });

  test('« Partager » emporte l’emballage de marque : l’auteur lu sur la charge servie, soi reconnu, l’humeur détenue par le web (#13997)', async () => {
    const subjects: { readonly branding: unknown }[] = [];
    const launcher: StoryExportLauncher = async ({ subject }) => {
      subjects.push({ branding: subject.branding });
    };
    probe = mountProbe(undefined, null, undefined, launcher, { viewerId: 'u-author', mood: { emoji: '🎉', message: 'Fête' } });
    probe.render({ ...storyOf('st-a'), storyEffects: SCENE, author: { id: 'u-author', username: 'ana', displayName: 'Ana', isOnline: true } });
    act(() => probe?.rail().handlers.share?.());
    await settle(0);
    expect(subjects[0]?.branding).toMatchObject({ author: { authorId: 'u-author', self: true, moodEmoji: '🎉', moodMessage: 'Fête', presence: { isOnline: true } } });
  });

  test('« Partager » d’une story v1 compose son média seul, filigrané, et le partage', async () => {
    const spy = launcherSpy();
    probe = mountProbe(undefined, null, undefined, spy.launcher);
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.share?.());
    await settle(0);
    expect(spy.launched).toEqual([{ key: 'story:st-a', fileStem: 'story-st-a', mode: 'share', media: [MEDIA_URL], gestureContext: true }]);
  });

  test('« Imager » s’offre sur une story et rend la même composition, au choix de longueur du bandeau', async () => {
    const spy = launcherSpy();
    probe = mountProbe(undefined, null, undefined, spy.launcher);
    probe.render({ ...storyOf('st-a'), storyEffects: SCENE });
    act(() => probe?.rail().imager?.());
    await settle(0);
    expect(spy.launched.map(({ mode, key }) => ({ mode, key }))).toEqual([{ mode: 'imager', key: 'story:st-a' }]);
  });

  test('une story sans rien à composer n’offre pas « Imager »', () => {
    probe = mountProbe();
    probe.render(storyOf('st-texte', false));
    expect(probe.rail().imager).toBeUndefined();
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

  test('l’activation expirée pendant l’export ANNONCE de retaper, jamais un échec définitif (revue #7116, défaut 1)', async () => {
    /* Une coque sans ancre de repli, dont la seule porte de partage refuse par
       `NotAllowedError` — le téléchargement a fait expirer l'activation du
       geste. Le job se libère : le PROCHAIN tap est une activation fraîche. */
    serveImage();
    const expiringHost: FileDeliveryHost = {
      canShareFiles: () => true,
      shareFiles: async () => {
        const error = new Error('not allowed');
        error.name = 'NotAllowedError';
        throw error;
      },
    };
    probe = mountProbe(expiringHost);
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(probe.announced).toEqual(['Réessayez — appuyez de nouveau sur Enregistrer.']);
    expect(probe.rail().saving).toBeNull();
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
    expect(probe.rail().saving).toEqual({ progress: null, cancellable: true });
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

/** La galerie de la coque Android (`@capacitor-community/media`), dont chaque écriture est COMPTÉE. */
function galleryOf(outcome: GallerySaveOutcome): GallerySaver & { readonly saved: GallerySaveInput[] } {
  const saved: GallerySaveInput[] = [];
  return {
    saved,
    available: true,
    save: async (input) => {
      saved.push(input);
      return outcome;
    },
  };
}

describe('useStoryOwnerRail — « Enregistrer » dans la coque Android range la story dans la GALERIE (#9246)', () => {
  test('la story part dans l’album « Meeshy », sans feuille de partage, et l’issue est dite', async () => {
    serveImage();
    const gallery = galleryOf('saved');
    probe = mountProbe(undefined, gallery);
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(gallery.saved.map(({ fileName, mimeType }) => ({ fileName, mimeType }))).toEqual([
      { fileName: 'meeshy-m-st-a.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(probe.delivered).toEqual([]);
    expect(probe.announced).toEqual(['Story enregistrée']);
    expect(probe.rail().saving).toBeNull();
  });

  test('une écriture refusée par la galerie annonce l’échec, sans rouvrir une feuille de partage', async () => {
    serveImage();
    probe = mountProbe(undefined, galleryOf('failed'));
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(probe.delivered).toEqual([]);
    expect(probe.announced).toEqual(['Échec de l’enregistrement']);
  });

  test('une galerie qui ne sait pas écrire ce fichier rend la main à la livraison de fichier', async () => {
    serveImage();
    probe = mountProbe(undefined, galleryOf('unavailable'));
    probe.render(storyOf('st-a'));
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(probe.delivered).toEqual(['meeshy-m-st-a.jpg']);
    expect(probe.announced).toEqual(['Story enregistrée']);
  });
});


describe('useStoryOwnerRail — une story à SCÈNE s’enregistre composée, telle qu’on la voit (#13873)', () => {
  test('une story de TEXTE seul offre « Enregistrer » : sa scène se compose', () => {
    probe = mountProbe();
    probe.render({ ...storyOf('st-texte', false), storyEffects: SCENE });
    expect(Object.keys(probe.rail().handlers).sort()).toEqual(['save', 'share', 'views']);
  });

  test('« Enregistrer » passe par la composition, avec le Prisme du lecteur, et l’annonce', async () => {
    const calls: { readonly fileStem: string; readonly languages: readonly string[]; readonly placeHere: string }[] = [];
    const exporter: StorySceneExporter = async (input) => {
      calls.push({ fileStem: input.subject.fileStem, languages: input.preferredLanguages, placeHere: input.placeHere });
      input.job.report(0.5);
      return 'saved';
    };
    probe = mountProbe(undefined, null, exporter);
    probe.render({ ...storyOf('st-a'), storyEffects: SCENE });
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(calls).toEqual([{ fileStem: 'story-st-a', languages: ['es', 'fr'], placeHere: 'Ici' }]);
    expect(probe.delivered).toEqual([]);
    expect(probe.announced).toEqual(['Story enregistrée']);
    expect(probe.rail().saving).toBeNull();
  });

  test('l’anneau suit la composition, et l’annuler l’arrête', async () => {
    let seenSignal: AbortSignal | null = null;
    const exporter: StorySceneExporter = (input) =>
      new Promise((resolve) => {
        seenSignal = input.job.signal;
        input.job.report(0.4);
        input.job.signal.addEventListener('abort', () => resolve('cancelled'));
      });
    probe = mountProbe(undefined, null, exporter);
    probe.render({ ...storyOf('st-b'), storyEffects: SCENE });
    act(() => probe?.rail().handlers.save?.());
    await settle();
    expect(probe.rail().saving).toMatchObject({ progress: 0.4, cancellable: true });
    act(() => probe?.rail().cancelSave());
    await settle();
    expect((seenSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(probe.rail().saving).toBeNull();
    expect(probe.announced).toEqual(['Export annulé']);
  });
});
