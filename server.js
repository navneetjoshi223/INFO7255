import "dotenv/config";
import app from "./src/App.js";
import appConfig from "./src/configs/app.config.js";
import logger from "./src/configs/logger.config.js";

const { HOSTNAME, PORT } = appConfig;

app.listen(PORT, () => {
  logger.info(`Server running @ http://${HOSTNAME}:${PORT}`);
});
