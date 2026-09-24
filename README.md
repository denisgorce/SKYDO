# SKYDO

Jeu de cartes multijoueur (2 à 8 joueurs, un smartphone chacun), **sans serveur ni base de données** : un téléphone héberge la partie, les autres s'y connectent sur le réseau local.

## Obtenir l'APK
- Push sur `main` : onglet **Actions**, artefact `Colonnes-apk`.
- Tag `v*` (ex. `git tag v1.0 && git push --tags`) : APK attaché à une **Release**, téléchargeable directement depuis un téléphone.
- Optionnel, pour une signature stable (mises à jour sans désinstaller) : secrets `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

## Jouer
1. Tous les téléphones sur le **même Wi-Fi**, ou connectés au **partage de connexion** de l'hôte (fonctionne sans données mobiles).
2. L'hôte : « Créer une partie », l'adresse affichée (ex. 192.168.1.23) est à transmettre.
3. Les autres : saisir l'adresse, « Rejoindre ». L'hôte lance la partie.
4. L'hôte garde l'app ouverte au premier plan. En cas de fermeture, la partie reprend à la réouverture.

## Structure
- `www/logic.js` : moteur de règles.
- `www/app.js` : rôles hôte/invité et interface.
- `LanServer.java` : serveur HTTP local (port 8765) qui relaie l'état.
- `MainActivity.java` : WebView + pont JS (hébergement, requêtes HTTP).

## Limites
- Pas de jeu à distance par internet (impossible sans serveur relais).
- Réseaux Wi-Fi publics/entreprise avec isolation des clients : non compatibles, utiliser le partage de connexion.
