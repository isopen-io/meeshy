import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { CleDeConfidentialite } from '@/lib/contenu/reglages-details';
import { BASCULES_DE_CONFIDENTIALITE, REGLAGES_DETAILS } from '@/lib/contenu/reglages-details';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_REGLAGES } from './reglages-feuille';
import { avis, commutateur, enTete, rangeeDite, rangeeLien, rangs, section } from './reglages-socle';
import { carteVide } from './vue';

/**
 * `/settings/privacy`, `/settings/privacy/export`, `/settings/privacy/delete`,
 * `/settings/media`, `/settings/media/document`, `/settings/media/audio`,
 * `/settings/media/video`, `/settings/message` — LES QUATRE
 * RÉGLAGES-DÉTAILS (travail `reglages-details`).
 *
 * LE MÊME SOCLE que les six écrans de `reglages-vue.ts`
 * (`reglages-socle.ts`) : dix écrans, une seule forme d'en-tête, de section
 * et de rangée — jamais une onzième variante.
 */

/**
 * LE CONTENEUR D'UN GROUPE DE COMMUTATEURS — même racine (`.bascules`) et
 * même feuille (`commutateurDEcran`, `atomes-feuille.ts`) que
 * `/notifications/preferences` : DEUX écrans rendent le MÊME contrôle, jamais
 * deux CSS qui divergent. Distinct de `rangs()` (les rangées-LIENS, en cartes
 * séparées) : un groupe de bascules est une LISTE bordée d'un bloc, pas des
 * cartes espacées.
 */
const bascules = (contenu: string, libelle: string): string =>
  `<ul class="bascules" aria-label="${echappe(libelle)}">${contenu}</ul>`;

const page = ({ titre, description, corps }: { readonly titre: string; readonly description: string; readonly corps: string }): string =>
  documentPleinEcran({
    titre: `${titre} — Meeshy`,
    description,
    corps: `<main id="main-content" class="reglages">${corps}</main>`,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_REGLAGES,
  });

// ─── /settings/privacy ──────────────────────────────────────────────────────

export type EtatDeLaConfidentialite = {
  readonly reglages: Readonly<Record<CleDeConfidentialite, boolean>>;
  /** Non nul juste après la redirection du POST — le PRG dit ce qu'il a fait. */
  readonly regleAppliquee: CleDeConfidentialite | null;
  readonly echec: boolean;
};

const LIBELLE_PAR_CLE: Readonly<Record<CleDeConfidentialite, string>> = Object.fromEntries(
  BASCULES_DE_CONFIDENTIALITE.map((b) => [b.cle, b.libelle]),
) as Record<CleDeConfidentialite, string>;

const CHEMIN_PRIVACY = '/settings/privacy';

const avisDeLaConfidentialite = (etat: EtatDeLaConfidentialite): string => {
  if (etat.echec) return avis(REGLAGES_DETAILS.privacy.echec, true);
  if (etat.regleAppliquee === null) return '';
  return avis(REGLAGES_DETAILS.privacy.regle(LIBELLE_PAR_CLE[etat.regleAppliquee]));
};

/**
 * QUATRE BASCULES, PAS SIX. `hideProfileFromSearch` et `allowContactRequests`
 * — la section COMMUNICATIONS de la cible — n'ont AUCUN lecteur serveur
 * (§ 0 de la spécification) : les rendre affirmerait une protection qu'aucun
 * code n'applique. Les dessiner grisées occuperait la place d'un vrai réglage
 * — régime 3 de dégradation, comme le carrefour envers les trois écrans qui
 * n'avaient encore aucune route.
 */
