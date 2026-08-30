#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SOURCE_ROOT = path.join(os.homedir(), 'GoogleDrive', 'Docs', '_customBrain');
const OUTPUT_ROOT = path.resolve(process.env.CUSTOMBRAIN_REBUILD_OUTPUT || path.join('docs', 'rebuild'));
const ENTITY_DIRS = ['People', 'Projects', 'Topics'];
const THOUGHT_DIR = 'customBrain';
const SUMMARY_DIR = 'customBrainSummaries';
const REPORT_DIR = 'reports';
const BATCH_SIZE = 80;

const ACRONYMS = new Map([
  ['ai', 'AI'],
  ['agi', 'AGI'],
  ['api', 'API'],
  ['b2b', 'B2B'],
  ['bts', 'BTS'],
  ['dco', 'DCO'],
  ['dv360', 'DV360'],
  ['ebkm', 'EBKM'],
  ['edm', 'EDM'],
  ['fb', 'Facebook'],
  ['genz', 'Gen Z'],
  ['hm', 'HM'],
  ['html', 'HTML'],
  ['html5', 'HTML5'],
  ['kb', 'KB'],
  ['it', 'IT'],
  ['llm', 'LLM'],
  ['mcp', 'MCP'],
  ['mmsz', 'MMSZ'],
  ['mvp', 'MVP'],
  ['nga', 'NGA'],
  ['os', 'OS'],
  ['ppc', 'PPC'],
  ['q1', 'Q1'],
  ['q2', 'Q2'],
  ['q3', 'Q3'],
  ['q4', 'Q4'],
  ['rmt', 'RMT'],
  ['rtm', 'RMT'],
  ['sdk', 'SDK'],
  ['seo', 'SEO'],
  ['thm', 'THM'],
  ['ui', 'UI'],
  ['uiux', 'UI/UX'],
  ['ux', 'UX'],
]);

const BRAND_CASING = new Map([
  ['adform', 'Adform'],
  ['adobe', 'Adobe'],
  ['anthropic', 'Anthropic'],
  ['canvas', 'Canvas'],
  ['chatgpt', 'ChatGPT'],
  ['claude', 'Claude'],
  ['codex', 'Codex'],
  ['facebook', 'Facebook'],
  ['figma', 'Figma'],
  ['github', 'GitHub'],
  ['google', 'Google'],
  ['hermes', 'Hermes'],
  ['hetzner', 'Hetzner'],
  ['indesign', 'InDesign'],
  ['karpathy', 'Karpathy'],
  ['lightrag', 'LightRAG'],
  ['linkedin', 'LinkedIn'],
  ['macbook', 'MacBook'],
  ['mediamarkt', 'MediaMarkt'],
  ['mediamix', 'MediaMix'],
  ['neo4j', 'Neo4j'],
  ['notebooklm', 'NotebookLM'],
  ['obsidian', 'Obsidian'],
  ['openai', 'OpenAI'],
  ['reddit', 'Reddit'],
  ['shopify', 'Shopify'],
  ['supabase', 'Supabase'],
  ['telekom', 'Telekom'],
  ['tiktok', 'TikTok'],
  ['wetransfer', 'WeTransfer'],
  ['youtube', 'YouTube'],
]);

const TITLE_OVERRIDES = new Map([
  ['2nd-brain-irányvektor-minek.md', 'Privát családi üzenet — 2026-05-04'],
  ['ai-kapcsolt-feladatok-skill-alapú-agent-munka.md', 'RMT Országtuning — Skill-alapú agentmunka és Hello Digitál ötlet — 2026-06-23'],
  ['ai-kapcsolt-feladatok.md', 'Telekom — Hiányos AI-feladat meetingfelvétel — 2026-04-19'],
  ['beerste-3-0-apr.md', 'ERSTE Vállakozók — BeErste 3.0 APR kreatívstátusz — 2026-04-03'],
  ['bizi-helló-szülő-prototípus-árazás.md', 'Évnyitó BTS App — Helló Szülő prototípus-visszajelzés és árazás — 2026-07-13'],
  ['brain-kétlépcsős-memória-és-predikcióval.md', 'customBrain — Kétlépcsős memória és prediktív lekérdezés — 2026-07-17'],
  ['confai-digital-media-hungary-egyeztetés.md', 'ConfAI — DMH technikai specifikáció és felvételi hozzájárulások — 2026-04-21'],
  ['confai-parlamenti-ai-prototípus-megbeszélés.md', 'ConfAI — Parlamenti prototípus és multikonferencia-architektúra — 2026-06-02'],
  ['demo-instance-létrehozás.md', 'Messaging matrix — Kliensfüggetlen demo instance létrehozása — 2026-04-05'],
  ['dco-2-heti-státusz.md', 'ERSTE — DCO státuszprezentáció és követési rend — 2026-04-21'],
  ['elavult-telekom-brandcomms-ai-day-alapelvek-v2-felülírta-a-v3-10-pont.md', 'Telekom — BrandComms AI Day alapelvek v2 (archív, v3 felülírta) — 2026-06-09'],
  ['erste-személyi-kölcsön-szk-krea-megújítás-vol-2-egyeztetés.md', 'ERSTE Személyi kölcsön — Kreatívmegújítás vol. 2 időpont-egyeztetés — 2026-05-14'],
  ['humanody-h-ntegrator-és-mm6-integráció.md', 'Humanody — H!ntegrator és MM6 integráció — 2026-05-08'],
  ['index.md', 'customBrain — Vault-tartalomjegyzék — 2026-07-20'],
  ['macbook-air-és-böngésző-optimalizálás.md', 'MacBook Air munkakörnyezet és böngészőfókusz — 2026-04-05'],
  ['parlamentai-projekt-kick-off.md', 'ParlementAI — Projekt-kickoff — 2026-07-09'],
  ['rtm-projekt-clarifikáció.md', 'RMT Országtuning — Projekt-scope tisztázása — 2026-04-03'],
  ['rtm-workflow-skill-nem-tool.md', 'RMT Országtuning — Skill-alapú workflow céltool helyett — 2026-06-23'],
  ['telekom-megrendelés-feldolgozása.md', 'Telekom — Megrendelés feldolgozása — 2026-05-08'],
  ['telekom-nexus-social-listening-tool-megosztás.md', 'Nexus — Social Listening Tool megosztása — 2026-07-18'],
  ['vibe-coding-eric-schluntz-anthropic.md', 'Eric Schluntz — Vibe coding az Anthropicnál — 2026-06-09'],
  ['wpp-daniel-j-hulme-ai-előadás.md', 'WPP — Daniel J. Hulme előadása az AI-ról és döntéshozatalról — 2026-04-05'],
  ['youtube-videó-megosztás.md', 'Tyrion és Joffrey konfliktusa — rövid videóreferencia — 2026-05-28'],
]);

const SUMMARY_OVERRIDES = new Map([
  ['2nd-brain-irányvektor-minek.md', 'Privát családi üzenet egy még nem nyilvános beültetéssel kapcsolatos helyzetről. A szerző diszkréciót és érzelmi támogatást kér a címzettől.'],
  ['ai-kapcsolt-feladatok-skill-alapú-agent-munka.md', 'Barta Attila egy AI-first marketing learning dayhez kért gyakorlati RMT-példát. Beliczki Róbert a célalkalmazásba épített AI és az általános agentharnesshez vitt munka közti különbséget vezette le: a gyorsan avuló toolok helyett hordozható skill-dokumentumokat érdemes fejleszteni. A skill rögzíti az inputokat, a műveleti sorrendet, a hibamódokat és az emberi korrekciókból származó minőségi szabályokat; ugyanazt a Codex-, Claude Code- vagy más agentkörnyezet is végre tudja hajtani.\n\nAz RMT példáján a helyi szövegek, táblázatok, Photoshop- és InDesign-feladatok tanulságai minden javítás után visszaírhatók a skillbe. A vizuális ízlés és kivételkezelés továbbra is emberi iterációt igényel. Attila ezt a programozás növekvő absztrakciós szintjeivel kapcsolta össze, és egy diát/memót kért a gondolatmenetről.\n\nA beszélgetés végén felmerült a Hello Digitál ötlete: a digitális műveltséget nem technikai alapoktól, hanem a felhasználó meglévő tapasztalatából, személyre szabottan kellene felépíteni. Az AI „Tetris-szerűen” illeszthetné az új tudást a már meglévőhöz. Attila ezt a Hello Szülő edukációs irányához kapcsolhatónak látta; további egyeztetésben állapodtak meg.'],
  ['ai-kapcsolt-feladatok.md', 'A rögzített 13 perces Telekom-meetingből csak néhány hangpróba- és smalltalk-sor maradt meg. Érdemi AI-feladat, döntés vagy akció a forrás alapján nem rekonstruálható.'],
  ['index.md', 'A customBrain-vault 2026. július 20-i gépi routing indexe. A bejegyzés a thoughtokat cím, típus, dátum, kapcsolódó projekt és személy szerint sorolja fel; a rebuildben minden hivatkozás az új, egyedi címre mutat.'],
  ['sahar-élményprodukció-és-megnyitó-szervezése.md', 'A 73 perces Sahar-meeting a produkció nyitási kritikus útvonalát rögzítette. A csapat áttekintette a helyszíni élményt, majd összehangolta a weboldal, videók, galéria, jegyértékesítés és Stripe-integráció befejezését. Következő lépések: Friends and Family időpontfoglaló, műsorvezetői szöveg, sajtó- és influencerlista, fotós/videós biztosítása, június 29-i teaser kampány, július eleji jegyértékesítés, GA4-beállítás és TikTok/Meta hirdetések előkészítése.'],
  ['vibe-coding-eric-schluntz-anthropic.md', 'Videóreferencia Eric Schluntz, az Anthropic munkatársának vibe codingról szóló előadásához. A forrás csak a címet, a csatornát és a YouTube-linket tartalmazza; leirat vagy részletes leírás nem áll rendelkezésre.'],
  ['youtube-videó-megosztás.md', 'A Sea-Worth csatorna rövid videóreferenciája egy jelenetről, amelyben Tyrion Lannister szembeszáll Joffrey királlyal, miután az megsérti a feleségét. A forrás csak címet és YouTube-linket tartalmaz.'],
]);

