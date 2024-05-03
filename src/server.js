require('./opentelemetry');
require('@tensorflow/tfjs-node');

const path = require('node:path');
const http = require('node:http');
const socketio = require('socket.io');
const pitchType = require('./pitch_type');

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
  const server = http.createServer();
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
    console.log(`  > Running socket on port: ${port}`);
  });

  io.on('connection', (socket) => {
    socket.on('getModels', async () => {
      io.emit('modelList', await pitchType.modelList());
    });

    socket.on('predictSample', async (sample) => {
      console.info(`predict sample ${JSON.stringify(sample)}`);
      io.emit('predictResult', await pitchType.predictSample(sample));
    });

    socket.on('trainModel', async (data) => {
      console.info(`trainModel ${JSON.stringify(data)}`);

      const numTrainingIterations = data.iterations || config.MAIN.NUMBER_TRAINING_ITERATIONS;
      for (let i = 0; i < numTrainingIterations; i++) {
        console.info(`Training iteration : ${i + 1} / ${numTrainingIterations}`);
        await pitchType.model.fitDataset(pitchType.trainingData, {epochs: data.epoch});
        const accuracy = await pitchType.evaluate(true);
        io.emit('predictStep', {percent: Math.ceil(((i + 1) / numTrainingIterations * 100)), accuracy});
        await sleep(TIMEOUT_BETWEEN_EPOCHS_MS);
      }

      io.emit('trainingComplete', true);

      await pitchType.saveModel(data.name);
    });

    socket.on('loadModel', async (data) => {
      // console.info(`loadModel ${JSON.stringify(data)}`);
      const loadResult = await pitchType.loadModel(data.name, data.sample);

      if (loadResult) {
        io.emit('predictStep', {percent: 100, accuracy: loadResult});
        io.emit('trainingComplete', true);
      }
    });

    socket.on('exportModel', async (data) => {
      // console.info(`loadModel ${JSON.stringify(data)}`);
      const exportResult = await pitchType.exportModel(data.name);

      if (exportResult) {
        io.emit('downloadModal', exportResult);
      }
    });
  });

  // io.emit('predictResult', await pitchType.predictSample([ 2.668, -114.333, -1.908, 4.786, 25.707, -45.21, 78, 0]));
}

run();