export const documentDeLaConfidentialite = (etat: EtatDeLaConfidentialite): string =>
  page({
    titre: REGLAGES_DETAILS.privacy.titre,
    description: REGLAGES_DETAILS.privacy.sousTitre,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.privacy.titre,
        sous: REGLAGES_DETAILS.privacy.sousTitre,
        retour: '/settings',
        libelleDuRetour: REGLAGES_DETAILS.privacy.retour,
      }) +
      avisDeLaConfidentialite(etat) +
      section({
        titre: REGLAGES_DETAILS.privacy.visibilite,
        corps: bascules(
          BASCULES_DE_CONFIDENTIALITE.map((b) =>
            commutateur({
              cle: b.cle,
              libelle: b.libelle,
              actif: etat.reglages[b.cle],
              libelleActif: REGLAGES_DETAILS.privacy.activee,
              libelleInactif: REGLAGES_DETAILS.privacy.desactivee,
            }),
          ).join(''),
          REGLAGES_DETAILS.privacy.visibilite,
        ),
      }) +
      section({
        titre: REGLAGES_DETAILS.privacy.mesDonnees,
        corps: rangs(
          rangeeLien({
            href: `${CHEMIN_PRIVACY}/export`,
            quoi: REGLAGES_DETAILS.privacy.exporter,
            sous: REGLAGES_DETAILS.privacy.exporterPhrase,
            valeur: REGLAGES_DETAILS.privacy.exporterBouton,
          }) +
            rangeeLien({
              href: `${CHEMIN_PRIVACY}/delete`,
              quoi: REGLAGES_DETAILS.privacy.supprimer,
              sous: REGLAGES_DETAILS.privacy.supprimerPhrase,
              attention: true,
            }),
          REGLAGES_DETAILS.privacy.mesDonnees,
        ),
      }) +
      section({
        titre: REGLAGES_DETAILS.privacy.legal,
        corps: rangs(
          rangeeLien({ href: '/privacy', quoi: REGLAGES_DETAILS.privacy.politique }) +
            rangeeLien({ href: '/terms', quoi: REGLAGES_DETAILS.privacy.conditions }),
          REGLAGES_DETAILS.privacy.legal,
        ),
      }),
  });

// ─── /settings/privacy/export ───────────────────────────────────────────────

/**
 * DEUX ÉTATS, PAS TROIS. L'export RÉUSSI n'est PAS un document : c'est une
 * pièce jointe que la porte remet telle quelle (`reglages-details-porte.ts` ›
 * `EXPORT`, `content-disposition: attachment`). Une variante `fait` ici aurait
 * été un état que rien ne rend — le genre de branche morte qui finit par
 * mentir sur ce que l'écran sait faire.
 */
export type EtatDeLExport = { readonly genre: 'formulaire' } | { readonly genre: 'panne' };

export const documentDeLExport = (etat: EtatDeLExport): string =>
  page({
    titre: REGLAGES_DETAILS.export.titre,
    description: REGLAGES_DETAILS.export.corps,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.export.titre,
        sous: REGLAGES_DETAILS.privacy.titre,
        retour: CHEMIN_PRIVACY,
        libelleDuRetour: REGLAGES_DETAILS.export.retour,
      }) +
      (etat.genre === 'panne'
        ? carteVide({ glyphe: 'ph-warning-circle', titre: REGLAGES_DETAILS.export.panne, phrase: '' })
        : '<section><p class="phrase">' +
          echappe(REGLAGES_DETAILS.export.corps) +
          '</p><form method="post"><button type="submit" class="action primaire">' +
          echappe(REGLAGES_DETAILS.export.bouton) +
          '</button></form></section>'),
  });

// ─── /settings/privacy/delete ───────────────────────────────────────────────

export type EtatDeLaSuppression =
  | {
      readonly genre: 'formulaire';
      readonly avis: string | null;
      /**
       * LA PHRASE DÉJÀ TAPÉE, REPOSÉE — la loi que `reglages-feuille.ts`
       * énonce pour tous les écrans de réglages (« un champ en erreur garde sa
       * saisie […] perdre ce qu'on vient de taper est le défaut le plus cher
       * d'un formulaire »). Elle vaut DOUBLE ici : recopier « SUPPRIMER MON
       * COMPTE » est déjà l'effort que l'écran demande, et le faire recommencer
       * parce que le MOT DE PASSE était faux punit la mauvaise moitié du geste.
       *
       * Le MOT DE PASSE, lui, n'est JAMAIS reposé : il n'a rien à faire dans
       * un document que la porte vient de servir.
       */
      readonly phrase: string;
    }
  | { readonly genre: 'demandee' };

