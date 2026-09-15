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
  limits: { fileSize: 6 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Upload a screenshot." });
    }

    const image =
      `data:${req.file.mimetype};base64,` +
      req.file.buffer.toString("base64");

    const prompt = `
Analyze ALL readable matches in this screenshot.
Return ONLY JSON.

{
 "matches":[
  {
   "game":"Team A vs Team B",
   "odds":"1.80 / 3.50 / 4.20",
   "prediction":"Team A Win",
   "overUnder":{
    "line":"2.5",
    "prediction":"Over 2.5 Goals",
    "over":"Not available",
    "under":"Not available"
   },
   "confidence":"Medium",
   "risk":"Medium"
  }
 ]
}

Rules:
Analyze every readable match.
Never invent team names or odds.
If O/U odds are missing, say "Not available".
Still give an O/U estimate for every match.
Use Over/Under 1.5, 2.5 or 3.5 Goals.
Predictions are estimates, not guarantees.
`;

    let r;

    try {
      r = await ai.responses.create({
        model: "gpt-5.6-luna",
        max_output_tokens: 900,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image }
          ]
        }]
      });
    } catch (e) {
      if (e.status === 429) {
        return res.status(429).json({
          error: "AI rate limit reached. Please wait and try again later."
        });
      }

      return res.status(e.status || 500).json({
        error: e.message || "AI request failed."
      });
    }

    let text = (r.output_text || "")
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
    } catch (e) {
      return res.status(500).json({
        error: "AI returned invalid JSON."
      });
    }

    if (!Array.isArray(data.matches) || !data.matches.length) {
      return res.status(500).json({
        error: "No readable matches found."
      });
    }

    data.matches = data.matches.map(m => {
      const ou = m.overUnder || {};
      const line = ou.line || "2.5";
      const ouPrediction =
        ou.prediction || `Over ${line} Goals`;

      return {
        game: m.game || "Unknown match",
        odds: m.odds || "Not available",
        prediction: m.prediction || "No estimate",
        alternative: ouPrediction,
        overUnder: {
          line: line,
          prediction: ouPrediction,
          over: ou.over || "Not available",
          under: ou.under || "Not available"
        },
        confidence: m.confidence || "Medium",
        risk: m.risk || "Medium"
      };
    });

    res.json(data);

  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || "Server error."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("VirtualPredict AI running on port " + PORT);
});
