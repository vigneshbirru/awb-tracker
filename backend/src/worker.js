const { fetchAwbStatus } = require("./trackonClient");
const { setAwbStatus, setAnalysisSummary, redis } = require("./cache");
const { loadAwbList } = require("./awbSource");

const FETCH_DELAY_MS = parseInt(process.env.FETCH_DELAY_MS || "1000", 10);
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "1", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs forever. Cycles through the AWB list ONE AWB AT A TIME per worker lane
 * (never a batch call), waiting FETCH_DELAY_MS between requests.
 * After a full pass, terminal (delivered/RTO/cancelled) AWBs are skipped on
 * the next pass so later cycles are much faster.
 *
 * @param {import('socket.io').Server} io
 */
async function startWorker(io) {
  const fullList = loadAwbList();
  if (fullList.length === 0) {
    console.warn("[worker] AWB list is empty — nothing to poll.");
    return;
  }
  console.log(`[worker] Loaded ${fullList.length} AWBs to track.`);

  // Split the list into N lanes for WORKER_CONCURRENCY. Each lane still does
  // ONE request at a time — this just runs multiple single-fetch lanes in parallel.
  const lanes = Array.from({ length: WORKER_CONCURRENCY }, () => []);
  fullList.forEach((awb, i) => lanes[i % WORKER_CONCURRENCY].push(awb));

  const terminalAwbs = new Set();
  const statusCounts = {};
  const failedAwbs = new Set();
  let delayedCount = 0;
  let processedInPass = 0;
  let fetchedCount = 0;

  const recomputeAndBroadcastSummary = () => {
    const summary = {
      totalTracked: fullList.length,
      fetchedCount,
      activeCount: fullList.length - terminalAwbs.size,
      terminalCount: terminalAwbs.size,
      failedCount: failedAwbs.size,
      statusCounts: { ...statusCounts },
      delayedPastEdd: delayedCount,
      updatedAt: new Date().toISOString(),
    };
    setAnalysisSummary(summary).catch(() => {});
    io.emit("analysis:update", summary);
  };

  const processOne = async (awbNo) => {
    const result = await fetchAwbStatus(awbNo);
    processedInPass += 1;
    fetchedCount += 1;

    if (result.ok) {
      try {
        await setAwbStatus(awbNo, result);
      } catch (err) {
        // Cache is best-effort — never let a Redis hiccup block the live push.
        console.error(`[worker] cache write failed for ${awbNo}:`, err.message);
      }
      io.emit("awb:update", result);

      statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
      if (result.isTerminal) terminalAwbs.add(awbNo);
      if (isPastEdd(result.edd) && !result.isTerminal) delayedCount += 1;
    } else {
      failedAwbs.add(awbNo);
      io.emit("awb:error", { awbNo, error: result.error });
    }

    if (fetchedCount % 25 === 0) {
      console.log(
        `[worker] fetched ${fetchedCount}/${fullList.length} ` +
          `(${failedAwbs.size} failed) last: ${awbNo} -> ${result.ok ? result.status : result.error}`
      );
      recomputeAndBroadcastSummary();
    }
  };

  // Terminal AWBs are re-checked only every N passes (saves API calls), but the
  // loop always sleeps a fixed interval per AWB so it can never hot-spin.
  const TERMINAL_REFRESH_EVERY = 20;
  let passNumber = 0;

  async function runLane(laneAwbs) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const awbNo of laneAwbs) {
        if (terminalAwbs.has(awbNo) && passNumber % TERMINAL_REFRESH_EVERY !== 0) {
          await sleep(FETCH_DELAY_MS);
          continue;
        }
        await processOne(awbNo);
        await sleep(FETCH_DELAY_MS);
      }
      passNumber += 1;
      recomputeAndBroadcastSummary();
      console.log(
        `[worker] Pass complete on this lane. ${terminalAwbs.size}/${fullList.length} ` +
          `AWBs are terminal (re-checked every ${TERMINAL_REFRESH_EVERY} passes).`
      );
    }
  }

  lanes.filter((l) => l.length > 0).forEach((lane) => runLane(lane));
}

function isPastEdd(eddStr) {
  if (!eddStr) return false;
  const [d, m, y] = eddStr.split("/").map(Number);
  if (!d || !m || !y) return false;
  const edd = new Date(y, m - 1, d);
  return edd < new Date();
}

module.exports = { startWorker };
