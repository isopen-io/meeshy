/**
 * UNE ARRIVÉE CÉLÉBRÉE MÈNE AUX CONVERSATIONS (#8088) — la page d'arrivée du
 * lien de validation renonce à la PROCHAINE proposition du parcours d'accueil
 * (#7729) : la demande porteur est « puis afficher la page de conversation »,
 * pas l'onboarding. La renonciation ne vaut qu'une arrivée ; le parcours se
 * repropose au lancement suivant (`landing.ts`, « une fois par lancement »).
 *
 * Module SANS dépendance : partagé par la page d'arrivée et `landing.ts`,
 * il ne tire rien d'autre dans leurs chunks.
 */
let waived = false;

export function waiveNextOnboardingOffer(): void {
  waived = true;
}

export function takeOnboardingWaiver(): boolean {
  const taken = waived;
  waived = false;
  return taken;
}
