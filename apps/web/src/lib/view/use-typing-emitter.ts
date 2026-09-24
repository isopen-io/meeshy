import { useCallback, useEffect, useRef } from 'react';

import { emitTyping } from '@/lib/api/typing-emit';

/**
 * L'ÉMISSION DE FRAPPE (#5793) — miroir
 * `ConversationSocketHandler.swift:284-331` (constantes `:130-132`) :
 * `typing:start` à l'ENTRÉE puis toutes les 3 s tant que le champ n'est pas
 * vide (keepalive, `typingReemitInterval`) ; `typing:stop` UNE fois dès que
 * le champ redevient vide ou après 3 s d'inactivité (`typingDebounceInterval`).
 *
 * `emitTyping` (`api/typing-emit.ts` — le PORT, jamais `api/realtime.ts` qui
 * POSSÈDE la connexion : voir le doc-comment de ce port, l'importer d'ici
 * faisait de `socket.io-client` une dépendance statique du chunk du fil) est un
 * NO-OP tant qu'aucune connexion n'existe (hors ligne, session non établie) —
 * ce hook ne le sait pas et n'a pas à le savoir, motif `useSend`/`performSend`
 * (la RÈGLE est ailleurs, ce hook ne fait que la DÉCLENCHER).
 */
const IDLE_TIMEOUT_MS = 3000;
const REEMIT_INTERVAL_MS = 3000;

export function useTypingEmitter(conversationId: string): (text: string) => void {
  const emitting = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reemitTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (idleTimer.current !== null) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (!emitting.current) return;
    emitting.current = false;
    if (reemitTimer.current !== null) {
      clearInterval(reemitTimer.current);
      reemitTimer.current = null;
    }
    emitTyping(conversationId, false);
  }, [conversationId]);

  const start = useCallback(() => {
    if (!emitting.current) {
      emitting.current = true;
      emitTyping(conversationId, true);
      reemitTimer.current = setInterval(() => emitTyping(conversationId, true), REEMIT_INTERVAL_MS);
    }
    if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, IDLE_TIMEOUT_MS);
  }, [conversationId, stop]);

  // DÉMONTAGE / CHANGEMENT DE CONVERSATION — un `typing:stop` PART si l'on
  // quitte le fil en pleine frappe (miroir iOS : `stopTypingEmission` sur
  // `onDisappear`, jamais un frappeur fantôme qui ne s'éteint qu'au minuteur
  // de sécurité RÉCEPTEUR de l'autre bout, 15 s plus tard).
  useEffect(
    () => () => {
      if (idleTimer.current !== null) clearTimeout(idleTimer.current);
      if (reemitTimer.current !== null) clearInterval(reemitTimer.current);
      if (emitting.current) emitTyping(conversationId, false);
    },
    [conversationId],
  );

  return useCallback(
    (text: string) => {
      if (text.trim().length > 0) start();
      else stop();
    },
    [start, stop],
  );
}
