const path = require('path');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const AdmZip = require('adm-zip');
const pino = require('pino');
const logger = pino();

const config = require('../config');
const { statSync : stat } = fs;
// util function to normalize a value between a given range.
function normalize(value, min, max) {
  if (min === undefined || max === undefined) {
    return value;
  }
  return (value - min) / (max - min);
}

// data can be loaded from URLs or local file paths when running in Node.js.
const TRAIN_DATA_PATH = `file://${config.MAIN.PATH_DATA_FILES}data/pitch_type_training_data.csv`;
const TEST_DATA_PATH = `file://${config.MAIN.PATH_DATA_FILES}data/pitch_type_test_data.csv`;
const MODEL_DATA_PATH = `${config.MAIN.PATH_DATA_FILES}model/`;

// Constants from training data
const VX0_MIN = -18.885;
const VX0_MAX = 18.065;
const VY0_MIN = -152.463;
const VY0_MAX = -86.374;
const VZ0_MIN = -15.5146078412997;
const VZ0_MAX = 9.974;
const AX_MIN = -48.0287647107959;
const AX_MAX = 30.592;
const AY_MIN = 9.397;
const AY_MAX = 49.18;
const AZ_MIN = -49.339;
const AZ_MAX = 2.95522851438373;
const START_SPEED_MIN = 59;
const START_SPEED_MAX = 104.4;

const NUM_PITCH_CLASSES = 7;
const TRAINING_DATA_LENGTH = 7000;
const TEST_DATA_LENGTH = 700;

/**
 * @param {String} zipFileName
 * @param {Array<String>} pathNames
 */
function newArchive(zipFileName, pathNames) {
  const zip = new AdmZip();

  pathNames.forEach(path => {
    const p = stat(path);
    if (p.isFile()) {
      zip.addLocalFile(path);
    } else if (p.isDirectory()) {
      zip.addLocalFolder(path, path);
    }
  });

  logger.info(`newArchive ${zipFileName}`);
  zip.writeZip(zipFileName);
}

// Converts a row from the CSV into features and labels.
// Each feature field is normalized within training data constants
const csvTransform =
  ({xs, ys}) => {
    const values = [
      normalize(xs.vx0, VX0_MIN, VX0_MAX),
      normalize(xs.vy0, VY0_MIN, VY0_MAX),
      normalize(xs.vz0, VZ0_MIN, VZ0_MAX),
      normalize(xs.ax, AX_MIN, AX_MAX),
      normalize(xs.ay, AY_MIN, AY_MAX),
      normalize(xs.az, AZ_MIN, AZ_MAX),
      normalize(xs.startSpeed, START_SPEED_MIN, START_SPEED_MAX),
      xs.leftHandedPitcher,
    ];
    return {xs: values, ys: ys.pitchCode};
  };

const trainingData =
  tf.data.csv(TRAIN_DATA_PATH, {columnConfigs: {pitchCode: {isLabel: true}}})
    .map(csvTransform)
    .shuffle(TRAINING_DATA_LENGTH)
    .batch(100);

// Load all training data in one batch to use for evaluation
const trainingValidationData =
  tf.data.csv(TRAIN_DATA_PATH, {columnConfigs: {pitchCode: {isLabel: true}}})
    .map(csvTransform)
    .batch(TRAINING_DATA_LENGTH);

// Load all test data in one batch to use for evaluation
const testValidationData =
  tf.data.csv(TEST_DATA_PATH, {columnConfigs: {pitchCode: {isLabel: true}}})
    .map(csvTransform)
    .batch(TEST_DATA_LENGTH);

let model = tf.sequential();
model.add(tf.layers.dense({units: 250, activation: 'relu', inputShape: [8]}));
model.add(tf.layers.dense({units: 175, activation: 'relu'}));
model.add(tf.layers.dense({units: 150, activation: 'relu'}));
model.add(tf.layers.dense({units: NUM_PITCH_CLASSES, activation: 'softmax'}));

// console.info(`model ${JSON.stringify(model.outputs[0].shape)}` );

model.compile({
  optimizer: tf.train.adam(),
  loss: 'sparseCategoricalCrossentropy',
  metrics: ['accuracy'],
});

// Returns pitch class evaluation percentages for training data
// with an option to include test data
async function evaluate(useTestData) {
  const results = {};
  await trainingValidationData.forEachAsync(pitchTypeBatch => {
    const values = model.predict(pitchTypeBatch.xs).dataSync();
    const classSize = TRAINING_DATA_LENGTH / NUM_PITCH_CLASSES;
    for (let i = 0; i < NUM_PITCH_CLASSES; i++) {
      results[pitchFromClassNum(i)] = {
        training: calcPitchClassEval(i, classSize, values),
      };
    }
  });

  if (useTestData) {
    await testValidationData.forEachAsync(pitchTypeBatch => {
      const values = model.predict(pitchTypeBatch.xs).dataSync();
      const classSize = TEST_DATA_LENGTH / NUM_PITCH_CLASSES;
      for (let i = 0; i < NUM_PITCH_CLASSES; i++) {
        results[pitchFromClassNum(i)].validation =
          calcPitchClassEval(i, classSize, values);
      }
    });
  }
  return results;
}

