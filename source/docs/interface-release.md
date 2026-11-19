# Release de l’interface et première sauvegarde privée

Cette PR reconstruit les fichiers statiques servis par GitHub Pages et apporte
l’interface de préférences et de connexion Supabase. Le build utilise les
variables publiques du dépôt, après validation du type de clé. Le workflow
de préparation produit un artefact à vérifier, avec des permissions de dépôt
en lecture seule.

Le contenu éditorial reste celui de main. Le brouillon 002 conserve son rôle
de proposition. COLLECTION_ENABLED et AUTO_PUBLISH_ENABLED restent absentes
ou à false. La PR de release peut être fusionnée et les fichiers Pages
publiés après l’approbation explicite du propriétaire.

## Vérifier et publier après approbation

1. Relire la PR et le résultat du workflow « Préparer les fichiers GitHub Pages ». Le commit des fichiers statiques doit provenir de son artefact, construit avec le code source de la PR.
2. Après accord du propriétaire, fusionner la PR puis attendre la fin du build Pages de main.
3. Ouvrir https://haniadaher21-ops.github.io/bonnesondes/#preferences et vérifier que « Mon profil musical » et « Synchronisation privée » sont visibles. Une actualisation forcée peut être nécessaire pour les anciens fichiers en cache.

La même interface est accessible via « Ma collection → Modifier mon profil
musical ». Les favoris existants restent dans off-frequency.library.v1.

## Première connexion du propriétaire

1. Enregistre tes préférences dans le formulaire. Dans « Synchronisation privée », saisis l’adresse de ton compte Supabase, clique sur « Recevoir un code », puis saisis le code reçu pour te connecter.
2. Clique sur « Synchroniser les préférences de ce navigateur » pour consentir à l’envoi du profil et des réactions de Bonnes Ondes. Attends « Préférences et réactions synchronisées ».
3. Ferme cet onglet puis indique que la sauvegarde est faite. Le contrôle Actions de la PR #17 vérifiera la lecture du profil par le runner, indépendamment du navigateur.

Ton compte doit déjà exister dans Supabase Auth et être autorisé dans
bonnes_ondes_private.owners. Le modèle d’email Supabase doit afficher le code
OTP. Une invitation reçue avant cette configuration peut nécessiter un nouveau
code. Garde le code de connexion dans le formulaire du site.

La déconnexion arrête les envois suivants et conserve le dernier profil sur
le serveur. Le bouton d’effacement supprime ce profil distant et révoque
l’accès du runner. Les favoris locaux restent disponibles.

## Rétablir la version précédente

En cas d’erreur après publication, revert le commit de merge de cette release
dans une PR, puis relancer Pages après validation. Les données de navigateur
et les lignes privées Supabase ne font pas partie des fichiers statiques.
