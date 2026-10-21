/**
 * **UN MÉDIA DÉJÀ SERVI PAR LA PASSERELLE NE SE RÉ-ENCODE PAS** (#11310, décision
 * #11247, milestone « une seule génération ») — un transfert, une republication
 * en story, un sticker de la bibliothèque relisent des octets que la passerelle
 * a déjà normalisés. Les recompresser ajouterait une génération de perte sans
 * rien gagner : ils repartent tels quels.
 *
 * Le site qui relit le média le fabrique par {@link servedMediaFile} ; la
 * préparation (`prepare-image-upload.ts`) lit la marque par {@link isServedMedia}
 * et ne réveille pas le worker. Seul un fichier LOCAL, choisi sur l'appareil,
 * est recompressé. La marque tient à l'IDENTITÉ du `File` : un fichier recopié
 * (`new File([servi], …)`) redevient local.
 */
const served = new WeakSet<File>();

export function servedMediaFile(bytes: BlobPart, name: string, options: FilePropertyBag): File {
  const file = new File([bytes], name, options);
  served.add(file);
  return file;
}

export const isServedMedia = (file: File): boolean => served.has(file);
