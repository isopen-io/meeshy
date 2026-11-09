import type { PushNotificationPayload, PushResult } from '../PushNotificationService';

export type PushToTalkTokenRecord = {
  id: string;
  token: string;
  bundleId?: string | null;
  apnsEnvironment?: string | null;
};

export type ApnsEnvironment = 'sandbox' | 'production';

export type ApnsSendOutcome = { failed: Array<{ response?: { reason?: string }; status?: number | string }> };

export type PushToTalkTransport = {
  readonly hasClient: (env: ApnsEnvironment) => boolean;
  readonly send: (env: ApnsEnvironment, notification: unknown, token: string, corr: Record<string, unknown>) => Promise<ApnsSendOutcome>;
  readonly isTransient: (reason: string | undefined) => boolean;
  readonly defaultBundleId: string;
  readonly log: (event: 'success' | 'failure', fields: Record<string, unknown>) => void;
};

/**
 * Le réveil PushToTalk (#17142) : `apns-push-type: pushtotalk`, topic `<bundle>.voip-ptt`, priorité 10,
 * expiration 0 (une voix périmée ne réveille personne), ni alerte ni son — le framework PushToTalk rend
 * lui-même l'orateur actif à partir des clés de `data`.
 */
export async function sendViaPushToTalk(
  transport: PushToTalkTransport,
  tokenRecord: PushToTalkTokenRecord,
  payload: PushNotificationPayload,
): Promise<PushResult> {
  const env: ApnsEnvironment = tokenRecord.apnsEnvironment === 'development' ? 'sandbox' : 'production';
  if (!transport.hasClient(env)) {
    return { success: false, tokenId: tokenRecord.id, error: `APNS ${env} client not initialized` };
  }
  try {
    const apn = await import('@parse/node-apn');
    const notification = new apn.Notification();
    notification.topic = `${tokenRecord.bundleId || transport.defaultBundleId}.voip-ptt`;
    notification.pushType = 'pushtotalk';
    notification.priority = 10;
    notification.expiry = 0;
    notification.payload = { ...(payload.data ?? {}) };
    const corr = { tokenId: tokenRecord.id, apnsEnv: env, topic: notification.topic, pushType: 'pushtotalk' };
    const result = await transport.send(env, notification, tokenRecord.token, corr);
    if (result.failed.length > 0) {
      const reason = result.failed[0].response?.reason || 'APNS delivery failed';
      transport.log('failure', { ...corr, reason, statusCode: result.failed[0].status });
      return { success: false, tokenId: tokenRecord.id, error: reason, transient: transport.isTransient(reason) };
    }
    transport.log('success', corr);
    return { success: true, tokenId: tokenRecord.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'APNS error';
    transport.log('failure', { tokenId: tokenRecord.id, apnsEnv: env, errorMessage: message });
    return { success: false, tokenId: tokenRecord.id, error: message };
  }
}
