import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * One-off cleanup: consolidate `people` to Western-order canonicals and fold
 * the FÉLRETESZEK / BEFCAST sub-products under their parent project (ERSTE).
 *
 * Sub-product collapse adds the old project name to `topics` so the signal
 * isn't lost — that mirrors the prompt rule "tag the parent canonical project
 * and put the sub-activity details in topics".
 *
 * Dry-run default. Pass --apply to commit.
 */
const APPLY = process.argv.includes('--apply');

const PEOPLE_GROUPS = [
  // SELF
  { canonical: 'Me', aliases: ['Beliczki Róbert', 'Beliczki Robert', 'Róbert', 'Robi', 'Robert Beliczki', 'Róbert Beliczki'] },

  // HUNGARIAN-ORDER → WESTERN (also fold accent variants)
  { canonical: 'Istvan Hollosi', aliases: ['Hollosi Istvan', 'Hollósi István'] },
  { canonical: 'Anna Bodiss', aliases: ['Bodiss Anna', 'Anna'] },
  { canonical: 'Flora Balogh', aliases: ['Balogh Flora', 'Balogh Flóra'] },
  { canonical: 'Krisztina Benyei', aliases: ['Benyei Krisztina', 'Bényei Krisztina'] },
  { canonical: 'Tunde Bittermann', aliases: ['Bittermann Tunde', 'Bittermann Tünde'] },
  { canonical: 'Viktoria Boda', aliases: ['Boda Viktoria', 'Boda Viktória', 'Viktória Boda'] },
  { canonical: 'Akos Csermely', aliases: ['Csermely Akos', 'Csermely Ákos'] },
  { canonical: 'Eniko Czabanyi', aliases: ['Czabanyi Eniko', 'Czabányi Enikő'] },
  { canonical: 'Zsuzsanna Deak', aliases: ['Deak Zsuzsanna', 'Deák Zsuzsanna', 'Deák Zsuzsa'] },
  { canonical: 'Eszter Dorman', aliases: ['Dorman Eszter', 'Eszter Dormán'] },
  { canonical: 'Zoltan Farkas', aliases: ['Farkas Zoltan', 'Farkas Zoltán'] },
  { canonical: 'Katalin Fuzesi', aliases: ['Fuzesi Katalin', 'Füzesi Katalin'] },
  { canonical: 'Adam Gajdos', aliases: ['Gajdos Adam', 'Gajdos Ádám'] },
  { canonical: 'Zsofia Gerendas', aliases: ['Gerendas Zsofia', 'Gerendás Zsofia'] },
  { canonical: 'Bela Gerlei', aliases: ['Gerlei Bela', 'Gerlei Béla'] },
  { canonical: 'Anita Granicz', aliases: ['Granicz Anita', 'Bottlik-Gránicz Anita', 'Gránicz Anita'] },
  { canonical: 'Hajde Pezo', aliases: ['Hajdé Pezó'] },
  { canonical: 'Laszlo Harmati', aliases: ['Harmati Laszlo', 'Harmati László'] },
  { canonical: 'Hegyi Domokos Mark', aliases: ['Hegyi Domokos Márk'] },
  { canonical: 'Aron Igmandy', aliases: ['Igmandy Aron', 'Igmándy Áron', 'Áron Igmándy'] },
  { canonical: 'Tamas Jobbagy', aliases: ['Jobbagy Tamas', 'Jobbágy Tamás'] },
  { canonical: 'David Kiricsi', aliases: ['Kiricsi David', 'Kiricsi Dávid'] },
  { canonical: 'Hajni Kristaly', aliases: ['Kristaly Hajni', 'Kristály Hajnalka', 'Kristály Hajni'] },
  { canonical: 'Peter Laczo', aliases: ['Laczo Peter', 'Laczó Péter', 'Péter'] },
  { canonical: 'Maria Meszegeto', aliases: ['Meszegeto Maria', 'Mészégető Maria'] },
  { canonical: 'Krisztina Mihok', aliases: ['Mihok Krisztina', 'Mihók Krisztina'] },
  { canonical: 'Zsombor Molnar', aliases: ['Molnar Zsombor', 'Molnár Zsombor'] },
  { canonical: 'Zoli Peresztenyi', aliases: ['Peresztenyi Zoli', 'Peresztényi Zoli'] },
  { canonical: 'David Porkolab', aliases: ['Porkolab David', 'Porkoláb Dávid'] },
  { canonical: 'Tamas Santha', aliases: ['Santha Tamas', 'Sántha Tamás'] },
  { canonical: 'Bela Szabo', aliases: ['Szabo Bela', 'Szabó Béla'] },
  { canonical: 'Barnabas Imre Szaszi', aliases: ['Szaszi Barnabas Imre', 'Szászi Barnabás Imre'] },
  { canonical: 'Annamaria Nora Szaszko', aliases: ['Szaszko Annamaria Nora', 'Szászkő Annamária Nóra'] },
  { canonical: 'Lajos Toth', aliases: ['Toth Lajos', 'Tóth Lajos'] },
  { canonical: 'Renata Vasko', aliases: ['Vasko Renata', 'Vaskó Renáta'] },
  { canonical: 'Gyorgy Bakos', aliases: ['Bakos Gyorgy', 'Bakos György'] },
  { canonical: 'Albert-Laszlo Barabasi', aliases: ['Barabasi Albert-Laszlo', 'Barabási Albert-László'] },
  { canonical: 'Laszlo Bek-Balla', aliases: ['Bek-Balla Laszlo', 'Bek-Balla László'] },
  { canonical: 'Andrea Beliczki', aliases: ['Beliczki Andrea'] },
  { canonical: 'Kitti Fa', aliases: ['Fa Kitti'] },
  { canonical: 'Zsuzsanna Nyerki', aliases: ['Nyerki Zsuzsanna'] },
  { canonical: 'Csaba Brunner', aliases: ['Brunner Csaba'] },
  { canonical: 'Tamas Varfi', aliases: ['Varfi Tamas', 'Tomas Varfi'] },
  { canonical: 'Emese Papp', aliases: ['Papp Emese'] },
  { canonical: 'Alexandra Sipos', aliases: ['Sipos Alexandra'] },

  // ALREADY-WESTERN (un-accent + fold)
  { canonical: 'Andrej Karpathy', aliases: ['Karpathy'] },
  { canonical: 'Alexandra Kato', aliases: ['Alexandra Kató'] },
  { canonical: 'Eszter Suto', aliases: ['Eszter Sütő'] },
  { canonical: 'Kristof Martikan', aliases: ['Kristóf Martikán'] },
  { canonical: 'Krisztian Simon', aliases: ['Krisztián Simon'] },
  { canonical: 'Krisztian Nagy', aliases: ['Krisztián Nagy'] },
  { canonical: 'Peter Buza', aliases: ['Péter Buza'] },
  { canonical: 'Szilard Beres', aliases: ['Szilárd Béres'] },
  { canonical: 'Miklos Kun', aliases: ['Miklós Kun'] },
  { canonical: 'David Farkas', aliases: ['Dávid Farkas'] },
  { canonical: 'Csenge Barabas', aliases: ['Csenge Barabás'] },
  { canonical: 'Sandor Korsos', aliases: ['Sándor Korsos'] },

  // POST-CONSOLIDATION (flipped to Western)
  { canonical: 'Marta Hornai', aliases: ['Hornai Márta'] },
  { canonical: 'Gabor Wolf', aliases: ['Wolf Gábor'] },
  { canonical: 'Judit Fejszak', aliases: ['Fejszák Judit'] },
  { canonical: 'Szabina Mitter', aliases: ['Mitter Szabina'] },
  { canonical: 'Bettina Nagy', aliases: ['Nagy Bettina'] },
  { canonical: 'Mate Halasz', aliases: ['Halasz Mate'] },
  { canonical: 'Aniko Szemeti', aliases: ['Szemeti Anikó'] },
  { canonical: 'Bence Arcs', aliases: ['Árcs Bence'] },
  { canonical: 'Zsolt Balogh', aliases: ['Balogh Zsolt'] },
  { canonical: 'Barbara Szentteleki', aliases: ['Szentteleki Barbara'] },
  { canonical: 'Liza Laszlo', aliases: ['Laszlo Liza', 'László Liza', 'Laszló Liza', 'Liza'] },
];

