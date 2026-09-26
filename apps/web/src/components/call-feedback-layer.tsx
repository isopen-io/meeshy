import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import { callStore } from '@/lib/calls/call-store';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { CallFeedbackCard } from './call-feedback-card';

/**
 * La carte de note d'après-appel (#8072), branchée au magasin d'appel :
 * chunk à part, monté par `call-layer.tsx` seulement quand une note est
 * demandée ET qu'aucun appel n'occupe l'écran.
 */
export default function CallFeedbackLayer() {
  const prompt = useStore(callStore, (state) => state.feedback);
  if (prompt === null) return null;
  return <CallFeedbackCard key={prompt.callId} prompt={prompt} language={currentInterfaceLanguage()} onRate={callActions.rate} onSkip={callActions.skipRating} />;
}
