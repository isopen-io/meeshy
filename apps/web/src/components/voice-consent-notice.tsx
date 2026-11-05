import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { consentsQueryOptions, VOICE_CONSENT_PURPOSE, voiceConsentMissing } from '@/lib/api/consents';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translateVoice } from '@/lib/i18n-voice-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { useVoiceCatalog } from '@/lib/use-voice-catalog';
import { settingFocusPath } from '@/lib/view/setting-focus';

/**
 * **LA NOTE SOUS MON PROPRE VOCAL** (#16419) — miroir `AudioConsentNotice`
 * (iOS, `AudioStackView.swift`, `VoiceConsentGate`) : tant que le consentement
 * vocal manque, mon vocal ne sera ni transcrit ni traduit, et la note le dit.
 * Son geste ouvre Réglages › Voix sur la bascule qui manque (`?reglage=`,
 * #16339), mise en évidence.
 *
 * Elle lit le cache des consentements, relu à chaque connexion (`main.tsx`) :
 * un état INCONNU (cache vide, lecture ratée) ne pose rien — jamais un manque
 * deviné. La couleur est héritée de la bulle : la note garde son contraste sur
 * ma bulle comme sur la rangée plate.
 */
export function VoiceConsentNotice() {
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const query = useQuery({ ...consentsQueryOptions(apiDeps), enabled: signedIn && apiDeps.source === 'gateway' }, appQueryClient);
  const language = currentInterfaceLanguage();
  const catalogReady = useVoiceCatalog(language);
  if (query.data === undefined || !voiceConsentMissing(query.data) || !catalogReady) return null;
  return (
    <p data-voice-consent-notice className="mt-1.5 flex flex-wrap items-center gap-x-2 text-caption" style={{ color: 'currentColor' }}>
      <span className="min-w-0 flex-1" style={{ opacity: 0.85 }}>
        {translateVoice(language, 'voice.notice.message')}
      </span>
      <button
        type="button"
        onClick={() => navigate(settingFocusPath(VOICE_CONSENT_PURPOSE))}
        className="shrink-0 rounded-chip px-1 font-semibold underline underline-offset-2 focus-visible:outline-2"
        style={{ minHeight: 44, color: 'inherit', outlineColor: 'currentColor' }}
      >
        {translateVoice(language, 'voice.notice.action')}
      </button>
    </p>
  );
}
