import io from 'socket.io-client';
import pino from 'pino';
import config from './../config.client.js';

const logger = pino({ level: 'info' });

if (process.env.NODE_ENV !== 'production') {
  logger.info('Client load');
}

const predictContainer = document.getElementById('predictContainer');
const predictResultColumn = document.getElementById('predictResultColumn');
const predictButton = document.getElementById('predict-button');
// const trainingProgress = document.getElementById('trainingProgress');
const learnButton = document.getElementById('learn-button');
// const learnStatus = document.getElementById('learn-status');

const socket =
  io(`http://localhost:${config.MAIN.PORT}`,
    {
      reconnectionDelay: config.MAIN.RECONNECTION_DELAY,
      reconnectionDelayMax: config.MAIN.RECONNECTION_DELAY_MAX,
    });
let accuracy = [];
let modelsList = [];

const testData = {
  vx0: 2.668,
  vy0: -114.333,
  vz0: -1.908,
  ax: 4.786,
  ay: 25.707,
  az: -45.21,
  startSpeed: 78,
  leftHandedPitcher: 0,
};
let testSample = Object.values(testData); // Curveball

learnButton.onclick = () => {
  document.getElementById('learn-status').style.display = 'block';
  predictResultColumn.style.display = 'none';
  learnButton.disabled = true;
  predictButton.disabled = true;
  const data = {
    name: document.getElementById('data-name').value,
    epoch: Number(document.getElementById('data-epoch').value),
    iterations: Number(document.getElementById('data-iterations').value),
  };
  accuracy = [];
  document.getElementById('logContainer-accuracy').innerHTML = '';

  socket.emit('trainModel', data);
};

predictButton.onclick = () => {
  predictButton.disabled = true;
  learnButton.disabled = true;
  const form = document.querySelector('form');
  const formData = new FormData(form);

  let output = '';
  for (const entry of formData) {
    output = `${output}${entry[0]}=${entry[1]}\r`;
    let value = 0;
    if (entry[0].indexOf('data-sample-v') > -1 || entry[0].indexOf('data-sample-a') > -1) {
      value = parseFloat(entry[1]);
      testData[entry[0].replace('data-sample-', '')] = value;
    } else if (entry[0].indexOf('data-sample-speed') > -1 || entry[0].indexOf('data-sample-hand') > -1) {
      value = parseInt(entry[1], 10);

      if (entry[0].indexOf('data-sample-speed') > -1) {
        testData['startSpeed'] = value;
      }

      if (entry[0].indexOf('data-sample-hand') > -1) {
        testData['leftHandedPitcher'] = value;
      }
    }
  }
  // logger.info(testSample);
  testSample = Object.values(testData);
  // logger.info(output);
  // logger.info(testSample);
  socket.emit('predictSample', testSample);
};

// functions to handle socket events
socket.on('connect', () => {
  document.getElementById('waiting-msg').style.display = 'none';
  document.getElementById('trainingStatus').innerHTML = 'Training in Progress';
  document.getElementById('trainingProgress').value = 0;
  socket.emit('getModels');
});

socket.on('predictStep', (data) => {
  document.getElementById('waiting-msg').style.display = 'none';
  document.getElementById('trainingStatus').innerHTML = 'Training in Progress';
  document.getElementById('trainingProgress').value = data.percent;
  accuracy.push(data.accuracy);
  const innerHtml = document.getElementById('logContainer-accuracy').innerHTML;
  document.getElementById('logContainer-accuracy').innerHTML = (innerHtml && data?.accuracy) ? `${innerHtml},
   ${JSON.stringify(data.accuracy, null, ' ')}` : '';
});

