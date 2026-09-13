import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { translate } from './i18n-catalog';
import { currentInterfaceLanguage } from './interface-language';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

describe('translate — une clé, deux langues, jamais de repli silencieux vers fr', () => {
  test('fr rend le libellé français', () => {
    expect(translate('fr', 'announce.messageSent')).toBe('Message envoyé');
    expect(translate('fr', 'announce.messageCopied')).toBe('Message copié');
    expect(translate('fr', 'announce.messagesCopied')).toBe('Messages copiés');
  });

  test('en rend un libellé DIFFÉRENT, pas une recopie du français', () => {
    expect(translate('en', 'announce.messageSent')).toBe('Message sent');
    expect(translate('en', 'announce.messageCopied')).toBe('Message copied');
    expect(translate('en', 'announce.messagesCopied')).toBe('Messages copied');
  });
});

/**
 * LE GATE DU CRITÈRE DE FIN (#6206) : « au moins une seconde langue s'affiche
 * réellement, pas seulement que la fonction accepte un formateur ». Ce
 * témoin compose exactement l'appel que `use-send.ts`/`use-message-menu.ts`
 * font au site d'annonce — `translate(currentInterfaceLanguage(), clé)` — au
 * lieu de tester le catalogue isolément : une régression qui romprait la
 * chaîne resolution → catalogue (ex. un repli qui ignore la langue posée)
 * ferait tomber CE témoin, pas seulement un test de `translate` en vase clos.
 */
describe('la chaîne resolution → catalogue sert réellement une seconde langue', () => {
  test('langue interface = en ⇒ le texte réellement composé est anglais', () => {
    document.documentElement.lang = 'en';
    const composed = translate(currentInterfaceLanguage(), 'announce.messageSent');
    expect(composed).toBe('Message sent');
    expect(composed).not.toBe('Message envoyé');
  });

  test('langue interface = fr ⇒ le texte réellement composé est français', () => {
    document.documentElement.lang = 'fr';
    const composed = translate(currentInterfaceLanguage(), 'announce.messageSent');
    expect(composed).toBe('Message envoyé');
  });
});
