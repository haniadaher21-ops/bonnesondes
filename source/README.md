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

Le registre [editorial/sources.json](editorial/sources.json) contient les liens et méthodes. NTS utilise les [données publiques de sa série Floating Points](https://www.nts.live/api/v2/shows/floating-points/episodes) et vérifie les fiches des épisodes. Le champ `date` correspond à la date de diffusion pour NTS. YouTube utilise les [flux Atom officiels](https://developers.google.com/youtube/data/guides/push_notifications), vérifie les fiches via oEmbed et enregistre la date de publication de la vidéo. Les filtres de titre ciblent des performances mais une vérification humaine reste nécessaire. Une source indisponible ou une vidéo invérifiable est signalée dans le rapport. Les sources manuelles s’ajoutent sans API ni identifiants Spotify.

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
| `live` | Une ou deux performances vérifiées |

Recopie les objets candidats sélectionnés et ajoute à chacun une courte raison d’écoute dans `reason`. Pour remettre en avant un contenu du catalogue, réutilise son identifiant, son format et son lien. Mets à jour la raison d’écoute selon la sélection de la semaine. Pour afficher une vidéo officielle, renseigne `embed` avec `provider: "youtube"` et l’identifiant de la vidéo, indique son lien dans `videoSourceUrl`, puis renseigne `officialVideo: true` après vérification. Pour Spotify, le lecteur facultatif utilise `provider: "spotify"` et l’identifiant de l’album ou de la playlist.

Lance `npm run edition -- selection.json` pour vérifier les champs et les quotas. Corrige les erreurs avant de poursuivre.

### 4. Publier après validation humaine

Après relecture, lance `npm run edition -- selection.json --approve`. La commande ajoute l’édition validée à `editorial/editions.json` et conserve les éditions précédentes. Une sélection invalide laisse le fichier publié intact. Le site retient la dernière édition validée dont la date de début est arrivée à Paris. L’édition 001 est conservée comme édition historique.

Fais relire la modification par PR. Le passage en ligne est une release distincte. La commande d’approbation et l’action de découverte n’actualisent jamais les fichiers publics de GitHub Pages. Exécute `npm test`, `npm run typecheck` et `npm run build` avant de proposer une release.
