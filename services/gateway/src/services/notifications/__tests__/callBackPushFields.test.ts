/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { callBackPushFields } from '../callBackPushFields';

const language = (lang: string) => {
  const asked: string[] = [];
  return { asked, resolve: async () => { asked.push(lang); return lang; } };
};

describe('callBackPushFields', () => {
  it('un appel vidéo manqué voyage avec son type et le libellé « Rappeler » du destinataire', async () => {
    const lang = language('fr');
    await expect(
      callBackPushFields({ type: 'missed_call', metadata: { callType: 'video' }, language: lang.resolve }),
    ).resolves.toEqual({ callType: 'video', isVideo: 'true', callBackLabel: 'Rappeler' });
  });

  it('le libellé suit la langue du destinataire, et un type absent vaut un appel vocal', async () => {
    await expect(
      callBackPushFields({ type: 'missed_call', metadata: {}, language: language('en').resolve }),
    ).resolves.toEqual({ callType: 'audio', isVideo: 'false', callBackLabel: 'Call back' });
  });

  it('une autre notification ne porte aucune clé et ne résout aucune langue', async () => {
    const lang = language('fr');
    await expect(
      callBackPushFields({ type: 'new_message', metadata: { callType: 'video' }, language: lang.resolve }),
    ).resolves.toEqual({});
    expect(lang.asked).toEqual([]);
  });
});
