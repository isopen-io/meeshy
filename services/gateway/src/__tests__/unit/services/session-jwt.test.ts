/**
 * Témoins du site unique d'émission d'un JWT (#4264).
 *
 * Ils signent et relisent de VRAIS jetons — pas de `jest.mock('jsonwebtoken')`
 * ici : la question posée est « qu'est-ce que le porteur reçoit ? », et un
 * double de la bibliothèque de signature ne peut pas y répondre. C'est
 * exactement ce qu'un anti-témoin ferait : rester vert pendant que le claim
 * n'atteint jamais la charge utile.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import jwt from 'jsonwebtoken';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

import {
  signSessionToken,
  verifySessionToken,
  legacyTokenRefusal,
  LEGACY_SID_WINDOW_CLOSES_AT,
  LEGACY_SID_MAX_TOKEN_AGE_MS,
  SESSION_CLAIM,
  type SessionBoundTokenPayload,
} from '../../../services/auth/session-jwt';

const SECRET = 'secret-de-test-4264';

const alice = { id: '507f1f77bcf86cd799439011', username: 'alice', role: 'USER' };

function payloadOf(token: string): SessionBoundTokenPayload {
  return jwt.decode(token) as SessionBoundTokenPayload;
}

// ─── Émission ───────────────────────────────────────────────────────────────

describe('signSessionToken — le jeton NOMME sa session', () => {
  it('pose `sid` dans la charge utile quand la session est connue', () => {
    const token = signSessionToken({ user: alice, secret: SECRET, sessionId: 'sess-a' });

    expect(payloadOf(token)[SESSION_CLAIM]).toBe('sess-a');
  });

  it('porte aussi userId, username et role — les trois champs historiques', () => {
    // Le lien magique en signait DEUX (pas de `role`) depuis son propre
    // `require('jsonwebtoken')` : deux jetons du même service, de formes
    // différentes. Passer par le site unique solde la divergence.
    const payload = payloadOf(signSessionToken({ user: alice, secret: SECRET, sessionId: 'sess-a' }));

    expect(payload.userId).toBe(alice.id);
    expect(payload.username).toBe('alice');
    expect(payload.role).toBe('USER');
  });

  it('OMET le claim quand aucune session n\'est nommable, au lieu de le poser vide', () => {
    // « pas de session nommée » et « session nommée vide » doivent rester
    // distinguables en aval : la garde de `POST /refresh` branche sur la
    // PRÉSENCE du claim pour choisir entre son régime nominal et sa fenêtre
    // de transition. Un `sid: ''` la ferait entrer dans le mauvais régime.
    const payload = payloadOf(signSessionToken({ user: alice, secret: SECRET }));

    expect(SESSION_CLAIM in payload).toBe(false);
  });

  it('signe avec le secret servi — un autre secret ne relit pas le jeton', () => {
    const token = signSessionToken({ user: alice, secret: SECRET, sessionId: 'sess-a' });

    expect(verifySessionToken(token, SECRET)?.userId).toBe(alice.id);
    expect(verifySessionToken(token, 'un-autre-secret')).toBeNull();
  });

  it('expire — un jeton déjà périmé ne se relit pas', () => {
    const token = signSessionToken({
      user: alice, secret: SECRET, sessionId: 'sess-a', expiresIn: '-1s',
    });

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });
});

// ─── Butoir de la fenêtre de transition ─────────────────────────────────────

const AVANT_FERMETURE = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() - 60_000);
const iatOf = (d: Date) => Math.floor(d.getTime() / 1000);

describe('legacyTokenRefusal — la fenêtre du jeton hérité se ferme', () => {
  it('admet un jeton récent sans `sid`, tant que la fenêtre est ouverte', () => {
    // Sans cette tolérance, le lot déconnecterait tout le parc installé pour
    // fermer un cas étroit — le compromis que #4213 avait déjà écarté.
    expect(legacyTokenRefusal({ iat: iatOf(AVANT_FERMETURE) }, AVANT_FERMETURE)).toBeNull();
  });

  it('refuse dès que la fenêtre est fermée, même pour un jeton fraîchement émis', () => {
    // LE témoin du critère 3. Sans lui, le repli devient PERMANENT : la route
    // vérifie avec `ignoreExpiration: true`, donc « jusqu'à son expiration
    // naturelle » n'y borne rien. Et c'est ce butoir-ci — l'horloge, pas
    // l'âge — qui ne se ré-arme pas : un renouvellement rend un jeton neuf,
    // dont l'âge repart de zéro.
    const apres = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() + 1);

    expect(legacyTokenRefusal({ iat: iatOf(apres) }, apres)).toBe('window-closed');
  });

  it('refuse un jeton plus vieux que l\'âge maximal, même dans la fenêtre', () => {
    const iat = iatOf(new Date(AVANT_FERMETURE.getTime() - LEGACY_SID_MAX_TOKEN_AGE_MS - 1000));

    expect(legacyTokenRefusal({ iat }, AVANT_FERMETURE)).toBe('token-too-old');
  });

  it('admet un jeton juste sous l\'âge maximal — la borne ne mord pas d\'un jour trop tôt', () => {
    const iat = iatOf(new Date(AVANT_FERMETURE.getTime() - LEGACY_SID_MAX_TOKEN_AGE_MS + 60_000));

    expect(legacyTokenRefusal({ iat }, AVANT_FERMETURE)).toBeNull();
  });

  it('refuse un jeton SANS `iat` — on ne borne pas l\'âge de ce qu\'on ne sait pas dater', () => {
    // Échouer fermé est gratuit ici : `jsonwebtoken` pose toujours `iat`
    // (hors `noTimestamp`, absent de ce dépôt), donc aucun client légitime
    // n'emprunte cette branche. La laisser ouverte offrirait en revanche une
    // charge non datable comme contournement du butoir.
    expect(legacyTokenRefusal({}, AVANT_FERMETURE)).toBe('token-undatable');
  });

  it('refuse un `iat` non numérique — une charge forgée ne se glisse pas sous la borne', () => {
    expect(
      legacyTokenRefusal({ iat: 'hier' as unknown as number }, AVANT_FERMETURE)
    ).toBe('token-undatable');
  });

  it('est PURE : l\'horloge est un paramètre, deux instants rendent deux verdicts', () => {
    // Un butoir dont on ne peut pas déplacer l'instant n'est pas testable, et
    // un butoir non testé n'est pas un butoir.
    const iat = iatOf(AVANT_FERMETURE);
    const apres = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() + 1);

    expect(legacyTokenRefusal({ iat }, AVANT_FERMETURE)).toBeNull();
    expect(legacyTokenRefusal({ iat }, apres)).toBe('window-closed');
  });
});
