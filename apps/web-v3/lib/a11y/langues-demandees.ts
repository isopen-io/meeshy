import { DOCUMENT_LANGUAGE } from '@/app/document-language';

/**
 * Ce que le navigateur DEMANDE — le rang 4 du Prisme, lu à sa source.
 *
 * POURQUOI CE MODULE EXISTE À PART
 *
 * Deux surfaces ont besoin de la même lecture, et pour deux raisons différentes :
 * le repli de `/l/:token` la SERT comme une donnée d'en-tête (« Langue
 * détectée »), l'écran `join` en PRÉ-REMPLIT le champ « Langue parlée » que le
 * visiteur enverra au serveur. La règle de placement (B) tranche : dès qu'une
 * seconde surface l'importe, elle remonte — et une chaîne de langues qui
 * s'écrirait deux fois divergerait au premier `q=` mal lu.
 *
 * CE QU'IL N'EST PAS
 *
 * Ce n'est PAS `resolveUserLanguage()`. Le Prisme ordonne quatre rangs —
 * `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`, puis la
 * locale de l'appareil ; ce module ne connaît que le QUATRIÈME, parce qu'un
 * visiteur sans compte n'a aucun des trois premiers. Le jour où la v3 servira un
 * lecteur identifié, c'est ce module qui ALIMENTERA ce rang, jamais lui qui
 * décidera à la place des autres. Écrire ici une cascade de préférences
 * fabriquerait la jumelle que le § 3.2 corollaire 3 interdit.
 *
 * DEUX CHAMPS POUR DEUX USAGES, ET ILS NE SE CONFONDENT PAS
 *
 *   • `etiquette` — l'étiquette BCP-47 telle qu'elle est demandée (`fr-FR`).
 *     C'est ce qu'on RAPPORTE : une télémétrie qui la tronquerait perdrait la
 *     région, seule information que l'en-tête apporte en plus.
 *   • `code` — la langue de base, en minuscules (`fr`). C'est ce qu'on ENVOIE :
 *     la passerelle normalise déjà (`normalizeLanguageForDedup`) et une cible de
 *     traduction est clé sur la base, jamais sur la région.
 */

export type LangueDemandee = {
  /** L'étiquette BCP-47 telle que l'agent la demande — `fr-FR`, `en`. */
  readonly etiquette: string;
  /** La langue de BASE, en minuscules — ce qui part au serveur. */
  readonly code: string;
  /** Le nom de la langue, dans la langue du document. */
  readonly libelle: string;
  /** Le drapeau de la RÉGION, quand l'étiquette en porte une — jamais déduit d'une langue. */
  readonly drapeau: string | null;
};

const ETIQUETTE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const REGION = /^[a-z]{2,3}-([a-z]{2})$/;

/**
 * Un drapeau se lit sur la RÉGION, jamais sur la langue.
 *
 * `fr` n'est pas la France (c'est aussi le Québec, la Suisse, le Sénégal) et
 * `es` n'est pas l'Espagne. Une table langue → pays serait fausse pour la
 * majorité de ses lignes, et fausse en désignant un pays à quelqu'un qui n'y
 * vit pas.
 */
const drapeauDe = (etiquette: string): string | null => {
  const region = REGION.exec(etiquette.toLowerCase())?.[1];
  if (region === undefined) return null;
  return [...region.toUpperCase()]
    .map((lettre) => String.fromCodePoint(0x1f1e6 + lettre.charCodeAt(0) - 65))
    .join('');
};

/**
 * `Intl.DisplayNames` plutôt qu'une table de noms de langues : une table serait
 * une SECONDE source pour une donnée que la plateforme porte déjà, dans les sept
 * langues du produit, sans un octet expédié. Un runtime sans ICU complet rend le
 * code — dégradé, jamais faux.
 */
const libelleDe = (base: string): string => {
  try {
    const nom = new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'language' }).of(base) ?? base;
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  } catch {
    return base;
  }
};

const decrite = (etiquette: string): LangueDemandee => {
  const code = (etiquette.split('-')[0] ?? etiquette).toLowerCase();
  return { etiquette, code, libelle: libelleDe(code), drapeau: drapeauDe(etiquette) };
};

const DEFAUT: readonly LangueDemandee[] = [decrite(DOCUMENT_LANGUAGE)];

/**
 * La qualité déclarée. Une valeur absente vaut 1 (RFC 9110 § 12.4.2) ; une
 * valeur illisible vaut 0, et l'entrée sort — mieux vaut perdre une préférence
 * qu'en inventer une.
 */
const qualiteDe = (parametres: readonly string[]): number => {
  const declaree = parametres
    .map((parametre) => /^q=(.+)$/.exec(parametre.trim().toLowerCase())?.[1])
    .find((valeur) => valeur !== undefined);
  if (declaree === undefined) return 1;
  const nombre = Number.parseFloat(declaree);
  return Number.isFinite(nombre) ? nombre : 0;
};

type Demande = {
  readonly etiquette: string;
  readonly qualite: number;
  readonly rang: number;
};

const demandes = (acceptLanguage: string): readonly Demande[] =>
  acceptLanguage
    .split(',')
    .map((entree, rang) => {
      const [etiquette = '', ...parametres] = entree.split(';');
      return { etiquette: etiquette.trim(), qualite: qualiteDe(parametres), rang };
    })
    .filter((demande) => demande.qualite > 0 && ETIQUETTE.test(demande.etiquette));

/**
 * L'ordre est celui de la QUALITÉ, et l'ordre d'écriture ne départage que les
 * égalités : `en;q=0.3,de;q=0.9` demande l'allemand d'abord, quoi qu'en dise la
 * position. Un tri qui lirait la position seule servirait la langue la moins
 * voulue au visiteur qui a pris la peine de la déclasser.
 *
 * Deux régions d'une même langue ne sont pas deux langues : `fr-CA` puis `fr-FR`
 * rendent UNE entrée. C'est la première demandée qui garde son étiquette — la
 * région la plus voulue est une information, pas un doublon.
 */
export const languesDemandees = (acceptLanguage: string | null): readonly LangueDemandee[] => {
  const retenues = [...demandes(acceptLanguage ?? '')]
    .sort((a, b) => b.qualite - a.qualite || a.rang - b.rang)
    .map((demande) => decrite(demande.etiquette))
    .filter((langue, index, toutes) => toutes.findIndex((autre) => autre.code === langue.code) === index);

  return retenues.length === 0 ? DEFAUT : retenues;
};

/**
 * La première — celle qu'on pré-remplit. Elle ne peut pas manquer : la liste
 * retombe toujours sur la langue du document, donc l'appelant n'a aucun cas
 * `undefined` à peindre.
 */
export const langueDemandee = (acceptLanguage: string | null): LangueDemandee =>
  languesDemandees(acceptLanguage)[0] ?? DEFAUT[0]!;