const PEOPLE_RENAMES = {};
for (const { canonical, aliases } of PEOPLE_GROUPS) {
  for (const a of aliases) PEOPLE_RENAMES[a] = canonical;
}

// Sub-products folded under parent project. The old sub-product name is moved
// into `topics` so the signal isn't lost.
const PROJECT_RENAMES = {
  'FÉLRETESZEK': 'ERSTE',
  'BEFCAST': 'ERSTE',
};

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts';

async function* scrollAll() {
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: false,
      offset,
    });
    for (const p of batch.points) yield p;
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
}

async function run() {
  console.log(`People + project consolidation — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const peopleHits = new Map();
  const projectHits = new Map();

  for await (const point of scrollAll()) {
    scanned++;
    const payload = point.payload || {};
    const people = Array.isArray(payload.people) ? payload.people : [];
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const topics = Array.isArray(payload.topics) ? payload.topics : [];

    let peopleChanged = false;
    const mappedPeople = people.map((n) => {
      const c = PEOPLE_RENAMES[n];
      if (c && c !== n) {
        peopleChanged = true;
        peopleHits.set(n, (peopleHits.get(n) || 0) + 1);
        return c;
      }
      return n;
    });

    let projectsChanged = false;
    const addToTopics = [];
    const mappedProjects = projects.map((p) => {
      const c = PROJECT_RENAMES[p];
      if (c && c !== p) {
        projectsChanged = true;
        projectHits.set(p, (projectHits.get(p) || 0) + 1);
        addToTopics.push(p);
        return c;
      }
      return p;
    });

    if (!peopleChanged && !projectsChanged) {
      unchanged++;
      continue;
    }

    const newPayload = {};
    if (peopleChanged) newPayload.people = [...new Set(mappedPeople)];
    if (projectsChanged) {
      newPayload.projects = [...new Set(mappedProjects)];
      // Preserve sub-product signal in topics if not already present
      const topicSet = new Set(topics);
      for (const t of addToTopics) topicSet.add(t);
      if (topicSet.size !== topics.length) newPayload.topics = [...topicSet];
    }

    console.log(`─ ${point.id}  ${payload.title || '(untitled)'}`);
    if (peopleChanged) console.log(`  people:   ${JSON.stringify(people)} → ${JSON.stringify(newPayload.people)}`);
    if (projectsChanged) {
      console.log(`  projects: ${JSON.stringify(projects)} → ${JSON.stringify(newPayload.projects)}`);
      if (newPayload.topics) console.log(`  topics+:  ${JSON.stringify(addToTopics)} → topics now ${JSON.stringify(newPayload.topics)}`);
    }

    if (APPLY) {
      try {
        await qdrant.setPayload(COLLECTION, { points: [point.id], payload: newPayload });
        updated++;
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${err.message}`);
      }
    } else {
      updated++;
    }
  }

  console.log(`\nDone: scanned=${scanned}  ${APPLY ? 'updated' : 'would update'}=${updated}  unchanged=${unchanged}  failed=${failed}`);

  if (peopleHits.size > 0) {
    console.log(`\nPeople rename hits:`);
    const sorted = [...peopleHits.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`  ${name.padEnd(30)} → ${PEOPLE_RENAMES[name].padEnd(28)}  (${count}x)`);
    }
  }
  if (projectHits.size > 0) {
    console.log(`\nProject rename hits:`);
    for (const [name, count] of projectHits.entries()) {
      console.log(`  ${name.padEnd(20)} → ${PROJECT_RENAMES[name].padEnd(10)}  (${count}x, sub-product moved to topics)`);
    }
  }

  if (!APPLY && updated > 0) console.log(`\nRe-run with --apply to commit.`);
}

run().catch((err) => {
  console.error('Script crashed:', err.message);
  process.exit(1);
});
