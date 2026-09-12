require("dotenv").config();
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) console.warn("OPENAI_API_KEY is missing.");

const client = new OpenAI({ apiKey });

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ ok: true, aiConfigured: !!apiKey });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({
        error: "The AI server is not configured. Add OPENAI_API_KEY to the server environment."
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No screenshot was uploaded." });
    }

    const dataUrl =
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Analyze this screenshot of an instant virtual sports game.

Use ONLY information visible in the screenshot. Read the sport/game, teams or competitors, visible market, and visible odds where possible.

Return an estimate, not a guarantee. Do not invent statistics, previous results, hidden information, or odds.

If the screenshot is unclear, say so and lower confidence.`
          },
          { type: "input_image", image_url: dataUrl }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "virtual_game_prediction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              game: { type: "string" },
              market: { type: "string" },
              prediction: { type: "string" },
              confidence: { type: "string" },
              alternative: { type: "string" },
              risk: { type: "string", enum: ["Low", "Medium", "High"] },
              analysis: { type: "string" }
            },
            required: [
              "game", "market", "prediction", "confidence",
              "alternative", "risk", "analysis"
            ],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message || "AI analysis failed."
    });
  }
});

app.listen(PORT, () => {
  console.log(`VirtualPredict AI running on port ${PORT}`);
});
