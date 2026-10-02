function weatherCodeLabel(code) {
  const labels = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "light freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    66: "light freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "light rain showers", 81: "rain showers", 82: "heavy rain showers",
    85: "light snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "strong thunderstorms with hail"
  };
  return labels[Number(code)] || "mixed conditions";
}

function weatherLocationFromMessage(message) {
  const text = String(message || "").replace(/[?!.]+$/g, "").trim();
  const match = text.match(/\b(?:in|for|near|at)\s+(.+)$/i);
  let location = match?.[1] || "";
  location = location
    .replace(/\b(today|tomorrow|this morning|this afternoon|tonight|weather|forecast)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!location) {
    if (/\bwoodlands\b/i.test(text)) location = "The Woodlands, Texas";
    else if (/\bspring\b/i.test(text)) location = "Spring, Texas";
    else if (/\bconroe\b/i.test(text)) location = "Conroe, Texas";
    else if (/\bmagnolia\b/i.test(text)) location = "Magnolia, Texas";
    else if (/\btomball\b/i.test(text)) location = "Tomball, Texas";
    else if (/\bmontgomery\b/i.test(text)) location = "Montgomery, Texas";
    else location = "The Woodlands, Texas";
  }
  return location;
}

async function liveWeatherAnswer(message) {
  const locationQuery = weatherLocationFromMessage(message);
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=5&language=en&format=json`;
  const geoResponse = await fetch(geoUrl);
  const geo = await geoResponse.json();
  if (!geoResponse.ok || !Array.isArray(geo?.results) || !geo.results.length) {
    throw new Error(`I couldn't find ${locationQuery}.`);
  }

  const preferred = geo.results.find(item => String(item.country_code || '').toUpperCase()==='US' && String(item.admin1 || '').toLowerCase().includes('texas')) || geo.results[0];
  const { latitude, longitude } = preferred;
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
  const forecastResponse = await fetch(forecastUrl);
  const forecast = await forecastResponse.json();
  if (!forecastResponse.ok || !Array.isArray(forecast?.daily?.time)) {
    throw new Error('The live forecast is temporarily unavailable.');
  }

  const wantsToday = /\btoday\b/i.test(message) && !/\btomorrow\b/i.test(message);
  const index = wantsToday ? 0 : 1;
  const date = forecast.daily.time[index];
  const high = Math.round(Number(forecast.daily.temperature_2m_max[index]));
  const low = Math.round(Number(forecast.daily.temperature_2m_min[index]));
  const rainChance = Math.round(Number(forecast.daily.precipitation_probability_max[index] || 0));
  const rainAmount = Number(forecast.daily.precipitation_sum[index] || 0);
  const wind = Math.round(Number(forecast.daily.wind_speed_10m_max[index] || 0));
  const condition = weatherCodeLabel(forecast.daily.weather_code[index]);
  const place = [preferred.name, preferred.admin1].filter(Boolean).join(', ');
  const dayWord = wantsToday ? 'Today' : 'Tomorrow';

  let groomingNote = '';
  if (rainChance >= 60) groomingNote = ' Rain looks likely, so allow a little extra drive/loading time.';
  else if (high >= 95) groomingNote = ' It will be very hot, so keep the van cooling and water plan in mind.';
  else if (wind >= 25) groomingNote = ' Winds may be noticeable for driving and van setup.';

  return `${dayWord} in ${place}: ${condition}, high ${high}°F / low ${low}°F, about ${rainChance}% chance of rain${rainAmount >= 0.01 ? ` (${rainAmount.toFixed(2)} in)` : ''}, with winds up to ${wind} mph.${groomingNote}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const apiKey = process.env.OPENAI_API_KEY;
  try {
    const { message, context, mode } = req.body || {};
    if (!message || typeof message !== "string") return res.status(400).json({ error: "A message is required." });

    if (mode === "weather") {
      const answer = await liveWeatherAnswer(message);
      return res.status(200).json({ answer, source: "Open-Meteo" });
    }

    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });

    if (mode === "route") {
      const routingResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5-mini",
          instructions: `
