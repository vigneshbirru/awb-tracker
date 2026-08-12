# AWB Tracker (MERN-style, no permanent storage)

Sequential (one-at-a-time) Trackon API poller with a live-updating React table
and analysis dashboard. Nothing is stored permanently — results live in Redis
with a short TTL purely as a snapshot cache, and expire on their own.

## How it works

1. **`backend/data/awbs.txt`** — plain list of AWB numbers (one per line),
   extracted from your PDF (see below).
2. **`backend/src/worker.js`** — loops through the list **one AWB at a time**,
   waiting `FETCH_DELAY_MS` between each call to Trackon. After a full pass,
   AWBs already marked `DELIVERED` (or RTO/cancelled) are skipped on later
   passes, so cycle 2+ is much faster than cycle 1.
3. Each result is cached in Redis (`awb:<AWBNO>`, TTL ~30 min) **and** pushed
   instantly over Socket.io to any connected browser — that's the "real-time"
   part.
4. **`frontend/`** — React app that loads the current snapshot once via REST,
   then updates rows live as socket events arrive. Includes a small analysis
   panel (status breakdown, delayed-past-EDD count) computed by the worker
   every 25 fetches.

## 1. Extract AWB numbers from your PDF

```bash
cd backend
pip install pdfplumber --break-system-packages
python3 extract_awbs_from_pdf.py /path/to/your_100k_orders.pdf
```

This writes `backend/data/awbs.txt`. Open it and spot-check a few numbers
against the PDF before running the full pipeline — the regex assumes 12-digit
AWB numbers like `500613053012`; adjust `AWB_PATTERN` in the script if yours
differ.

## 2. Configure credentials

```bash
cd backend
cp .env.example .env
```

Fill in `TRACKON_APP_KEY`, `TRACKON_USER_ID`, `TRACKON_PASSWORD`. **Never**
put these in the frontend — the frontend only ever talks to your own backend.

Also decide `FETCH_DELAY_MS` (start at `1000` = 1 request/sec, which is
~27.8 hours per full pass of 100k AWBs — see the table from earlier). Only
lower this once you've confirmed Trackon's actual rate limit; otherwise
you risk your API key getting throttled or blocked.

## 3. Start Redis

```bash
# any of these work:
docker run -p 6379:6379 redis
# or: brew install redis && redis-server
# or: apt install redis-server && redis-server
```

## 4. Run the backend

```bash
cd backend
npm install
npm start
```

You should see `[worker] Loaded N AWBs to track.` and it will start
fetching one at a time.

## 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). Rows populate
as the worker cycles through your list and update live as new statuses come
in — no page refresh needed.

## Scaling up the fetch rate later

If Trackon confirms you can do more than 1 req/sec, raise
`WORKER_CONCURRENCY` in `.env` (e.g. `5`) — this runs 5 independent
one-at-a-time lanes in parallel (still never a batch call), roughly
dividing your full-pass time by 5.

## What's intentionally NOT here

- No database / permanent row storage (per your request) — only a
  short-TTL cache for the live snapshot.
- No historical trend charts, since nothing is persisted. If you want
  that later, the cheapest addition is storing just a daily aggregate
  (a handful of numbers/day), not the raw rows.
