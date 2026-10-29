# Hey Betty

Hey Betty is a working grooming business app with Supabase accounts and saved client, appointment, payment, and business records. This repository started as a frontend prototype; the former description of Betty as a local demo is outdated.

## Ask Betty

The deployed `/api/ask-betty` backend calls OpenAI. The signed-in app supplies planner context, and dedicated lookups read saved appointments. Google Routes supplies drive calculations. Betty is not a separate demo model or a simulated chat.

Capabilities depend on the app workflow. Supported booking and rescheduling requests show a review step before saving. General conversation cannot independently write arbitrary database changes or send customer messages. Historical completed-visit lookups use saved completion dates and distinguish completed visits from scheduled appointments.

The viewer account is intentionally a read-only demo; that restriction does not apply to the business owner account.

## Scheduling

Client frequency and actual completed service dates determine recurring due dates. Future appointments are separate saved bookings. The recurring planner checks household dogs, groomer restrictions, service areas, working days, time off, service duration, and the return home deadline. Automatic booking after completion is being added; do not assume changing a due date alone creates an appointment. Existing draft cleanup is reviewed before replacement.

## Development

- `npm install`
- `npm run dev`
- `npm run build`
- `node --test tests/*.test.mjs`

API credentials stay in server environment variables. Never put a Supabase service-role key or OpenAI secret in frontend code. Database changes live in `database/`; apply the matching migration before deploying dependent app behavior.
