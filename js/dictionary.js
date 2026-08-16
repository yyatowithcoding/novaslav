(function () {
  var state = { query: "", category: "All" };

  function render() {
    var tbody = document.getElementById("dictBody");
    var q = state.query.trim().toLowerCase();

    var filtered = NOVASLAV_DATA.filter(function (w) {
      var matchesCat = state.category === "All" || w.cat === state.category;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        w.en.toLowerCase().indexOf(q) !== -1 ||
        w.word.toLowerCase().indexOf(q) !== -1
      );
    });

    tbody.innerHTML = filtered.map(function (w) {
      var speakBtn = window.NovaslavTTS ? window.NovaslavTTS.button(w.word) : "";
      return (
        "<tr>" +
        '<td><span translate="no" style="font-family:var(--serif); font-size:1.15rem; color:#fff;">' + w.word + "</span>" + speakBtn + "</td>" +
        "<td>" + w.en + "</td>" +
        "</tr>"
      );
    }).join("");

    document.getElementById("emptyState").style.display = filtered.length ? "none" : "block";
    document.getElementById("resultCount").textContent =
      filtered.length + " word" + (filtered.length === 1 ? "" : "s") +
      (state.category !== "All" ? " in " + state.category : "") +
      (q ? ' matching "' + q + '"' : "");
  }

  function renderChips() {
    var wrap = document.getElementById("categoryChips");
    var cats = ["All"].concat(NOVASLAV_CATEGORIES);
    wrap.innerHTML = cats.map(function (c) {
      var active = c === state.category ? " active" : "";
      return '<button class="chip' + active + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");

    wrap.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.category = chip.dataset.cat;
        wrap.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        render();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderChips();
    document.getElementById("resultCount").textContent = "Loading words...";
    document.getElementById("searchBox").addEventListener("input", function (e) {
      state.query = e.target.value;
      render();
    });
    NOVASLAV_DATA_READY.then(render);
  });
})();
