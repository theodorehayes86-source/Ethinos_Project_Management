import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const rawOrigins = process.env.CORS_ORIGINS ?? "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  logger.warn(
    "CORS_ORIGINS is not set — all origins will be blocked in production. " +
    "Set it to a comma-separated list of allowed origins (e.g. https://pmt.ethinos.com)."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

export default app;
