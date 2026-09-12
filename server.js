const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({
        error: "No screenshot was uploaded."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured on the server."
      });
    }

    const mimeType = req.file.mimetype || "image/jpeg";

    const base64Image = req.file.buffer.toString("base64");

    const imageDataUrl =
      `data:${mimeType};base64,${base64Image}`;

    const prompt = `
Analyze this virtual football betting screenshot.

IMPORTANT:
- Identify EVERY football match that is visibly shown in the screenshot.
- Do NOT analyze only the first match.
- Return a prediction for EACH visible match.
- Read the team names and visible 1X2 odds carefully.
- If a match is partially visible but the teams can be identified, include it.
- Do not invent matches that are not visible.
- Use the visible odds and information in the screenshot.
- Predictions are estimates, NOT guaranteed results.

For EVERY visible match return:

game
market
prediction
confidence
alternative
risk
odds
analysis

The "odds" field should contain the visible 1X2 odds when available.

Return ONLY valid JSON in exactly this format:

{
  "matches": [
    {
      "game": "BHA vs ARS",
      "market": "1X2",
      "prediction": "ARS to win",
      "confidence": "Low",
      "alternative": "Draw",
      "risk": "High",
      "odds": "2.80 / 3.54 / 2.44",
      "analysis": "Brief explanation."
    }
  ]
}

Again: INCLUDE ALL VISIBLE MATCHES, NOT JUST ONE.
`;

    const response = await client.responses.create({

      model: "gpt-5.6-luna",

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
              image_url: imageDataUrl
            }
          ]
        }
      ]

    });

    let text = response.output_text || "";

    text = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let result;

    try {

      result = JSON.parse(text);

    } catch (jsonError) {

      console.error("AI returned invalid JSON:", text);

      return res.status(500).json({
        error: "The AI returned an invalid analysis response."
      });

    }

    if (!result.matches || !Array.isArray(result.matches)) {

      return res.status(500).json({
        error: "No match list was returned by the AI."
      });

    }

    res.json({
      matches: result.matches
    });

  } catch (error) {

    console.error("Analysis error:", error);

    res.status(500).json({
      error: error.message || "Unable to analyze screenshot."
    });

  }

});

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `VirtualPredict AI running on port ${PORT}`
  );

});