const champDeSuppression = ({
  id,
  nom,
  type,
  libelle,
  valeur = '',
  remplissage,
}: {
  readonly id: string;
  readonly nom: string;
  readonly type: string;
  readonly libelle: string;
  readonly valeur?: string;
  readonly remplissage: string;
}): string =>
  `<div class="champ"><label for="${id}">${echappe(libelle)}</label>` +
  `<input id="${id}" name="${echappe(nom)}" type="${type}" required autocomplete="${echappe(remplissage)}"` +
  `${valeur === '' ? '' : ` value="${echappe(valeur)}"`}></div>`;

export const documentDeLaSuppression = (etat: EtatDeLaSuppression): string =>
  page({
    titre: REGLAGES_DETAILS.suppression.titre,
    description: REGLAGES_DETAILS.suppression.avertissement,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.suppression.titre,
        sous: REGLAGES_DETAILS.privacy.titre,
        retour: CHEMIN_PRIVACY,
        libelleDuRetour: REGLAGES_DETAILS.suppression.retour,
      }) +
      (etat.genre === 'demandee'
        ? carteVide({ glyphe: 'ph-check-circle', titre: REGLAGES_DETAILS.suppression.demandee, phrase: '' })
        : '<section>' +
          // L'AVERTISSEMENT PERMANENT N'EST PAS UNE ALERTE. Il est là au
          // chargement, il décrit l'écran ; `role="alert"` est réservé à ce qui
          // SURVIENT (la loi du socle, `avis`). Deux `role="alert"` sur le même
          // document faisaient perdre le motif du REFUS dans le bruit du
          // rappel — c'est la seconde annonce qui compte.
          `<p class="avis">${svgDuSprite('ph-warning-circle')}${echappe(REGLAGES_DETAILS.suppression.avertissement)}</p>` +
          (etat.avis === null ? '' : `<p class="avis" role="alert">${svgDuSprite('ph-x-circle')}${echappe(etat.avis)}</p>`) +
          '<form method="post">' +
          champDeSuppression({
            id: 'phrase',
            nom: 'confirmationPhrase',
            type: 'text',
            libelle: REGLAGES_DETAILS.suppression.champPhrase,
            valeur: etat.phrase,
            remplissage: 'off',
          }) +
          champDeSuppression({
            id: 'motdepasse',
            nom: 'currentPassword',
            type: 'password',
            libelle: REGLAGES_DETAILS.suppression.champMotDePasse,
            remplissage: 'current-password',
          }) +
          `<button type="submit" class="action attention">${echappe(REGLAGES_DETAILS.suppression.bouton)}</button>` +
          '</form>' +
          '</section>'),
  });

// ─── /settings/media — le hub ───────────────────────────────────────────────

const CHEMIN_MEDIA = '/settings/media';

export const documentDuHubMedias = (): string =>
  page({
    titre: REGLAGES_DETAILS.media.titre,
    description: REGLAGES_DETAILS.media.sousTitre,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.media.titre,
        sous: REGLAGES_DETAILS.media.sousTitre,
        retour: '/settings',
        libelleDuRetour: REGLAGES_DETAILS.media.retour,
      }) +
      section({
        titre: REGLAGES_DETAILS.media.sections,
        corps: rangs(
          rangeeLien({
            href: `${CHEMIN_MEDIA}/audio`,
            quoi: REGLAGES_DETAILS.media.audio.titre,
            sous: REGLAGES_DETAILS.media.audio.phrase,
          }) +
            rangeeLien({
              href: `${CHEMIN_MEDIA}/video`,
              quoi: REGLAGES_DETAILS.media.video.titre,
              sous: REGLAGES_DETAILS.media.video.phrase,
            }) +
            rangeeLien({
              href: `${CHEMIN_MEDIA}/document`,
              quoi: REGLAGES_DETAILS.media.document.titre,
              sous: REGLAGES_DETAILS.media.document.phrase,
            }),
          REGLAGES_DETAILS.media.sections,
        ),
      }),
  });

