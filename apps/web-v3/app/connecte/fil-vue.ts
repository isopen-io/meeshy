import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';
import type { Fil, Message } from '@/lib/api/fil';

import { compacte } from '@/app/enveloppe/feuille';
import { FEUILLE_CONNECTEE } from './feuille';
import { quand } from './vue';

/**
 * LE FIL D'UNE CONVERSATION, rendu par le SERVEUR — Prisme compris.
 *
 * Le texte affiché est celui que `resolvePrismTranslation` a élu ; l'indicateur
 * de traduction est DISCRET, comme le § Prisme du `CLAUDE.md` le demande
 * (« le contenu traduit s'affiche comme du contenu natif ; un indicateur subtil
 * signale qu'une traduction est active, sans distraire »). Il ne dit donc pas
 * « traduction automatique de l'anglais vers le français » : il dit la langue
 * d'ORIGINE, en trois lettres, à côté de l'heure.
 *
 * ÉCRIRE SE FAIT PAR UN `<form method="post">`. Sans JavaScript, sans socket :
 * on écrit, on envoie, la page revient avec le message. Ce n'est pas le temps
 * réel — c'est ce qui marche, et ce qui marche partout.
 */

export const FEUILLE_DU_FIL = compacte(`
.fil-tete{padding:40px 0 0}
.fil-tete h1{margin:0 0 4px;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em}
.fil-tete p{margin:0;font-size:var(--text-sm);color:var(--color-text-subtle)}

.echanges{margin:28px 0 0;padding:0;list-style:none;display:grid;gap:14px}
.echanges li{max-width:min(72ch,86%);display:grid;gap:4px}
.echanges li.mien{margin-left:auto;justify-items:end}
.bulle{padding:12px 16px;border-radius:var(--radius-lg);background:var(--color-surface);border:1px solid var(--color-neutral-900);line-height:var(--leading-relaxed);white-space:pre-wrap;overflow-wrap:anywhere}
.mien .bulle{background:var(--color-primary);color:var(--color-on-primary);border-color:transparent}
.mien .bulle.retenu{background:var(--color-surface);color:var(--color-text-muted)}
.bulle.retenu{color:var(--color-text-muted);font-style:italic}
.signe{font-size:var(--text-xs);color:var(--color-text-subtle);display:flex;gap:8px;align-items:baseline}
.langue{border:1px solid var(--color-border);border-radius:var(--radius-xs);padding:0 5px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-primary)}

.ecrire{margin:28px 0 0;display:flex;gap:10px;align-items:flex-end}
.ecrire textarea{flex:1;min-height:52px;max-height:180px;padding:14px 16px;font:inherit;font-size:var(--text-md);color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border-interactive);border-radius:var(--radius-md);resize:vertical}
.ecrire button{flex:none;cursor:pointer;font-family:inherit;font-size:var(--text-base)}
`);

const signe = (message: Message, maintenant: number): string => {
  const morceaux = [echappe(message.auteur), quand(message.ecritA, maintenant)].filter(
    (morceau) => morceau !== '',
  );

  // La langue d'ORIGINE, et seulement quand une traduction est servie : sur un
  // message déjà écrit dans la langue du lecteur, la pastille n'apprendrait
  // rien et ferait du bruit sur chaque ligne.
  const origine =
    message.langueServie !== null && message.langueOriginale !== null
      ? `<span class="langue" title="Traduit depuis cette langue">${echappe(message.langueOriginale)}</span>`
      : '';

  return `<span class="signe">${morceaux.join(' · ')}${origine}</span>`;
};

const echange = (message: Message, maintenant: number): string =>
  `<li${message.deMoi ? ' class="mien"' : ''}>` +
  `<span class="bulle${message.protege ? ' retenu' : ''}">${echappe(message.texte)}</span>` +
  signe(message, maintenant) +
  '</li>';

export type EtatDuFil = {
  readonly cle: string;
  readonly fil: Fil;
  readonly erreur: string | null;
  readonly brouillon: string;
  readonly maintenant: number;
};

const CHAMP = 'texte';
const ENVOYER = 'Envoyer';
const INVITE = 'Écrire un message';
const VIDE = 'Aucun message dans cette conversation';
const VIDE_PRECISION = 'Démarrez la conversation en envoyant un message !';

const corpsDuFil = ({ cle, fil, erreur, brouillon, maintenant }: EtatDuFil): string =>
  '<div class="fil-tete">' +
  `<h1>${echappe(fil.titre)}</h1>` +
  `<p>${fil.membres} participants</p>` +
  '</div>' +
  (erreur === null ? '' : `<p class="alerte" role="alert">${echappe(erreur)}</p>`) +
  (fil.messages.length === 0
    ? `<div class="vide"><h2>${echappe(VIDE)}</h2><p>${echappe(VIDE_PRECISION)}</p></div>`
    : `<ul class="echanges">${fil.messages.map((m) => echange(m, maintenant)).join('')}</ul>`) +
  `<form class="ecrire" method="post" action="/chats/${echappe(encodeURIComponent(cle))}">` +
  `<label class="hors-ecran" for="champ-texte">${echappe(INVITE)}</label>` +
  `<textarea id="champ-texte" name="${CHAMP}" rows="1" required placeholder="${echappe(INVITE)}">${echappe(brouillon)}</textarea>` +
  `<button class="cta principal" type="submit">${echappe(ENVOYER)}</button>` +
  '</form>';

export const documentDuFil = (etat: EtatDuFil): string =>
  documentDuSite({
    titre: `${etat.fil.titre} — Meeshy`,
    description: `${etat.fil.membres} participants`,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL,
    corps: corpsDuFil(etat),
    retour: true,
  });

export const CHAMP_DU_MESSAGE = CHAMP;

const INTROUVABLE = {
  titre: 'Conversation introuvable',
  corps:
    'Ce fil n’existe pas, ou vous n’en faites pas partie. Retrouvez vos conversations depuis la liste.',
  action: 'Mes conversations',
} as const;

export const documentIntrouvable = (): string =>
  documentDuSite({
    titre: `${INTROUVABLE.titre} — Meeshy`,
    description: INTROUVABLE.corps,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(INTROUVABLE.titre)}</h1>` +
      `<p>${echappe(INTROUVABLE.corps)}</p>` +
      '</div>' +
      '<section class="acces" aria-label="' +
      echappe(INTROUVABLE.action) +
      '"><nav>' +
      `<a class="cta principal" href="/chats">${echappe(INTROUVABLE.action)}</a>` +
      '</nav></section>',
    retour: true,
  });
