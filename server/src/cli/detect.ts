// Print what the detectors find on the demo company: `npm run detect -w server`
import { company } from "../data/company.js";
import { Repo } from "../data/repo.js";
import { detect } from "../detectors/index.js";

for (const f of detect(new Repo(company))) {
  console.log(`${f.id} [${f.severity}] ${f.type}\n  ${f.title}`);
  for (const fact of f.facts) console.log(`   - ${fact}`);
}
