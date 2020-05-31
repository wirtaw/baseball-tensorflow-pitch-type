require('@tensorflow/tfjs-node');

const path = require('path');
const http = require('http');
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
  const io = socketio(server);

  server.listen(port, () => {
    console.log(`  > Running socket on port: ${port}`);
  });

  io.on('connection', (socket) => {
    socket.on('predictSample', async (sample) => {
      console.info(`predict sample ${JSON.stringify(sample)}`);
      io.emit('predictResult', await pitchType.predictSample(sample));
    });
  });

  const numTrainingIterations = config.MAIN.NUMBER_TRAINING_ITERATIONS;
  for (let i = 0; i < numTrainingIterations; i++) {
    console.log(`Training iteration : ${i + 1} / ${numTrainingIterations}`);
    await pitchType.model.fitDataset(pitchType.trainingData, {epochs: 1});
    io.emit('predictStep', Math.ceil(((i + 1) / numTrainingIterations * 100)));
    console.log('accuracyPerClass', await pitchType.evaluate(true));
    await sleep(TIMEOUT_BETWEEN_EPOCHS_MS);
  }

  io.emit('trainingComplete', true);
}

run();
