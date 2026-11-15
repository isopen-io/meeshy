import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { WIDGETS_BRIDGE } from '@/lib/shell-widgets/channel';

import type { CallBackIntent } from './call-back-intent';
import { CALL_BACK_EVENT, ecouterRappels } from './shell-call-back';

/**
 * **« RAPPELER » SUR LA BANNIÈRE D'UN APPEL MANQUÉ, DANS LA COQUE** (#10908) —
 * le toucher ouvre le fil par son lien profond, et `MeeshyWidgetsPlugin`
 * signale à part l'appel à composer, retenu jusqu'à l'abonnement : la page le
 * remet à la même loi que le web (`listenCallBackIntents`).
 */
const coqueAvec = (rappels: Array<(donnees: unknown) => void>): CoqueNative => ({
  PluginHeaders: [{ name: WIDGETS_BRIDGE }],
  addListener: (plugin, evenement, rappel) => {
    if (plugin === WIDGETS_BRIDGE && evenement === CALL_BACK_EVENT) rappels.push(rappel);
    return { remove: async () => undefined };
  },
});

describe('ecouterRappels (#10908)', () => {
  test('relaie l’appel demandé par la bannière, audio ou vidéo, avec le nom de l’appelant ou du groupe', () => {
    const rappels: Array<(donnees: unknown) => void> = [];
    const demandes: CallBackIntent[] = [];
    expect(ecouterRappels(coqueAvec(rappels), (intent) => demandes.push(intent))).toBe(true);
    rappels[0]?.({ conversationId: 'c7', media: 'video', title: 'Famille', isGroup: true });
    rappels[0]?.({ conversationId: 'c8', media: 'audio', title: '', isGroup: false });
    expect(demandes).toEqual([
      { conversationId: 'c7', media: 'video', title: 'Famille', isGroup: true },
      { conversationId: 'c8', media: 'audio', title: '', isGroup: false },
    ]);
  });

  test('ignore une charge illisible', () => {
    const rappels: Array<(donnees: unknown) => void> = [];
    const demandes: CallBackIntent[] = [];
    ecouterRappels(coqueAvec(rappels), (intent) => demandes.push(intent));
    rappels[0]?.({ conversationId: 'c7', media: 'fax' });
    rappels[0]?.({ conversationId: '', media: 'audio' });
    rappels[0]?.(null);
    expect(demandes).toEqual([]);
  });

  test('hors coque, ou dans une coque sans le pont, rien n’est écouté', () => {
    expect(ecouterRappels(undefined, () => undefined)).toBe(false);
    expect(ecouterRappels({ PluginHeaders: [], addListener: () => ({ remove: async () => undefined }) }, () => undefined)).toBe(false);
  });
});
