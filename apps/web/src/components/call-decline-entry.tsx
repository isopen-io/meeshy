import { callActions } from '@/lib/calls/call-actions';
import type { DeclineReplyDeps } from '@/lib/calls/decline-reply';
import { apiDeps } from '@/lib/api/deps';
import { sendAction } from '@/lib/api/query';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { appQueryClient } from '@/lib/api/query-client';
import { quickReplyAllowed } from '@/lib/send/served-regime';

import { CallDeclineSheet } from './call-decline-sheet';

/**
 * Les dépendances RÉELLES du refus avec message (#8065) : le moteur d'appel
 * pour `call:end`, et `sendAction` — le même chemin que le composeur (outbox,
 * bulle optimiste, file hors ligne). Dans une conversation vue chiffrée de
 * bout en bout, ou dont ce navigateur ne connaît pas le régime, rien n'y part
 * (#13171). Chunk à part, chargé au toucher de
 * « Message ».
 */
const declineReplyDeps: DeclineReplyDeps = {
  decline: callActions.decline,
  canReply: (conversationId) => quickReplyAllowed(conversationId, appQueryClient),
  send: ({ conversationId, content, language }) =>
    void sendAction({
      conversationId,
      draft: { content, originalLanguage: language },
      viewerId: resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '',
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    }),
};

export function ConnectedCallDeclineSheet(props: Omit<Parameters<typeof CallDeclineSheet>[0], 'deps'>) {
  return <CallDeclineSheet {...props} deps={declineReplyDeps} />;
}
