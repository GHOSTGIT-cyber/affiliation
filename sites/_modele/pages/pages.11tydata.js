// Données communes aux pages de contenu : leur adresse et leur fil d'Ariane découlent
// du silo et du sous-silo (module 4). Une page mal rangée fait échouer la construction.
const FORMATS = ["meilleurs-x", "comparatif", "guide-achat", "question"];

function rangement(data) {
  const f = data.page.inputPath;
  const silo = data.silos.find((s) => s.slug === data.silo);
  if (!silo) throw new Error(`${f} : silo « ${data.silo} » absent de _data/silos.json`);
  const soussilo = silo.soussilos.find((s) => s.slug === data.soussilo);
  if (!soussilo) throw new Error(`${f} : sous-silo « ${data.soussilo} » absent du silo « ${silo.slug} »`);
  if (!FORMATS.includes(data.format)) throw new Error(`${f} : format « ${data.format} » inconnu (attendu : ${FORMATS.join(", ")})`);
  return { silo, soussilo };
}

export default {
  layout: "article.njk",
  typePage: "contenu",
  date: "git Last Modified",
  eleventyComputed: {
    permalink(data) {
      const { silo, soussilo } = rangement(data);
      return data.mere ? `/${silo.slug}/${soussilo.slug}/` : `/${silo.slug}/${soussilo.slug}/${data.page.fileSlug}/`;
    },
    fil(data) {
      const { silo, soussilo } = rangement(data);
      const fil = [
        { nom: "Accueil", url: "/" },
        { nom: silo.nom, url: `/${silo.slug}/` },
        { nom: soussilo.nom, url: `/${silo.slug}/${soussilo.slug}/` },
      ];
      if (!data.mere) fil.push({ nom: data.h1 || data.title, url: data.page.url });
      return fil;
    },
  },
};
