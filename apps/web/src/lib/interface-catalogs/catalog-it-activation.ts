/**
 * LA MODAL « VALIDEZ VOTRE COMPTE » (#8239, loi serveur #8238) — tranche du
 * catalogue `catalog-it.ts`, extraite pour tenir le budget de taille
 * (CLAUDE.md) : le catalogue la RÉPAND. De J7 à J28, l'invitation à prouver
 * son adresse et à ajouter un numéro, sans quitter l'app.
 */
const itActivation = {
  'activation.invite.title': 'Convalida il tuo account',
  'activation.invite.daysLeft': 'Ti restano {days} giorni per convalidare il tuo account. Dopo, per accedere servirà un codice.',
  'activation.invite.daysLeft.one': 'Ti resta 1 giorno per convalidare il tuo account. Dopo, per accedere servirà un codice.',
  'activation.invite.lead': 'Convalida il tuo account per continuare a usarlo senza interruzioni.',
  'activation.email.label': 'Conferma il tuo indirizzo email',
  'activation.email.send': 'Ricevi il codice',
  'activation.email.sending': 'Invio…',
  'activation.email.sent': 'Codice inviato a {email}. Inseriscilo qui sotto.',
  'activation.email.failed': 'Impossibile inviare il codice. Riprova.',
  'activation.email.done': 'Email verificata ✓',
  'activation.phone.label': 'Aggiungi un numero per proteggere e recuperare il tuo account',
  'activation.phone.add': 'Aggiungi il mio numero',
  'activation.phone.field': 'Numero di telefono',
  'activation.phone.hint': 'In formato internazionale, per esempio +39 312 345 6789',
  'activation.phone.send': 'Invia il codice',
  'activation.phone.code': 'Codice ricevuto via SMS',
  'activation.phone.verify': 'Conferma',
  'activation.phone.busy': 'Invio…',
  'activation.phone.invalid': 'Inserisci un numero in formato internazionale (+…).',
  'activation.phone.failed': 'Impossibile salvare questo numero. Riprova.',
  'activation.phone.codeInvalid': 'Codice non valido o scaduto',
  'activation.phone.done': 'Numero verificato ✓',
  'activation.complete': 'Il tuo account è convalidato. Grazie!',
  'activation.later': 'Più tardi',
  'activation.close': 'Chiudi',
  'activation.gate.title': 'Convalida il tuo indirizzo e-mail',
  'activation.gate.publish': 'Per pubblicare, convalida il tuo indirizzo. Il tuo contenuto è conservato e partirà appena il codice sarà convalidato.',
  'activation.gate.invite': 'Per invitare via e-mail, convalida il tuo indirizzo. Il tuo invito partirà appena il codice sarà convalidato.',
  'activation.gate.link': 'Per creare un link, convalida il tuo indirizzo. Il tuo link sarà creato appena il codice sarà convalidato.',
} as const;

export default itActivation;
