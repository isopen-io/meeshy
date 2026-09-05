import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { NOUVEAU_LIEN, type Echeance } from '@/lib/contenu/liens';

/**
 * LA FEUILLE « NOUVEAU LIEN DE PARTAGE » — AGNOSTIQUE DE SON HÔTE (#5034,
 * suite de #5071). Elle avait UN hôte (`/links`, `liens-vue.ts`) et écrivait
 * `/links` en dur sur ses trois chemins de fermeture, l'action implicite du
 * formulaire et le champ `conversation` en saisie libre — la même raison qui
 * a fait sortir `pleinEcran()` de `fil-vue.ts` vers `plein-vue.ts` : une
 * feuille à un seul hôte devient, au second, soit une jumelle recopiée, soit
 * ce module.
 *
 * LE SECOND HÔTE EST LE FIL DU MEMBRE (`/chats/:cle?lien`) : la conversation y
 * est déjà OUVERTE, donc déjà connue — le champ ne se saisit plus, il se
 * VERROUILLE (`conversationVerrouillee`), et le formulaire vise l'adresse du
 * fil plutôt que l'adresse courante implicite (`action`), portant un champ
 * caché de plus pour que sa porte le reconnaisse (`marqueur`).
 *
 * CE QUI RESTE COMMUN AUX DEUX HÔTES, ET C'EST L'ESSENTIEL DE CE MODULE :
 * les cinq droits anonymes, l'échéance en radios, la capacité, le nom du
 * lien, le refus rendu tel quel, la voix muette de la feuille — rien de tout
 * cela ne change d'un hôte à l'autre, et un champ ajouté ici (ou retiré, comme
 * `allowedCountries`) profite aux deux sans qu'un second site n'ait à suivre.
 */

export const CHAMPS_DU_NOUVEAU_LIEN = {
  conversation: 'conversation',
  nom: 'nom',
  echeance: 'echeance',
  capacite: 'capacite',
} as const;

/**
 * LES CINQ PERMISSIONS, ET LEUR CHAMP DE `createLinkSchema`. La clé est le nom
 * du champ côté PASSERELLE : le formulaire n'a pas de vocabulaire à lui, donc
 * personne n'a de table de correspondance à tenir à jour.
 */
export const PERMISSIONS_DU_LIEN = [
  { champ: 'allowAnonymousMessages', libelle: NOUVEAU_LIEN.ecrire, parDefaut: true },
  { champ: 'allowAnonymousImages', libelle: NOUVEAU_LIEN.images, parDefaut: true },
  { champ: 'allowAnonymousFiles', libelle: NOUVEAU_LIEN.fichiers, parDefaut: false },
  { champ: 'allowViewHistory', libelle: NOUVEAU_LIEN.historique, parDefaut: false },
  { champ: 'requireNickname', libelle: NOUVEAU_LIEN.pseudonyme, parDefaut: true },
] as const;

/**
 * CE QUE LE FORMULAIRE REPOSE APRÈS UN REFUS. Perdre le nom d'une conversation
 * et six cases cochées parce qu'un champ a déplu est le défaut le plus cher
 * d'un formulaire — et il ne se voit qu'en refus, c'est-à-dire au pire moment.
 */
export type SaisieDuLien = {
  readonly conversation: string;
  readonly nom: string;
  readonly echeance: Echeance;
  readonly capacite: string;
  readonly permissions: ReadonlySet<string>;
};

export const SAISIE_NEUVE: SaisieDuLien = {
  conversation: '',
  nom: '',
  echeance: 'semaine',
  capacite: '',
  permissions: new Set(PERMISSIONS_DU_LIEN.filter(({ parDefaut }) => parDefaut).map(({ champ }) => champ)),
};

/**
 * LA SAISIE PAR DÉFAUT DEPUIS LE FIL (#5034, § 9 Q8 de la spécification) —
 * la conversation est déjà celle qu'on lit, verrouillée ; le nom du lien se
 * PRÉREMPLIT du titre de la conversation, pour que créer un lien pour la
 * conversation qu'on lit ne demande qu'un choix d'échéance (≤ 2 gestes).
 */
export const saisieDuFil = (conversation: string, nom: string): SaisieDuLien => ({
  ...SAISIE_NEUVE,
  conversation,
  nom,
});

/**
 * LA FEUILLE — servie par le SERVEUR, dans l'état d'adresse que chaque hôte
 * nomme à sa façon (`/links?nouveau`, `/chats/:cle?lien`).
 *
 * ELLE MARCHE ENTIÈRE SANS JAVASCRIPT, sur les deux hôtes. Trois chemins la
 * ferment, chacun un `<a href="${retour}">` : la croix, le voile, la poignée
 * — et `data-retour` porte la même adresse, pour le module qui élève tout
 * `dialog[open][data-retour]` en modale (`lib/realtime/plein-ecran.ts`),
 * gratuitement, sur les DEUX hôtes qui en servent un.
 *
 * LE CHAMP « CONVERSATION » A DEUX FORMES, JAMAIS TROIS. Éditable (`/links` :
 * aucune conversation n'est encore choisie, le lecteur la NOMME) ou
 * VERROUILLÉ (le fil : la conversation est celle qu'on lit, un `<input
 * type="hidden">` suffit à la faire voyager jusqu'à la porte — sans `id`,
 * donc sans ligne visible : rien à corriger sur un champ que le lecteur n'a
 * pas rempli).
 *
 * LE CRITÈRE DE FIN INTERDIT LE CHAMP DÉCORATIF, sur les deux hôtes : chaque
 * case et chaque champ recouvre un champ de `createLinkSchema` que la
 * passerelle APPLIQUE. `allowedCountries` en est absent — le schéma le
 * déclare `CHAMP_PAYS_INERTE`.
 */
