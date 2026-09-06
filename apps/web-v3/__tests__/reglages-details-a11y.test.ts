import { axe } from 'jest-axe';

import {
  documentDeLaConfidentialite,
  documentDeLaSuppression,
  documentDeLExport,
  documentDesMessages,
  documentDesReglagesDeDocument,
  documentDuHubMedias,
  documentDuStubMedias,
} from '@/app/connecte/reglages-details-vue';
import { REGLAGES_DETAILS } from '@/lib/contenu/reglages-details';

/**
 * 0 violation `axe` `serious`/`critical` sur les quatre réglages-détails et
 * leurs sous-écrans, dans jsdom (le CONTRASTE reste mesuré au navigateur —
 * `e2e/visual/v3-reglages-details-a11y.spec.ts`, non exécutable dans cet
 * environnement, § rapport de livraison).
 */

const graves = async (html: string): Promise<readonly string[]> => {
  document.open();
  document.write(html);
  document.close();
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

describe('0 violation serious/critical — reglages-details', () => {
  it('/settings/privacy', async () => {
    expect(
      await graves(
        documentDeLaConfidentialite({
          reglages: { showOnlineStatus: true, showLastSeen: true, showReadReceipts: true, showTypingIndicator: false },
          regleAppliquee: null,
          echec: false,
        }),
      ),
    ).toEqual([]);
  });

  it('/settings/privacy/export', async () => {
    expect(await graves(documentDeLExport({ genre: 'formulaire' }))).toEqual([]);
  });

  it('/settings/privacy/delete', async () => {
    expect(await graves(documentDeLaSuppression({ genre: 'formulaire', avis: REGLAGES_DETAILS.suppression.dejaEnCours, phrase: '' }))).toEqual([]);
  });

  it('/settings/media — le hub', async () => {
    expect(await graves(documentDuHubMedias())).toEqual([]);
  });

  it('/settings/media/audio, /settings/media/video — régime 3', async () => {
    expect(await graves(documentDuStubMedias(REGLAGES_DETAILS.media.audio))).toEqual([]);
    expect(await graves(documentDuStubMedias(REGLAGES_DETAILS.media.video))).toEqual([]);
  });

  it('/settings/media/document', async () => {
    expect(await graves(documentDesReglagesDeDocument({ autoDownloadEnabled: true, regleAppliquee: false, echec: false }))).toEqual([]);
  });

  it('/settings/message — régime 3', async () => {
    expect(await graves(documentDesMessages())).toEqual([]);
  });
});
