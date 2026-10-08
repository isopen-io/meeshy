/**
 * #9708 — un invité qui rejoint une conversation est une langue cible dès le
 * message SUIVANT.
 *
 * Recette #9707 : `_extractConversationLanguages` servait son cache cinq
 * minutes sans aucune invalidation. Un participant anonyme `en` arrivé dans une
 * conversation `[fr]` : `Langues depuis cache: [fr]`, et trois messages partis
 * sans traduction. Le témoin rejoue exactement cette séquence — la base change,
 * l'arrivée est annoncée, et la résolution suivante doit RELIRE.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import { announceConversationLanguageChange } from '../../../services/message-translation/conversationLanguageChanges';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTRE_CONV = 'bbbbbbbbbbbbbbbbbbbbbbbb';

type Ligne = {
  readonly id: string;
  readonly type: 'user' | 'anonymous';
  readonly displayName: string;
  readonly language: string | null;
  readonly user: Record<string, unknown> | null;
};

const hote: Ligne = {
  id: 'p-hote', type: 'user', displayName: 'Hôte', language: 'fr',
  user: { id: 'u-hote', username: 'hote', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
};
const invite: Ligne = { id: 'p-invite', type: 'anonymous', displayName: 'Guest', language: 'en', user: null };

function monde(initial: Ligne[]) {
  let lignes = initial;
  // Ne compte que les lectures de COMPOSITION (celles qui demandent la langue) :
  // une arrivée déclenche aussi, à côté, la lecture des planchers d'historique
  // du rattrapage (#9709), qui n'est pas ce que ce témoin mesure.
  const participantFindMany = jest.fn(async (_args: { select?: { language?: boolean } }) => lignes);
  const lecturesDeComposition = () =>
    participantFindMany.mock.calls.filter(([args]) => args?.select?.language === true).length;
  const prisma = {
    conversation: { findUnique: jest.fn(async () => ({ autoTranslateEnabled: true })) },
    participant: { findMany: participantFindMany },
    message: { findMany: jest.fn(async () => []) },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
  const svc = new MessageTranslationService(prisma as never);
  return {
    svc,
    lecturesDeComposition,
    devient: (suivantes: Ligne[]) => { lignes = suivantes; },
    langues: (id: string) =>
      (svc as unknown as { _extractConversationLanguages(id: string): Promise<string[]> })._extractConversationLanguages(id),
  };
}

const ouverts: MessageTranslationService[] = [];
afterEach(async () => {
  for (const svc of ouverts.splice(0)) await svc.close();
});

describe('#9708 — la composition linguistique d’une conversation n’est plus servie périmée', () => {
  it('une ARRIVÉE annoncée fait relire la conversation : l’invité `en` est une cible au message suivant', async () => {
    const m = monde([hote]);
    ouverts.push(m.svc);

    expect(await m.langues(CONV)).toEqual(['fr']);
    m.devient([hote, invite]);
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en' });

    expect(await m.langues(CONV)).toEqual(['fr', 'en']);
  });

  it('sans annonce, le cache sert encore — la relecture est bien l’effet de l’annonce, pas d’un cache absent', async () => {
    const m = monde([hote]);
    ouverts.push(m.svc);

    await m.langues(CONV);
    m.devient([hote, invite]);

    expect(await m.langues(CONV)).toEqual(['fr']);
    expect(m.lecturesDeComposition()).toBe(1);
  });

  it('un DÉPART annoncé fait relire la conversation', async () => {
    const m = monde([hote, invite]);
    ouverts.push(m.svc);

    expect(await m.langues(CONV)).toEqual(['fr', 'en']);
    m.devient([hote]);
    announceConversationLanguageChange({ kind: 'departure', conversationId: CONV });

    expect(await m.langues(CONV)).toEqual(['fr']);
  });

  it('une arrivée n’invalide QUE sa conversation', async () => {
    const m = monde([hote]);
    ouverts.push(m.svc);

    await m.langues(CONV);
    await m.langues(AUTRE_CONV);
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en' });
    await m.langues(AUTRE_CONV);

    expect(m.lecturesDeComposition()).toBe(2);
  });

  it('un compte qui change ses langues fait relire TOUTES les conversations — ses conversations ne sont pas connues ici', async () => {
    const m = monde([hote]);
    ouverts.push(m.svc);

    await m.langues(CONV);
    await m.langues(AUTRE_CONV);
    announceConversationLanguageChange({ kind: 'reader-languages', userId: 'u-hote' });
    await m.langues(CONV);
    await m.langues(AUTRE_CONV);

    expect(m.lecturesDeComposition()).toBe(4);
  });

  it('une lecture commencée AVANT une arrivée ne réinstalle pas la composition d’avant dans le cache', async () => {
    const m = monde([hote]);
    ouverts.push(m.svc);

    const enCours = m.langues(CONV);
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en' });
    await enCours;
    m.devient([hote, invite]);

    expect(await m.langues(CONV)).toEqual(['fr', 'en']);
  });

  it('un service fermé n’écoute plus — aucune fuite d’écouteur d’une instance à l’autre', async () => {
    const m = monde([hote]);
    await m.langues(CONV);
    await m.svc.close();

    m.devient([hote, invite]);
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en' });

    expect(await m.langues(CONV)).toEqual(['fr']);
  });
});
