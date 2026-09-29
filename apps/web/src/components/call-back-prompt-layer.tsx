import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import { callBackPromptStore } from '@/lib/calls/call-back-prompt';
import type { StartCallRequest } from '@/lib/calls/engine';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« APPELER » DANS UN ONGLET OUVERT À FROID** (#8199) — chunk à part, monté
 * par `call-layer.tsx` quand un rappel attend son geste. Le navigateur bloque
 * le son d'un onglet que personne n'a touché : l'appel partirait muet. Le
 * toucher « Appeler » compose DANS le geste, ce qui débloque la sonnerie et la
 * voix ; « Annuler » oublie le rappel.
 */

const PILL_BG = 'rgba(17,16,24,0.92)';
const ANSWER = '#22c55e';

export type CallBackPromptPanelProps = {
  readonly request: StartCallRequest;
  readonly language: InterfaceLanguage;
  readonly onCall: () => void;
  readonly onCancel: () => void;
};

export function CallBackPromptPanel({ request, language, onCall, onCancel }: CallBackPromptPanelProps) {
  const video = request.media === 'video';
  const question =
    request.title === ''
      ? translate(language, video ? 'call.action.video' : 'call.action.audio')
      : translate(language, video ? 'callBackPrompt.video' : 'callBackPrompt.audio', { name: request.title });
  return (
    <div
      role="alertdialog"
      aria-label={question}
      className="fixed inset-x-3 z-[210] mx-auto flex max-w-md items-center gap-3 rounded-card p-3 shadow-lg"
      style={{ background: PILL_BG, color: '#fff', top: 'calc(env(safe-area-inset-top) + 3.75rem)' }}
      data-call-back-prompt={request.media}
    >
      <p className="min-w-0 flex-1 truncate text-body font-semibold">{question}</p>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-3 text-body font-semibold" data-call-back-prompt-action="cancel">
        {translate(language, 'callBackPrompt.cancel')}
      </button>
      <button
        type="button"
        onClick={onCall}
        className="min-h-11 rounded-full px-3 text-body font-semibold"
        style={{ background: ANSWER }}
        data-call-back-prompt-action="call"
      >
        {translate(language, 'callBackPrompt.call')}
      </button>
    </div>
  );
}

export default function CallBackPromptLayer() {
  const request = useStore(callBackPromptStore, (state) => state.request);
  if (request === null) return null;
  const forget = () => callBackPromptStore.setState({ request: null });
  return (
    <CallBackPromptPanel
      request={request}
      language={currentInterfaceLanguage()}
      onCall={() => {
        forget();
        callActions.start(request);
      }}
      onCancel={forget}
    />
  );
}
