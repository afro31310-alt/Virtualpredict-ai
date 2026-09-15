const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a screenshot."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing in Render."
      });
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");
    const image = `data:${mime};base64,${base64}`;

    const prompt = `
Analyze EVERY clearly readable football or virtual match in this screenshot.

Return ONLY JSON in this format:

{
  "matches": [
    {
      "game": "Team A vs Team B",
      "odds": "1.80 / 3.50 / 4.20",
      "prediction": "Team A Win",
      "overUnder": {
        "line": "2.5",
        "prediction": "Over 2.5 Goals",
        "over": "Not available",
        "under": "Not available"
      },
      "confidence": "Medium",
      "risk": "Medium"
    }
  ]
}

IMPORTANT:
- Analyze ALL readable matches, not just one.
- Do not invent team names.
- Do not invent odds.
- If Over/Under odds are not visible, use "Not available".
- Still provide an Over/Under ESTIMATE for every readable match.
- Use only: Over 1.5 Goals, Under 1.5 Goals, Over 2.5 Goals, Under 2.5 Goals, Over 3.5 Goals, Under 3.5 Goals.
- Predictions are estimates, not guarantees.
`;

    let response;

    try {
      response = await openai.responses.create({
        model: "gpt-5.6-luna",
        max_output_tokens: 1100,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt
              },
              {
                type: "input_image",
                image_url: image
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error("OPENAI ERROR:", error);

      if (error.status === 429) {
        return res.status(429).json({
          error: "AI rate limit reached. Please wait for the limit to reset."
        });
      }

      return res.status(error.status || 500).json({
        error: error.message || "OpenAI request failed."
      });
    }

    let text = response.output_text || "";

    text = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response."
      });
    }

   
