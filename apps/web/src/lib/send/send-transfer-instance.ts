import { postMediaUploadDeps } from '@/lib/api/deps';

import type { SendTransfer } from './perform-send';
import { sendProgressStore } from './send-progress';

/** Le téléversement par reprise et la progression des bulles (#16134) que l'application remet à `performSend`. */
export const sendTransfer: SendTransfer = { progress: sendProgressStore, media: postMediaUploadDeps };
