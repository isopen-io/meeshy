/**
 * Itération 275 — le CONTENU d'une diffusion admin descend le Prisme ORDONNÉ.
 *
 * Le cycle 125 a fait passer la langue de CADRAGE (chrome d'e-mail, `lang` de la
 * notification) par la SSOT du « rang le plus haut RENSEIGNÉ »
 * (`recipientLanguage`). Le CONTENU — sujet/corps servi — restait résolu
 * rang-1 : `localizedBroadcastText` ne regardait que `translated[lang]`, sans
 * descendre aux rangs 2 à 4 du prisme ordonné du lecteur.
 *
 * Les témoins de cadrage du cycle 125 n'emploient que des lecteurs à UN SEUL
 * rang renseigné : cadrage == contenu, le défaut rang-1 ne se manifeste jamais.
 * Ces témoins-ci exercent un lecteur MULTI-RANGS dont le rang 1 n'a PAS de
 * traduction mais un rang inférieur EN a une : c'est le seul cas où le prisme
 * ordonné et le rang-1-seul divergent.
 *
 * Les DEUX rôles sont vérifiés séparément : le CADRAGE reste au rang 1 renseigné
 * (`language`/`lang`), le CONTENU descend l'ordre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { BroadcastInAppSenderJob } from '../../../jobs/broadcast-inapp-sender';
import { BroadcastSenderJob } from '../../../jobs/broadcast-sender';
import { localizedBroadcastText } from '../../../jobs/broadcast-recipients';

/** Traductions disponibles : es / pt / de. Ni `it`, ni la source `en`. */
const TRANSLATED_SUBJECTS = { es: 'Asunto ES', pt: 'Assunto PT', de: 'Betreff DE' };
const TRANSLATED_BODIES = { es: 'Cuerpo ES', pt: 'Corpo PT', de: 'Inhalt DE' };

/**
 * Rang 1 = `it` (AUCUNE traduction), rang 2 = `es` (traduction disponible).
 * Prisme ordonné : ['it', 'es']. Le contenu doit descendre à `es`.
 */
const MULTI_RANK_TOP_UNTRANSLATED = {
  systemLanguage: 'it',
  regionalLanguage: 'es',
  customDestinationLanguage: null,
  deviceLocale: null,
};

/** Rang 1 = `es` (traduction disponible) : cadrage == contenu, aucun changement. */
const RANK_1_TRANSLATED = {
  systemLanguage: 'es',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
};

const IN_APP_BROADCAST = {
  id: 'bc-1',
  status: 'READY',
  subject: 'Default subject',
  body: 'Default body',
  sourceLanguage: 'en',
  translatedSubjects: TRANSLATED_SUBJECTS,
  translatedBodies: TRANSLATED_BODIES,
  targeting: {},
};

const EMAIL_BROADCAST = { ...IN_APP_BROADCAST, status: 'SENDING' };

function makeInAppJob(user: Record<string, unknown>) {
  const prisma = {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(IN_APP_BROADCAST),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      count: jest.fn<any>().mockResolvedValue(1),
      findMany: jest.fn<any>().mockResolvedValueOnce([{ id: 'u-1', ...user }]).mockResolvedValue([]),
    },
  } as any;
  const createSystemNotification = jest.fn<any>().mockResolvedValue({ id: 'n-1' });
  return {
    job: new BroadcastInAppSenderJob(prisma, { createSystemNotification } as any),
    createSystemNotification,
  };
}

function makeEmailJob(user: Record<string, unknown>) {
  const prisma = {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(EMAIL_BROADCAST),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      count: jest.fn<any>().mockResolvedValue(1),
      findMany: jest.fn<any>()
        .mockResolvedValueOnce([{ id: 'u-1', email: 'l@example.test', displayName: 'L', username: 'l', ...user }])
        .mockResolvedValue([]),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
  const sendBroadcastEmail = jest.fn<any>().mockResolvedValue({ success: true });
  return { job: new BroadcastSenderJob(prisma, { sendBroadcastEmail } as any), sendBroadcastEmail };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('localizedBroadcastText — descente ordonnée pure', () => {
  const translated = TRANSLATED_SUBJECTS;
  const base = { translated, sourceLanguage: 'en', original: 'Default subject' };

  it('sert le premier rang qui porte une traduction', () => {
    expect(localizedBroadcastText({ ...base, preferredLanguages: ['it', 'es'] })).toBe('Asunto ES');
  });

  it('rend l\'original quand aucun rang du lecteur n\'a de traduction', () => {
    expect(localizedBroadcastText({ ...base, preferredLanguages: ['it', 'ja'] })).toBe('Default subject');
  });

  it('rend l\'original quand la langue de tête EST la langue source', () => {
    expect(localizedBroadcastText({ ...base, preferredLanguages: ['en', 'es'] })).toBe('Default subject');
  });

  it('ne retombe JAMAIS sur une traduction hors du prisme du lecteur', () => {
    expect(localizedBroadcastText({ ...base, preferredLanguages: ['it'] })).toBe('Default subject');
  });

  it('rend l\'original quand le prisme est vide', () => {
    expect(localizedBroadcastText({ ...base, preferredLanguages: [] })).toBe('Default subject');
  });

  it('rend l\'original quand la carte de traductions est nulle', () => {
    expect(localizedBroadcastText({ translated: null, sourceLanguage: 'en', original: 'Default subject', preferredLanguages: ['es'] })).toBe('Default subject');
  });
});

describe('diffusion in-app — le CONTENU descend le prisme ordonné', () => {
  it('rang 2 (es) servi quand le rang 1 (it) n\'a pas de traduction', async () => {
    const { job, createSystemNotification } = makeInAppJob(MULTI_RANK_TOP_UNTRANSLATED);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Asunto ES', content: 'Cuerpo ES' })
    );
  });

  it('le CADRAGE reste au rang 1 renseigné (lang: it) même quand le contenu descend à es', async () => {
    const { job, createSystemNotification } = makeInAppJob(MULTI_RANK_TOP_UNTRANSLATED);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'it', title: 'Asunto ES' })
    );
  });

  it('aucune régression : un rang 1 traduit reste servi au rang 1', async () => {
    const { job, createSystemNotification } = makeInAppJob(RANK_1_TRANSLATED);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'es', title: 'Asunto ES', content: 'Cuerpo ES' })
    );
  });
});

describe('diffusion e-mail — le CONTENU descend le prisme ordonné', () => {
  it('rang 2 (es) servi quand le rang 1 (it) n\'a pas de traduction', async () => {
    const { job, sendBroadcastEmail } = makeEmailJob(MULTI_RANK_TOP_UNTRANSLATED);

    await job.execute('bc-1');

    expect(sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Asunto ES', body: 'Cuerpo ES' })
    );
  });

  it('le CADRAGE reste au rang 1 renseigné (language: it) même quand le contenu descend à es', async () => {
    const { job, sendBroadcastEmail } = makeEmailJob(MULTI_RANK_TOP_UNTRANSLATED);

    await job.execute('bc-1');

    expect(sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'it', subject: 'Asunto ES' })
    );
  });
});
