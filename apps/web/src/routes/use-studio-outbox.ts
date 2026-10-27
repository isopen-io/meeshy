import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { PublicationKeyring } from '@/lib/stories/publication-mutation-key';
import type { PublishChoice } from '@/lib/stories/publication-layout';
import type { StudioDraft } from '@/lib/stories/studio';
import { draftWithOutbox, outboxSlotsOf, type StudioOutbox, type StudioOutboxIntent } from '@/lib/stories/studio-outbox';

/** Ce que l'auteur a DIT au moment de Publier — l'état et les clés s'y ajoutent. */
export type StudioPublishIntent = { readonly choice: PublishChoice; readonly promoted: boolean };

export type StudioOutboxSession = {
  /** Une publication d'une session précédente, ÉCHOUÉE : proposée, jamais rejouée seule. */
  readonly unsent: StudioOutboxIntent | null;
  /** `false` dès que l'appareil a refusé de garder les médias (navigation privée, quota). */
  readonly durable: boolean;
  /** L'appareil a refusé, et des médias locaux ne survivraient pas à un rechargement. */
  readonly volatile: boolean;
  readonly arm: (intent: StudioPublishIntent) => void;
  readonly fail: () => void;
  /** L'auteur retire l'envoi : l'intention part, le brouillon et ses médias restent. */
  readonly disarm: () => void;
  /** La publication est confirmée, ou l'auteur la SUPPRIME : plus rien sur l'appareil. */
  readonly discard: () => void;
};

/**
 * **LES PUBLICATIONS NON ENVOYÉES, CÔTÉ STUDIO** (#13416) — relit, à
 * l'ouverture, ce que l'appareil garde pour ce compte (médias et intention),
 * puis écrit chaque changement du brouillon. Rien n'est écrit avant la
 * relecture : l'écran neuf n'efface jamais ce qu'il n'a pas encore lu.
 *
 * Une intention `armed` (hors ligne, ou l'envoi était en vol) repart seule
 * (`onResume`) ; une intention `failed` est PROPOSÉE (`unsent`).
 */
export function useStudioOutbox(params: {
  readonly outbox: StudioOutbox | null;
  readonly viewerId: string | null;
  readonly draft: StudioDraft;
  readonly setDraft: (change: (current: StudioDraft) => StudioDraft) => void;
  readonly language: string;
  readonly blobs: RefObject<Set<string>>;
  readonly purged: RefObject<boolean>;
  readonly keyring: PublicationKeyring;
  readonly onResume: (intent: StudioOutboxIntent) => void;
}): StudioOutboxSession {
  const { outbox, viewerId, draft, keyring } = params;
  const active = outbox !== null && viewerId !== null;
  const [loaded, setLoaded] = useState(!active);
  const [unsent, setUnsent] = useState<StudioOutboxIntent | null>(null);
  const [durable, setDurable] = useState(true);
  const intentRef = useRef<StudioPublishIntent & { readonly state: StudioOutboxIntent['state'] } | null>(null);
  const latest = useRef(params);
  latest.current = params;

  const write = useCallback(() => {
    const { outbox: store, viewerId: viewer, draft: current, purged } = latest.current;
    if (store === null || viewer === null || purged.current === true) return;
    const intent = intentRef.current === null ? null : { ...intentRef.current, keys: keyring.entries() };
    void store.save(viewer, { slots: outboxSlotsOf(current), intent }).then(setDurable, () => setDurable(false));
  }, [keyring]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void outbox.load(viewerId).then((record) => {
      if (!alive) return;
      if (record !== null) {
        const { setDraft, language, blobs } = latest.current;
        const makeUrl = (file: File): string => {
          const url = URL.createObjectURL(file);
          blobs.current?.add(url);
          return url;
        };
        if (record.slots.length > 0) setDraft((current) => draftWithOutbox(current, record.slots, { makeUrl, language }));
        const intent = record.intent;
        if (intent !== null) {
          keyring.adopt(intent.keys);
          intentRef.current = { choice: intent.choice, promoted: intent.promoted, state: intent.state };
          if (intent.state === 'failed') setUnsent(intent);
          else latest.current.onResume(intent);
        }
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) write();
  }, [loaded, draft, write]);

  useEffect(() => keyring.subscribe(() => loaded && intentRef.current !== null && write()), [keyring, loaded, write]);

  const note = useCallback(
    (intent: typeof intentRef.current) => {
      intentRef.current = intent;
      setUnsent(null);
      if (loaded) write();
    },
    [loaded, write],
  );

  const arm = useCallback((intent: StudioPublishIntent) => note({ ...intent, state: 'armed' }), [note]);
  const fail = useCallback(() => note(intentRef.current === null ? null : { ...intentRef.current, state: 'failed' }), [note]);
  const disarm = useCallback(() => note(null), [note]);
  const discard = useCallback(() => {
    intentRef.current = null;
    setUnsent(null);
    const { outbox: store, viewerId: viewer } = latest.current;
    if (store !== null && viewer !== null) void store.clear(viewer);
  }, []);

  return { unsent, durable, volatile: !durable && outboxSlotsOf(draft).length > 0, arm, fail, disarm, discard };
}
