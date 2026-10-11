import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lirePage, analyser, REGLES, chargerSite } from "../garde-fou.js";

const MENTION = "En tant que Partenaire Amazon, je réalise un bénéfice sur les achats remplissant les conditions requises.";
const SITE = {
  url: "https://www.exemple.fr",
  amazon: { tag: "monsite-21", mention: MENTION },
  ga4_id: "G-TEST",
  garde_fou: { mots_min: 50 },
};

// Une phrase différente par page évite les faux doublons dans les tests.
const remplissage = (graine) => Array.from({ length: 60 }, (_, i) => `mot${graine}${i}`).join(" ");

function page({ url, type = "contenu", silo = "s", soussilo = "a", mere = false, motcle, titre, description, corps, ga4 = "G-TEST", mention = MENTION }) {
  const html = `<!doctype html><html><head><title>${titre ?? "Titre " + url}</title>
<meta name="description" content="${description ?? "Description " + url}">
<meta name="aff:type" content="${type}"><meta name="aff:silo" content="${silo}"><meta name="aff:soussilo" content="${soussilo}">
<meta name="aff:mere" content="${mere}"><meta name="aff:motcle" content="${motcle ?? "mot-cle " + url}">
<script src="/assets/site.js" data-ga4="${ga4}"></script></head>
<body><nav><a href="/">Accueil</a></nav><main><article><h1>H1</h1><div class="contenu">${corps ?? `<p>${remplissage(url)}</p>`}</div></article></main>
<footer><p>${mention}</p></footer></body></html>`;
  return lirePage(url, html);
}

function contexte(pages, extra = {}) {
  const fichiers = new Set(pages.map((p) => (p.url === "/" ? "index.html" : p.url.slice(1) + "index.html")));
  return { pages, fichiers, sitemap: pages.map((p) => SITE.url + p.url), site: SITE, ...extra };
}

// Un petit site correct : accueil -> mère -> deux filles qui renvoient vers la mère.
function siteSain() {
  return [
    page({ url: "/", type: "accueil", corps: `<p>Bienvenue</p><a href="/s/a/">Dossier</a>` }),
    page({ url: "/s/a/", mere: true, corps: `<p>${remplissage("m")}</p><a href="/s/a/f1/">F1</a> <a href="/s/a/f2/">F2</a>` }),
    page({ url: "/s/a/f1/", corps: `<p>${remplissage("f1")}</p><a href="/s/a/">mère</a>` }),
    page({ url: "/s/a/f2/", corps: `<p>${remplissage("f2")}</p><a href="/s/a/">mère</a>` }),
  ];
}

const erreursDe = (constats, regle) => constats.filter((c) => c.niveau === "erreur" && (!regle || c.regle === regle));

test("un site correct passe sans erreur", () => {
  assert.deepEqual(erreursDe(analyser(contexte(siteSain()))), []);
});

test("liens d'affiliation : sans tag, autre tag, lien raccourci", () => {
  const corps = `<p>${remplissage("x")}</p><a href="/s/a/">m</a>
    <a href="https://www.amazon.fr/dp/B000000001">sans</a>
    <a href="https://www.amazon.fr/dp/B000000002?tag=voleur-21">autre</a>
    <a href="https://amzn.to/abc">court</a>
    <a href="https://www.amazon.fr/dp/B000000003?tag=monsite-21">bon</a>`;
  const constats = REGLES["liens-affiliation"](contexte([page({ url: "/s/a/f1/", corps })]));
  assert.equal(constats.length, 3);
  assert.ok(constats.every((c) => c.niveau === "erreur"));
});

test("liens d'affiliation : l'identifiant provisoire est un simple avertissement", () => {
  const site = { ...SITE, amazon: { ...SITE.amazon, tag: "VOTRE-IDENTIFIANT" } };
  const p = page({ url: "/x/", corps: `<a href="https://www.amazon.fr/dp/B000000001?tag=VOTRE-IDENTIFIANT">x</a>` });
  const constats = REGLES["liens-affiliation"](contexte([p], { site }));
  assert.equal(constats.length, 1);
  assert.equal(constats[0].niveau, "avertissement");
});

