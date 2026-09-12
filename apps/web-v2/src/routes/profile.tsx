import { PendingScreen } from '@/components/pending-screen';
import { PROFILE_DESTINATION } from '@/lib/view/floating-menu';

/**
 * LE PROFIL — miroir `ProfileView`. Il n'est PAS un barreau : iOS l'ouvre au second tap ou à l'appui long sur l'avatar du bouton de droite (`RootView.swift:1570-1579`). Son adresse complète l'espace `/me` déjà ouvert par `/me/progression` (#5547).
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function ProfileScreen() {
  return <PendingScreen destination={PROFILE_DESTINATION} />;
}
