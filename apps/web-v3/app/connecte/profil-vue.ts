import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { adresseDuProfil, PARAM_DU_PROFIL } from '@/lib/api/adresses-du-fil';
import type { ProfilServi, Relation } from '@/lib/api/profil';
import { ADRESSE_DE_MON_COMPTE } from '@/lib/contenu/espace';
import { PROFIL } from '@/lib/contenu/profil';

import { avatar as avatarDuNom } from './vue';

/**
 * LE PROFIL D'UN PARTICIPANT — une surimpression, ÉTAT de l'écran hôte
 * (`?profil=<handle>`), rendue par CE module et LUI SEUL aux trois adresses
 * du fil et de la liste (conception § 12.10.3 point 2). Ouvrir pose le
 * paramètre, fermer rend l'adresse de l'hôte : trois `<a href>` s'en chargent
 * (la croix, le voile, la poignée) — sans un octet de JavaScript. Avec
 * JavaScript, `lib/realtime/plein-ecran.ts` élève le `<dialog open
 * data-retour>` servi en `showModal()` (Échap, piège à focus) — LA MÊME
 * fonction que le plein écran d'un média, généralisée à tout `[data-retour]`
 * : ce n'est pas un octet de script de plus (§ 12.10.6).
 *
 * `--color-surface-raised` est un second emploi assumé de la règle 9 de la
 * charte (« = la feuille modale, et rien d'autre » devient « et le panneau de
 * profil ») : les deux flottent au-dessus du contenu sur le MÊME plan.
 *
 * CE QUE CE MODULE NE LIT NI NE FABRIQUE JAMAIS (§ 12.10.3 point 4) : une
 * langue du PROFIL (`publicProfileSchema` n'en porte aucune depuis #4161 — la
 * ligne de langue vient du FIL, `langueDeLAuteurDansLeFil`) ; une présence
 * hors de ce que la charge sert (elle n'en sert jamais, ce module ne demande
 * pas `expand=presence`).
 */

export { adresseDuProfil, PARAM_DU_PROFIL };

export const PARAM_DE_CONFIRMATION = 'confirmer';
export const VALEUR_DE_CONFIRMATION = 'bloquer';

/** Le champ du formulaire qui nomme l'action — lu par `app/connecte/profil-porte.ts`, écrit ici. */
export const CHAMP_ACTION_PROFIL = 'action-profil';
export const CHAMP_CIBLE_PROFIL = 'cible-profil';

export type ActionDeProfil = 'ecrire' | 'ami' | 'bloquer';

/**
 * CE QUE L'HÔTE (fil ou liste) PORTE POUR RENDRE LA SURIMPRESSION — le TYPE
 * PARTAGÉ des trois hôtes, ici pour être un site UNIQUE : `app/connecte/
 * profil-porte.ts` le PRODUIT (`chargeLeProfilSiDemande`), `fil-vue.ts` et
 * `liste-vue.ts` le CONSOMMENT (`EtatDuFil.profil`, `EtatDesChats.profil`).
 */
export type ProfilDeLaSurimpression = {
  /** L'identifiant demandé — `Message.auteurId` ou `Conversation.homologue`, un `User.id` (§ 12.10.3 point 4). */
  readonly handle: string;
  readonly servi: ProfilServi;
  /** `?confirmer=bloquer` — le sous-état de confirmation du blocage, à la MÊME adresse. */
  readonly confirmerBlocage: boolean;
};

/** `?profil=<handle>` — lu par les TROIS portes. */
export const demandeDeProfil = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DU_PROFIL);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/** `?confirmer=bloquer` — le sous-état de confirmation, à l'intérieur du MÊME panneau. */
export const confirmationDemandee = (requete: Request): boolean =>
  new URL(requete.url).searchParams.get(PARAM_DE_CONFIRMATION) === VALEUR_DE_CONFIRMATION;

/** Le sous-état de confirmation d'un blocage, à la MÊME adresse. */
export const adresseDeConfirmation = (adresseHote: string, handle: string): string =>
  `${adresseDuProfil(adresseHote, handle)}&${PARAM_DE_CONFIRMATION}=${VALEUR_DE_CONFIRMATION}`;

const nomDeLangue = (code: string): string => {
  const info = getLanguageInfo(code);
  return info.nativeName ?? info.name;
};

/** « mars 2024 » — dans la langue du DOCUMENT (le Prisme sert tout dans la langue du lecteur, ici comme ailleurs). */
const moisEtAnnee = (iso: string, langueDuDocument: string): string | null => {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return null;
  return new Intl.DateTimeFormat(langueDuDocument, { month: 'long', year: 'numeric' }).format(instant);
};

