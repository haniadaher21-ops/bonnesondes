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

1. Enregistre tes préférences dans le formulaire. Dans « Synchronisation privée », saisis l’adresse de ton compte Supabase, clique sur « Recevoir un lien de connexion », puis ouvre le dernier lien reçu dans le même navigateur et sur le même appareil (un nouvel onglet convient).
2. Clique sur « Synchroniser les préférences de ce navigateur » pour consentir à l’envoi du profil et des réactions de Bonnes Ondes. Attends « Préférences et réactions synchronisées ».
3. Ferme cet onglet puis indique que la sauvegarde est faite. Le contrôle Actions de la PR #17 vérifiera la lecture du profil par le runner, indépendamment du navigateur.

Ton compte doit déjà exister dans Supabase Auth et être autorisé dans
bonnes_ondes_private.owners. Le modèle d’email Supabase par défaut convient : aucune personnalisation ni fournisseur SMTP payant ne sont nécessaires. Les anciens liens doivent être remplacés par une nouvelle demande. Voir [la configuration des liens](magic-link-auth.md).

La déconnexion arrête les envois suivants et conserve le dernier profil sur
le serveur. Le bouton d’effacement supprime ce profil distant et révoque
l’accès du runner. Les favoris locaux restent disponibles.

## Rétablir la version précédente

En cas d’erreur après publication, revert le commit de merge de cette release
dans une PR, puis relancer Pages après validation. Les données de navigateur
et les lignes privées Supabase ne font pas partie des fichiers statiques.

## Validation de l’export

Le build Actions de la release a validé les deux opt-ins désactivés, puis
exécuté les 30 tests, TypeScript et Next.js. Le ZIP vérifié est celui de
l’artefact bonnes-ondes-pages-interface du run 44544976936. Son SHA-256 est
1d005026b3a1cd5f281fa0a4232dd3c21ad012e23d1e47b90705e90806647099.

Les fichiers de ce ZIP sont recopiés à la racine du dépôt. Les anciens assets
hachés sont conservés pour permettre aux pages déjà en cache de charger leurs
scripts. Le nouvel index.html référence les fichiers de la release.

Le contrôle Chromium de cet export couvre l’édition 001, les accès directs,
les chemins CSS/JS/image, le profil enregistré après rechargement, la présence
du formulaire Supabase, les favoris et réactions préexistants, les filtres
Playlists et les URLs des lecteurs. La première connexion réelle du propriétaire
aura lieu après approbation et publication de la release.