async function predictSample(sample) {
  // console.info(`predictSample ${sample}`);
  const values = [
    normalize(sample[0], VX0_MIN, VX0_MAX),
    normalize(sample[1], VY0_MIN, VY0_MAX),
    normalize(sample[2], VZ0_MIN, VZ0_MAX),
    normalize(sample[3], AX_MIN, AX_MAX),
    normalize(sample[4], AY_MIN, AY_MAX),
    normalize(sample[5], AZ_MIN, AZ_MAX),
    normalize(sample[6], START_SPEED_MIN, START_SPEED_MAX),
    sample[7],
  ];
  logger.info(`values ${values}`);
  const tensor = tf.tensor(values, [1, values.length]);
  logger.info(`tensor ${tensor.toString()}`);
  const result = model.predict(tensor).arraySync();

  logger.info(`result ${JSON.stringify(result)}`);
  let maxValue = 0;
  let predictedPitch = 7;
  for (let i = 0; i < NUM_PITCH_CLASSES; i++) {
    if (result[0][i] > maxValue) {
      predictedPitch = i;
      maxValue = result[0][i];
    }
  }
  logger.info(`predictedPitch ${predictedPitch}`);
  // console.info(`result ${result} predictedPitch ${predictedPitch} '${pitchFromClassNum(predictedPitch)}'`);
  return pitchFromClassNum(predictedPitch);
}

// Determines accuracy evaluation for a given pitch class by index
function calcPitchClassEval(pitchIndex, classSize, values) {
  // Output has 7 different class values for each pitch, offset based on
  // which pitch class (ordered by i)
  let index = (pitchIndex * classSize * NUM_PITCH_CLASSES) + pitchIndex;
  let total = 0;
  for (let i = 0; i < classSize; i++) {
    total += values[index];
    index += NUM_PITCH_CLASSES;
  }
  return total / classSize;
}

// Returns the string value for Baseball pitch labels
function pitchFromClassNum(classNum) {
  switch (classNum) {
    case 0:
      return 'Fastball (2-seam)';
    case 1:
      return 'Fastball (4-seam)';
    case 2:
      return 'Fastball (sinker)';
    case 3:
      return 'Fastball (cutter)';
    case 4:
      return 'Slider';
    case 5:
      return 'Changeup';
    case 6:
      return 'Curveball';
    default:
      return 'Unknown';
  }
}

async function modelList() {
  return new Promise(resolve => {
    try {
      const result = [];
      fs.readdir(path.join(__dirname, './model'), function(err, items) {
        if (err) {
          resolve(result);
        } else {
          resolve(items);
        }
      });
    } catch (err) {
      logger.error(new Error('no access to model!'));
      resolve([]);
    }
  });
}

async function saveModel(filename) {
  let saveResults = null;
  try {
    saveResults = await model.save(`file://${MODEL_DATA_PATH}${filename}`,
      {
        trainableOnly: true,
        includeOptimizer: true,
      });
  } catch (err) {
    logger.error(err);
  }

  //console.dir(saveResults, {depth: 1});
  logger.info(`saveResults ${JSON.stringify(saveResults)}`);
}

async function loadModel(filename, sample) {
  let result = false;
  try {
    // console.info(`filename ${filename} 'file://${MODEL_DATA_PATH}${filename}/model.json'`);
    model = await tf.loadLayersModel(`file://${MODEL_DATA_PATH}${filename}/model.json`);
    // console.dir(model, {depth: 1});
    // console.dir(sample, {depth: 1});

    result = true;

    const values = [
      normalize(sample[0], VX0_MIN, VX0_MAX),
      normalize(sample[1], VY0_MIN, VY0_MAX),
      normalize(sample[2], VZ0_MIN, VZ0_MAX),
      normalize(sample[3], AX_MIN, AX_MAX),
      normalize(sample[4], AY_MIN, AY_MAX),
      normalize(sample[5], AZ_MIN, AZ_MAX),
      normalize(sample[6], START_SPEED_MIN, START_SPEED_MAX),
      sample[7],
    ];
    // console.info(`${values}`);
    const resultPredict = model.predict(tf.tensor(values, [1, values.length])).arraySync();

    logger.info(`resultPredict ${resultPredict}`);
  } catch (err) {
    logger.error(err);
  }

  return result;
}

async function exportModel(modelname) {
  let result = '';
  try {
    const zipName = `${MODEL_DATA_PATH}${modelname}.zip`;
    newArchive(zipName, [
      `${path.join(__dirname, './model')}/${modelname}/model.json`,
      `${path.join(__dirname, './model')}/${modelname}/weights.bin`,
    ]);

    result = (fs.readFileSync(zipName, {encode: 'utf8'})).toString();
    // console.dir(result, {depth: 1});
  } catch (err) {
    logger.error(err);
  }

  return result;
}

module.exports = {
  evaluate,
  model,
  pitchFromClassNum,
  predictSample,
  testValidationData,
  trainingData,
  TEST_DATA_LENGTH,
  saveModel,
  loadModel,
  modelList,
  exportModel,
};
