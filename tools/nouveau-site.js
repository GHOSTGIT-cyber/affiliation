// npm run nouveau-site -- <nom-du-site>
// Copie le modèle (sites/_modele) et génère la clé IndexNow du site (module 9).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const nom = process.argv[2];
if (!nom || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nom)) {
  console.error("Usage : npm run nouveau-site -- <nom-du-site>   (minuscules, chiffres et tirets, ex : seche-cheveux)");
  process.exit(2);
}
const cible = path.join("sites", nom);
if (fs.existsSync(cible)) {
  console.error(`Le dossier ${cible} existe déjà.`);
  process.exit(1);
}

fs.cpSync(path.join("sites", "_modele"), cible, { recursive: true });

const fichierSite = path.join(cible, "_data", "site.json");
const site = JSON.parse(fs.readFileSync(fichierSite, "utf8"));
site.indexnow_cle = crypto.randomBytes(16).toString("hex");
fs.writeFileSync(fichierSite, JSON.stringify(site, null, 2) + "\n");

console.log(`Site créé dans ${cible}.

Prochaines étapes :
  1. Remplis ${cible}/CLAUDE.md (niche, décisions) et ${fichierSite} (nom, adresse).
  2. Remplace le silo d'exemple dans ${cible}/_data/silos.json par tes silos (module 4).
  3. Prévisualise : npm run dev -- ${nom}   puis ouvre http://localhost:8080
  4. Supprime les pages d'exemple de ${cible}/pages/ quand tes premières pages sont écrites :
     le garde-fou refuse de publier tant qu'elles sont là.`);
