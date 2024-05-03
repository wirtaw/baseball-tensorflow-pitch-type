const dotenv = require('dotenv');

dotenv.config({
  path: '/.env',
});

let conf = {};

if (process) {
  conf = {...process};
}

module.exports = {
  MAIN: {
    PORT: Number(conf.env.PORT) || 8081,
    CLIENT_PORT: Number(conf.env.CLIENT_PORT) || 1234,
    PATH_DATA_FILES: conf.env.PATH_DATA_FILES || '',
    TIMEOUT_BETWEEN_EPOCHS_MS: Number(conf.env.TIMEOUT_BETWEEN_EPOCHS_MS) || 500,
    NUMBER_TRAINING_ITERATIONS: Number(conf.env.NUMBER_TRAINING_ITERATIONS) || 10,
    RECONNECTION_DELAY: Number(conf.env.RECONNECTION_DELAY) || 300,
    RECONNECTION_DELAY_MAX: Number(conf.env.RECONNECTION_DELAY_MAX) || 300,
    NEW_RELIC_API_KEY: conf.env.NEW_RELIC_API_KEY || '',
  },
};
