import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const de = {
  'callRecording.stop': 'Aufnahme beenden',
  'callRecording.active': 'Aufnahme läuft',
  'callRecording.waiting': 'Warten auf die Zustimmung aller…',
  'callRecording.ask': '{name} möchte den Anruf aufnehmen',
  'callRecording.askVideo': '{name} möchte den Anruf als Video aufnehmen',
  'callRecording.askDetail': 'Die Aufnahme beginnt nur, wenn alle zustimmen, und wird dann zur Unterhaltung hinzugefügt.',
  'callRecording.accept': 'Zustimmen',
  'callRecording.refuse': 'Ablehnen',
  'callRecording.cancel': 'Abbrechen',
  'callRecording.someone': 'Ein Teilnehmer',
  'callRecording.stopped.refused': 'Aufnahme abgelehnt',
  'callRecording.stopped.timeout': 'Nicht alle haben geantwortet: keine Aufnahme',
  'callRecording.stopped.joined': 'Jemand ist dem Anruf beigetreten: Aufnahme beendet',
  'callRecording.stopped.other': 'Aufnahme beendet',
  'callRecording.unavailable': 'Aufnahme derzeit nicht möglich',
  'callRecording.saved': 'Die Aufnahme wurde zur Unterhaltung hinzugefügt',
  'callRecording.saveFailed': 'Die Aufnahme konnte nicht hinzugefügt werden',
  'callRecording.close': 'Schließen',
} satisfies CallRecordingCatalog;

export default de;