You are the intent router for Betty, an AI assistant inside a mobile dog grooming planner.
Return ONLY a compact JSON object with one key named intent.
Allowed intents:
- planner_schedule: ONLY explicit requests to suggest candidates for an opening, such as who/which client to add, who can fill an opening, overdue/unbooked candidates to choose from, route-fit client suggestions, or a follow-up that clearly refers to a prior planner candidate list.
- client_price: asking the saved grooming/bath/partial price for a specific client or dog.
- confirmations: asking who needs confirmation / is unconfirmed.
- brief: asking what needs attention / business brief.
- weather: asking for current or forecast weather, rain, storms, temperatures, heat, or cold for a place/date.
- reschedule: asking to move, reschedule, or change an EXISTING appointment to another day/date/time.
- general: everything else, including existing schedule lookups (for example 'what dogs are on next week?'), requests naming a specific client to add/book (handled by the app), earnings, commissions, totals, time, business questions, explanations, and normal conversation.

Important:
- Words like tomorrow, Wednesday, Haley, Jen, price, or how much do NOT by themselves make something planner_schedule or client_price.
- 'How much will Haley make tomorrow?' is general.
- 'What will the weather be tomorrow?' is weather.
- 'How much is Amanda?' or 'What does Junior cost?' is client_price.
- 'Who should I add Wednesday?' is planner_schedule.
- 'What dogs are on next week?' is general, NOT planner_schedule.
- 'Add Tammy to October 9th' is general, NOT planner_schedule, because it names a specific client rather than asking for suggestions.
- 'Can you move Nikki to Thursday?' is reschedule, NOT planner_schedule.
- 'Move Tammy to Monday' is reschedule, NOT planner_schedule.
- If the user says 'What about Haley instead?' after a prior planner candidate result, classify planner_schedule.
- If the user says 'Which one pays the most?' after a prior candidate list, classify general so Betty can compare the prior result.
Use conversation and previousPlannerResult to resolve follow-ups.
          `,
          input: `CONTEXT:\n${JSON.stringify(context || {}, null, 2)}\n\nUSER MESSAGE:\n${message}`,
        }),
      });
      const routingData = await routingResponse.json();
      if (!routingResponse.ok) return res.status(routingResponse.status).json({ error: routingData?.error?.message || "Betty could not route the request." });
      const raw = String(routingData.output_text || routingData.output?.flatMap((item) => item.content || [])?.find((item) => item.type === "output_text")?.text || "").trim();
      let intent = "general";
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : raw);
        if (["planner_schedule", "client_price", "confirmations", "brief", "weather", "reschedule", "general"].includes(parsed?.intent)) intent = parsed.intent;
      } catch {}
      return res.status(200).json({ intent });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions: `
You are Betty, the AI grooming business assistant inside Grooming Planner.
Help Jen run her mobile dog grooming business.
Be friendly, concise, practical, and conversational. Keep phone answers short unless Jen asks for detail.
Use prior conversation and previousPlannerResult to understand follow-up questions.
When comparing a prior planner candidate list, answer directly from that list instead of asking Jen to repeat it.
For Haley earnings, Haley receives 50% of ALL service revenue from every service she personally performs, including Groom, Bath Only, Partial Groom, and any other service type. Do not ask whether baths or partials count. Tips are excluded from commission unless Jen explicitly asks to include them. Use the supplied schedule and saved appointment prices.
Only claim you can perform an action when currentCapabilities explicitly says that action is available. If saving appointments, rescheduling, notes, or sending customer messages is not enabled, do not offer to do it.
Use the business context supplied with each request when relevant. Never invent client information, appointments, prices, payments, routes, or other business data that is not in the supplied context.
If the user asks you to actually change an appointment, contact a customer, take a payment action, or make another business change, explain what you intend to do and require confirmation before the change is performed.
        `,
        input: `BUSINESS CONTEXT:\n${JSON.stringify(context || {}, null, 2)}\n\nJEN'S MESSAGE:\n${message}`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(response.status).json({ error: data?.error?.message || "Betty could not reach OpenAI." });
    }
    const answer = data.output_text || data.output?.flatMap((item) => item.content || [])?.find((item) => item.type === "output_text")?.text || "Betty didn't return an answer.";
    return res.status(200).json({ answer });
  } catch (error) {
    console.error("Ask Betty error:", error);
    return res.status(500).json({ error: error?.message || "Betty had trouble answering. Please try again." });
  }
}
