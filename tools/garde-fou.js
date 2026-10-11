// Le garde-fou (module 6) : lit toutes les pages construites et signale ce qui ne va pas
// AVANT la mise en ligne. Il ne corrige rien. Une erreur trouvée à la main = une règle de plus ici.
//
// Les métadonnées de chaque page (type, silo, mot-clé…) sont lues dans les balises
// <meta name="aff:*"> posées par les gabarits : le contrôle porte sur ce qui sera
// réellement publié, pas sur les fichiers sources.
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

const MARQUEUR_A_COMPLETER = "[À COMPLÉTER";
const TAG_PROVISOIRE = "VOTRE-IDENTIFIANT";

// Blocs ajoutés par les gabarits, exclus des contrôles de texte : ils se répètent par construction.
const BLOCS_GABARIT = ".encadre-produit, .a-lire-aussi, .sommaire, .comparatif";

const normaliser = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const compterMots = (s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length;

// ---------------------------------------------------------------------------
// Chargement des pages construites
// ---------------------------------------------------------------------------

function listerFichiers(dossier, base = dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    return e.isDirectory() ? listerFichiers(chemin, base) : [path.relative(base, chemin).split(path.sep).join("/")];
  });
}

export function urlDepuisFichier(fichier) {
  if (fichier === "index.html") return "/";
  if (fichier.endsWith("/index.html")) return "/" + fichier.slice(0, -"index.html".length);
  return "/" + fichier;
}

export function lirePage(url, html) {
  const racine = parse(html);
  const meta = (nom) => racine.querySelector(`meta[name="${nom}"]`)?.getAttribute("content") ?? "";
  const article = racine.querySelector("article .contenu") || racine.querySelector("main");
  const corps = article ? parse(article.innerHTML) : parse("");
  corps.querySelectorAll(BLOCS_GABARIT).forEach((n) => n.remove());
  const paragraphes = corps.querySelectorAll("p, li").map((n) => n.text.replace(/\s+/g, " ").trim());
  return {
    url,
    html,
    texteComplet: racine.querySelector("body")?.text.replace(/\s+/g, " ") ?? "",
    titre: racine.querySelector("title")?.text.trim() ?? "",
    description: racine.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
    h1: racine.querySelectorAll("h1").length,
    type: meta("aff:type"),
    silo: meta("aff:silo"),
    soussilo: meta("aff:soussilo"),
    mere: meta("aff:mere") === "true",
    motcle: meta("aff:motcle"),
    exemple: meta("aff:exemple") === "true",
    ga4: racine.querySelector("script[data-ga4]")?.getAttribute("data-ga4") ?? "",
    texteArticle: corps.text.replace(/\s+/g, " ").trim(),
    paragraphes,
    mots: compterMots(corps.text),
    liens: racine.querySelectorAll("a[href]").map((a) => ({
      href: a.getAttribute("href"),
      dansContenu: Boolean(article?.querySelector(`a[href="${a.getAttribute("href")}"]`)),
      statut: a.getAttribute("data-statut") || "",
      produit: a.getAttribute("data-produit") || "",
    })),
  };
}

