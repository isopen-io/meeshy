import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const itAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Elimina il tuo account Meeshy',
  'accountDeletion.guide.intro': 'Questa pagina riguarda l’app Meeshy su Android, iOS e web. Spiega come eliminare il tuo account e cosa succede ai tuoi dati.',
  'accountDeletion.guide.steps.title': 'Come fare',
  'accountDeletion.guide.step.signIn': 'Accedi con il pulsante qui sotto. Nell’app, la stessa richiesta si trova in Impostazioni, Elimina l’account.',
  'accountDeletion.guide.step.confirm': 'Digita la frase di conferma e la tua password, poi richiedi l’eliminazione.',
  'accountDeletion.guide.step.email': 'Apri l’e-mail che ti inviamo e conferma l’eliminazione.',
  'accountDeletion.guide.step.wait': 'Il tuo account viene eliminato 30 giorni dopo. Non devi fare altro.',
  'accountDeletion.guide.signIn': 'Accedi per eliminare il mio account',
  'accountDeletion.guide.deleted.title': 'Cosa viene eliminato',
  'accountDeletion.guide.deleted.profile': 'Il tuo profilo: nome, nome utente, e-mail, numero di telefono, foto, copertina, biografia e data di nascita.',
  'accountDeletion.guide.deleted.access': 'La tua password, le tue sessioni e le tue chiavi di crittografia.',
  'accountDeletion.guide.deleted.messages': 'Il testo dei tuoi messaggi e le loro traduzioni, le tue foto, i video e i messaggi vocali.',
  'accountDeletion.guide.deleted.other': 'Il tuo profilo vocale, la tua rubrica, le tue notifiche, i tuoi link di condivisione, i tuoi progressi nel gioco e i tuoi sticker.',
  'accountDeletion.guide.kept.title': 'Cosa viene conservato',
  'accountDeletion.guide.kept.messages': 'Nelle conversazioni degli altri, i tuoi messaggi restano al loro posto, vuoti e segnati come eliminati.',
  'accountDeletion.guide.kept.posts': 'Il testo dei tuoi post e commenti resta visibile con il nome «Account eliminato». Per toglierli, eliminali nell’app prima della richiesta.',
  'accountDeletion.guide.kept.packs': 'I pacchetti di sticker che hai pubblicato restano disponibili, senza il tuo nome.',
  'accountDeletion.guide.kept.stats': 'Un identificativo di account anonimo e statistiche d’uso che non permettono di identificarti.',
  'accountDeletion.guide.delay.title': 'Tempi',
  'accountDeletion.guide.delay.body': 'Il tuo account viene eliminato 30 giorni dopo la tua conferma. Fino ad allora puoi annullare con il link ricevuto via e-mail.',
  'accountDeletion.guide.noAccess.title': 'Non riesci più ad accedere?',
  'accountDeletion.guide.noAccess.body': 'Scrivici dall’indirizzo e-mail del tuo account chiedendone l’eliminazione. Rispondiamo entro 30 giorni.',
} as const satisfies AccountDeletionGuideCatalog;

export default itAccountDeletionGuide;
