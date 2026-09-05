import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

import type { Communaute, ConversationDeCommunaute } from '@/lib/api/communautes';
import { teinteDeLAvatar } from '@/lib/avatar';
import { COMMUNAUTES, metaDeLaCommunaute } from '@/lib/contenu/communautes';
import { compteDeParticipants, enUneLigne } from '@/lib/contenu/fil';
import { quand } from '@/lib/temps';

import { FEUILLE_DES_COMMUNAUTES } from './communautes-feuille';
import { actionsFlottantes, feuilleDeLEspace } from './espace-vue';
import { FEUILLE_DES_FLOTTANTES, FEUILLE_DE_L_ESPACE } from './espace-feuille';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { carteVide } from './vue';

/**
 * `/communities` — LES COMMUNAUTÉS DU LECTEUR (`cible/communities.png`,
 * matrice `#communities`, ordre 45).
 *
 * UN ÉCRAN DE CONSULTATION, PLUS UN GESTE DE CRÉATION — SANS UNE LIGNE DE
 * JAVASCRIPT. Ni module de participation ni socket : aucun `community:*`
 * n'existe (`packages/shared/types/socketio-events.ts`), et le temps réel de
 * la v3 est réservé aux surfaces de PARTICIPATION (fil, liste), jamais à un
 * carnet. `documentPleinEcran` est appelé ici sans AUCUN `script` — la même
 * construction que `/calls` et `/links`.
 *
 * LA LISTE EST ENTIÈREMENT SERVIE, DONC AUCUN ÉTAT DE CHARGEMENT N'EXISTE. Le
 * document qui part porte déjà les lignes : pas de spinner, pas de squelette.
 *
 * CHAQUE LIGNE OUVRE UNE SURIMPRESSION (`?ouverte=<id>`, Q2), jamais une route
 * `communities/[id]` — la matrice n'en déclare aucune. La surimpression liste
 * les conversations de la communauté, chacune un `<a href="/chats/:id">`.
 *
 * AUCUNE PRÉSENCE. `lib/api/communautes.ts` ne projette ni `members`, ni
 * `creator.isOnline`, ni `participants[]` — ce module ne les reçoit donc
 * jamais et ne peut pas les peindre par distraction (directive 2026-08-25).
 *
 * LES DEUX RONDS DE L'ESPACE MEMBRE (Q7) — la cible de CET écran les dessine,
 * contrairement à ses voisins `/calls`/`/contacts`/`/notifications` : ils
 * restent donc EFFECTIFS ici (`?espace`, la feuille de l'espace membre), pas
 * seulement peints. Sans `/auth/me` sur cette porte (même raison que
 * `/calls` : rien à classer par l'identité), la feuille reçoit `lecteur:
 * null` — le repli déjà établi (`nomDeLEspace(null)` → `ESPACE.sansNom`,
 * `liste-vue.ts` l'emploie de la même façon en repli).
 */

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(COMMUNAUTES.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(COMMUNAUTES.titre)}</h1>` +
  `<p class="sous">${echappe(COMMUNAUTES.sous)}</p>` +
  '</div>' +
  `<a class="action discrete" href="/communities?nouvelle">${svgDuSprite('ph-plus')}${echappe(COMMUNAUTES.creer)}</a>` +
  '</header>';

const ligne = (c: Communaute): string =>
  '<li class="communaute">' +
  `<a href="/communities?ouverte=${echappe(encodeURIComponent(c.id))}">` +
  `<span class="tuile ${teinteDeLAvatar(c.nom)}" aria-hidden="true">${svgDuSprite('ph-users-three')}</span>` +
  '<span class="dit">' +
  `<strong class="nom">${echappe(c.nom)}</strong>` +
  `<span class="meta">${echappe(metaDeLaCommunaute(c))}</span>` +
  '</span>' +
  `<span class="chevron" aria-hidden="true">${svgDuSprite('ph-caret-right')}</span>` +
  '</a>' +
  '</li>';

const plus = (suite: number | null): string =>
  suite === null
    ? ''
    : `<a class="plus action discrete" href="/communities?offset=${suite}">${echappe(COMMUNAUTES.plus)}</a>`;

const corps = (etat: EtatDesCommunautes): string =>
  '<main id="main-content" class="communautes-ecran">' +
  enTete() +
  (etat.communautes.length === 0
    ? carteVide({ glyphe: 'ph-users-three', titre: COMMUNAUTES.vide, phrase: COMMUNAUTES.videPrecision })
    : `<ul class="communautes" aria-label="${echappe(COMMUNAUTES.liste)}">${etat.communautes
        .map(ligne)
        .join('')}</ul>${plus(etat.suite)}`) +
  actionsFlottantes('/communities') +
  '</main>';

/**
 * CE QUE `?ouverte=<id>` REND — nom et confidentialité proviennent de la
 * LISTE déjà chargée (T5 : `?ouverte=` ne coûte qu'UN appel de plus, jamais
 * un troisième pour le nom de la communauté), `conversations` de
 * `GET /communities/:id/conversations` (§ 2.2). Sur un refus/introuvable, ni
 * l'un ni l'autre n'est nécessaire : la communauté n'est de toute façon pas
 * sur la page du lecteur dans ces deux cas (`GET /communities` ne sert que
 * les communautés dont il est créateur ou membre).
 */
export type Ouverte =
  | { readonly genre: 'ouverte'; readonly nom: string; readonly conversations: readonly ConversationDeCommunaute[] }
  | { readonly genre: 'refus' }
  | { readonly genre: 'introuvable' };

const conversationLigne = (conv: ConversationDeCommunaute, maintenant: number): string =>
  '<li>' +
  `<a href="/chats/${echappe(encodeURIComponent(conv.id))}">` +
  `<span class="nom">${echappe(conv.titre)}</span>` +
  `<span class="meta">${echappe(
    enUneLigne([
      compteDeParticipants({ membres: conv.participants, mot: COMMUNAUTES.participants }),
      quand(conv.dernierMessageA, maintenant),
    ]),
  )}</span>` +
  '</a>' +
  '</li>';

const communauteOuverte = ({ ouverte, maintenant }: { readonly ouverte: Ouverte; readonly maintenant: number }): string => {
  const titre = ouverte.genre === 'ouverte' ? ouverte.nom : COMMUNAUTES.titre;

  const dedans =
    ouverte.genre === 'refus'
      ? `<p class="alerte" role="alert">${echappe(COMMUNAUTES.refusPrivee)}</p>`
      : ouverte.genre === 'introuvable'
        ? `<p class="alerte" role="alert">${echappe(COMMUNAUTES.introuvable)}</p>`
        : ouverte.conversations.length === 0
          ? carteVide({
              glyphe: 'ph-chats-circle',
              titre: COMMUNAUTES.videConversations,
              phrase: COMMUNAUTES.videConversationsPrecision,
            })
          : `<ul>${ouverte.conversations.map((c) => conversationLigne(c, maintenant)).join('')}</ul>`;

  return (
    `<a class="voile" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}"></a>` +
    '<dialog class="communaute-ouverte" open aria-modal="true" aria-labelledby="titre-de-la-communaute" ' +
    'data-retour="/communities">' +
    `<a class="poignee" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}"></a>` +
    '<div class="tete">' +
    `<div class="dit"><h2 id="titre-de-la-communaute">${echappe(titre)}</h2></div>` +
    `<a class="fermer" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</div>' +
    dedans +
    '</dialog>'
  );
};

/** `POST /communities` (Q4) — trois champs, `identifier` absent (auto-généré serveur). */
export const CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE = {
  nom: 'nom',
  description: 'description',
  prive: 'prive',
} as const;

export type SaisieDeCommunaute = {
  readonly nom: string;
  readonly description: string;
  readonly prive: boolean;
};

/** `isPrivate` DÉFAUT `true` côté passerelle (§ 2.3) — la case part cochée. */
export const SAISIE_NEUVE_COMMUNAUTE: SaisieDeCommunaute = { nom: '', description: '', prive: true };

/**
 * LA FEUILLE « CRÉER UNE COMMUNAUTÉ » — patron `liens-vue.ts` › `nouveauLien`
 * (#5071), simplifié aux trois champs de `createCommunityRequestSchema` que
 * la cible demande (Q4) : ni `identifier` ni `avatar`.
 *
 * `motif` EST DÉJÀ LA COPIE FRANÇAISE FINALE quand il est fourni — jamais le
 * texte anglais de la passerelle : c'est `communautes-porte.ts` qui choisit
 * entre `COMMUNAUTES.sansNom` (refus côté client) et `COMMUNAUTES.conflit`
 * (409 côté serveur) avant d'appeler cette fonction. Elle se contente de le
 * peindre, la même séparation que `refusFermeture`/`motif` chez les liens.
 */
const nouvelleCommunaute = ({
  saisie,
  motif,
}: {
  readonly saisie: SaisieDeCommunaute;
  readonly motif: string | null;
}): string =>
  `<a class="voile" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}"></a>` +
  '<dialog class="nouvelle-communaute" open aria-modal="true" aria-labelledby="titre-de-la-nouvelle-communaute" ' +
  'data-retour="/communities">' +
  `<a class="poignee" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}"></a>` +
  '<div class="tete">' +
  `<div class="dit"><h2 id="titre-de-la-nouvelle-communaute">${echappe(COMMUNAUTES.creerTitre)}</h2></div>` +
  `<a class="fermer" href="/communities" aria-label="${echappe(COMMUNAUTES.fermer)}">${svgDuSprite('ph-x')}</a>` +
  '</div>' +
  (motif === null ? '' : `<p class="alerte" role="alert">${echappe(motif)}</p>`) +
  '<form method="post">' +
  '<p class="champ">' +
  `<label for="c-nom">${echappe(COMMUNAUTES.nomChamp)}</label>` +
  `<input id="c-nom" name="${CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.nom}" type="text" required value="${echappe(saisie.nom)}" autocomplete="off">` +
  '</p>' +
  '<p class="champ">' +
  `<label for="c-description">${echappe(COMMUNAUTES.descriptionChamp)}</label>` +
  `<textarea id="c-description" name="${CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.description}">${echappe(saisie.description)}</textarea>` +
  '</p>' +
  `<label class="coche"><input type="checkbox" name="${CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.prive}" value="1"${saisie.prive ? ' checked' : ''}>${echappe(COMMUNAUTES.priveeChamp)}</label>` +
  `<p class="pied"><button type="submit" class="action primaire">${echappe(COMMUNAUTES.creer)}</button></p>` +
  '</form>' +
  '</dialog>';

