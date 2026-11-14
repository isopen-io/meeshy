import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { measurePress } from './press-ratchet.mjs';

/**
 * **LES BOUTONS DU KIT RÉPONDENT À L'APPUI DANS L'IMAGE MÊME** (#18326) —
 * chaque fichier de la zone (lecteur vocal, confirmation, bande d'échec, en-tête
 * de la liste, flamme, voile protégé, actions rapides, feuilles de pack et de
 * signalement…) ne porte plus aucun `<button>` ni `<Link>` muet au sens du
 * cliquet (`press-ratchet.mjs`). Les deux rangées du menu de Publier ▾ restent
 * hors du lot : seuls le bouton principal et son chevron y sont visés.
 */

const APP = fileURLToPath(new URL('../..', import.meta.url));

const ZONE = [
  'age-blocked',
  'app-update-banner',
  'arrival-greeting-invite',
  'attachment-blocks',
  'background-sound-credit',
  'collapsible-section',
  'confirm-dialog',
  'content-removal-sheet',
  'country-sheet',
  'decor-preview',
  'derived-identity',
  'effects-panel',
  'email-taken-actions',
  'emoji-picker-sheet',
  'emoji-tone-menu',
  'engagement-pill',
  'external-content-report-sheet',
  'external-interop-notice',
  'failed-send-band',
  'floating-menus',
  'header-flame',
  'header-flame-card',
  'info-hint',
  'list-header',
  'masked-attachment',
  'pack-details-sheet',
  'pack-sheet',
  'password-input',
  'person-name',
  'phone-add-prompt',
  'phone-code-form',
  'plaintext-direct-action',
  'protected-content',
  'publication-edit-sheet',
  'quick-actions',
  'summary/living-summary',
] as const;

const muteOf = (name: string) => {
  const path = `src/components/${name}.tsx`;
  return measurePress([{ path, text: readFileSync(`${APP}${path}`, 'utf8') }]).mute;
};

describe('la zone du kit répond à l’appui (#18326)', () => {
  test('aucun bouton muet dans les fichiers de la zone', () => {
    const mute = ZONE.map((name) => ({ name, mute: muteOf(name) })).filter((entry) => entry.mute > 0);
    expect(mute).toEqual([]);
  });

  test('Publier et son chevron répondent : seules les deux rangées du menu restent muettes', () => {
    expect(muteOf('publish-split-button')).toBe(2);
  });
});