const BADGE_PAR_RELATION: Readonly<Record<Relation, string>> = {
  none: PROFIL.pasEncoreAmis,
  friend: PROFIL.ami,
  pending_sent: PROFIL.demandeEnvoyee,
  pending_received: PROFIL.demandeRecue,
  self: '',
};

const badge = (relation: Relation): string =>
  relation === 'self' ? '' : `<p class="relation" data-relation="${relation}">${echappe(BADGE_PAR_RELATION[relation])}</p>`;

const ligne = (glyphe: string, titre: string, sous: string): string =>
  '<li>' +
  `<span class="glyphe" aria-hidden="true">${svgDuSprite(glyphe)}</span>` +
  `<div><b>${echappe(titre)}</b><p>${echappe(sous)}</p></div>` +
  '</li>';

/**
 * LES TROIS LIGNES D'INFORMATION — chacune SEULEMENT si elle a quelque chose
 * à dire, jamais une ligne vide (charte règle 7) :
 *
 *   • la LANGUE, tirée du FIL qui a servi la surimpression — jamais du profil ;
 *   • « membre depuis », depuis `createdAt`, quand la passerelle le sert ;
 *   • la conversation EN COMMUN, connue localement par l'hôte qui a ouvert le
 *     panneau (le fil qu'on lit, ou la ligne de `/chats` dont l'avatar a été
 *     touché) — jamais une donnée que la route du profil ne sert pas.
 *
 * DEUX DE CES TROIS PARLENT DE L'AUTRE. « Écrit en Español dans ce fil » et
 * « Participe à Équipe Lagos » se disent d'un tiers ; sur SOI, l'appelant les
 * passe à `null` (#5030) — on ne se présente pas à soi-même la conversation
 * qu'on est en train de lire. « Membre depuis » reste : c'est un fait de
 * compte, vrai dans les deux sens.
 */
const informations = ({
  langue,
  membreDepuis,
  conversationEnCommun,
  langueDuDocument,
}: {
  readonly langue: string | null;
  readonly membreDepuis: string | null;
  readonly conversationEnCommun: string | null;
  readonly langueDuDocument: string;
}): string => {
  const date = membreDepuis === null ? null : moisEtAnnee(membreDepuis, langueDuDocument);
  const lignes = [
    langue === null ? '' : ligne('ph-translate', PROFIL.ecritDansCeFil(nomDeLangue(langue)), PROFIL.lecteurPrisme(nomDeLangue(langue))),
    date === null ? '' : ligne('ph-clock', PROFIL.membreDepuis(date), PROFIL.membreDuCompte),
    conversationEnCommun === null
      ? ''
      : ligne('ph-chats-circle', PROFIL.participeA(conversationEnCommun), PROFIL.conversationEnCommun),
  ]
    .filter((item) => item !== '')
    .join('');
  return lignes === '' ? '' : `<ul class="infos">${lignes}</ul>`;
};

const formulaireDAction = ({
  adresseHote,
  handle,
  action,
  classe,
  glyphe,
  libelle,
  href,
}: {
  readonly adresseHote: string;
  readonly handle: string;
  readonly action: ActionDeProfil;
  readonly classe: string;
  readonly glyphe: string;
  readonly libelle: string;
  /** Un LIEN plutôt qu'un formulaire, pour l'action « bloquer » — elle ouvre la confirmation, elle n'agit pas encore. */
  readonly href?: string;
}): string =>
  href !== undefined
    ? `<a class="action ${classe}" href="${echappe(href)}">${svgDuSprite(glyphe)}${echappe(libelle)}</a>`
    : `<form method="post" action="${echappe(adresseHote)}">` +
      `<input type="hidden" name="${CHAMP_ACTION_PROFIL}" value="${action}"/>` +
      `<input type="hidden" name="${CHAMP_CIBLE_PROFIL}" value="${echappe(handle)}"/>` +
      `<button type="submit" class="action ${classe}">${svgDuSprite(glyphe)}${echappe(libelle)}</button>` +
      '</form>';

/**
 * LES TROIS ACTIONS D'AUTRUI — RENDUES SEULEMENT à un lecteur qui tient un
 * compte (`peutAgir`) : la garde du § 12.10.3 point 5, « un contrôle qui
 * rendrait 401 est un contrôle sans effet ». Soi-même n'entre PLUS ici du
 * tout : la branche `estSoi` appelle `actionDeMonCompte`, qui rend l'action
 * qui a un sens sur soi (#5030) — c'est le SITE D'APPEL qui sépare les deux
 * mondes, plus un drapeau passé à une fonction qui les mélangeait.
 * `relation` décide du VERBE d'amitié : déjà ami ou demande en cours, le
 * bouton disparaît — le rendre ferait un contrôle qui répète ce que le badge
 * dit déjà, sans effet nouveau.
 */
