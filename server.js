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
   ANALYZE SCREENSHOT
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


      /* CONVERT IMAGE */

      const mimeType =
        req.file.mimetype ||
        "image/jpeg";

      const base64Image =
        req.file.buffer.toString("base64");

      const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;


      /* =========================
         AI INSTRUCTIONS
      ========================= */

      const prompt = `

You are an AI assistant analyzing an
instant virtual football screenshot.

Your job is to analyze EVERY readable
football match in the screenshot.

IMPORTANT:

1. Find EVERY readable match.

2. Never analyze only the first match.

3. Never invent a match.

4. Never invent team names.

5. Carefully read the team names.

6. Carefully read visible 1X2 odds.

7. Carefully read visible Over/Under
   odds if they exist.

8. If Over/Under odds are NOT visible,
   you MUST STILL PROVIDE AN
   OVER/UNDER ESTIMATE.

9. When Over/Under odds are not visible,
   do NOT invent or create fake odds.

10. The Over/Under estimate should be based
    only on information reasonably visible
    in the screenshot, such as the teams,
    1X2 market, odds relationship and other
    readable information.

11. If there is not enough information for
    a strong Over/Under opinion, give a
    conservative estimate and mark confidence
    Low.

12. Every readable match MUST have an
    Over/Under prediction.

13. Virtual football results are random.
    Predictions are estimates only and are
    NOT guaranteed.

14. Do not claim that any prediction is
    certain or guaranteed.


========================
MARKETS
========================

Analyze BOTH:

A. 1X2

B. OVER/UNDER


========================
OVER/UNDER RULE
========================

For EVERY match, provide:

- An Over/Under line
- An Over/Under estimate
- Over/Under odds IF visible
- "Not available" for O/U odds IF they
  are not visible


Example when odds ARE visible:

"overUnder": {
  "line": "2.5",
  "over": "1.85",
  "under": "1.95",
  "prediction": "Over 2.5 Goals"
}


Example when odds are NOT visible:

"overUnder": {
  "line": "2.5",
  "over": "Not available",
  "under": "Not available",
  "prediction": "Over 2.5 Goals"
}


IMPORTANT:

The prediction MUST NOT be:

"Not available"

Every match must receive an
Over/Under prediction.


Possible predictions include:

Over 1.5 Goals
Under 1.5 Goals
Over 2.5 Goals
Under 2.5 Goals
Over 3.5 Goals
Under 3.5 Goals


Choose the line that is most reasonable
from the visible information.

Do not pretend the line or odds came from
the screenshot if they were not visible.


========================
1X2
========================

If 1X2 odds are visible, report them.

Format:

"odds": "HOME / DRAW / AWAY"


Example:

"odds": "1.72 / 3.96 / 4.65"


If the odds cannot be read:

"odds": "Not available"


Do not invent unreadable odds.


========================
PREDICTION
========================

Provide:

- prediction
- alternative
- confidence
- risk
- analysis


Confidence:

Low
Medium
High


Risk:

Low
Medium
High


The analysis must explain briefly why
the estimate was selected.

Do not use fake statistics.

Do not claim access to live information
unless it is actually visible in the image.


========================
JSON
========================

RETURN ONLY VALID JSON.

Use exactly this structure:

{
  "matches": [
    {
      "game": "LEE vs HUL",
      "market": "1X2 + Over/Under",
      "odds": "1.72 / 3.96 / 4.65",
      "overUnder": {
        "line": "2.5",
        "over": "Not available",
        "under": "Not available",
        "prediction": "Over 2.5 Goals"
      },
      "prediction": "LEE Win",
      "alternative": "Over 2.5 Goals",
      "confidence": "Medium",
      "risk": "Medium",
      "analysis": "Brief explanation based on the visible information."
    }
  ]
}


========================
VERY IMPORTANT
========================

If there are 2 readable matches,
return 2 objects.

If there are 5 readable matches,
return 5 objects.

If there are 10 readable matches,
return 10 objects.

Never return only one match.

Every readable match MUST have:

1. 1X2 information
2. Over/Under line
3. Over/Under prediction
4. Confidence
5. Risk
6. Analysis

Even when Over/Under odds are not visible.


Return ONLY JSON.

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
         READ RESPONSE
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
         CHECK MATCHES
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
            "No readable matches were found."
        });

      }


      /* =========================
         NORMALIZE RESULTS
      ========================= */

      const matches =
        result.matches.map((match) => {


          let overUnder =
            match.overUnder ||
            match.over_under ||
            {};


          /* OVER/UNDER LINE */

          const line =
            overUnder.line ||
            match.overUnderLine ||
            match.ouLine ||
            "2.5";


          /* OVER ODDS */

          const over =
            overUnder.over ||
            match.over ||
            match.overOdds ||
            "Not available";


          /* UNDER ODDS */

          const under =
            overUnder.under ||
            match.under ||
            match.underOdds ||
            "Not available";


          /* OVER/UNDER PREDICTION */

          let ouPrediction =
            overUnder.prediction ||
            match.overUnderPrediction ||
            match.ouPrediction;


          /*
            Make sure an O/U estimate
            always exists.
          */

          if (!ouPrediction) {

            ouPrediction =
              `Over ${line} Goals`;

          }


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
                line,

              over:
                over,

              under:
                under,

              prediction:
                ouPrediction

            },


            prediction:
              match.prediction ||
              "No estimate",


            alternative:
              match.alternative ||
              ouPrediction,


            confidence:
              match.confidence ||
              "Low",


            risk:
              match.risk ||
              "High",


            analysis:
              match.analysis ||
              "AI-assisted estimate based on the visible information."

          };

        });


      /* =========================
         SEND TO FRONTEND
      ========================= */

      res.json({
        matches: matches
      });


    } catch (error) {

      console.error(
        "Server error:",
        error
      );


      /* OPENAI ERROR */

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
