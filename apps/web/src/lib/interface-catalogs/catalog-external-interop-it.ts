import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const it = {
  'externalInterop.notice.title': 'Scrivere a un amico su WhatsApp',
  'externalInterop.notice.lead': 'Per raggiungere il tuo amico su WhatsApp, Meeshy trasmette a Meta, che gestisce WhatsApp:',
  'externalInterop.disclosure.phone-number': 'il tuo numero di telefono verificato, che ti identifica su WhatsApp;',
  'externalInterop.disclosure.profile-name': 'il tuo nome visualizzato;',
  'externalInterop.disclosure.public-keys': 'le chiavi pubbliche di crittografia dei tuoi dispositivi;',
  'externalInterop.disclosure.encrypted-content': 'i tuoi messaggi e contenuti multimediali, crittografati end-to-end: Meta non può leggerli;',
  'externalInterop.disclosure.delivery-metadata': 'chi scrive a chi, quando, la dimensione degli invii e le conferme di consegna.',
  'externalInterop.notice.retention': 'Meeshy conserva il numero del tuo amico per {days} giorni dopo l’ultima apertura della conversazione, poi lo cancella.',
  'externalInterop.notice.retention.unknown': 'Meeshy conserva il numero del tuo amico per un periodo limitato, poi lo cancella.',
  'externalInterop.notice.translation': 'La traduzione avviene sul tuo dispositivo: Meeshy non vede mai il contenuto di questa conversazione.',
  'externalInterop.notice.withdraw': 'Puoi revocare questo consenso in qualsiasi momento: Meeshy cancella allora i numeri dei tuoi amici WhatsApp.',
  'externalInterop.notice.accept': 'Accetto e continuo',
  'externalInterop.notice.accept.busy': 'Salvataggio…',
  'externalInterop.notice.cancel': 'Annulla',
  'externalInterop.notice.outdated': 'Questa informazione è cambiata: aggiorna Meeshy per rileggerla prima di accettare.',
  'externalInterop.notice.unavailable': 'Scrivere a un amico su WhatsApp non è ancora disponibile qui.',
  'externalInterop.notice.error': 'Non è stato possibile salvare il tuo consenso. Riprova.',
  'externalInterop.report.title': 'Segnala questo contenuto WhatsApp',
  'externalInterop.report.lead': 'Meeshy non può leggere questa conversazione: solo ciò che scegli di allegare viene inviato al nostro team di moderazione.',
  'externalInterop.report.reason': 'Motivo',
  'externalInterop.report.attach': 'Allega il testo del messaggio',
  'externalInterop.report.attach.hint': 'Il testo allegato viene inviato in chiaro alla moderazione di Meeshy.',
  'externalInterop.report.block': 'Blocca questo contatto su Meeshy',
  'externalInterop.report.submit': 'Invia la segnalazione',
  'externalInterop.report.submit.busy': 'Invio…',
  'externalInterop.report.cancel': 'Annulla',
  'externalInterop.report.done.title': 'Segnalazione inviata',
  'externalInterop.report.done.blocked': 'Questo contatto è bloccato: non riceverai più i suoi messaggi su Meeshy.',
  'externalInterop.report.done.orientation': 'Meeshy non può intervenire sul suo account WhatsApp. Per far rimuovere questo contenuto da WhatsApp, usa la segnalazione offerta da Meta.',
  'externalInterop.report.done.close': 'Chiudi',
  'externalInterop.report.error': 'Non è stato possibile inviare la segnalazione. Riprova.',
} satisfies ExternalInteropCatalog;

export default it;
