/**
 * LE DÉCALAGE UTC D'UN FUSEAU — un module FEUILLE, sans une seule importation,
 * et c'est sa raison d'être autant que son contenu.
 *
 * Il a d'abord vécu dans `lib/temps.ts` (le voisin naturel : c'est là que le
 * cookie de fuseau est déclaré). MESURÉ au gate de budget : `lib/contenu/
 * prefs-de-notif.ts` l'importait pour sa table de fuseaux, `lib/realtime/
 * prefs.ts` importe `PREFS` de ce fichier EN BLOC, et le module de
 * participation passait de 2 717 à 8 327 o gzip — le graphe entier de
 * `lib/temps.ts` (`lib/contenu/fil`, les caches de `Intl.DateTimeFormat` du
 * fil) embarqué pour composer « UTC+02:00 ». Sur la 3G rurale que la directive
 * du porteur vise, 5,6 Ko de plus pour un libellé n'est pas un arbitrage.
 *
 * D'où la règle que ce fichier applique : ce qu'un module de participation
 * atteint TRANSITIVEMENT doit être une feuille. Le site reste UNIQUE — les
 * deux appelants (la table `FUSEAUX_DND` et `app/connecte/prefs-porte.ts`)
 * lisent ici, jamais chacun sa copie.
 */
const decalages = new Map<string, Intl.DateTimeFormat>();

/**
 * LE DÉCALAGE DU FUSEAU DU LECTEUR, EN MINUTES À AJOUTER À UTC — la SECONDE
 * lecture du cookie posé par `app/session.ts` › `fuseauDuLecteur`, et pas une
 * seconde SOURCE : le même identifiant IANA, une autre question posée à
 * `Intl`.
 *
 * Elle existe parce qu'une préférence du serveur parle en MINUTES et non en
 * zone : `dndUtcOffsetMinutes` (`packages/shared/utils/notification-dnd.ts:56`,
 * `nowUtc + offset`) est ce qui décide si 22:00 veut dire 22 h à Paris ou 22 h
 * à Greenwich. Sans elle, « Fuseau de cet appareil » ne mesurait rien et la
 * plage silencieuse d'un lecteur de Paris se décalait de deux heures.
 *
 * `Intl` NATIF, aucune bibliothèque (`__tests__/sans-bibliotheque-de-dates.
 * test.ts`) : `timeZoneName: 'longOffset'` rend `GMT`, `GMT+02:00` ou
 * `GMT+05:45`, dont la lecture est de l'arithmétique. Le décalage DÉPEND de
 * l'instant (heure d'été) : il se mesure donc à l'instant demandé, jamais une
 * fois pour toutes.
 *
 * Rend `null` sur un fuseau que l'ICU refuse — l'appelant ne change alors
 * RIEN, plutôt que d'écrire un décalage inventé.
 */
export const decalageDuFuseau = (fuseau: string, instant: Date = new Date()): number | null => {
  let format = decalages.get(fuseau);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat('en-US', { timeZone: fuseau, timeZoneName: 'longOffset' });
    } catch {
      return null;
    }
    decalages.set(fuseau, format);
  }

  const rendu = format.formatToParts(instant).find((partie) => partie.type === 'timeZoneName')?.value;
  if (rendu === undefined) return null;
  if (rendu === 'GMT' || rendu === 'UTC') return 0;

  const lu = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})$/.exec(rendu);
  if (lu === null) return null;
  return (lu[1] === '-' ? -1 : 1) * (Number(lu[2]) * 60 + Number(lu[3]));
};

/**
 * `UTC+02:00` / `UTC` — le décalage tel qu'il se LIT dans une liste de
 * fuseaux. Site unique, partagé par la table fermée `FUSEAUX_DND`
 * (`lib/contenu/prefs-de-notif.ts`) et par l'option « cet appareil » : deux
 * écritures du même libellé auraient divergé au premier signe changé.
 */
export const libelleDuDecalage = (minutes: number): string => {
  if (minutes === 0) return 'UTC';
  const absolu = Math.abs(minutes);
  const heures = String(Math.trunc(absolu / 60)).padStart(2, '0');
  const restantes = String(absolu % 60).padStart(2, '0');
  return `UTC${minutes < 0 ? '−' : '+'}${heures}:${restantes}`;
};
