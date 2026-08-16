(function () {
  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  function renderResult(html, isError) {
    var wrap = document.getElementById("importResult");
    wrap.style.display = "block";
    wrap.innerHTML = '<div class="note" style="' + (isError ? "border-color:var(--accent-3); border-left-color:var(--accent-3);" : "") + '">' + html + "</div>";
  }

  function renderSuccess(data) {
    var errorsHtml = "";
    if (data.errors && data.errors.length) {
      errorsHtml = "<br><b>Skipped lines:</b><ul>" +
        data.errors.map(function (e) { return "<li>" + e + "</li>"; }).join("") +
        "</ul>";
    }
    renderResult(
      "<b>" + data.added + "</b> word" + (data.added === 1 ? "" : "s") + " added" +
      (data.skipped ? ", " + data.skipped + " already existed and were skipped" : "") +
      "." + errorsHtml,
      false
    );
  }

  async function submitImport() {
    var btn = document.getElementById("importBtn");
    var text = document.getElementById("importText").value;
    var password = document.getElementById("importPassword").value;

    if (!text.trim()) {
      renderResult("Type or upload some words first.", true);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Adding...";

    try {
      var res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text, password: password })
      });
      var data = await res.json();

      if (!res.ok) {
        renderResult(data.error || ("Request failed with status " + res.status), true);
      } else {
        renderSuccess(data);
      }
    } catch (err) {
      renderResult("Couldn't reach the import service. Is the relay running?", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Add These Words";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("fileInput").addEventListener("change", async function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var text = await readFileAsText(file);
      document.getElementById("importText").value = text;
    });

    document.getElementById("importBtn").addEventListener("click", submitImport);
  });
})();
