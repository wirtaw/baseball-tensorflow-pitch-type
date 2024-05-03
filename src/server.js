require('./opentelemetry');
require('@tensorflow/tfjs-node');

const path = require('node:path');
const http = require('node:http');
const socketio = require('socket.io');
const pino = require('pino');
const logger = pino();
const loggerHttp = require('pino-http')({
  quietReqLogger: true,
  transport: {
    target: 'pino-http-print',
    options: {
      destination: 1,
      all: true,
      translateTime: true
    }
  }
});

const { 
  modelList,
  predictSample,
  trainingData,
  evaluate,
  saveModel,
  loadModel,
  model,
  exportModel
} = require('./pitch_type');

const config = require(path.join(__dirname, '../config'));

const TIMEOUT_BETWEEN_EPOCHS_MS = config.MAIN.TIMEOUT_BETWEEN_EPOCHS_MS;
const PORT = config.MAIN.PORT;

// util function to sleep for a given ms
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main function to start server, perform model training, and emit stats via the socket connection
async function run() {
  const port = process.env.PORT || PORT;
  const server = http.createServer((req, res) => {
    res[loggerHttp.startTime] = Date.now()
  
    loggerHttp(req, res);
    res.log.info('log is available on both req and res');
    res.end('hello world')
  });
  const io = socketio(server, {
    serveClient: false,
    // below are engine.IO options
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    cors: {
      origin: `http://localhost:${config.MAIN.CLIENT_PORT}`,
      methods: ['GET', 'POST'],
    },
  });

  server.listen(port, () => {
    logger.info(`  > Running socket on port: ${port}`);
  });

  io.on('connection', (socket) => {
    socket.on('getModels', async () => {
      io.emit('modelList', await modelList());
    });

    socket.on('predictSample', async (sample) => {
      logger.info(`predict sample ${JSON.stringify(sample)}`);
      io.emit('predictResult', await predictSample(sample));
    });

    socket.on('trainModel', async (data) => {
      logger.info(`trainModel ${JSON.stringify(data)}`);

      const numTrainingIterations = data.iterations || config.MAIN.NUMBER_TRAINING_ITERATIONS;
      for (let i = 0; i < numTrainingIterations; i++) {
        logger.info(`Training iteration : ${i + 1} / ${numTrainingIterations}`);
        await model.fitDataset(trainingData, {epochs: data.epoch});
        const accuracy = await evaluate(true);
        io.emit('predictStep', {percent: Math.ceil(((i + 1) / numTrainingIterations * 100)), accuracy});
        await sleep(TIMEOUT_BETWEEN_EPOCHS_MS);
      }

      io.emit('trainingComplete', true);

      await saveModel(data.name);
    });

    socket.on('loadModel', async (data) => {
      logger.info(`loadModel ${JSON.stringify(data)}`);
      const loadResult = await loadModel(data.name, data.sample);

      if (loadResult) {
        io.emit('predictStep', {percent: 100, accuracy: loadResult});
        io.emit('trainingComplete', true);
      }
    });

    socket.on('exportModel', async (data) => {
      logger.info(`exportModel ${JSON.stringify(data)}`);
      const exportResult = await exportModel(data.name);

      if (exportResult) {
        io.emit('downloadModal', exportResult);
      }
    });
  });

  // io.emit('predictResult', await pitchType.predictSample([ 2.668, -114.333, -1.908, 4.786, 25.707, -45.21, 78, 0]));
}

run();
