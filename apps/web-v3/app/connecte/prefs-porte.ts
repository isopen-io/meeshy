import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { fuseauDuLecteur, jetonDuLecteur } from '@/app/session';
import { actifsTempsReel } from '@/lib/actifs-rt';
import type { Recuperateur } from '@/lib/api/compte';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { decalageDuFuseau } from '@/lib/decalage-utc';
import { basculeUnePreference, ecrisUnePreference, preferencesDeNotification, type DocumentDeNotification } from '@/lib/api/preferences';
import { estUnFuseauDnd, estUneCleDePrefs, HEURE_DND_REGEX, CLES_DE_PREFS, FUSEAU_AUTO, PREFS, type CleDePreference } from '@/lib/contenu/prefs-de-notif';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDesPrefs, type EtatDesPrefs, type RegleAppliquee } from './prefs-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/notifications/preferences` — le même patron que
 * `notifs-porte.ts` (spécification § 3, § 4 étape 4) : les trois questions
 * (un jeton ? la passerelle l'accepte-t-elle ? a-t-elle répondu ?), un 401 qui
 * renvoie se connecter (le cas NOMINAL d'un retour après quelques jours), un
 * silence qui dessine la panne plutôt qu'une page blanche.
 *
 * UNE ÉCRITURE = UNE CLÉ, VALIDÉE FAIL-CLOSED. Le corps posté ne porte que
 * `cle` et `valeur` ; une `cle` qui n'appartient pas à `CLES_DE_PREFS`
 * (`lib/contenu/prefs-de-notif.ts`, site unique de la table) est un 400 SANS
 * qu'un seul octet ne parte vers la passerelle — la protection structurelle
 * que le legacy n'avait pas (spécification § 1 « Ce que fait le legacy »).
 *
 * L'ORIGINE EST VÉRIFIÉE AVANT TOUT. Un POST déclenché depuis un autre site
 * changerait un réglage de notification du lecteur à son insu — la même garde
 * que les autres surfaces d'écriture de la v3 (`app/provenance.ts`).
 *
 * UN ÉCHEC NE MENT PAS. Que le POST soit refusé par la passerelle ou que le
 * fetch échoue en amont, l'écran RE-LIT le document depuis le serveur avant de
 * le montrer : l'état affiché reste, dans les deux cas, celui de la
 * passerelle — jamais celui que le geste raté espérait.
 */

const CHEMIN = '/notifications/preferences';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`, 'cache-control': CACHE_PRIVE },
  });

const regleDeLURL = (requete: Request): RegleAppliquee => {
  const valeur = new URL(requete.url).searchParams.get('regle');
  if (valeur === null) return null;
  if (valeur === 'fenetre-dnd') return valeur;
  return estUneCleDePrefs(valeur) ? valeur : null;
};

/**
 * LE SOCLE DU MODULE DE PARTICIPATION (§ 12.4) — `null` tant que l'actif
 * compilé est absent (tests, avant le premier `bun build`) : le chemin SANS
 * JavaScript reste alors le SEUL chemin, ce qui est toujours correct. Ce
 * module N'A PAS DE SOCKET — une bascule est un aller simple, jamais un
 * événement entrant (`lib/realtime/prefs.ts`, doc-comment de tête).
 */
const moduleDeParticipation = (): EtatDesPrefs['tempsReel'] => {
  const actifs = actifsTempsReel();
  if (actifs.prefs.corps === '') return null;
  return { module: actifs.prefs.url, passerelle: baseDeLaPasserellePublique() };
};

const DND_PAR_DEFAUT = { debut: '22:00', fin: '08:00' } as const;

/**
 * LE DOCUMENT SERVI DEVIENT UN ÉTAT — et c'est ICI, au seul endroit qui les
 * connaisse, que ses valeurs descendent au type de l'écran : `Boolean()` pour
 * les treize bascules, `typeof … === 'string'` pour la fenêtre DND. Le client
 * (`lib/api/preferences.ts`) rend un `DocumentDeNotification` — des valeurs
 * INCONNUES, parce qu'aucun schéma ne les a relues — et ces coercitions en
 * sont l'unique contrôle, jamais une redondance.
 */
const etatDepuisDocument = (
  reglages: DocumentDeNotification,
  options: {
    readonly regleAppliquee: RegleAppliquee;
    readonly echec: boolean;
    readonly motif: string | null;
    readonly decalageDeLAppareil: number | null;
  },
): EtatDesPrefs => ({
  reglages: Object.fromEntries(CLES_DE_PREFS.map((cle) => [cle, Boolean(reglages[cle])])) as Record<
    CleDePreference,
    boolean
  >,
  dndStartTime: typeof reglages.dndStartTime === 'string' ? reglages.dndStartTime : DND_PAR_DEFAUT.debut,
  dndEndTime: typeof reglages.dndEndTime === 'string' ? reglages.dndEndTime : DND_PAR_DEFAUT.fin,
  dndUtcOffsetMinutes: typeof reglages.dndUtcOffsetMinutes === 'number' ? reglages.dndUtcOffsetMinutes : 0,
  decalageDeLAppareil: options.decalageDeLAppareil,
  regleAppliquee: options.regleAppliquee,
  echec: options.echec,
  motif: options.motif,
  tempsReel: moduleDeParticipation(),
});

/**
 * LE DÉCALAGE DE L'APPAREIL — mesuré depuis le cookie de fuseau que le module
 * du fil pose déjà (`lib/temps.ts` › `COOKIE_DE_FUSEAU`, site UNIQUE de
 * l'heure locale du lecteur dans la v3). Cet écran ne pose aucun cookie et
 * n'ouvre aucun second mécanisme : il LIT celui qui existe, et rend `null`
 * quand il n'est pas là — l'option « cet appareil » le dit alors, et n'écrit
 * rien.
 */
const decalageDeLAppareil = (requete: Request): number | null => {
  const fuseau = fuseauDuLecteur(requete);
  return fuseau === null ? null : decalageDuFuseau(fuseau);
};

const sert = async (
  {
    requete,
    jeton,
    regleAppliquee,
    echec,
    motif,
    recuperer,
  }: {
    readonly requete: Request;
    readonly jeton: string;
    readonly regleAppliquee: RegleAppliquee;
    readonly echec: boolean;
    /** Le motif NOMMÉ d'un refus, quand il y en a un ; `PREFS.echec` sinon. */
    readonly motif?: string;
    readonly recuperer?: Recuperateur;
  },
  statut = 200,
): Promise<Response> => {
  const issue = await preferencesDeNotification({ jeton, recuperer });

  if (issue.genre === 'session-expiree') return versLaConnexion();
  if (issue.genre !== 'document') return rendu(documentDePanne(), 503);

  return rendu(
    documentDesPrefs(
      etatDepuisDocument(issue.reglages, {
        regleAppliquee,
        echec,
        motif: motif ?? null,
        decalageDeLAppareil: decalageDeLAppareil(requete),
      }),
    ),
    statut,
  );
};

export const PREFERENCES = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  if (requete.method !== 'POST') {
    return sert({ requete, jeton, regleAppliquee: regleDeLURL(requete), echec: false, recuperer });
  }

  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const formulaire = await requete.formData().catch(() => null);

  /**
   * LE GESTE `fenetre` ÉDITE LA PLAGE DND — distinct du geste `cle`/`valeur`
   * des treize bascules (un formulaire différent, un corps différent :
   * `{ dndStartTime, dndEndTime, dndUtcOffsetMinutes? }`).
   *
   * `fuseau=auto` (`FUSEAU_AUTO`) écrit le décalage MESURÉ de l'appareil
   * quand le cookie de fuseau l'a donné, et n'écrit rien du tout sinon — la
   * valeur stockée survit, et l'option l'annonce (`PREFS.fenetreFuseauAuto`).
   * Écrire un `0` de repli aurait été pire que ne rien écrire : il RESSEMBLE
   * à un fuseau choisi (UTC) alors qu'il n'est qu'une absence de mesure, et
   * la loi qui l'applique (`notification-dnd.ts:56`) ne distingue pas les
   * deux.
   *
   * UNE HEURE ILLISIBLE SE DIT, elle ne rend pas une page vide. `<input
   * type="time">` retombe en champ TEXTE là où il n'est pas supporté : «
   * 9:00 » tapé à la main est un chemin de lecteur, pas une charge forgée,
   * et un 400 sans corps y était un écran blanc.
   */
  if (formulaire?.get('geste') === 'fenetre') {
    const debut = formulaire.get('dndStartTime');
    const fin = formulaire.get('dndEndTime');
    const fuseau = formulaire.get('fuseau');

    if (
      typeof debut !== 'string' ||
      typeof fin !== 'string' ||
      typeof fuseau !== 'string' ||
      !HEURE_DND_REGEX.test(debut) ||
      !HEURE_DND_REGEX.test(fin) ||
      !estUnFuseauDnd(fuseau)
    ) {
      return sert({ requete, jeton, regleAppliquee: null, echec: true, motif: PREFS.fenetreHeureInvalide, recuperer }, 422);
    }

    const mesure = fuseau === FUSEAU_AUTO ? decalageDeLAppareil(requete) : Number(fuseau);
    const champs =
      mesure === null
        ? { dndStartTime: debut, dndEndTime: fin }
        : { dndStartTime: debut, dndEndTime: fin, dndUtcOffsetMinutes: mesure };

    const issue = await ecrisUnePreference({ jeton, categorie: 'notification', champs, recuperer });
    if (issue.genre === 'session-expiree') return versLaConnexion();
    if (issue.genre === 'documents') {
      return redirection(`${CHEMIN}?regle=fenetre-dnd`, { 'cache-control': CACHE_PRIVE });
    }
    return sert({ requete, jeton, regleAppliquee: null, echec: true, recuperer });
  }

  const cleSoumise = formulaire?.get('cle');
  const valeurSoumise = formulaire?.get('valeur');

  if (
    typeof cleSoumise !== 'string' ||
    !estUneCleDePrefs(cleSoumise) ||
    (valeurSoumise !== 'true' && valeurSoumise !== 'false')
  ) {
    return new Response(null, { status: 400, headers: { 'cache-control': CACHE_PRIVE } });
  }

  const issue = await basculeUnePreference({
    jeton,
    cle: cleSoumise,
    valeur: valeurSoumise === 'true',
    recuperer,
  });

  if (issue.genre === 'session-expiree') return versLaConnexion();
  if (issue.genre === 'document') {
    return redirection(`${CHEMIN}?regle=${encodeURIComponent(cleSoumise)}`, { 'cache-control': CACHE_PRIVE });
  }

  // `refus` (validation, consentement) et `panne` (5xx, réseau coupé) se
  // traitent IDENTIQUEMENT ici : dans les deux cas rien n'a été écrit, et
  // l'écran RE-LIT la vérité du serveur plutôt que de l'inventer.
  return sert({ requete, jeton, regleAppliquee: null, echec: true, recuperer });
};
