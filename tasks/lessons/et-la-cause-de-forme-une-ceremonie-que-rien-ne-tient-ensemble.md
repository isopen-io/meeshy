## Et la cause de forme : une cérémonie que rien ne tient ensemble

Six sites conformes recopiaient le même passe-plat — la forme du `select`, PUIS
`resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })`.
Deux choses à ne pas rater, aucune qui rappelle l'autre. Dix-sept sites en ont
sauté au moins une.

`services/gateway/src/utils/recipient-language.ts` met la forme de la requête et
la descente dans le MÊME module, pour qu'un appelant qui importe l'une trouve
l'autre. Généralisation de la leçon 264 : **quand un résolveur exige une
cérémonie à son site d'appel, la cérémonie finira par être sautée — et le module
qui la porte doit exposer TOUT ce qu'elle demande, y compris la forme de la
requête qui l'alimente.**
