## Ce que le rang 1 cachait, en trois défauts disjoints

Le même raccourci — `user.systemLanguage || 'xx'` — produit trois pannes qui ne
se ressemblent pas, et n'en corriger qu'une laisse les deux autres :

1. **RANG.** Un rang 1 vide ne fait pas tomber au rang 2 : il fait tomber au
   **repli**. Un lecteur qui n'a renseigné que `regionalLanguage: 'es'` reçoit
   ses e-mails en anglais.
2. **NORMALISATION.** Les prefs sont persistées verbatim. Quand la langue sert
   ensuite de **CLÉ** dans une carte de traductions, `'pt-BR'` ne matche rien et
   le contenu retombe sur la langue de l'AUTEUR — alors qu'une traduction `pt`
   existe, deux clés plus loin.
3. **FORMAT.** Une langue résolue ne suffit pas si l'horodatage qui l'accompagne
   est formaté par un binaire codé en dur
   (`systemLanguage === 'en' ? 'en-US' : 'fr-FR'`). Un lecteur allemand recevait
   un titre allemand — `notificationString` normalise, lui — **daté à la
   française**.
