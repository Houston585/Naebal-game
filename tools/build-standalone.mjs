// Собирает play.html — версию игры, которая открывается двойным щелчком из папки, без сервера.
// Браузеры не загружают ES-модули со страниц file://, поэтому все модули склеиваются в один
// обычный <script> с маленьким загрузчиком. Запуск: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'client/js/main.js';
const OUT = path.join(ROOT, 'play.html');

const modules = new Map(); // путь от корня → код
function load(rel) {
  if (modules.has(rel)) return;
  modules.set(rel, null);
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const deps = [];
  // import { a, b as c } from './x.js';
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, from) => {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), from));
    deps.push(dep);
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const [a, b] = n.split(/\s+as\s+/);
      return b ? `${a}: ${b}` : a;
    });
    return `const { ${binds.join(', ')} } = __require(${JSON.stringify(dep)});`;
  });
  if (/^import\s/m.test(src)) throw new Error(`${rel}: неподдерживаемый import`);
  // экспорты: снимаем слово export и объявляем живые геттеры в начале модуля
  const names = [];
  src = src.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, list) => { list.split(',').map((x) => x.trim()).filter(Boolean).forEach((n) => names.push(n)); return ''; });
  if (/^export\s/m.test(src)) throw new Error(`${rel}: неподдерживаемый export`);
  src = src.replaceAll('import.meta.url', `new URL(${JSON.stringify(rel)}, document.baseURI).href`);
  const getters = names.map((n) => `Object.defineProperty(__exports, ${JSON.stringify(n)}, { enumerable: true, get: () => ${n} });`).join('\n');
  modules.set(rel, `${getters}\n${src}`);
  deps.forEach(load);
}
load(ENTRY);

const bundle = `(function () {
'use strict';
const __defs = {}, __cache = {};
function __require(p) {
  if (__cache[p]) return __cache[p];
  const ex = (__cache[p] = {});
  __defs[p](__require, ex);
  return ex;
}
${[...modules].map(([rel, code]) => `__defs[${JSON.stringify(rel)}] = function (__require, __exports) {\n${code}\n};`).join('\n')}
__require(${JSON.stringify(ENTRY)});
})();`;

const css = fs.readFileSync(path.join(ROOT, 'client/css/style.css'), 'utf8');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Острова Лабеан</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>Для игры нужен JavaScript.</noscript>
<script>window.LABEAN_LOCAL_ONLY = true;</script>
<script>
${bundle.replaceAll('</script', '<\\/script')}
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log(`Готово: ${path.relative(ROOT, OUT)} — ${modules.size} модулей, ${(html.length / 1024).toFixed(0)} КБ`);
