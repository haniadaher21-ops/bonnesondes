# Pilote d’affinité pondérée

Le pilote est indépendant du classement de production. Il accepte un profil privé en mémoire et des candidats déjà éligibles, avec des crédits vérifiés. Le score supplémentaire est limité à 30 points ; les relations ListenBrainz sont pondérées à 55 % du signal direct. Les inconnus restent neutres et les exclusions sont prioritaires. Ces coefficients sont des hypothèses à valider.

## Sécurité
- Ne jamais committer un export, un profil dérivé, un résultat nominatif, un jeton ou des raisons personnalisées.
- L'enrichissement ne reçoit que les crédits des candidats publics, indépendamment du profil. Le cache ne contient que les métadonnées publiques.
- Ne pas journaliser ou publier la sortie de compareWeightedRanking. Les résultats personnalisés doivent rester dans l'espace authentifié.
- Un artiste homonyme ambigu, une API indisponible ou une tracklist non vérifiée ne crée pas de relation.
- Les règles de fraîcheur, de vérification des sources, de diversité et les quotas de l'édition restent inchangés.

## Validation
Depuis source : node --test test/weighted-affinity.test.mjs ; npm test ; npm run typecheck ; npm run build.
Test réseau public séparé : node scripts/check-public-artist-metadata.mjs.
Étape suivante : enrichir les crédits d'un ensemble réel de candidats éligibles, comparer à profil et candidats identiques dans un environnement privé, puis intégrer au stockage authentifié avec consentement et possibilité de suppression. Ne pas activer automatiquement la publication sur la base de ce pilote.
