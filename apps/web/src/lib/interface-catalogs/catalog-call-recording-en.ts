import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const en = {
  'callRecording.stop': 'Stop recording',
  'callRecording.active': 'Recording in progress',
  'callRecording.waiting': 'Waiting for everyone’s consent…',
  'callRecording.ask': '{name} wants to record the call',
  'callRecording.askDetail': 'Recording only starts if everyone agrees, and it is then added to the conversation.',
  'callRecording.accept': 'Accept',
  'callRecording.refuse': 'Decline',
  'callRecording.cancel': 'Cancel',
  'callRecording.someone': 'A participant',
  'callRecording.stopped.refused': 'Recording declined',
  'callRecording.stopped.timeout': 'Not everyone answered: no recording',
  'callRecording.stopped.joined': 'Someone joined the call: recording stopped',
  'callRecording.stopped.other': 'Recording stopped',
  'callRecording.unavailable': 'Recording is not available right now',
  'callRecording.saved': 'The recording was added to the conversation',
  'callRecording.saveFailed': 'The recording could not be added',
  'callRecording.close': 'Close',
} satisfies CallRecordingCatalog;

export default en;
