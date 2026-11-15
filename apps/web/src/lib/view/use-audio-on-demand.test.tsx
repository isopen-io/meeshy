import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, jest, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Attachment } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  createMediaProcessingFailuresStore,
  type MediaProcessingFailuresApi,
} from '@/lib/api/media-processing-failures';
import {
  applyAudioTranslationFailed,
  applyTranscriptionFailed,
  isMediaProcessingFailed,
} from '@/lib/api/realtime-media-processing-failed';

import { ON_DEMAND_STALL_MS, useAudioOnDemand, type AudioOnDemand } from './use-audio-on-demand';

/**
 * #10629 — UNE DEMANDE QUE LE SERVEUR MET EN FILE NE FIGE PAS LE BOUTON.
 * La passerelle répond `processing` et le résultat arrive par le temps réel ;
 * s'il n'arrive jamais (traducteur arrêté, socket coupée), « Transcription… »
 * restait affiché pour toujours, bouton désactivé. iOS lève l'attente après
 * un plafond (`requestServerTranscription`, 20 s) : le web fait de même, et
 * la demande se refait.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const wait = (ms: number) => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const onSilentClock = async (run: () => Promise<void>) => {
  jest.useFakeTimers();
  try {
    await run();
  } finally {
    jest.useRealTimers();
  }
};

const bare = (): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-queued',
    messageId: 'm-queued',
    fileName: 'note.wav',
    originalName: 'note.wav',
    mimeType: 'audio/wav',
    fileSize: 4096,
    fileUrl: 'https://cdn.meeshy.me/note.wav',
    uploadedBy: 'u-kwame',
    createdAt: '2026-10-15T09:00:00.000Z',
    duration: 8_000,
  }) as Attachment;

const queuingGateway = () => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push(request);
      return { ok: true, data: { status: 'processing', transcription: null } };
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { calls, deps };
};

const mount = (deps: ConversationsDeps) => {
  const state: { current: AudioOnDemand | null } = { current: null };
  function Probe() {
    state.current = useAudioOnDemand({ attachment: bare(), fallbackLanguage: 'fr', readerLanguages: ['fr', 'en'], deps, stallAfterMs: 40 });
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  const read = (): AudioOnDemand => {
    if (state.current === null) throw new Error('sonde non montée');
    return state.current;
  };
  return {
    read,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe('une demande mise en file ne fige pas le lecteur (#10629)', () => {
  test('« Transcription… » se lève après le plafond, et « Transcrire » redemande', async () => {
    const { calls, deps } = queuingGateway();
    const probe = mount(deps);
    await act(async () => probe.read().transcribe());
    expect(probe.read().transcribing).toBe(true);

    await wait(80);
    expect(probe.read().transcribing).toBe(false);

    await act(async () => probe.read().transcribe());
    expect(calls.filter((call) => call.path.endsWith('/transcribe'))).toHaveLength(2);
    expect(probe.read().transcribing).toBe(true);
    probe.unmount();
  });

  test('une transcription en attente ne se redemande pas avant le plafond', async () => {
    const { calls, deps } = queuingGateway();
    const probe = mount(deps);
    await act(async () => probe.read().transcribe());
    await act(async () => probe.read().transcribe());
    expect(calls.filter((call) => call.path.endsWith('/transcribe'))).toHaveLength(1);
    probe.unmount();
  });

  test('une traduction en attente cesse de l’être après le plafond, et se redemande', async () => {
    const { calls, deps } = queuingGateway();
    const probe = mount(deps);
    await act(async () => probe.read().requestTranslation('en'));
    expect(probe.read().pendingLanguages).toEqual(['en']);

    await wait(80);
    expect(probe.read().pendingLanguages).toEqual([]);

    await act(async () => probe.read().requestTranslation('en'));
    expect(calls.filter((call) => call.path.endsWith('/translate'))).toHaveLength(2);
    expect(probe.read().pendingLanguages).toEqual(['en']);
    probe.unmount();
  });
});

/**
 * #10759 — WHISPER MET ~25 s SUR STAGING : un plafond de 20 s rendait
 * « Transcrire » pendant que la tâche tournait encore, et la transcription
 * arrivait dix secondes plus tard. L'attente ne se lève que sur un vrai
 * silence (90 s) ; l'arrivée du résultat par le temps réel
 * (`audio:transcription-ready`, greffé sur la pièce) la lève aussitôt.
 */
