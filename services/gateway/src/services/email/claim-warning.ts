/**
 * L'AVERTISSEMENT D'UNE REVENDICATION D'ADRESSE (#8227, suite de #8214).
 *
 * L'e-mail envoyé à une adresse revendiquée (« ce n'est pas moi ») est l'e-mail
 * de vérification ordinaire. Il doit en plus DIRE ce que le code fait : la
 * personne qui lit la boîte doit savoir, avant de le saisir, qu'il retire
 * l'adresse au compte qui la détient aujourd'hui.
 *
 * Une entrée par langue des e-mails (`SupportedLanguage`, `./translations`) ;
 * une autre langue retombe sur l'anglais, comme tout le gabarit.
 *
 * @module services/email/claim-warning
 */

import type { SupportedLanguage } from './translations';

export const CLAIM_WARNING: Readonly<Record<SupportedLanguage, string>> = {
  fr: "Attention : saisir ce code ou ouvrir ce lien retire cette adresse au compte existant qui la détient aujourd'hui, et la rattache à ce nouveau compte. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : rien ne changera.",
  en: 'Warning: entering this code or opening this link removes this address from the existing account that holds it today and attaches it to this new account. If you did not make this request, ignore this email: nothing will change.',
  es: 'Atención: introducir este código o abrir este enlace retira esta dirección de la cuenta existente que la tiene hoy y la vincula a esta nueva cuenta. Si no has hecho esta solicitud, ignora este correo: no cambiará nada.',
  pt: 'Atenção: inserir este código ou abrir este link remove este endereço da conta existente que o detém hoje e o vincula a esta nova conta. Se você não fez esta solicitação, ignore este e-mail: nada mudará.',
  it: 'Attenzione: inserire questo codice o aprire questo link rimuove questo indirizzo dall’account esistente che lo detiene oggi e lo collega a questo nuovo account. Se non hai fatto questa richiesta, ignora questa email: non cambierà nulla.',
  de: 'Achtung: Wenn Sie diesen Code eingeben oder diesen Link öffnen, wird diese Adresse dem bestehenden Konto, dem sie heute gehört, entzogen und diesem neuen Konto zugeordnet. Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail: Es ändert sich nichts.',
};

export function claimWarningFor(language: SupportedLanguage): string {
  return CLAIM_WARNING[language];
}
