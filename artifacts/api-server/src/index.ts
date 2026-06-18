import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabaseIfEmpty } from "./lib/seed";
import { seedCapacityIfEmpty } from "./lib/seedCapacity";
import { startHourlySyncTimer } from "./lib/sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  await seedDatabaseIfEmpty(logger);
  await seedCapacityIfEmpty(logger);
  startHourlySyncTimer(logger);

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Server boot failed");
  process.exit(1);
});
