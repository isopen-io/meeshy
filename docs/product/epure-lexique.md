# Lexique de l'épure

Référence de **vocabulaire** de l'épure des interfaces (#17584, socle #17587) : un concept, son libellé court, dans les sept langues. Web, iOS et Android prennent le même mot. Ce fichier ne porte aucun état de tâche — l'état vit dans les issues.

**Règles de tenue.**
- Une ligne par concept, triées par identifiant de concept.
- Un libellé NOMME (règle 1) ; un titre de section porte le verbe, une rangée un nom (règle 3).
- La colonne « Remplace » cite le libellé long que le libellé court remplace à l'écran : ce texte-là ne disparaît pas, il passe derrière un (i), une fiche ou « Plus ».
- La colonne « Déjà partagé par » cite les clés qui portent déjà ce mot ; « — » signale un concept neuf, dont la traduction est proposée ici et se relit à la première PR qui l'emploie.
- Un concept absent : le libellé du web s'il est déjà fusionné, sinon une proposition dans la PR (section « Lexique »).

Amorcé le 2026-11-11 depuis les remplacements de texte du prototype web (`.claude/workflows/meeshy-epure-interfaces/prototype-rules.json`) et les libellés que les trois plateformes partagent déjà.

| Concept | fr | en | es | pt | de | it | ar | Remplace | Déjà partagé par |
|---|---|---|---|---|---|---|---|---|---|
| `action.add` | Ajouter | Add | Añadir | Adicionar | Hinzufügen | Aggiungi | إضافة | « Ajouter mon numéro » | iOS `onboarding.friends.add` · Android `connection_action_add` |
| `action.cancel` | Annuler | Cancel | Cancelar | Cancelar | Abbrechen | Annulla | إلغاء | — | iOS `2fa_cancel` · web `stickerPacks.cancel` |
| `action.choose` | Choisir | Choose | Elegir | Escolher | Auswählen | Scegli | اختيار | « Choisir mon atmosphère » | iOS · web `profile.language.choose` · Android `profile_language_choose` |
| `action.close` | Fermer | Close | Cerrar | Fechar | Schließen | Chiudi | إغلاق | — | iOS `2fa_close` · web `callControls.close` · Android `audio_editor_close` |
| `action.create` | Créer | Create | Crear | Criar | Erstellen | Crea | إنشاء | « Créer la communauté » | iOS `common.create` · Android `new_conversation_create` |
| `action.create_link` | Créer le lien | Create the link | Crear el enlace | Criar o link | Link erstellen | Crea il link | إنشاء الرابط | « Créer le lien de partage » | iOS `affiliate.create.button` · Android `links_affiliate_create_button` |
| `action.delete` | Supprimer | Delete | Eliminar | Excluir | Löschen | Elimina | حذف | — | iOS `comment.action.delete` · web `linkDetail.edit.delete` |
| `action.more` | Plus | More | Más | Mais | Mehr | Altro | المزيد | — (règle 6 : le rare derrière « Plus ») | iOS `composer.rail.plus` · Android `viewer_more` |
| `action.save` | Enregistrer | Save | Guardar | Salvar | Speichern | Salva | حفظ | — | iOS `composer.edit.save` · web `linkDetail.edit.save` |
| `empty.sounds` | Aucun son | No sound | Sin sonido | Sem som | Kein Ton | Nessun suono | لا يوجد صوت | « Aucun son dans votre bibliothèque » | iOS `story.audioPanel.noAudio` |
| `game.ancestor_signs` | Signes des aïeux | Ancestors’ signs | Signos de los ancestros | Sinais dos ancestrais | Zeichen der Ahnen | Segni degli antenati | علامات الأسلاف | « Afficher les signes des aïeux » | — |
| `game.intro` | Le jeu en sept cartes | The game in seven cards | El juego en siete cartas | O jogo em sete cartas | Das Spiel in sieben Karten | Il gioco in sette carte | اللعبة في سبع بطاقات | « Salut, c’est Mee… » | — |
| `game.notifications` | Notifications | Notifications | Notificaciones | Notificações | Mitteilungen | Notifiche | الإشعارات | « Recevoir les notifications du jeu » | iOS `settings.notifications.title` · web `root.menu.notifications` |
| `link.allow` | Autoriser | Allow | Permitir | Permitir | Erlauben | Consenti | السماح | « Permissions » (règle 3 : le titre porte le verbe) | — |
| `link.ask_guests` | Demander aux invités | Ask guests | Pedir a los invitados | Pedir aos convidados | Von Gästen verlangen | Chiedi agli ospiti | اطلب من الضيوف | « Accès invités » | — |
| `link.birth_date` | Date de naissance | Date of birth | Fecha de nacimiento | Data de nascimento | Geburtsdatum | Data di nascita | تاريخ الميلاد | « Date de naissance requise » | iOS `voice.profile.wizard.birthDate` · web `linkDetail.config.asked.birthday` |
| `link.description` | Description | Description | Descripción | Descrição | Beschreibung | Descrizione | الوصف | « Description (facultative) » | iOS `about.section.description` · Android `community_create_field_description` |
| `link.email` | E-mail | Email | Correo | E-mail | E-Mail | E-mail | البريد الإلكتروني | « E-mail requis » | iOS `contact-card.field.email` · web `linkDetail.config.asked.email` · Android `auth_email_label` |
| `link.family.affiliate` | Parrainage | Referral | Referidos | Indicação | Empfehlung | Referral | الإحالة | « Liens de parrainage » | iOS `affiliate.title` · web `linkFamilies.affiliate.title` · Android `links_affiliate_title` |
| `link.family.community` | Communautés | Communities | Comunidades | Comunidades | Communities | Community | المجتمعات | « Liens communauté » | iOS `communities.title` · Android `community_list_title` |
| `link.family.share` | Partage | Sharing | Compartir | Compartilhamento | Teilen | Condivisione | مشاركة | « Liens de partage » | — |
| `link.family.tracking` | Suivi | Tracking | Seguimiento | Rastreamento | Tracking | Tracciamento | التتبّع | « Liens de suivi » | iOS `widget.preview.tracking` |
| `link.meeshy_account` | Compte Meeshy | Meeshy account | Cuenta Meeshy | Conta Meeshy | Meeshy-Konto | Account Meeshy | حساب Meeshy | « Compte requis » | iOS `shareLink.detail.meeshyAccount` · web `linkDetail.config.account` · Android `shareLink_detail_meeshyAccount` |
| `link.perm.files` | Fichiers | Files | Archivos | Arquivos | Dateien | File | الملفات | « Envoyer des fichiers » | iOS `invite.perm.files` |
| `link.perm.history` | Historique | History | Historial | Histórico | Verlauf | Cronologia | السجل | « Voir l’historique » | iOS `invite.perm.history` · Android `invite_perm_history` |
| `link.perm.images` | Images | Images | Imágenes | Imagens | Bilder | Immagini | الصور | « Envoyer des images » | iOS `invite.perm.images` · web `settings.media_download.images` · Android `invite_perm_images` |
| `link.perm.messages` | Messages | Messages | Mensajes | Mensagens | Nachrichten | Messaggi | الرسائل | « Envoyer des messages » | iOS `invite.perm.messages` |
| `link.username` | Pseudo | Username | Usuario | Usuário | Benutzername | Nome utente | اسم المستخدم | « Pseudonyme requis » | iOS `auth.signup.identity.username` · web `profile.username` · Android `login_username_label` |
| `settings.announce_return` | Annoncer mon retour | Announce my return | Anunciar mi regreso | Anunciar meu retorno | Meine Rückkehr ankündigen | Annuncia il mio ritorno | الإعلان عن عودتي | « Prévenir mes contacts quand je reviens sur Meeshy » | — |
| `settings.auto_download` | Téléchargement auto | Auto-download | Descarga automática | Download automático | Auto-Download | Download automatico | التنزيل التلقائي | « Téléchargement automatique des médias » | iOS `settings.media.download.title` · Android `media_download_title` |
| `settings.contact_return` | Retour d’un contact | Contact is back | Regreso de un contacto | Retorno de um contato | Rückkehr eines Kontakts | Ritorno di un contatto | عودة جهة اتصال | « Quand un contact revient sur Meeshy » | — |
| `settings.hide_contact_details` | Masquer mon numéro et mon e-mail | Hide my number and email | Ocultar mi número y mi correo | Ocultar meu número e meu e-mail | Meine Nummer und E-Mail verbergen | Nascondi il mio numero e la mia e-mail | إخفاء رقمي وبريدي الإلكتروني | « Ne pas me proposer à ceux qui ont mon numéro… » | — |
| `settings.shop` | Boutique | Shop | Tienda | Loja | Shop | Negozio | المتجر | « Boutique des stickers » | iOS `settings.packs.shop` · web `stickerPacks.tab.shop` · Android `sticker_sheet_tab_shop` |
| `welcome.tagline` | Chaque message, dans votre langue. | Every message, in your language. | Cada mensaje, en tu idioma. | Cada mensagem, no seu idioma. | Jede Nachricht in deiner Sprache. | Ogni messaggio, nella tua lingua. | كل رسالة بلغتك. | « Écrivez dans votre langue, lisez… » | — |
