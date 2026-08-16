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

  function renderHeader() {
    var cur = currentPath();
    var links = NAV_LINKS.map(function (l) {
      var active = l.href === cur ? " active" : "";
      return '<li><a class="' + active.trim() + '" href="' + l.href + '">' + l.label + "</a></li>";
    }).join("");

    return (
      '<header class="site-header">' +
      '<div class="nav-wrap">' +
      '<a class="logo" href="/">Nov<span>ô</span>slav</a>' +
      '<nav class="main-nav" id="mainNav"><ul>' + links + "</ul></nav>" +
      '<div id="google_translate_element" class="notranslate"></div>' +
      '<button class="nav-toggle" id="navToggle" aria-label="Toggle menu">☰</button>' +
      "</div>" +
      "</header>"
    );
  }

  // Lets visitors read the site's English UI text in one of the real languages
  // Novaslav's design draws from. Doesn't (and can't) translate the Novaslav
  // words themselves, those are marked translate="no"/class="notranslate"
  // wherever they appear so Google's widget leaves them alone.
  function loadSiteTranslate() {
    if (window.__novaslavGTLoaded) return;
    window.__novaslavGTLoaded = true;
    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement({
        pageLanguage: "en",
        includedLanguages: "sk,cs,pl,hr,ru",
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
      }, "google_translate_element");
    };
    var script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    document.head.appendChild(script);
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

    loadSiteTranslate();
  });
})();
