/**
 * Le nom affiché d'un auteur qui n'existe plus — compte supprimé en fin de
 * grâce (#3632) ou participant disparu dont un message reste dans le fil des
 * autres (#6501).
 *
 * Il vit seul dans ce module parce que ses deux écrivains n'ont rien d'autre en
 * commun : l'anonymisation d'un compte charge le stockage des pièces jointes,
 * la réparation d'une lecture ne doit rien charger de plus que la lecture.
 */
export const DELETED_ACCOUNT_DISPLAY_NAME = 'Compte supprimé';
