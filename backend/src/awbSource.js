const fs = require("fs");
const path = require("path");

function loadAwbList() {
  const filePath = path.resolve(
    process.cwd(),
    process.env.AWB_LIST_FILE || "./data/awbs.txt"
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `AWB list file not found at ${filePath}. Set AWB_LIST_FILE in .env, ` +
        `and generate it from your PDF (one AWB number per line).`
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const awbs = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return awbs;
}

module.exports = { loadAwbList };
