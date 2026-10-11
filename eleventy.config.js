// Configuration partagée par tous les sites. Le site construit est passé par
// tools/site.js via la variable SITE (dossier sites/<SITE>).
import fs from "node:fs";
import path from "node:path";
import { chargerCatalogue, lienAmazon, lireCsv } from "./tools/lib/catalogue.js";

const SITE = process.env.SITE;
if (!SITE) throw new Error("Lance la construction avec : npm run build -- <nom-du-site>");
// Chemin en « / » même sous Windows : il sert aussi dans des motifs de fichiers (globs).
const RACINE_SITE = `sites/${SITE}`;
const lireJson = (f) => JSON.parse(fs.readFileSync(path.join(RACINE_SITE, "_data", f), "utf8"));

const echapper = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const slugifier = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function (eleventyConfig) {
  let catalogue = new Map();
  let site = lireJson("site.json");

  // Le catalogue est relu à chaque construction : une ligne corrigée est prise en compte
  // sans redémarrer le serveur de prévisualisation.
  eleventyConfig.on("eleventy.before", () => {
    site = lireJson("site.json");
    const { parId, erreurs } = chargerCatalogue(path.join(RACINE_SITE, "_data", "catalogue.csv"));
    if (erreurs.length) throw new Error("Catalogue produit invalide :\n- " + erreurs.join("\n- "));
    catalogue = parId;
  });

  eleventyConfig.addDataExtension("csv", (contenu, chemin) => lireCsv(chemin));
  eleventyConfig.ignores.add(`${RACINE_SITE}/plan/**`);
  eleventyConfig.ignores.add(`${RACINE_SITE}/CLAUDE.md`);
  eleventyConfig.addWatchTarget(`${RACINE_SITE}/_data/`);
  eleventyConfig.addPassthroughCopy({ [`${RACINE_SITE}/assets`]: "assets" });

  // ----- Produits : toujours tirés du catalogue, jamais de prix (module 5) -----
  function produit(id) {
    const p = catalogue.get(id);
    if (!p) throw new Error(`Produit « ${id} » absent du catalogue (sites/${SITE}/_data/catalogue.csv)`);
    if (p.statut === "indisponible") throw new Error(`Produit « ${id} » marqué indisponible dans le catalogue : retire-le de la page`);
    return p;
  }
  const attributsLien = (p) =>
    `href="${echapper(lienAmazon(p, site.amazon))}" rel="sponsored nofollow noopener" target="_blank" data-aff="amazon" data-produit="${echapper(p.id)}" data-statut="${echapper(p.statut)}"`;

  eleventyConfig.addShortcode("produit", (id, texteBouton) => {
    const p = produit(id);
    const forts = p.points_forts.map((x) => `<li>${echapper(x)}</li>`).join("");
    const defauts = p.defauts.map((x) => `<li>${echapper(x)}</li>`).join("");
    return `<div class="encadre-produit" data-produit="${echapper(p.id)}">
<p class="encadre-nom">${echapper(p.nom)}</p>
<p class="encadre-pour-qui"><strong>Pour qui :</strong> ${echapper(p.pour_qui)}</p>
<div class="encadre-colonnes"><ul class="encadre-forts" aria-label="Points forts">${forts}</ul><ul class="encadre-defauts" aria-label="Défauts">${defauts}</ul></div>
<a class="bouton" ${attributsLien(p)}>${echapper(texteBouton || site.amazon.texte_bouton || "Voir sur Amazon")}</a>
</div>`;
  });

  eleventyConfig.addShortcode("lien", (id, texte) => {
    const p = produit(id);
    return `<a ${attributsLien(p)}>${echapper(texte || p.nom)}</a>`;
  });

  eleventyConfig.addShortcode("tableau", (...ids) => {
    const lignes = ids
      .flat()
      .map(produit)
      .map(
        (p, i) => `<tr${i === 0 ? ' class="meilleur-choix"' : ""}><th scope="row">${echapper(p.nom)}</th><td>${echapper(p.pour_qui)}</td><td>${echapper(p.points_forts[0] || "")}</td><td><a ${attributsLien(p)}>Voir</a></td></tr>`,
      )
      .join("");
    return `<div class="tableau-defilant"><table class="comparatif"><thead><tr><th scope="col">Produit</th><th scope="col">Pour qui</th><th scope="col">Point fort</th><th scope="col">Lien</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
  });

  // ----- Sommaire : ancres sur les <h2> du contenu, puis liste des liens -----
  const titresH2 = (html) => [...String(html).matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
  eleventyConfig.addFilter("ancres", (html) =>
    String(html).replace(/<h2>(.*?)<\/h2>/g, (_, t) => `<h2 id="${slugifier(t.replace(/<[^>]+>/g, ""))}">${t}</h2>`),
  );
  eleventyConfig.addFilter("sommaire", (html) =>
    titresH2(html).map((t) => ({ id: slugifier(t.replace(/<[^>]+>/g, "")), titre: t.replace(/<[^>]+>/g, "") })),
  );

  eleventyConfig.addFilter("slug", slugifier);
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("dateIso", (d) => new Date(d).toISOString().slice(0, 10));

  // ----- Collections : contenu rangé en silos (module 4) -----
  eleventyConfig.addCollection("contenus", (api) =>
    api.getFilteredByGlob(`${RACINE_SITE}/pages/**/*.md`).sort((a, b) => (a.data.title || "").localeCompare(b.data.title || "", "fr")),
  );
  eleventyConfig.addFilter("pageMere", (contenus, silo, soussilo) =>
    contenus.find((p) => p.data.silo === silo && p.data.soussilo === soussilo && p.data.mere),
  );
  eleventyConfig.addFilter("filles", (contenus, silo, soussilo) =>
    contenus.filter((p) => p.data.silo === silo && p.data.soussilo === soussilo && !p.data.mere),
  );
  // « À lire aussi » : quelques pages proches du même sous-silo, pas des dizaines (module 6).
  eleventyConfig.addFilter("pagesProches", (contenus, silo, soussilo, url, max = 3) =>
    contenus.filter((p) => p.data.silo === silo && p.data.soussilo === soussilo && !p.data.mere && p.url !== url).slice(0, max),
  );

  // ----- Pages techniques, communes à tous les sites -----
  // Une page par silo, générée depuis _data/silos.json : elle mène à chaque page mère.
  eleventyConfig.addTemplate("_technique/silo.njk", "", {
    pagination: { data: "silos", size: 1, alias: "silo" },
    permalink: (data) => `/${data.silo.slug}/`,
    layout: "hub.njk",
    typePage: "hub",
    eleventyComputed: {
      title: (data) => data.silo.titre || data.silo.nom,
      description: (data) => data.silo.description,
      fil: (data) => [
        { nom: "Accueil", url: "/" },
        { nom: data.silo.nom, url: `/${data.silo.slug}/` },
      ],
    },
  });
  eleventyConfig.addTemplate(
    "_technique/sitemap.njk",
    `---
permalink: /sitemap.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{%- for p in collections.all %}{% if not p.data.sitemapExclu and not p.data.exemple %}
  <url><loc>{{ site.url }}{{ p.url }}</loc><lastmod>{{ p.date | dateIso }}</lastmod></url>
{%- endif %}{% endfor %}
</urlset>`,
  );
  eleventyConfig.addTemplate(
    "_technique/robots.njk",
    `---
permalink: /robots.txt
eleventyExcludeFromCollections: true
---
User-agent: *
Allow: /

Sitemap: {{ site.url }}/sitemap.xml`,
  );
  // Fichier de clé IndexNow (module 9) : prouve que le site est à toi.
  eleventyConfig.addTemplate("_technique/indexnow.njk", "{{ site.indexnow_cle }}", {
    permalink: (data) => (data.site.indexnow_cle ? `/${data.site.indexnow_cle}.txt` : false),
    eleventyExcludeFromCollections: true,
  });

  return {
    dir: { includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
