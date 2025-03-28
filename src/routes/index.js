import { SearchController, FormAdminController } from "../controllers/index.js";
import { SlipCheckController } from "../controllers/telegram-bot-slip.js";
import { verifyToken } from "../middleware/verify.js";

export default async function routes(fastify, options) {
  // search route get request params account
  fastify.get("/api/search/:account", SearchController);
  fastify.post(
    "/api/form-admin",
    { preHandler: [verifyToken] },
    FormAdminController
  );

  fastify.post("/webhook", SlipCheckController);
}
