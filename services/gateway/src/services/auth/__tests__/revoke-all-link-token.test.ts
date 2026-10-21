/**
 * #10493 — le jeton du lien « ce n'était pas moi » n'ouvre QUE ce lien.
 *
 * Il voyageait signé avec `JWT_SECRET`, sans audience : toute porte qui vérifie
 * un jeton d'authentification avec ce secret l'acceptait. Il est désormais
 * signé avec un secret DÉRIVÉ et une audience propre ; l'ancienne forme reste
 * lisible par le lien seul, le temps que les e-mails déjà partis échoient (24 h).
 */

import { describe, it, expect } from '@jest/globals';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  REVOKE_ALL_LINK_AUDIENCE,
  signRevokeAllLinkToken,
  verifyRevokeAllLinkToken,
} from '../revoke-all-link-token';
import { sessionAdmissionRefusal } from '../session-admission';

const SECRET = 'test-secret-revoke-all-link-token-0123456789';
const USER_ID = '507f1f77bcf86cd799439011';
const SID = '507f1f77bcf86cd799439022';

const prismaWithLiveSession = () =>
  ({
    userSession: {
      findFirst: async () => ({ isValid: true, expiresAt: new Date(Date.now() + 3_600_000) }),
    },
  }) as never;

describe('signRevokeAllLinkToken — le jeton du lien est étranger à toute porte d’authentification', () => {
  it('ne se vérifie PAS avec JWT_SECRET (REST, socket, TUS et refresh le vérifient avec lui)', () => {
    const token = signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: SECRET });
    expect(() => jwt.verify(token, SECRET)).toThrow();
  });

  it('porte une audience propre et une échéance de 24 heures', () => {
    const token = signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: SECRET });
    const claims = jwt.decode(token) as Record<string, unknown>;
    expect(claims.aud).toBe(REVOKE_ALL_LINK_AUDIENCE);
    expect((claims.exp as number) - (claims.iat as number)).toBe(24 * 60 * 60);
    expect(claims.sid).toBeUndefined();
  });

  it('se relit par le lien et rend le compte visé', () => {
    const token = signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: SECRET });
    expect(verifyRevokeAllLinkToken(token, SECRET)).toEqual({ userId: USER_ID });
  });
});

describe('verifyRevokeAllLinkToken — ce que le lien accepte', () => {
  it('accepte encore l’ANCIENNE forme, déjà partie dans les e-mails (rétrocompatibilité, #9223)', () => {
    const legacy = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, SECRET, { expiresIn: '24h' });
    expect(verifyRevokeAllLinkToken(legacy, SECRET)).toEqual({ userId: USER_ID });
  });

  it('refuse un jeton de SESSION, même authentique', () => {
    const session = jwt.sign({ userId: USER_ID, username: 'a', role: 'USER', sid: SID }, SECRET);
    expect(verifyRevokeAllLinkToken(session, SECRET)).toBeNull();
  });

  it('refuse une ancienne forme qui porterait un `sid` ou une audience', () => {
    const withSid = jwt.sign({ userId: USER_ID, action: 'revoke-all', sid: SID }, SECRET, { expiresIn: '24h' });
    const withAud = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, SECRET, { audience: 'autre', expiresIn: '24h' });
    expect(verifyRevokeAllLinkToken(withSid, SECRET)).toBeNull();
    expect(verifyRevokeAllLinkToken(withAud, SECRET)).toBeNull();
  });

  it('refuse une nouvelle forme signée de la bonne clé dérivée mais d’une autre audience', () => {
    const derivedKey = createHmac('sha256', SECRET).update('meeshy/revoke-all-sessions-link/v1').digest('hex');
    const sameKeyOtherAudience = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, derivedKey, { audience: 'autre', expiresIn: '24h' });
    const sameKeyRightAudience = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, derivedKey, { audience: REVOKE_ALL_LINK_AUDIENCE, expiresIn: '24h' });
    expect(verifyRevokeAllLinkToken(sameKeyRightAudience, SECRET)).toEqual({ userId: USER_ID });
    expect(verifyRevokeAllLinkToken(sameKeyOtherAudience, SECRET)).toBeNull();
  });

  it('refuse une nouvelle forme signée d’un autre secret', () => {
    const otherSecret = signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: 'un-autre-secret-0123456789abcdef' });
    expect(verifyRevokeAllLinkToken(otherSecret, SECRET)).toBeNull();
  });

  it('refuse une ancienne forme SANS échéance : la transition ne vaut que pour les jetons de 24 heures déjà partis', () => {
    const sansExp = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, SECRET);
    expect(verifyRevokeAllLinkToken(sansExp, SECRET)).toBeNull();
  });

  it('refuse un jeton échu, sous les deux formes', () => {
    const past = Math.floor(Date.now() / 1000) - 2 * 24 * 3600;
    const legacy = jwt.sign({ userId: USER_ID, action: 'revoke-all', iat: past, exp: past + 3600 }, SECRET);
    expect(verifyRevokeAllLinkToken(legacy, SECRET)).toBeNull();
  });

  it('refuse une charge sans compte ou à l’action étrangère', () => {
    const noUser = jwt.sign({ action: 'revoke-all' }, SECRET);
    const otherAction = jwt.sign({ userId: USER_ID, action: 'other' }, SECRET, { expiresIn: '24h' });
    expect(verifyRevokeAllLinkToken(noUser, SECRET)).toBeNull();
    expect(verifyRevokeAllLinkToken(otherAction, SECRET)).toBeNull();
    expect(verifyRevokeAllLinkToken('pas-un-jeton', SECRET)).toBeNull();
  });
});

describe('sessionAdmissionRefusal — une charge de lien n’ouvre aucune porte, même munie d’un `sid` vivant', () => {
  it('refuse une charge qui porte `action`', async () => {
    const refus = await sessionAdmissionRefusal(prismaWithLiveSession(), {
      claims: { sid: SID, action: 'revoke-all' } as never,
      userId: USER_ID,
      now: new Date(),
    });
    expect(refus).toBe('not-a-session-token');
  });

  it('refuse une charge qui porte une audience', async () => {
    const refus = await sessionAdmissionRefusal(prismaWithLiveSession(), {
      claims: { sid: SID, aud: REVOKE_ALL_LINK_AUDIENCE } as never,
      userId: USER_ID,
      now: new Date(),
    });
    expect(refus).toBe('not-a-session-token');
  });

  it('admet une charge de session nominale', async () => {
    const refus = await sessionAdmissionRefusal(prismaWithLiveSession(), {
      claims: { sid: SID },
      userId: USER_ID,
      now: new Date(),
    });
    expect(refus).toBeNull();
  });
});
