const axios = require("axios");

const {
  TRACKON_APP_KEY,
  TRACKON_USER_ID,
  TRACKON_PASSWORD,
  TRACKON_BASE_URL,
} = process.env;

if (!TRACKON_APP_KEY || !TRACKON_USER_ID || !TRACKON_PASSWORD || !TRACKON_BASE_URL) {
  console.warn(
    "[trackonClient] Missing one or more TRACKON_* env vars. Check your .env file."
  );
}

/**
 * Fetch tracking status for a single AWB number.
 * Returns a normalized object with only the display fields we care about,
 * or null if the API call failed / returned no data.
 */
async function fetchAwbStatus(awbNo) {
  try {
    const response = await axios.get(TRACKON_BASE_URL, {
      params: {
        AWBNo: awbNo,
        AppKey: TRACKON_APP_KEY,
        userID: TRACKON_USER_ID,
        Password: TRACKON_PASSWORD,
      },
      timeout: 15000,
    });

    const data = response.data;
    const summary = data?.CustomersummaryTrack;

    if (!summary || data?.ResponseStatus?.Message !== "SUCCESS") {
      return {
        awbNo,
        ok: false,
        error: data?.ResponseStatus?.Message || "No data returned",
      };
    }

    return {
      awbNo: summary.AWBNO,
      refNo: summary.REF_NO,
      bookingDate: summary.BOOKING_DATE,
      edd: summary.EDD,
      eventDate: summary.EVENTDATE,
      eventTime: summary.EVENTTIME,
      status: summary.CURRENT_STATUS,
      trackingCode: summary.TRACKING_CODE,
      city: summary.CURRENT_CITY,
      isTerminal: isTerminalStatus(summary.CURRENT_STATUS),
      fetchedAt: new Date().toISOString(),
      ok: true,
    };
  } catch (err) {
    return {
      awbNo,
      ok: false,
      error: err.response?.status
        ? `HTTP ${err.response.status}`
        : err.message,
    };
  }
}

/** Decide whether an AWB should stop being re-polled every cycle. */
function isTerminalStatus(status = "") {
  const s = status.toUpperCase();
  return (
    s.includes("DELIVERED") ||
    s.includes("RTO DELIVERED") ||
    s.includes("CANCELLED") ||
    s.includes("LOST")
  );
}

module.exports = { fetchAwbStatus, isTerminalStatus };
