import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const it = {
  'callRecording.stop': 'Interrompi la registrazione',
  'callRecording.active': 'Registrazione in corso',
  'callRecording.waiting': 'In attesa del consenso di tutti…',
  'callRecording.ask': '{name} vuole registrare la chiamata',
  'callRecording.askDetail': 'La registrazione inizia solo se tutti accettano, poi viene aggiunta alla conversazione.',
  'callRecording.accept': 'Accetta',
  'callRecording.refuse': 'Rifiuta',
  'callRecording.cancel': 'Annulla',
  'callRecording.someone': 'Un partecipante',
  'callRecording.stopped.refused': 'Registrazione rifiutata',
  'callRecording.stopped.timeout': 'Non tutti hanno risposto: nessuna registrazione',
  'callRecording.stopped.joined': 'Qualcuno si è unito alla chiamata: registrazione interrotta',
  'callRecording.stopped.other': 'Registrazione interrotta',
  'callRecording.unavailable': 'Registrazione non disponibile al momento',
  'callRecording.saved': 'La registrazione è stata aggiunta alla conversazione',
  'callRecording.saveFailed': 'Impossibile aggiungere la registrazione',
  'callRecording.close': 'Chiudi',
} satisfies CallRecordingCatalog;

export default it;
