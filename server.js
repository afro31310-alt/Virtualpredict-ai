const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024
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
        error: "OPENAI_API_KEY is missing."
      });
    }

    const image =
      "data:" +
      req.file.mimetype +
      ";base64," +
      req.file.buffer.toString("base64");

    const prompt = `
Analyze EVERY clearly readable football or virtual match
in this screenshot.

Return ONLY valid JSON.

For every match provide:

game
odds
prediction
alternative
confidence
risk
analysis

Use this exact structure:

{
  "matches": [
    {
      "game": "Team A vs Team B",
      "odds": "1.80 / 3.50 / 4.20",
      "prediction": "Team A Win",
      "alternative": "Draw",
      "confidence": "Medium",
      "risk": "Medium",
      "analysis": "Short explanation."
    }
  ]
}

IMPORTANT:
- Analyze ALL readable matches.
- Do not return only one match.
- Do not invent team names.
- Do not invent odds.
- Use the visible 1X2 odds when available.
- Prediction must be one of:
  Team A Win
  Draw
  Team B Win
- Keep analysis short.
- Predictions are estimates, not guarantees.
`;

    let response;

    try {
      response = await ai.responses.create({
        model: "gpt-5.6-luna",
        max_output_tokens: 900,
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
          error:
            "AI rate limit reached. Please wait and try again later."
        });
      }

      return res.status(error.status || 500).json({
        error:
          error.message || "OpenAI request failed."
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

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("JSON ERROR:", text);

      return res.status(500).json({
        error: "AI returned an invalid result."
      });
    }

    if (!Array.isArray(data.matches) || data.matches.length === 0) {
      return res.status(500).json({
        error: "No readable matches were found."
      });
    }

    data.matches = data.matches.map((m) => {
      return {
        game: m.game || "Unknown match",
        odds: m.odds || "Not available",
        prediction: m.prediction || "No estimate",
        alternative: m.alternative || "Not available",
        confidence: m.confidence || "Medium",
        risk: m.risk || "Medium",
        analysis:
          m.analysis ||
          "Estimate based on visible information."
      };
    });

    res.json(data);

  } catch (error) {
    console.error("SERVER ERROR:", error);

    res.status(500).json({
      error:
        error.message || "Unable to analyze screenshot."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "VirtualPredict AI running on port " + PORT
  );
});
