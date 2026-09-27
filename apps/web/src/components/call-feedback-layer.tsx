import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import { feedbackCooldown } from '@/lib/calls/call-feedback-cooldown';
import { callStore } from '@/lib/calls/call-store';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage } from '@/lib/storage';

import { CallFeedbackCard } from './call-feedback-card';

/**
 * La carte de note d'après-appel (#8072), branchée au magasin d'appel :
 * chunk à part, monté par `call-layer.tsx` seulement quand une note est
 * demandée ET qu'aucun appel n'occupe l'écran. Au plus une demande par
 * jour glissant (D-138) : au-delà, la demande se retire sans rien montrer.
 */
const cooldown = feedbackCooldown(safeLocalStorage());

export default function CallFeedbackLayer() {
  const prompt = useStore(callStore, (state) => state.feedback);
  const allowed = prompt !== null && cooldown.claim({ callId: prompt.callId, now: Date.now() });
  useEffect(() => {
    if (prompt !== null && !allowed) callActions.skipRating();
  }, [prompt, allowed]);
  if (prompt === null || !allowed) return null;
  return <CallFeedbackCard key={prompt.callId} prompt={prompt} language={currentInterfaceLanguage()} onRate={callActions.rate} onSkip={callActions.skipRating} />;
}
