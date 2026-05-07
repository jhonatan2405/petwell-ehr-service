import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import promBundle from 'express-prom-bundle';

import { env } from './config/env';
import router from './routes/index';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// ── Security & Utility Middlewares ───────────────────────────────────────────
app.use(helmet());                    // Set secure HTTP headers
app.use(
    cors({
        origin: env.allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }),
);
app.use(express.json({ limit: '10kb' }));   // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isDevelopment ? 'dev' : 'combined'));  // HTTP request logging

// ── Prometheus Metrics ────────────────────────────────────────────────────────
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: { collectDefaultMetrics: {} },
});
app.use(metricsMiddleware as any);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1', router);

// 404 handler
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(env.port, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  🐾 PetWell — EHR Service                ║
  ║  Mode  : ${env.nodeEnv.padEnd(32)}║
  ║  Port  : ${String(env.port).padEnd(32)}║
  ╚══════════════════════════════════════════╝
  `);
});

export default app;
