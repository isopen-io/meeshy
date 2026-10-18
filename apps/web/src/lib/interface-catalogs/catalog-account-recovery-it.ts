import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const it = {
  'recovery.forgot.lead': 'Ricevi via email un link per scegliere una nuova password.',
  'recovery.forgot.neverHad': 'Non hai mai avuto una password?',
  'recovery.forgot.neverHad.text': 'Lo stesso link ti permette di crearne una.',
  'recovery.reset.newPassword': 'Nuova password',
  'recovery.reset.lead': 'Scegli una nuova password.',
  'recovery.reset.confirm': 'Conferma la password',
  'recovery.reset.tooShort': 'Password troppo corta (min. {min} caratteri)',
  'recovery.reset.mismatch': 'Le password non coincidono',
  'recovery.reset.submit': 'Salva password',
  'recovery.reset.submit.busy': 'Salvataggio…',
  'recovery.reset.invalid.title': 'Link non valido o scaduto',
  'recovery.reset.invalid.text': 'Richiedi un nuovo link per scegliere la tua password.',
  'recovery.reset.invalid.action': 'Richiedi un nuovo link',
  'recovery.reset.done.title': 'Password salvata',
  'recovery.reset.done.text': 'Ora puoi accedere con la tua nuova password.',
  'recovery.reset.code': 'Codice di verifica',
  'recovery.reset.code.lead': 'Inserisci il codice a 6 cifre della tua app di autenticazione.',
  'recovery.reset.error.codeRequired': 'Questo account è protetto: inserisci il codice di verifica della tua app di autenticazione.',
  'recovery.reset.error.codeInvalid': 'Codice di verifica errato.',
  'recovery.reset.error.weak': 'Questa password è troppo facile da indovinare. Scegline una più lunga o meno prevedibile.',
  'recovery.reset.error.reused': 'Hai usato questa password di recente. Scegline un’altra.',
  'recovery.reset.error.rateLimited': 'Troppi tentativi. Attendi qualche minuto prima di riprovare.',
  'recovery.reset.error.locked': 'Questo account è temporaneamente bloccato. Contatta l’assistenza.',
  'recovery.reset.exhausted.title': 'Troppi codici errati',
  'recovery.reset.exhausted.text': 'Per sicurezza, questo link è stato disattivato. Richiedine uno nuovo.',
} satisfies AccountRecoveryCatalog;

export default it;
