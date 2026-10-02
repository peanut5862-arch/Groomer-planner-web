export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  try {
    const { message, context } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "A message is required." });
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

Be friendly, concise, practical, and conversational.

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
        error: data?.error?.message || "Betty could not reach OpenAI.",
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
      error: "Betty had trouble answering. Please try again.",
    });
  }
}