import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { apercuServi, type Conversation } from '@/lib/api/compte';
import type { Message } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';
import { apercuAuPrisme, avatar } from './vue';

/**
 * LA FEUILLE « TRANSFÉRER LE MESSAGE » (#5386, `?transferer=<id>`) — le
 * pendant, pour un TRANSFERT, de `nouveau-lien-vue.ts` pour un LIEN : servie
 * par le SERVEUR, elle marche ENTIÈRE sans JavaScript, sur le même patron
 * (voile, dialogue ouvert, poignée, croix — trois chemins de fermeture qui
 * rendent tous l'adresse NUE du fil).
 *
 * UN SEUL FORMULAIRE, PLUSIEURS BOUTONS — comme `menuDeLigne`
 * (`fil-lignes.ts`) et le pied de `/chats` : le message à transférer (son
 * IDENTIFIANT, son TEXTE, sa LANGUE d'origine — trois champs cachés, servis
 * UNE fois) ne se répète PAS par conversation cible. Un `<button
 * type="submit" name="vers" value="<id>">` par ligne suffit à nommer la
 * cible : le navigateur ne poste QUE le bouton cliqué, avec les champs
 * cachés du même formulaire. Une conversation cible par ligne aurait
 * multiplié le texte du message (jusqu'à 4000 caractères, `lib/api/fil.ts`)
 * par le nombre de conversations — un gaspillage que le budget de la v3
 * (`budgets.json`) n'admet pas.
 *
 * LE TEXTE ET LA LANGUE VOYAGENT EN CHAMPS CACHÉS, ET C'EST SÛR : ils sont
 * l'écho de ce que la porte a déjà SERVI (`resoutLeTransfert`, résolu contre
 * la tranche chargée), jamais une saisie libre — le même niveau de
 * confiance que `CHAMP_DE_L_ORIGINAL` du composeur en modification
 * (`fil-vue.ts`). La passerelle reste l'AUTORITÉ : `POST
 * /conversations/:id/messages` refuse de toute façon si le lecteur n'est
 * pas membre de la cible choisie.
 *
 * LE PRISME S'APPLIQUE À L'APERÇU DE CHAQUE CIBLE (critère de fin de
 * l'issue) — `apercuServi`/`apercuAuPrisme` (`lib/api/compte.ts`,
 * `app/connecte/vue.ts`), le site UNIQUE déjà partagé par `/chats` et le
 * tableau de bord : cette feuille en est une troisième vue, jamais une
 * quatrième descente.
 */

export const CHAMP_DU_TRANSFERT = 'transferer';
export const CHAMP_DE_LA_CIBLE_DU_TRANSFERT = 'vers';
export const CHAMP_DU_TEXTE_TRANSFERE = 'texte';
export const CHAMP_DE_LA_LANGUE_TRANSFEREE = 'langue';

const ligneDeCible = (conversation: Conversation, langues: readonly string[]): string =>
  '<li>' +
  `<button type="submit" name="${CHAMP_DE_LA_CIBLE_DU_TRANSFERT}" value="${echappe(conversation.id)}" aria-label="${echappe(FIL.transfererA(conversation.titre))}">` +
  avatar(conversation.titre) +
  '<span class="corps">' +
  `<span class="nom">${echappe(conversation.titre)}</span>` +
  apercuAuPrisme({ servi: apercuServi(conversation, langues), reserve: false }) +
  '</span>' +
  '</button>' +
  '</li>';

export const feuilleDeTransfert = ({
  message,
  conversations,
  langues,
  motif,
  retour,
  action,
}: {
  readonly message: Message;
  readonly conversations: readonly Conversation[];
  readonly langues: readonly string[];
  /** Le refus déjà servi par la passerelle, rendu TEL QUEL — `null` au premier chargement. */
  readonly motif: string | null;
  /** Où mènent la croix, le voile et la poignée — et ce que `data-retour` porte pour le module qui élève la feuille. */
  readonly retour: string;
  /** L'adresse du formulaire — celle du fil source, jamais celle de la cible. */
  readonly action: string;
}): string =>
  `<a class="voile" href="${echappe(retour)}" aria-label="${echappe(FIL.fermer)}"></a>` +
  `<dialog class="transfert" open aria-modal="true" aria-labelledby="titre-du-transfert" data-retour="${echappe(retour)}">` +
  `<a class="poignee" href="${echappe(retour)}" aria-label="${echappe(FIL.fermer)}"></a>` +
  '<div class="tete">' +
  `<h2 id="titre-du-transfert">${echappe(FIL.transfererLeMessage)}</h2>` +
  `<a class="fermer" href="${echappe(retour)}" aria-label="${echappe(FIL.fermer)}">${svgDuSprite('ph-x')}</a>` +
  '</div>' +
  (motif === null ? '' : `<p class="alerte" role="alert">${echappe(motif)}</p>`) +
  (conversations.length === 0
    ? `<p class="vide">${echappe(FIL.aucuneAutreConversation)}</p>`
    : `<form method="post" action="${echappe(action)}">` +
      `<input type="hidden" name="${CHAMP_DU_TRANSFERT}" value="${echappe(message.id)}"/>` +
      `<input type="hidden" name="${CHAMP_DU_TEXTE_TRANSFERE}" value="${echappe(message.texteOriginal)}"/>` +
      (message.langueOriginale === null
        ? ''
        : `<input type="hidden" name="${CHAMP_DE_LA_LANGUE_TRANSFEREE}" value="${echappe(message.langueOriginale)}"/>`) +
      `<ul class="cibles">${conversations.map((conversation) => ligneDeCible(conversation, langues)).join('')}</ul>` +
      '</form>') +
  '</dialog>';