describe('une transcription lente n’est pas prise pour un silence (#10759)', () => {
  const transcribed = (attachment: Attachment): Attachment => ({
    ...attachment,
    transcription: { type: 'audio', transcribedText: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper' },
  }) as Attachment;

  const mountLive = (deps: ConversationsDeps) => {
    const state: { current: AudioOnDemand | null } = { current: null };
    function Probe({ attachment }: { readonly attachment: Attachment }) {
      state.current = useAudioOnDemand({ attachment, fallbackLanguage: 'fr', readerLanguages: ['fr', 'en'], deps });
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Probe attachment={bare()} />));
    const read = (): AudioOnDemand => {
      if (state.current === null) throw new Error('sonde non montée');
      return state.current;
    };
    return {
      read,
      receive: (attachment: Attachment) => act(() => root.render(<Probe attachment={attachment} />)),
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  const onFakeClock = async (run: () => Promise<void>) => {
    jest.useFakeTimers();
    try {
      await run();
    } finally {
      jest.useRealTimers();
    }
  };

  test('le plafond de sûreté est de 90 s', () => {
    expect(ON_DEMAND_STALL_MS).toBe(90_000);
  });

  test('une transcription arrivée à 30 s s’affiche sans que « Transcrire » soit revenu entre-temps', () =>
    onFakeClock(async () => {
      const { deps } = queuingGateway();
      const probe = mountLive(deps);
      await act(async () => probe.read().transcribe());

      for (const _second of Array.from({ length: 30 })) {
        act(() => jest.advanceTimersByTime(1_000));
        expect(probe.read().transcribing).toBe(true);
      }

      probe.receive(transcribed(bare()));
      expect(probe.read().served.transcription).toMatchObject({ transcribedText: 'Bonjour à tous' });
      expect(probe.read().transcribing).toBe(false);
      expect(probe.read().canTranscribe).toBe(false);
      probe.unmount();
    }));

  test('au-delà de 90 s sans rien, « Transcrire » revient et redemande', () =>
    onFakeClock(async () => {
      const { calls, deps } = queuingGateway();
      const probe = mountLive(deps);
      await act(async () => probe.read().transcribe());

      act(() => jest.advanceTimersByTime(89_000));
      expect(probe.read().transcribing).toBe(true);
      act(() => jest.advanceTimersByTime(1_000));
      expect(probe.read().transcribing).toBe(false);

      await act(async () => probe.read().transcribe());
      expect(calls.filter((call) => call.path.endsWith('/transcribe'))).toHaveLength(2);
      probe.unmount();
    }));
});

/**
 * #18537 — LA PASSERELLE DIT LA PANNE EN UNE SECONDE, LE LECTEUR L'ATTENDAIT 90.
 *
 * `audio:transcription-failed` / `audio:translation-failed` sont diffusés sur la
 * room de la conversation, et lus par iOS comme par Android depuis toujours. Le
 * web n'avait aucun puits : la puce restait figée sur « Transcription… » pendant
 * tout le plafond de SILENCE, puis rendait la main **sans servir le `notice`
 * dessiné pour cette phrase exacte**.
 *
 * Le harnais INJECTE son magasin : le singleton de module ferait fuir le verdict
 * d'un témoin dans le suivant, et un témoin qui hérite d'un état ne peut plus
 * dire ce qu'il garde.
 */
describe('une panne dite par le temps réel lève l’attente et se dit (#18537)', () => {
  const mountOn = (deps: ConversationsDeps, failures: MediaProcessingFailuresApi) => {
    const state: { current: AudioOnDemand | null } = { current: null };
    function Probe() {
      state.current = useAudioOnDemand({
        attachment: bare(),
        fallbackLanguage: 'fr',
        readerLanguages: ['fr', 'en'],
        deps,
        stallAfterMs: 10_000,
        failures,
      });
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    const read = (): AudioOnDemand => {
      if (state.current === null) throw new Error('sonde non montée');
      return state.current;
    };
    return {
      read,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  const failedEvent = (attachmentId: string) => ({
    conversationId: '68c1f0a9b2d4e5f601020304',
    messageId: 'm-queued',
    attachmentId,
    error: 'whisper unavailable',
  });

  test('« Transcription… » tombe à l’arrivée de la panne, bien avant le plafond, et la phrase est servie', async () => {
    const { deps } = queuingGateway();
    const failures = createMediaProcessingFailuresStore();
    const probe = mountOn(deps, failures);
    await act(async () => probe.read().transcribe());
    expect(probe.read().transcribing).toBe(true);
    expect(probe.read().notice).toBeNull();

    const payload = failedEvent('a-queued');
    expect(isMediaProcessingFailed(payload)).toBe(true);
    await act(async () => applyTranscriptionFailed(failures, payload));

    expect(probe.read().transcribing).toBe(false);
    expect(probe.read().notice).toBe('media.audio.transcribe_failed');
    probe.unmount();
  });

  test('la panne d’une AUTRE pièce ne touche pas celle-ci', async () => {
    const { deps } = queuingGateway();
    const failures = createMediaProcessingFailuresStore();
    const probe = mountOn(deps, failures);
    await act(async () => probe.read().transcribe());

    await act(async () => applyTranscriptionFailed(failures, failedEvent('a-autre')));

    expect(probe.read().transcribing).toBe(true);
    expect(probe.read().notice).toBeNull();
    probe.unmount();
  });

  test('« Traduction… » tombe pour TOUTES les langues en attente — l’événement n’en nomme aucune', async () => {
    const { deps } = queuingGateway();
    const failures = createMediaProcessingFailuresStore();
    const probe = mountOn(deps, failures);
    await act(async () => probe.read().requestTranslation('en'));
    await act(async () => probe.read().requestTranslation('es'));
    expect(probe.read().pendingLanguages).toEqual(['en', 'es']);

    await act(async () => applyAudioTranslationFailed(failures, failedEvent('a-queued')));

    expect(probe.read().pendingLanguages).toEqual([]);
    expect(probe.read().notice).toBe('media.audio.translate_failed');
    probe.unmount();
  });

  test('redemander efface le verdict : la seconde demande affiche de nouveau son attente', async () => {
    const { calls, deps } = queuingGateway();
    const failures = createMediaProcessingFailuresStore();
    const probe = mountOn(deps, failures);
    await act(async () => probe.read().transcribe());
    await act(async () => applyTranscriptionFailed(failures, failedEvent('a-queued')));
    expect(probe.read().transcribing).toBe(false);

    await act(async () => probe.read().transcribe());

    expect(probe.read().transcribing).toBe(true);
    expect(probe.read().notice).toBeNull();
    expect(calls.filter((call) => call.path.endsWith('/transcribe'))).toHaveLength(2);
    probe.unmount();
  });

  /**
   * Les deux faits sont DISJOINTS, et c'est la moitié du lot qu'on casserait le
   * plus facilement : retirer le plafond parce que le temps réel existe figerait
   * le bouton pour toujours exactement quand le signal ne peut pas arriver.
   */
  test('le plafond de silence survit à l’arrivée du puits — rien ne vient, l’attente se lève quand même', () =>
    onSilentClock(async () => {
      const { deps } = queuingGateway();
      const failures = createMediaProcessingFailuresStore();
      const probe = mountOn(deps, failures);
      await act(async () => probe.read().transcribe());

      act(() => jest.advanceTimersByTime(9_000));
      expect(probe.read().transcribing).toBe(true);
      act(() => jest.advanceTimersByTime(1_000));

      expect(probe.read().transcribing).toBe(false);
      expect(probe.read().notice).toBeNull();
      probe.unmount();
    }));
});