export const nouveauLien = ({
  saisie,
  motif,
  retour,
  action,
  sousTitre,
  marqueur,
  conversationVerrouillee = false,
}: {
  readonly saisie: SaisieDuLien;
  readonly motif: string | null;
  /** Où mènent la croix, le voile et la poignée — et ce que `data-retour` porte pour le module qui élève la feuille. */
  readonly retour: string;
  /** L'adresse du formulaire — explicite quand elle diffère de l'adresse courante (le fil) ; omise pour garder le comportement historique (`/links`, qui poste à l'adresse courante). */
  readonly action?: string;
  /** Le sous-titre — seul le fil en sert un (« Pour « … » · conversation déjà ouverte »). */
  readonly sousTitre?: string;
  /** Le champ caché qui marque cette feuille pour SA porte — `/links` n'en a pas besoin, l'absence de `geste` suffisant déjà à la distinguer de la fermeture d'un lien. */
  readonly marqueur?: string;
  /** La conversation est-elle déjà choisie (le fil) ou reste-t-elle à nommer (`/links`) ? */
  readonly conversationVerrouillee?: boolean;
}): string => {
  const coche = (champ: string, libelle: string): string =>
    `<label class="coche"><input type="checkbox" name="${champ}" value="1"${saisie.permissions.has(champ) ? ' checked' : ''}>${echappe(libelle)}</label>`;

  const echeance = (valeur: Echeance, libelle: string): string =>
    `<label class="coche"><input type="radio" name="${CHAMPS_DU_NOUVEAU_LIEN.echeance}" value="${valeur}"${saisie.echeance === valeur ? ' checked' : ''}>${echappe(libelle)}</label>`;

  const champConversation = conversationVerrouillee
    ? `<input type="hidden" name="${CHAMPS_DU_NOUVEAU_LIEN.conversation}" value="${echappe(saisie.conversation)}">`
    : '<p class="champ">' +
      `<label for="l-conversation">${echappe(NOUVEAU_LIEN.conversation)}</label>` +
      `<input id="l-conversation" name="${CHAMPS_DU_NOUVEAU_LIEN.conversation}" type="text" required value="${echappe(saisie.conversation)}" autocomplete="off">` +
      `<span class="aide">${echappe(NOUVEAU_LIEN.conversationAide)}</span>` +
      '</p>';

  return (
    `<a class="voile" href="${echappe(retour)}" aria-label="${echappe(NOUVEAU_LIEN.fermer)}"></a>` +
    `<dialog class="nouveau-lien" open aria-modal="true" aria-labelledby="titre-du-lien" data-retour="${echappe(retour)}">` +
    `<a class="poignee" href="${echappe(retour)}" aria-label="${echappe(NOUVEAU_LIEN.fermer)}"></a>` +
    '<div class="tete">' +
    '<div class="dit">' +
    `<h2 id="titre-du-lien">${echappe(NOUVEAU_LIEN.titre)}</h2>` +
    (sousTitre === undefined ? '' : `<p class="sous">${echappe(sousTitre)}</p>`) +
    '</div>' +
    `<a class="fermer" href="${echappe(retour)}" aria-label="${echappe(NOUVEAU_LIEN.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</div>' +
    (motif === null
      ? ''
      : `<p class="alerte" role="alert">${echappe(motif === '' ? NOUVEAU_LIEN.refuse : `${NOUVEAU_LIEN.refuse} ${motif}`)}</p>`) +
    `<form method="post"${action === undefined ? '' : ` action="${echappe(action)}"`}>` +
    // LA VOIX DE LA FEUILLE — servie muette : le module y dit une passerelle
    // injoignable SANS toucher aux champs (une région créée après coup n'est
    // annoncée par aucun lecteur d'écran).
    '<p class="avis-feuille" role="status" hidden></p>' +
    (marqueur === undefined ? '' : `<input type="hidden" name="${echappe(marqueur)}" value="1">`) +
    champConversation +
    '<p class="champ">' +
    `<label for="l-nom">${echappe(NOUVEAU_LIEN.nom)}</label>` +
    `<input id="l-nom" name="${CHAMPS_DU_NOUVEAU_LIEN.nom}" type="text" value="${echappe(saisie.nom)}" autocomplete="off">` +
    `<span class="aide">${echappe(NOUVEAU_LIEN.nomAide)}</span>` +
    '</p>' +
    '<fieldset class="groupe">' +
    `<legend>${echappe(NOUVEAU_LIEN.expiration)}</legend>` +
    echeance('jour', NOUVEAU_LIEN.jour) +
    echeance('semaine', NOUVEAU_LIEN.semaine) +
    echeance('jamais', NOUVEAU_LIEN.jamais) +
    '</fieldset>' +
    '<p class="champ">' +
    `<label for="l-capacite">${echappe(NOUVEAU_LIEN.capacite)}</label>` +
    `<input id="l-capacite" name="${CHAMPS_DU_NOUVEAU_LIEN.capacite}" type="number" min="1" inputmode="numeric" value="${echappe(saisie.capacite)}">` +
    `<span class="aide">${echappe(NOUVEAU_LIEN.capaciteAide)}</span>` +
    '</p>' +
    '<fieldset class="groupe">' +
    `<legend>${echappe(NOUVEAU_LIEN.anonymes)}</legend>` +
    PERMISSIONS_DU_LIEN.map(({ champ, libelle }) => coche(champ, libelle)).join('') +
    '</fieldset>' +
    `<p class="pied"><button type="submit" class="action primaire">${echappe(NOUVEAU_LIEN.creer)}</button></p>` +
    '</form>' +
    '</dialog>'
  );
};
