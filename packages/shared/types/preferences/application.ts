/**
 * Application Preferences Schema
 * Thème, langue interface, UI générale
 */

import { z } from 'zod';

/**
 * Les cinq clés qu'AUCUN schéma de préférences ne doit plus jamais déclarer
 * comme un champ ordinaire (#4180). Exportée pour que le témoin de garde
 * (`__tests__/legacy-consent-keys-source-guard.test.ts`) balaie TOUT
 * `packages/shared/types/preferences/` avec la MÊME liste que celle qui a
 * produit le défaut — une garde qui reconstruit sa propre liste dérive de
 * l'original en silence le jour où quelqu'un touche l'une des deux.
 */
export const LEGACY_APPLICATION_CONSENT_KEYS = [
  'dataProcessingConsentAt',
  'voiceDataConsentAt',
  'voiceProfileConsentAt',
  'voiceCloningConsentAt',
  'voiceCloningEnabledAt',
] as const;

/**
 * Un consentement ne se PATCH plus via les préférences (#4180).
 *
 * Ces cinq clés dupliquaient les colonnes `User.*ConsentAt` que
 * `VoiceProfileService.updateConsent` horodate côté SERVEUR
 * (`POST /voice/profile/consent`) — le SEUL écrivain dont l'horodatage fait
 * foi, puisque lui seul pose `new Date()` sans jamais lire de date fournie
 * par le client. `ConsentValidationService.getConsentStatus` donnait
 * pourtant PRIORITÉ à ce blob sur la colonne `User`
 * (`applicationPrefs.xxx || user.xxx`) : un client pouvait donc AFFIRMER un
 * consentement — avec la date de son choix — en le glissant dans un PATCH de
 * préférences ordinaire. Deux conséquences mesurées :
 *   1. le consentement n'était plus opposable — sa date n'engageait que le
 *      client, jamais le serveur, exactement le moment où elle compte (un
 *      litige) ;
 *   2. une RÉVOCATION via `/voice/profile/consent` (colonne User remise à
 *      `null`) laissait le blob intact : `getConsentStatus` continuait de
 *      rendre `canUseVoiceCloning: true` — un consentement retiré sans effet
 *      observable, donc un consentement qui n'en est pas un.
 *
 * `z.never()` REJETTE explicitement toute valeur fournie pour ces cinq noms
 * (ZodError → 400 sur `PUT`/`PATCH /me/preferences/application`, qui
 * appellent `schema.parse()` / `schema.partial().parse()` directement sur le
 * corps — `routes/me/preferences/preference-router-factory.ts`) plutôt que
 * de laisser Zod (mode strip, le comportement par défaut pour une clé non
 * déclarée) les avaler en silence : un client qui tente encore d'écrire l'un
 * de ces noms doit voir un ÉCHEC net, pas un 200 qui lui laisse croire que
 * son consentement a été enregistré alors qu'il vient d'être ignoré.
 */
const LEGACY_CONSENT_ERROR =
  'Ce champ ne se règle plus via PATCH/PUT /me/preferences/application (#4180) — ' +
  'le consentement est horodaté par le serveur via POST /voice/profile/consent.';

export const ApplicationPreferenceSchema = z.object({
  // Thème
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  accentColor: z.string().default('blue'),

  // Langue de l'interface uniquement (les langues de traduction sont dans User)
  interfaceLanguage: z.string().default('en'),

  // Traduction automatique du contenu reçu — la SEULE préférence de
  // traduction qui n'est PAS une langue. `User` n'a aucune colonne pour elle :
  // ce document est son unique store, lu par les réponses d'authentification
  // (`services/gateway/src/utils/auto-translate-preference.ts`).
  autoTranslateEnabled: z.boolean().default(true),

  // UI Settings
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  fontFamily: z.string().default('inter'),
  lineHeight: z.enum(['tight', 'normal', 'relaxed', 'loose']).default('normal'),

  // Layout
  compactMode: z.boolean().default(false),
  sidebarPosition: z.enum(['left', 'right']).default('left'),
  showAvatars: z.boolean().default(true),

  // Animations
  animationsEnabled: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),

  // Accessibilité
  highContrastMode: z.boolean().default(false),
  screenReaderOptimized: z.boolean().default(false),
  keyboardShortcutsEnabled: z.boolean().default(true),

  // Expérience
  tutorialsCompleted: z.array(z.string()).default([]),
  betaFeaturesEnabled: z.boolean().default(false),
  telemetryEnabled: z.boolean().default(true),

  // Consentements données/voix — RETIRÉS d'ici (#4180), voir
  // LEGACY_CONSENT_ERROR ci-dessus. Chaque clé reste DÉCLARÉE (plutôt que
  // simplement absente du shape) pour que Zod la REJETTE explicitement au
  // lieu de la stripper en silence : la déclaration EST la garde.
  dataProcessingConsentAt: z.never(LEGACY_CONSENT_ERROR).optional(),
  voiceDataConsentAt: z.never(LEGACY_CONSENT_ERROR).optional(),
  voiceProfileConsentAt: z.never(LEGACY_CONSENT_ERROR).optional(),
  voiceCloningConsentAt: z.never(LEGACY_CONSENT_ERROR).optional(),
  voiceCloningEnabledAt: z.never(LEGACY_CONSENT_ERROR).optional()
});

export type ApplicationPreference = z.infer<typeof ApplicationPreferenceSchema>;

export const APPLICATION_PREFERENCE_DEFAULTS: ApplicationPreference = {
  theme: 'auto',
  accentColor: 'blue',
  interfaceLanguage: 'en',
  autoTranslateEnabled: true,
  fontSize: 'medium',
  fontFamily: 'inter',
  lineHeight: 'normal',
  compactMode: false,
  sidebarPosition: 'left',
  showAvatars: true,
  animationsEnabled: true,
  reducedMotion: false,
  highContrastMode: false,
  screenReaderOptimized: false,
  keyboardShortcutsEnabled: true,
  tutorialsCompleted: [],
  betaFeaturesEnabled: false,
  telemetryEnabled: true
};
