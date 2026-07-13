import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, requestConfigTable } from "@workspace/db";
import { keyValueMapSchema } from "@workspace/db";
import {
  GetRequestConfigResponse,
  UpdateRequestConfigBody,
  UpdateRequestConfigResponse,
  TestRequestConfigResponse,
  GetRequestRunHistoryResponse,
} from "@workspace/api-zod";
import {
  getOrCreateRequestConfig,
  getLastRunAt,
  listRequestRunLog,
  recordRequestRun,
} from "../lib/requestConfig";
import { detectCaptcha } from "../lib/captchaDetection";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

const MAX_BODY_PREVIEW_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = 15_000;

function toRecord(value: unknown): Record<string, string> {
  const parsed = keyValueMapSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

router.get("/settings/request-config", async (_req, res): Promise<void> => {
  const config = await getOrCreateRequestConfig();
  const lastRunAt = await getLastRunAt();
  res.json(
    GetRequestConfigResponse.parse({
      targetUrl: config.targetUrl,
      headers: toRecord(config.headers),
      cookies: toRecord(config.cookies),
      lastRunAt,
    }),
  );
});

router.get(
  "/settings/request-config/history",
  async (_req, res): Promise<void> => {
    const rows = await listRequestRunLog();
    res.json(
      GetRequestRunHistoryResponse.parse(
        rows.map((row) => ({
          id: row.id,
          success: row.success,
          status: row.status,
          statusText: row.statusText,
          errorMessage: row.errorMessage,
          ranAt: row.ranAt,
        })),
      ),
    );
  },
);

router.put("/settings/request-config", async (req, res): Promise<void> => {
  const parsed = UpdateRequestConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateRequestConfig();
  const [updated] = await db
    .update(requestConfigTable)
    .set({
      targetUrl: parsed.data.targetUrl,
      headers: parsed.data.headers,
      cookies: parsed.data.cookies,
      updatedAt: new Date(),
    })
    .where(eq(requestConfigTable.id, 1))
    .returning();

  const lastRunAt = await getLastRunAt();
  res.json(
    UpdateRequestConfigResponse.parse({
      targetUrl: updated?.targetUrl ?? parsed.data.targetUrl,
      headers: toRecord(updated?.headers ?? parsed.data.headers),
      cookies: toRecord(updated?.cookies ?? parsed.data.cookies),
      lastRunAt,
    }),
  );
});

router.post(
  "/settings/request-config/test",
  async (_req, res): Promise<void> => {
    const config = await getOrCreateRequestConfig();

    if (!config.targetUrl) {
      res.status(400).json({ error: "Hedef URL ayarlanmamış" });
      return;
    }

    const headers = toRecord(config.headers);
    const cookies = toRecord(config.cookies);
    const cookieHeader = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    const requestHeaders: Record<string, string> = { ...headers };
    if (cookieHeader) {
      requestHeaders["cookie"] = cookieHeader;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(config.targetUrl, {
        headers: requestHeaders,
        signal: controller.signal,
      });

      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const { isCaptcha, captchaType } = detectCaptcha(
        response.status,
        response.statusText,
        responseHeaders,
        text,
      );

      if (isCaptcha) {
        await recordRequestRun({
          success: false,
          errorMessage: `Captcha / ${captchaType ?? "generic"}`,
        });
      } else {
        await recordRequestRun({
          success: true,
          status: response.status,
          statusText: response.statusText,
        });
      }

      res.json(
        TestRequestConfigResponse.parse({
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          bodyPreview: text.slice(0, MAX_BODY_PREVIEW_LENGTH),
          isCaptcha,
          captchaType,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "İstek başarısız oldu";
      await recordRequestRun({ success: false, errorMessage: message });
      res.status(400).json({ error: message });
    } finally {
      clearTimeout(timeout);
    }
  },
);

export default router;
