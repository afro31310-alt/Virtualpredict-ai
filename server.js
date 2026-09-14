const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

/* =========================
   OPENAI
========================= */

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* =========================
   IMAGE UPLOAD
========================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024
  }
});


/* =========================
   WEBSITE
========================= */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


/* =========================
   AI ANALYSIS
========================= */

app.post(
  "/api/analyze",
  upload.single("image"),
  async (req, res) => {

    try {

      /* CHECK IMAGE */

      if (!req.file) {

        return res.status(400).json({
          error:
            "Please upload a screenshot."
        });

      }


      /* CHECK API KEY */

      if (!process.env.OPENAI_API_KEY) {

        return res.status(500).json({
          error:
            "AI service is not configured."
        });

      }


      /* IMAGE */

      const mimeType =
        req.file.mimetype ||
        "image/jpeg";

      const base64Image =
        req.file.buffer.toString("base64");

      const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;


      /* =========================
         PROMPT
      ========================= */

      const prompt = `

You are an AI assistant analyzing an
instant virtual football betting screenshot.

Analyze ONLY information that is visibly
readable in the uploaded screenshot.

IMPORTANT:

1. Identify EVERY football match visible
   in the screenshot.

2. Do NOT analyze only the first match.

3. Do NOT invent matches.

4. Do NOT invent team names.

5. Read the visible team names carefully.

6. Read the visible 1X2 odds.

7. Read the visible Over/Under market
   and its odds when available.

8. If the Over/Under line is visible,
   report that exact line.

9. If Over/Under is not visible,
   use "Not available" instead of inventing odds.

10. Create ONE result for EACH readable
    football match.

11. The prediction is an AI-assisted estimate,
    NOT a guaranteed result.

12. Virtual-game results are random and
    cannot be guaranteed.

For every match provide:

- game
- market
- odds
- overUnder
- prediction
- alternative
- confidence
- risk
- analysis

The main prediction should consider BOTH:

A. 1X2

B. Over/Under

When the screenshot contains a usable
Over/Under market, the prediction can be
either a 1X2 selection or an Over/Under
selection depending on which appears more
appropriate from the visible information.

IMPORTANT:

Do not claim that a prediction is certain.

Do not use fake percentages unless the
screenshot or available information supports
them.

Confidence must be:

Low
Medium
or High

Risk must be:

Low
Medium
or High


RETURN ONLY VALID JSON.

Use EXACTLY this structure:

{
  "matches": [
    {
      "game": "TEAM A vs TEAM B",
      "market": "1X2 + Over/Under",
      "odds": "2.10 / 3.40 / 3.20",
      "overUnder": {
        "line": "2.5",
        "over": "1.85",
        "under": "1.95"
      },
      "prediction": "TEAM A Win",
      "alternative": "Over 2.5 Goals",
      "confidence": "Medium",
      "risk": "Medium",
      "analysis": "Brief explanation based only on the visible information."
    }
  ]
}


ODDS FORMAT:

For 1X2:

"odds": "HOME / DRAW / AWAY"


For example:

"odds": "2.10 / 3.40 / 3.20"


OVER/UNDER FORMAT:

"overUnder": {
  "line": "2.5",
  "over": "1.85",
  "under": "1.95"
}


If the screenshot does not show
Over/Under odds:

"overUnder": {
  "line": "Not available",
  "over": "Not available",
  "under": "Not available"
}


If 1X2 odds are not readable:

"odds": "Not available"


Do not guess unreadable numbers.


VERY IMPORTANT:

Return ALL readable matches.

If there are 3 matches, return 3.

If there are 5 matches, return 5.

If there are 10 matches, return 10.

Never return only the first match.

`;


      /* =========================
         OPENAI REQUEST
      ========================= */

      const response =
        await client.responses.create({

          model:
            "gpt-5.6-luna",

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

                  image_url:
                    imageDataUrl
                }

              ]

            }

          ]

        });


      /* =========================
         GET AI RESPONSE
      ========================= */

      let text =
        response.output_text || "";


      text =
        text
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();


      if (!text) {

        return res.status(500).json({
          error:
            "The AI returned an empty response."
        });

      }


      /* =========================
         PARSE JSON
      ========================= */

      let result;

      try {

        result =
          JSON.parse(text);

      } catch (error) {

        console.error(
          "Invalid AI JSON:",
          text
        );

        return res.status(500).json({
          error:
            "The AI returned an invalid result. Please try again."
        });

      }


      /* =========================
         CHECK RESULTS
      ========================= */

      if (
        !result.matches ||
        !Array.isArray(result.matches)
      ) {

        return res.status(500).json({
          error:
            "No matches were detected."
        });

      }


      if (result.matches.length === 0) {

        return res.status(500).json({
          error:
            "No readable matches were found in the screenshot."
        });

      }


      /* =========================
         CLEAN RESULTS
      ========================= */

      const matches =
        result.matches.map((match) => {

          const overUnder =
            match.overUnder ||
            match.over_under ||
            {
              line:
                "Not available",

              over:
                "Not available",

              under:
                "Not available"
            };


          return {

            game:
              match.game ||
              "Unknown match",

            market:
              match.market ||
              "1X2 + Over/Under",

            odds:
              match.odds ||
              "Not available",

            overUnder: {

              line:
                overUnder.line ||
                "Not available",

              over:
                overUnder.over ||
                "Not available",

              under:
                overUnder.under ||
                "Not available"

            },

            prediction:
              match.prediction ||
              "No estimate",

            alternative:
              match.alternative ||
              "None",

            confidence:
              match.confidence ||
              "Low",

            risk:
              match.risk ||
              "High",

            analysis:
              match.analysis ||
              "No analysis available."

          };

        });


      /* =========================
         SEND RESULTS
      ========================= */

      res.json({
        matches: matches
      });


    } catch (error) {

      console.error(
        "Server error:",
        error
      );


      /* API ERROR */

      if (
        error &&
        error.status
      ) {

        return res.status(
          error.status
        ).json({

          error:
            error.message ||
            "OpenAI API request failed."

        });

      }


      /* GENERAL ERROR */

      res.status(500).json({

        error:
          error.message ||
          "Unable to analyze the screenshot."

      });

    }

  }
);


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `VirtualPredict AI running on port ${PORT}`
    );

  }
);
