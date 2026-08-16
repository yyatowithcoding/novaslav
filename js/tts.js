/* Pronunciation playback via the browser's built-in speech synthesis.
   No server involved, works for any word including newly-added ones.
   Novaslav isn't a real language a TTS engine knows, so this picks the closest-sounding
   real voice available (Slovak/Czech/Polish) and reads the Latin spelling through it,
   an approximation, not authoritative pronunciation. */
(function () {
  var PREFERRED_VOICE_LANGS = ["sk-SK", "cs-CZ", "pl-PL", "sk", "cs", "pl"];

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    var voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    for (var i = 0; i < PREFERRED_VOICE_LANGS.length; i++) {
      var lang = PREFERRED_VOICE_LANGS[i].toLowerCase();
      var match = voices.find(function (v) { return v.lang.toLowerCase().indexOf(lang) === 0; });
      if (match) return match;
    }
    return voices[0];
  }

  function ensureVoices(cb) {
    if (!window.speechSynthesis) { cb(); return; }
    var voices = window.speechSynthesis.getVoices();
    if (voices.length) { cb(); return; }
    var fired = false;
    window.speechSynthesis.addEventListener("voiceschanged", function once() {
      if (fired) return;
      fired = true;
      window.speechSynthesis.removeEventListener("voiceschanged", once);
      cb();
    });
    // Some browsers never fire voiceschanged if there's only ever one (default) voice.
    setTimeout(function () { if (!fired) { fired = true; cb(); } }, 300);
  }

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    ensureVoices(function () {
      window.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      var voice = pickVoice();
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else {
        utter.lang = "sk-SK";
      }
      utter.rate = 0.85;
      window.speechSynthesis.speak(utter);
    });
  }

  function button(text, extraClass) {
    if (!window.speechSynthesis || !text) return "";
    var safe = String(text).replace(/"/g, "&quot;");
    return '<button type="button" class="speak-btn' + (extraClass ? " " + extraClass : "") +
      '" data-speak="' + safe + '" title="Play pronunciation" aria-label="Play pronunciation">🔊</button>';
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".speak-btn") : null;
    if (btn && btn.dataset.speak) {
      e.stopPropagation();
      speak(btn.dataset.speak);
    }
  });

  window.NovaslavTTS = { supported: function () { return !!window.speechSynthesis; }, speak: speak, button: button };
})();
