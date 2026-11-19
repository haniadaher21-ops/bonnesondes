# Observations réelles du 19 novembre 2026

Trois nouvelles collectes ont été exécutées à 12 h 29 et 12 h 30 UTC pour
l’édition du lundi 23 novembre. Les profils de test étaient neutre, FIP et
Radio Nova. Ces observations publiques utilisent les fournisseurs réels.
La connexion au stockage privé du propriétaire n’était pas configurée.

| Profil de test | Albums éligibles | Albums manquants | Lives vérifiés | Live manquant |
| --- | ---: | ---: | ---: | ---: |
| Neutre | 1 | 2 | 0 | 1 |
| FIP | 1 | 2 | 0 | 1 |
| Radio Nova | 1 | 2 | 0 | 1 |

Ninja Tune a fourni cinq entrées de catalogue de type Album et Sub Pop trente
titres hors rééditions identifiables. Aucun nouveau résultat dans la fenêtre
n’a passé l’ensemble des contrôles. Le catalogue ECM a fourni dix-sept fiches,
dont une date originale vérifiée dans la fenêtre.

- **Trouble Mountain** a une date du 13 novembre confirmée sur la fiche du label et un lien Spotify vérifié. [Rhymesayers](https://rhymesayers.com/products/aesop-rock-x-blockhead-trouble-mountain-cd).
- **Traces in the Sand** a une date originale du 13 novembre explicitement affichée. Son lien d’album Spotify reste à confirmer. [ECM](https://ecmrecords.com/product/traces-in-the-sand-stephan-micus/).
- Les fiches de Nick Ward et d’Hyperion n’ont pas permis la confirmation automatique de la date originale pendant ces observations. Les albums du brouillon 002 ne constituent pas un contournement de cette vérification.
- Les lives restent hors sélection sans YOUTUBE_DATA_API_KEY.

Le profil qui suit FIP a retenu Club Jazzafip et celui qui suit Radio Nova a
retenu Nova Club. [Club Jazzafip](https://www.radiofrance.fr/fip/podcasts/club-jazzafip/club-jazzafip-du-mercredi-18-novembre-2026-2933932) et
[Nova Club](https://podcasts.nova.fr/radio-nova-nova-club/202611181700-paf-et-regelegorila-sont-nos-invites).

Les contrôles de transport dans Chromium couvrent la connexion OTP du
propriétaire, le consentement initial, la modification du profil, les réactions
depuis Ma collection, le rechargement et l’absence de boucle d’envoi. Le serveur
de ce test était simulé. Les règles SQL et leur déploiement Supabase restent
à vérifier avec le compte du propriétaire.

Aucune de ces trois observations ne constitue un succès autorisant la
publication. Elles n’ont pas rempli l’index de simulations réussies du serveur
privé. La disponibilité de trois albums vérifiés chaque semaine reste un
blocage à résoudre avant l’activation. Les opérations de publication, de
déploiement Pages et de rollback sont proposées pour revue et restent à
tester sur l’environnement externe.

## Validation en GitHub Actions après configuration des secrets

Le contrôle d’intégration de la PR a utilisé les variables du dépôt et les
secrets Actions. Les appels YouTube Data API ont confirmé trois vidéos
officielles, publiques, intégrables et de plus de trois minutes. Les flux des
chaînes contrôlées ont répondu pendant ce test.

- Rachel Chinouriri — Pretty Girls, BBC Radio 1, 225 secondes.
- WILLOW — Radio 1 Live Lounge, 935 secondes.
- Sly Withers — reprise de Gotye pour triple j, 216 secondes.

Le runner a été authentifié par Supabase. Les lectures anonymes et un jeton
runner invalide ont été refusés. Le serveur ne contient encore aucun profil
propriétaire enregistré. La vérification de synchronisation complète reste
bloquée jusqu’à la première connexion et sauvegarde consentie du propriétaire. Le workflow de vérification utilise des permissions
de dépôt en lecture seule et les secrets restent dans Actions.

Le [contrôle Actions du 19 novembre](https://github.com/haniadaher21-ops/bonnesondes/actions/runs/44542903480)
a exécuté les 36 tests avec succès, puis le contrôle réel des deux services.
Le contrôle YouTube a réussi. Le contrôle Supabase a signalé le profil absent.
Le job complet est donc en échec, ce qui maintient ce prérequis visible.
La validation est limitée aux lectures privées et aux refus d’accès. Les
écritures de profil par le propriétaire restent à tester dans le navigateur.
