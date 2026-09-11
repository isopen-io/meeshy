/**
 * **UNE ENTRÉE DE TRADUCTION CREUSE VIDAIT UNE CONVERSATION** — audit de
 * cohérence iOS ↔ passerelle, 2026-09-11.
 *
 * ## La chaîne, bout à bout
 *
 * 1. `Message.translations` est une colonne JSON Mongo. `transformTranslationsToArray`
 *    la relit en la CASTANT vers `MessageTranslationJSON` — aucune validation :
 *    le type décrit ce que les écrivains d'aujourd'hui posent, pas ce que la
 *    base contient (écriture partielle, version antérieure, translator tombé
 *    entre deux champs).
 * 2. Une entrée sans `text` produisait `translatedContent: undefined`.
 * 3. `messageTranslationSchema` ne déclare pas ce champ `nullable`, donc
 *    `fast-json-stringify` l'OMET — la clé disparaît de la charge.
 * 4. `APITextTranslation.translatedContent` est non optionnel côté iOS : le
 *    décodage du message échoue…
 * 5. …et `MessagesResponse.data` étant un `[APIMessage]` décodé d'un bloc,
 *    **c'est la page entière de messages qui échoue**.
 *
 * Une seule ligne malformée en base, et la conversation s'ouvre vide.
 *
 * ## Ce que ce fichier mesure
 *
 * La règle, à sa source : *ce qui n'a pas de texte n'est pas une traduction et
 * ne part pas.* Le reste de la chaîne a sa propre garde côté SDK
 * (décodage tolérant par élément) — les deux sont nécessaires, et celle-ci est
 * la première : « le client peut se tromper ; la charge, non ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { transformTranslationsToArray } from '../../../utils/translation-transformer';

const QUAND = new Date('2026-09-11T10:00:00Z');

/** Ce que la base peut contenir — pas ce que le type promet. */
const enBase = {
  fr: { text: 'Bonjour', translationModel: 'premium', createdAt: QUAND },
  es: { translationModel: 'premium', createdAt: QUAND },
  de: { text: '', translationModel: 'premium', createdAt: QUAND },
  it: { text: 'Ciao', createdAt: QUAND },
} as never;

describe('transformTranslationsToArray — ce qui a le droit de partir', () => {
  it('retire les entrées sans texte, garde celles qui en ont un', () => {
    const servies = transformTranslationsToArray('msg-1', enBase);
    expect(servies.map((t) => t.targetLanguage).sort()).toEqual(['fr', 'it']);
  });

  /**
   * LE TÉMOIN DE LA RÉGRESSION : aucune entrée servie ne peut avoir un contenu
   * indéfini. C'est la propriété exacte dont dépend le décodage du client.
   */
  it('aucune entrée servie n’a de contenu indéfini', () => {
    for (const traduction of transformTranslationsToArray('msg-1', enBase)) {
      expect(typeof traduction.translatedContent).toBe('string');
      expect(traduction.translatedContent.length).toBeGreaterThan(0);
    }
  });

  /**
   * ET LA MOITIÉ SYMÉTRIQUE : un modèle absent ne fait PAS tomber une
   * traduction lisible. `translationModel` est une métadonnée — la retirer
   * priverait l'utilisateur d'un texte qu'on a, pour une étiquette qu'on n'a
   * pas. Le champ est facultatif côté client depuis le même lot.
   */
  it('sert une traduction dont le modèle est inconnu, sans l’inventer', () => {
    const italienne = transformTranslationsToArray('msg-1', enBase).find(
      (t) => t.targetLanguage === 'it',
    );
    expect(italienne?.translatedContent).toBe('Ciao');
    expect(italienne?.translationModel).toBeUndefined();
  });

  it('ne mord pas sur le cas nominal', () => {
    const servies = transformTranslationsToArray('msg-1', {
      fr: { text: 'Bonjour', translationModel: 'premium', createdAt: QUAND },
    } as never);
    expect(servies).toHaveLength(1);
    expect(servies[0]).toMatchObject({
      id: 'msg-1-fr',
      messageId: 'msg-1',
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      translationModel: 'premium',
    });
  });

  it('le filtrage par langue continue de s’appliquer', () => {
    const servies = transformTranslationsToArray('msg-1', enBase, { languages: ['it'] });
    expect(servies.map((t) => t.targetLanguage)).toEqual(['it']);
  });
});