const actions = ({
  adresseHote,
  handle,
  prenom,
  relation,
  peutAgir,
}: {
  readonly adresseHote: string;
  readonly handle: string;
  readonly prenom: string;
  readonly relation: Relation;
  readonly peutAgir: boolean;
}): string => {
  if (!peutAgir) return '';
  const ami =
    relation === 'none'
      ? formulaireDAction({ adresseHote, handle, action: 'ami', classe: 'contour', glyphe: 'ph-user-plus', libelle: PROFIL.ajouterEnAmi })
      : '';
  return (
    '<div class="actions-profil">' +
    formulaireDAction({ adresseHote, handle, action: 'ecrire', classe: 'primaire', glyphe: 'ph-chat-circle', libelle: PROFIL.ecrire(prenom) }) +
    ami +
    formulaireDAction({
      adresseHote,
      handle,
      action: 'bloquer',
      classe: 'discrete grave',
      glyphe: 'ph-shield',
      libelle: PROFIL.bloquerOuSignaler,
      href: adresseDeConfirmation(adresseHote, handle),
    }) +
    '</div>'
  );
};

/**
 * L'ACTION DE SOI — UNE seule, « Mon compte », et seulement à un lecteur qui
 * TIENT un compte (#5030). Les trois actions d'autrui n'ont aucun sens sur
 * soi (s'écrire, s'ajouter en ami, se bloquer) ; la branche « c'est vous »
 * n'était pourtant qu'un badge, donc un écran SANS issue — la charte règle 7
 * dans son autre sens : un état qui ne mène nulle part.
 *
 * `peutAgir` la garde comme il garde les trois autres, et pour la MÊME
 * raison : `ADRESSE_DE_MON_COMPTE` pointe une route de MEMBRE — servie à un
 * invité anonyme, elle rendrait une redirection vers `/login`, donc un
 * contrôle sans effet. Un invité qui touche son propre nom voit « C'est
 * vous », et rien de plus : il n'a pas de compte à ouvrir.
 *
 * La DESTINATION est LUE (`ADRESSE_DE_MON_COMPTE`, `lib/contenu/espace.ts`),
 * jamais écrite : l'espace membre y mène déjà par sa première rangée, et deux
 * littéraux jumeaux dériveraient le jour où la route déménage.
 */
const actionDeMonCompte = (peutAgir: boolean): string =>
  peutAgir
    ? '<div class="actions-profil">' +
      `<a class="action primaire" href="${echappe(ADRESSE_DE_MON_COMPTE)}">${svgDuSprite('ph-user-circle')}${echappe(PROFIL.monCompte)}</a>` +
      '</div>'
    : '';

/**
 * L'EN-TÊTE — la poignée (pleine largeur, TROISIÈME chemin de fermeture avec
 * la croix et le voile), puis une rangée qui porte ce que `milieu` donne (rien
 * pour un message simple, l'identité pour un profil chargé) et la croix, TOUJOURS
 * à droite.
 */
const enTete = (adresseFermer: string, avecPoignee: boolean, milieu = ''): string =>
  (avecPoignee ? `<a class="poignee" href="${echappe(adresseFermer)}" aria-label="${echappe(PROFIL.fermer)}"></a>` : '') +
  '<div class="tete">' +
  milieu +
  `<a class="fermer" href="${echappe(adresseFermer)}" aria-label="${echappe(PROFIL.fermer)}">${svgDuSprite('ph-x')}</a>` +
  '</div>';

const identite = (nom: string, pseudonyme: string | null): string =>
  '<div class="identite">' +
  avatarDuNom(nom) +
  `<div><h2 id="titre-du-profil">${echappe(nom)}</h2>` +
  (pseudonyme === null ? '' : `<p class="pseudo">@${echappe(pseudonyme)}</p>`) +
  '</div></div>';

/**
 * LA CONFIRMATION D'UN BLOCAGE (`?confirmer=bloquer`) — le seul geste des
 * trois qui n'a pas d'effet immédiat : bloquer se demande deux fois, SANS
 * `confirm()` de JavaScript (interdit, § 12.10.6) — un second état de la MÊME
 * adresse, comme la vue `rights` du fil. « Annuler » est un `<a href>` vers le
 * panneau sans confirmation ; « Confirmer » poste réellement le blocage.
 */
