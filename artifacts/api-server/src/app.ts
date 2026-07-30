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

const isDev = process.env.NODE_ENV !== "production";

if (allowedOrigins.length === 0 && !isDev) {
  logger.warn(
    "CORS_ORIGINS is not set — all origins will be blocked in production. " +
    "Set it to a comma-separated list of allowed origins (e.g. https://pmt.ethinos.com)."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      // Server-to-server or same-origin requests (no Origin header)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Always allow *.replit.dev in development (preview pane domains change per session)
      if (isDev && origin.endsWith(".replit.dev")) {
        callback(null, true);
        return;
      }
      // Always allow explicitly configured origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  }),
);

// Allow Microsoft Teams to embed the app in an iframe.
// Apache may add X-Frame-Options: SAMEORIGIN at the proxy layer; we clear it
// here and replace it with a CSP frame-ancestors directive that restricts
// framing to Teams / Skype origins only.
app.use((_req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com",
  );
  next();
});

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

export default app;
