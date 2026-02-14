# TPPCNomics Analytics

Next.js + Prisma app for TPPC golden marketpoll voting, Elo scoring, and analytics dashboards.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

- `DATABASE_URL`
- `VISITOR_COOKIE_SECRET`
- optional `MARKETPOLL_MATCHUP_MODES` (defaults to `1v1,1v2,2v1,2v2`)

3. Generate Prisma client:

```bash
npx prisma generate
```

## Database Migrations

Run migrations before starting production code:

```bash
npx prisma migrate deploy
```

This is required for the `VoteEvent(source, voterId, createdAt DESC)` hot-path index used by matchup exclusion queries.

## Development

```bash
npm run dev
```

## Operational Notes

### Seed Sync Behavior

On bootstrap, the app loads `data/marketpoll_seeds.csv` and:

- inserts missing seed assets/pairs,
- reactivates assets/pairs present in the current seed,
- deactivates stale golden assets/pairs not present in the current seed,
- deactivates non-golden assets/pairs for web marketpoll mode.

This keeps runtime voting candidates synchronized with the current seed file (including removals).

### Transaction Reliability

Vote writes run in serializable transactions with automatic retries on Prisma `P2034` serialization conflicts.

This protects voter progression and score counters against lost updates under concurrent voting.

## Quality Checks

```bash
npm run lint -- --max-warnings=0
npm run typecheck
npm test
```
