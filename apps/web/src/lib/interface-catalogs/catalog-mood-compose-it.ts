import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ITALIEN (#10527) — les clés du français. */
const it = {
  'status.compose.more': 'Altre emoji',
  'status.compose.bare.ask': 'Pubblicare il tuo umore senza due parole?',
  'status.compose.bare.add': 'Aggiungi una parola',
  'status.compose.bare.publish': 'Pubblica comunque',
  'mood.page.label': 'L’umore del momento',
  'mood.page.close': 'Chiudi',
  'mood.page.reply.placeholder': 'Rispondi in privato…',
  'mood.page.reply.send': 'Invia',
  'mood.page.reply.sent': 'Risposta inviata',
  'mood.page.reply.open': 'Apri la conversazione',
  'mood.page.reply.failed': 'La risposta non è partita. Riprova.',
  'mood.page.reply.offline': 'Offline: riprova quando sei connesso.',
  'mood.page.gone': 'Questo umore non è più disponibile.',
  'mood.page.loading': 'Caricamento dell’umore',
} as const satisfies MoodComposeCatalog;

export default it;
