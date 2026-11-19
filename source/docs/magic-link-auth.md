# Connexion par lien Supabase sur GitHub Pages

## Configuration du projet Supabase (avant publication)

Dans **Authentication → URL Configuration**, enregistrer :

- **Site URL** : `https://haniadaher21-ops.github.io/bonnesondes/`
- **Redirect URLs** : ajouter exactement `https://haniadaher21-ops.github.io/bonnesondes/`

Supprimer localhost comme Site URL de production. Le code demande explicitement ce retour ; Supabase peut revenir à la Site URL si le retour n’est pas autorisé. Aucun joker ni nouvelle route serveur n’est nécessaire. Le callback est la page statique existante, avec `?code=…`, puis revient à `#preferences`.

Le flux proposé vise le modèle de courriel par défaut avec son lien de confirmation, sans personnalisation ni abonnement. Sa compatibilité réelle avec ce projet Supabase Free reste à vérifier après publication approuvée : les tests simulés ne prouvent pas que le courriel retournera effectivement un code PKCE. Aucun changement de modèle, SMTP personnalisé ou clé secrète supplémentaire n’est introduit par cette PR. Les quotas et restrictions du fournisseur d’emails Supabase continuent de s’appliquer. Le compte doit déjà exister dans Auth et être autorisé dans `bonnes_ondes_private.owners` ; la création publique de comptes reste désactivée par la demande.

## Parcours et sécurité

1. Saisir l’adresse du compte et demander un lien depuis le site.
2. Ouvrir **le dernier lien reçu dans le même navigateur et sur le même appareil**. Un nouvel onglet convient ; un navigateur privé différent ne convient pas. En cas d’expiration ou de mauvais navigateur, demander un nouveau lien depuis le navigateur souhaité. Ne pas réutiliser une ancienne invitation ou un ancien lien envoyé avant cette correction.
3. Le callback échange le code contre une session avec un vérificateur PKCE S256 aléatoire de 256 bits conservé dans le navigateur, au plus une heure. Il retire immédiatement les paramètres d’authentification de l’URL. Les fragments de tokens hérités sont retirés et refusés, pas importés. Aucun paramètre de destination fourni par le lien n’est suivi.
4. Choisir explicitement « Synchroniser les préférences de ce navigateur » ou charger le profil distant. Se connecter seul ne donne pas un nouveau consentement de sauvegarde. Un consentement précédent actif conserve le comportement de reprise existant.

Le vérificateur est à usage unique. Une demande plus récente remplace la précédente ; une erreur d’échange nécessite un nouveau lien. Le code, les tokens et le vérificateur ne sont jamais journalisés. La session continue d’utiliser le stockage local et le renouvellement existants. Les clés du profil, des favoris et des réactions restent inchangées ; le callback ne les réécrit pas. La déconnexion et l’effacement distant conservent les données musicales locales.

## Revue et validation avant déploiement

`npm test`, `npm run typecheck`, `npm run build` depuis `source/`. Les tests couvrent S256, la destination Pages, les échanges, les erreurs, l’expiration, le refus des tokens implicites, le nettoyage d’URL et la préservation des données. Le workflow « Préparer les fichiers GitHub Pages » construit un artefact avec les variables publiques validées et refuse de fonctionner si `COLLECTION_ENABLED` ou `AUTO_PUBLISH_ENABLED` sont activées. Il ne déploie rien.

La PR inclut maintenant les fichiers statiques racine issus de l’artefact du commit source exact `3e7971a65184cb822ddb3329f954e7efc00b3781`, avec les anciens assets hachés conservés. La provenance et les empreintes des 24 fichiers exportés sont dans `pages-release.json`. Ils ne seront servis au public qu’après fusion et publication explicitement approuvées. Cette PR ne fusionne et ne déploie rien. La réception d’un vrai courriel et le premier enregistrement consenti seront vérifiés avec le propriétaire après configuration des URL et publication approuvée. Le test du runner Supabase nécessite ce premier enregistrement.

Références : [PKCE Supabase](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [URLs de retour](https://supabase.com/docs/guides/auth/redirect-urls), [connexion sans mot de passe](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Recette réelle après accord de mise en ligne

1. Après revue, obtenir l’accord explicite de fusion **et** publication. Vérifier Pages sur le commit approuvé, les scripts/CSS/images et la présence de « Recevoir un lien de connexion ». Garder `COLLECTION_ENABLED` et `AUTO_PUBLISH_ENABLED` absentes ou à `false` ; ne pas approuver l’édition 002.
2. Le propriétaire demande un nouveau lien sur `https://haniadaher21-ops.github.io/bonnesondes/#preferences` et ouvre le courriel dans le même navigateur. Ne jamais copier le lien, le code, le vérificateur ou les tokens dans le chat, une capture, les logs ou la PR.
3. Constater la connexion réussie et l’URL nettoyée finissant par `#preferences`. Ne consigner que succès/échec, type de callback (code ou fragment), statut HTTP et heure du contrôle. Les erreurs affichées ne contiennent pas le contenu privé du message.
4. Si le fournisseur retourne un fragment de session, le callback le refuse : interrompre la recette, conserver les données locales et proposer une solution compatible Free sans abaisser la vérification de sécurité. Ne pas annoncer le bug réparé sur la seule base des tests simulés.
5. Le propriétaire relit ses préférences, puis clique lui-même sur « Synchroniser les préférences de ce navigateur ». Attendre « Préférences et réactions synchronisées ». Recharger pour vérifier la persistance ; préserver les favoris existants.
6. Relancer uniquement le contrôle d’intégration privé de la PR #17, sans fusionner cette PR ni activer de collecte/publication. Vérifier que le runner lit le profil et sa révision après fermeture du navigateur et que les accès anonymes/non autorisés restent refusés. Publier seulement le résultat et la révision, sans préférences détaillées, adresse email, clé ni token.

Le réglage des URL est déclaré terminé par le propriétaire ; il ne constitue pas à lui seul un test de connexion. La recette réelle reste en attente de publication approuvée.
