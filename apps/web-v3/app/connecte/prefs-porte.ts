import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { actifsTempsReel } from '@/lib/actifs-rt';
import type { Recuperateur } from '@/lib/api/compte';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { basculeUnePreference, preferencesDeNotification } from '@/lib/api/preferences';
import { CLES_DE_PREFS, estUneCleDePrefs, type CleDePreference } from '@/lib/contenu/prefs-de-notif';
import type { NotificationPreference } from '@meeshy/shared/types/preferences';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDesPrefs, type EtatDesPrefs } from './prefs-vue';
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

const regleDeLURL = (requete: Request): CleDePreference | null => {
  const valeur = new URL(requete.url).searchParams.get('regle');
  return valeur !== null && estUneCleDePrefs(valeur) ? valeur : null;
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

const etatDepuisDocument = (
  reglages: NotificationPreference,
  options: { readonly regleAppliquee: CleDePreference | null; readonly echec: boolean },
): EtatDesPrefs => ({
  reglages: Object.fromEntries(CLES_DE_PREFS.map((cle) => [cle, Boolean(reglages[cle])])) as Record<
    CleDePreference,
    boolean
  >,
  dndStartTime: typeof reglages.dndStartTime === 'string' ? reglages.dndStartTime : DND_PAR_DEFAUT.debut,
  dndEndTime: typeof reglages.dndEndTime === 'string' ? reglages.dndEndTime : DND_PAR_DEFAUT.fin,
  regleAppliquee: options.regleAppliquee,
  echec: options.echec,
  tempsReel: moduleDeParticipation(),
});

const sert = async ({
  jeton,
  regleAppliquee,
  echec,
  recuperer,
}: {
  readonly jeton: string;
  readonly regleAppliquee: CleDePreference | null;
  readonly echec: boolean;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const issue = await preferencesDeNotification({ jeton, recuperer });

  if (issue.genre === 'session-expiree') return versLaConnexion();
  if (issue.genre !== 'document') return rendu(documentDePanne(), 503);

  return rendu(documentDesPrefs(etatDepuisDocument(issue.reglages, { regleAppliquee, echec })));
};

export const PREFERENCES = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  if (requete.method !== 'POST') {
    return sert({ jeton, regleAppliquee: regleDeLURL(requete), echec: false, recuperer });
  }

  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const formulaire = await requete.formData().catch(() => null);
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
  return sert({ jeton, regleAppliquee: null, echec: true, recuperer });
};
