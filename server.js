// server.js
// Stanford Patient Access – AI Co-Pilot
// Live OpenAI-powered patient access analysis (no canned responses)

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY is not set. Start the server with:\n" +
      'OPENAI_API_KEY="sk-..." node server.js'
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models
const TEXT_MODEL = process.env.TEXT_MODEL || "gpt-4.1-mini";

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * POST /api/patient-access/analyze
 * Body: { callType, persona, notes, goal }
 *
 * Returns: { success, analysis: PatientAccessAnalysis }
 */
app.post("/api/patient-access/analyze", async (req, res) => {
  const { callType, persona, notes, goal } = req.body || {};

  if (!callType || !notes) {
    return res.status(400).json({
      success: false,
      error: "callType and notes are required.",
    });
  }

  try {
    const systemPrompt = `
You are an AI co-pilot for Stanford Health Care's Patient Access Center
serving the Redwood City and Newark locations.

You support:
- Silvia (Sr. Manager, Patient Access & Provider Relations)
- Chona (Radiology Scheduling, complex radiology w/ pre-auth)
- Karen (Contact Center Management)
- Gayathri (LEAN & process improvement)

Core call types:
- New Patient Scheduling (complex)
- Radiology w/ Pre-Auth (complex)
- Provider Referral Coordination (complex)
- Appointment Rescheduling (simple)
- Patient Demographics Update (simple)

Use LEAN language (MUDA, value stream, 5 Whys, Kaizen) and focus on
days to appointment, complex vs simple calls, provider satisfaction,
and patient experience.

You are NOT allowed to give generic canned responses.
You must tailor your answer to the specific scenario, notes, and goal.

Always respond with VALID JSON ONLY, no extra commentary, matching exactly:

{
  "summary": "One paragraph executive summary for Silvia in plain language.",
  "riskLevel": "low" | "medium" | "high",
  "recommendedDisposition": "What the agent should do next (route, schedule, escalate, close loop).",
  "schedulingPlan": "Step-by-step scheduling guidance for the specific scenario.",
  "scripts": {
    "opening": "Friendly, professional opening script.",
    "probingQuestions": [
      "Question 1",
      "Question 2",
      "Question 3"
    ],
    "expectationSetting": "Exact language to set expectations about next steps and timing.",
    "closing": "Strong closing that reassures patient and/or provider."
  },
  "leanInsights": {
    "mudaTypes": ["overprocessing", "waiting", "rework"],
    "rootCause": "Short explanation using 5 Whys logic.",
    "quickWins": [
      "Fast improvement idea 1",
      "Fast improvement idea 2"
    ],
    "longerTermFixes": [
      "Bigger structural fix 1",
      "Bigger structural fix 2"
    ]
  },
  "providerImpact": "How this scenario affects provider satisfaction & referral completion.",
  "metricsImpact": {
    "daysToAppointment": {
      "current": 4.1,
      "projected": 2.3
    },
    "fcrImpact": "Describe impact on First Call Resolution in words.",
    "hcahpsImpact": "Describe impact on 'getting appointments' in words."
  }
}
`;

    const userPrompt = `
CALL TYPE: ${callType}
PERSONA (primary audience for explanation): ${
      persona || "General Stanford Patient Access leader"
    }
GOAL: ${goal || "Optimize access and experience while protecting resources."}

CALL / SCENARIO NOTES:
${notes}

Return ONLY the JSON object, no backticks, no markdown, no extra text.
If data is missing, make reasonable assumptions consistent with Stanford
Patient Access operations and LEAN methodology.
`;

    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.2,
      // If your openai npm version supports it, this forces JSON.
      // If it doesn't, we will still safely handle non-JSON below.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from OpenAI. Raw content:", raw);
      parsed = {
        summary: "Model returned non-JSON output from OpenAI.",
        raw,
      };
    }

    return res.json({
      success: true,
      analysis: parsed,
    });
  } catch (error) {
    console.error("OpenAI error:", {
      message: error.message,
      name: error.name,
      status: error.status,
      data: error.response?.data,
    });

    return res.status(500).json({
      success: false,
      error:
        error.response?.data?.error?.message ||
        error.message ||
        "Failed to generate analysis.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Patient Access AI server listening on http://localhost:${PORT}`);
});