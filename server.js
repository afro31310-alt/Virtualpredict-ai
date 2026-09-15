const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   UPLOAD SETTINGS
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024
  }
});

/* =========================
   WEBSITE
========================= */

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   ANALYZE SCREENSHOT
========================= */

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a screenshot."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured."
      });
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");

    const imageUrl = `data:${mime};base64,${base64}`;

    /* =========================
       VERY SHORT PROMPT
    ========================= */

    const prompt = `
Read EVERY clearly visible football/virtual match.

Return ONLY JSON.

For every match give:
game,
odds,
prediction,
overUnder,
confidence,
risk.

overUnder must contain:
line,
prediction,
over,
under.

If O/U odds are not visible:
over = "Not available"
under = "Not available"

Still give an O/U ESTIMATE.

Allowed estimates:
Over 1.5 Goals
Under 1.5 Goals
Over 2.5 Goals
Under 2.5 Goals
Over 3.5 Goals
Under 3.5 Goals

Do not invent team names or odds.

Format:
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

Return all readable matches.
Predictions are estimates, not guarantees.
`;

    /* =========================
       ONE AI REQUEST
       NO REPEATED RETRIES
    ========================= */

    let response;

    try {
      response = await client.responses.create({
        model: "gpt-5.6-luna",

        /*
         * Much smaller output.
         */
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
                image_url: imageUrl
              }
            ]
          }
        ]
      });
    } catch (error) {

      console.error("OPENAI ERROR:", error);

      /* =========================
         RATE LIMIT
      ========================= */

      if (error && error.status === 429) {
        return res.status(429).json({
          error:
            "AI rate limit reached. Please wait until the rate limit resets before analyzing another screenshot."
        });
      }

      return res.status(error.status || 500).json({
        error:
          error.message ||
          "OpenAI request failed."
      });
    }

    /* =========================
       READ RESPONSE
    ========================= */

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

    /* =========================
       PARSE JSON
    ========================= */

    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("INVALID AI JSON:", text);

      return res.status(500).json({
        error: "AI returned an invalid result. Please try again."
      });
    }

    if (!Array.isArray(result.matches)) {
      return res.status(500).json({
        error: "No matches were detected."
      });
    }

    if (result.matches.length === 0) {
      return res.status(500).json({
        error: "No readable matches were found."
      });
    }

    /* =========================
       CLEAN RESULTS
    ========================= */

    const matches = result.matches.map((match) => {

      const ou =
        match.overUnder ||
        match.over_under ||
        {};

      const line =
        ou.line ||
        "2.5";

      const prediction =
        ou.prediction ||
        `Over ${line} Goals`;

      return {
        game:
          match.game ||
          "Unknown match",

        market:
          "1X2 + Over/Under",

        odds:
          match.odds ||
          "Not available",

        prediction:
          match.prediction ||
          "No estimate",

        alternative:
          prediction,

        overUnder: {
          line: line,

          over:
            ou.over ||
            "Not available",

          under:
            ou.under ||
            "Not available",

          prediction: prediction
        },

        confidence
