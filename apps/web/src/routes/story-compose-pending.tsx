import { useCallback, useRef, useState, type RefObject } from 'react';

import { appQueryClient } from '@/lib/api/query-client';
import { refreshFeedAction } from '@/lib/api/query';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createPublicationKeyring, type PublicationKeyring } from '@/lib/stories/publication-mutation-key';

/**
 * **LA PUBLICATION EN ATTENTE, VISIBLE ET ANNULABLE** (#10316) — hors ligne,
 * Publier ARME l'intention (`story-compose.tsx`) : elle attend le retour du
 * réseau dans le composer, puis part seule. L'auteur doit pouvoir la VOIR en
 * attente et la RETIRER, avant le départ comme pendant l'envoi.
 *
 *  - **armée** (`awaitingNetwork`) — l'annuler la désarme : au retour du
 *    réseau, rien ne part. Le brouillon reste, intact ;
 *  - **en vol** (`sending`) — l'annuler COUPE la requête (`cancelSignal`,
 *    transmis au transport) et arrête la séquence avant la publication
 *    suivante. Si le serveur l'avait déjà reçue, la publication EXISTE : les
 *    plateaux et le fil sont relus, le serveur fait foi — aucun état fantôme.
 *    Un rejeu du même contenu repart sous la même clé (`keyring`), et la
 *    passerelle rend la publication déjà écrite au lieu d'une seconde.
 *
 * Le démontage, lui, ne coupe jamais une requête en vol (`sendRef`, lu entre
 * deux requêtes seulement) : quitter le studio n'est pas annuler.
 */
export type StudioPendingSend = {
  readonly awaitingNetwork: boolean;
  readonly sending: boolean;
  readonly keyring: PublicationKeyring;
  readonly arm: () => void;
  readonly disarm: () => void;
  /** L'envoi commence : rend le signal que l'annulation abandonne. */
  readonly begin: () => AbortSignal;
  /** L'envoi de CE signal a rendu son issue — plus rien à annuler. Un envoi
   * annulé qui rend la sienne APRÈS qu'un nouveau a commencé ne touche pas au
   * nouveau. */
  readonly settle: (signal: AbortSignal) => void;
  readonly cancel: () => void;
};

export function useStudioPendingSend(params: {
  readonly sendRef: RefObject<AbortController | null>;
  /** Rend la capsule à Publier (`publishing`, la progression). */
  readonly release: () => void;
}): StudioPendingSend {
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyring] = useState(() => createPublicationKeyring());
  const cancelRef = useRef<AbortController | null>(null);
  const { sendRef, release } = params;

  const arm = useCallback(() => setAwaitingNetwork(true), []);
  const disarm = useCallback(() => setAwaitingNetwork(false), []);
  const begin = useCallback((): AbortSignal => {
    const controller = new AbortController();
    cancelRef.current = controller;
    setAwaitingNetwork(false);
    setSending(true);
    return controller.signal;
  }, []);
  const settle = useCallback((signal: AbortSignal) => {
    if (cancelRef.current?.signal !== signal) return;
    cancelRef.current = null;
    setSending(false);
  }, []);
  const cancel = useCallback(() => {
    const inFlight = cancelRef.current;
    cancelRef.current = null;
    setAwaitingNetwork(false);
    setSending(false);
    if (inFlight === null) return;
    inFlight.abort();
    sendRef.current?.abort();
    release();
    void appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX }).catch(() => undefined);
    void refreshFeedAction().catch(() => undefined);
  }, [sendRef, release]);

  return { awaitingNetwork, sending, keyring, arm, disarm, begin, settle, cancel };
}

/** Le bandeau du plateau : hors ligne, l'état de la publication en attente
 * et le geste qui la retire. */
export function StudioPendingBand(props: {
  readonly lang: InterfaceLanguage;
  readonly online: boolean;
  readonly pending: Pick<StudioPendingSend, 'awaitingNetwork' | 'sending' | 'cancel'>;
}) {
  const { awaitingNetwork, sending, cancel } = props.pending;
  const cancellable = awaitingNetwork || sending;
  if (!cancellable && props.online) return null;
  return (
    <div role="status" data-studio-pending={cancellable ? (sending ? 'sending' : 'awaiting') : undefined} className="glass absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 py-1 text-caption" style={{ color: 'var(--color-ios-ink)' }}>
      <p className="min-w-0 flex-1">{translate(props.lang, sending ? 'story.studio.pending.sending' : 'story.studio.offline')}</p>
      {cancellable ? (
        <button type="button" data-studio-cancel-send onClick={cancel} className="min-h-11 shrink-0 font-semibold" style={{ color: 'var(--color-danger)' }}>
          {translate(props.lang, 'story.studio.pending.cancel')}
        </button>
      ) : null}
    </div>
  );
}
