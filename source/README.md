# Bonnes Ondes

Un journal de découverte musicale réalisé avec Next.js App Router, TypeScript et Tailwind CSS.

## Démarrer en local

Utilise Node.js 22 ou une version ultérieure.

```sh
npm ci
npm run dev
```

Ouvre http://localhost:3000. Les favoris, les réactions, les créateurs favoris et les playlists ajoutées sont enregistrés dans le navigateur pour cette adresse. Aucune clé API n’est nécessaire.

## Vérifier et déployer

```sh
npm run typecheck
npm run build
```

Déploie le dossier `out/` sur un hébergeur statique ou importe le projet dans Vercel avec le préréglage Next.js. Les sections utilisent des ancres. Les lecteurs Spotify, YouTube et radio utilisent les services des fournisseurs. Les liens directs donnent accès aux sources, y compris lorsque la lecture intégrée est limitée.

## Modifier la sélection

Le contenu éditorial se trouve dans `app/content.ts`. Le tableau `issues` regroupe les recommandations par numéro. Le site affiche le dernier numéro dont la date de début est arrivée, selon le fuseau horaire de Paris. Les précédentes sélections restent accessibles dans Ma collection, sous Toutes les découvertes. Conserve les identifiants pour préserver les favoris et les réactions. Renseigne les dates au format ISO et laisse les dates et durées inconnues vides.

FIP utilise les lecteurs de Radio France. Radio La Belle Aventure publie son flux dans sa FAQ. Les flux NTS proviennent de son site officiel. Les stations Nova renvoient vers leur lecteur officiel.

## Intégrations futures

Les types de données sont indépendants de l’interface de lecture. Une base de données peut réutiliser les identifiants pour reprendre les données locales. Spotify OAuth, la publication programmée et le classement des recommandations peuvent être ajoutés côté serveur. Les clés et identifiants OAuth doivent rester côté serveur.

## Découvrir → vérifier → sélectionner → publier

### 1. Découvrir

Dans GitHub, ouvre **Actions → Découvrir des candidats → Run workflow**, sélectionne `main`, puis lance l’exécution. Une fois terminée, ouvre l’exécution et télécharge **candidats-bonnes-ondes** dans **Artifacts**. Cette action est disponible après l’intégration du workflow à la branche par défaut. Elle produit un rapport et n’écrit ni dans le dépôt ni dans le site.

En local, lance `npm ci` puis `npm run discover` depuis `source/`. Ouvre `.discovery/rapport.md` pour lire les nouveautés de la collecte, les doublons et les erreurs, ou `.discovery/candidats.json` pour récupérer les données et la provenance. « Nouveau candidat » désigne un lien absent du catalogue, quelle que soit l’ancienneté du contenu. Un rapport réel se trouve dans [editorial/exemple-rapport.md](editorial/exemple-rapport.md).

Le registre [editorial/sources.json](editorial/sources.json) permet d’ajouter des sources officielles par méthode, avec un identifiant stable, un fournisseur, le format principal, l’URL du flux et, pour les flux éditoriaux, le préfixe attendu des liens individuels.

