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
