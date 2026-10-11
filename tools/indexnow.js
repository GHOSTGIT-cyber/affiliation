// Prévenir Bing et les moteurs compatibles qu'une page est nouvelle ou modifiée (module 9).
//   npm run indexnow -- <site>                        affiche ce qui serait envoyé, n'envoie rien
//   npm run indexnow -- <site> --depuis 2026-10-01    seulement les pages modifiées depuis cette date
//   npm run indexnow -- <site> --envoyer              envoie pour de vrai
// À lancer APRÈS le garde-fou et la mise en ligne : prévenir un moteur pour une page ratée,
// c'est le pousser à regarder une page ratée.
import fs from "node:fs";
import path from "node:path";

const [site, ...options] = process.argv.slice(2);
const envoyer = options.includes("--envoyer");
const depuis = options.includes("--depuis") ? options[options.indexOf("--depuis") + 1] : null;

if (!site) {
  console.error("Usage : npm run indexnow -- <site> [--depuis AAAA-MM-JJ] [--envoyer]");
  process.exit(2);
}
if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) {
  console.error("--depuis attend une date au format AAAA-MM-JJ");
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(path.join("sites", site, "_data", "site.json"), "utf8"));
const sitemap = path.join("dist", site, "sitemap.xml");
if (!fs.existsSync(sitemap)) {
  console.error(`${sitemap} introuvable : lance d'abord npm run garde-fou -- ${site}`);
  process.exit(1);
}
if (!config.indexnow_cle) {
  console.error("indexnow_cle vide dans _data/site.json : mets-y une clé de 32 caractères hexadécimaux.");
  process.exit(1);
}

const entrees = [...fs.readFileSync(sitemap, "utf8").matchAll(/<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g)].map((m) => ({ url: m[1], maj: m[2] }));
const urls = entrees.filter((e) => !depuis || e.maj >= depuis).map((e) => e.url);

console.log(`${urls.length} adresse(s) ${depuis ? `modifiée(s) depuis le ${depuis}` : "dans le plan du site"} :`);
urls.forEach((u) => console.log("  " + u));

if (!envoyer) {
  console.log("\nRien n'a été envoyé. Ajoute --envoyer pour prévenir les moteurs.");
  process.exit(0);
}
if (!urls.length) process.exit(0);

const hote = new URL(config.url).host;
const emplacementCle = `${config.url}/${config.indexnow_cle}.txt`;

// Le moteur vérifie la clé en ligne : on s'assure d'abord qu'elle y est, sinon l'envoi est refusé.
const reponseCle = await fetch(emplacementCle).catch(() => null);
if (!reponseCle?.ok || (await reponseCle.text()).trim() !== config.indexnow_cle) {
  console.error(`La clé n'est pas en ligne à ${emplacementCle}. Publie le site avant d'envoyer.`);
  process.exit(1);
}

for (let i = 0; i < urls.length; i += 10000) {
  const lot = urls.slice(i, i + 10000);
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: hote, key: config.indexnow_cle, keyLocation: emplacementCle, urlList: lot }),
  });
  if (r.status === 200 || r.status === 202) console.log(`Envoyé : ${lot.length} adresse(s) (réponse ${r.status}).`);
  else {
    console.error(`Refusé (réponse ${r.status}) : ${await r.text()}`);
    process.exit(1);
  }
}
