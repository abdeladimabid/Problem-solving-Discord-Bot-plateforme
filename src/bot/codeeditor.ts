// The learner pages' code editor: Monaco, the editor of VS Code (pinned on cdnjs), with what a learner expects from VS
// Code: suggestions that know the DOM (document., addEv + Enter → addEventListener('click', (e) => { … })), HTML and
// CSS completion, Emmet (ul>li*3 + Tab), closing tags, PHP and Blade highlighting and snippets, Shift+Alt+F to format,
// multi-cursor, find / replace. One model per file, so each file keeps its own undo history.
// When Monaco can't load (an old browser, the CDN blocked), the page gets CodeMirror 5 (already on it) instead, with the
// same calls. Either way pastes are caught before the editor sees them (blocked or written down), and every change goes
// to the page as a typing-record entry [t, from, removed, text, origin], the format the teacher's replay reads.
export const MONACO_VERSION = "0.52.2";
const MONACO = `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min`;
const EMMET = "https://cdn.jsdelivr.net/npm/emmet-monaco-es@5.5.0/dist/emmet-monaco.min.js";

/**
 * One Monaco edit → typing-record entries. Each change's offset is in the text BEFORE the edit (several at once with
 * multi-cursor): the last one first, so the replay can apply them one after the other. The origin says what made it
 * (paste, complete, format, auto, undo, redo; else +input or +delete), so the replay doesn't take a suggestion for a paste.
 */
export function changeEntries(changes: { rangeOffset: number; rangeLength: number; text: string }[], t: number, origin: string): [number, number, number, string, string][] {
  return changes.slice().sort((a, b) => b.rangeOffset - a.rangeOffset).map((c) => [t, c.rangeOffset, c.rangeLength, c.text, origin || (c.text ? "+input" : "+delete")]);
}

/** The editor's script for a page (before the page's own script): it defines window.CBEditor. No `${` in it: snippet
 *  placeholders are written #{1:name} and turned into Monaco's syntax when used. */
