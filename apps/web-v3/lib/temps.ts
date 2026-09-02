import { FIL } from '@/lib/contenu/fil';

/**
 * L'HEURE ET LE JOUR D'UNE LIGNE, dans la langue du document — écrits UNE fois
 * pour les deux rendus du fil.
 *
 * Le SERVEUR pose les séparateurs de jour dans le document qu'il sert (sans
 * JavaScript, le fil a ses jours) ; le module de participation les RECALCULE
 * dans le fuseau du lecteur, que seul le navigateur connaît, et remonte les
 * heures relatives en heure locale. Deux calculs, une fonction : le libellé
 * d'un jour ne peut pas diverger entre ce qui est servi et ce qui est peint.
 *
 * Ce que le serveur ne sait pas, dit en toutes lettres : il tourne en UTC. Un
 * lecteur à Lagos (UTC+1) qui ouvre le fil à 00 h 30 lit « Aujourd’hui » sur
 * des messages que son horloge range déjà dans « Hier » — l'écart n'existe
 * qu'autour de minuit, et le module le corrige dès qu'il arrive. Une heure
 * ABSOLUE servie par le serveur, elle, serait fausse toute la journée pour tout
 * lecteur hors d'UTC : c'est pourquoi le serveur rend un relatif (`quand`) et
 * laisse l'heure locale au navigateur.
 *
 * Les formats suivent la LANGUE DU DOCUMENT, jamais la locale du navigateur :
 * le Prisme sert tout dans la langue du lecteur, l'heure et le jour compris.
 */

const formats = new Map<string, { readonly heure: Intl.DateTimeFormat; readonly jour: Intl.DateTimeFormat }>();

const formatsDe = (langue: string) => {
  const connu = formats.get(langue);
  if (connu !== undefined) return connu;
  const neuf = {
    heure: new Intl.DateTimeFormat(langue, { hour: '2-digit', minute: '2-digit' }),
    jour: new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  formats.set(langue, neuf);
  return neuf;
};

export const heureLocale = (iso: string, langue: string): string => {
  const instant = Date.parse(iso);
  return Number.isNaN(instant) ? '' : formatsDe(langue).heure.format(instant);
};

const debutDuJour = (instant: number): number => {
  const date = new Date(instant);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** `AAAA-MM-JJ` du jour LOCAL d'un instant — la clé qui dit si deux lignes partagent un séparateur. */
export const cleDuJour = (iso: string): string => {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '';
  const date = new Date(instant);
  const deux = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
};

export const libelleDuJour = (iso: string, maintenant: number, langue: string): string => {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '';
  const ecart = Math.round((debutDuJour(maintenant) - debutDuJour(instant)) / 86_400_000);
  if (ecart === 0) return FIL.aujourdhui;
  if (ecart === 1) return FIL.hier;
  return formatsDe(langue).jour.format(instant);
};
