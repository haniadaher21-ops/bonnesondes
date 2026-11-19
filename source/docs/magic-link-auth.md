# Connexion par lien Supabase sur GitHub Pages

## Configuration du projet Supabase (avant publication)

Dans **Authentication → URL Configuration**, enregistrer :

- **Site URL** : `https://haniadaher21-ops.github.io/bonnesondes/`
- **Redirect URLs** : ajouter exactement `https://haniadaher21-ops.github.io/bonnesondes/`

Supprimer localhost comme Site URL de production. Le code demande explicitement ce retour ; Supabase peut revenir à la Site URL si le retour n’est pas autorisé. Aucun joker ni nouvelle route serveur n’est nécessaire. Le callback est la page statique existante, avec `?code=…`, puis revient à `#preferences`.

Le modèle de courriel par défaut avec son lien de confirmation convient. Aucun changement de modèle, SMTP personnalisé, clé secrète supplémentaire ou abonnement payant n’est requis par cette modification. Les quotas et restrictions du fournisseur d’emails Supabase continuent de s’appliquer. Le compte doit déjà exister dans Auth et être autorisé dans `bonnes_ondes_private.owners` ; la création publique de comptes reste désactivée par la demande.

## Parcours et sécurité

1. Saisir l’adresse du compte et demander un lien depuis le site.
2. Ouvrir **le dernier lien reçu dans le même navigateur et sur le même appareil**. Un nouvel onglet convient ; un navigateur privé différent ne convient pas. En cas d’expiration ou de mauvais navigateur, demander un nouveau lien depuis le navigateur souhaité. Ne pas réutiliser une ancienne invitation ou un ancien lien envoyé avant cette correction.
3. Le callback échange le code contre une session avec un vérificateur PKCE S256 aléatoire de 256 bits conservé dans le navigateur, au plus une heure. Il retire immédiatement les paramètres d’authentification de l’URL. Les fragments de tokens hérités sont retirés et refusés, pas importés. Aucun paramètre de destination fourni par le lien n’est suivi.
4. Choisir explicitement « Synchroniser les préférences de ce navigateur » ou charger le profil distant. Se connecter seul ne donne pas un nouveau consentement de sauvegarde. Un consentement précédent actif conserve le comportement de reprise existant.

Le vérificateur est à usage unique. Une demande plus récente remplace la précédente ; une erreur d’échange nécessite un nouveau lien. Le code, les tokens et le vérificateur ne sont jamais journalisés. La session continue d’utiliser le stockage local et le renouvellement existants. Les clés du profil, des favoris et des réactions restent inchangées ; le callback ne les réécrit pas. La déconnexion et l’effacement distant conservent les données musicales locales.

## Revue et validation avant déploiement

`npm test`, `npm run typecheck`, `npm run build` depuis `source/`. Les tests couvrent S256, la destination Pages, les échanges, les erreurs, l’expiration, le refus des tokens implicites, le nettoyage d’URL et la préservation des données. Le workflow « Préparer les fichiers GitHub Pages » construit un artefact avec les variables publiques validées et refuse de fonctionner si `COLLECTION_ENABLED` ou `AUTO_PUBLISH_ENABLED` sont activées. Il ne déploie rien.

Les fichiers racine actuellement publiés ne doivent être remplacés qu’après revue et accord de publication, à partir de l’artefact du commit approuvé, en conservant les anciens assets hachés. Cette PR ne fusionne et ne déploie rien. La réception d’un vrai courriel et le premier enregistrement consenti seront vérifiés avec le propriétaire après configuration des URL et publication approuvée. Le test du runner Supabase nécessite ce premier enregistrement.

Références : [PKCE Supabase](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [URLs de retour](https://supabase.com/docs/guides/auth/redirect-urls), [connexion sans mot de passe](https://supabase.com/docs/guides/auth/auth-email-passwordless).