export const CODE_EDITOR_JS = String.raw`(function () {
"use strict";
var MONACO = "` + MONACO + String.raw`", EMMET = "` + EMMET + String.raw`";
var changeEntries = (` + changeEntries.toString() + String.raw`);
var CM_MODES = { html: "htmlmixed", css: "css", javascript: "javascript", php: "application/x-httpd-php", blade: "htmlmixed", sql: "text/x-sql", json: "application/json", plaintext: "text/plain" };
var VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
var M = null, STATE = "idle", READY = null, ACTIVE = null, MODELS = {}, DOCS = {}, PASTING = false, FLAG = "";
function langOf(name) {
  var n = String(name || "").toLowerCase();
  if (/\.blade\.php$/.test(n)) return "blade";
  return { html: "html", htm: "html", css: "css", js: "javascript", mjs: "javascript", php: "php", sql: "sql", json: "json" }[n.split(".").pop()] || "plaintext";
}
function script(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.crossOrigin = "anonymous"; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
var snip = function (s) { return s.replace(/#\{/g, "$" + "{"); };

// ---------------------------------------------------------------- loading (Monaco, else CodeMirror)
function load(timeoutMs) {
  if (READY) return READY;
  READY = new Promise(function (resolve) {
    var done = false, fin = function (k) { if (!done) { done = true; STATE = k; resolve(k); } };
    setTimeout(function () { fin("cm"); }, timeoutMs || 20000);
    if (!window.Promise || !window.Worker) return fin("cm");
    // the language workers (the JavaScript suggestions) from the same CDN, through a data: address
    window.MonacoEnvironment = { getWorkerUrl: function () { return "data:text/javascript;charset=utf-8," + encodeURIComponent("self.MonacoEnvironment={baseUrl:'" + MONACO + "/'};importScripts('" + MONACO + "/vs/base/worker/workerMain.js');"); } };
    script(EMMET).catch(function () {}).then(function () { return script(MONACO + "/vs/loader.min.js"); }).then(function () {
      window.require.config({ paths: { vs: MONACO + "/vs" } });
      window.require(["vs/editor/editor.main"], function () {
        try { setup(window.monaco); } catch (e) { return fin("cm"); }
        // the editor measures its font's letters once: it has to be the real font, not the one shown while it loads
        fontReady().then(function () { fin("monaco"); warmUp(); });
      }, function () { fin("cm"); });
    }, function () { fin("cm"); });
  });
  return READY;
}

// ---------------------------------------------------------------- languages, suggestions, snippets
// [label, body, what it does]: after a « . », the method with its parentheses and placeholders (like VS Code with
// « complete function calls »); the object's own ones when it's known
var JS_MEMBER = [
  ["addEventListener", "addEventListener('#{1:click}', (#{2:e}) => {\n\t$0\n})", "Écoute un événement"],
  ["removeEventListener", "removeEventListener('#{1:click}', #{2:handler})", "Arrête d’écouter un événement"],
  ["querySelector", "querySelector('$1')", "Le premier élément qui correspond au sélecteur"],
  ["querySelectorAll", "querySelectorAll('$1')", "Tous les éléments qui correspondent au sélecteur"],
  ["getElementById", "getElementById('$1')", "L’élément qui a cet id"],
  ["createElement", "createElement('#{1:div}')", "Crée un élément"],
  ["appendChild", "appendChild($1)", "Ajoute un enfant à la fin"],
  ["append", "append($1)", "Ajoute à la fin"],
  ["prepend", "prepend($1)", "Ajoute au début"],
  ["setAttribute", "setAttribute('$1', '$2')", "Donne une valeur à un attribut"],
  ["getAttribute", "getAttribute('$1')", "La valeur d’un attribut"],
  ["removeAttribute", "removeAttribute('$1')", "Enlève un attribut"],
  ["closest", "closest('$1')", "Le parent le plus proche qui correspond"],
  ["preventDefault", "preventDefault()", "Annule l’action par défaut"],
  ["stopPropagation", "stopPropagation()", "Arrête la propagation de l’événement"],
  ["forEach", "forEach((#{1:item}) => {\n\t$0\n})", "Pour chaque élément"],
  ["map", "map((#{1:item}) => $0)", "Un nouveau tableau transformé"],
  ["filter", "filter((#{1:item}) => $0)", "Les éléments qui passent le test"],
  ["find", "find((#{1:item}) => $0)", "Le premier élément qui passe le test"],
  ["some", "some((#{1:item}) => $0)", "Au moins un élément passe le test"],
  ["every", "every((#{1:item}) => $0)", "Tous les éléments passent le test"],
  ["reduce", "reduce((#{1:acc}, #{2:item}) => $0, #{3:0})", "Réduit le tableau à une valeur"],
  ["includes", "includes($1)", "Contient la valeur"],
  ["push", "push($1)", "Ajoute à la fin du tableau"],
  ["then", "then((#{1:res}) => $0)", "Quand la promesse est tenue"],
  ["catch", "catch((#{1:err}) => $0)", "Quand la promesse échoue"],
  ["json", "json()", "Lit la réponse en JSON"]
];
var JS_ON = {
  classList: [["add", "add('$1')"], ["remove", "remove('$1')"], ["toggle", "toggle('$1')"], ["contains", "contains('$1')"], ["replace", "replace('$1', '$2')"]],
  console: [["log", "log($1)"], ["error", "error($1)"], ["warn", "warn($1)"], ["table", "table($1)"]],
  localStorage: [["getItem", "getItem('$1')"], ["setItem", "setItem('$1', $2)"], ["removeItem", "removeItem('$1')"], ["clear", "clear()"]],
  sessionStorage: [["getItem", "getItem('$1')"], ["setItem", "setItem('$1', $2)"], ["removeItem", "removeItem('$1')"], ["clear", "clear()"]],
  JSON: [["parse", "parse($1)"], ["stringify", "stringify($1)"]]
};
var JS_TOP = [
  ["log", "console.log($1);", "console.log"],
  ["fetch", "fetch('#{1:url}')\n\t.then((res) => res.json())\n\t.then((data) => {\n\t\t$0\n\t});", "fetch puis JSON"],
  ["for", "for (let #{1:i} = 0; #{1:i} < #{2:tableau}.length; #{1:i}++) {\n\t$0\n}", "Boucle for"],
  ["forof", "for (const #{1:item} of #{2:tableau}) {\n\t$0\n}", "Boucle for…of"],
  ["if", "if (#{1:condition}) {\n\t$0\n}", "Condition"],
  ["ifelse", "if (#{1:condition}) {\n\t$2\n} else {\n\t$0\n}", "Condition avec else"],
  ["function", "function #{1:nom}($2) {\n\t$0\n}", "Fonction"],
  ["arrow", "const #{1:nom} = ($2) => {\n\t$0\n};", "Fonction fléchée"],
  ["async", "async function #{1:nom}($2) {\n\t$0\n}", "Fonction async"],
  ["try", "try {\n\t$0\n} catch (#{1:error}) {\n\tconsole.error(#{1:error});\n}", "try / catch"],
  ["setTimeout", "setTimeout(() => {\n\t$0\n}, #{1:1000});", "Après un délai"],
  ["setInterval", "setInterval(() => {\n\t$0\n}, #{1:1000});", "À intervalle régulier"]
];
var PHP = [
  ["php", "<?php\n$0", "Ouvre du PHP"],
  ["echo", "echo $1;", "Affiche"],
  ["function", "function #{1:nom}($2)\n{\n\t$0\n}", "Fonction"],
  ["class", "class #{1:Nom}\n{\n\tpublic function __construct($2)\n\t{\n\t\t$0\n\t}\n}", "Classe"],
  ["public function", "public function #{1:nom}($2)\n{\n\t$0\n}", "Méthode publique"],
  ["foreach", "foreach (\\$#{1:items} as \\$#{2:item}) {\n\t$0\n}", "Boucle foreach"],
  ["for", "for (\\$#{1:i} = 0; \\$#{1:i} < #{2:10}; \\$#{1:i}++) {\n\t$0\n}", "Boucle for"],
  ["if", "if (#{1:condition}) {\n\t$0\n}", "Condition"],
  ["ifelse", "if (#{1:condition}) {\n\t$2\n} else {\n\t$0\n}", "Condition avec else"],
  ["while", "while (#{1:condition}) {\n\t$0\n}", "Boucle while"],
  ["try", "try {\n\t$0\n} catch (Exception \\$e) {\n\techo \\$e->getMessage();\n}", "try / catch"],
  ["isset", "isset(\\$$1)", "La variable existe"],
  ["pdo", "\\$pdo = new PDO('mysql:host=#{1:localhost};dbname=#{2:base};charset=utf8mb4', '#{3:root}', '$4', [\n\tPDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n\tPDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,\n]);", "Connexion PDO"],
  ["prepare", "\\$stmt = \\$pdo->prepare('#{1:SELECT * FROM table WHERE id = :id}');\n\\$stmt->execute(['#{2:id}' => \\$#{3:id}]);\n\\$#{4:rows} = \\$stmt->fetchAll();", "Requête préparée PDO"],
  ["fetch", "\\$stmt->fetch(PDO::FETCH_ASSOC)", "Une ligne du résultat"]
];
var BLADE = [
  ["@if", "@if (#{1:condition})\n\t$0\n@endif", "Condition"],
  ["@ifelse", "@if (#{1:condition})\n\t$2\n@else\n\t$0\n@endif", "Condition avec @else"],
  ["@foreach", "@foreach (\\$#{1:items} as \\$#{2:item})\n\t$0\n@endforeach", "Boucle"],
  ["@forelse", "@forelse (\\$#{1:items} as \\$#{2:item})\n\t$3\n@empty\n\t$0\n@endforelse", "Boucle avec cas vide"],
  ["@extends", "@extends('#{1:layouts.app}')", "Hérite d’un layout"],
  ["@section", "@section('#{1:content}')\n\t$0\n@endsection", "Section"],
  ["@yield", "@yield('#{1:content}')", "Emplacement d’une section"],
  ["@include", "@include('$1')", "Inclut une vue"],
  ["@csrf", "@csrf", "Jeton CSRF du formulaire"],
  ["@auth", "@auth\n\t$0\n@endauth", "Utilisateur connecté"],
  ["{{", "{{ $1 }}", "Affiche (échappé)"],
  ["{!!", "{!! $1 !!}", "Affiche sans échapper"]
];
var BLADE_DIRECTIVES = "if|elseif|else|endif|unless|endunless|isset|endisset|empty|endempty|foreach|endforeach|forelse|endforelse|for|endfor|while|endwhile|switch|case|break|default|endswitch|extends|section|endsection|show|yield|include|includeIf|each|stack|push|endpush|csrf|method|auth|endauth|guest|endguest|php|endphp|props|component|endcomponent|slot|endslot|error|enderror|json|selected|checked|disabled|class|vite";
function setup(monaco) {
  M = monaco;
  // Monaco cancels its own pending work (a hover, a suggestion) when the file changes: not an error of the page
  window.addEventListener("unhandledrejection", function (e) { var r = e.reason; if (r && (r.name === "Canceled" || r.message === "Canceled")) e.preventDefault(); });
  var K = monaco.languages.CompletionItemKind, R = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  var ts = monaco.languages.typescript;
  // JavaScript: the DOM types (the default libraries), the syntax errors as in VS Code, not the type checks
  ts.javascriptDefaults.setCompilerOptions({ target: ts.ScriptTarget.ESNext, allowNonTsExtensions: true, allowJs: true, checkJs: false, noLib: false });
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  ts.javascriptDefaults.setEagerModelSync(true);
  var rangeAt = function (model, pos, from) { var w = model.getWordUntilPosition(pos); return { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: from || w.startColumn, endColumn: w.endColumn }; };
  var item = function (x, kind, range, rank) { return { label: x[0], kind: kind, insertText: snip(x[1]), insertTextRules: R, range: range, sortText: rank + x[0], detail: x[2] || "" }; };
  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: ["."],
    provideCompletionItems: function (model, pos) {
      var w = model.getWordUntilPosition(pos), line = model.getLineContent(pos.lineNumber), before = line.slice(0, w.startColumn - 1);
      if ((before.match(/'/g) || []).length % 2 || (before.match(/"/g) || []).length % 2 || /\/\//.test(before)) return { suggestions: [] };
      var range = rangeAt(model, pos), dot = before.match(/([A-Za-z_$][\w$]*)\s*\.\s*$/), typed = w.word.toLowerCase();
      // after « . »: the language's own list first (document. → the DOM); once 2 letters are typed, the calls that start
      // with them, with the same label, ranked first: Enter inserts the call (incomplete: asked again at each letter)
      if (/\.\s*$/.test(before)) {
        if (typed.length < 2) return { suggestions: [], incomplete: true };
        var list = dot && JS_ON[dot[1]] ? JS_ON[dot[1]] : JS_MEMBER;
        return { suggestions: list.filter(function (x) { return x[0].toLowerCase().indexOf(typed) === 0; }).map(function (x) { return item(x, K.Method, range, "0"); }), incomplete: true };
      }
      return { suggestions: JS_TOP.map(function (x) { return item(x, K.Snippet, range, "1"); }) };
    }
  });
  monaco.languages.registerCompletionItemProvider("php", {
    provideCompletionItems: function (model, pos) { var r = rangeAt(model, pos); return { suggestions: PHP.map(function (x) { return item(x, K.Snippet, r, "1"); }) }; }
  });
  // Blade (resources/views/*.blade.php): HTML with @directives and {{ }}
  monaco.languages.register({ id: "blade", extensions: [".blade.php"], aliases: ["Blade"] });
  monaco.languages.setLanguageConfiguration("blade", {
    comments: { blockComment: ["{{--", "--}}"] },
    brackets: [["{{", "}}"], ["{!!", "!!}"], ["<", ">"], ["(", ")"], ["[", "]"], ["{", "}"]],
    autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "{", close: "}" }, { open: "'", close: "'" }, { open: '"', close: '"' }],
    surroundingPairs: [{ open: "(", close: ")" }, { open: "'", close: "'" }, { open: '"', close: '"' }, { open: "<", close: ">" }]
  });
  monaco.languages.setMonarchTokensProvider("blade", {
    tokenizer: {
      root: [
        [/\{\{--/, "comment", "@bcomment"],
        [/\{\{|\{!!/, "delimiter.bracket", "@echo"],
        [new RegExp("@(" + BLADE_DIRECTIVES + ")\\b"), "keyword"],
        [/<!--/, "comment", "@hcomment"],
        [/<\/?[A-Za-z][\w.:-]*/, "tag"], [/\/?>/, "tag"],
        [/[A-Za-z_:][\w:.-]*(?==)/, "attribute.name"],
        [/"[^"]*"|'[^']*'/, "attribute.value"],
        [/\$[A-Za-z_]\w*/, "variable"],
        [/[^<@{$"']+/, ""], [/./, ""]
      ],
      bcomment: [[/--\}\}/, "comment", "@pop"], [/./, "comment"]],
      hcomment: [[/-->/, "comment", "@pop"], [/./, "comment"]],
      echo: [[/\}\}|!!\}/, "delimiter.bracket", "@pop"], [/\$[A-Za-z_]\w*/, "variable"], [/"[^"]*"|'[^']*'/, "string"], [/->|::/, "delimiter"], [/[A-Za-z_]\w*/, "identifier"], [/./, ""]]
    }
  });
  monaco.languages.registerCompletionItemProvider("blade", {
    triggerCharacters: ["@", "{"],
    provideCompletionItems: function (model, pos) {
      var w = model.getWordUntilPosition(pos), line = model.getLineContent(pos.lineNumber);
      var at = line.slice(0, w.startColumn - 1).match(/(@|\{\{|\{!!|\{)$/);
      var r = rangeAt(model, pos, at ? w.startColumn - at[1].length : 0);
      return { suggestions: BLADE.map(function (x) { return item(x, K.Snippet, r, "0"); }) };
    }
  });
  // Emmet: ul>li*3 then Tab, in HTML and Blade (not inside PHP code)
  // (its suggestions can throw at some places of a page: then simply no Emmet suggestion there)
  var reg = monaco.languages.registerCompletionItemProvider;
  monaco.languages.registerCompletionItemProvider = function (lang, prov) {
    var own = prov.provideCompletionItems;
    prov.provideCompletionItems = function () { try { return own.apply(this, arguments); } catch (e) { return { suggestions: [] }; } };
    return reg.call(this, lang, prov);
  };
  try { if (window.emmetMonaco) { window.emmetMonaco.emmetHTML(monaco, ["html", "blade"]); window.emmetMonaco.emmetCSS(monaco, ["css"]); } } catch (e) {}
  finally { monaco.languages.registerCompletionItemProvider = reg; }
}

/**
 * The page's code font (JetBrains Mono, « display=swap »: another font shows until it arrives). Monaco measures the
 * letters' width when an editor is created: measured on the other font, the cursor is drawn in one place and the text
 * typed in another. So: wait for the font (3 s at most), and measure again each time a font finishes loading.
 */
function fontReady() {
  var fonts = document.fonts;
  if (!fonts || !fonts.load) return Promise.resolve();
  var again = function () { try { M.editor.remeasureFonts(); } catch (e) {} };
  if (fonts.addEventListener) fonts.addEventListener("loadingdone", again);
  if (fonts.ready) fonts.ready.then(again);
  var wait = Promise.all([fonts.load('400 14px "JetBrains Mono"'), fonts.load('700 14px "JetBrains Mono"')]).catch(function () {});
  return Promise.race([wait, new Promise(function (r) { setTimeout(r, 3000); })]).then(again);
}
/** The JavaScript worker (the DOM suggestions) is big: started while the learner reads the rules, with a throwaway file. */
function warmUp() {
  try {
    var tmp = M.editor.createModel("document", "javascript");
    M.languages.typescript.getJavaScriptWorker().then(function (get) { return get(tmp.uri); }).then(function (w) { return w.getCompletionsAtPosition(tmp.uri.toString(), 8); })
      .catch(function () {}).then(function () { tmp.dispose(); });
  } catch (e) { /* the editor works without it, a bit slower the first time */ }
}

// ---------------------------------------------------------------- the theme of the page
function applyTheme(dark) {
  if (!M) return;
  var bg = (getComputedStyle(document.documentElement).getPropertyValue("--code") || "").trim(), name = dark ? "cb-dark" : "cb-light";
  try { M.editor.defineTheme(name, { base: dark ? "vs-dark" : "vs", inherit: true, rules: [], colors: /^#[0-9a-f]{6}$/i.test(bg) ? { "editor.background": bg, "editorGutter.background": bg } : {} }); M.editor.setTheme(name); }
  catch (e) { M.editor.setTheme(dark ? "vs-dark" : "vs"); }
}

// ---------------------------------------------------------------- files (one model / document each)
function now() { return ACTIVE && ACTIVE.now ? ACTIVE.now() : Date.now(); }
function modelOf(key, name, value) {
  var x = MODELS[key];
  if (x) return x;
  var model = M.editor.createModel(String(value == null ? "" : value), langOf(name), M.Uri.parse("inmemory://cb/" + encodeURIComponent(key) + "/" + encodeURIComponent(name)));
  model.setEOL(M.editor.EndOfLineSequence.LF);
  x = MODELS[key] = { model: model, name: name, silent: false, editor: null, view: null };
  model.onDidChangeContent(function (e) {
    if (x.silent || !ACTIVE || !ACTIVE.onChange) return;
    var origin = PASTING ? "paste" : FLAG || (e.isUndoing ? "undo" : e.isRedoing ? "redo" : "");
    ACTIVE.onChange(key, changeEntries(e.changes, now(), origin), model.getValue());
    // a tag typed in HTML gets its closing tag (like VS Code)
    var lang = model.getLanguageId(), c = e.changes[0];
    if (!origin && e.changes.length === 1 && c.text === ">" && (lang === "html" || lang === "blade") && x.editor) { var ed = x.editor; setTimeout(function () { closeTag(ed, model, c.rangeOffset + 1); }, 0); }
  });
  return x;
}
function closeTag(ed, model, offset) {
  if (ed.getModel() !== model) return;
  var pos = model.getPositionAt(offset), cur = ed.getPosition();
  if (!cur || cur.lineNumber !== pos.lineNumber || cur.column !== pos.column) return;
  var before = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1), after = model.getLineContent(pos.lineNumber).slice(pos.column - 1);
  var m = before.match(/<([A-Za-z][\w:.-]*)(?:\s[^<>]*)?>$/);
  if (!m || /\/>$/.test(before) || VOID.test(m[1]) || after.indexOf("</" + m[1]) === 0) return;
  FLAG = "auto";
  try { ed.executeEdits("cb-close-tag", [{ range: new M.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: "</" + m[1] + ">" }], [new M.Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column)]); } finally { FLAG = ""; }
}
function docOf(key, name, value) {
  var x = DOCS[key];
  if (x) return x;
  var doc = CodeMirror.Doc(String(value == null ? "" : value), CM_MODES[langOf(name)]);
  x = DOCS[key] = { doc: doc, name: name };
  doc.on("beforeChange", function (d, ch) {
    if (!ACTIVE || (ch.origin !== "paste" && ch.origin !== "drop")) return;
    var t = ch.text.join("\n");
    if (ACTIVE.noPaste) { ch.cancel(); if (ACTIVE.onBlocked) ACTIVE.onBlocked(t); } else if (ACTIVE.onPaste) ACTIVE.onPaste(t);
  });
  doc.on("change", function (d, ch) {
    if (ch.origin === "setValue" || !ACTIVE || !ACTIVE.onChange) return;
    ACTIVE.onChange(key, [[now(), d.indexFromPos(ch.from), ch.removed.join("\n").length, ch.text.join("\n"), ch.origin || ""]], d.getValue());
  });
  return x;
}

// ---------------------------------------------------------------- one editor on the page
// o: { dark, noPaste, now(), onChange(key, entries, value), onPaste(text), onBlocked(text), onRun(), onSave() }
function create(el, o) {
  ACTIVE = o;
  el.setAttribute("translate", "no");
  if (STATE === "monaco") return monacoEditor(el, o);
  return cmEditor(el, o);
}
function monacoEditor(el, o) {
  el.classList.add("cb-monaco");
  var ed = M.editor.create(el, {
    model: null, automaticLayout: true, minimap: { enabled: false }, fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace', fontSize: 14, lineHeight: 21,
    tabSize: 2, insertSpaces: true, detectIndentation: false, autoClosingBrackets: "always", autoClosingQuotes: "always", autoIndent: "full", formatOnType: true,
    scrollBeyondLastLine: false, quickSuggestions: { other: true, comments: false, strings: true }, suggestOnTriggerCharacters: true, tabCompletion: "on", snippetSuggestions: "inline",
    acceptSuggestionOnEnter: "on", fixedOverflowWidgets: true, bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, renderLineHighlight: "line",
    contextmenu: !o.noPaste, dragAndDrop: !o.noPaste, dropIntoEditor: { enabled: !o.noPaste }, copyWithSyntaxHighlighting: false, ariaLabel: "Éditeur de code", wordBasedSuggestions: "currentDocument"
  });
  applyTheme(!!o.dark);
  // pastes: caught before Monaco gets them (blocked, or written down with what was pasted)
  var onPaste = function (e) {
    var t = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    if (o.noPaste) { e.preventDefault(); e.stopPropagation(); if (o.onBlocked) o.onBlocked(t); return; }
    PASTING = true; setTimeout(function () { PASTING = false; }, 0);
    if (o.onPaste) o.onPaste(t);
  };
  var onDrop = function (e) { if (!o.noPaste) return; e.preventDefault(); e.stopPropagation(); if (o.onBlocked) o.onBlocked((e.dataTransfer && e.dataTransfer.getData("text/plain")) || ""); };
  el.addEventListener("paste", onPaste, true); el.addEventListener("drop", onDrop, true);
  // what a suggestion (or Emmet) inserts is a suggestion, not typing nor a paste
  var sc = ed.getContribution("editor.contrib.suggestController");
  if (sc && sc.onWillInsertSuggestItem) sc.onWillInsertSuggestItem(function () { FLAG = "complete"; setTimeout(function () { FLAG = ""; }, 0); });
  // two letters typed after « . » in JavaScript: the suggestions are asked again, so the calls with their parentheses
  // (addEv → addEventListener('click', …)) join the language's list, first
  ed.onDidChangeModelContent(function (e) {
    var m = ed.getModel(), pos = ed.getPosition();
    if (!m || !pos || m.getLanguageId() !== "javascript" || e.changes.length !== 1 || e.changes[0].text.length !== 1 || FLAG) return;
    var w = m.getWordUntilPosition(pos);
    if (w.word.length !== 2 || w.startColumn < 2 || m.getLineContent(pos.lineNumber).charAt(w.startColumn - 2) !== ".") return;
    // closed then opened again: an open list isn't asked again
    setTimeout(function () { ed.trigger("cb", "hideSuggestWidget", {}); ed.trigger("cb", "editor.action.triggerSuggest", {}); }, 0);
  });
  var KM = M.KeyMod, KC = M.KeyCode;
  ed.addCommand(KM.CtrlCmd | KC.Enter, function () { if (o.onRun) o.onRun(); });
  ed.addCommand(KM.CtrlCmd | KC.KeyS, function () { if (o.onSave) o.onSave(); });
  ed.addCommand(KM.Shift | KM.Alt | KC.KeyF, function () {
    var a = ed.getAction("editor.action.formatDocument");
    if (!a || !a.isSupported()) return;
    FLAG = "format";
    Promise.resolve(a.run()).then(function () { FLAG = ""; }, function () { FLAG = ""; });
  });
  var cur = null;
  return {
    kind: "monaco",
    open: function (key, name, value) {
      if (cur && MODELS[cur]) MODELS[cur].view = ed.saveViewState();
      var x = modelOf(key, name, value);
      x.editor = ed; cur = key;
      ed.setModel(x.model);
      if (x.view) ed.restoreViewState(x.view);
    },
    has: function (key) { return !!MODELS[key]; },
    get: function (key) { return MODELS[key] ? MODELS[key].model.getValue() : null; },
    reset: function (key, value) { var x = MODELS[key]; if (!x) return; x.silent = true; try { x.model.setValue(String(value)); } finally { x.silent = false; } },
    rename: function (oldKey, newKey, newName) { var x = MODELS[oldKey]; if (!x) return; var v = x.model.getValue(); if (cur === oldKey) { ed.setModel(null); cur = null; } x.model.dispose(); delete MODELS[oldKey]; modelOf(newKey, newName, v); },
    drop: function (key) { var x = MODELS[key]; if (!x) return; if (cur === key) { ed.setModel(null); cur = null; } x.model.dispose(); delete MODELS[key]; },
    theme: function (dark) { applyTheme(dark); },
    layout: function () { ed.layout(); },
    focus: function () { ed.focus(); },
    dispose: function () { if (cur && MODELS[cur]) { MODELS[cur].view = ed.saveViewState(); MODELS[cur].editor = null; } el.removeEventListener("paste", onPaste, true); el.removeEventListener("drop", onDrop, true); ed.dispose(); if (ACTIVE === o) ACTIVE = null; }
  };
}
function cmEditor(el, o) {
  // Ctrl+Enter reaches the page (CodeMirror lets it through): only saving is the editor's
  var save = function () { if (o.onSave) o.onSave(); };
  var cm = CodeMirror(el, { value: "", lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true, dragDrop: !o.noPaste, theme: o.dark ? "material-darker" : "default",
    extraKeys: { Tab: function (c) { if (c.somethingSelected()) c.indentSelection("add"); else c.replaceSelection("  "); }, "Shift-Tab": function (c) { c.indentSelection("subtract"); }, "Ctrl-S": save, "Cmd-S": save } });
  var cur = null;
  return {
    kind: "cm",
    open: function (key, name, value) { var x = docOf(key, name, value); cur = key; cm.swapDoc(x.doc); cm.setOption("mode", CM_MODES[langOf(name)]); setTimeout(function () { cm.refresh(); }, 0); },
    has: function (key) { return !!DOCS[key]; },
    get: function (key) { return DOCS[key] ? DOCS[key].doc.getValue() : null; },
    reset: function (key, value) { if (DOCS[key]) DOCS[key].doc.setValue(String(value)); },
    rename: function (oldKey, newKey, newName) { var x = DOCS[oldKey]; if (!x) return; var v = x.doc.getValue(); if (cur === oldKey) { cm.swapDoc(CodeMirror.Doc("")); cur = null; } delete DOCS[oldKey]; docOf(newKey, newName, v); },
    drop: function (key) { if (!DOCS[key]) return; if (cur === key) { cm.swapDoc(CodeMirror.Doc("")); cur = null; } delete DOCS[key]; },
    theme: function (dark) { cm.setOption("theme", dark ? "material-darker" : "default"); },
    layout: function () { cm.refresh(); },
    focus: function () { cm.focus(); },
    dispose: function () { cm.swapDoc(CodeMirror.Doc("")); if (ACTIVE === o) ACTIVE = null; }
  };
}
window.CBEditor = { load: load, create: create, langOf: langOf, state: function () { return STATE; } };
})();`;
