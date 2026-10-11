// Point d'entrée unique, identique sous Windows, macOS et Linux :
//   npm run dev -- <site>        prévisualisation sur http://localhost:8080
//   npm run build -- <site>      construit le site dans dist/<site>
//   npm run garde-fou -- <site>  construit puis contrôle (module 6)
//   npm run publier -- <site>    même chose : commande à donner à l'hébergeur
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { lancerGardeFou } from "./garde-fou.js";

const [commande, site] = process.argv.slice(2);
const COMMANDES = ["dev", "build", "garde-fou", "publier"];

if (!COMMANDES.includes(commande) || !site) {
  console.error(`Usage : npm run <${COMMANDES.join("|")}> -- <nom-du-site>`);
  process.exit(2);
}
if (!fs.existsSync(path.join("sites", site, "_data", "site.json"))) {
  const existants = fs.readdirSync("sites").filter((d) => fs.existsSync(path.join("sites", d, "_data", "site.json")));
  console.error(`Site « ${site} » introuvable. Sites existants : ${existants.join(", ") || "aucun"}`);
  console.error("Pour en créer un : npm run nouveau-site -- <nom-du-site>");
  process.exit(2);
}

const sortie = path.join("dist", site);
const eleventy = path.join("node_modules", "@11ty", "eleventy", "cmd.cjs");

// On repart d'un dossier vide : une page supprimée ne doit pas rester en ligne.
if (commande !== "dev") fs.rmSync(sortie, { recursive: true, force: true });

const args = [eleventy, "--config=eleventy.config.js", `--input=sites/${site}`, `--output=${sortie}`];
if (commande === "dev") args.push("--serve");
else args.push("--quiet");

const r = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, SITE: site } });
if (r.status !== 0) process.exit(r.status ?? 1);

if (commande === "garde-fou" || commande === "publier") {
  const ok = lancerGardeFou(site, sortie);
  process.exit(ok ? 0 : 1);
}
