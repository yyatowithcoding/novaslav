/* Shared header/footer, injected client-side so every page stays in sync. */
(function () {
  var NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/learn/", label: "Learn" },
    { href: "/dictionary/", label: "Dictionary" },
    { href: "/translator/", label: "Word Builder" },
    { href: "/practice/", label: "Practice" }
  ];

  function currentPath() {
    var path = window.location.pathname;
    if (path !== "/" && path.slice(-1) !== "/") path += "/";
    return path;
  }

  // Real languages Novaslav's design draws from. Google's own translate-link
  // redirect (not the embeddable widget, which has become unreliable, clicks
  // on it silently do nothing) translates the site's English UI into one of
  // these on Google's side. Can't (and shouldn't) touch the Novaslav words
  // themselves, those are marked translate="no" everywhere they appear.
  var SITE_LANGS = [
    { code: "sk", label: "Slovenčina" },
    { code: "cs", label: "Čeština" },
    { code: "pl", label: "Polski" },
    { code: "hr", label: "Hrvatski" },
    { code: "ru", label: "Русский" }
  ];

  function translateLinkHref(code) {
    return "https://translate.google.com/translate?sl=en&tl=" + code + "&u=" + encodeURIComponent(window.location.href);
  }

  function renderHeader() {
    var cur = currentPath();
    var links = NAV_LINKS.map(function (l) {
      var active = l.href === cur ? " active" : "";
      return '<li><a class="' + active.trim() + '" href="' + l.href + '">' + l.label + "</a></li>";
    }).join("");

    var langLinks = SITE_LANGS.map(function (l) {
      return '<a href="' + translateLinkHref(l.code) + '" target="_blank" rel="noopener">' + l.label + "</a>";
    }).join("");

    return (
      '<header class="site-header">' +
      '<div class="nav-wrap">' +
      '<a class="logo" href="/">Nov<span>ô</span>slav</a>' +
      '<nav class="main-nav" id="mainNav"><ul>' + links + "</ul></nav>" +
      '<div class="lang-picker">' +
      '<button class="lang-picker-btn" id="langPickerBtn" aria-label="Read this site in another language">🌐</button>' +
      '<div class="lang-picker-menu" id="langPickerMenu">' + langLinks + "</div>" +
      "</div>" +
      '<button class="nav-toggle" id="navToggle" aria-label="Toggle menu">☰</button>' +
      "</div>" +
      "</header>"
    );
  }

  function renderFooter() {
    var year = new Date().getFullYear();
    return (
      '<footer class="site-footer">' +
      '<div class="footer-wrap">' +
      "<div>&copy; " + year + " Novôslav, a made-up language built for fun." + "</div>" +
      '<div><a href="/learn/">Learn</a><a href="/dictionary/">Dictionary</a><a href="/translator/">Word Builder</a><a href="/practice/">Practice</a></div>' +
      "</div>" +
      "</footer>"
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    var headerMount = document.getElementById("site-header");
    var footerMount = document.getElementById("site-footer");
    if (headerMount) headerMount.outerHTML = renderHeader();
    if (footerMount) footerMount.outerHTML = renderFooter();

    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("mainNav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        nav.classList.toggle("open");
      });
    }

    var langBtn = document.getElementById("langPickerBtn");
    var langMenu = document.getElementById("langPickerMenu");
    if (langBtn && langMenu) {
      langBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        langMenu.classList.toggle("open");
      });
      document.addEventListener("click", function () {
        langMenu.classList.remove("open");
      });
    }
  });
})();
