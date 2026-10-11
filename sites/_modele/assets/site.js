// Consentement + mesure GA4 (module 10). GA4 n'est chargé qu'après accord explicite
// (recommandation CNIL) ; refuser est aussi simple qu'accepter. Le choix est gardé 6 mois.
// Chaque clic sur un lien d'affiliation envoie l'événement clic_<partenaire> (ex : clic_amazon).
(function () {
  var script = document.currentScript;
  var id = script && script.getAttribute("data-ga4");
  if (!id) return;

  var CLE = "consentement-mesure";
  var DUREE = 1000 * 60 * 60 * 24 * 182;

  function lireChoix() {
    try {
      var v = JSON.parse(localStorage.getItem(CLE));
      if (v && Date.now() - v.date < DUREE) return v.choix;
    } catch (e) {}
    return null;
  }
  function enregistrer(choix) {
    try {
      localStorage.setItem(CLE, JSON.stringify({ choix: choix, date: Date.now() }));
    } catch (e) {}
  }
  function chargerGa4() {
    if (window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-aff]");
    if (a && window.gtag) {
      window.gtag("event", "clic_" + a.getAttribute("data-aff"), {
        produit: a.getAttribute("data-produit") || "",
        page: location.pathname,
      });
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var bandeau = document.querySelector("[data-bandeau-cookies]");
    var choix = lireChoix();
    if (choix === "accepte") chargerGa4();
    else if (choix === null && bandeau) bandeau.hidden = false;

    if (bandeau) {
      bandeau.addEventListener("click", function (e) {
        var c = e.target.getAttribute && e.target.getAttribute("data-choix");
        if (!c) return;
        enregistrer(c);
        bandeau.hidden = true;
        if (c === "accepte") chargerGa4();
        // Un refus après un accord ne peut pas décharger GA4 : on recharge la page sans lui.
        else if (window.gtag) location.reload();
      });
    }
    var gerer = document.querySelector("[data-gerer-cookies]");
    if (gerer && bandeau) {
      gerer.addEventListener("click", function () {
        bandeau.hidden = false;
      });
    }
  });
})();
