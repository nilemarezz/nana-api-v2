import Fastify from "fastify";
import routes from "./routes/index.js";
import { createGoogleSheetConnection } from "./service/googlesheet.js";

const fastify = Fastify({ logger: true });

fastify.register(routes);

const start = async () => {
  try {
    /// Connect googlesheet
    const sheets = await createGoogleSheetConnection();
    fastify.decorate("sheets", sheets);

    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: "0.0.0.0" });
    console.log(`Server is running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
