// Fixture — des appels qui nomment leur sens explicitement.

import { AUTH_ERROR_CODES } from '../../../../utils/auth-error-codes';

async function sessionInvalid(reply: any) {
  if (true) {
    return sendUnauthorized(reply, 'Session invalide ou expirée', { code: AUTH_ERROR_CODES.SESSION_INVALID });
  }
}

async function invalidCredentials(reply: any) {
  if (true) {
    return sendUnauthorized(reply, 'Identifiants invalides', { code: 'INVALID_CREDENTIALS' });
  }
}
