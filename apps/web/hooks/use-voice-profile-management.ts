'use client';

import { useState, useCallback } from 'react';
import { apiService, TIMEOUT_VOICE_PROFILE } from '@/services/api.service';
import { API_ENDPOINTS } from '@/lib/config';
import type { VoiceProfileDetails, VoiceProfileConsentRequest } from '@meeshy/shared/types/voice-api';
import { toast } from 'sonner';

// ─── #4348 (critère 8) — surface UNIFIÉE de consentement ──────────────────────
//
// Contrat fusionné #4335/#4348 : `PUT /me/consents/{purpose}` accepte
// `{ granted, policyVersion }` et RIEN d'autre — le serveur horodate seul
// (`grantedAt`/`revokedAt`), jamais une date fournie par le client.
//
// NOTE D'INTÉGRATION — la route gateway `services/gateway/src/routes/me/
// consents.ts` (session parallèle, hors du territoire WEB de ce correctif)
// et l'entrée `API_ENDPOINTS.me.consentsByPurpose` du catalogue partagé
// (`packages/shared/api/endpoints.ts`, régénérée depuis le manifeste de
// routes) ont toutes deux atterri PENDANT l'écriture de ce correctif —
// preuve que ce chantier réparti sur plusieurs sessions parallèles converge.
//
// #4487 — les deux constantes étaient RECOPIÉES de `routes/me/consents.ts`.
// Elles viennent désormais de `@meeshy/shared/types/consents`, site UNIQUE des
// deux côtés de la frontière. La recopie n'était pas théorique : `PUT
// /me/consents/{purpose}` répond **409** sur une version différente, et tout
// déploiement posant l'override `CONSENT_POLICY_VERSION` aurait transformé
// chaque écriture d'ici en 409 — avalé par le `console.warn` ci-dessous, donc
// invisible à l'utilisateur comme au développeur.
//
// `pushUnifiedVoiceConsent` reste best-effort (voir son commentaire) : la
// route peut être indisponible sur un déploiement en retard.
import {
  CONSENT_POLICY_VERSION_DEFAULT,
  type ConsentPurpose,
} from '@meeshy/shared/types/consents';

/** Purpose de la surface unifiée pour le clonage vocal — TYPÉ, plus une chaîne libre. */
const VOICE_CLONING_CONSENT_PURPOSE: ConsentPurpose = 'voice-cloning';

interface ConsentPutRequestBody {
  readonly granted: boolean;
  readonly policyVersion: string;
}

/**
 * Écrivain BEST-EFFORT vers `PUT /me/consents/{purpose}`, en PLUS de
 * l'écrivain historique `POST /voice/profile/consent` (seul AUTORITAIRE
 * pour l'état affiché tant que la route ci-dessus n'est pas livrée).
 * N'affiche jamais d'erreur à l'utilisateur et ne bloque jamais l'action
 * historique : un échec est journalisé (`console.warn`), jamais retenu
 * contre le geste de l'utilisateur. Une fois la route gateway livrée et
 * l'usage Android compté (#4348, point 10), ce double-écrit se retire d'un
 * bloc au profit du seul appel unifié — devenu entre-temps l'écrivain réel.
 */
async function pushUnifiedVoiceConsent(granted: boolean): Promise<void> {
  try {
    const endpoint = API_ENDPOINTS.me.consentsByPurpose(VOICE_CLONING_CONSENT_PURPOSE);
    const body: ConsentPutRequestBody = { granted, policyVersion: CONSENT_POLICY_VERSION_DEFAULT };
    await apiService.put<{ success: boolean }>(endpoint, body);
  } catch (err) {
    console.warn('[VoiceProfile] PUT /me/consents unavailable yet (#4348 gateway pending):', err);
  }
}

interface UseVoiceProfileManagementReturn {
  // State
  isLoading: boolean;
  profile: VoiceProfileDetails | null;
  hasConsent: boolean;
  hasVoiceCloningConsent: boolean;

  // Actions
  loadProfile: () => Promise<void>;
  grantConsent: () => Promise<void>;
  deleteProfile: () => Promise<void>;
  grantVoiceCloningConsent: () => Promise<void>;
  revokeVoiceCloningConsent: () => Promise<void>;
}

/**
 * Hook pour gérer le CRUD du profil vocal
 * Responsabilités:
 * - Chargement du profil existant
 * - Gestion des consentements (recording + cloning)
 * - Suppression du profil
 */
