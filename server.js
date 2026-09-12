const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const port = process.env.PORT || 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured on the server."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a screenshot."
      });
    }

    const base64 = req.file.buffer.toString("base64");
    const mime = req.file.mimetype || "image/jpeg";

    const prompt = `
Analyze this screenshot of an instant/virtual football game.

IMPORTANT:
- Detect EVERY clearly visible game/match in the screenshot, not just one.
- Create one prediction object for EACH visible game.
- Do not invent teams, scores, odds, markets, or other information that is not visible.
- If a game is too unclear to identify, do not invent details.
- Virtual-game results can be random. Do NOT claim certainty or guaranteed wins.
- Confidence must be an estimate from 0 to 100.
- Keep each analysis short and based only on visible information.

Return ONLY valid JSON in exactly this structure:

{
  "games": [
    {
      "game": "Game 1",
      "teams": "Home Team vs Away Team",
      "market": "1X2 / Over-Under / BTTS / other visible market",
      "prediction": "your best estimate",
      "confidence": 0,
      "alternative": "safer alternative if supported",
      "risk": "Low / Medium / High",
      "analysis