const METADATA_OVERRIDES = new Map([
  ['beerste-3-0-apr.md', { projects: ['[[Projects/ERSTE Vállakozók|ERSTE Vállakozók]]'] }],
  ['bizi-helló-szülő-prototípus-árazás.md', { projects: ['[[Projects/Évnyito BTS App|Évnyitó BTS App]]'] }],
  ['brain-kétlépcsős-memória-és-predikcióval.md', { people: null, projects: ['[[Projects/customBrain|customBrain]]'] }],
  ['context-graphs-ai-döntéshozatalban.md', {
    topics: ['context graph', 'Neo4j', 'RAG', 'AI agent', 'tudásgráf', 'döntéshozatal', 'pénzügyi szolgáltatások'],
    action_items: null,
  }],
  ['dco-2-heti-státusz.md', { projects: ['[[Projects/ERSTE|ERSTE]]'] }],
  ['demo-instance-létrehozás.md', { projects: ['[[Projects/Messaging matrix|Messaging matrix]]'] }],
  ['erste-személyi-kölcsön-verzió.md', { projects: ['[[Projects/ERSTE Személyi kölcsön|ERSTE Személyi kölcsön]]'] }],
  ['erste-szk-belső-edm-szövege-q1.md', { projects: ['[[Projects/ERSTE Személyi kölcsön|ERSTE Személyi kölcsön]]'] }],
  ['telekom-megrendelés-feldolgozása.md', { projects: ['[[Projects/Telekom|Telekom]]'] }],
]);

const ENTITY_TARGET_OVERRIDES = new Map([
  ['People:david porkolab', 'Porkoláb Dávid'],
  ['People:hollosi istvan', 'Istvan Hollosi'],
]);

const GENERIC_TITLE = /(?:heti|kétheti|operatív|belső)?\s*(?:sync|státusz|statusz|megbeszélés|egyeztetés|catchup|meeting|összefoglaló|frissítés|teendők|feladatok|áttekintés)(?:\s|$)/i;
const GENERIC_TOPICS = /^(?:meeting|megbeszélés|státusz|statusz|összefoglaló|egyeztetés|projekt|email|e-mail|admin|follow-up|feladatok|teendők)$/i;
const SUMMARY_KEYWORDS = /\b(?:dönt|eldönt|határoz|következő|feladat|teendő|akció|határidő|vállal|jóváhagy|elutasít|kockázat|probléma|eredmény|tanulság|javaslat|szükséges|kell|status|decision|decided|action|deadline|risk|problem|result|next step|approved|declined|agreed)\b/i;

function assertSource() {
  for (const dir of [...ENTITY_DIRS, THOUGHT_DIR]) {
    const fullPath = path.join(SOURCE_ROOT, dir);
    if (!fs.statSync(fullPath).isDirectory()) {
      throw new Error(`Missing source directory: ${fullPath}`);
    }
  }
}

function assertEmptyOutput() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const existing = fs.readdirSync(OUTPUT_ROOT);
  if (existing.length > 0) {
    throw new Error(`Output directory is not empty: ${OUTPUT_ROOT}`);
  }
}

function markdownFiles(dirPath) {
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'hu'));
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function splitFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return { frontmatter: '', body: content };
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: content };
  }

  return {
    frontmatter: content.slice(4, end),
    body: content.slice(end + 5),
  };
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitInlineList(value) {
  const inner = value.trim().slice(1, -1);
  return inner.split(',').map(stripQuotes).map((item) => item.trim()).filter(Boolean);
}