const confirmationDeBlocage = ({ adresseHote, handle, nom }: { readonly adresseHote: string; readonly handle: string; readonly nom: string }): string =>
  '<div class="confirmation" role="alertdialog" aria-labelledby="titre-du-profil">' +
  `<p class="question">${echappe(PROFIL.confirmerLeBlocage(nom))}</p>` +
  `<p class="precision">${echappe(PROFIL.confirmerLeBlocagePrecision)}</p>` +
  `<form method="post" action="${echappe(adresseHote)}">` +
  `<input type="hidden" name="${CHAMP_ACTION_PROFIL}" value="bloquer"/>` +
  `<input type="hidden" name="${CHAMP_CIBLE_PROFIL}" value="${echappe(handle)}"/>` +
  `<button type="submit" class="action primaire grave">${echappe(PROFIL.confirmer)}</button>` +
  '</form>' +
  `<a class="action discrete" href="${echappe(adresseDuProfil(adresseHote, handle))}">${echappe(PROFIL.annuler)}</a>` +
  '</div>';

/** Le corps d'un genre qui n'a rien à montrer que sa phrase — introuvable, panne, limite. */
const messageSimple = (glyphe: string, titre: string, precision: string): string =>
  `<div class="message">${svgDuSprite(glyphe)}<h2 id="titre-du-profil">${echappe(titre)}</h2><p>${echappe(precision)}</p></div>`;

export const surimpressionDuProfil = ({
  servi,
  handle,
  adresseHote,
  langue,
  conversationEnCommun,
  confirmerBlocage,
  peutAgir,
  langueDuDocument,
}: {
  readonly servi: ProfilServi;
  readonly handle: string;
  readonly adresseHote: string;
  /** La langue de CE participant, telle que le fil la connaît — `null` quand le fil n'en sait rien (`langueDeLAuteurDansLeFil`). */
  readonly langue: string | null;
  /** Le titre de la conversation partagée, connu LOCALEMENT par l'hôte — jamais par la route du profil. */
  readonly conversationEnCommun: string | null;
  readonly confirmerBlocage: boolean;
  /** La langue du DOCUMENT — pour composer « mars 2024 » comme `lib/temps.ts` compose le reste (Prisme). */
  readonly langueDuDocument: string;
  /**
   * VRAI seulement pour un lecteur qui tient un jeton de MEMBRE — jamais
   * dérivé de `relation` : un invité anonyme a `relation:'none'` comme un
   * inconnu, et les trois routes d'action exigent toutes un compte
   * (`fastify.authenticate` / `authContext.registeredUser`). Un contrôle qui
   * rendrait 401 est un contrôle sans effet (§ 12.10.3 point 5).
   */
  readonly peutAgir: boolean;
}): string => {
  const retourDuConfirme = adresseDuProfil(adresseHote, handle);
  const enConfirmation = confirmerBlocage && servi.genre === 'profil' && peutAgir && !servi.estSoi;
  const retour = enConfirmation ? retourDuConfirme : adresseHote;

  let corps: string;
  if (servi.genre === 'introuvable') {
    corps = enTete(adresseHote, false) + messageSimple('ph-user-circle', PROFIL.introuvable, PROFIL.introuvablePrecision);
  } else if (servi.genre === 'limite') {
    corps = enTete(adresseHote, false) + messageSimple('ph-clock-counter-clockwise', PROFIL.limiteTitre, servi.message || PROFIL.panne);
  } else if (servi.genre === 'panne') {
    corps = enTete(adresseHote, false) + messageSimple('ph-warning-circle', PROFIL.panneTitre, PROFIL.panne);
  } else {
    const { profil, relation, estSoi } = servi;
    const sousLeTete = enConfirmation
      ? confirmationDeBlocage({ adresseHote, handle, nom: profil.nom })
      : (estSoi ? `<p class="relation" data-relation="self">${echappe(PROFIL.cEstVous)}</p>` : badge(relation)) +
        (profil.bio === null ? '' : `<p class="bio">${echappe(profil.bio)}</p>`) +
        informations({
          langue: estSoi ? null : langue,
          membreDepuis: profil.membreDepuis,
          conversationEnCommun: estSoi ? null : conversationEnCommun,
          langueDuDocument,
        }) +
        (estSoi
          ? actionDeMonCompte(peutAgir)
          : actions({
              adresseHote,
              handle,
              prenom: profil.nom.split(/\s+/)[0] ?? profil.nom,
              relation,
              peutAgir,
            }));
    corps = enTete(enConfirmation ? retourDuConfirme : adresseHote, !enConfirmation, identite(profil.nom, profil.pseudonyme)) + sousLeTete;
  }

  return (
    `<a class="voile" href="${echappe(retour)}" aria-label="${echappe(PROFIL.fermer)}"></a>` +
    `<dialog class="profil" id="profil" open aria-modal="true" aria-labelledby="titre-du-profil" data-retour="${echappe(retour)}">` +
    corps +
    '</dialog>'
  );
};
