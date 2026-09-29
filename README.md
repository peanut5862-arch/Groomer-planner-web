# Grooming Planner Frontend Prototype

This is a **professional front-end direction prototype** for the grooming planner.

## What this version demonstrates
- Mobile-first bottom navigation
- Today dashboard
- Week schedule cards
- Separate Jen / Haley month views
- Client directory
- Tap-to-edit appointment sheet
- Persistent **Ask Planner** AI bar
- AI cancellation-fill workflow
- Quick AI prompts such as:
  - Fill Thursday's cancellation
  - Who is overdue near The Woodlands?
  - Move Leah to 9:30 and reroute
- Ranked cancellation-fill suggestions using due status, area, drive time, service length, and price

## Important
The AI assistant in this prototype is a UI demonstration with local demo responses. It is **not yet connected to OpenAI or your scheduling engine**.

The production architecture should keep:
- Supabase as the database
- Google Maps / Routes for travel
- Your scheduling logic
- secure backend actions for AI and route operations

Do **not** put the Supabase `service_role` key in this front end. A public web app should use Supabase Auth + RLS and a safe anon/publishable key, with privileged actions behind a backend/server function.

## Run locally
1. Install Node.js
2. `npm install`
3. `npm run dev`

## Build
`npm run build`
