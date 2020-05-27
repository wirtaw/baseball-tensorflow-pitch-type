'use strict';

module.exports = {
  MAIN: {
    PORT: Number(process.env.PORT) || 8081,
    PATH_DATA_FILES: process.env.PATH_DATA_FILES || '',
    TIMEOUT_BETWEEN_EPOCHS_MS: Number(process.env.TIMEOUT_BETWEEN_EPOCHS_MS) || 500,
    NUMBER_TRAINING_ITERATIONS: Number(process.env.NUMBER_TRAINING_ITERATIONS) || 10,
  },
};
