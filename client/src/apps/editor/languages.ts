import { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { yaml as yamlMode } from "@codemirror/legacy-modes/mode/yaml";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile as dockerMode } from "@codemirror/legacy-modes/mode/dockerfile";
import { ruby as rubyMode } from "@codemirror/legacy-modes/mode/ruby";
import { lua as luaMode } from "@codemirror/legacy-modes/mode/lua";
import { r as rMode } from "@codemirror/legacy-modes/mode/r";
import { properties as iniMode } from "@codemirror/legacy-modes/mode/properties";
import { diff as diffMode } from "@codemirror/legacy-modes/mode/diff";
import { clike, csharp as csharpMode, kotlin as kotlinMode, scala as scalaMode, dart as dartMode } from "@codemirror/legacy-modes/mode/clike";

// Pre-defined StreamLanguage instances for legacy modes
const shell = StreamLanguage.define(shellMode);
const yaml = StreamLanguage.define(yamlMode);
const toml = StreamLanguage.define(tomlMode);
const dockerfile = StreamLanguage.define(dockerMode);
const ruby = StreamLanguage.define(rubyMode);
const lua = StreamLanguage.define(luaMode);
const r = StreamLanguage.define(rMode);
const ini = StreamLanguage.define(iniMode);
const diff = StreamLanguage.define(diffMode);
const csharp = StreamLanguage.define(csharpMode);
const kotlin = StreamLanguage.define(kotlinMode);
const scala = StreamLanguage.define(scalaMode);
const dart = StreamLanguage.define(dartMode);

// Custom clike configs for languages without pre-defined exports
const kw = (words: string[]): Record<string, true> => Object.fromEntries(words.map((w) => [w, true]));
const swift = StreamLanguage.define(clike({
  name: "swift",
  keywords: kw(["func","let","var","class","struct","enum","protocol","extension","import","if","else","guard","for","while","repeat","switch","case","default","return","break","continue","in","is","as","nil","true","false","self","super","init","deinit","private","public","internal","open","fileprivate","static","throws","rethrows","try","catch","do","defer","where","associatedtype","typealias","subscript"]),
}));
const graphql = StreamLanguage.define(clike({
  name: "graphql",
  keywords: kw(["query","mutation","subscription","fragment","schema","type","input","interface","union","enum","scalar","extend","directive","on","implements","null","true","false"]),
}));

export interface LangInfo {
  label: string;
  extension: Extension;
}

const MAP: Record<string, LangInfo> = {
  js: { label: "JavaScript", extension: javascript() },
  jsx: { label: "JSX", extension: javascript({ jsx: true }) },
  mjs: { label: "JavaScript", extension: javascript() },
  cjs: { label: "JavaScript", extension: javascript() },
  ts: { label: "TypeScript", extension: javascript({ typescript: true }) },
  tsx: { label: "TSX", extension: javascript({ typescript: true, jsx: true }) },
  json: { label: "JSON", extension: json() },
  json5: { label: "JSON", extension: json() },
  html: { label: "HTML", extension: html() },
  htm: { label: "HTML", extension: html() },
  css: { label: "CSS", extension: css() },
  scss: { label: "SCSS", extension: css() },
  sass: { label: "Sass", extension: css() },
  less: { label: "Less", extension: css() },
  md: { label: "Markdown", extension: markdown() },
  markdown: { label: "Markdown", extension: markdown() },
  py: { label: "Python", extension: python() },
  rb: { label: "Ruby", extension: ruby },
  php: { label: "PHP", extension: php() },
  go: { label: "Go", extension: go() },
  rs: { label: "Rust", extension: rust() },
  java: { label: "Java", extension: java() },
  kt: { label: "Kotlin", extension: kotlin },
  c: { label: "C", extension: cpp() },
  h: { label: "C/C++ Header", extension: cpp() },
  cpp: { label: "C++", extension: cpp() },
  hpp: { label: "C++ Header", extension: cpp() },
  cc: { label: "C++", extension: cpp() },
  cs: { label: "C#", extension: csharp },
  swift: { label: "Swift", extension: swift },
  sh: { label: "Shell", extension: shell },
  bash: { label: "Shell", extension: shell },
  zsh: { label: "Shell", extension: shell },
  fish: { label: "Shell", extension: shell },
  ps1: { label: "PowerShell", extension: shell },
  yml: { label: "YAML", extension: yaml },
  yaml: { label: "YAML", extension: yaml },
  toml: { label: "TOML", extension: toml },
  ini: { label: "INI", extension: ini },
  cfg: { label: "Config", extension: ini },
  conf: { label: "Config", extension: ini },
  env: { label: "Env", extension: shell },
  sql: { label: "SQL", extension: sql() },
  xml: { label: "XML", extension: xml() },
  svg: { label: "SVG/XML", extension: xml() },
  vue: { label: "Vue", extension: html() },
  svelte: { label: "Svelte", extension: html() },
  astro: { label: "Astro", extension: html() },
  lua: { label: "Lua", extension: lua },
  r: { label: "R", extension: r },
  dart: { label: "Dart", extension: dart },
  scala: { label: "Scala", extension: scala },
  graphql: { label: "GraphQL", extension: graphql },
  gql: { label: "GraphQL", extension: graphql },
  diff: { label: "Diff", extension: diff },
  patch: { label: "Patch", extension: diff },
  txt: { label: "Plain Text", extension: [] },
  log: { label: "Log", extension: [] },
  csv: { label: "CSV", extension: [] },
  tsv: { label: "TSV", extension: [] },
};

export function languageForFile(name: string): LangInfo {
  const base = name.toLowerCase();
  if (base === "makefile") return { label: "Makefile", extension: shell };
  if (base === "dockerfile") return { label: "Dockerfile", extension: dockerfile };
  if (base.startsWith(".env")) return { label: "Env", extension: shell };
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  return MAP[ext] ?? { label: "Plain Text", extension: [] };
}