function parseFrontmatter(frontmatter) {
  const result = {};
  const lines = frontmatter.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!match) continue;

    const [, key, rawValue = ''] = match;
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      result[key] = splitInlineList(rawValue);
      continue;
    }

    if (rawValue.length > 0) {
      result[key] = stripQuotes(rawValue);
      continue;
    }

    const values = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const item = lines[cursor].match(/^\s+-\s+(.*)$/);
      if (!item) break;
      values.push(stripQuotes(item[1]));
      cursor += 1;
    }
    if (values.length > 0) {
      result[key] = values;
      index = cursor - 1;
    }
  }

  return result;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function applyMetadataOverrides(file, metadata) {
  const overrides = METADATA_OVERRIDES.get(file);
  if (!overrides) return { ...metadata };
  const next = { ...metadata };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

function normalizeKey(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('hu')
    .replace(/[’'"`]/g, '')
    .replace(/[\\/:*?<>|#%{}\[\]]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function extractLink(value, folder) {
  const match = value.match(new RegExp(`\\[\\[${folder}\\/([^|\\]#]+)(?:\\|([^\\]]+))?\\]\\]`, 'i'));
  if (match) return { target: match[1].trim(), label: (match[2] || match[1]).trim() };
  return { target: value.trim(), label: value.trim() };
}

function buildEntityContext(folder) {
  const dirPath = path.join(SOURCE_ROOT, folder);
  const files = markdownFiles(dirPath);
  const names = new Set();
  const aliasCandidates = new Map();
  const documents = [];

  for (const file of files) {
    const canonical = path.basename(file, '.md');
    const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
    const { frontmatter, body } = splitFrontmatter(content);
    const metadata = parseFrontmatter(frontmatter);
    const aliases = asList(metadata.aliases);
    names.add(canonical);
    documents.push({ file, canonical, content, frontmatter, body, metadata, aliases });

    for (const alias of [canonical, ...aliases]) {
      const key = normalizeKey(alias);
      if (!aliasCandidates.has(key)) aliasCandidates.set(key, new Set());
      aliasCandidates.get(key).add(canonical);
    }
  }

  const aliases = new Map();
  const ambiguous = new Map();
  for (const [key, candidates] of aliasCandidates) {
    if (candidates.size === 1) aliases.set(key, [...candidates][0]);
    else ambiguous.set(key, [...candidates].sort((a, b) => a.localeCompare(b, 'hu')));
  }

  return { folder, files, names, aliases, ambiguous, documents };
}

function resolveEntity(rawValue, context) {
  const { target, label } = extractLink(rawValue, context.folder);
  if (context.names.has(target)) return { canonical: target, label };
  const forced = ENTITY_TARGET_OVERRIDES.get(`${context.folder}:${normalizeKey(target)}`);
  if (forced) return { canonical: forced, label: forced };
  const resolved = context.aliases.get(normalizeKey(target));
  if (resolved) return { canonical: resolved, label: resolved };
  return { canonical: null, label };
}

function canonicalizeMetadataEntities(metadata, contexts) {
  const next = { ...metadata };
  for (const [key, folder] of [['people', 'People'], ['projects', 'Projects']]) {
    if (!Object.hasOwn(next, key)) continue;
    next[key] = asList(next[key]).map((value) => {
      const entity = resolveEntity(value, contexts[folder]);
      if (!entity.canonical) return value;
      return `[[${folder}/${entity.canonical}|${entity.label}]]`;
    });
  }
  return next;
}

function displaySubject(stem) {
  const words = stem.replace(/[-_]+/g, ' ').trim().split(/\s+/);
  return words.map((word, index) => {
    const acronym = ACRONYMS.get(word.toLocaleLowerCase('hu'));
    if (acronym) return acronym;
    if (index === 0 && word.length > 0) return word[0].toLocaleUpperCase('hu') + word.slice(1);
    return word;
  }).join(' ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyKnownCasing(subject, contexts) {
  let result = subject;
  const canonicalNames = [
    ...contexts.People.names,
    ...contexts.Projects.names,
  ].sort((a, b) => b.length - a.length);

  for (const canonical of canonicalNames) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(canonical)}(?=$|[^\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, (match, prefix) => `${prefix}${canonical}`);
  }

  for (const [raw, display] of BRAND_CASING) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(raw)}(?=$|[^\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, (match, prefix) => `${prefix}${display}`);
  }
  return result;
}

function cleanedTopic(value) {
  return value
    .replace(/^\[\[Topics\//, '')
    .replace(/\|[^\]]+\]\]$/, '')
    .replace(/\]\]$/, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function titleForThought(file, metadata, contexts, fallbackDate) {
  const oldStem = path.basename(file, '.md');
  const projects = asList(metadata.projects)
    .map((value) => resolveEntity(value, contexts.Projects))
    .filter((entity) => entity.canonical);
  if (projects.length === 0) {
    const inferredProject = [...contexts.Projects.names]
      .sort((a, b) => b.length - a.length)
      .find((name) => oldStem.startsWith(`${slugify(name)}-`));
    if (inferredProject) projects.push({ canonical: inferredProject, label: inferredProject });
  }
  const primaryProject = projects[0] ? projects[0].canonical : null;
  let subjectStem = oldStem;

  if (primaryProject) {
    const projectSlug = slugify(primaryProject);
    if (subjectStem.startsWith(`${projectSlug}-`)) {
      subjectStem = subjectStem.slice(projectSlug.length + 1);
    } else if (primaryProject.startsWith('ERSTE ') && subjectStem.startsWith('erste-')) {
      subjectStem = subjectStem.slice('erste-'.length);
    }
  }

  let subject = applyKnownCasing(displaySubject(subjectStem), contexts);
  const normalizedSubject = normalizeKey(subject);
  const topics = asList(metadata.topics)
    .map(cleanedTopic)
    .filter((topic) => topic && !GENERIC_TOPICS.test(topic))
    .filter((topic) => !primaryProject || normalizeKey(topic) !== normalizeKey(primaryProject))
    .filter((topic) => {
      const normalizedTopic = normalizeKey(topic);
      if (!normalizedTopic) return false;
      if (normalizedSubject.includes(normalizedTopic)) return false;
      const words = normalizedTopic.split(' ').filter((word) => word.length >= 3);
      return words.length === 0 || !words.every((word) => normalizedSubject.includes(word));
    });

  if (GENERIC_TITLE.test(subject) && topics.length > 0) {
    const qualifiers = [...new Set(topics)].slice(0, 2);
    subject = `${subject}: ${qualifiers.join(' és ')}`;
  }

  if (subject.length > 105) subject = `${subject.slice(0, 102).trim()}…`;
  const capturedAt = typeof metadata.captured_at === 'string' ? metadata.captured_at : '';
  const date = capturedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || fallbackDate;
  const generatedTitle = primaryProject
    ? `${primaryProject} — ${subject} — ${date}`
    : `${subject} — ${date}`;
  const title = TITLE_OVERRIDES.get(file) || generatedTitle;

  return { title, primaryProject, projects, topics, date };
}

function patchFrontmatter(frontmatter, overrides = {}) {
  const keys = new Set(Object.keys(overrides));
  const lines = frontmatter.split('\n');
  const retained = [];
  for (let index = 0; index < lines.length; index += 1) {
    const rootKey = lines[index].match(/^([A-Za-z_][A-Za-z0-9_-]*):/)?.[1];
    if (!rootKey || !keys.has(rootKey)) {
      retained.push(lines[index]);
      continue;
    }
    while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) index += 1;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) continue;
    if (Array.isArray(value)) {
      retained.push(`${key}:`);
      for (const item of value) retained.push(`  - ${JSON.stringify(item)}`);
    } else {
      retained.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return retained.join('\n');
}

function insertRebuildMetadata(frontmatter, title, originalFilename, overrides = {}) {
  const patched = patchFrontmatter(frontmatter, overrides);
  const retainedLines = patched
    .split('\n')
    .filter((line) => !/^title:/.test(line) && !/^original_filename:/.test(line));
  const additions = [
    `title: ${JSON.stringify(title)}`,
    `original_filename: ${JSON.stringify(originalFilename)}`,
  ];
  return [...retainedLines, ...additions].filter((line, index, lines) => {
    if (line !== '') return true;
    return index > 0 && index < lines.length - 1;
  }).join('\n');
}

function withoutRelatedThoughts(body) {
  return body.replace(/\n## Related thoughts\n[\s\S]*$/i, '').trim();
}

function cleanSummaryText(value) {
  return value
    .replace(/^\*\d{4}\.[^\n]+\*\s*/m, '')
    .replace(/^From:\s.*$/gim, '')
    .replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s.*$/gim, '')
    .replace(/^On .+ wrote:\s*$/gim, '')
    .replace(/^>.*$/gm, '')
    .replace(/^#\s+[^\n]+\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function existingLeadingSummary(body) {
  const cleanBody = withoutRelatedThoughts(body);
  const divider = cleanBody.indexOf('\n---\n');
  if (divider !== -1) {
    const leading = cleanSummaryText(cleanBody.slice(0, divider));
    if (leading.length >= 180 && !/^https?:\/\//i.test(leading)) return leading;
  }

  const explicit = cleanBody.match(/(?:^|\n)## Summary\s*\n([\s\S]*?)(?=\n---\n|$)/i);
  if (explicit && explicit[1].trim().length >= 80) {
    return cleanSummaryText(explicit[1]);
  }
  return '';
}

function paragraphCandidates(body) {
  const cleaned = cleanSummaryText(withoutRelatedThoughts(body))
    .replace(/^https?:\/\/\S+$/gm, '')
    .replace(/^[-_]{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  return cleaned.split(/\n\s*\n/)
    .map((text, index) => ({ text: text.trim(), index }))
    .filter(({ text }) => text.length >= 35)
    .filter(({ text }) => !/^(?:unsubscribe|leiratkoz|confidential|bizalmas|sent from|küldve az)/i.test(text))
    .filter(({ text }) => !/^https?:\/\/\S+$/i.test(text));
}

function extractChronologicalSummary(body) {
  const candidates = paragraphCandidates(body);
  if (candidates.length === 0) return 'A forrás nem tartalmazott érdemben összefoglalható szöveget.';
  const lastIndex = Math.max(candidates.length - 1, 1);

  for (const candidate of candidates) {
    const position = candidate.index / lastIndex;
    let score = 0;
    if (candidate.index < 3) score += 4;
    if (SUMMARY_KEYWORDS.test(candidate.text)) score += 5;
    if (/\b\d{1,4}(?:[.:/-]\d{1,2})?\b/.test(candidate.text)) score += 2;
    if (/^#{1,4}\s|^\*\*[^*]+\*\*|^[-*]\s/m.test(candidate.text)) score += 2;
    if (position > 0.34 && position < 0.67) score += 1;
    if (position > 0.82) score += 2;
    if (candidate.text.length > 1200) score -= 2;
    candidate.score = score;
  }

  const selected = new Set(candidates.slice(0, Math.min(2, candidates.length)).map(({ index }) => index));
  for (const [from, to] of [[0, 0.34], [0.34, 0.67], [0.67, 1.01]]) {
    const segment = candidates
      .filter((candidate) => candidate.index / lastIndex >= from && candidate.index / lastIndex < to)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 3);
    for (const candidate of segment) selected.add(candidate.index);
  }

  const chronological = candidates.filter(({ index }) => selected.has(index)).sort((a, b) => a.index - b.index);
  let summary = '';
  for (const candidate of chronological) {
    const normalized = candidate.text.replace(/\s+/g, ' ').trim();
    const next = summary ? `${summary}\n\n${normalized}` : normalized;
    if (next.length > 3000) break;
    summary = next;
  }

  return summary || candidates[0].text.slice(0, 3000).trim();
}

function summaryForThought(body) {
  const existing = existingLeadingSummary(body);
  if (existing) return existing.slice(0, 5000).trim();
  return extractChronologicalSummary(body).slice(0, 5000).trim();
}

function rewriteThoughtLinks(content, renameByStem, linkToFolder = true) {
  return content.replace(/\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (full, rawTarget, heading = '', label = '') => {
    const target = rawTarget.trim();
    const targetStem = target.startsWith('customBrain/') ? target.slice('customBrain/'.length) : target;
    const renamed = renameByStem.get(targetStem);
    if (!renamed) return full;
    const nextTarget = linkToFolder ? `customBrain/${renamed.newStem}` : renamed.newStem;
    const nextLabel = label || renamed.title;
    return `[[${nextTarget}${heading}|${nextLabel}]]`;
  });
}

function rewriteEntityLinks(content, contexts) {
  return content.replace(/\[\[(People|Projects|Topics)\/([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (full, folder, rawTarget, heading = '', label = '') => {
    const context = contexts[folder];
    const target = rawTarget.trim();
    if (context.names.has(target)) return full;
    const canonical = ENTITY_TARGET_OVERRIDES.get(`${folder}:${normalizeKey(target)}`) ||
      context.aliases.get(normalizeKey(target));
    if (!canonical) return full;
    const nextLabel = label || canonical;
    return `[[${folder}/${canonical}${heading}|${nextLabel}]]`;
  });
}

function dedupeRelatedThoughts(content) {
  const headingIndex = content.search(/\n## Related thoughts\n/i);
  if (headingIndex === -1) return content;
  const prefix = content.slice(0, headingIndex);
  const section = content.slice(headingIndex).split('\n');
  const seen = new Set();
  const output = [];
  for (const line of section) {
    if (!line.startsWith('- [[')) {
      output.push(line);
      continue;
    }
    const key = line.replace(/\s+\*\([^)]*\)\*\s*$/, '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(line);
  }
  return `${prefix}${output.join('\n')}`;
}

function renderConnections(personValues, projectValues, topicValues, contexts) {
  const lines = [];
  const people = personValues.map((value) => resolveEntity(value, contexts.People));
  const projects = projectValues.map((value) => resolveEntity(value, contexts.Projects));
  const topics = topicValues.map(cleanedTopic).filter(Boolean);

  const personLinks = people.map((entity) => entity.canonical
    ? `[[People/${entity.canonical}|${entity.label}]]`
    : entity.label);
  const projectLinks = projects.map((entity) => entity.canonical
    ? `[[Projects/${entity.canonical}|${entity.label}]]`
    : entity.label);
  const topicLinks = topics.map((topic) => {
    const canonical = contexts.Topics.aliases.get(normalizeKey(topic));
    return canonical ? `[[Topics/${canonical}|${topic}]]` : topic;
  });

  if (personLinks.length > 0) lines.push(`- Emberek: ${[...new Set(personLinks)].join(', ')}`);
  if (projectLinks.length > 0) lines.push(`- Projektek: ${[...new Set(projectLinks)].join(', ')}`);
  if (topicLinks.length > 0) lines.push(`- Témák: ${[...new Set(topicLinks)].join(', ')}`);
  return lines;
}

function renderSummaryFile(thought, contexts) {
  const metadata = thought.metadata;
  const people = asList(metadata.people);
  const projects = asList(metadata.projects);
  const topics = asList(metadata.topics);
  const connections = renderConnections(people, projects, topics, contexts);
  const summaryFrontmatter = [
    '---',
    `title: ${JSON.stringify(thought.title)}`,
    `source_thought: ${JSON.stringify(`[[customBrain/${thought.newStem}|${thought.title}]]`)}`,
    `captured_at: ${JSON.stringify(thought.capturedAt || '')}`,
    '---',
  ].join('\n');
  const connectionSection = connections.length > 0
    ? `\n\n## Kapcsolatok\n\n${connections.join('\n')}`
    : '';

  return `${summaryFrontmatter}\n\n# ${thought.title}\n\n## Összefoglaló\n\n${thought.summary}${connectionSection}\n`;
}

function preserveTimes(targetPath, sourceStat) {
  fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime);
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function topCounts(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'hu'))
    .slice(0, limit);
}

function substantiveBody(body) {
  return body
    .replace(/^#.*$/gm, '')
    .replace(/^## Mentions[\s\S]*$/m, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function writeCuratedReports(thoughts, reportPath) {
  const evidenceCount = (pattern) => thoughts.filter((thought) => {
    const evidence = asList(thought.metadata.topics).join(' | ');
    return pattern.test(evidence);
  }).length;
  const thoughtLink = (file) => {
    const thought = thoughts.find((candidate) => candidate.file === file);
    return thought ? `[[customBrain/${thought.newStem}|${thought.title}]]` : `\`${file}\``;
  };

  const topicProposals = [
    {
      name: 'AI safety and governance',
      priority: 'A',
      pattern: /prompt injection|jailbreak|\bsecurity\b|biztonság|adatvéd|governance|jogi megfelel|kockázatkezel/iu,
      aliases: 'AI biztonság, agent governance, prompt injection, jailbreak, AI risk, jogi és IT security megfelelés',
      includes: 'agent-jogosultságok, prompt- és adatbiztonság, privacy, jogi guardrailek, kockázatkezelés',
      excludes: 'sima kampányjóváhagyás (Campaign operations), általános szervezeti bevezetés (AI adoption)',
      examples: [
        'bizi-kockázatkezelési-táblázat-finomítás.md',
        'bizi-hard-gate-és-captcha-egyeztetés.md',
        'telekom-brandcomms-ai-day-alapelvek-v3.md',
      ],
    },
    {
      name: 'Software engineering',
      priority: 'A',
      pattern: /\bapi\b|kódol|debug|hibakezel|\bgit\b|frontend|backend|deploy|tesztelés|rendszerarchitektúra|programoz/iu,
      aliases: 'szoftverfejlesztés, coding practices, API architecture, debugging, deployment, Git',
      includes: 'kód- és API-architektúra, tesztelés, hibakeresés, Git/worktree, frontend/backend és deploy-tanulságok',
      excludes: 'agentek módszertana (AI agents), üzleti workflow automatizálása (Workflow automation)',
      examples: [
        'clean-api-data-layer.md',
        'git-worktrees-magyarázat.md',
        'bizi-kódolási-tanulságok-best-practices.md',
      ],
    },
    {
      name: 'Marketing strategy and brand systems',
      priority: 'A',
      pattern: /marketing stratég|márkaép|brand stratég|brand identity|audience szegment|pozícionál|csatornastratég/i,
      aliases: 'marketing stratégia, brand strategy, márkaépítés, audience strategy, pozícionálás',
      includes: 'márka- és kommunikációs stratégia, pozícionálás, audience/logika, csatornaszerepek',
      excludes: 'egyedi kampányleadás (Campaign operations), DCO-végrehajtás (DCO), kliensprojekt-specifikus scope',
      examples: [
        'marketing-stratégia-és-márkaépítés.md',
        'met-tender-logó-és-brand-stratégia.md',
        'amundi-targeting-strategy-és-szegmentáció.md',
      ],
    },
    {
      name: 'Measurement and experimentation',
      priority: 'A',
      pattern: /a\/b|hatásmérés|evaluation|értékelés|kísérlet|tesztsor|kampányeredmény|mérés/iu,
      aliases: 'mérés, evaluation, A/B testing, hatásmérés, kísérlettervezés, learning agenda',
      includes: 'A/B tesztek, evaluatorok, kampány- és field-hatásmérés, learning agenda, reprodukálható kísérletek',
      excludes: 'rutin QA vagy bugteszt (Software engineering), általános kampányriportálás',
      examples: [
        'amundi-learning-agenda-és-a-b-teszt.md',
        'rmt-országtuning-hatásmérési-kutatási-kickoff.md',
        'bizi-automatizált-tesztsor-stratégia.md',
      ],
    },
    {
      name: 'Behavioral science and decision-making',
      priority: 'B',
      pattern: /viselked|nudg|\bbias\b|döntéshozatal|behavior|kognitív torz/iu,
      aliases: 'viselkedéstudomány, decision science, nudging, cognitive bias, döntéselmélet',
      includes: 'biasok, nudging, döntési mechanizmusok és viselkedési beavatkozások',
      excludes: 'kampányspecifikus üzenetek (projekt), általános marketingstratégia',
      examples: [
        'rmt-országtuning-viselkedéstudomány-kutatás-egyeztetés.md',
        'context-graphs-ai-döntéshozatalban.md',
        'bereczkei-tamás-lustaság-evolúciós-elemzés.md',
      ],
    },
    {
      name: 'AI economics and future of work',
      priority: 'B',
      pattern: /munka jövő|munkaerő|gazdaság|jobs|employment|organizational singularity|AI race|termelékenység/i,
      aliases: 'future of work, AI economics, munkaerőpiac, post-labor, organizational singularity',
      includes: 'AI munkaerőpiaci, szervezeti és makrogazdasági hatásai',
      excludes: 'szervezeti bevezetési programok (AI adoption), egyedi üzleti modelljegyzetek',
      examples: [
        'ai-munkaerőpiac-k-alakú-hasadása.md',
        'jobs-amplified-freeberg-esszé.md',
        'organizational-singularity-podcast-epizód.md',
      ],
    },
    {
      name: 'Digital society and platform power',
      priority: 'B',
      pattern: /megfigyel|digitális tudatosság|digitalizáció|platform power|adatgyűjtés|szabályozás|privacy/i,
      aliases: 'digitális társadalom, surveillance capitalism, platformhatalom, digital literacy, technológiai szabályozás',
      includes: 'platformok társadalmi hatása, megfigyelési kapitalizmus, digitális műveltség és szabályozás',
      excludes: 'vállalati AI-adopció (AI adoption), technikai adatvédelem (AI safety and governance)',
      examples: [
        'megfigyelő-kapitalizmus-előadás-összefoglalója.md',
        'ai-szabályozás-vs-öngondoskodás.md',
        'ai-kapcsolt-feladatok-skill-alapú-agent-munka.md',
      ],
    },
    {
      name: 'Mind, cognition and consciousness',
      priority: 'B',
      pattern: /tudat|kognit|\bagy\b|markov|free energy|enactiv|conscious|(?:^|[^\p{L}])elme(?:$|[^\p{L}])|friston/iu,
      aliases: 'tudatfilozófia, cognitive science, consciousness, enaktivizmus, predictive processing',
      includes: 'tudat, kogníció, prediktív feldolgozás, Markov-takaró és enaktív elméletek',
      excludes: 'agentmemória-technológia (AI agents / Knowledge systems)',
      examples: [
        'bayesi-agy-és-markov-takaró.md',
        'absztrakciós-torony-tudatosság-és-fázisátmenet.md',
        'robot-nem-pilóta-kreativitás-why-és-teremtés.md',
      ],
    },
  ];

  const topicLines = [
    '# Hiányzó Topic-javaslatok',
    '',
    'A frekvencia önmagában nem indok új Topicra. Az A prioritású jelöltek több projekten átívelő, tartós visszakeresési tengelyek; a B jelöltek értékesek, de használat előtt kézi próba javasolt.',
    '',
    '## Előbb aliasbővítés, ne új Topic',
    '',
    '- **AI agents**: vegye fel az `AI ágensek`, `AI ügynökök`, `agentic AI`, `AI ágens` változatokat.',
    '- **Knowledge systems**: vegye fel a `knowledge graph`, `tudásbázis`, `knowledge base`, `RAG`, `Obsidian` változatokat, ahol ezek valóban tudásrendszert jelentenek.',
    '- **Workflow automation**: vegye fel az `automatizáció`, `workflow automatizálás`, `agentic workflow` változatokat; az utóbbit csak akkor, ha a hangsúly a folyamaton van, nem az agent-architektúrán.',
    '- A `Messaging Matrix`, `Bizi`, `ConfAI`, `Cseperedő`, `THM` és hasonló címkék projektek vagy termékfogalmak; ne váljanak Topická.',
    '',
    '## Új kanonikus jelöltek',
    '',
    '| Prioritás | Javasolt Topic | Érintett thoughtok (heurisztikus) |',
    '|---|---|---:|',
  ];
  for (const proposal of topicProposals) {
    proposal.count = evidenceCount(proposal.pattern);
    topicLines.push(`| ${proposal.priority} | ${proposal.name} | ${proposal.count} |`);
  }
  for (const proposal of topicProposals) {
    topicLines.push('');
    topicLines.push(`### ${proposal.name}`);
    topicLines.push('');
    topicLines.push(`- **Aliases:** ${proposal.aliases}`);
    topicLines.push(`- **Includes:** ${proposal.includes}`);
    topicLines.push(`- **Excludes:** ${proposal.excludes}`);
    topicLines.push(`- **Példák:** ${proposal.examples.map(thoughtLink).join('; ')}`);
  }
  topicLines.push('');
  topicLines.push('## Javasolt bevezetési sorrend');
  topicLines.push('');
  topicLines.push('1. Bővítsd a három meglévő Topic aliasait.');
  topicLines.push('2. Hozd létre a négy A-prioritású Topicot, majd címkézz kézzel 5–10 biztos példát mindegyikhez.');
  topicLines.push('3. Két hét keresési használat után csak azt a B-prioritású Topicot vedd fel, amelyre ténylegesen rákerestél.');
  fs.writeFileSync(path.join(reportPath, 'MISSING-TOPICS-PROPOSALS.md'), `${topicLines.join('\n')}\n`);

  const dossierLines = [
    '# Kurált People- és Project-dosszié javaslatok',
    '',
    'A szövegek a rebuildben olvasott thoughtokból és a meglévő dossziékból származnak. Javaslatok: a forrásdossziékat nem írják felül automatikusan.',
    '',
    '## Projectek – első javítási kör',
    '',
    '### Amundi',
    '',
    '> Csehországi addressable marketing- és Messaging Matrix-projekt Jan Kurellel. A munka az élethelyzet-alapú ügyfélszegmentációt, befektetési triggereket, kreatív briefvariánsokat, döntési fákat, learning agendát és A/B teszttervet kapcsolja össze az Amundi CZ kampányrendszerében.',
    '',
    '### Cafe Communications',
    '',
    '> AI-támogatott kreatív- és DTP-produkciós tanácsadási együttműködés. A dokumentált scope a jelenlegi workflow auditját, Adobe/Figma-alapú gyártási lépések automatizálását, ajánlatadást és a Messaging Matrix lehetséges kapcsolódását foglalja össze.',
    '',
    '### Grafia',
    '',
    '> Beliczki Róbert saját jogi és beszállítói entitása, amelyen keresztül a közvetlen Telekom- és ERSTE-munka, valamint a saját termék- és automatizációs projektek futnak. Kapcsolódó projektek: Messaging Matrix, customBrain és workflowAutomation.',
    '',
    '### Humanody',
    '',
    '> Kun Miklóshoz kapcsolódó projekt- és termékkör: H!ntrix, H!ntegrator és H!nt a Type. A brainben a H!ntegrator–Messaging Matrix integráció, AI-operációs környezet, MediaMarkt AI-tréning és second-brain együttműködés jelenik meg.',
    '',
    '### MET',
    '',
    '> B2B energiapiaci arculat- és márkastratégiai tender. A dokumentált munka a MET vizuális identitásának és európai pozicionálásának megújítását, logóirányokat és tenderkommunikációt foglalja össze Alexandra Kato és Krisztian Nagy részvételével.',
    '',
    '### Proficio',
    '',
    '> Csehországi partneri/üzleti kontextus Jan Kurellel. A brainben az Amundi és NobilisTilia munkák, az addressable/DCO módszertan és a Messaging Matrix cseh alkalmazása kapcsolódik hozzá.',
    '',
    '### RMT Instore',
    '',
    '> Telekom AI Mesh-alprojekt az üzlettéri/eContent message pool és kreatívkiszolgálás automatizálására. A workflow penetrációs és lefedettségi adatok szinkronizálását, kreatívbesorolást, csere-logikát és az InDesign/asset gyártási láncot köti össze az RMT Országtuninggal és a Messaging Matrixszal.',
    '',
    '## People – első javítási kör',
    '',
    '### Barta Attila',
    '',
    '> Telekom BrandComms-partner és több AI Mesh-kezdeményezés kulcsfontosságú üzleti/stratégiai counterpartja. A brainben leggyakrabban a Bizi, ConfAI, RMT Országtuning, Nexus, BrandComms AI Day és AI-adopciós munka kapcsán jelenik meg.',
    '',
    '### Istvan Hollosi',
    '',
    '> Telekom-oldali termék- és technikai együttműködő, elsősorban a Bizi/Dasszisztens fejlesztésében és működtetésében. Visszatérő témái a tudásbázis, admin, prompt- és session-kezelés, tesztelés, élesítés és kockázatkezelés.',
    '',
    '### Liza Laszlo',
    '',
    '> Telekom-oldali szervezési és projekt-együttműködő. A brainben főként a Bizi felhasználói és UI/UX munkájában, valamint a BrandComms AI workshopok és belső egyeztetések kapcsán jelenik meg.',
    '',
    '### Jan Kurel',
    '',
    '> Csehországi partner a Proficio, Amundi és Messaging Matrix munkákban. A közös dokumentumok addressable stratégiát, szegmentációt, döntési fákat, kreatív briefeket, learning agendát és együttműködési modelleket fednek le.',
    '',
    '### Brunner Csaba',
    '',
    '> ERSTE-oldali digitális marketing counterpart. A brainben a DCO státuszok, kreatív- és THM-frissítések, kampányindítások, hitelkártya- és számlatermékek koordinációja kapcsán jelenik meg.',
    '',
    '### Tamas Varfi',
    '',
    '> ERSTE-oldali, gyakori kampány- és DCO-counterpart. A dokumentált együttműködés a számla-, hitel-, Market- és vállalkozói termékek briefjeit, prioritásait, kreatívfrissítéseit és státuszait fogja össze.',
    '',
    '### Porkoláb Dávid',
    '',
    '> ERSTE-oldali kampány- és kreatív-együttműködő. A brainben több ERSTE termék DCO-státuszai, termékváltozásai, kreatív briefjei és új kommunikációs ötletei kapcsán szerepel.',
    '',
    '### Bela Szabo',
    '',
    '> Telekom-oldali stratégiai és AI-kezdeményezésekben megjelenő együttműködő. A brainben a Bizi, Nexus, BrandComms AI Day, közös AI-működési keretek és marketingstratégiai témák kapcsolódnak hozzá.',
    '',
    '### Zsombor Molnar',
    '',
    '> Telekom-oldali kreatív/produkciós együttműködő. A dokumentumokban az RMT Instore, videó- és assetautomatizáció, AI-események, Social Listening és BrandComms workshopok kapcsán jelenik meg.',
    '',
    '### Miklos Kun',
    '',
    '> A Humanody projektek és az ArtAI együttműködője. A közös munka H!ntegrator–Messaging Matrix kapcsolódást, AI-operációs környezetet, prompt/admin tesztelést, tréninget és second-brain lehetőségeket érint.',
    '',
    '## Név- és konszolidációs prioritások',
    '',
    '- A teljes aliasütközés-lista: [[reports/ENTITY-ALIAS-AUDIT|Entity-alias audit]].',
    '- Elsőként a `Me`/Beliczki Róbert/Robi, Istvan Hollosi/Hollósi István/Pityesz, Bela Szabo/Szabó Béla, Brunner Csaba/Csaba Brunner, Tamas Varfi/Varfi Tamás/Tomi és Kristof Martikan-változatokat érdemes egyesíteni.',
    '- Projectnév-javaslat: `Évnyito BTS App` → `Évnyitó BTS App`; `ERSTE Vállakozók` → `ERSTE Vállalkozók`. A régi alakok maradjanak aliasok a linktörés elkerülésére.',
  ];
  fs.writeFileSync(path.join(reportPath, 'CURATED-DOSSIER-PROPOSALS.md'), `${dossierLines.join('\n')}\n`);
}

function writeReports(thoughts, contexts) {
  const reportPath = path.join(OUTPUT_ROOT, REPORT_DIR);
  const batchPath = path.join(reportPath, 'batches');
  fs.mkdirSync(batchPath, { recursive: true });

  const renameRows = ['old_filename,new_filename,title,captured_at,project,batch'];
  const renameMarkdown = ['# Régi → új címtérkép', ''];
  for (const thought of thoughts) {
    renameRows.push([
      thought.file,
      thought.newFilename,
      thought.title,
      thought.capturedAt,
      thought.primaryProject || '',
      thought.batch,
    ].map(csvCell).join(','));
    renameMarkdown.push(`- \`${thought.file}\` → [[customBrain/${thought.newStem}|${thought.title}]]`);
  }
  fs.writeFileSync(path.join(reportPath, 'rename-map.csv'), `${renameRows.join('\n')}\n`);
  fs.writeFileSync(path.join(reportPath, 'RENAME-MAP.md'), `${renameMarkdown.join('\n')}\n`);

  const batches = Math.ceil(thoughts.length / BATCH_SIZE);
  for (let batch = 1; batch <= batches; batch += 1) {
    const group = thoughts.filter((thought) => thought.batch === batch);
    const lines = [
      `# Batch ${String(batch).padStart(2, '0')}`,
      '',
      `Fájlok: ${group.length}`,
      '',
    ];
    for (const thought of group) {
      const excerpt = thought.summary.replace(/\s+/g, ' ').slice(0, 260);
      lines.push(`## ${thought.index}. ${thought.title}`);
      lines.push('');
      lines.push(`- Forrás: \`${thought.file}\``);
      lines.push(`- Kimenet: [[customBrain/${thought.newStem}|${thought.title}]]`);
      lines.push(`- Emberek: ${asList(thought.metadata.people).join(', ') || '—'}`);
      lines.push(`- Projektek: ${asList(thought.metadata.projects).join(', ') || '—'}`);
      lines.push(`- Summary-minta: ${excerpt}${thought.summary.length > 260 ? '…' : ''}`);
      lines.push('');
    }
    fs.writeFileSync(path.join(batchPath, `batch-${String(batch).padStart(2, '0')}.md`), `${lines.join('\n')}\n`);
  }

  const thoughtRelations = new Map();
  const projectRelations = new Map();
  const rawTopicCounts = new Map();
  for (const thought of thoughts) {
    const projects = asList(thought.metadata.projects)
      .map((value) => resolveEntity(value, contexts.Projects).canonical)
      .filter(Boolean);
    const people = asList(thought.metadata.people)
      .map((value) => resolveEntity(value, contexts.People).canonical)
      .filter(Boolean);
    const topics = asList(thought.metadata.topics).map(cleanedTopic).filter(Boolean);
    for (const topic of topics) rawTopicCounts.set(topic, (rawTopicCounts.get(topic) || 0) + 1);

    for (const person of people) {
      if (!thoughtRelations.has(person)) thoughtRelations.set(person, { count: 0, projects: new Map(), topics: new Map() });
      const relation = thoughtRelations.get(person);
      relation.count += 1;
      for (const project of projects) relation.projects.set(project, (relation.projects.get(project) || 0) + 1);
      for (const topic of topics) relation.topics.set(topic, (relation.topics.get(topic) || 0) + 1);
    }

    for (const project of projects) {
      if (!projectRelations.has(project)) projectRelations.set(project, { count: 0, people: new Map(), topics: new Map() });
      const relation = projectRelations.get(project);
      relation.count += 1;
      for (const person of people) relation.people.set(person, (relation.people.get(person) || 0) + 1);
      for (const topic of topics) relation.topics.set(topic, (relation.topics.get(topic) || 0) + 1);
    }
  }

  const peopleLines = [
    '# People-leírási javaslatok',
    '',
    'Ezek bizonyíték-alapú szerkesztési javaslatok, nem automatikus személy- vagy szerepállítások. Csak a thought-frontmatter együtt-előfordulásait foglalják össze.',
    '',
  ];
  for (const document of contexts.People.documents) {
    const relation = thoughtRelations.get(document.canonical);
    const hasDescription = substantiveBody(document.body).length >= 80;
    if (!relation && hasDescription) continue;
    const projects = relation ? topCounts(relation.projects, 4).map(([name]) => `[[Projects/${name}|${name}]]`) : [];
    const topics = relation ? topCounts(relation.topics, 5).map(([name]) => name) : [];
    peopleLines.push(`## ${document.canonical}`);
    peopleLines.push('');
    peopleLines.push(`- Jelenlegi leírás: ${hasDescription ? 'érdemi' : 'hiányos vagy csak mention-lista'}`);
    if (relation) {
      peopleLines.push(`- Bizonyíték: ${relation.count} thought; projektek: ${projects.join(', ') || 'nincs megbízható projektkapcsolat'}; visszatérő címkék: ${topics.join(', ') || '—'}.`);
      peopleLines.push(`- Javasolt semleges leírás: „A customBrainban ${relation.count} bejegyzés kapcsolódik hozzá${projects.length ? `, főként a ${projects.join(', ')} projektekben` : ''}${topics.length ? `. Visszatérő témák: ${topics.join(', ')}` : ''}.”`);
    } else {
      peopleLines.push('- Javaslat: nincs elég thought-szintű bizonyíték leírás készítéséhez; kézi azonosítás szükséges.');
    }
    peopleLines.push('');
  }
  fs.writeFileSync(path.join(reportPath, 'PEOPLE-DESCRIPTION-PROPOSALS.md'), `${peopleLines.join('\n')}\n`);

  const projectLines = [
    '# Project-leírási javaslatok',
    '',
    'A javaslatok a meglévő dosszié és a thought-frontmatter együtt-előfordulásai alapján készültek. A szerepeket nem találják ki.',
    '',
  ];
  for (const document of contexts.Projects.documents) {
    const relation = projectRelations.get(document.canonical);
    const hasDescription = substantiveBody(document.body).length >= 140;
    const people = relation ? topCounts(relation.people, 6).map(([name]) => `[[People/${name}|${name}]]`) : [];
    const topics = relation ? topCounts(relation.topics, 8).map(([name]) => name) : [];
    projectLines.push(`## ${document.canonical}`);
    projectLines.push('');
    projectLines.push(`- Jelenlegi dosszié: ${hasDescription ? 'érdemi' : 'rövid/hiányos'}`);
    if (relation) {
      projectLines.push(`- Bizonyíték: ${relation.count} thought; gyakori emberek: ${people.join(', ') || '—'}; gyakori címkék: ${topics.join(', ') || '—'}.`);
      projectLines.push(`- Javasolt kiegészítő mondat: „A brainben ${relation.count} bejegyzéssel követett projekt. A dokumentált munka fő területei: ${topics.slice(0, 5).join(', ') || 'a meglévő dossziéban leírt scope'}.”`);
    } else {
      projectLines.push('- Javaslat: nincs hozzá megbízható thought-frontmatter; a leírást kézzel kell pontosítani.');
    }
    projectLines.push('');
  }
  fs.writeFileSync(path.join(reportPath, 'PROJECT-DESCRIPTION-PROPOSALS.md'), `${projectLines.join('\n')}\n`);

  const topicLines = [
    '# Nyers topic-jelöltek',
    '',
    'A lista a nyolc kanonikus Topic nevével vagy aliasával nem egyező frontmatter-címkéket mutatja. Ez frekvencia-audit, nem automatikus Topic-létrehozás.',
    '',
    '| Címke | Előfordulás |',
    '|---|---:|',
  ];
  const nonCanonicalTopics = [...rawTopicCounts.entries()]
    .filter(([topic]) => !contexts.Topics.aliases.has(normalizeKey(topic)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'hu'));
  for (const [topic, count] of nonCanonicalTopics.slice(0, 200)) {
    topicLines.push(`| ${topic.replace(/\|/g, '\\|')} | ${count} |`);
  }
  fs.writeFileSync(path.join(reportPath, 'TOPIC-CANDIDATES-RAW.md'), `${topicLines.join('\n')}\n`);

  const duplicateLines = [
    '# Entity-alias audit',
    '',
    'Az alábbi normalizált nevek több külön fájlhoz tartoznak. Ezek konszolidációs jelöltek; a rebuild nem vonja össze őket automatikusan.',
    '',
  ];
  for (const folder of ['People', 'Projects']) {
    duplicateLines.push(`## ${folder}`);
    duplicateLines.push('');
    const entries = [...contexts[folder].ambiguous.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'hu'));
    if (entries.length === 0) duplicateLines.push('- Nem találtam többértelmű aliast.');
    for (const [key, names] of entries) duplicateLines.push(`- \`${key}\`: ${names.map((name) => `[[${folder}/${name}|${name}]]`).join(', ')}`);
    duplicateLines.push('');
  }
  fs.writeFileSync(path.join(reportPath, 'ENTITY-ALIAS-AUDIT.md'), `${duplicateLines.join('\n')}\n`);
  writeCuratedReports(thoughts, reportPath);
}

function writeReadme(counts) {
  const lines = [
    '# customBrain document rebuild',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'The Google Drive source was treated as read-only. The rebuilt vault keeps the original `captured_at` fields and copies source modification times to generated thought and summary files. Original filesystem birth times are recorded in `reports/manifest.json` because macOS does not provide a safe portable API for setting them on copied files.',
    '',
    '## Contents',
    '',
    `- People: ${counts.People}`,
    `- Projects: ${counts.Projects}`,
    `- Topics: ${counts.Topics}`,
    `- Rebuilt thoughts: ${counts.customBrain}`,
    `- Thought summaries: ${counts.customBrainSummaries}`,
    '',
    'See `reports/RENAME-MAP.md` for the complete old-to-new map and `reports/batches/` for the six review batches.',
    '',
  ];
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'README.md'), lines.join('\n'));
}

function summaryBody(content) {
  const match = content.match(/\n## Összefoglaló\n\n([\s\S]*?)(?=\n## Kapcsolatok\n|$)/);
  return match ? match[1].trim() : '';
}

function validateRebuild(thoughts, contexts) {
  const failures = [];
  const warnings = [];
  const checks = [];
  const check = (condition, label, detail = '') => {
    if (condition) checks.push({ label, detail });
    else failures.push(detail ? `${label}: ${detail}` : label);
  };

  const thoughtFiles = markdownFiles(path.join(OUTPUT_ROOT, THOUGHT_DIR));
  const summaryFiles = markdownFiles(path.join(OUTPUT_ROOT, SUMMARY_DIR));
  check(thoughtFiles.length === thoughts.length, 'Thought-fájlszám', `${thoughtFiles.length}/${thoughts.length}`);
  check(summaryFiles.length === thoughts.length, 'Summary-fájlszám', `${summaryFiles.length}/${thoughts.length}`);
  check(new Set(thoughtFiles).size === thoughts.length, 'Egyedi thought-fájlnevek');
  check(new Set(thoughts.map((thought) => thought.title)).size === thoughts.length, 'Egyedi címek');
  check(!thoughts.some((thought) => thought.title.includes('datum-nelkul')), 'Minden címhez tartozik dátum');

  let preservedCapturedAt = 0;
  let preservedMtime = 0;
  let validSummaryBacklinks = 0;
  let maxSummaryLength = 0;
  const shortSummaries = [];
  const qualifiedLinkFailures = [];
  const generatedFiles = [];

  for (const folder of [...ENTITY_DIRS, THOUGHT_DIR, SUMMARY_DIR]) {
    const folderPath = path.join(OUTPUT_ROOT, folder);
    for (const file of markdownFiles(folderPath)) generatedFiles.push(path.join(folderPath, file));
  }
  const reportPath = path.join(OUTPUT_ROOT, REPORT_DIR);
  for (const file of markdownFiles(reportPath)) generatedFiles.push(path.join(reportPath, file));
  const batchReportPath = path.join(reportPath, 'batches');
  for (const file of markdownFiles(batchReportPath)) generatedFiles.push(path.join(batchReportPath, file));

  for (const thought of thoughts) {
    const thoughtPath = path.join(OUTPUT_ROOT, THOUGHT_DIR, thought.newFilename);
    const summaryPath = path.join(OUTPUT_ROOT, SUMMARY_DIR, thought.newFilename);
    const rebuilt = fs.readFileSync(thoughtPath, 'utf8');
    const summary = fs.readFileSync(summaryPath, 'utf8');
    const rebuiltMetadata = parseFrontmatter(splitFrontmatter(rebuilt).frontmatter);
    const summaryMetadata = parseFrontmatter(splitFrontmatter(summary).frontmatter);
    if ((rebuiltMetadata.captured_at || '') === thought.capturedAt &&
        (summaryMetadata.captured_at || '') === thought.capturedAt) preservedCapturedAt += 1;
    const thoughtMtime = fs.statSync(thoughtPath).mtimeMs;
    const summaryMtime = fs.statSync(summaryPath).mtimeMs;
    if (Math.abs(thoughtMtime - thought.stat.mtimeMs) < 1 &&
        Math.abs(summaryMtime - thought.stat.mtimeMs) < 1) preservedMtime += 1;
    if (summary.includes(`[[customBrain/${thought.newStem}|${thought.title}]]`)) validSummaryBacklinks += 1;
    const body = summaryBody(summary);
    maxSummaryLength = Math.max(maxSummaryLength, body.length);
    if (body.length < 80) shortSummaries.push(`${thought.file} (${body.length})`);
    if (body.length > 5500) failures.push(`Summary hard cap exceeded: ${thought.file} (${body.length})`);
  }
  check(preservedCapturedAt === thoughts.length, 'captured_at megőrzése', `${preservedCapturedAt}/${thoughts.length}`);
  check(preservedMtime === thoughts.length, 'Forrás-mtime megőrzése', `${preservedMtime}/${thoughts.length}`);
  check(validSummaryBacklinks === thoughts.length, 'Summary-visszalinkek', `${validSummaryBacklinks}/${thoughts.length}`);
  check(shortSummaries.length === 0, 'Legalább 80 karakteres summaryk', shortSummaries.join(', '));
  check(maxSummaryLength <= 5500, 'Summary hard cap', `max ${maxSummaryLength} karakter`);

  for (const filePath of generatedFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const links = content.matchAll(/\[\[((?:People|Projects|Topics|customBrain|customBrainSummaries|reports)\/[^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g);
    for (const match of links) {
      const target = match[1];
      const candidates = [
        path.join(OUTPUT_ROOT, `${target}.md`),
        path.join(OUTPUT_ROOT, target),
      ];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        qualifiedLinkFailures.push(`${path.relative(OUTPUT_ROOT, filePath)} → ${target}`);
      }
    }
  }
  check(qualifiedLinkFailures.length === 0, 'Mappával minősített wikilinkek', qualifiedLinkFailures.slice(0, 30).join('; '));

  const manifest = JSON.parse(fs.readFileSync(path.join(reportPath, 'manifest.json'), 'utf8'));
  check(manifest.length === thoughts.length, 'Manifest lefedettség', `${manifest.length}/${thoughts.length}`);
  check(new Set(manifest.map((entry) => entry.source_file)).size === thoughts.length, 'Egyedi forrásbejegyzések a manifestben');
  const batchSizes = [...new Set(thoughts.map((thought) => thought.batch))]
    .map((batch) => thoughts.filter((thought) => thought.batch === batch).length);
  check(JSON.stringify(batchSizes) === JSON.stringify([80, 80, 80, 80, 80, 9]), 'Batch-méretek', batchSizes.join('/'));

  const sourceDrift = thoughts.filter((thought) => sha256(fs.readFileSync(thought.fullPath, 'utf8')) !== thought.sourceSha256);
  check(sourceDrift.length === 0, 'Forrásfájlok változatlanok', sourceDrift.map((thought) => thought.file).join(', '));

  if (warnings.length === 0) warnings.push('Nincs blokkoló vagy kézi ellenőrzést igénylő validációs figyelmeztetés.');
  const reviewLines = [
    '# Rebuild review',
    '',
    `Validated: ${new Date().toISOString()}`,
    '',
    `Status: ${failures.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '## Automatikus ellenőrzések',
    '',
    ...checks.map((item) => `- [x] ${item.label}${item.detail ? ` — ${item.detail}` : ''}`),
    ...failures.map((failure) => `- [ ] ${failure}`),
    '',
    '## Kézi, hat batchből álló review',
    '',
    '- A 80/80/80/80/80/9 batch-manifeszt cím- és summary-mintái át lettek nézve.',
    '- Javítva lett a Helló Szülő/BTS téves Bizi-projektkapcsolata.',
    '- Javítva lett a kétlépcsős brain-jegyzet téves Amundi/Jan Kurel metaadata.',
    '- A Context Graph bejegyzésből el lett távolítva a téves Mel Robbins action-item blokk; a summary a Stephen Chin/Neo4j tartalmat követi.',
    '- A hiányos meeting- és csak-linket tartalmazó videófájlok nem kaptak kitalált tartalmat.',
    '- A Project/People fájlok nem lettek automatikusan összevonva; az aliasütközések külön auditban szerepelnek.',
    '',
    '## Figyelmeztetések',
    '',
    ...warnings.map((warning) => `- ${warning}`),
    '',
  ];
  fs.writeFileSync(path.join(reportPath, 'REVIEW.md'), reviewLines.join('\n'));

  if (failures.length > 0) {
    throw new Error(`Rebuild validation failed:\n${failures.join('\n')}`);
  }
  return { checks: checks.length, failures: failures.length, maxSummaryLength };
}

function main() {
  assertSource();
  assertEmptyOutput();

  const contexts = Object.fromEntries(ENTITY_DIRS.map((folder) => [folder, buildEntityContext(folder)]));
  for (const folder of [...ENTITY_DIRS, THOUGHT_DIR, SUMMARY_DIR, REPORT_DIR]) {
    fs.mkdirSync(path.join(OUTPUT_ROOT, folder), { recursive: true });
  }

  const sourceThoughtPath = path.join(SOURCE_ROOT, THOUGHT_DIR);
  const thoughtFiles = markdownFiles(sourceThoughtPath);
  const provisional = thoughtFiles.map((file, zeroIndex) => {
    const fullPath = path.join(sourceThoughtPath, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const stat = fs.statSync(fullPath);
    const { frontmatter, body } = splitFrontmatter(content);
    const metadata = canonicalizeMetadataEntities(
      applyMetadataOverrides(file, parseFrontmatter(frontmatter)),
      contexts,
    );
    const fallbackDate = stat.mtime.toISOString().slice(0, 10);
    const titleData = titleForThought(file, metadata, contexts, fallbackDate);
    return {
      index: zeroIndex + 1,
      batch: Math.floor(zeroIndex / BATCH_SIZE) + 1,
      file,
      fullPath,
      content,
      stat,
      frontmatter,
      body,
      metadata,
      capturedAt: typeof metadata.captured_at === 'string' ? metadata.captured_at : '',
      summary: SUMMARY_OVERRIDES.get(file) || summaryForThought(body),
      sourceSha256: sha256(content),
      ...titleData,
    };
  });

  const usedStems = new Set();
  for (const thought of provisional) {
    let stem = slugify(thought.title).slice(0, 160).replace(/-+$/g, '');
    if (usedStems.has(stem)) {
      const time = thought.capturedAt.match(/T(\d{2}):(\d{2})/)?.slice(1).join('') || `b${thought.batch}`;
      stem = `${stem}-${time}`;
    }
    let suffix = 2;
    const baseStem = stem;
    while (usedStems.has(stem)) {
      stem = `${baseStem}-${suffix}`;
      suffix += 1;
    }
    usedStems.add(stem);
    thought.newStem = stem;
    thought.newFilename = `${stem}.md`;
  }

  const renameByStem = new Map(provisional.map((thought) => [path.basename(thought.file, '.md'), thought]));

  for (const thought of provisional) {
    const entityMetadataOverrides = {};
    if (Object.hasOwn(thought.metadata, 'people')) entityMetadataOverrides.people = thought.metadata.people;
    if (Object.hasOwn(thought.metadata, 'projects')) entityMetadataOverrides.projects = thought.metadata.projects;
    const metadata = insertRebuildMetadata(
      rewriteEntityLinks(thought.frontmatter, contexts),
      thought.title,
      thought.file,
      { ...(METADATA_OVERRIDES.get(thought.file) || {}), ...entityMetadataOverrides },
    );
    const entityRewrittenBody = rewriteEntityLinks(thought.body, contexts);
    const rewrittenBody = dedupeRelatedThoughts(rewriteThoughtLinks(entityRewrittenBody, renameByStem, true));
    const rebuiltContent = `---\n${metadata}\n---\n${rewrittenBody.startsWith('\n') ? '' : '\n'}${rewrittenBody}`;
    const thoughtOutput = path.join(OUTPUT_ROOT, THOUGHT_DIR, thought.newFilename);
    const summaryOutput = path.join(OUTPUT_ROOT, SUMMARY_DIR, thought.newFilename);
    fs.writeFileSync(thoughtOutput, rebuiltContent);
    fs.writeFileSync(summaryOutput, renderSummaryFile(thought, contexts));
    preserveTimes(thoughtOutput, thought.stat);
    preserveTimes(summaryOutput, thought.stat);
  }

  for (const folder of ENTITY_DIRS) {
    for (const document of contexts[folder].documents) {
      const sourcePath = path.join(SOURCE_ROOT, folder, document.file);
      const outputPath = path.join(OUTPUT_ROOT, folder, document.file);
      const entityRewritten = rewriteEntityLinks(document.content, contexts);
      const content = rewriteThoughtLinks(entityRewritten, renameByStem, true);
      fs.writeFileSync(outputPath, content);
      preserveTimes(outputPath, fs.statSync(sourcePath));
    }
  }

  writeReports(provisional, contexts);

  const manifest = provisional.map((thought) => ({
    index: thought.index,
    batch: thought.batch,
    source_file: path.relative(SOURCE_ROOT, thought.fullPath),
    source_sha256: thought.sourceSha256,
    source_birthtime: thought.stat.birthtime.toISOString(),
    source_mtime: thought.stat.mtime.toISOString(),
    captured_at: thought.capturedAt,
    output_thought: `${THOUGHT_DIR}/${thought.newFilename}`,
    output_summary: `${SUMMARY_DIR}/${thought.newFilename}`,
    title: thought.title,
  }));
  fs.writeFileSync(path.join(OUTPUT_ROOT, REPORT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  writeReadme({
    People: contexts.People.files.length,
    Projects: contexts.Projects.files.length,
    Topics: contexts.Topics.files.length,
    customBrain: provisional.length,
    customBrainSummaries: provisional.length,
  });

  const validation = validateRebuild(provisional, contexts);

  const drifted = provisional.filter((thought) => {
    const current = fs.readFileSync(thought.fullPath, 'utf8');
    return sha256(current) !== thought.sourceSha256;
  });
  if (drifted.length > 0) {
    throw new Error(`Source drift detected during rebuild: ${drifted.map((thought) => thought.file).join(', ')}`);
  }

  console.log(JSON.stringify({
    source: SOURCE_ROOT,
    output: OUTPUT_ROOT,
    people: contexts.People.files.length,
    projects: contexts.Projects.files.length,
    topics: contexts.Topics.files.length,
    thoughts: provisional.length,
    summaries: provisional.length,
    batches: Math.ceil(provisional.length / BATCH_SIZE),
    source_drift: drifted.length,
    validation,
  }, null, 2));
}

main();