export function useVoiceProfileManagement(): UseVoiceProfileManagementReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<VoiceProfileDetails | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [hasVoiceCloningConsent, setHasVoiceCloningConsent] = useState(false);

  const loadProfile = useCallback(async () => {
    console.log('[VoiceProfile] loadProfile called');
    setIsLoading(true);
    try {
      // Charger le profil (inclut maintenant les consentements)
      const profileRes = await apiService.get<{ success: boolean; data: VoiceProfileDetails }>('/voice/profile');
      console.log('[VoiceProfile] API response:', profileRes);

      // L'API retourne { success, data: { success, data: {...} } }
      // apiService wrappe la réponse, donc on doit accéder à profileRes.data.data
      const rawData = profileRes.data?.data || profileRes.data;
      const profileData = rawData as VoiceProfileDetails;

      if (profileRes.success && profileData) {
        console.log('[VoiceProfile] Profile data:', profileData);
        console.log('[VoiceProfile] consentStatus:', profileData.consentStatus);

        // Set profile only if it exists
        if (profileData.exists) {
          setProfile(profileData);
        } else {
          setProfile(null);
        }

        // Extract consent from profile response
        if (profileData.consentStatus) {
          const hasRecording = !!profileData.consentStatus.voiceRecordingConsentAt;
          const hasCloning = !!profileData.consentStatus.voiceCloningEnabledAt;
          console.log('[VoiceProfile] Setting consents:', { hasRecording, hasCloning });
          setHasConsent(hasRecording);
          setHasVoiceCloningConsent(hasCloning);
        } else {
          console.log('[VoiceProfile] No consentStatus in response!');
        }
      } else {
        console.log('[VoiceProfile] Response not successful or no data:', profileRes);
      }
    } catch (err: any) {
      console.error('[VoiceProfile] Error loading:', err);
      toast.error('Failed to load voice profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const grantConsent = useCallback(async () => {
    try {
      // #4180 — `/voice/consent` n'existe PAS (404 systématique avant ce
      // correctif : voir services/gateway/src/routes/voice-profile.ts, monté
      // sous `/voice/profile`). La route RÉELLE et SEULE écrivaine légitime
      // du consentement est `POST /voice/profile/consent` : elle horodate
      // `User.voiceProfileConsentAt` côté SERVEUR
      // (`VoiceProfileService.updateConsent`), jamais depuis une date que
      // le client fournirait — c'est la propriété que #4180 exige d'un
      // consentement opposable.
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
      if (res.success) {
        setHasConsent(true);
        toast.success('Voice recording consent granted');
      }
    } catch (err) {
      console.error('[VoiceProfile] Error granting consent:', err);
      toast.error('Failed to grant consent');
    }
  }, []);

  const deleteProfile = useCallback(async () => {
    try {
      const res = await apiService.delete<{ success: boolean }>('/voice/profile');
      if (res.success) {
        setProfile(null);
        toast.success('Voice profile deleted');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error deleting profile:', err);
      toast.error('Failed to delete voice profile');
    }
  }, [loadProfile]);

  const grantVoiceCloningConsent = useCallback(async () => {
    // #4348 (critère 8) — l'écrivain AUTORITAIRE d'abord, la surface unifiée
    // ensuite, et seulement s'il a RÉUSSI.
    //
    // L'ordre inverse a été écrit puis corrigé, et la raison mérite d'être
    // dite : `pushUnifiedVoiceConsent(true)` partait en premier, sans
    // condition. Quand l'appel autoritaire échouait derrière, l'écran
    // affichait « Failed to enable voice cloning » pendant que le serveur
    // avait DÉJÀ persisté `voiceCloningEnabledAt` — plus les trois ancêtres
    // que la cascade pose (`data-processing`, `voice-data`, `voice-profile`),
    // que l'utilisateur n'a jamais vu accorder. Un geste juridiquement
    // significatif enregistré comme accordé sous un message d'échec.
    //
    // Une écriture MIROIR se fait après celle qui fait foi, jamais avant :
    // c'est la seule position où son échec ne peut rien affirmer de faux, et
    // où le succès de l'autre est déjà acquis.
    try {
      // #4180 — `/voice/voice-cloning-consent` n'existe pas davantage : le
      // web n'avait AUCUN moyen d'accorder le clonage vocal (404 muet, pas
      // de fausse assurance, mais aucun consentement enregistrable non
      // plus — un trou fonctionnel RGPD réel). Même route unique que
      // grantConsent ci-dessus ; `voiceRecordingConsent: true` est envoyé
      // avec pour respecter la dépendance que la route applique déjà
      // (le clonage EXIGE le consentement d'enregistrement — voir la chaîne
      // dans VoiceProfileService.updateConsent).
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true, voiceCloningConsent: true };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
      if (res.success) {
        await pushUnifiedVoiceConsent(true);
        setHasVoiceCloningConsent(true);
        toast.success('Voice cloning enabled');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error enabling voice cloning:', err);
      toast.error('Failed to enable voice cloning');
    }
  }, [loadProfile]);

  const revokeVoiceCloningConsent = useCallback(async () => {
    // #4348 (critère 8) — même surface unifiée que grantVoiceCloningConsent,
    // avec `granted: false`, et dans le MÊME ordre : l'autoritaire d'abord,
    // le miroir après son succès.
    //
    // La symétrie n'est pas cosmétique. Sur la révocation, l'ordre inverse
    // avait le défaut opposé et tout aussi grave : le miroir enregistrait un
    // RETRAIT que l'écrivain autoritaire pouvait ensuite ne pas appliquer —
    // l'utilisateur croyait avoir retiré son consentement, une source disait
    // « retiré », l'autre « accordé », et c'est la seconde qui gouverne le
    // pipeline vocal.
    try {
      // #4180 — même route que ci-dessus. `voiceCloningConsent: false` fait
      // écrire `User.voiceCloningEnabledAt = null` côté serveur
      // (VoiceProfileService.updateConsent) : la RÉVOCATION a désormais un
      // effet SERVEUR observable, que `ConsentValidationService` lit sans
      // plus jamais le contredire via un blob de préférences périmé.
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true, voiceCloningConsent: false };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
      if (res.success) {
        await pushUnifiedVoiceConsent(false);
        setHasVoiceCloningConsent(false);
        toast.success('Voice cloning disabled');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error disabling voice cloning:', err);
      toast.error('Failed to disable voice cloning');
    }
  }, [loadProfile]);

  return {
    isLoading,
    profile,
    hasConsent,
    hasVoiceCloningConsent,
    loadProfile,
    grantConsent,
    deleteProfile,
    grantVoiceCloningConsent,
    revokeVoiceCloningConsent,
  };
}