/**
 * `/settings/media/audio` ET `/settings/media/video` — RÉGIME 3. Aucun
 * réglage `audio`/`video` de `PREFERENCE_REGISTRY` n'a de lecteur d'USAGE
 * mesurable par la v3 (§ 2.7 de la spécification) : un état DESSINÉ, aucun
 * contrôle — la règle « un contrôle existe s'il a un effet » l'interdit.
 */
export const documentDuStubMedias = (variante: { readonly titre: string; readonly phrase: string }): string =>
  page({
    titre: variante.titre,
    description: variante.phrase,
    corps:
      enTete({
        titre: variante.titre,
        sous: REGLAGES_DETAILS.media.titre,
        retour: CHEMIN_MEDIA,
        libelleDuRetour: REGLAGES_DETAILS.media.retour,
      }) +
      section({
        titre: REGLAGES_DETAILS.media.aDefinir,
        corps: rangs(
          rangeeDite({ quoi: variante.titre, sous: REGLAGES_DETAILS.media.sansReglage, valeur: '' }),
          variante.titre,
        ),
      }),
  });

// ─── /settings/media/document ───────────────────────────────────────────────

export type EtatDuDocument = {
  readonly autoDownloadEnabled: boolean;
  readonly regleAppliquee: boolean;
  readonly echec: boolean;
};

export const documentDesReglagesDeDocument = (etat: EtatDuDocument): string =>
  page({
    titre: REGLAGES_DETAILS.document.titre,
    description: REGLAGES_DETAILS.document.autoDownloadPhrase,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.document.titre,
        sous: REGLAGES_DETAILS.media.titre,
        retour: CHEMIN_MEDIA,
        libelleDuRetour: REGLAGES_DETAILS.document.retour,
      }) +
      (etat.echec
        ? avis(REGLAGES_DETAILS.document.echec, true)
        : etat.regleAppliquee
          ? avis(REGLAGES_DETAILS.document.regle)
          : '') +
      section({
        titre: REGLAGES_DETAILS.document.telechargements,
        corps: bascules(
          commutateur({
            cle: 'autoDownloadEnabled',
            libelle: REGLAGES_DETAILS.document.autoDownload,
            actif: etat.autoDownloadEnabled,
            libelleActif: REGLAGES_DETAILS.document.activee,
            libelleInactif: REGLAGES_DETAILS.document.desactivee,
            apres: `<p class="fenetre">${echappe(REGLAGES_DETAILS.document.autoDownloadPhrase)}</p>`,
          }),
          REGLAGES_DETAILS.document.telechargements,
        ),
      }),
  });

// ─── /settings/message ──────────────────────────────────────────────────────

/**
 * RÉGIME 3 — la capacité `view=thread` (citation, réponse en fil) n'existe
 * PAS côté serveur, et la planche porte littéralement « À DÉFINIR » sur cet
 * écran (spécification § 11, matrice `detail-message`). Une carte DITE, sans
 * chevron ni lien : le contrôle qui promettrait un écran absent est ce que la
 * règle 7 interdit.
 */
export const documentDesMessages = (): string =>
  page({
    titre: REGLAGES_DETAILS.message.titre,
    description: REGLAGES_DETAILS.message.sousTitre,
    corps:
      enTete({
        titre: REGLAGES_DETAILS.message.titre,
        sous: REGLAGES_DETAILS.message.sousTitre,
        retour: '/settings',
        libelleDuRetour: REGLAGES_DETAILS.message.retour,
      }) +
      section({
        titre: REGLAGES_DETAILS.message.aDefinir,
        corps: rangs(
          rangeeDite({
            quoi: REGLAGES_DETAILS.message.titreCarte,
            sous: REGLAGES_DETAILS.message.phraseCarte,
            valeur: '',
          }),
          REGLAGES_DETAILS.message.titreCarte,
        ),
      }),
  });

