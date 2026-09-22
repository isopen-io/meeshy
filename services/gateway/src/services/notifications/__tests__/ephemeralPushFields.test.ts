/**
 * Ce qu'un push dit — et ne dit pas — d'un éphémère (#7451, point 10).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { boundApnsPayload, APNS_SAFE_PAYLOAD_BYTES } from '../boundApnsPayload';
import { ephemeralPushFields } from '../ephemeralPushFields';

describe('ephemeralPushFields', () => {
  it('porte la DURÉE et le bitfield, jamais une échéance', () => {
    const fields = ephemeralPushFields({ ephemeralDuration: 30, effectFlags: 5 });

    expect(fields).toEqual({ ephemeralDuration: '30', effectFlags: '5' });
    // Le push atteint un appareil ÉTEINT : son destinataire n'a, par
    // construction, pas encore « reçu » le message au sens du décompte. Une
    // échéance y serait fausse à l'instant même où elle part.
    expect(Object.keys(fields)).not.toContain('expiresAt');
  });

  it("ne pose AUCUNE clé sur un message ordinaire — le budget APNs est de 4 Ko", () => {
    expect(ephemeralPushFields({})).toEqual({});
    expect(ephemeralPushFields({ ephemeralDuration: 0, effectFlags: 3 })).toEqual({});
  });

  it('rend le bitfield même absent — la NSE lit un nombre, jamais rien', () => {
    expect(ephemeralPushFields({ ephemeralDuration: 30 })).toEqual({
      ephemeralDuration: '30',
      effectFlags: '0',
    });
  });
});

describe('boundApnsPayload', () => {
  const socle = { body: 'x', data: { notificationId: 'n1', ephemeralDuration: '30' } };

  it('laisse intacte une charge qui tient dans le budget', () => {
    expect(boundApnsPayload(socle)).toEqual(socle);
  });

  it('coupe la traduction du Prisme avant le texte du message', () => {
    const gros = 'é'.repeat(APNS_SAFE_PAYLOAD_BYTES);
    const borne = boundApnsPayload({
      ...socle,
      data: { ...socle.data, translatedContent: gros, translatedLanguage: 'fr', content: 'bonjour' },
    });

    expect(borne.data).toEqual({ ...socle.data, content: 'bonjour' });
  });

  it("coupe le texte du message quand la traduction ne suffit pas, et garde les champs d'éphémère", () => {
    const gros = 'é'.repeat(APNS_SAFE_PAYLOAD_BYTES);
    const borne = boundApnsPayload({
      ...socle,
      data: { ...socle.data, translatedContent: gros, content: gros, originalLanguage: 'fr' },
    });

    expect(borne.data).toEqual(socle.data);
  });

  it("envoie le dernier étage même s'il dépasse — une charge courte vaut mieux qu'aucune", () => {
    const gros = 'é'.repeat(APNS_SAFE_PAYLOAD_BYTES);
    const borne = boundApnsPayload({ body: gros, data: { notificationId: 'n1' } });

    expect(borne.data).toEqual({ notificationId: 'n1' });
    expect(borne.body).toBe(gros);
  });
});
