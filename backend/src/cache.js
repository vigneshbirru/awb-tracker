const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const TTL = parseInt(process.env.REDIS_TTL_SECONDS || "1800", 10);

redis.on("error", (err) => console.error("[redis] connection error:", err.message));

async function setAwbStatus(awbNo, statusObj) {
  await redis.set(`awb:${awbNo}`, JSON.stringify(statusObj), "EX", TTL);
}

async function getAwbStatus(awbNo) {
  const raw = await redis.get(`awb:${awbNo}`);
  return raw ? JSON.parse(raw) : null;
}

/** Paginated snapshot read for the table view. */
async function getAllAwbStatuses({ cursor = "0", count = 200 } = {}) {
  const [nextCursor, keys] = await redis.scan(
    cursor,
    "MATCH",
    "awb:*",
    "COUNT",
    count
  );
  if (keys.length === 0) return { nextCursor, rows: [] };

  const values = await redis.mget(keys);
  const rows = values.filter(Boolean).map((v) => JSON.parse(v));
  return { nextCursor, rows };
}

/** Store/read the last computed analysis summary object. */
async function setAnalysisSummary(summary) {
  await redis.set("analysis:summary", JSON.stringify(summary), "EX", TTL);
}

async function getAnalysisSummary() {
  const raw = await redis.get("analysis:summary");
  return raw ? JSON.parse(raw) : null;
}

module.exports = {
  redis,
  setAwbStatus,
  getAwbStatus,
  getAllAwbStatuses,
  setAnalysisSummary,
  getAnalysisSummary,
};