export function chargerSite(sortie) {
  const fichiers = listerFichiers(sortie);
  const pages = fichiers
    .filter((f) => f.endsWith(".html"))
    .map((f) => lirePage(urlDepuisFichier(f), fs.readFileSync(path.join(sortie, f), "utf8")));
  const sitemap = fs.existsSync(path.join(sortie, "sitemap.xml"))
    ? [...fs.readFileSync(path.join(sortie, "sitemap.xml"), "utf8").matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    : null;
  return { pages, fichiers: new Set(fichiers), sitemap };
}

// ---------------------------------------------------------------------------
// Règles. Chacune reçoit le contexte et renvoie une liste de constats.
// ---------------------------------------------------------------------------

const erreur = (regle, page, message) => ({ niveau: "erreur", regle, page, message });
const avertissement = (regle, page, message) => ({ niveau: "avertissement", regle, page, message });

const estAmazon = (href) => /^https?:\/\/([a-z0-9-]+\.)*(amazon\.[a-z.]+|amzn\.[a-z]+|a\.co)(\/|$)/i.test(href);
const estInterne = (href) => !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//") && !href.startsWith("#");

function cibleInterne(href, depuis) {
  const sansAncre = href.split("#")[0].split("?")[0];
  if (!sansAncre) return null;
  const absolu = new URL(sansAncre, "https://x" + depuis).pathname;
  return decodeURIComponent(absolu);
}

function fichierDeUrl(url, fichiers) {
  const rel = url.replace(/^\//, "");
  if (rel === "" || rel.endsWith("/")) return fichiers.has(rel + "index.html");
  return fichiers.has(rel) || fichiers.has(rel + "/index.html");
}

export const REGLES = {
  // (1) Liens d'affiliation : ton identifiant, bien écrit, sur chaque lien Amazon.
  "liens-affiliation"({ pages, site }) {
    const out = [];
    const tag = site.amazon?.tag || "";
    let provisoires = 0;
    for (const p of pages) {
      for (const { href } of p.liens.filter((l) => estAmazon(l.href))) {
        let u;
        try {
          u = new URL(href);
        } catch {
          out.push(erreur("liens-affiliation", p.url, `lien Amazon mal formé : ${href}`));
          continue;
        }
        if (/^(amzn\.|a\.co)/i.test(u.hostname)) {
          out.push(erreur("liens-affiliation", p.url, `lien raccourci (${u.hostname}) : impossible de vérifier ton identifiant, utilise le catalogue`));
          continue;
        }
        const tags = u.searchParams.getAll("tag");
        if (tags.length === 0) out.push(erreur("liens-affiliation", p.url, `lien Amazon sans identifiant partenaire : ${href}`));
        else if (tags.length > 1 || tags[0] !== tag) out.push(erreur("liens-affiliation", p.url, `lien Amazon avec un autre identifiant que le tien (${tags.join(", ")}) : ${href}`));
        else if (tag === TAG_PROVISOIRE) provisoires++;
      }
    }
    if (provisoires)
      out.push(avertissement("liens-affiliation", "(tout le site)", `${provisoires} lien(s) portent l'identifiant provisoire ${TAG_PROVISOIRE} : ils ne te rapportent rien. Remplace-le dans _data/site.json dès ton inscription (module 7).`));
    return out;
  },

  // (2) Texte dupliqué d'une page à l'autre.
  "texte-duplique"({ pages }) {
    const vus = new Map();
    for (const p of pages.filter((p) => p.type === "contenu")) {
      for (const para of new Set(p.paragraphes.filter((x) => compterMots(x) >= 15).map(normaliser))) {
        if (!vus.has(para)) vus.set(para, []);
        vus.get(para).push(p.url);
      }
    }
    return [...vus.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([para, urls]) => erreur("texte-duplique", urls.join(" + "), `paragraphe identique : « ${para.slice(0, 90)}… »`));
  },

  // (3) Doublons de sujet : deux pages sur le même mot-clé se font concurrence (module 4).
  "doublons-sujet"({ pages }) {
    const parMotcle = new Map();
    for (const p of pages.filter((p) => p.type === "contenu")) {
      if (!p.motcle) continue;
      const k = normaliser(p.motcle);
      parMotcle.set(k, [...(parMotcle.get(k) || []), p.url]);
    }
    return [...parMotcle.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([k, urls]) => erreur("doublons-sujet", urls.join(" + "), `même mot-clé « ${k} » sur ${urls.length} pages : fusionne-les`));
  },

  // (4) Maillage interne : liens cassés, pages orphelines, filles sans lien vers leur mère.
  maillage({ pages, fichiers, site }) {
    const out = [];
    const recus = new Map(pages.map((p) => [p.url, 0]));
    const max = site.garde_fou?.liens_contenu_max ?? 15;
    for (const p of pages) {
      const cibles = new Set();
      let dansContenu = 0;
      for (const l of p.liens.filter((l) => estInterne(l.href))) {
        const cible = cibleInterne(l.href, p.url);
        if (!cible) continue;
        if (!fichierDeUrl(cible, fichiers)) out.push(erreur("maillage", p.url, `lien vers une page qui n'existe pas : ${l.href}`));
        if (cible !== p.url) cibles.add(cible);
        if (l.dansContenu) dansContenu++;
      }
      for (const c of cibles) if (recus.has(c)) recus.set(c, recus.get(c) + 1);
      if (p.type === "contenu" && dansContenu > max) out.push(avertissement("maillage", p.url, `${dansContenu} liens internes dans le texte : trop, garde ceux qui aident le lecteur`));
    }
    for (const p of pages.filter((p) => p.type === "contenu")) {
      if (recus.get(p.url) === 0) out.push(erreur("maillage", p.url, "page orpheline : aucune autre page n'y mène"));
      if (p.mere) continue;
      const mere = pages.find((m) => m.type === "contenu" && m.mere && m.silo === p.silo && m.soussilo === p.soussilo);
      if (!mere) out.push(erreur("maillage", p.url, `le sous-silo « ${p.silo}/${p.soussilo} » n'a pas de page mère`));
      else if (!p.liens.some((l) => estInterne(l.href) && cibleInterne(l.href, p.url) === mere.url))
        out.push(erreur("maillage", p.url, `page fille sans lien vers sa page mère ${mere.url}`));
    }
    return out;
  },

  // (5) Produits du catalogue encore « à vérifier ».
  "produits-a-verifier"({ pages }) {
    return pages.flatMap((p) =>
      [...new Set(p.liens.filter((l) => l.statut === "a-verifier").map((l) => l.produit))].map((id) =>
        erreur("produits-a-verifier", p.url, `produit « ${id} » encore « à vérifier » dans le catalogue`),
      ),
    );
  },

  // (6) Mention d'affiliation Amazon, claire et visible, sur toutes les pages.
  "mention-amazon"({ pages, site }) {
    const mention = (site.amazon?.mention || "").replace(/\s+/g, " ").trim();
    if (!mention) return [erreur("mention-amazon", "_data/site.json", "texte de la mention Amazon vide")];
    return pages.filter((p) => !p.texteComplet.includes(mention)).map((p) => erreur("mention-amazon", p.url, "mention d'affiliation Amazon absente"));
  },

  // (7) Prix écrits en dur : interdits s'ils ne viennent pas d'Amazon (module 5).
  "prix-en-dur"({ pages }) {
    const prix = /(\d[\d\s.,]*\s?(€|euros?\b|eur\b))|(€\s?\d)/i;
    return pages
      .filter((p) => p.type === "contenu" && prix.test(p.texteArticle))
      .map((p) => erreur("prix-en-dur", p.url, `prix écrit dans le texte : « ${p.texteArticle.match(prix)[0].trim()} »`));
  },

  // (8) Pages vides ou trop courtes.
  "pages-courtes"({ pages, site }) {
    const min = site.garde_fou?.mots_min ?? 400;
    return pages
      .filter((p) => p.type === "contenu" && p.mots < min)
      .map((p) => erreur("pages-courtes", p.url, `${p.mots} mots dans le texte (minimum réglé : ${min})`));
  },

  // (9) Titres et descriptions : présents, uniques, de longueur raisonnable. Un seul <h1>.
  "titres-descriptions"({ pages }) {
    const out = [];
    const indexables = pages.filter((p) => p.type !== "technique");
    for (const champ of ["titre", "description"]) {
      const vus = new Map();
      for (const p of indexables) {
        if (!p[champ]) {
          out.push(erreur("titres-descriptions", p.url, `${champ} absent(e)`));
          continue;
        }
        vus.set(p[champ], [...(vus.get(p[champ]) || []), p.url]);
      }
      for (const [v, urls] of vus) if (urls.length > 1) out.push(erreur("titres-descriptions", urls.join(" + "), `même ${champ} : « ${v} »`));
    }
    for (const p of indexables) {
      if (p.titre.length > 65) out.push(avertissement("titres-descriptions", p.url, `titre de ${p.titre.length} caractères : Google risque de le couper (vise 65 max)`));
      if (p.description.length > 160) out.push(avertissement("titres-descriptions", p.url, `description de ${p.description.length} caractères (vise 160 max)`));
      if (p.h1 !== 1) out.push(erreur("titres-descriptions", p.url, `${p.h1} titre(s) <h1> : il en faut exactement un`));
    }
    return out;
  },

  // (10) Pages d'exemple du modèle et champs à compléter : jamais en ligne.
  "a-completer"({ pages }) {
    return pages.flatMap((p) => [
      ...(p.exemple ? [erreur("a-completer", p.url, "page d'exemple du modèle : supprime-la avant publication")] : []),
      ...(p.html.includes(MARQUEUR_A_COMPLETER) ? [erreur("a-completer", p.url, `contient encore un champ ${MARQUEUR_A_COMPLETER}…]`)] : []),
    ]);
  },

  // (11) « Nous avons testé » : si c'est faux, c'est une pratique commerciale trompeuse,
  // et Google pénalise les avis qui inventent une expérience. À vérifier à la main.
  "affirmations-de-test"({ pages }) {
    const motif = /\b(nous avons|j'ai|on a)\s+(test[ée]|essay[ée])|test[ée]s?\s+par\s+(nos soins|nous|moi)|\bnos tests\b|\bmes tests\b/i;
    return pages
      .filter((p) => p.type === "contenu" && motif.test(p.texteArticle))
      .map((p) => avertissement("affirmations-de-test", p.url, `affirme un test (« ${p.texteArticle.match(motif)[0]} ») : garde-le seulement si c'est vrai`));
  },

  // (12) Mesure des clics (module 10) : le code GA4 doit être sur chaque page.
  ga4({ pages, site }) {
    if (!site.ga4_id) return [avertissement("ga4", "_data/site.json", "GA4 non configuré (ga4_id vide) : tu ne verras pas tes clics vers Amazon (module 10)")];
    return pages.filter((p) => p.ga4 !== site.ga4_id).map((p) => erreur("ga4", p.url, "code de suivi GA4 absent ou différent de site.json"));
  },

  // (13) Plan du site (module 8) : toutes les pages de contenu, aucune adresse morte.
  "plan-du-site"({ pages, fichiers, sitemap, site }) {
    if (!sitemap) return [erreur("plan-du-site", "/sitemap.xml", "plan du site absent")];
    const out = [];
    const urls = new Set(sitemap);
    for (const loc of sitemap) {
      if (!loc.startsWith(site.url + "/")) out.push(erreur("plan-du-site", "/sitemap.xml", `adresse hors du site : ${loc}`));
      else if (!fichierDeUrl(loc.slice(site.url.length), fichiers)) out.push(erreur("plan-du-site", "/sitemap.xml", `adresse sans page : ${loc}`));
    }
    for (const p of pages.filter((p) => p.type === "contenu" && !p.exemple)) {
      if (!urls.has(site.url + p.url)) out.push(erreur("plan-du-site", p.url, "page absente du plan du site"));
    }
    return out;
  },
};

export function analyser(contexte) {
  return Object.values(REGLES).flatMap((regle) => regle(contexte));
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

export function formaterRapport(nomSite, constats, nbPages) {
  const erreurs = constats.filter((c) => c.niveau === "erreur");
  const avert = constats.filter((c) => c.niveau === "avertissement");
  const lignes = [`# Garde-fou — ${nomSite}`, "", `${nbPages} pages contrôlées : ${erreurs.length} erreur(s), ${avert.length} avertissement(s).`, ""];
  for (const [titre, liste] of [
    ["Erreurs (bloquent la publication)", erreurs],
    ["Avertissements", avert],
  ]) {
    if (!liste.length) continue;
    lignes.push(`## ${titre}`, "");
    const parRegle = new Map();
    for (const c of liste) parRegle.set(c.regle, [...(parRegle.get(c.regle) || []), c]);
    for (const [regle, cs] of parRegle) {
      lignes.push(`### ${regle} (${cs.length})`);
      for (const c of cs) lignes.push(`- ${c.page} — ${c.message}`);
      lignes.push("");
    }
  }
  lignes.push(erreurs.length ? "❌ Ne publie pas : corrige les erreurs puis relance." : "✅ Rapport propre : tu peux publier.");
  return lignes.join("\n");
}

export function lancerGardeFou(nomSite, sortie) {
  const site = JSON.parse(fs.readFileSync(path.join("sites", nomSite, "_data", "site.json"), "utf8"));
  const { pages, fichiers, sitemap } = chargerSite(sortie);
  const constats = analyser({ pages, fichiers, sitemap, site });
  const rapport = formaterRapport(nomSite, constats, pages.length);
  // Le rapport est écrit à côté du site construit, jamais dedans : il ne doit pas être publié.
  const fichierRapport = path.join(path.dirname(sortie), `${nomSite}.garde-fou.md`);
  fs.writeFileSync(fichierRapport, rapport + "\n");
  console.log("\n" + rapport + `\n\n(Rapport enregistré dans ${fichierRapport})`);
  return !constats.some((c) => c.niveau === "erreur");
}