export type EtatDesCommunautes = {
  readonly communautes: readonly Communaute[];
  readonly suite: number | null;
  /** L'état `?ouverte=<id>` — `null` quand aucune surimpression n'est demandée. */
  readonly ouverte: Ouverte | null;
  /** L'état `?nouvelle`. */
  readonly nouvelle: boolean;
  /** Le refus de la passerelle (ou de la saisie) À LA CRÉATION, déjà en copie française. */
  readonly motif: string | null;
  /** Ce que le lecteur venait de taper, reposé après un refus. */
  readonly saisie?: SaisieDeCommunaute;
  /** L'état `?espace` — la feuille de l'espace membre (Q7). */
  readonly espace: boolean;
  readonly maintenant: number;
};

/**
 * TROIS SURIMPRESSIONS POSSIBLES, JAMAIS DEUX À LA FOIS — un ordre de
 * priorité qu'aucun geste réel ne peut faire collisionner (`?nouvelle`,
 * `?ouverte=` et `?espace` viennent de trois liens distincts), posé pour la
 * seule adresse composée à la main : création, puis ouverture, puis espace.
 */
export const documentDesCommunautes = (etat: EtatDesCommunautes): string => {
  const dessus =
    etat.nouvelle
      ? nouvelleCommunaute({ saisie: etat.saisie ?? SAISIE_NEUVE_COMMUNAUTE, motif: etat.motif })
      : etat.ouverte !== null
        ? communauteOuverte({ ouverte: etat.ouverte, maintenant: etat.maintenant })
        : etat.espace
          ? feuilleDeLEspace({ lecteur: null, hote: '/communities' })
          : '';

  return documentPleinEcran({
    titre: `${COMMUNAUTES.titre} — Meeshy`,
    description: COMMUNAUTES.sous,
    corps: dessus + (dessus === '' ? corps(etat) : corps(etat).replace('<main ', '<main inert ')),
    feuille:
      FEUILLE_CONNECTEE +
      FEUILLE_DU_FIL +
      FEUILLE_DES_COMMUNAUTES +
      FEUILLE_DES_FLOTTANTES +
      (etat.espace ? FEUILLE_DE_L_ESPACE : ''),
  });
};