socket.on('modelList', (data) => {
  modelsList = [...data];
  const modelListAppDiv = document.getElementById('logContainer-modelsList');
  modelListAppDiv.innerHTML = '';

  modelsList.forEach(name => {
    const id = name.replace(/ /gi, '-');

    const buttonsId = `model-buttons-${id}`;
    const buttonsBlock = document.createElement('div');
    buttonsBlock.setAttribute('class', 'buttons');
    buttonsBlock.setAttribute('id', buttonsId);

    modelListAppDiv.appendChild(buttonsBlock);

    const buttonsTextId = `model-button-text-${id}`;
    const buttonText = document.createElement('button');
    buttonText.setAttribute('class', 'button is-text');
    buttonText.setAttribute('id', buttonsTextId);
    buttonText.innerHTML = name.trim() || 'Unnamed model';

    buttonsBlock.appendChild(buttonText);

    const buttonsLoadId = `model-button-load-${id}`;
    const buttonLoad = document.createElement('button');
    buttonLoad.setAttribute('class', 'button is-primary');
    buttonLoad.setAttribute('id', buttonsLoadId);
    buttonLoad.innerHTML = 'Load';

    buttonsBlock.appendChild(buttonLoad);

    document.getElementById(buttonsLoadId).addEventListener('click', (
      function(idLocal) {
        return function() {
          // logger.dir(idLocal, {depth: 1});
          // logger.dir(testSample, {depth: 1});
          socket.emit('loadModel', {name: idLocal, sample: testSample});
        };
      })(id));

    const buttonsExportId = `model-button-export-${id}`;
    const buttonExport = document.createElement('button');
    buttonExport.setAttribute('class', 'button is-primary');
    buttonExport.setAttribute('id', buttonsExportId);
    buttonExport.innerHTML = 'Export';

    buttonsBlock.appendChild(buttonExport);

    document.getElementById(buttonsExportId).addEventListener('click', (
      function(idLocal) {
        return function() {
          socket.emit('exportModel', {name: idLocal});
        };
      })(id));

    const buttonsRemoveId = `model-button-remove-${id}`;
    const buttonRemove = document.createElement('button');
    buttonRemove.setAttribute('class', 'button is-danger');
    buttonRemove.setAttribute('id', buttonsRemoveId);
    buttonRemove.innerHTML = 'Remove';

    buttonsBlock.appendChild(buttonRemove);
  });
});

socket.on('trainingComplete', () => {
  document.getElementById('trainingProgress').value = 100;
  learnButton.disabled = false;
  predictButton.disabled = false;

  document.getElementById('trainingStatus').innerHTML = 'Training Complete';
  setTimeout(() => {
    document.getElementById('learn-status').style.display = 'none';
  }, 5000);
  document.getElementById('data-sample-vx0').value = testData.vx0;
  document.getElementById('data-sample-vy0').value = testData.vy0;
  document.getElementById('data-sample-vz0').value = testData.vz0;

  document.getElementById('data-sample-ax').value = testData.ax;
  document.getElementById('data-sample-ay').value = testData.ay;
  document.getElementById('data-sample-az').value = testData.az;

  document.getElementById('data-sample-speed').value = testData.startSpeed;

  const handRadios = document.getElementsByName('data-sample-hand');
  for (let i = 0; i < handRadios.length; i++) {
    if (handRadios[i].type === 'radio' && `${handRadios[i].value}` === `${testData.leftHandedPitcher}`) {
      handRadios[i].checked = true;
    }
  }

  predictContainer.style.display = 'block';
  predictResultColumn.style.display = 'block';
  socket.emit('getModels');
});

socket.on('predictResult', (result) => {
  plotPredictResult(result);
  learnButton.disabled = false;
});

socket.on('downloadModal', () => {
  // logger.dir(str, {depth: 1});
});

socket.on('disconnect', () => {
  document.getElementById('trainingStatus').innerHTML = '';
  predictContainer.style.display = 'none';
  document.getElementById('waiting-msg').style.display = 'block';
  learnButton.disabled = true;
});

function plotPredictResult(result) {
  predictButton.disabled = false;
  document.getElementById('predictResult').innerHTML = result || '0';
  if (process.env.NODE_ENV !== 'production') { 
    logger.info(result); 
  }
}

/*
function downloadBlob(blob, filename) {
  // Create an object URL for the blob object
  const url = URL.createObjectURL(blob);

  // Create a new anchor element
  const a = document.createElement('a');

  // Set the href and download attributes for the anchor element
  // You can optionally set other attributes like `title`, etc
  // Especially, if the anchor element will be attached to the DOM
  a.href = url;
  a.download = filename || 'download';

  // Click handler that releases the object URL after the element has been clicked
  // This is required for one-off downloads of the blob content
  const clickHandler = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      this.removeEventListener('click', clickHandler);
    }, 150);
  };

  // Add the click event listener on the anchor element
  // Comment out this line if you don't want a one-off download of the blob content
  a.addEventListener('click', clickHandler, false);

  // Programmatically trigger a click on the anchor element
  // Useful if you want the download to happen automatically
  // Without attaching the anchor element to the DOM
  // Comment out this line if you don't want an automatic download of the blob content
  a.click();

  // Return the anchor element
  // Useful if you want a reference to the element
  // in order to attach it to the DOM or use it in some other way
  return a;
}
*/
