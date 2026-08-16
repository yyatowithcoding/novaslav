(function () {
  /* ---------------- Flashcards ---------------- */
  var fc = { deck: [], index: 0, category: "All" };

  function fcBackExtra(w) {
    if (w.cat === "Nouns") return "definite: " + w.def;
    if (w.cat === "Verbs") return "present: " + w.pres + " · past: " + w.past;
    return w.note || "";
  }

  function fcBuildDeck() {
    fc.deck = NOVASLAV_DATA.filter(function (w) {
      return fc.category === "All" || w.cat === fc.category;
    });
    fc.index = 0;
  }

  function fcRender() {
    var card = document.getElementById("flashcard");
    card.classList.remove("flipped");
    var w = fc.deck[fc.index];
    if (!w) return;
    document.getElementById("fcFront").textContent = w.en;
    var speakBtn = window.NovaslavTTS ? window.NovaslavTTS.button(w.word) : "";
    document.getElementById("fcBackWord").innerHTML = w.word + speakBtn;
    document.getElementById("fcBackExtra").textContent = fcBackExtra(w);
    document.getElementById("fcCount").textContent = (fc.index + 1) + " / " + fc.deck.length;
  }

  function fcShuffle() {
    for (var i = fc.deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = fc.deck[i]; fc.deck[i] = fc.deck[j]; fc.deck[j] = tmp;
    }
    fc.index = 0;
    fcRender();
  }

  function fcRenderChips() {
    var wrap = document.getElementById("fcCategoryChips");
    var cats = ["All"].concat(NOVASLAV_CATEGORIES);
    wrap.innerHTML = cats.map(function (c) {
      var active = c === fc.category ? " active" : "";
      return '<button class="chip' + active + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");
    wrap.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        fc.category = chip.dataset.cat;
        wrap.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        fcBuildDeck();
        fcRender();
      });
    });
  }

  function initFlashcards() {
    fcRenderChips();
    fcBuildDeck();
    fcRender();

    document.getElementById("flashcard").addEventListener("click", function () {
      this.classList.toggle("flipped");
    });
    document.getElementById("fcPrev").addEventListener("click", function () {
      fc.index = (fc.index - 1 + fc.deck.length) % fc.deck.length;
      fcRender();
    });
    document.getElementById("fcNext").addEventListener("click", function () {
      fc.index = (fc.index + 1) % fc.deck.length;
      fcRender();
    });
    document.getElementById("fcShuffle").addEventListener("click", fcShuffle);
  }

  /* ---------------- Quiz ---------------- */
  var quiz = { questions: [], current: 0, score: 0, direction: "en-nov" };

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function buildQuiz() {
    var category = document.getElementById("quizCategory").value;
    var pool = NOVASLAV_DATA.filter(function (w) {
      return category === "All" || w.cat === category;
    });
    var count = Math.min(10, pool.length);
    var chosen = shuffleArray(pool).slice(0, count);

    quiz.questions = chosen.map(function (correct) {
      var distractorPool = pool.filter(function (w) { return w !== correct; });
      var distractors = shuffleArray(distractorPool).slice(0, 3);
      var options = shuffleArray([correct].concat(distractors));
      return { correct: correct, options: options };
    });
    quiz.current = 0;
    quiz.score = 0;
  }

  function quizRenderQuestion() {
    var total = quiz.questions.length;
    var q = quiz.questions[quiz.current];
    document.getElementById("quizProgressBar").style.width = ((quiz.current) / total * 100) + "%";
    document.getElementById("quizProgressText").textContent =
      "Question " + (quiz.current + 1) + " of " + total + " · Score: " + quiz.score;

    var promptEl = document.getElementById("quizPrompt");
    if (quiz.direction === "en-nov") {
      promptEl.textContent = q.correct.en;
      promptEl.removeAttribute("translate");
    } else {
      promptEl.textContent = q.correct.word;
      promptEl.setAttribute("translate", "no");
    }

    var optionsWrap = document.getElementById("quizOptions");
    optionsWrap.innerHTML = "";
    q.options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "quiz-option";
      btn.textContent = quiz.direction === "en-nov" ? opt.word : opt.en;
      if (quiz.direction === "en-nov") btn.setAttribute("translate", "no");
      btn.addEventListener("click", function () { quizAnswer(opt, q.correct, btn); });
      optionsWrap.appendChild(btn);
    });
  }

  function quizAnswer(chosen, correct, btnEl) {
    var buttons = document.querySelectorAll("#quizOptions .quiz-option");
    buttons.forEach(function (b) { b.disabled = true; });

    if (chosen === correct) {
      quiz.score++;
      btnEl.classList.add("correct");
    } else {
      btnEl.classList.add("wrong");
      buttons.forEach(function (b) {
        var idx = Array.prototype.indexOf.call(buttons, b);
        if (quiz.questions[quiz.current].options[idx] === correct) b.classList.add("correct");
      });
    }

    setTimeout(function () {
      quiz.current++;
      if (quiz.current >= quiz.questions.length) {
        quizShowResult();
      } else {
        quizRenderQuestion();
      }
    }, 900);
  }

  function quizShowResult() {
    document.getElementById("quizPlay").style.display = "none";
    document.getElementById("quizResult").style.display = "block";
    document.getElementById("quizScoreText").textContent = quiz.score + " / " + quiz.questions.length;
  }

  function quizStart() {
    quiz.direction = document.querySelector('input[name="quizDir"]:checked').value;
    buildQuiz();
    document.getElementById("quizIntro").style.display = "none";
    document.getElementById("quizResult").style.display = "none";
    document.getElementById("quizPlay").style.display = "block";
    quizRenderQuestion();
  }

  function initQuiz() {
    var select = document.getElementById("quizCategory");
    NOVASLAV_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      select.appendChild(opt);
    });
    document.getElementById("quizStart").addEventListener("click", quizStart);
    document.getElementById("quizRetry").addEventListener("click", function () {
      document.getElementById("quizResult").style.display = "none";
      document.getElementById("quizIntro").style.display = "block";
    });
  }

  /* ---------------- Tabs ---------------- */
  function initTabs() {
    var tabBtns = document.querySelectorAll("#practiceTabs .tab-btn");
    tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        tabBtns.forEach(function (b) { b.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initQuiz();

    var quizStartBtn = document.getElementById("quizStart");
    quizStartBtn.disabled = true;
    document.getElementById("fcFront").textContent = "Loading...";

    NOVASLAV_DATA_READY.then(function () {
      quizStartBtn.disabled = false;
      initFlashcards();
    });
  });
})();
