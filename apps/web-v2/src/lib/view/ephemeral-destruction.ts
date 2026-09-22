import { useCallback, useEffect, useRef, useState } from 'react';

import type { EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

/**
 * **LA DESTRUCTION SE VOIT** (#7468, travail 2) — précision du porteur,
 * 2026-09-22 : « sa destruction doit avoir un effet visuel si on est dans la
 * conversation au moment de la destruction ».
 *
 * Le lot #7454 coupait net : `deadlineReached` ⇒ la peau ne rendait plus rien.
 * Correct, et muet — le lecteur voyait un trou, jamais une disparition. Ce
 * module insère une PHASE entre les deux, et le fait de trois côtés :
 * la loi pure ci-dessous, l'annonce que le socket peut faire depuis hors de
 * l'arbre React, et le crochet qui tient la minuterie de retrait.
 */

/**
 * La durée de l'effet, partagée par le CSS (`--ephemeral-destruction-ms`,
 * `thread-protection.css`) et par la fenêtre de la loi. **Une seule valeur**
 * : une animation plus longue que la fenêtre se ferait couper au milieu, une
 * fenêtre plus longue que l'animation laisserait une rangée vide à l'écran.
 */
export const DESTRUCTION_MS = 700;

export type DestructionPhase = 'visible' | 'destroying' | 'gone';

/**
 * LA PHASE D'UNE RANGÉE ÉPHÉMÈRE — pure, et **sans état**, ce qui n'est pas un
 * détail de style : c'est ce qui ferme la course.
 *
 * Entre l'instant de l'échéance et le tic suivant de l'horloge partagée,
 * l'écran peut se rendre pour une raison étrangère — une frappe, un
 * défilement qui bouge le virtualiseur. Si la phase se lisait d'un ensemble
 * alimenté par le seul rappel du chrome, ce rendu-là couperait la rangée net,
 * sans effet, exactement le défaut qu'on corrige. En comparant l'échéance à
 * MAINTENANT, la fenêtre répond « en destruction » quel que soit celui qui
 * demande, et sans que personne ait eu à l'annoncer.
 *
 * L'ordre des trois causes porte chacune sa raison :
 * 1. `expired` — le retrait a DÉJÀ eu lieu, il n'y a plus de sujet ;
 * 2. `destroying` — une annonce (`message:expired`) peut précéder l'échéance
 *    que le client a calculée : horloges qui dérivent, destruction anticipée
 *    côté serveur. L'annonce gagne sur l'arithmétique, sinon la rangée
 *    partirait sans effet par le chemin qui deviendra le plus fréquent ;
 * 3. la fenêtre — et passée la fenêtre, `gone` : **on n'assiste pas à une
 *    destruction passée.** Un fil rouvert des heures plus tard ne rejoue pas
 *    la combustion de chaque éphémère échu ; ce serait raconter un fait auquel
 *    le lecteur n'était pas.
 */
export function destructionPhaseOf(input: {
  readonly deadline: EphemeralDeadline;
  readonly now: number;
  readonly destroying: boolean;
  readonly expired: boolean;
}): DestructionPhase {
  if (input.expired) return 'gone';
  if (input.destroying) return 'destroying';
  if (input.deadline.state !== 'scheduled') return 'visible';
  const since = input.now - input.deadline.expiresAtMs;
  if (since < 0) return 'visible';
  return since < DESTRUCTION_MS ? 'destroying' : 'gone';
}

/**
 * L'ANNONCE, POUR CE QUI VIT HORS DE L'ARBRE — `applyMessageExpired`
 * (`lib/api/realtime-ephemeral.ts`) tourne dans un gestionnaire de socket, sans
 * aucun ancêtre React. Sans ce canal, il ne pourrait que retirer la ligne du
 * cache, et la rangée disparaîtrait d'une image à l'autre : le défaut corrigé
 * par l'échéance locale reviendrait par la porte du temps réel.
 */
type DestructionListener = (messageId: string) => void;

const listeners = new Set<DestructionListener>();

export function announceDestruction(messageId: string): void {
  for (const listener of [...listeners]) listener(messageId);
}

export function subscribeDestruction(listener: DestructionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type EphemeralDestruction = {
  /** Les rangées dont la destruction est ANNONCÉE — elles se peignent encore, en brûlant. */
  readonly destroyingIds: ReadonlySet<string>;
  /** Les rangées retirées pour de bon — plus rien ne se peint. */
  readonly expiredIds: ReadonlySet<string>;
  /** L'échéance vient d'être atteinte sous les yeux du lecteur (chrome de protection). */
  readonly noteExpired: (messageId: string) => void;
};

/**
 * LE CROCHET DE L'ÉCRAN — il tient les DEUX ensembles et la minuterie qui fait
 * passer de l'un à l'autre.
 *
 * `noteExpired` ne fait pas qu'enregistrer : il provoque le rendu qui MONTRE
 * la combustion. La loi ci-dessus saurait répondre « en destruction » sans
 * lui, mais personne ne repeindrait à cet instant — un fil au repos resterait
 * figé sur une rangée déjà échue jusqu'au prochain événement.
 *
 * L'inscription au canal d'annonce se fait ici, une fois par écran, et se
 * défait au démontage avec les minuteries : une conversation quittée pendant
 * une combustion ne laisse rien derrière elle.
 */
export function useEphemeralDestruction(): EphemeralDestruction {
  const [destroyingIds, setDestroyingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [expiredIds, setExpiredIds] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const noteExpired = useCallback((messageId: string) => {
    if (timers.current.has(messageId)) return;
    setDestroyingIds((current) => (current.has(messageId) ? current : new Set(current).add(messageId)));
    timers.current.set(
      messageId,
      setTimeout(() => {
        timers.current.delete(messageId);
        setExpiredIds((current) => (current.has(messageId) ? current : new Set(current).add(messageId)));
        setDestroyingIds((current) => {
          if (!current.has(messageId)) return current;
          const next = new Set(current);
          next.delete(messageId);
          return next;
        });
      }, DESTRUCTION_MS),
    );
  }, []);

  useEffect(() => subscribeDestruction(noteExpired), [noteExpired]);

  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held.values()) clearTimeout(timer);
      held.clear();
    };
  }, []);

  return { destroyingIds, expiredIds, noteExpired };
}
