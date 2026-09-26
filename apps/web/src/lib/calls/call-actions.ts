import { primeTones } from './call-tones';
import type { CallEngine, JoinCallRequest, StartCallRequest } from './engine';

/**
 * **CE QUE LES ÉCRANS APPELLENT** (#6382) — le fil, le journal et la bulle
 * d'appel importent CE module, jamais le moteur : `engine.ts` (WebRTC,
 * signalisation, sons) n'est chargé qu'au premier geste d'appel ou au premier
 * appel reçu.
 */

let pending: Promise<CallEngine> | null = null;

export function loadCallEngine(): Promise<CallEngine> {
  pending ??= import('./engine').then((module) => module.defaultCallEngine());
  return pending;
}

/* `primeTones` DANS le geste : un contexte audio ne démarre qu'à l'intérieur
   d'un clic, et le moteur n'arrive qu'après un `import()`. */
const run = (fn: (engine: CallEngine) => unknown): void => {
  primeTones();
  void loadCallEngine().then(fn);
};

export const callActions = {
  start: (request: StartCallRequest): void => run((engine) => engine.start(request)),
  join: (request: JoinCallRequest): void => run((engine) => engine.join(request)),
  accept: (options?: { readonly audioOnly?: boolean }): void => run((engine) => engine.accept(options)),
  decline: (): void => run((engine) => engine.decline()),
  hangup: (): void => run((engine) => engine.hangup()),
  toggleMic: (): void => run((engine) => engine.toggleMic()),
  toggleCamera: (): void => run((engine) => engine.toggleCamera()),
  switchCamera: (): void => run((engine) => engine.switchCamera()),
  minimize: (): void => run((engine) => engine.setDisplay('pill')),
  expand: (): void => run((engine) => engine.setDisplay('full')),
  /** La pastille repliée en bulle déplaçable (#8046, `CallBubbleView.swift`). */
  collapse: (): void => run((engine) => engine.setDisplay('bubble')),
  toggleCaptions: (): void => run((engine) => engine.toggleCaptions()),
  answerWaiting: (): void => run((engine) => engine.answerWaiting()),
  declineWaiting: (): void => run((engine) => engine.declineWaiting()),
  retry: (): void => run((engine) => engine.retry()),
  dismiss: (): void => run((engine) => engine.dismiss()),
};