| Fournisseur | Couverture et limites |
| --- | --- |
| [Pitchfork](https://pitchfork.com/info/rss/) | RSS Album Reviews et Best New Albums. L’artiste vient des données structurées de la critique quand il y figure. `publishedAt` date la critique. Pour une date originale, vérifier une source primaire de l’artiste ou du label et ajouter un candidat validé avec `dateKind: release`. |
| [FIP](https://www.radiofrance.fr/fip/podcasts/club-jazzafip) | RSS officiel de Club Jazzafip, avec fiches de replays. Les conditions [Open API de Radio France](https://developers.radiofrance.fr/doc/faq) limitent l’agrégation et la conservation des données. La programmation en direct nécessiterait une autorisation spécifique. |
| [Radio Nova](https://www.nova.fr/podcasts/nova-club/) | RSS de Nova Club et liens d’épisodes individuels. La Belle Aventure reste en collecte manuelle tant qu’un flux public vérifié fait défaut. |
| [NTS](https://www.nts.live/) | Floating Points, Moxie et Don’t Trip. Les fiches épisodes sont vérifiées et les liens de tracklist sont copiés seulement lorsqu’ils figurent dans les données NTS. `broadcastAt` date la diffusion. |
| [YouTube](https://developers.google.com/youtube/v3/guides/push_notifications) | Atom des chaînes officielles (COLORS, Live Lounge, triple j, KEXP, NPR Music / Tiny Desk), liens vérifiés via oEmbed. Les liens /shorts/ et les titres d’entretiens, clips ou extraits identifiables sont écartés. Le flux ne fournit pas la durée. Vérifier l’intégralité en relecture. Une chaîne d’artiste associée à un nom dans le registre peut être activée par le profil. |
| [Bandcamp Notes](https://daily.bandcamp.com/features/introducing-bandcamp-notes) et labels | Les flux publiés par Bandcamp Notes, Rhymesayers et Mr Bongo produisent des pistes avec liens primaires quand disponibles. Un intitulé explicite de Bandcamp Notes peut donner un album à vérifier. Les liens Bandcamp orientent la vérification humaine. [La politique de Bandcamp](https://get.bandcamp.help/en/articles/15263124-bandcamp-s-acceptable-use-and-moderation-policy) exclut l’aspiration du site. |
| [Spotify](https://developer.spotify.com/documentation/embeds/reference/oembed) | Les playlists officielles du registre, les liens issus de flux de labels et les playlists directement suivies sont vérifiés via oEmbed. Les profils de curateur suivis sont signalés avec une couverture limitée. Aucun accès au catalogue du curateur ou aux morceaux et aucun OAuth. |

Les connecteurs en cours fonctionnent sans clé ni coût d’API. Les requêtes sont bornées par flux, limitées à une requête à la fois par hôte pour les en-têtes et suspendues pour l’hôte en cas de HTTP 429 jusqu’au prochain lancement. Les erreurs et les flux sans résultat sont signalés séparément. Un candidat `release-date-needed` est une piste à compléter avant de préparer une édition. Le rapport JSON sépare candidats, doublons, pistes éditoriales et couverture par format.

### 2. Vérifier

Ouvre chaque proposition. Confirme le titre, l’artiste ou le curateur s’il est indiqué, la date et le lien officiel. Sur YouTube, vérifie que la chaîne est bien celle de l’artiste, du diffuseur ou du producteur. Pour un album, utilise la date de sortie originale et vérifie-la sur la fiche de l’artiste ou du label. Garde les propositions plus anciennes pour les archives.

Pour ajouter un candidat, ajoute un objet dans `editorial/manual-candidates.json`. Renseigne `id` (stable et unique), `title`, `format` (`Album`, `Radio show`, `Playlist` ou `Live session`), `source`, `url` (lien de lecture) et `sourceUrl` (lien de vérification). Ajoute `date` au format `AAAA-MM-JJ` si connue. Elle est obligatoire pour un album. Renseigne `creator` s’il est connu. Mets `verified` à `true` une fois ces vérifications faites, puis relance la collecte.

### 3. Sélectionner

Crée un fichier de travail `selection.json` avec ces champs.

| Champ | Valeur attendue |
| --- | --- |
| `number` | Numéro suivant, par exemple `"002"` |
| `startsOn`, `label` | Date ISO de début selon l’heure de Paris et libellé à afficher |
| `albumWindowStart` | Date ISO marquant le début de la période des nouveautés, dans les 14 jours précédant `startsOn` |
| `albums` | Trois objets candidats retenus, chacun avec la date de sortie dans la fenêtre |
| `mixes`, `featuredId` | Au moins deux candidats, dont un épisode NTS et un mix d’une autre source. `featuredId` désigne l’identifiant de l’épisode NTS mis en avant |
| `playlists` | Une playlist Spotify avec un lien direct |
| `live` | Trois performances vérifiées minimum (trois sélectionnées automatiquement, une édition incomplète n'est jamais publiée) |

Recopie les objets candidats sélectionnés et ajoute à chacun une courte raison d’écoute dans `reason`. Pour remettre en avant un contenu du catalogue, réutilise son identifiant, son format et son lien. Mets à jour la raison d’écoute selon la sélection de la semaine. Pour afficher une vidéo officielle, renseigne `embed` avec `provider: "youtube"` et l’identifiant de la vidéo, indique son lien dans `videoSourceUrl`, puis renseigne `officialVideo: true` après vérification. Pour Spotify, le lecteur facultatif utilise `provider: "spotify"` et l’identifiant de l’album ou de la playlist.

Lance `npm run edition -- selection.json` pour vérifier les champs et les quotas. Corrige les erreurs avant de poursuivre.

### 4. Publier après validation humaine

Après relecture, lance `npm run edition -- selection.json --approve`. La commande ajoute l’édition validée à `editorial/editions.json` et conserve les éditions précédentes. Une sélection invalide laisse le fichier publié intact. Le site retient la dernière édition validée dont la date de début est arrivée à Paris. L’édition 001 est conservée comme édition historique.

Fais relire la modification par PR. Le passage en ligne est une release distincte. La commande d’approbation et l’action de découverte n’actualisent jamais les fichiers publics de GitHub Pages. Exécute `npm test`, `npm run typecheck` et `npm run build` avant de proposer une release.

### Profil musical

Dans **Ma collection → Modifier mon profil musical**, saisis tes artistes, radios,
médias, genres ou ambiances et liens Spotify, puis enregistre. Le profil est
modulable à tout moment sur ce navigateur. Les liens Spotify servent à retrouver
les playlists et curateurs choisis. Aucun compte, historique d’écoute Spotify
ou accès aux morceaux des playlists de tiers n’est utilisé.

**Télécharger le profil** exporte les préférences enregistrées en JSON. Coche
l’option des favoris et réactions pour ajouter ces signaux de Bonnes Ondes,
dont les créateurs favoris, les identifiants des recommandations et les
métadonnées utiles au classement. Le fichier peut alors contenir des goûts
personnels, y compris des titres ou artistes présents dans les identifiants de
morceaux radio. **Importer un profil JSON** remplace les préférences et le
dernier lot de signaux importés. La collection de ce navigateur garde ses
favoris et réactions. Les réactions locales priment sur les signaux importés
pour les mêmes identifiants lors d’un export.

Pour les connecteurs #10 et le classement #11, le contrat versionné se trouve
dans `editorial/taste-profile.mjs`. Le parseur `parseTasteProfile(json)`
valide et normalise le format. Les connecteurs peuvent lire `favoriteArtists`,
`favoriteRadios`, `favoritePublications` et `spotify` pour prioriser des
sources autorisées. Le classement peut aussi lire `explore`, `avoid` et
`signals`. La fixture `editorial/taste-profile.example.json` est neutre.

Le site statique n’a pas de synchronisation automatique. Sur une machine ou
un runner privé, place l’export hors du dépôt, par exemple dans
`~/.config/bonnes-ondes/taste-profile.json` (répertoire en mode 700 et fichier
en mode 600 sur Unix). Lance `TASTE_PROFILE_PATH=/chemin/privé/profil.json npm run discover`.
Le fichier reste accessible au collecteur même navigateur fermé. Les sources
connues que tu suis passent en priorité, les chaînes d’artistes correspondantes
sont activées et les playlists suivies sont vérifiées. Le classement est prévu
dans #11. Les rapports sont enregistrés hors du dépôt, dans un répertoire
temporaire privé, et leur contenu reste hors de la sortie standard.

GitHub Actions utilise la fixture neutre et refuse `TASTE_PROFILE_PATH`.
Garde les exports et résultats personnels hors des commits, builds statiques,
journaux, artefacts et PR publics.

### Préparer le brouillon hebdomadaire

Depuis source/, lance npm run weekly. La préparation du dimanche propose le lundi suivant comme date de début.
Le site sélectionne cette édition à 00 h le lundi en Europe/Paris, une fois
qu’elle a été approuvée et que les données ont été mises en ligne. Minuit à
Paris correspond à 23 h UTC le dimanche en hiver et à 22 h UTC en été.
Sur déclenchement manuel, la date proposée est le prochain lundi, y compris
si la préparation a lieu le dimanche soir.
Une date ISO peut être passée avec npm run weekly -- AAAA-MM-JJ.
Dans .discovery/weekly/, retrouve shortlist.md, shortlist.json et
edition-draft.json. Le rapport indique le résultat du validateur éditorial et
les quotas manquants. Pour vérifier un brouillon complet, utilise npm run
edition -- .discovery/weekly/edition-draft.json. Cette commande de vérification
ne publie rien.

Le classement utilise l’affinité avec les artistes, les sources, les genres,
les ambiances et les réactions explicitement enregistrés. TASTE_WEIGHT ajuste
le poids de ces signaux entre 0 et 1, avec 0,7 comme réglage initial du moteur.
Les raisons des choix s’appuient sur les preuves disponibles et les signaux
effectivement trouvés. Les replays anciens sont indiqués comme archives.
Le choix hebdomadaire limite les répétitions d’artistes, de performances et
de sources.

Pour les albums, le collecteur suit au plus douze liens de labels autorisés
issus des critiques et vérifie aussi les fiches dans editorial/album-sources.json.
Les dates viennent de données MusicAlbum qui correspondent au titre et à
l’artiste, ou d’une mention explicite sur une fiche Rhymesayers. Les fiches
bloquées ou ambiguës et les sorties à venir restent hors du brouillon.
Un lien d’album Spotify correspondant est également requis.

Les playlists découvertes sur les pages publiques des curateurs sont
vérifiées via oEmbed. « Inédite » signifie inconnue du catalogue et de
l’index disponible. La date de création Spotify reste inconnue. Les pages
officielles de KEXP complètent les flux de labels.

La variable YOUTUBE_DATA_API_KEY active le contrôle de
[YouTube Data API](https://developers.google.com/youtube/data/reference/rest/v3/videos/list).
Elle se règle comme secret de l’action ou variable d’environnement locale.
Une requête groupée par 50 vidéos coûte une unité de quota. Le filtre vérifie
la chaîne, le caractère public, l’intégrabilité et une durée de plus de trois
minutes en plus des règles de série et de titre. La relecture reste utile
pour repérer un long extrait mal étiqueté. Sans clé, les lives restent à
vérifier et le quota correspondant est signalé.

Le workflow « Préparer le brouillon hebdomadaire » est déclenchable manuellement
et prévu chaque dimanche à 06 h 30 UTC, soit 07 h 30 à Paris en hiver et
08 h 30 en été. Il produit un artefact de relecture avec
un profil neutre et des permissions GitHub en lecture seule. Sur un runner privé,
TASTE_PROFILE_PATH active ton profil et DISCOVERY_INDEX_PATH peut pointer vers
un fichier d’index privé hors du dépôt. L’index retient pendant 90 jours les URL
de candidats de sources publiques, sans réactions ni playlists suivies issues
du profil. Il signale les candidats déjà vus hors catalogue. Le contenu des
rapports personnalisés et de l’index privé reste hors des artefacts Actions.

Un [essai sur les fournisseurs réels](editorial/exemple-selection-hebdomadaire.md)
documente les résultats et les places restées vacantes.

### Automatisation et synchronisation privée

La configuration par étapes, les comptes requis, les coûts et les procédures
de révocation sont décrits dans [le guide d’automatisation](docs/automation-setup.md).
Le brouillon hebdomadaire est programmé le dimanche à 17 h 30 (Europe/Paris),
avec collecte et vérification privées, sans publication. Pour le suspendre,
règle la variable Actions `WEEKLY_DRAFT_PAUSED` à `true`. La collecte quotidienne est planifiée à 9 h 17 (Europe/Paris), indépendante
et sans publication ; définis `DAILY_COLLECTION_PAUSED=true` dans les variables
Actions pour la suspendre. La publication automatique (`AUTO_PUBLISH_ENABLED`)
reste désactivée.
### Release de l’interface

Le [guide de première connexion](docs/interface-release.md) décrit la préparation
des fichiers GitHub Pages, l’approbation de la release et la sauvegarde privée
du profil. Le site local se trouve sous /bonnesondes/ avec cette configuration.

### Ajustements du 20 novembre 2026

- Les cartes proposent **Coup de cœur** (cœur) et **Je n'aime pas** (pouce vers le bas), deux choix exclusifs ; un second clic retire la réaction. Les anciens états de réaction restent lisibles pour ne pas casser les collections. La synchronisation privée déjà consentie transmet ces réactions au classement suivant.
- L'accueil affiche **Performances à découvrir**, avec trois lives de l'édition active ; l'édition historique 001 dispose de trois anciennes performances. Les futures éditions demandent au moins trois lives vérifiés, et le moteur en choisit trois, provenant notamment des chaînes officielles KEXP et NPR Music. Si les trois ne sont pas disponibles, la publication est bloquée, sans contenu inventé.
- La première rangée des radios présente FIP, NTS 1 et Radio La Belle Aventure. Nova, Nova la nuit et Nouvo Nova utilisent des flux MP3 HTTPS recensés publiquement, dans le lecteur audio du site. Leur disponibilité et les conditions d'intégration sont à contrôler dans un navigateur réel ; en cas d'échec, le lien vers le site Nova reste proposé.
- Le brouillon historique dans `editorial/drafts/002-selection.json`, créé avec deux lives avant cette modification, est conservé comme archive de travail et ne satisfait plus le nouveau validateur. Une édition 002 conforme devra être reconstruite à partir de trois performances contrôlées.
- Le workflow `site-deploy.yml` reconstruit puis déploie les fichiers GitHub Pages lors d'une fusion sur `main` qui modifie `source/app/` ou la configuration Next. Il préserve les ressources statiques historiques et ne touche ni aux données d'éditions ni à l'activation `AUTO_PUBLISH_ENABLED`. Les tests et le build doivent passer avant d'écrire l'export public.

### Métadonnées des radios Nova (vérifiées le 20 novembre 2026)

Les cartes **Radio Nova**, **Nouvo Nova** et **Nova la nuit** affichent comme les
radios FIP un titre, un artiste, l'heure de diffusion et la pochette lorsqu'elle
est fournie par Nova. Les cartes sont mises à jour toutes les 30 secondes.
L'ordre de présentation est FIP / NTS 1 / La Belle Aventure, puis Radio Nova /
FIP Groove / Nouvo Nova, etc. Le bouton d'enregistrement fonctionne depuis
chaque carte et conserve la station et le visuel éventuel.

**Limite importante :** il s'agit du *dernier titre diffusé selon la page
publique de Nova*, pas d'une confirmation sonore de la seconde en cours. Les
trois flux MP3 Infomaniak ont été testés avec `Icy-MetaData: 1` : les champs
`StreamTitle` étaient vides. Les endpoints Icecast `status-json.xsl` ont
répondu 404 et la métadonnée Infomaniak accessible par le nom du flux ne
contenait pas de titre. L'API WordPress `/radio-tracks/v1/latests` renvoie
des titres globaux sans paramètre de station ; la route
`/mobile-app/v1/cqct/{radio_slug}` est protégée (401). Il ne serait pas
fiable de les présenter comme le morceau **en cours**.

Les pages publiques des trois stations contiennent une rubrique
**« C'était quoi ce titre »** avec un horodatage et, quand disponible, une
image associée. Bonnes Ondes lit uniquement la première entrée de la bonne
station via le relais public HTTPS de Jina Reader qui autorise l'accès depuis
GitHub Pages. Chaque carte affiche **« Dernier titre diffusé »**, son heure
(Paris) et le lien de sauvegarde. Le parseur rejette les données de plus de
180 minutes, les images génériques, les images non HTTPS et le HTML incomplet.
Si le relais tiers est indisponible, le site affiche un état indisponible sans
inventer de titre. Cette intégration dépend de la structure du site de Nova
et de la disponibilité du relais : une API officielle de titre par station
devrait la remplacer si Nova en propose une publiquement.
