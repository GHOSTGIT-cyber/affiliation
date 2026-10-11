# Affiliation — contexte

But : construire des sites d'affiliation Amazon (France), puis d'autres partenaires, en suivant le guide « Comment générer ses premiers euros en affiliation » (modules 1 à 12). Plusieurs sites test pour récolter des données, puis un site principal sur la niche qui démarre le mieux.

**Claude propose, l'utilisateur décide.** Ne change pas une décision listée plus bas sans accord. Rien ne part en ligne sans relecture et sans rapport de garde-fou propre.

## Structure

- `sites/_modele/` : modèle copié pour chaque nouveau site. Ne pas y écrire de vrai contenu.
- `sites/<site>/` : un site. Son propre `CLAUDE.md` contient la niche, l'état et les décisions du site.
  - `_data/site.json` : nom, adresse, identifiant Amazon (`amazon.tag`), GA4, clé IndexNow.
  - `_data/silos.json` : silos et sous-silos (module 4). Menu, adresses et fil d'Ariane en découlent.
  - `_data/catalogue.csv` : catalogue produit (module 6), séparateur `;`, une ligne par produit, listes séparées par `|`. Jamais de prix.
  - `plan/table-des-pages.csv` : mapping + brief de chaque page (modules 4 et 6). Non publié.
  - `pages/<silo>/*.md` : pages de contenu. `legal/` : pages obligatoires (module 5).
  - `_includes/`, `assets/` : look du site (chaque site a le sien).
- `plan/niches.csv` : notation des niches (module 3).
- `tools/garde-fou.js` : le garde-fou (module 6). `tools/test/` : ses tests.
- `eleventy.config.js` : générateur (Eleventy), commun à tous les sites.

## Commandes (identiques sous Windows)

```
npm run nouveau-site -- <site>   # copie le modèle, génère la clé IndexNow
npm run dev -- <site>            # prévisualisation http://localhost:8080
npm run garde-fou -- <site>      # construit dist/<site> puis contrôle ; rapport dans dist/<site>.garde-fou.md
npm run publier -- <site>        # même chose : commande de build chez l'hébergeur (dossier publié : dist/<site>)
npm run indexnow -- <site> [--depuis AAAA-MM-JJ] [--envoyer]   # après mise en ligne seulement
npm test                         # tests du garde-fou
```

## Écrire une page

Front matter obligatoire : `title` (≤ 65 car.), `description` (≤ 160 car.), `h1`, `motcle`, `format` (`meilleurs-x` | `comparatif` | `guide-achat` | `question`), `silo`, `soussilo`, `mere` (une seule page mère par sous-silo). L'adresse est calculée : `/<silo>/<soussilo>/` pour la mère, `/<silo>/<soussilo>/<nom-du-fichier>/` pour les filles.

Produits, uniquement par identifiant du catalogue (le lien Amazon et l'identifiant partenaire sont ajoutés automatiquement) :
- `{% produit "id" %}` : encadré (nom, pour qui, points forts, défaut, bouton).
- `{% lien "id" %}` ou `{% lien "id", "texte" %}` : lien dans une phrase.
- `{% tableau "id1", "id2", "id3" %}` : tableau comparatif, le premier est mis en avant.

Structure d'une page (module 6) : réponse en haut (meilleur choix + lien) → `##` sections (le sommaire est généré) → questions fréquentes → conclusion. Les blocs « À lire aussi » / « Dans ce dossier » sont générés : chaque fille renvoie à sa mère, la mère liste ses filles.

## Règles non négociables

- Une question = une page. Deux mots-clés qui posent la même question vont sur la même page.
- N'écrire que des faits présents dans le catalogue (avec source et date). Rien inventé. Produit incertain → statut `a-verifier`.
- Jamais de prix écrit à la main, jamais de promotion datée.
- Jamais « nous avons testé » si ce n'est pas vrai.
- Ton direct, phrases courtes, vouvoiement du lecteur, pas de phrases creuses. Varier les formulations d'une page à l'autre.
- Pas de liens entre mes propres sites pour pousser leur classement.
- Liens Amazon uniquement sur les pages publiques du site : jamais dans un PDF, un e-book ou un e-mail non sollicité.
- Une page d'abord, validée par l'utilisateur, puis les suivantes par lots.
- Erreur trouvée à la main que le garde-fou n'a pas vue → ajouter la règle dans `tools/garde-fou.js` + un test.

## Où j'en suis (plan d'action, module 12)

- [x] Outils en place : générateur, modèle de site, garde-fou, IndexNow, GA4 avec consentement
- [ ] Niches notées dans `plan/niches.csv`, 3 à 5 retenues dans des familles différentes (module 3)
- [ ] Premier site : silos, mots-clés, table des pages (module 4)
- [ ] Look et pages obligatoires remplies (module 5)
- [ ] Catalogue, première page validée, puis lots (module 6)
- [ ] Domaine, mise en ligne, inscription Amazon Partenaires, identifiant dans `site.json` (module 7)
- [ ] Search Console + Bing + IndexNow (modules 8 et 9)
- [ ] Compte de paiement complet, sites déclarés, GA4 vérifié (module 10)

## Décisions prises

- Sites statiques générés par Eleventy, hébergeur libre (n'importe quel hébergeur de fichiers statiques).
- Liens Amazon construits depuis l'ASIN du catalogue + `amazon.tag` de `site.json` : l'identifiant ne se remplace qu'à un seul endroit.
- Liens d'affiliation en `rel="sponsored nofollow"` (recommandation Google pour les liens rémunérés).
- GA4 chargé seulement après consentement (CNIL), événement `clic_amazon`.
