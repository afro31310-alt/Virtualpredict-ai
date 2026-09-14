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
        error: "Please upload a screenshot."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "AI service is not configured."
      });
    }

    const mimeType = req.file.mimetype || "image/jpeg";

    const base64Image =
      req.file.buffer.toString("base64");

    const imageDataUrl =
      `data:${mimeType};base64,${base64Image}`;

    const prompt = `
Analyze this instant virtual football screenshot carefully.

IMPORTANT:

1. Identify EVERY football match that is visibly readable.
2. Do NOT analyze only the first match.
3. Do NOT invent matches.
4. Read the team names carefully.
5. Read the visible 1X2 odds when possible.
6. Create ONE result for EACH visible match.
7. If a match is too unclear to identify, do not invent the team names.
8. Predictions are estimates only. Virtual-game results are random
   and cannot be guaranteed.

For each visible match provide:

- game
- market
- odds
- prediction
- confidence
- alternative
- risk
- analysis

Use the visible 1X2 market when that is what the screenshot shows.

Return ONLY valid JSON.

Use exactly this structure:

{
  "matches": [
    {
      "game": "BHA vs ARS",
      "market": "1X2",
      "odds": "2.80 / 3.54 / 2.44",
      "prediction": "ARS to win",
      "confidence": "Low",
      "alternative": "Draw",
      "risk": "High",
      "analysis": "Brief explanation based on the visible information."
    }
  ]
}

VERY IMPORTANT:
Return ALL readable matches in the screenshot,
not just the first match.
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

    } catch (error) {

      console.error("Invalid AI JSON:", text);

      return res.status(500).json({
        error: "The AI returned an invalid result. Please try again."
      });

    }

    if (
      !result.matches ||
      !Array.isArray(result.matches)
    ) {

      return res.status(500).json({
        error: "No matches were detected."
      });

    }

    res.json({
      matches: result.matches
    });

  } catch (error) {

    console.error("Server error:", error);

    res.status(500).json({
      error:
        error.message ||
        "Unable to analyze the screenshot."
    });

  }

});

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `VirtualPredict AI running on port ${PORT}`
  );

});
