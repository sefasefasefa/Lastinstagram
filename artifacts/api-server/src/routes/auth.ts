import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, parsed.data.username));

  const passwordMatches = user
    ? await bcrypt.compare(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  // Regenerate the session id on login so an attacker who fixated a session
  // id before authentication cannot reuse it afterwards (session fixation).
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to establish session" });
      return;
    }
    req.session.userId = user.id;
    res.json(LoginResponse.parse({ id: user.id, username: user.username }));
  });
});

router.post("/auth/logout", (req, res): void => {
  if (!req.session?.userId) {
    // Already logged out; logout is idempotent.
    res.sendStatus(204);
    return;
  }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(GetMeResponse.parse({ id: user.id, username: user.username }));
});

export default router;