test("texte dupliqué : détecté entre deux pages, ignoré dans les encadrés produit", () => {
  const para = "Ce paragraphe assez long est copié mot pour mot sur deux pages différentes du même site ce qui pose problème.";
  const encadre = `<div class="encadre-produit"><p>${para} encadré</p></div>`;
  const a = page({ url: "/a/", corps: `<p>${para}</p>${encadre}` });
  const b = page({ url: "/b/", corps: `<p>${para}</p>${encadre}` });
  const constats = REGLES["texte-duplique"](contexte([a, b]));
  assert.equal(constats.length, 1);
});

test("doublons de sujet : même mot-clé sur deux pages", () => {
  const a = page({ url: "/a/", motcle: "Meilleur sèche-cheveux" });
  const b = page({ url: "/b/", motcle: "meilleur seche cheveux" });
  assert.equal(REGLES["doublons-sujet"](contexte([a, b])).length, 1);
});

test("maillage : fille sans lien vers sa mère, page orpheline, lien cassé", () => {
  const pages = siteSain();
  pages[2] = page({ url: "/s/a/f1/", corps: `<p>${remplissage("f1")}</p><a href="/n-existe-pas/">x</a>` });
  pages[1] = page({ url: "/s/a/", mere: true, corps: `<p>${remplissage("m")}</p><a href="/s/a/f1/">F1</a>` }); // f2 n'est plus liée
  const constats = erreursDe(REGLES.maillage(contexte(pages)));
  const messages = constats.map((c) => `${c.page} ${c.message}`).join("\n");
  assert.match(messages, /\/s\/a\/f1\/ .*sans lien vers sa page mère/);
  assert.match(messages, /\/s\/a\/f1\/ lien vers une page qui n'existe pas/);
  assert.match(messages, /\/s\/a\/f2\/ page orpheline/);
});

test("prix en dur, mention absente, GA4 absent, page trop courte", () => {
  const p = page({ url: "/p/", corps: "<p>Il coûte 39,99 € en ce moment.</p>", mention: "", ga4: "" });
  const c = contexte([p]);
  assert.equal(erreursDe(REGLES["prix-en-dur"](c)).length, 1);
  assert.equal(erreursDe(REGLES["mention-amazon"](c)).length, 1);
  assert.equal(erreursDe(REGLES.ga4(c)).length, 1);
  assert.equal(erreursDe(REGLES["pages-courtes"](c)).length, 1);
});

test("titres en double et pages hors du plan du site", () => {
  const pages = siteSain();
  pages[3] = page({ url: "/s/a/f2/", titre: "Titre /s/a/f1/", corps: `<p>${remplissage("f2")}</p><a href="/s/a/">m</a>` });
  const c = contexte(pages, { sitemap: [SITE.url + "/", SITE.url + "/s/a/"] });
  assert.equal(erreursDe(REGLES["titres-descriptions"](c)).length, 1);
  assert.equal(erreursDe(REGLES["plan-du-site"](c)).length, 2);
});

test("affirmations de test : avertissement", () => {
  const p = page({ url: "/t/", corps: "<p>Nous avons testé ce modèle pendant un mois.</p>" });
  assert.equal(REGLES["affirmations-de-test"](contexte([p])).length, 1);
});

test("de bout en bout : le modèle se construit et seules ses pages d'exemple et champs à compléter bloquent", () => {
  const r = spawnSync(process.execPath, ["tools/site.js", "garde-fou", "_modele"], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  const { pages, fichiers, sitemap } = chargerSite("dist/_modele");
  const site = { url: "https://www.nom-du-site.fr", amazon: { tag: "VOTRE-IDENTIFIANT", mention: MENTION }, garde_fou: { mots_min: 400 } };
  const regles = new Set(erreursDe(analyser({ pages, fichiers, sitemap, site })).map((c) => c.regle));
  assert.deepEqual([...regles].sort(), ["a-completer", "pages-courtes"]);
});
