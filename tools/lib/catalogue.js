// Lecture du catalogue produit (module 6) : un CSV au format Excel français
// (séparateur « ; », UTF-8 avec ou sans BOM), une ligne par produit.
import fs from "node:fs";
import { parse } from "csv-parse/sync";

export const COLONNES = [
  "id",
  "nom",
  "marque",
  "categorie",
  "asin",
  "pour_qui",
  "caracteristiques",
  "points_forts",
  "defauts",
  "source",
  "date_releve",
  "statut",
];

export const STATUTS = ["ok", "a-verifier", "indisponible"];

export function lireCsv(chemin) {
  const texte = fs.readFileSync(chemin, "utf8");
  return parse(texte, {
    delimiter: ";",
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// Les listes (points forts, défauts) sont séparées par « | » dans une cellule.
export function liste(cellule) {
  return (cellule || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chargerCatalogue(chemin) {
  const lignes = fs.existsSync(chemin) ? lireCsv(chemin) : [];
  const parId = new Map();
  const erreurs = [];
  lignes.forEach((l, i) => {
    const ligne = i + 2; // +1 pour l'en-tête, +1 pour compter à partir de 1
    for (const col of ["id", "nom", "asin", "statut"]) {
      if (!l[col]) erreurs.push(`catalogue ligne ${ligne} : colonne « ${col} » vide`);
    }
    if (l.statut && !STATUTS.includes(l.statut)) {
      erreurs.push(`catalogue ligne ${ligne} : statut « ${l.statut} » inconnu (attendu : ${STATUTS.join(", ")})`);
    }
    if (l.asin && !/^[A-Z0-9]{10}$/.test(l.asin)) {
      erreurs.push(`catalogue ligne ${ligne} : ASIN « ${l.asin} » mal formé (10 caractères, lettres majuscules et chiffres)`);
    }
    if (parId.has(l.id)) erreurs.push(`catalogue ligne ${ligne} : identifiant « ${l.id} » en double`);
    parId.set(l.id, {
      ...l,
      points_forts: liste(l.points_forts),
      defauts: liste(l.defauts),
    });
  });
  return { parId, erreurs };
}

export function lienAmazon(produit, amazon) {
  const domaine = amazon.domaine || "www.amazon.fr";
  return `https://${domaine}/dp/${produit.asin}?tag=${encodeURIComponent(amazon.tag)}`;
}
