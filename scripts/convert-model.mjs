import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convert2xkt } from "@xeokit/xeokit-convert";
import * as WebIFC from "web-ifc";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

const source = path.join(
  projectRoot,
  "public",
  "models",
  "Snowdon Towers Sample Architectural.ifc"
);

const output = path.join(
  projectRoot,
  "public",
  "models",
  "Snowdon Towers Sample Architectural.xkt"
);

if (!fs.existsSync(source)) {
  console.error("IFC file not found:");
  console.error(source);
  process.exit(1);
}

console.log("Converting IFC -> XKT...");
console.log("Source:", source);
console.log("Output:", output);

try {
  await convert2xkt({
    WebIFC,
    source,
    output,
    log: (msg) => console.log(msg)
  });

  console.log("Conversion complete.");
} catch (error) {
  console.error("Conversion failed:");
  console.error(error);
  process.exit(1);
}