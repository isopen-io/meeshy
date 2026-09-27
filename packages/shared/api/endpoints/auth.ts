/**
 * Les adresses du groupe `auth` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/auth/check-availability */
export const checkAvailability = '/api/v1/auth/check-availability';

/** POST /api/v1/auth/forgot-password */
export const forgotPassword = '/api/v1/auth/forgot-password';

/** POST /api/v1/auth/forgot-password/phone/lookup */
export const forgotPasswordPhoneLookup = '/api/v1/auth/forgot-password/phone/lookup';

/** POST /api/v1/auth/forgot-password/phone/resend */
export const forgotPasswordPhoneResend = '/api/v1/auth/forgot-password/phone/resend';

/** POST /api/v1/auth/forgot-password/phone/verify-code */
export const forgotPasswordPhoneVerifyCode = '/api/v1/auth/forgot-password/phone/verify-code';

/** POST /api/v1/auth/forgot-password/phone/verify-identity */
export const forgotPasswordPhoneVerifyIdentity = '/api/v1/auth/forgot-password/phone/verify-identity';

/** POST /api/v1/auth/login */
export const login = '/api/v1/auth/login';

/** POST /api/v1/auth/login/2fa */
export const loginN2Fa = '/api/v1/auth/login/2fa';

/** POST /api/v1/auth/logout */
export const logout = '/api/v1/auth/logout';

/** POST /api/v1/auth/magic-link/request */
export const magicLinkRequest = '/api/v1/auth/magic-link/request';

/** POST /api/v1/auth/magic-link/validate */
export const magicLinkValidate = '/api/v1/auth/magic-link/validate';

/** GET /api/v1/auth/me */
export const me = '/api/v1/auth/me';

/** POST /api/v1/auth/2fa/backup-codes */
export const n2FaBackupCodes = '/api/v1/auth/2fa/backup-codes';

/** POST /api/v1/auth/2fa/cancel */
export const n2FaCancel = '/api/v1/auth/2fa/cancel';

/** POST /api/v1/auth/2fa/disable */
export const n2FaDisable = '/api/v1/auth/2fa/disable';

/** POST /api/v1/auth/2fa/enable */
export const n2FaEnable = '/api/v1/auth/2fa/enable';

/** POST /api/v1/auth/2fa/setup */
export const n2FaSetup = '/api/v1/auth/2fa/setup';

/** GET /api/v1/auth/2fa/status */
export const n2FaStatus = '/api/v1/auth/2fa/status';

/** POST /api/v1/auth/2fa/verify */
export const n2FaVerify = '/api/v1/auth/2fa/verify';

/** POST /api/v1/auth/phone-transfer/cancel */
export const phoneTransferCancel = '/api/v1/auth/phone-transfer/cancel';

/** POST /api/v1/auth/phone-transfer/check */
export const phoneTransferCheck = '/api/v1/auth/phone-transfer/check';

/** POST /api/v1/auth/phone-transfer/initiate */
export const phoneTransferInitiate = '/api/v1/auth/phone-transfer/initiate';

/** POST /api/v1/auth/phone-transfer/initiate-registration */
export const phoneTransferInitiateRegistration = '/api/v1/auth/phone-transfer/initiate-registration';

/** POST /api/v1/auth/phone-transfer/resend */
export const phoneTransferResend = '/api/v1/auth/phone-transfer/resend';

/** POST /api/v1/auth/phone-transfer/verify */
export const phoneTransferVerify = '/api/v1/auth/phone-transfer/verify';

/** POST /api/v1/auth/phone-transfer/verify-registration */
export const phoneTransferVerifyRegistration = '/api/v1/auth/phone-transfer/verify-registration';

/** POST /api/v1/auth/refresh */
export const refresh = '/api/v1/auth/refresh';

/** POST /api/v1/auth/register */
export const register = '/api/v1/auth/register';

/** POST /api/v1/auth/resend-verification */
export const resendVerification = '/api/v1/auth/resend-verification';

/** POST /api/v1/auth/reset-password */
export const resetPassword = '/api/v1/auth/reset-password';

/** GET /api/v1/auth/reset-password/verify-token */
export const resetPasswordVerifyToken = '/api/v1/auth/reset-password/verify-token';

/** GET /api/v1/auth/revoke-all-sessions */
export const revokeAllSessions = '/api/v1/auth/revoke-all-sessions';

/** POST /api/v1/auth/send-phone-code */
export const sendPhoneCode = '/api/v1/auth/send-phone-code';

/** GET · DELETE /api/v1/auth/sessions */
export const sessions = '/api/v1/auth/sessions';

/** DELETE /api/v1/auth/sessions/:sessionId */
export const sessionsBySessionId = (sessionId: string): string => `/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`;

/** POST /api/v1/auth/verification/status */
export const verificationStatus = '/api/v1/auth/verification/status';

/** POST /api/v1/auth/verify-email */
export const verifyEmail = '/api/v1/auth/verify-email';

/** POST /api/v1/auth/verify-phone */
export const verifyPhone = '/api/v1/auth/verify-phone';
