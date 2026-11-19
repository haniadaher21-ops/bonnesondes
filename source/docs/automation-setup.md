# Mise en place de l’automatisation

Cette PR est une proposition à tester. Les étapes externes ci-dessous requièrent
les comptes du propriétaire. Les variables d’activation restent absentes ou à
false pendant la relecture.

## 1. YouTube Data API

1. Dans ton projet Google Cloud, ouvre [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) et clique sur Activer. Dans API et services → Identifiants, crée une clé API.
2. Dans les restrictions de cette clé, choisis uniquement YouTube Data API v3. Les runners GitHub hébergés utilisent des adresses IP variables. Une restriction HTTP referrer convient à un navigateur, pas à ce runner serveur. Pour une restriction IP stricte, utilise un runner avec une IP de sortie fixe et autorise uniquement cette IP.
3. Dans [les secrets Actions de Bonnes Ondes](https://github.com/haniadaher21-ops/bonnesondes/settings/secrets/actions), ajoute un repository secret nommé YOUTUBE_DATA_API_KEY. Conserve sa valeur dans Google Cloud et ce champ secret.

Après intégration et configuration du serveur privé, lance l’action
« Bonnes Ondes · Observation et publication » avec mode observe. Le résumé doit
compter de vraies vidéos vérifiées. Un secret inaccessible ou un quota atteint
bloque la sélection des lives. Révoque la clé dans Google Cloud et remplace le
secret GitHub pour la renouveler.

videos.list coûte une unité par requête, avec au plus 50 vidéos par requête.
Consulte la page Quotas de ton projet pour le budget disponible. Les quotas
YouTube sont distincts de la facturation des autres services Google Cloud.
Cette application n’active aucun autre service payant.
[Quotas officiels](https://developers.google.com/youtube/v3/determine_quota_cost).

## 2. Stockage et connexion du propriétaire

La solution proposée utilise Supabase Auth et Postgres. Les données restent
dans un schéma privé, avec des fonctions limitées aux opérations nécessaires.
Le navigateur utilise une clé publique de projet et une session du propriétaire.
Le runner utilise un jeton distinct qui peut lire le profil et conserver son
index, mais ne peut pas modifier les préférences.

1. Crée un projet dans [Supabase](https://supabase.com/dashboard). Choisis la région et le plan en connaissance de ses quotas. Dans Authentication, invite ton propre compte puis désactive les inscriptions publiques. Conserve le modèle de courriel par défaut et configure Site URL et Redirect URLs à https://haniadaher21-ops.github.io/bonnesondes/ ; le site utilise désormais un lien de connexion PKCE. Voir [le guide](magic-link-auth.md).
2. Exécute source/private-sync/schema.sql dans le SQL Editor du projet. Dans Authentication → Users, copie ton UUID, puis insère une ligne dans bonnes_ondes_private.owners avec cet UUID. Le profil est inaccessible à tout autre compte, même connecté. Aucun rôle de service privilégié n’est utilisé par le site.
3. Génère un jeton aléatoire de 32 octets pour le runner. Conserve le jeton brut comme secret Actions BONNES_ONDES_RUNNER_TOKEN. Insère uniquement son SHA-256 dans bonnes_ondes_private.runner.token_hash, avec ton UUID. Le jeton peut être produit par encode(extensions.gen_random_bytes(32),'hex') dans une session SQL privée. Le hachage stocké est extensions.digest(jeton,'sha256'). Garde cette opération hors du dépôt et des logs publics.

Ajoute comme variables Actions SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY, depuis
les paramètres du projet. Ce sont l’URL et la clé publique, distinctes d’une clé
secret/service-role. Pour un build manuel du site, utilise ces mêmes valeurs
avec NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Le workflow
les transmet au build de la release. Elles peuvent être visibles dans le client,
alors que le jeton du runner reste réservé aux secrets Actions.

Dans Ma collection → Mon profil musical → Synchronisation privée, connecte-toi
et choisis si tu conserves le profil local ou charges le profil distant. Après
ce consentement initial, les préférences enregistrées et les réactions sont
envoyées automatiquement. Le dernier profil confirmé reste disponible pour le
runner lorsque le navigateur est fermé. Une connexion expirée ou un conflit
est affiché dans l’interface. Les erreurs temporaires sont réessayées. Une
révision distante modifiée demande de choisir de nouveau le profil à conserver.

Se déconnecter arrête les prochains envois. Le bouton d’effacement supprime le
profil distant et révoque le jeton du runner. Les favoris locaux restent
accessibles. Pour révoquer tout accès côté serveur, supprime les lignes du
propriétaire dans les trois tables privées et les secrets GitHub, puis révoque
les sessions Auth dans Supabase. Pour transférer le service, exporte les tables
privées dans un environnement privé et restaure-les avec les mêmes règles.

Le plan Free comporte notamment une limite de taille et une suspension pour
inactivité. Une tâche quotidienne permet de détecter un serveur suspendu, mais
ne constitue pas une garantie de disponibilité. Le plan Pro est annoncé à
partir de 25 USD/mois, avec usage supplémentaire possible. Le fournisseur peut
modifier ses tarifs. Configure les limites de dépense et notifications dans
Supabase avant toute souscription.
[Tarifs Supabase](https://supabase.com/pricing),
[clés publiques et privées](https://supabase.com/docs/guides/getting-started/api-keys),
[connexion par lien email](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## 3. Observation avant activation

Après relecture et intégration du code, configure les secrets et le serveur,
puis exécute trois cycles observe avec des collectes réelles. Les cycles
collect enregistrent les candidats publics non sélectionnés dans le serveur
privé. Le profil, les réactions et les rapports personnalisés restent hors
des artefacts publics. Le résumé Actions donne seulement des compteurs,
les sources d’albums contrôlées et les catégories d’erreurs.

Une observation n’est réussie que lorsque tous les quotas et liens passent,
que le brouillon est conforme et que son export compile. Les trois succès
doivent correspondre au même code/configuration et à la même révision du
profil. Ils expirent après quatorze jours. Un profil modifié demande de refaire
ces contrôles avant une publication. Les dates originales, URLs et signatures
de vérification sont recontrôlées lors de la sélection. Les vidéos en cache
expirent après vingt-huit jours. Les autres candidats après soixante jours.

Le catalogue ne garantit pas trois albums chaque semaine. Les sources bloquées,
les rééditions et les albums sans lien Spotify confirmé sont exclus. Le
résumé indique le manque. Les observations réelles et leurs résultats figurent
dans le rapport de cette PR. Un changement de préférence influence le score
avec des signaux explicites, sans historique personnel issu de Spotify.

## 4. Activation après validation du propriétaire

Avec accord explicite, règle COLLECTION_ENABLED à true pour les collectes
quotidiennes de 09 h 17 Europe/Paris et le cycle du dimanche à 18 h. Règle
AUTO_PUBLISH_ENABLED à true uniquement après les observations concluantes.
Ces variables sont des opt-ins et leur absence équivaut à false.

Le cycle du dimanche vise lundi à 00 h Europe/Paris. Un déclenchement retardé
au lundi conserve ce lundi. Un lancement hors cycle est bloqué pour la
publication. Les fuseaux des cron sont Europe/Paris. Les tests couvrent les
deux changements d’heure. GitHub peut retarder ou suspendre des planifications.
Surveille les notifications Actions et l’activité du dépôt.
[Planification GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

La release est construite dans un dossier temporaire. Seuls les champs
éditoriaux publics et leurs justifications de source rejoignent l’édition,
avec les exports HTML/CSS/JS. Les raisons personnelles de classement et les
réactions restent privées. Si main a évolué depuis le checkout, le push échoue
et un nouveau cycle doit reprendre la version courante. Un startsOn déjà présent
produit un no-op. Les éditions précédentes et les IDs sont conservés.

L’export est commité sur main, avec le préfixe /bonnesondes. La requête Pages
explicite est nécessaire car un push utilisant GITHUB_TOKEN ne déclenche pas
les workflows ordinaires. Vérifie les permissions Actions contents/pages et
les règles de protection de main avant activation. La configuration Pages
doit rester celle qui sert main à la racine.

Pour arrêter, remets AUTO_PUBLISH_ENABLED à false. Pour arrêter aussi la
collecte, remets COLLECTION_ENABLED à false. Pour revenir à une release stable,
revert le commit de contenu de la semaine via une PR. Si le commit a réussi mais
Pages a échoué, relance uniquement le build Pages depuis le commit de release.

Les échecs du workflow apparaissent dans Actions. Active les notifications
d’échecs dans les paramètres GitHub du propriétaire. Les minutes Actions et
le stockage sont soumis au plan du dépôt et aux quotas GitHub. Aucun modèle
IA ou service de génération payant n’est utilisé.
[Facturation GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Limites de validation de cette PR

Les tests locaux vérifient les règles et les échanges HTTP avec un transport
de test. Les fournisseurs publics sont aussi interrogés dans les essais réels.
La création des comptes, les clés et l’exécution sur le Supabase du propriétaire
exigent sa configuration externe. Un test simulé de transport n’est pas une
validation des autorisations d’un serveur déployé. Les essais de bout en bout
avec YouTube et le stockage privé restent requis avant activation.


## Collecte incrémentale et revue des recommandations

Les workflows quotidiens et hebdomadaires passent par `private-cycle.mjs`, qui lit à chaque exécution la dernière révision consentie dans Supabase. Aucun profil neutre de fixture ne remplace le profil du propriétaire. Les artistes, radios, médias, noms de curateurs et tags publics confirmés influencent l’ordre et les scores ; aucune analyse d’écoute Spotify ni modèle ML n’est ajouté. Un curateur renseigné uniquement par URL, sans connecteur public vérifié, reste une limite explicite.

L’index roulant reste dans la table privée du runner. Il conserve les découvertes non retenues, leur premier repérage, la dernière collecte et les traces des 90 collectes précédentes. Les favoris et le profil du propriétaire ne sont jamais modifiés par le runner. Une lecture après écriture confirme la persistance ; la concurrence des workflows privés est sérialisée. Une révocation ou modification de profil pendant la collecte interrompt le cycle. L’absence de source ne supprime plus la découverte ; elle retire sa vérification courante jusqu’à nouvelle preuve.

Les catalogues primaires sont configurés dans `editorial/album-catalogues.json`. Le snapshot conserve uniquement des métadonnées publiques, jamais le HTML intégral. Sa durée de cache maximale est de six heures pour les sources disponibles ; un changement de code/configuration ou de semaine force une nouvelle collecte. Les rapports en erreur ont un cache limité à une heure pour laisser le fournisseur récupérer. Les pages des albums sont de nouveau vérifiées avant sélection. Les correspondances Spotify déjà confirmées sont réutilisées puis recontrôlées par oEmbed, pour ne pas dépendre d’un nouvel appel MusicBrainz à chaque passage.

Bandcamp doit confirmer identité artiste/titre, `album_release_date`, date du MusicAlbum et type AlbumRelease. Les titres marqués réédition/remaster/EP, mentions d’édition originale antérieure et sorties de moins de cinq pistes sont exclus. Cette règle prudente écarte aussi certains albums légitimes courts : ils ne sont pas assimilés automatiquement à des singles, mais ne peuvent remplir le quota sans un adaptateur primaire plus précis. Les doubles singles rencontrés pendant la collecte réelle ne remplissent donc pas les places albums.

Les liens Spotify viennent d’un lien d’album explicite, d’une page de diffusion officielle reliée par le label, ou d’une relation MusicBrainz avec correspondance exacte artiste+titre. MusicBrainz n’est jamais la preuve de date originale. Le connecteur s’identifie, respecte au moins 1,1 seconde entre requêtes, limite les recherches à huit albums par exécution et réessaie une fois les erreurs transitoires. Une ambiguïté ou indisponibilité est rapportée, jamais transformée en résultat vérifié. Documentation : https://musicbrainz.org/doc/MusicBrainz_API et https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting. Aucun compte ni paiement supplémentaire n’est activé.

L’action « Observer les recommandations privées » exécute une collecte puis trois observations avec le profil synchronisé. Elle refuse des opt-ins activés et n’a que des permissions GitHub en lecture. Elle peut écrire l’index public-métadonnées dans le stockage privé existant, mais pas modifier les goûts, les éditions ou Pages. L’artefact de sept jours contient les recommandations sélectionnées, leurs preuves, scores et manques. Il ne contient ni profil brut, réactions détaillées, playlists suivies privées, jetons ni cache intégral. Le propriétaire a explicitement demandé la revue de ces recommandations. Les catégories de signaux et leur nombre sont agrégés.

Un statut bloqué conserve ses recommandations partielles pour examen, mais ne valide pas une simulation complète. Les essais successifs le même jour prouvent la persistance et le fonctionnement courant, pas la stabilité sur plusieurs semaines. L’autopublication reste à false jusqu’à une nouvelle décision explicite du propriétaire.


Les sous-domaines Bandcamp partagent la même file de requêtes (au moins 1,1 seconde entre départs). Le premier HTTP 429 suspend les requêtes de tout ce fournisseur et enregistre au moins une heure de pause dans l’état privé, prolongée si Retry-After le demande. Aucune nouvelle IP, proxy ou identité n’est utilisée pour contourner la limite. Les vérifications indispensables restent bloquées pendant cette pause ; une preuve primaire alternative peut débloquer l’album. Le connecteur Brownswood accepte uniquement un article identifié artiste+titre qui affirme explicitement « Today marks the release of » pour un album nouveau/de début, avec sa date de publication d’origine. Un simple article de critique ou une annonce « coming soon » ne donne pas de date de sortie.
