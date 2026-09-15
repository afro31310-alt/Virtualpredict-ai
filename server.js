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
   UPLOAD
========================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024
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
   ANALYZE
========================= */

app.post(
  "/api/analyze",
  upload.single("image"),
  async (req, res) => {

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


      /* IMAGE */

      const mime =
        req.file.mimetype || "image/jpeg";

      const base64 =
        req.file.buffer.toString("base64");

      const image =
        `data:${mime};base64,${base64}`;


      /* =========================
         SHORT PROMPT
      ========================= */

      const prompt = `
Analyze EVERY readable football match in this screenshot.

Return ONLY valid JSON.

For each readable match return:
- game
- 1X2 odds if visible
- 1X2 prediction
- Over/Under line
- Over/Under prediction
- Over/Under odds only if actually visible
- confidence
- risk
- short analysis

IMPORTANT:
Never return only one match.
Do not invent team names.
Do not invent 1X2 odds.
If O/U odds are not visible, use:
"over": "Not available"
"under": "Not available"

BUT you MUST still give an AI Over/Under estimate based on the readable information.

Possible O/U estimates:
"Over 1.5 Goals"
"Under 1.5 Goals"
"Over 2.5 Goals"
"Under 2.5 Goals"
"Over 3.5 Goals"
"Under 3.5 Goals"

Return this structure:

{
  "matches": [
    {
      "game": "TEAM A vs TEAM B",
      "odds": "1.80 / 3.50 / 4.20",
      "overUnder": {
        "line": "2.5",
        "over": "Not available",
        "under": "Not available",
        "prediction": "Over 2.5 Goals"
      },
      "prediction": "TEAM A Win",
      "alternative": "Over 2.5 Goals",
      "confidence": "Medium",
      "risk": "Medium",
      "analysis": "Short explanation."
    }
  ]
}

Virtual-game results are random. Predictions are estimates only, not guarantees.
`;


      /* =========================
         OPENAI REQUEST
      ========================= */

      let response;

      let lastError;


      /*
       * Retry temporary 429 errors.
       * Wait progressively between attempts.
       */

      for (
        let attempt = 0;
        attempt < 3;
        attempt++
      ) {

        try {

          response =
            await client.responses.create({

              model: "gpt-5.6-luna",

              max_output_tokens: 1800,

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


          break;

        } catch (error) {

          lastError = error;


          /*
           * Only retry rate-limit errors.
           */

          if (
            error &&
            error.status === 429
          ) {

            const wait =
              3000 *
              Math.pow(2, attempt);

            console.log(
              `Rate limited. Waiting ${wait}ms...`
            );

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  wait
                )
            );

            continue;

          }


          throw error;

        }

      }


      if (!response) {

        throw lastError ||
          new Error(
            "AI request failed."
          );

      }


      /* =========================
         READ AI RESPONSE
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
          "AI JSON ERROR:",
          text
        );

        return res.status(500).json({
          error:
            "AI returned an invalid result. Please try again."
        });

      }


      if (
        !result.matches ||
        !Array.isArray(result.matches)
      ) {

        return res.status(500).json({
          error:
            "No matches were detected."
        });

      }


      if (
        result.matches.length === 0
      ) {

        return res.status(500).json({
          error:
            "No readable matches were found."
        });

      }


      /* =========================
         NORMALIZE
      ========================= */

      const matches =
        result.matches.map(
          match => {

            const ou =
              match.overUnder ||
              match.over_under ||
              {};


            const line =
              ou.line ||
              match.overUnderLine ||
              match.ouLine ||
              "2.5";


            const over =
              ou.over ||
              "Not available";


            const under =
              ou.under ||
              "Not available";


            /*
             * ALWAYS SHOW O/U ESTIMATE
             */

            const ouPrediction =
              ou.prediction ||
              match.overUnderPrediction ||
              match.ouPrediction ||
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
                "AI estimate based on the visible information."

            };

          }
        );


      /* =========================
         RESPONSE
      ========================= */

      res.json({

        matches:
          matches

      });


    } catch (error) {

      console.error(
        "SERVER ERROR:",
        error
      );


      /* RATE LIMIT */

      if (
        error &&
        error.status === 429
      ) {

        return res.status(429).json({

          error:
            "AI rate limit reached. Please wait a few minutes and try again."

        });

      }


      /* OTHER OPENAI ERROR */

      if (
        error &&
        error.status
      ) {

        return res.status(
          error.status
        ).json({

          error:
            error.message ||
            "OpenAI request failed."

        });

      }


      /* GENERAL ERROR */

      res.status(500).json({

        error:
          error.message ||
          "Unable to analyze screenshot."

      });

    }

  }
);


/* =========================
   START
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
