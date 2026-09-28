import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';
import { CALL_RECORDING_KINDS } from '@meeshy/shared/types/call-recording';

export const socketCallRecordingRequestSchema = z
  .object({ callId: CommonSchemas.mongoId, kind: z.enum(CALL_RECORDING_KINDS).optional() })
  .strict();

export const socketCallRecordingConsentSchema = z
  .object({
    callId: CommonSchemas.mongoId,
    recordingId: CommonSchemas.mongoId,
    accepted: z.boolean(),
  })
  .strict();

export const socketCallRecordingStopSchema = z
  .object({
    callId: CommonSchemas.mongoId,
    recordingId: CommonSchemas.mongoId,
  })
  .strict();

export const callRecordingLinkSchema = z.object({
  params: z.object({
    callId: CommonSchemas.mongoId,
    recordingId: CommonSchemas.mongoId,
  }),
  body: z.object({ attachmentId: CommonSchemas.mongoId }).strict(),
});
