export default async function handler(req, res) {
  // Allow Grooming Planner's native Capacitor app to call this Vercel endpoint.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured."
    });
  }

  try {
    const { message, context, mode } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "A message is required."
      });
    }


    if (mode === "route") {
      const routingResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          instructions: `
You are the intent router for Betty, an AI assistant inside a mobile dog grooming planner.
Return ONLY a compact JSON object with one key named intent.
Allowed intents:
- planner_schedule: finding/filling an opening, suggesting which client to add, overdue/unbooked candidates, route-fit client suggestions, or a follow-up that clearly refers to a prior planner candidate list.
- client_price: asking the saved grooming/bath/partial price for a specific client or dog.
- confirmations: asking who needs confirmation / is unconfirmed.
- brief: asking what needs attention / business brief.
- general: everything else, including earnings, commissions, totals, weather, time, business questions, explanations, and normal conversation.

Important:
- Words like tomorrow, Wednesday, Haley, Jen, price, or how much do NOT by themselves make something planner_schedule or client_price.
- 'How much will Haley make tomorrow?' is general.
- 'What will the weather be tomorrow?' is general.
- 'How much is Amanda?' or 'What does Junior cost?' is client_price.
- 'Who should I add Wednesday?' is planner_schedule.
- If the user says 'What about Haley instead?' after a prior planner candidate result, classify planner_schedule.
- If the user says 'Which one pays the most?' after a prior candidate list, classify general so Betty can compare the prior result.
Use conversation and previousPlannerResult to resolve follow-ups.
          `,
          input: `
CONTEXT:
${JSON.stringify(context || {}, null, 2)}

USER MESSAGE:
${message}
          `,
        }),
      });

      const routingData = await routingResponse.json();
      if (!routingResponse.ok) {
        return res.status(routingResponse.status).json({
          error: routingData?.error?.message || "Betty could not route the request.",
        });
      }

      const raw = String(
        routingData.output_text ||
        routingData.output
          ?.flatMap((item) => item.content || [])
          ?.find((item) => item.type === "output_text")
          ?.text ||
        ""
      ).trim();

      let intent = "general";
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : raw);
        if (["planner_schedule", "client_price", "confirmations", "brief", "general"].includes(parsed?.intent)) {
          intent = parsed.intent;
        }
      } catch {}

      return res.status(200).json({ intent });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions: `
You are Betty, the AI grooming business assistant inside Grooming Planner.

Help Jen run her mobile dog grooming business.

Be friendly, concise, practical, and conversational. Keep phone answers short unless Jen asks for detail.
Use prior conversation and previousPlannerResult to understand follow-up questions.
When comparing a prior planner candidate list, answer directly from that list instead of asking Jen to repeat it.
For Haley earnings, Haley receives 50% of ALL service revenue from every service she personally performs, including Groom, Bath Only, Partial Groom, and any other service type. Do not ask whether baths or partials count. Tips are excluded from commission unless Jen explicitly asks to include them. Use the supplied schedule and saved appointment prices.

Only claim you can perform an action when currentCapabilities explicitly says that action is available. Right now, if saving appointments, rescheduling, notes, or sending customer messages is not enabled, do not offer to do it and do not ask whether Jen wants you to do it. You may explain that the action layer is not connected yet and can still help plan or draft the change.

If Jen asks for live weather and no live weather data is supplied in BUSINESS CONTEXT, say briefly that live weather is not connected to Betty yet. Do not invent a forecast or substitute seasonal averages.

Use the business context supplied with each request when relevant.
Never invent client information, appointments, prices, payments, routes,
or other business data that is not in the supplied context.

You can help with:
- scheduling
- overdue and due clients
- openings
- route planning
- grooming prices
- weekly business totals
- rebooking
- confirmations
- client organization
- groomer schedules
- general grooming-business questions

If the user asks you to actually change an appointment, contact a customer,
take a payment action, or make another business change, explain what you
intend to do and require confirmation before the change is performed.
        `,
        input: `
BUSINESS CONTEXT:
${JSON.stringify(context || {}, null, 2)}

JEN'S MESSAGE:
${message}
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Betty could not reach OpenAI."
      });
    }

    const answer =
      data.output_text ||
      data.output
        ?.flatMap((item) => item.content || [])
        ?.find((item) => item.type === "output_text")
        ?.text ||
      "Betty didn't return an answer.";

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("Ask Betty error:", error);
    return res.status(500).json({
      error: "Betty had trouble answering. Please try again."
    });
  }
}
