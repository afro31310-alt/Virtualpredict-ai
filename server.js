const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set.");
}

const client = new OpenAI({
  apiKey: apiKey
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    apiKeyConfigured: !!apiKey
  });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No screenshot was uploaded."
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured."
      });
    }

    const mimeType = req.file.mimetype || "image/jpeg";
    const base64Image = req.file.buffer.toString("base64");

    const imageDataUrl =
      `data:${mimeType};base64,${base64Image}`;

    const response = await client.responses.create({
      model: "gpt-5.6-luna",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Analyze the uploaded screenshot of a virtual football game.

Use ONLY information that is clearly visible in the screenshot.

Identify:
- Teams or competitors
- Visible market
- Visible odds if available
- Any clearly visible game information

Give an estimate, NOT a guaranteed result.

Do not invent teams, scores, odds, statistics, previous results, or hidden information.

Return ONLY valid JSON in this exact structure:

{
  "game": "teams or game shown",
  "market": "most appropriate market",
  "prediction": "best estimate",
  "confidence": "Low, Medium, or High",
  "alternative": "one alternative estimate",
  "risk": "Low, Medium, or High",
  "analysis": "brief explanation based only on what is visible"
}

If the screenshot is unclear, say so and use Low confidence.
              `
            },
            {
              type: "input_image",
              image_url: imageDataUrl
            }
          ]
        }
      ]
    });

    let result;

    try {
      result = JSON.parse(response.output_text);
    } catch (parseError) {
      result = {
        game: "Unable to identify",
        market: "Unknown",
        prediction: response.output_text || "No prediction available",
        confidence: "Low",
        alternative: "No reliable alternative",
        risk: "High",
        analysis: "The AI response could not be converted into the expected format."
      };
    }

    res.json(result);

  } catch (error) {
    console.error("Prediction error:", error);

    res.status(500).json({
      error: error.message || "AI analysis failed."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VirtualPredict AI running on port ${PORT}`);
});
